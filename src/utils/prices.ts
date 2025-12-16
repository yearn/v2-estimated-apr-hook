/**
 * Fetch token price from ydaemon API
 * @param chainId Chain ID (e.g., 1, 10, 8453)
 * @param address Token address
 * @returns Price in USD
 */
export async function fetchErc20PriceUsd(
  chainId: number,
  address: `0x${string}`,
): Promise<{ priceUsd: number }> {
  try {
    const url = `https://ydaemon.yearn.fi/${chainId}/prices/${address}?humanized=true`;
    const response = await fetch(url);

    if (!response.ok) {
      return { priceUsd: 0 };
    }

    const priceText = await response.text();
    const price = parseFloat(priceText);

    return { priceUsd: isNaN(price) ? 0 : price };
  } catch {
    return { priceUsd: 0 };
  }
}
