# fapy-hook

Yearn estimated APR webhook service. Receives signed batch webhooks from [Kong](https://kong.yearn.farm), computes forward APY for Curve/Convex and Velodrome/Aerodrome vaults, and returns labeled timeseries components Kong can store.

## What it does

When Kong notifies this service about vault activity, `fapy-hook`:

1. Verifies the request with an HMAC signature (`kong-signature`)
2. Loads vault + strategy data from Kong GraphQL
3. Classifies each vault (Curve/Convex vs Velodrome/Aerodrome)
4. Computes forward APR/APY components (net, boost, rewards, keep rates, etc.)
5. Returns one output row per component (vault and strategy level)

Batch requests process multiple vaults on the same chain in one call and share chain-level data (Curve gauges/pools, subgraph, Frax pools) so those fetches run once per chain, not once per vault.

## Stack

| Piece | Choice |
| --- | --- |
| Runtime | Node 22 |
| Package manager | Bun 1.3.x |
| Framework | Next.js 16 (App Router) |
| Chain IO | viem |
| Validation | Zod |
| Tests | Vitest |
| Deploy | Vercel (via yearn GHA + 1Password secrets) |

## API

Rewrites map public paths to App Router routes:

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/webhook` | Batch fAPY computation (HMAC required) |
| `GET` | `/healthcheck` | Liveness probe (`ok`) |

`maxDuration` is 60s for the webhook and 10s for health.

### Authentication

Requests must include:

```http
kong-signature: t=<unix_seconds>,v1=<hmac_sha256_hex>
```

Signature payload is `${timestamp}.${rawBody}`, HMAC-SHA256 with `KONG_SECRET`. Timestamps outside a 5-minute window are rejected.

| Condition | Status |
| --- | --- |
| Missing `KONG_SECRET` | `503` |
| Missing / invalid signature | `403` |
| Invalid JSON / Zod failure | `400` |
| No computable outputs | `204` (empty body) |
| Success | `200` + JSON array |

### Request body

```json
{
  "abiPath": "yearn/2/vault",
  "chainId": 1,
  "blockNumber": "12345",
  "blockTime": "67890",
  "subscription": {
    "id": "S_C2795BC0",
    "url": "https://example.com/webhook",
    "abiPath": "yearn/2/vault",
    "type": "timeseries",
    "labels": ["crv-estimated-apr"]
  },
  "vaults": [
    "0xabc0000000000000000000000000000000000001",
    "0xdef0000000000000000000000000000000000002"
  ]
}
```

All vaults in a request share the same `chainId`, `blockNumber`, and `blockTime`.

### Response

Array of timeseries points:

```json
[
  {
    "chainId": 1,
    "address": "0xabc0000000000000000000000000000000000001",
    "label": "crv-estimated-apr",
    "component": "netAPY",
    "value": 0.042,
    "blockNumber": "12345",
    "blockTime": "67890"
  }
]
```

| Label | Chains / vault type | Components (when present) |
| --- | --- | --- |
| `crv-estimated-apr` | Curve / Convex strategies | `netAPR`, `netAPY`, `boost`, `poolAPY`, `boostedAPR`, `baseAPR`, `rewardsAPR`, `rewardsAPY`, `cvxAPR`, `keepCRV` (+ `debtRatio` on strategies) |
| `velo-estimated-apr` | Optimism Velodrome-like | `netAPR`, `netAPY`, `keepVelo` (+ `debtRatio` on strategies) |
| `aero-estimated-apr` | Base Aerodrome-like | same as velo |

Vaults that cannot be classified or computed are skipped; per-vault failures are logged and do not fail the whole batch.

## Local development

### Prerequisites

- Node 22
- [Bun](https://bun.sh) 1.3.x

### Setup

```bash
cp .env.example .env
# fill in RPC URLs and KONG_SECRET
bun install
bun run dev
```

Dev server defaults to Next.js (`next dev --turbopack`). Health: `http://localhost:3000/healthcheck`.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `KONG_SECRET` | yes (webhook) | HMAC secret shared with Kong |
| `RPC_URI_FOR_1` | for Ethereum | RPC for on-chain reads |
| `RPC_URI_FOR_10` | for Optimism | RPC for Velodrome paths |
| `RPC_URI_FOR_8453` | for Base | RPC for Aerodrome paths |
| `RPC_URI_FOR_42161` | for Arbitrum | RPC when that chain is used |
| `CRV_GAUGE_REGISTRY_URL` | yes (Curve path) | Curve gauges API |
| `CRV_POOLS_URL` | yes (Curve path) | Curve pools API |

See `.env.example` for a minimal template. Production secrets are pulled from 1Password (`webops-prod-fapy-hook` / `fapy-hook/*`) during Vercel deploy.

### Scripts

```bash
bun run dev          # Next.js dev server
bun run build        # production build
bun run start        # serve production build
bun run test         # Vitest (ALLOW_INSECURE_TLS=1)
bun run test:watch   # Vitest watch mode
bun run lint         # ESLint
bun run format       # Prettier check
bun run format:fix  # Prettier write
```

## Architecture

```
POST /webhook
  → verify HMAC (KONG_SECRET)
  → parse KongBatchWebhookSchema
  → computeFapy (src/output.ts)
       ├─ getVaultsWithStrategies  (Kong GraphQL)
       ├─ fetchChainData           (Curve gauges/pools/subgraph/Frax, once)
       └─ per vault:
            ├─ Velodrome/Aerodrome → velo-like.forward
            └─ Curve/Convex        → crv-like.forward
  → Output[] (label + component rows)
```

| Path | Role |
| --- | --- |
| `src/app/api/webhook/` | Signed webhook handler |
| `src/app/api/health/` | Health probe |
| `src/output.ts` | Batch orchestration + output shaping |
| `src/fapy.ts` | Vault type routing |
| `src/crv-like.forward.ts` | Curve / Convex forward APY |
| `src/velo-like.forward.ts` | Velodrome / Aerodrome forward APY |
| `src/service.ts` | Vault + strategy loading |
| `src/clients/kongClient.ts` | Kong GraphQL client |
| `src/types/schemas.ts` | Zod request/response schemas |
| `src/utils/rpcs.ts` | Chain RPC resolution |

## Deploy

- **Hosting:** Vercel (Next.js framework; install via `bun install --frozen-lockfile`)
- **CI:** `.github/workflows/test.yml` runs Vitest on PRs to `master`
- **CD:** `.github/workflows/deploy.yml` deploys via `yearn/yearn-gha` with 1Password-backed secrets (preview on PR, production on `master`)

Secrets inlined at build time through `next.config.ts` so serverless handlers see them at runtime.

## License

Private — Yearn Finance.
