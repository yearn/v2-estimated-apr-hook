import { createPublicClient, http, zeroAddress } from 'viem';
import { YEARN_VAULT_ABI_04, YEARN_VAULT_V022_ABI, YEARN_VAULT_V030_ABI } from './abis/0xAbis.abi';
import { convexBaseStrategyAbi } from './abis/convex-base-strategy.abi';
import { crvRewardsAbi } from './abis/crv-rewards.abi';
import { cvxBoosterAbi } from './abis/cvx-booster.abi';
import { yprismaAbi } from './abis/yprisma.abi';
import { VaultAPY } from './fapy';
import {
  convertFloatAPRToAPY,
  CONVEX_VOTER_ADDRESS,
  CRV_TOKEN_ADDRESS,
  CVX_BOOSTER_ADDRESS,
  CVX_TOKEN_ADDRESS,
  determineConvexKeepCRV,
  getConvexRewardAPY,
  getCurveBoost,
  getCVXForCRV,
  getPrismaAPY,
  YEARN_VOTER_ADDRESS,
} from './helpers';
import { Float } from './helpers/bignumber-float';
import { BigNumberInt, toNormalizedAmount } from './helpers/bignumber-int';
import { CrvPool, CrvSubgraphPool, CVXPoolInfo, FraxPool, Gauge } from './types';
import { GqlStrategy, GqlVault } from './types/kongTypes';
import { fetchErc20PriceUsd } from './utils/prices';
import { getChainFromChainId, getRPCUrl } from './utils/rpcs';

export function isCurveStrategy(vault: { name?: string | null }) {
  const vaultName = (vault?.name || '').toLowerCase();
  return (
    (vaultName.includes('curve') || vaultName.includes('convex') || vaultName.includes('crv')) &&
    !vaultName.includes('ajna-')
  );
}

export function isConvexStrategy(strategy: { name?: string | null }) {
  const strategyName = strategy.name?.toLowerCase();
  return strategyName?.includes('convex') && !strategyName?.includes('curve');
}
export function isFraxStrategy(strategy: { name?: string | null }) {
  return strategy?.name?.toLowerCase().includes('frax');
}
export function isPrismaStrategy(strategy: { name?: string | null }) {
  return strategy?.name?.toLowerCase().includes('prisma');
}

export function findGaugeForVault(assetAddress: string | undefined, gauges: Gauge[]) {
  if (!assetAddress) return null;
  return gauges.find((gauge) => {
    // Match Go logic: check SwapToken field first
    if (gauge.swap_token?.toLowerCase() === assetAddress.toLowerCase()) {
      return true;
    }
    if (gauge.swap?.toLowerCase() === assetAddress.toLowerCase()) {
      return true;
    }
    return false;
  });
}
export function findPoolForVault(assetAddress: string, pools: CrvPool[]) {
  return pools.find((pool) => pool.lpTokenAddress?.toLowerCase() === assetAddress.toLowerCase());
}
export function findFraxPoolForVault(assetAddress: string, fraxPools: FraxPool[]) {
  return fraxPools.find(
    (pool) => pool.underlyingTokenAddress.toLowerCase() === assetAddress.toLowerCase(),
  );
}
export function findSubgraphItemForVault(swapAddress: string, subgraphData: CrvSubgraphPool[]) {
  return subgraphData.find(
    (item) => item.address && item.address.toLowerCase() === swapAddress?.toLowerCase(),
  );
}

export function getPoolWeeklyAPY(subgraphItem: CrvSubgraphPool | undefined) {
  return new Float().div(new Float(subgraphItem?.latestWeeklyApy || 0), new Float(100));
}
export function getPoolDailyAPY(subgraphItem: CrvSubgraphPool | undefined) {
  return new Float().div(new Float(subgraphItem?.latestDailyApy || 0), new Float(100));
}
export function getPoolPrice(gauge: Gauge): Float {
  const vp = gauge.swap_data?.virtual_price
    ? new BigNumberInt(gauge.swap_data.virtual_price)
    : new BigNumberInt(0);
  return toNormalizedAmount(vp, 18);
}
export function getRewardsAPY(pool: CrvPool) {
  let total = new Float(0);
  if (!pool?.gaugeRewards?.length) return total;
  for (const reward of pool.gaugeRewards) {
    const apr = new Float().div(new Float(reward.APY), new Float(100));
    total = new Float().add(total, apr);
  }
  return total;
}

export async function getCVXPoolAPY(
  chainId: number,
  strategyAddress: `0x${string}`,
  baseAssetPrice: Float,
) {
  const client = createPublicClient({
    chain: getChainFromChainId(chainId),
    transport: http(getRPCUrl(chainId)),
  });
  let crvAPR = new Float(0),
    cvxAPR = new Float(0),
    crvAPY = new Float(0),
    cvxAPY = new Float(0);
  try {
    let rewardPID: any;
    try {
      rewardPID = await client.readContract({
        address: strategyAddress,
        abi: convexBaseStrategyAbi,
        functionName: 'PID',
        args: [],
      });
    } catch {
      try {
        rewardPID = await client.readContract({
          address: strategyAddress,
          abi: convexBaseStrategyAbi,
          functionName: 'ID',
          args: [],
        });
      } catch {
        try {
          rewardPID = await client.readContract({
            address: strategyAddress,
            abi: convexBaseStrategyAbi,
            functionName: 'fraxPid',
            args: [],
          });
        } catch {
          return { crvAPR, cvxAPR, crvAPY, cvxAPY };
        }
      }
    }
    let poolInfo: CVXPoolInfo;
    try {
      poolInfo = (await client.readContract({
        address: CVX_BOOSTER_ADDRESS[chainId],
        abi: cvxBoosterAbi,
        functionName: 'poolInfo',
        args: [rewardPID],
      })) as CVXPoolInfo;
    } catch {
      return { crvAPR, cvxAPR, crvAPY, cvxAPY };
    }

    const [rateResult, totalSupply] = (await Promise.all([
      client.readContract({
        address: poolInfo.crvRewards as `0x${string}`,
        abi: crvRewardsAbi,
        functionName: 'rewardRate',
        args: [],
      }),
      client.readContract({
        address: poolInfo.crvRewards as `0x${string}`,
        abi: crvRewardsAbi,
        functionName: 'totalSupply',
        args: [],
      }),
    ])) as [bigint, bigint];

    const rate = toNormalizedAmount(new BigNumberInt(rateResult), 18);
    const supply = toNormalizedAmount(new BigNumberInt(totalSupply), 18);
    let crvPerUnderlying = new Float(0);
    const virtualSupply = new Float(0).mul(supply, baseAssetPrice);
    if (virtualSupply.gt(new Float(0))) crvPerUnderlying = new Float(0).div(rate, virtualSupply);

    const crvPerUnderlyingPerYear = new Float(0).mul(crvPerUnderlying, new Float(31536000));
    const cvxPerYear = await getCVXForCRV(chainId, BigInt(crvPerUnderlyingPerYear.toNumber()));

    const [{ priceUsd: crvPrice }, { priceUsd: cvxPrice }] = await Promise.all([
      fetchErc20PriceUsd(chainId, CRV_TOKEN_ADDRESS[chainId]),
      fetchErc20PriceUsd(chainId, CVX_TOKEN_ADDRESS[chainId]),
    ]);

    crvAPR = new Float(0).mul(crvPerUnderlyingPerYear, new Float(crvPrice));
    cvxAPR = new Float(0).mul(cvxPerYear, new Float(cvxPrice));

    crvAPY = new Float().add(new Float(0), crvAPR); // crvAPY = crvAPR
    cvxAPY = new Float().add(new Float(0), cvxAPR); // cvxAPY = cvxAPR
  } catch { }
  return { crvAPR, cvxAPR, crvAPY, cvxAPY };
}
function getStrategyContractAbi(strategy: GqlStrategy) {
  if (strategy.apiVersion === '0.2.2') {
    return YEARN_VAULT_V022_ABI;
  }

  if (strategy.apiVersion === '0.3.0' || strategy.apiVersion === '0.3.1') {
    return YEARN_VAULT_V030_ABI;
  }

  return YEARN_VAULT_ABI_04;
}

export async function determineCurveKeepCRV(strategy: GqlStrategy, chainId: number) {
  if (strategy.localKeepCRV && BigInt(strategy.localKeepCRV) > 0) {
    return toNormalizedAmount(new BigNumberInt(BigInt(strategy.localKeepCRV)), 4).toNumber();
  }

  let keepPercentage = BigInt(0);
  let keepCRV = BigInt(0);

  try {
    const client = createPublicClient({
      chain: getChainFromChainId(chainId),
      transport: http(getRPCUrl(chainId)),
    });
    const abi = getStrategyContractAbi(strategy);

    // Run both contract reads in parallel (matching kong logic)
    const [keepCRVResult, keepPercentageResult] = await Promise.all([
      client.readContract({
        address: strategy.address,
        abi,
        functionName: 'keepCRV',
        args: [],
      }) as Promise<bigint>,
      client.readContract({
        address: strategy.address,
        abi,
        functionName: 'keepCRVPercentage',
        args: [],
      }) as Promise<bigint>,
    ]);
    keepCRV = keepCRVResult;
    keepPercentage = keepPercentageResult;
  } catch {
    return 0;
  }

  // Add keepCRV and keepPercentage together (kong logic)
  const keepValue = new BigNumberInt(keepCRV).add(new BigNumberInt(keepPercentage));
  return toNormalizedAmount(keepValue, 4).toNumber();
}

export async function calculateCurveForwardAPY(data: {
  gaugeAddress: `0x${string}`;
  vault: GqlVault;
  strategy: GqlStrategy;
  baseAPY: Float;
  rewardAPY: Float;
  poolAPY: Float;
  chainId: number;
  lastDebtRatio: Float;
}) {
  const chainId = data.chainId;
  const [yboost, keepCrv] = await Promise.all([
    getCurveBoost(chainId, YEARN_VOTER_ADDRESS[chainId], data.gaugeAddress),
    determineCurveKeepCRV(data.strategy, chainId),
  ]);

  const debtRatio = toNormalizedAmount(new BigNumberInt(data.lastDebtRatio.toNumber()), 4);
  const performanceFee = toNormalizedAmount(new BigNumberInt(data.vault.performanceFee ?? 0), 4);
  const managementFee = toNormalizedAmount(new BigNumberInt(data.vault.managementFee ?? 0), 4);
  const oneMinusPerfFee = new Float().sub(new Float(1), performanceFee);

  let crvAPY = new Float().mul(data.baseAPY, yboost);
  crvAPY = new Float().add(crvAPY, data.rewardAPY);

  const keepCRVRatio = new Float().sub(new Float(1), new Float(Number(keepCrv))); // 1 - keepCRV
  let grossAPY = new Float().mul(data.baseAPY, yboost); // baseAPR * yBoost
  grossAPY = new Float().mul(grossAPY, keepCRVRatio); // (baseAPR * yBoost) * (1 - keepCRV)
  grossAPY = new Float().add(grossAPY, data.rewardAPY); // + rewardAPY
  // poolAPY NOT added to grossAPY

  let netAPR = new Float().mul(grossAPY, oneMinusPerfFee);
  let netAPY: Float;
  if (netAPR.gt(managementFee)) {
    netAPR = new Float().sub(netAPR, managementFee);
    const [netAPRFloat64] = netAPR.toFloat64();
    netAPY = new Float().setFloat64(convertFloatAPRToAPY(netAPRFloat64, 52));
    netAPY = new Float().add(netAPY, data.poolAPY); // poolAPY added after fees
  } else {
    netAPY = new Float().add(new Float(0), data.poolAPY); // only poolAPY if no yield from strategy
  }

  const weighted = {
    type: 'crv',
    debtRatio: debtRatio.toFloat64()[0],
    netAPR: new Float().mul(netAPR, debtRatio).toFloat64()[0],
    netAPY: new Float().mul(netAPY, debtRatio).toFloat64()[0],
    boost: new Float().mul(yboost, debtRatio).toFloat64()[0],
    poolAPY: new Float().mul(data.poolAPY, debtRatio).toFloat64()[0],
    boostedAPR: new Float().mul(crvAPY, debtRatio).toFloat64()[0],
    baseAPR: new Float().mul(data.baseAPY, debtRatio).toFloat64()[0],
    rewardsAPY: new Float().mul(data.rewardAPY, debtRatio).toFloat64()[0],
    keepCRV: new Float(keepCrv).toFloat64()[0],
  };

  const raw = {
    type: 'crv',
    debtRatio: debtRatio.toFloat64()[0],
    netAPR: netAPR.toFloat64()[0],
    netAPY: netAPY.toFloat64()[0],
    boost: yboost.toFloat64()[0],
    poolAPY: data.poolAPY.toFloat64()[0],
    boostedAPR: crvAPY.toFloat64()[0],
    baseAPR: data.baseAPY.toFloat64()[0],
    rewardsAPY: data.rewardAPY.toFloat64()[0],
    keepCRV: new Float(keepCrv).toFloat64()[0],
    address: data.strategy.address,
  };

  return { weighted, raw };
}

export async function calculateConvexForwardAPY(data: {
  gaugeAddress: `0x${string}`;
  strategy: GqlStrategy;
  baseAssetPrice: Float;
  poolPrice: Float;
  baseAPY: Float;
  rewardAPY: Float;
  poolWeeklyAPY: Float;
  chainId: number;
  lastDebtRatio: Float;
}) {
  const {
    gaugeAddress,
    strategy,
    baseAssetPrice,
    poolPrice,
    baseAPY,
    poolWeeklyAPY,
    chainId,
    lastDebtRatio,
  } = data;
  const [cvxBoost, keepCRV] = await Promise.all([
    getCurveBoost(chainId, CONVEX_VOTER_ADDRESS[chainId], gaugeAddress),
    determineConvexKeepCRV(chainId, strategy as any),
  ]);
  const debtRatio = toNormalizedAmount(new BigNumberInt(lastDebtRatio.toNumber()), 4);
  const performanceFee = toNormalizedAmount(new BigNumberInt(strategy.performanceFee ?? 0), 4);
  const managementFee = toNormalizedAmount(
    new BigNumberInt((strategy as any).managementFee ?? 0),
    4,
  );
  const oneMinusPerfFee = new Float().sub(new Float(1), performanceFee);

  const [{ crvAPR, cvxAPR, crvAPY, cvxAPY }, { totalRewardsAPY: rewardsAPY }] = await Promise.all([
    getCVXPoolAPY(chainId, strategy.address, baseAssetPrice),
    getConvexRewardAPY(chainId, strategy.address, baseAssetPrice, poolPrice),
  ]);

  const keepCRVRatio = new Float().sub(new Float(1), keepCRV);
  let grossAPY = new Float().mul(crvAPY, keepCRVRatio);
  grossAPY = new Float().add(grossAPY, rewardsAPY);
  // poolWeeklyAPY NOT added to grossAPY
  grossAPY = new Float().add(grossAPY, cvxAPY);

  let netAPR = new Float().mul(grossAPY, oneMinusPerfFee);
  let netAPY: Float;
  if (netAPR.gt(managementFee)) {
    netAPR = new Float().sub(netAPR, managementFee);
    const [netAPRFloat64] = netAPR.toFloat64();
    netAPY = new Float().setFloat64(convertFloatAPRToAPY(netAPRFloat64, 52));
    netAPY = new Float().add(netAPY, poolWeeklyAPY);
  } else {
    netAPY = new Float().add(new Float(0), poolWeeklyAPY);
  }

  const weighted = {
    type: 'cvx',
    debtRatio: debtRatio.toFloat64()[0],
    netAPY: new Float().mul(netAPY, debtRatio).toFloat64()[0],
    boost: new Float().mul(cvxBoost, debtRatio).toFloat64()[0],
    poolAPY: new Float().mul(poolWeeklyAPY, debtRatio).toFloat64()[0],
    boostedAPR: new Float().mul(crvAPR, debtRatio).toFloat64()[0],
    baseAPR: new Float().mul(baseAPY, debtRatio).toFloat64()[0],
    cvxAPR: new Float().mul(cvxAPR, debtRatio).toFloat64()[0],
    rewardsAPY: new Float().mul(rewardsAPY, debtRatio).toFloat64()[0],
    keepCRV: keepCRV.toFloat64()[0],
  };

  const raw = {
    type: 'cvx',
    debtRatio: debtRatio.toFloat64()[0],
    netAPY: netAPY.toFloat64()[0],
    boost: cvxBoost.toFloat64()[0],
    poolAPY: poolWeeklyAPY.toFloat64()[0],
    boostedAPR: crvAPR.toFloat64()[0],
    baseAPR: baseAPY.toFloat64()[0],
    cvxAPR: cvxAPR.toFloat64()[0],
    rewardsAPY: rewardsAPY.toFloat64()[0],
    keepCRV: keepCRV.toFloat64()[0],
    address: strategy.address,
  };

  return { weighted, raw };
}

export async function calculateFraxForwardAPY(data: any, fraxPool: any) {
  if (!fraxPool) return null;
  const base = await calculateConvexForwardAPY(data);
  const minRewardsAPR = parseFloat(fraxPool.totalRewardAprs.min);
  const minRewardsAPRWeighted = minRewardsAPR * base.weighted.debtRatio;

  const weighted = {
    ...base.weighted,
    type: 'frax',
    netAPY: base.weighted.netAPY + minRewardsAPRWeighted,
    rewardsAPY: base.weighted.rewardsAPY + minRewardsAPRWeighted,
  };

  const raw = {
    ...base.raw,
    type: 'frax',
    netAPY: base.raw.netAPY + minRewardsAPR,
    rewardsAPY: base.raw.rewardsAPY + minRewardsAPR,
  };

  return { weighted, raw };
}

export async function calculatePrismaForwardAPR(data: any) {
  const { strategy, chainId } = data;
  const client = createPublicClient({
    chain: getChainFromChainId(chainId),
    transport: http(getRPCUrl(chainId)),
  });
  const [receiver] = (await client.readContract({
    address: strategy.address,
    abi: yprismaAbi as any,
    functionName: 'prismaReceiver',
    args: [],
  })) as any;
  if (receiver === zeroAddress) return null;
  const [base, [, prismaAPY]] = await Promise.all([
    calculateConvexForwardAPY({ ...data, lastDebtRatio: new Float(data.strategy?.debtRatio || 0) }),
    getPrismaAPY(chainId, receiver),
  ]);
  const weighted = {
    type: 'prisma',
    debtRatio: base.weighted.debtRatio,
    netAPY: base.weighted.netAPY + prismaAPY * base.weighted.debtRatio,
    boost: base.weighted.boost,
    poolAPY: base.weighted.poolAPY,
    boostedAPR: base.weighted.boostedAPR,
    baseAPR: base.weighted.baseAPR,
    cvxAPR: base.weighted.cvxAPR,
    rewardsAPY: base.weighted.rewardsAPY + prismaAPY * base.weighted.debtRatio,
    keepCRV: base.weighted.keepCRV,
  };

  const raw = {
    type: 'prisma',
    debtRatio: base.raw.debtRatio,
    netAPY: base.raw.netAPY + prismaAPY,
    boost: base.raw.boost,
    poolAPY: base.raw.poolAPY,
    boostedAPR: base.raw.boostedAPR,
    baseAPR: base.raw.baseAPR,
    cvxAPR: base.raw.cvxAPR,
    rewardsAPY: base.raw.rewardsAPY + prismaAPY,
    keepCRV: base.raw.keepCRV,
    address: base.raw.address,
  };

  return { weighted, raw };
}

export async function calculateGaugeBaseAPR(
  gauge: Gauge,
  crvTokenPrice: Float,
  poolPrice: Float,
  baseAssetPrice: Float,
) {
  let inflationRate = new Float(0);
  if (typeof gauge.gauge_controller.inflation_rate === 'string')
    inflationRate = toNormalizedAmount(new BigNumberInt(gauge.gauge_controller.inflation_rate), 18);
  else inflationRate = new Float().setFloat64((gauge.gauge_controller as any).inflation_rate);
  const gaugeWeight = toNormalizedAmount(
    new BigNumberInt(gauge.gauge_controller.gauge_relative_weight),
    18,
  );
  const secondsPerYear = new Float(31556952); // Match Go exactly
  const workingSupply = toNormalizedAmount(new BigNumberInt(gauge.gauge_data.working_supply), 18);
  const perMaxBoost = new Float(0.4);

  const crvPrice = crvTokenPrice instanceof Float ? crvTokenPrice : new Float(crvTokenPrice);
  const poolPriceFloat = poolPrice instanceof Float ? poolPrice : new Float(poolPrice);
  const baseAssetPriceFloat =
    baseAssetPrice instanceof Float ? baseAssetPrice : new Float(baseAssetPrice);
  let baseAPR = new Float(0).mul(inflationRate, gaugeWeight);
  const yearsBySupply = new Float(0).div(secondsPerYear, workingSupply);
  baseAPR = new Float().mul(baseAPR, yearsBySupply);
  const boostByPool = new Float(0).div(perMaxBoost, poolPriceFloat);
  baseAPR = new Float().mul(baseAPR, boostByPool);
  baseAPR = new Float().mul(baseAPR, crvPrice);
  baseAPR = new Float().div(baseAPR, baseAssetPriceFloat);
  const baseAPY = new Float().add(new Float(0), baseAPR); // baseAPY = baseAPR (no extra compounding)
  return { baseAPY, baseAPR };
}

export async function calculateCurveLikeStrategyAPR(
  vault: GqlVault,
  strategy: GqlStrategy,
  gauge: Gauge,
  pool: CrvPool | undefined,
  fraxPool: FraxPool | undefined,
  subgraphItem: CrvSubgraphPool | undefined,
  chainId: number,
) {
  const baseAssetPrice = new Float().setFloat64(gauge.lpTokenPrice || 0);
  const [{ priceUsd }, poolPrice] = await Promise.all([
    fetchErc20PriceUsd(chainId, CRV_TOKEN_ADDRESS[chainId]),
    Promise.resolve(getPoolPrice(gauge)),
  ]);
  // TODO: Remove this fallback once price fetching is fixed
  const fallbackCrvPrice = priceUsd || 0.8618; // closer to current CRV price
  const crvPrice = new Float(fallbackCrvPrice);
  
  
  const { baseAPY } = await calculateGaugeBaseAPR(gauge, crvPrice, poolPrice, baseAssetPrice);
  const rewardAPY = getRewardsAPY(pool as any);
  const poolWeeklyAPY = getPoolWeeklyAPY(subgraphItem);

  if (isPrismaStrategy(strategy as any))
    return calculatePrismaForwardAPR({
      vault,
      chainId,
      gaugeAddress: gauge.gauge as any,
      strategy: strategy as any,
      baseAssetPrice,
      poolPrice,
      baseAPY,
      rewardAPY,
      poolWeeklyAPY,
    });
  if (isFraxStrategy(strategy as any))
    return calculateFraxForwardAPY(
      {
        gaugeAddress: gauge.gauge as any,
        strategy: strategy as any,
        baseAssetPrice,
        poolPrice,
        baseAPY,
        rewardAPY,
        poolWeeklyAPY,
        chainId,
        lastDebtRatio: new Float(strategy.debtRatio || 0),
      },
      fraxPool,
    );
  if (isConvexStrategy(strategy as any))
    return calculateConvexForwardAPY({
      gaugeAddress: gauge.gauge as any,
      strategy: strategy as any,
      baseAssetPrice,
      poolPrice,
      baseAPY,
      rewardAPY,
      poolWeeklyAPY,
      chainId,
      lastDebtRatio: new Float(strategy.debtRatio || 0),
    });
  return calculateCurveForwardAPY({
    gaugeAddress: gauge.gauge as any,
    vault,
    strategy: strategy as any,
    baseAPY,
    rewardAPY,
    poolAPY: poolWeeklyAPY,
    chainId,
    lastDebtRatio: new Float(strategy.debtRatio || 0),
  });
}

export async function computeCurveLikeForwardAPY({
  vault,
  gauges,
  pools,
  subgraphData,
  fraxPools,
  allStrategiesForVault,
  chainId,
}: {
  vault: GqlVault;
  gauges: Gauge[];
  pools: CrvPool[];
  subgraphData: CrvSubgraphPool[];
  fraxPools: FraxPool[];
  allStrategiesForVault: GqlStrategy[];
  chainId: number;
}): Promise<VaultAPY> {
  // Match kong logic: use vault.defaults.asset directly
  const vaultAsset = vault.asset?.address as `0x${string}`;
  const gauge = findGaugeForVault(vaultAsset, gauges);
  if (!gauge) return { type: '', netAPY: 0 };
  const pool = findPoolForVault(vaultAsset, pools);
  const fraxPool = findFraxPoolForVault(vaultAsset, fraxPools);
  const subgraphItem = findSubgraphItemForVault(gauge.swap, subgraphData);

  let typeOf = '',
    netAPY = new Float(0),
    boost = new Float(0),
    poolAPY = new Float(0),
    boostedAPR = new Float(0),
    baseAPR = new Float(0),
    cvxAPR = new Float(0),
    rewardsAPY = new Float(0),
    keepCRV = new Float(0);

  const strategyAPRs = await Promise.all(
    allStrategiesForVault.map(async (strategy) => {
      // NOTE: debtRatio=0 strategies are skipped for calculation but we might want them?
      // User request says "active strategy (debtRatio > 0)". Logic consistent.
      if (!strategy.debtRatio || strategy.debtRatio === 0) return null;
      return calculateCurveLikeStrategyAPR(
        vault,
        strategy,
        gauge,
        pool,
        fraxPool,
        subgraphItem,
        chainId,
      );
    }),
  );

  const strategiesDerived: VaultAPY[] = [];

  for (const s of strategyAPRs) {
    if (!s) continue;
    const { weighted, raw } = s;
    strategiesDerived.push(raw);

    typeOf += weighted.type;
    netAPY = new Float(0).add(netAPY, new Float(weighted.netAPY || 0));
    boost = new Float(0).add(boost, new Float(weighted.boost || 0));
    poolAPY = new Float(0).add(poolAPY, new Float(weighted.poolAPY || 0));
    boostedAPR = new Float(0).add(boostedAPR, new Float(weighted.boostedAPR || 0));
    baseAPR = new Float(0).add(baseAPR, new Float(weighted.baseAPR || 0));
    cvxAPR = new Float(0).add(cvxAPR, new Float((weighted as any).cvxAPR || 0));
    rewardsAPY = new Float(0).add(rewardsAPY, new Float(weighted.rewardsAPY || 0));
    keepCRV = new Float(0).add(
      keepCRV,
      new Float(0).mul(new Float(weighted.keepCRV || 0), new Float((weighted as any).debtRatio || 0)),
    );
  }

  return {
    type: typeOf,
    strategies: strategiesDerived,
    netAPR: netAPY.toFloat64()[0],
    netAPY: netAPY.toFloat64()[0],
    boost: boost.toFloat64()[0],
    poolAPY: poolAPY.toFloat64()[0],
    boostedAPR: boostedAPR.toFloat64()[0],
    baseAPR: baseAPR.toFloat64()[0],
    cvxAPR: cvxAPR.toFloat64()[0],
    rewardsAPY: rewardsAPY.toFloat64()[0],
    keepCRV: keepCRV.toFloat64()[0],
  };
}
