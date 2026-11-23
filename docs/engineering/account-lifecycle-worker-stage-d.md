# Account Lifecycle Worker — Stage D

## Entrypoint

Main edge Worker: `worker/index.ts` (`wrangler.jsonc`). Frontend SPA Worker: `apps/frontend/wrangler.jsonc` (unchanged).

## HTTP API

`/api/v1/account/lifecycle/*` — `worker/routes/accountLifecycleRoutes.ts`

| Method | Path | Auth |
|--------|------|------|
| POST | `/deletion` | Verified user + fresh auth (≤600s) |
| GET | `/deletion/:jobId` | Owner or admin |
| POST | `/deletion/:jobId/continue` | Admin |
| POST | `/export` | Verified user (D1 job + bounded export) |
| GET | `/export/:id` | Owner |
| GET | `/privacy` | Verified user |
| PATCH | `/privacy` | Verified user |
| POST | `/privacy/consent` | Verified user |
| POST | `/privacy/consent/revoke` | Verified user |

## Composition

`worker/account-lifecycle/stageDLifecycleRuntime.ts` → dedicated `migrations/d1` D1 schema + `D1AccountLifecycleStore` + `AccountDeletionOrchestrator` + Worker adapters.

`workerLifecycleRuntime.ts` remains the separate USER_DB / RESEARCH_DB triad runtime and is not the Stage D Store composition.

## Queue

- Job type: `account_lifecycle_deletion_step`
- Payload: `{ jobId, targetUid, operation: 'DELETION_STEP' }`
- Producer: outbox in D1 (`account_lifecycle_dispatch_outbox`, migration `0007`)
- Consumer: `jobDispatcher.ts` → `executeBoundedDeletionStep`
- Scheduled recovery: `worker/index.ts` `scheduled` cron `0 * * * *` calls `recoverPendingLifecycleDispatch`

## Leases

`account_deletion_job_leases` — per-job token + fencing revision.

## Write block

- Shared policy: `mutationWriteBlockGuard.ts`
- Worker global: `workerApiWriteBlockGuard.ts` + `writeBlockWorkerGate.ts` (D1 write-block + mutation permits, migration `0008`)
- Express global: `expressMutationWriteBlockMiddleware.ts` on `/api` (journal store)
- Drain: `assertD1MutationDrainComplete` before queue deletion steps

## Deployment boundaries (hardening)

| Artifact | Name | Role |
|----------|------|------|
| `wrangler.jsonc` | `radartehran` | Combined SPA + API (unchanged prod shape) |
| `wrangler.backend.jsonc` | `radartehran-api` | API-only backend Worker (no `ASSETS`) |
| `apps/frontend/wrangler.jsonc` | `radartehran-frontend` | Frontend Worker (not modified) |

## Domain adapters (Worker D1)

`workerD1DomainAdapters.ts`: real deletes for `USER_PROFILE` (upload sessions, data requests), `MEDIA_METADATA` (D1 rows). Firestore-backed sources fail closed with `DOMAIN_ADAPTER_UNAVAILABLE`.

## Telemetry

`workerTelemetryErasureAdapter.ts` erases `account_lifecycle_audit` rows by `target_uid`.

## Identity

Worker remains fail-closed (`WORKER_IDENTITY_DELETION_BLOCKED`) pending trusted admin credentials.

## Hardening migrations (`migrations/d1`)

- `0007` dispatch outbox + per-job leases.
- `0008` D1 mutation permits and drain barrier.
- `0009` replay-resistant internal Write Admission RPC nonces.

The runtime verifies required tables and columns before serving Stage D routes. It refuses `USER_DB`-bound deployments because `migrations/user-d1` defines a different account lifecycle schema.

## Local tests

```bash
npm ci
npm run test:stage-d-lifecycle
npx wrangler d1 migrations apply radartehran-staging-db --local --env staging
npx tsx worker/account-lifecycle/d1WranglerLocalIntegration.test.ts
```

The queue worker verifies the durable write block, drains active mutation permits, and uses a fenced per-job lease. Scheduled recovery re-enqueues nonterminal jobs without a live lease. Firestore-authoritative domains and Firebase Auth identity deletion remain fail-closed until their trusted adapters are configured; no successful full-account deletion is claimed by the current Worker adapter set.