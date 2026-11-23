import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchFraxPools,
  fetchGauges,
  fetchPools,
  fetchSubgraph,
  fetchWithRetry,
} from './crv.fetcher';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// undici reports a dropped connection (ECONNRESET) as `TypeError: terminated`.
const terminated = () => new TypeError('terminated', { cause: new Error('read ECONNRESET') });

describe('fetchWithRetry', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('retries a dropped connection and returns the later success', async () => {
    fetchMock.mockRejectedValueOnce(terminated()).mockResolvedValueOnce(json({ ok: true }));

    const pending = fetchWithRetry('https://example.test/a');
    await vi.runAllTimersAsync();

    expect((await pending).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([429, 502, 503, 504])('retries HTTP %i', async (status) => {
    fetchMock
      .mockResolvedValueOnce(new Response('busy', { status }))
      .mockResolvedValueOnce(json({ ok: true }));

    const pending = fetchWithRetry('https://example.test/a');
    await vi.runAllTimersAsync();

    expect((await pending).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry other HTTP statuses', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));

    expect((await fetchWithRetry('https://example.test/a')).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows the last network error after the retries are used up', async () => {
    fetchMock.mockImplementation(async () => {
      throw terminated();
    });

    const pending = fetchWithRetry('https://example.test/a');
    const assertion = expect(pending).rejects.toThrow('terminated');
    await vi.runAllTimersAsync();

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns the last retryable response once the retries are used up', async () => {
    fetchMock.mockImplementation(async () => new Response('busy', { status: 503 }));

    const pending = fetchWithRetry('https://example.test/a');
    await vi.runAllTimersAsync();

    expect((await pending).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never retries an abort or timeout', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));

    await expect(fetchWithRetry('https://example.test/a')).rejects.toThrow('timed out');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops retrying when the deadline leaves no time for another attempt', async () => {
    fetchMock.mockImplementation(async () => {
      throw terminated();
    });

    const pending = fetchWithRetry('https://example.test/a', {
      deadlineMs: 100,
      baseDelayMs: 1_000,
    });
    const assertion = expect(pending).rejects.toThrow('terminated');
    await vi.runAllTimersAsync();

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('crv fetchers keep their error contract', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('fetchGauges survives one dropped connection', async () => {
    fetchMock
      .mockRejectedValueOnce(terminated())
      .mockResolvedValueOnce(json({ data: { a: { id: 1 } } }));

    const pending = fetchGauges();
    await vi.runAllTimersAsync();

    expect(await pending).toEqual([{ id: 1 }]);
  });

  it('fetchFraxPools survives one dropped connection', async () => {
    fetchMock
      .mockRejectedValueOnce(terminated())
      .mockResolvedValueOnce(json({ pools: { augmentedPoolData: [] } }));

    const pending = fetchFraxPools();
    await vi.runAllTimersAsync();

    expect(await pending).toEqual([]);
  });

  it('fetchGauges and fetchFraxPools still throw when the upstream stays down', async () => {
    fetchMock.mockImplementation(async () => {
      throw terminated();
    });

    const gauges = expect(fetchGauges()).rejects.toThrow('terminated');
    const frax = expect(fetchFraxPools()).rejects.toThrow('terminated');
    await vi.runAllTimersAsync();

    await gauges;
    await frax;
  });

  it('fetchPools and fetchSubgraph still fall back to an empty list when the upstream stays down', async () => {
    fetchMock.mockImplementation(async () => {
      throw terminated();
    });

    const pools = fetchPools();
    const subgraph = fetchSubgraph(1);
    await vi.runAllTimersAsync();

    expect(await pools).toEqual([]);
    expect(await subgraph).toEqual([]);
  });
});
