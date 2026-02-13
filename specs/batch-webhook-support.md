# Add Batch Webhook Support to fapy-hook

> Linear: [BE-46](https://linear.app/yearn-webops/issue/BE-46/request-for-spec-estimated-apr-webhook-batching)
> Depends on: [BE-45](https://linear.app/yearn-webops/issue/BE-45/request-for-spec-kong-webhook-batching) (Kong webhook batching)

## Description

Upgrade fapy-hook to accept batched webhook payloads from Kong, processing multiple vaults in a single HTTP request instead of one vault per request. This reduces HTTP overhead and enables shared data fetching (e.g., Curve gauge/pool data fetched once per chain instead of once per vault).

## Context

**Current implementation:**
- `api/webhook.ts` receives a single-source payload from Kong with one `chainId`/`address` pair
- `src/output.ts:computeFapy()` processes one vault: fetches vault + strategies from Kong GraphQL, determines vault type (Curve vs Velodrome), computes APY
- `src/fapy.ts:computeChainAPY()` calls `fetchGauges()`, `fetchPools()`, `fetchSubgraph()`, `fetchFraxPools()` — these are called for every single vault request even though the data is chain-level, not vault-level
- `src/service.ts:getVaultWithStrategies()` fetches vault and strategy data from Kong's GraphQL API

**Current single-source payload:**
```json
{
  "abiPath": "yearn/2/vault",
  "chainId": 1,
  "address": "0xabc...",
  "blockNumber": "12345",
  "blockTime": "67890",
  "subscription": { "id": "S_C2795BC0", "url": "...", "abiPath": "...", "type": "timeseries", "labels": [...] }
}
```

**New batch payload (defined by BE-45):**
```json
{
  "abiPath": "yearn/2/vault",
  "subscription": { "id": "S_C2795BC0", "url": "...", "abiPath": "...", "type": "timeseries", "labels": [...] },
  "sources": [
    { "chainId": 1, "address": "0xabc...", "blockNumber": "12345", "blockTime": "67890" },
    { "chainId": 1, "address": "0xdef...", "blockNumber": "12345", "blockTime": "67890" },
    { "chainId": 10, "address": "0x123...", "blockNumber": "99999", "blockTime": "11111" }
  ]
}
```

**Relevant references:**
- Webhook handler: `api/webhook.ts`
- Output computation: `src/output.ts`
- Vault data service: `src/service.ts`
- APY computation: `src/fapy.ts`
- Curve data fetcher: `src/crv.fetcher.ts`
- Velodrome computation: `src/velo-like.forward.ts`
- Schemas: `src/types/schemas.ts`

## Tasks

### 1. Add Batch Payload Schema

- In `src/types/schemas.ts`, add:
  ```typescript
  const SourceSchema = z.object({
    chainId: z.number(),
    address: AddressSchema,
    blockNumber: z.bigint({ coerce: true }),
    blockTime: z.bigint({ coerce: true }),
  })

  export const KongBatchWebhookSchema = z.object({
    abiPath: z.string(),
    subscription: WebhookSubscriptionSchema,
    sources: SourceSchema.array(),
  })
  export type KongBatchWebhook = z.infer<typeof KongBatchWebhookSchema>
  ```

### 2. Add Batch Output Computation

- In `src/output.ts`, add a `computeFapyBatch(hook: KongBatchWebhook): Promise<Output[]>` function:
  - Group `hook.sources` by `chainId`
  - For each chain group, fetch shared chain data once:
    - Curve vaults: `fetchGauges()`, `fetchPools()`, `fetchSubgraph(chainId)`, `fetchFraxPools()` — called once per chain, not per vault
    - Velodrome/Aerodrome vaults: shared chain-level data fetched once
  - For each source in the group:
    - Call `getVaultWithStrategies(source.chainId, source.address)` to get vault + strategy data
    - Compute APY using the shared chain data
    - Build `Output[]` for this source (same logic as current `computeFapy`)
  - Concatenate all outputs across all sources
  - Handle individual source errors gracefully: log the error, skip the failed source, continue processing remaining sources

### 3. Update Webhook Handler

- In `api/webhook.ts`, modify `handler()`:
  - Detect payload type: check if `req.body.sources` exists
  - If batch payload: parse with `KongBatchWebhookSchema`, call `computeFapyBatch()`
  - If single-source payload: parse with `KongWebhookSchema`, call `computeFapy()` (current behavior)
  - Both paths return `Output[]` in the response
  - Signature verification remains the same (HMAC of the full body)

### 4. Optimize Shared Data Fetching

- Refactor `src/fapy.ts:computeChainAPY()` to accept pre-fetched chain data as an optional parameter:
  ```typescript
  export interface ChainData {
    gauges: Awaited<ReturnType<typeof fetchGauges>>
    pools: Awaited<ReturnType<typeof fetchPools>>
    subgraph: Awaited<ReturnType<typeof fetchSubgraph>>
    fraxPools: Awaited<ReturnType<typeof fetchFraxPools>>
  }

  export async function computeChainAPY(
    vault: GqlVault,
    chainId: number,
    strategies: Array<GqlStrategy>,
    chainData?: ChainData, // optional — fetch if not provided
  ): Promise<VaultAPY | null>
  ```
- When `chainData` is provided, skip fetching and use the pre-fetched data
- When `chainData` is not provided, fetch as before (backward compatible)
- In `computeFapyBatch()`, fetch chain data once per chain group and pass it to `computeChainAPY()` for each vault

### 5. Testing

- Add unit tests for:
  - `KongBatchWebhookSchema` validation (valid batch, empty sources, mixed chains)
  - `computeFapyBatch()` with multiple sources across chains
  - `computeFapyBatch()` with partial failures (one source errors, others succeed)
  - Webhook handler detecting and routing batch vs single payloads
  - Shared chain data reuse across vaults in same chain group
- Update existing tests to ensure single-source payloads still work

## Acceptance Criteria

- [ ] Single-source payloads continue to work exactly as before (backward compatible)
- [ ] Batch payloads with `sources` array are accepted and processed
- [ ] Each source in a batch produces correct APY outputs with correct labels (`crv-estimated-apr`, `velo-estimated-apr`, `aero-estimated-apr`)
- [ ] Chain-specific data (gauges, pools, subgraph, fraxPools) is fetched once per chain group, not per vault
- [ ] Individual source failures don't fail the entire batch — failed sources are skipped with logged errors
- [ ] Response contains combined `Output[]` from all successfully processed sources
- [ ] HMAC signature verification works with batch payloads
- [ ] Tests cover both single and batch flows

## Technical Notes

- **Vercel function timeout**: Vercel functions have a default timeout of 10 seconds (30s on Pro plan). Processing a batch of 50+ vaults may exceed this. Mitigations:
  - Parallelize vault processing within each chain group using `Promise.allSettled()`
  - If timeouts persist, Kong can split large batches into smaller chunks (configurable batch size on the Kong side)
  - Consider increasing the Vercel function timeout via `vercel.json` configuration
- **Error isolation**: Use `Promise.allSettled()` for per-source processing. Log failures with `console.error` including `chainId` and `address` for debugging. Return outputs only for successful sources.
- **Memory**: Processing many vaults in a single request increases memory usage. Monitor Vercel function memory limits and adjust if needed.
- **Backward compatibility**: The webhook must continue accepting single-source payloads indefinitely. Kong's batch mode is opt-in per subscription, and there may always be non-batch subscriptions.
- **Shared data caching**: The `fetchGauges()` and `fetchPools()` calls in `src/crv.fetcher.ts` are not chain-specific (they return global Curve data). These can be fetched once for the entire batch, not once per chain group. Only `fetchSubgraph(chainId)` is chain-specific.
