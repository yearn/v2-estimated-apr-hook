const PRICE_SERVICE_CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum', 10: 'optimism', 100: 'gnosis', 137: 'polygon',
  146: 'sonic', 250: 'fantom', 8453: 'base', 42161: 'arbitrum',
  80094: 'berachain', 747474: 'katana', 4663: 'robinhood',
};

type UsdPrice = { priceUsd: number };

/** Fetch humanized USD spot prices together, preserving the caller's token order. */
export async function fetchErc20PricesUsd(
  chainId: number,
  addresses: `0x${string}`[],
): Promise<UsdPrice[]> {
  const empty = () => addresses.map(() => ({ priceUsd: 0 }));
  const chain = PRICE_SERVICE_CHAIN_NAMES[chainId];
  if (!chain || addresses.length === 0) return empty();

  const key = process.env.PRICE_SERVICE_API_KEY?.trim();
  if (!key) throw new Error('PRICE_SERVICE_API_KEY is not configured');

  try {
    const coins = addresses.map((address) => `${chain}:${address.toLowerCase()}`);
    const url = new URL('/api/prices/spot', process.env.PRICE_SERVICE_URL || 'https://prices.yearn.dev');
    url.searchParams.set('coins', JSON.stringify([...new Set(coins)]));
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return empty();

    const body = await response.json() as { coins?: Record<string, { price?: unknown }> };
    return coins.map((coin) => {
      const price = body.coins?.[coin]?.price;
      return { priceUsd: typeof price === 'number' && Number.isFinite(price) && price >= 0 ? price : 0 };
    });
  } catch {
    return empty();
  }
}

export async function fetchErc20PriceUsd(
  chainId: number,
  address: `0x${string}`,
): Promise<UsdPrice> {
  const [price] = await fetchErc20PricesUsd(chainId, [address]);
  return price;
}
