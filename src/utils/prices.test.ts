import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchErc20PriceUsd, fetchErc20PricesUsd, PriceUnavailableError } from './prices';

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
    const fetch = respond({
      coins: { [coin]: { symbol: 'CRV', prices: [{ timestamp: 1, price: 1.25, confidence: null, source: 'enso' }] } },
    });
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
    const fetch = respond({ coins: { [otherCoin]: { prices: [{ price: 2 }] }, [coin]: { prices: [{ price: 1.25 }] } } });
    expect(await fetchErc20PricesUsd(1, [ADDRESS, OTHER, ADDRESS])).toEqual([
      { priceUsd: 1.25 }, { priceUsd: 2 }, { priceUsd: 1.25 },
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(new URL(fetch.mock.calls[0][0]).searchParams.get('coins')!)).toEqual([coin, otherCoin]);
  });

  it.each([[10, 'optimism'], [8453, 'base'], [100, 'gnosis']])('uses the service chain name for %i', async (chainId, name) => {
    const id = `${name}:${ADDRESS.toLowerCase()}`;
    const fetch = respond({ coins: { [id]: { prices: [{ price: 0.125 }] } } });
    expect(await fetchErc20PriceUsd(Number(chainId), ADDRESS)).toEqual({ priceUsd: 0.125 });
    expect(JSON.parse(new URL(fetch.mock.calls[0][0]).searchParams.get('coins')!)).toEqual([id]);
  });

  it.each([null, '1.25', 'not-a-price', 'Infinity', -1])('rejects invalid price %s', async (price) => {
    respond({ coins: { [coin]: { prices: [{ price }] } } });
    await expect(fetchErc20PriceUsd(1, ADDRESS)).rejects.toBeInstanceOf(PriceUnavailableError);
  });

  it('accepts an explicit zero price', async () => {
    respond({ coins: { [coin]: { prices: [{ price: 0, source: 'write-down' }] } } });
    expect(await fetchErc20PriceUsd(1, ADDRESS)).toEqual({ priceUsd: 0 });
  });

  it('does not use another chain or token as a replacement price', async () => {
    respond({ coins: { [`base:${ADDRESS.toLowerCase()}`]: { prices: [{ price: 99 }] }, [`ethereum:${OTHER}`]: { prices: [{ price: 88 }] } } });
    await expect(fetchErc20PriceUsd(1, ADDRESS)).rejects.toBeInstanceOf(PriceUnavailableError);
  });

  it('rejects the bare price shape the service never returns', async () => {
    respond({ coins: { [coin]: { price: 1.25 } } });
    await expect(fetchErc20PriceUsd(1, ADDRESS)).rejects.toBeInstanceOf(PriceUnavailableError);
  });

  it('rejects a missing quote', async () => {
    respond({ coins: {} });
    await expect(fetchErc20PriceUsd(1, ADDRESS)).rejects.toBeInstanceOf(PriceUnavailableError);
  });

  it('rejects an HTTP failure', async () => {
    respond({ error: 'Unavailable' }, 503);
    await expect(fetchErc20PriceUsd(1, ADDRESS)).rejects.toBeInstanceOf(PriceUnavailableError);
  });

  it('rejects a transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
    await expect(fetchErc20PriceUsd(1, ADDRESS)).rejects.toBeInstanceOf(PriceUnavailableError);
  });

  it('rejects a malformed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')));
    await expect(fetchErc20PriceUsd(1, ADDRESS)).rejects.toBeInstanceOf(PriceUnavailableError);
  });

  it('requires a server-side API key', async () => {
    vi.stubEnv('PRICE_SERVICE_API_KEY', '');
    await expect(fetchErc20PriceUsd(1, ADDRESS)).rejects.toThrow('PRICE_SERVICE_API_KEY');
  });

  it('does not fetch for an unsupported chain or an empty batch', async () => {
    vi.stubEnv('PRICE_SERVICE_API_KEY', '');
    await expect(fetchErc20PriceUsd(999999, ADDRESS)).rejects.toBeInstanceOf(PriceUnavailableError);
    expect(await fetchErc20PricesUsd(1, [])).toEqual([]);
  });
});
