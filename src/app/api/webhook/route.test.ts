import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const VAULT_A = '0xaA00000000000000000000000000000000000001' as `0x${string}`;
const SECRET = 'test-secret';

const subscription = {
  id: 'S_TEST',
  url: 'https://example.com/webhook',
  abiPath: 'yearn/2/vault',
  type: 'timeseries' as const,
  labels: ['crv-estimated-apr'],
};

vi.mock('@/output', () => ({
  computeFapy: vi.fn(),
}));

import { POST } from './route';
import { computeFapy } from '@/output';

function makeSignature(body: string, secret = SECRET) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

function signedRequest(body: unknown, headers: Record<string, string> = {}) {
  const rawBody = JSON.stringify(body);
  return new NextRequest('http://localhost/api/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'kong-signature': makeSignature(rawBody),
      ...headers,
    },
    body: rawBody,
  });
}

const validBatch = {
  abiPath: 'yearn/2/vault',
  chainId: 1,
  blockNumber: '100',
  blockTime: '200',
  subscription,
  vaults: [VAULT_A],
};

const sampleOutputs = [
  {
    chainId: 1,
    address: VAULT_A,
    label: 'crv-estimated-apr',
    component: 'netAPR',
    value: 0.05,
    blockNumber: 100n,
    blockTime: 200n,
  },
];

describe('/api/webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KONG_SECRET = SECRET;
  });

  it('processes a signed batch payload and returns 200', async () => {
    vi.mocked(computeFapy).mockResolvedValue(sampleOutputs as any);

    const res = await POST(signedRequest(validBatch));

    expect(res.status).toBe(200);
    expect(computeFapy).toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual([
      {
        chainId: 1,
        address: VAULT_A,
        label: 'crv-estimated-apr',
        component: 'netAPR',
        value: 0.05,
        blockNumber: '100',
        blockTime: '200',
      },
    ]);
  });

  it('returns 503 when KONG_SECRET is unset', async () => {
    const prev = process.env.KONG_SECRET;
    delete process.env.KONG_SECRET;

    const res = await POST(
      new NextRequest('http://localhost/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'kong-signature': 't=1,v1=abc',
        },
        body: '{}',
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'service unavailable' });
    expect(computeFapy).not.toHaveBeenCalled();

    process.env.KONG_SECRET = prev;
  });

  it('returns 403 when kong-signature header is missing', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(computeFapy).not.toHaveBeenCalled();
  });

  it('returns 403 when signature is invalid', async () => {
    const res = await POST(
      signedRequest(validBatch, { 'kong-signature': 't=1,v1=deadbeef' }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(computeFapy).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid payload', async () => {
    const res = await POST(signedRequest({ invalid: true }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid payload');
    expect(body.issues).toBeDefined();
    expect(computeFapy).not.toHaveBeenCalled();
  });

  it('returns 204 when no outputs are produced', async () => {
    vi.mocked(computeFapy).mockResolvedValue([]);

    const res = await POST(signedRequest(validBatch));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('returns 500 when computeFapy throws a non-validation error', async () => {
    vi.mocked(computeFapy).mockRejectedValue(new Error('boom'));

    const res = await POST(signedRequest(validBatch));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
  });
});
