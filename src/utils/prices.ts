const PRICE_SERVICE_CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum', 10: 'optimism', 100: 'gnosis', 137: 'polygon',
  146: 'sonic', 250: 'fantom', 8453: 'base', 42161: 'arbitrum',
  80094: 'berachain', 747474: 'katana', 4663: 'robinhood',
};

export class PriceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceUnavailableError';
  }
}

type UsdPrice = { priceUsd: number };

/** Fetch humanized USD spot prices together, preserving the caller's token order. */
export async function fetchErc20PricesUsd(
  chainId: number,
  addresses: `0x${string}`[],
): Promise<UsdPrice[]> {
  if (addresses.length === 0) return [];
  const chain = PRICE_SERVICE_CHAIN_NAMES[chainId];
  if (!chain) throw new PriceUnavailableError(`Unsupported price chain: ${chainId}`);

  const key = process.env.PRICE_SERVICE_API_KEY?.trim();
  if (!key) throw new PriceUnavailableError('PRICE_SERVICE_API_KEY is not configured');

  try {
    const coins = addresses.map((address) => `${chain}:${address.toLowerCase()}`);
    const url = new URL('/api/prices/spot', process.env.PRICE_SERVICE_URL || 'https://prices.yearn.dev');
    url.searchParams.set('coins', JSON.stringify([...new Set(coins)]));
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new PriceUnavailableError(`Price service HTTP ${response.status}`);

    const body = await response.json() as { coins?: Record<string, { prices?: { price?: unknown }[] }> };
    return coins.map((coin) => {
      const price = body.coins?.[coin]?.prices?.[0]?.price;
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        throw new PriceUnavailableError(`Missing or invalid USD quote for ${coin}`);
      }
      return { priceUsd: price };
    });
  } catch (error) {
    if (error instanceof PriceUnavailableError) throw error;
    // Transport errors can include request details; expose only a safe diagnostic.
    throw new PriceUnavailableError('Price service request failed or returned invalid JSON');
  }
}

export async function fetchErc20PriceUsd(
  chainId: number,
  address: `0x${string}`,
): Promise<UsdPrice> {
  const [price] = await fetchErc20PricesUsd(chainId, [address]);
  return price;
}
