import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KongBatchWebhookSchema } from './types/schemas';

const VAULT_A = '0xaA00000000000000000000000000000000000001' as `0x${string}`;
const VAULT_B = '0xbB00000000000000000000000000000000000002' as `0x${string}`;
const VAULT_C = '0xCC00000000000000000000000000000000000003' as `0x${string}`;
const STRATEGY_A = '0xDD00000000000000000000000000000000000004' as `0x${string}`;

const subscription = {
  id: 'S_TEST',
  url: 'https://example.com/webhook',
  abiPath: 'yearn/2/vault',
  type: 'timeseries' as const,
  labels: ['crv-estimated-apr'],
};

// ---- Schema tests ----

describe('KongBatchWebhookSchema', () => {
  it('parses a valid batch payload', () => {
    const result = KongBatchWebhookSchema.parse({
      abiPath: 'yearn/2/vault',
      blockNumber: '123456',
      blockTime: '1700000000',
      subscription,
      vaults: [
        { chainId: 1, address: VAULT_A },
        { chainId: 1, address: VAULT_B },
        { chainId: 10, address: VAULT_C },
      ],
    });
    expect(result.vaults).toHaveLength(3);
    expect(result.blockNumber).toBe(123456n);
  });

  it('coerces blockNumber and blockTime from numbers', () => {
    const result = KongBatchWebhookSchema.parse({
      abiPath: 'yearn/2/vault',
      blockNumber: 999,
      blockTime: 1000,
      subscription,
      vaults: [{ chainId: 1, address: VAULT_A }],
    });
    expect(result.blockNumber).toBe(999n);
  });

  it('rejects invalid address in vaults', () => {
    expect(() =>
      KongBatchWebhookSchema.parse({
        abiPath: 'yearn/2/vault',
        blockNumber: '1',
        blockTime: '1',
        subscription,
        vaults: [{ chainId: 1, address: 'not-an-address' }],
      }),
    ).toThrow();
  });

  it('rejects missing vaults field', () => {
    expect(() =>
      KongBatchWebhookSchema.parse({
        abiPath: 'yearn/2/vault',
        blockNumber: '1',
        blockTime: '1',
        subscription,
      }),
    ).toThrow();
  });
});

// ---- computeFapy tests (mocked dependencies) ----

vi.mock('./service', () => ({
  getVaultsWithStrategies: vi.fn(),
}));

vi.mock('./fapy', () => ({
  computeChainAPY: vi.fn(),
  fetchChainData: vi.fn(),
}));

vi.mock('./velo-like.forward', () => ({
  isVeloLikeVault: vi.fn(),
}));

import { computeFapy } from './output';
import { getVaultsWithStrategies } from './service';
import { computeChainAPY, fetchChainData } from './fapy';
import { isVeloLikeVault } from './velo-like.forward';

const mockVault = (address: string, chainId = 1) => ({
  chainId,
  address,
  asset: { address: '0x0000000000000000000000000000000000000000', chainId, name: 'CRV', symbol: 'CRV', decimals: 18 },
  strategies: [],
  debts: [],
});

const mockFapy = () => ({
  netAPR: 0.05,
  netAPY: 0.051,
  boost: 1.5,
  poolAPY: 0.03,
  boostedAPR: 0.04,
  baseAPR: 0.02,
  rewardsAPR: 0.01,
  rewardsAPY: 0.011,
  cvxAPR: 0.005,
  keepCRV: 0.1,
});

const makeHook = (vaults: { chainId: number, address: `0x${string}` }[]) => ({
  abiPath: 'yearn/2/vault',
  blockNumber: 100n,
  blockTime: 200n,
  subscription,
  vaults,
});

describe('computeFapy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isVeloLikeVault).mockResolvedValue([null, false]);
    vi.mocked(fetchChainData).mockResolvedValue({
      gauges: [],
      pools: [],
      subgraph: [],
      fraxPools: [],
    });
  });

  it('produces outputs for multiple vaults on same chain', async () => {
    const vaultsMap = new Map([
      [VAULT_A.toLowerCase(), { vault: mockVault(VAULT_A), strategies: [] }],
      [VAULT_B.toLowerCase(), { vault: mockVault(VAULT_B), strategies: [] }],
    ]);
    vi.mocked(getVaultsWithStrategies).mockResolvedValue(vaultsMap as any);
    vi.mocked(computeChainAPY).mockResolvedValue(mockFapy());

    const outputs = await computeFapy(makeHook([
      { chainId: 1, address: VAULT_A },
      { chainId: 1, address: VAULT_B },
    ]));

    // 10 CRV components per vault * 2 vaults = 20
    expect(outputs).toHaveLength(20);
    expect(outputs.filter(o => o.address === VAULT_A)).toHaveLength(10);
    expect(outputs.filter(o => o.address === VAULT_B)).toHaveLength(10);
    expect(outputs.every(o => o.label === 'crv-estimated-apr')).toBe(true);
  });

  it('fetches chain data once per chain, not per vault', async () => {
    const vaultsMap = new Map([
      [VAULT_A.toLowerCase(), { vault: mockVault(VAULT_A), strategies: [] }],
      [VAULT_B.toLowerCase(), { vault: mockVault(VAULT_B), strategies: [] }],
    ]);
    vi.mocked(getVaultsWithStrategies).mockResolvedValue(vaultsMap as any);
    vi.mocked(computeChainAPY).mockResolvedValue(mockFapy());

    await computeFapy(makeHook([
      { chainId: 1, address: VAULT_A },
      { chainId: 1, address: VAULT_B },
    ]));

    expect(fetchChainData).toHaveBeenCalledTimes(1);
    expect(fetchChainData).toHaveBeenCalledWith(1);
  });

  it('groups vaults by chain and fetches data per chain', async () => {
    const chain1Map = new Map([
      [VAULT_A.toLowerCase(), { vault: mockVault(VAULT_A, 1), strategies: [] }],
    ]);
    const chain10Map = new Map([
      [VAULT_C.toLowerCase(), { vault: mockVault(VAULT_C, 10), strategies: [] }],
    ]);
    vi.mocked(getVaultsWithStrategies)
      .mockResolvedValueOnce(chain1Map as any)
      .mockResolvedValueOnce(chain10Map as any);
    vi.mocked(computeChainAPY).mockResolvedValue(mockFapy());

    await computeFapy(makeHook([
      { chainId: 1, address: VAULT_A },
      { chainId: 10, address: VAULT_C },
    ]));

    expect(getVaultsWithStrategies).toHaveBeenCalledTimes(2);
    expect(fetchChainData).toHaveBeenCalledTimes(2);
    expect(fetchChainData).toHaveBeenCalledWith(1);
    expect(fetchChainData).toHaveBeenCalledWith(10);
  });

  it('passes pre-fetched chainData to computeChainAPY', async () => {
    const chainData = { gauges: ['g'], pools: ['p'], subgraph: ['s'], fraxPools: ['f'] };
    vi.mocked(fetchChainData).mockResolvedValue(chainData as any);
    const vaultsMap = new Map([
      [VAULT_A.toLowerCase(), { vault: mockVault(VAULT_A), strategies: [] }],
    ]);
    vi.mocked(getVaultsWithStrategies).mockResolvedValue(vaultsMap as any);
    vi.mocked(computeChainAPY).mockResolvedValue(mockFapy());

    await computeFapy(makeHook([{ chainId: 1, address: VAULT_A }]));

    expect(computeChainAPY).toHaveBeenCalledWith(
      expect.anything(), 1, expect.anything(), chainData,
    );
  });

  it('skips failed vaults without failing the batch', async () => {
    const vaultsMap = new Map([
      [VAULT_A.toLowerCase(), { vault: mockVault(VAULT_A), strategies: [] }],
      [VAULT_B.toLowerCase(), { vault: mockVault(VAULT_B), strategies: [] }],
    ]);
    vi.mocked(getVaultsWithStrategies).mockResolvedValue(vaultsMap as any);
    vi.mocked(computeChainAPY)
      .mockRejectedValueOnce(new Error('RPC error'))
      .mockResolvedValueOnce(mockFapy());

    const outputs = await computeFapy(makeHook([
      { chainId: 1, address: VAULT_A },
      { chainId: 1, address: VAULT_B },
    ]));

    expect(outputs).toHaveLength(10);
    expect(outputs.every(o => o.address === VAULT_B)).toBe(true);
  });

  it('skips vaults not found in the GraphQL response', async () => {
    const vaultsMap = new Map([
      [VAULT_A.toLowerCase(), { vault: mockVault(VAULT_A), strategies: [] }],
    ]);
    vi.mocked(getVaultsWithStrategies).mockResolvedValue(vaultsMap as any);
    vi.mocked(computeChainAPY).mockResolvedValue(mockFapy());

    const outputs = await computeFapy(makeHook([
      { chainId: 1, address: VAULT_A },
      { chainId: 1, address: VAULT_B },
    ]));

    expect(outputs).toHaveLength(10);
    expect(outputs.every(o => o.address === VAULT_A)).toBe(true);
  });

  it('returns empty array for empty vaults', async () => {
    const outputs = await computeFapy(makeHook([]));
    expect(outputs).toHaveLength(0);
  });

  it('includes strategy outputs with debtRatio component', async () => {
    const vaultsMap = new Map([
      [VAULT_A.toLowerCase(), { vault: mockVault(VAULT_A), strategies: [{ address: STRATEGY_A }] }],
    ]);
    vi.mocked(getVaultsWithStrategies).mockResolvedValue(vaultsMap as any);
    vi.mocked(computeChainAPY).mockResolvedValue({
      ...mockFapy(),
      strategies: [{ address: STRATEGY_A, netAPR: 0.04, debtRatio: 5000 }],
    });

    const outputs = await computeFapy(makeHook([{ chainId: 1, address: VAULT_A }]));

    const stratOutputs = outputs.filter(o => o.address === STRATEGY_A);
    expect(stratOutputs.length).toBe(11); // 10 CRV components + debtRatio
    expect(stratOutputs.some(o => o.component === 'debtRatio')).toBe(true);
  });
});

// ---- Webhook handler tests ----

describe('webhook handler', () => {
  let handler: typeof import('../api/webhook').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.KONG_SECRET = 'test-secret';
    const mod = await import('../api/webhook');
    handler = mod.default;
  });

  function makeSignature(body: string, secret = 'test-secret') {
    const { createHmac } = require('node:crypto');
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
    return `t=${timestamp},v1=${sig}`;
  }

  function mockReqRes(body: any) {
    const bodyStr = JSON.stringify(body);
    const req = {
      method: 'POST',
      headers: { 'kong-signature': makeSignature(bodyStr) },
      body,
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    return { req, res };
  }

  it('processes batch payload and returns 200', async () => {
    const vaultsMap = new Map([
      [VAULT_A.toLowerCase(), { vault: mockVault(VAULT_A), strategies: [] }],
    ]);
    vi.mocked(getVaultsWithStrategies).mockResolvedValue(vaultsMap as any);
    vi.mocked(computeChainAPY).mockResolvedValue(mockFapy());

    const body = {
      abiPath: 'yearn/2/vault',
      blockNumber: '100',
      blockTime: '200',
      subscription,
      vaults: [{ chainId: 1, address: VAULT_A }],
    };
    const { req, res } = mockReqRes(body);

    await handler(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getVaultsWithStrategies).toHaveBeenCalled();
  });

  it('rejects requests without signature', async () => {
    const req = { method: 'POST', headers: {}, body: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await handler(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 400 for invalid payload', async () => {
    const body = { invalid: true };
    const { req, res } = mockReqRes(body);

    await handler(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
