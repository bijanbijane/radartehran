# Account Lifecycle Worker — Stage D

## Entrypoint

Main edge Worker: `worker/index.ts` (`wrangler.jsonc`). Frontend SPA Worker: `apps/frontend/wrangler.jsonc` (unchanged).

## HTTP API

`/api/v1/account/lifecycle/*` — `worker/routes/accountLifecycleRoutes.ts`

| Method | Path | Auth |
|--------|------|------|
| POST | `/deletion` | Verified user + fresh auth (≤300s) |
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
- Drain: `countActiveD1MutationPermits` before queue deletion steps; deletion stops while any unexpired mutation permit remains active

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

Stage D is disabled by default. It requires both the explicit `STAGE_D_LIFECYCLE_ENABLED=true` opt-in and a dedicated `migrations/d1` D1 binding; it refuses `USER_DB`-bound deployments because `migrations/user-d1` defines a different account lifecycle schema. The runtime verifies required tables and columns and probes store health before serving Stage D routes.

## Local tests

```bash
npm ci
npm run test:stage-d-lifecycle
npx wrangler d1 migrations apply radartehran-staging-db --local --env staging
npx tsx worker/account-lifecycle/d1WranglerLocalIntegration.test.ts
```

The queue worker verifies the durable write block, drains active mutation permits, and uses a fenced per-job lease. Scheduled recovery re-enqueues nonterminal jobs without a live lease. The telemetry adapter fails closed when queue-partition ownership cannot be verified. Firestore-authoritative domains and Firebase Auth identity deletion also remain fail-closed until their trusted adapters are configured; no successful full-account deletion is claimed by the current Worker adapter set.

## Staging Provisioning Gate

Stage D is **not ready for staging activation** until the dedicated D1 resource is actually provisioned and the Worker binding is verified against the Cloudflare account inventory. A Wrangler configuration entry is not proof that the D1 database exists.

At the current PR review, the live `radartehran-api-staging` Worker has a `DB` binding pointing to D1 ID `9bcadfaf-7dc1-4ee9-b821-19c8b57658b4`, which Cloudflare returns as not found. The repository's staging `wrangler.jsonc` entry still contains an all-zero placeholder D1 ID. The account currently has no `radartehran-staging-db` or other dedicated Stage D lifecycle database.

Do not substitute `radar-user-db`: its existing account deletion jobs, write-blocks, permits, nonce, and user-data-request schemas are materially different from the Stage D `migrations/d1` contract. Do not bind Stage D to `radar-neighborhood-db` or `radar-researcher-db`. The Stage D runtime currently receives one D1 handle for its lifecycle store and domain adapters; provisioning an empty lifecycle DB alone does not make user-owned records in other stores available for erasure.

Before any staging binding or migration change, complete and review the data-ownership design for each deletion domain, provision the dedicated D1, apply the `migrations/d1` chain only to that dedicated resource, verify every required table/column and the live binding ID, and prove that all user-owned data sources are either erased or retained under an explicit policy. Keep `STAGE_D_LIFECYCLE_ENABLED` unset/false until this gate and the auth, telemetry, and identity-deletion adapter gates are complete. Production bindings and the shared IRNI geographic D1 are out of scope.

Tracking: https://github.com/bijanbijane/radartehran/issues/57.
