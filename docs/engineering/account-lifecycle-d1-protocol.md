# Account lifecycle D1 protocol (RT-ACCOUNT-LIFECYCLE-WORKERS-001-CV)

## Canonical workflow

`AccountDeletionOrchestrator` is the sole authoritative deletion engine. Express uses `canonicalDeletionService` + `expressServerDeletionBridge`; Workers must compose `D1AccountLifecycleStore` via `storeFactory` (`CLOUDFLARE_D1` only — no silent fallback to journal).

## Store selection

| Runtime | Store |
|---------|--------|
| Node Express | `NODE_EXPRESS_JOURNAL` (`durableJobStore.ts`) |
| Cloudflare Worker | `D1AccountLifecycleStore` + migrations `0004`–`0006` |

## Batch identity and idempotency

Keys: `buildBatchIdempotencyKey(jobId, domainSource, batchIndex, cursor)` — scoped to job, domain, batch index, and **pre-batch** cursor.

## Receipt / cursor consistency

1. Check D1 for existing `COMPLETED` batch receipt by idempotency key.
2. If absent, run idempotent domain `disposeOwnedRecordsBatch`.
3. **Durable** `commitJobProgressWithBatchReceipt`: idempotent receipt insert, then conditional job `UPDATE` (receipt must exist before cursor advance; resume skips execution if receipt already present).
4. On job update failure after receipt insert, fail closed with resumable `STORE_SNAPSHOT_CORRUPT` (external work is not re-run).

Cursor never advances without a matching durable receipt on the D1 path.

## Resume

`resumeDeletionJob` reloads from store; `prepareDeletionJobForResume` clears retryable failed steps; domain batches skip external work when receipt exists.

## Identity deletion order

After legacy supplement (if configured), telemetry (if adapter configured), dependent domains, media, retention domains — `assertAllDependentStepsCompletedBeforeAuth` then `runAuthIdentityDeletion`.

## Local real D1 test

```bash
npx wrangler d1 migrations apply radartehran-staging-db --local --env staging
npx tsx worker/account-lifecycle/d1WranglerLocalIntegration.test.ts
```

## Worker import boundary

Worker path must import `worker/account-lifecycle/*` and shared contracts under `server/modules/account-lifecycle/` that do not pull `node:fs`, Express, or `firebase-admin`. Node adapters stay behind `expressServerDeletionBridge`.