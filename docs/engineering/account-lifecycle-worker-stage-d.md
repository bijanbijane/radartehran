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

`worker/account-lifecycle/workerLifecycleRuntime.ts` exposes the current HTTP-driven deletion flow through `executeAccountDeletionLifecycle`. It blocks writes, disables the account identity, performs USER_DB cleanup, and records research erasure work in the durable `research_erasure_outbox`. The hourly Worker schedule processes that research-erasure outbox.

## Queue status

The older Stage D lifecycle-step queue contract is **not registered in the canonical Worker queue dispatcher**:

- Local contract label: `account_lifecycle_deletion_step`
- Payload shape: `{ jobId, targetUid, operation: 'DELETION_STEP' }`
- The generic `RadarQueueJobType` registry and `validateQueueEnvelope` do not accept this job type.
- Unsupported messages are rejected and retried (or routed to the DLQ when configured); they must not be treated as completed work.
- `D1AccountLifecycleDispatch` and lease tables are currently exercised as a persistence adapter/test surface; a production producer-to-consumer execution chain is not wired through `worker/index.ts`.

Do not publish lifecycle-step messages until a dedicated consumer is implemented, registered, and covered by a real Worker integration test. The active HTTP deletion flow and the research-erasure outbox are separate from this unregistered legacy queue contract.

## Leases

`account_deletion_job_leases` — per-job token + fencing revision; the persistence adapter is present, but production queue consumption is not yet connected.

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

## Hardening migrations

- `0007` dispatch outbox + leases
- `0008` mutation permits

## Local test

```bash
npx wrangler d1 migrations apply radartehran-staging-db --local --env staging
npx tsx worker/account-lifecycle/phaseDLifecycleWorker.test.ts
```