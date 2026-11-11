import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchErc20PriceUsd, fetchErc20PricesUsd } from './prices';

const ADDRESS = '0xaB00000000000000000000000000000000000001' as const;
const OTHER = '0x0000000000000000000000000000000000000002' as const;
const coin = `ethereum:${ADDRESS.toLowerCase()}`;

function respond(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  vi.stubEnv('PRICE_SERVICE_API_KEY', 'test-price-key');
  vi.stubEnv('PRICE_SERVICE_URL', 'https://prices.yearn.dev');
});

describe('price-service spot prices', () => {
  it('authenticates the request and returns humanized USD without rescaling', async () => {
    const fetch = respond({ coins: { [coin]: { price: 1.25 } } });
    expect(await fetchErc20PriceUsd(1, ADDRESS)).toEqual({ priceUsd: 1.25 });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://prices.yearn.dev/api/prices/spot');
    expect(JSON.parse(parsed.searchParams.get('coins')!)).toEqual([coin]);
    expect(request.headers).toEqual({ Authorization: 'Bearer test-price-key' });
    expect(request.redirect).toBe('error');
  });

  it('batches and deduplicates tokens while preserving requested order', async () => {
    const otherCoin = `ethereum:${OTHER}`;
    const fetch = respond({ coins: { [otherCoin]: { price: 2 }, [coin]: { price: 1.25 } } });
    expect(await fetchErc20PricesUsd(1, [ADDRESS, OTHER, ADDRESS])).toEqual([
      { priceUsd: 1.25 }, { priceUsd: 2 }, { priceUsd: 1.25 },
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(new URL(fetch.mock.calls[0][0]).searchParams.get('coins')!)).toEqual([coin, otherCoin]);
  });

  it.each([[10, 'optimism'], [8453, 'base'], [100, 'gnosis']])('uses the service chain name for %i', async (chainId, name) => {
    const id = `${name}:${ADDRESS.toLowerCase()}`;
    const fetch = respond({ coins: { [id]: { price: 0.125 } } });
    expect(await fetchErc20PriceUsd(Number(chainId), ADDRESS)).toEqual({ priceUsd: 0.125 });
    expect(JSON.parse(new URL(fetch.mock.calls[0][0]).searchParams.get('coins')!)).toEqual([id]);
  });

  it.each([null, '1.25', 'not-a-price', 'Infinity', -1])('returns zero for invalid price %s', async (price) => {
    respond({ coins: { [coin]: { price } } });
    expect(await fetchErc20PriceUsd(1, ADDRESS)).toEqual({ priceUsd: 0 });
  });

  it('accepts an explicit zero price', async () => {
    respond({ coins: { [coin]: { price: 0, source: 'write-down' } } });
    expect(await fetchErc20PriceUsd(1, ADDRESS)).toEqual({ priceUsd: 0 });
  });

  it('does not use another chain or token as a replacement price', async () => {
    respond({ coins: { [`base:${ADDRESS.toLowerCase()}`]: { price: 99 }, [`ethereum:${OTHER}`]: { price: 88 } } });
    expect(await fetchErc20PriceUsd(1, ADDRESS)).toEqual({ priceUsd: 0 });
  });

  it('returns zero when the service has no quote', async () => {
    respond({ coins: {} });
    expect(await fetchErc20PriceUsd(1, ADDRESS)).toEqual({ priceUsd: 0 });
  });

  it('returns zero on an HTTP failure', async () => {
    respond({ error: 'Unavailable' }, 503);
    expect(await fetchErc20PriceUsd(1, ADDRESS)).toEqual({ priceUsd: 0 });
  });

  it('returns zero on a transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
    expect(await fetchErc20PriceUsd(1, ADDRESS)).toEqual({ priceUsd: 0 });
  });

  it('returns zero on a malformed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')));
    expect(await fetchErc20PriceUsd(1, ADDRESS)).toEqual({ priceUsd: 0 });
  });

  it('requires a server-side API key', async () => {
    vi.stubEnv('PRICE_SERVICE_API_KEY', '');
    await expect(fetchErc20PriceUsd(1, ADDRESS)).rejects.toThrow('PRICE_SERVICE_API_KEY');
  });

  it('does not fetch for an unsupported chain or an empty batch', async () => {
    vi.stubEnv('PRICE_SERVICE_API_KEY', '');
    expect(await fetchErc20PriceUsd(999999, ADDRESS)).toEqual({ priceUsd: 0 });
    expect(await fetchErc20PricesUsd(1, [])).toEqual([]);
  });
});
