import { afterEach, describe, expect, it, vi } from 'vitest';
import { KongClient } from './kongClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('KongClient.getVaults', () => {
  it('loads vaults beyond Kong’s 100-result query limit', async () => {
    const addresses = Array.from(
      { length: 101 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}` as `0x${string}`,
    );
    const requests: Array<{ addresses: string[]; limit?: number }> = [];

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const { variables } = JSON.parse(init.body as string);
      requests.push(variables);
      // Match Kong's default behavior: a query returns no more than 100 vaults.
      const vaults = variables.addresses.slice(0, Math.min(variables.limit ?? 100, 100))
        .map((address: string) => ({ address }));
      return Response.json({ data: { vaults } });
    }));

    const vaults = await new KongClient().getVaults(1, addresses);

    expect(vaults.map((vault) => vault.address)).toEqual(addresses);
    expect(requests.map(({ addresses, limit }) => [addresses.length, limit])).toEqual([
      [100, 100],
      [1, 1],
    ]);
  });
});
