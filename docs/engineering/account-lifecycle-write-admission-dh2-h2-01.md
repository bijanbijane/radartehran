# D-H2-01 — Unified Write Admission Authority

## Canonical D1 state

Table: **`account_write_blocks`** (migration `0004_account_lifecycle_core.sql`)

| Column | Role |
|--------|------|
| `target_uid` | User identity (PK) |
| `state` | `ACTIVE_WRITES_ALLOWED` ⇒ **OPEN**; other states ⇒ **CLOSED** |
| `active_deletion_job_id` | Job that closed admission |
| `reason` | Transition metadata |
| `revision` | Monotonic revision |
| `blocked_at_iso` / `updated_at_iso` | Timestamps |

**Semantics:** Missing row ⇒ **OPEN** (same as Worker D1 store today). Fail-closed on D1 read failure ⇒ **UNAVAILABLE**.

## Single authority

| Runtime | Path |
|---------|------|
| **API Worker** | `resolveWriteAdmissionFromD1` → `writeBlockWorkerGate.ts` |
| **Express** | `expressWriteAdmissionRpcClient.ts` → `POST /api/internal/v1/lifecycle/write-admission` → same D1 resolver |

Express **does not** use `FirestoreAndJournalAccountLifecycleStore` for HTTP mutation admission.

## Internal RPC

- **Path:** `POST /api/internal/v1/lifecycle/write-admission`
- **Auth:** HMAC-SHA256 (`writeAdmissionRpcAuth.ts`)
- **Env:** `LIFECYCLE_WRITE_ADMISSION_RPC_SECRET`, `LIFECYCLE_WRITE_ADMISSION_WORKER_BASE_URL` (Express); Worker binding `LIFECYCLE_WRITE_ADMISSION_RPC_SECRET`
- **Replay:** D1 `lifecycle_internal_rpc_nonces` (migration `0009`)

## Write Admission call-site inventory (D-H2-01A)

| Caller | Runtime | Authority | Journal for admission? |
|--------|---------|-----------|----------------------|
| `expressMutationWriteBlockMiddleware` | Express HTTP | Worker RPC → D1 | **No** |
| `writeBlockWorkerGate` | Worker HTTP | D1 `resolveWriteAdmissionFromD1` | No |
| `assertAccountMutationPermitted` | Tests / legacy store API | Passed-in store | Only if caller passes journal store |
| `deletionOrchestrator.assertUserWritePermitted` | Orchestrator / unit tests | Injected store (D1 or journal) | For orchestrator ops only, not Express HTTP gate |
| `durableJobStore.assertUserWritePermitted` | Journal store impl | Local journal | **Not used for Express HTTP mutations** |

Operational Express mutations: **RPC → D1 only**.

## TOCTOU (remaining)

Express may receive **OPEN**, then mutate Firestore/ disk after deletion closes D1 admission. This stage **does not** implement durable mutation permits/drain for Express cross-store writes. D-H2 permit/drain work is **next**.

## Direct Firestore client writes (not protected by this stage)

Global default in `firestore.rules` is `allow read, write: if false`, but explicit `match` rules grant client writes (e.g. `ResidentVote` with `userId == request.auth.uid`). Those paths **do not** consult D1 Write Admission. Express middleware does not intercept SDK writes. Inventory: search `allow create, update` in `firestore.rules` per collection; lifecycle write-block is **not** synchronized into rules in D-H2-01.