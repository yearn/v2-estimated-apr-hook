import { CURVE_SUBGRAPHDATA_URI } from './helpers/maps.helper';
import { CrvPool, CrvSubgraphPool, FraxPool } from './types';

// The webhook has maxDuration = 60s. Retries share a deadline below that so a retry
// can never push the request past the platform limit and turn into a timeout.
const FETCH_DEADLINE_MS = 50_000;
const FETCH_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 250;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isAbort(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/**
 * fetch with a bounded retry for transient upstream failures: dropped connections
 * (undici surfaces ECONNRESET as `TypeError: terminated` / `fetch failed`), 429 and 502/503/504.
 * Other HTTP statuses are returned untouched, and an abort/timeout is never retried.
 * The last failure is rethrown/returned so callers keep their existing error handling.
 */
export async function fetchWithRetry(
  url: string,
  {
    retries = FETCH_RETRIES,
    baseDelayMs = RETRY_BASE_DELAY_MS,
    deadlineMs = FETCH_DEADLINE_MS,
  } = {},
): Promise<Response> {
  const deadline = Date.now() + deadlineMs;
  for (let attempt = 0; ; attempt++) {
    let failure: { error: unknown } | { response: Response };
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.max(deadline - Date.now(), 1)),
      });
      if (!RETRYABLE_STATUS.has(response.status)) return response;
      failure = { response };
    } catch (error) {
      if (isAbort(error)) throw error;
      failure = { error };
    }

    const delay = baseDelayMs * 2 ** attempt;
    if (attempt >= retries || deadline - Date.now() <= delay) {
      if ('response' in failure) return failure.response;
      throw failure.error;
    }
    if ('response' in failure) await failure.response.body?.cancel();
    await sleep(delay);
  }
}

export async function fetchGauges() {
  const gaugesResponse = await fetchWithRetry(
    `${process.env.CRV_GAUGE_REGISTRY_URL || 'https://api.curve.finance/api/getAllGauges'}`,
  );
  const gauges = (await gaugesResponse.json()) as any;
  return Object.values(gauges.data) as any[];
}

export async function fetchPools() {
  try {
    const poolsResponse = await fetchWithRetry(
      `${process.env.CRV_POOLS_URL || 'https://api.curve.finance/api/getPools/all'}`,
    );
    const pools = (await poolsResponse.json()) as any;
    return pools.data?.poolData as CrvPool[];
  } catch {
    return [];
  }
}

export async function fetchSubgraph(chainId: number) {
  try {
    const subgraphResponse = await fetchWithRetry(`${CURVE_SUBGRAPHDATA_URI[chainId]}`);
    const subgraph = (await subgraphResponse.json()) as any;
    return subgraph.data.poolList as CrvSubgraphPool[];
  } catch {
    return [];
  }
}

export async function fetchFraxPools() {
  const res = await fetchWithRetry('https://frax.convexfinance.com/api/frax/pools');
  const json = (await res.json()) as any;
  const pools = (json?.pools?.augmentedPoolData || []) as FraxPool[];
  return pools
    .filter((p) => p && p.type === 'convex')
    .map((pool) => {
      const poolUsd = (pool as any).stakingTokenUsdPrice;
      const poolPrice = typeof poolUsd === 'string' ? parseFloat(poolUsd) : poolUsd;
      pool.stakingTokenUsdPrice = poolPrice;
      pool.rewardCoins = pool.rewardCoins.map((coin: any, index: number) => ({
        rewardApr: parseFloat(pool.rewardAprs[index]),
        minBoostedRewardApr: parseFloat(pool.boostedRewardAprs[index].min),
        maxBoostedRewardApr: parseFloat(pool.boostedRewardAprs[index].max),
      }));
      return pool;
    });
}
