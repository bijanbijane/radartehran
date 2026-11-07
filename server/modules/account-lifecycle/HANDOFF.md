# Employee 7 — Account Export and Deletion Backend (`server/modules/account-lifecycle/`)

## 1. Exclusive Ownership & Boundaries
- **Owned Directory**: `server/modules/account-lifecycle/`
- **Zero External Mutations**: Does not modify `server.ts`, shared route registrations, `firestore.rules`, `firestore.indexes.json`, or any other employee module's source files.
- **Cross-Module Integration**: Connects strictly via published repository and service interfaces (`UserOwnedDomainRepositoryAdapter`, `MediaDeletionCoordinationAdapter`, `AuthIdentityDeletionAdapter`), with ready-made bridges for Employee 6 (`server/modules/media/`) and Employee 4 (`server/modules/crowd-data/`).

---

## 2. Durable Deletion Job State Machine

```text
                       +-----------------------------------+
                       |      INITIATED_WRITE_BLOCKED      |
                       | (Write block durably persisted)   |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |     PURGING_DEPENDENT_RECORDS     |
                       | (Bargains, Alerts, Sponsors,      |
                       |  Favorites, Profile in batches)   |
                       +--------+-----------------+--------+
                                |                 |
             (Batch error)      |                 | (All dependent steps COMPLETED)
                   +------------+                 +------------+
                   |                                           |
                   v                                           v
   +-------------------------------+           +-------------------------------+
   |   PARTIAL_FAILURE_RETRYABLE   | <-------+ |       CLEANING_UP_MEDIA       |
   | (Preserves resumableCursor;   |         | | (Coordinates Employee 6 media |
   |  never calls Auth deletion)   | --------+ |  deletion in bounded batches) |
   +---------------+---------------+  (Retry)  +---------------+---------------+
                   ^                                           |
                   | (Error)                                   | (Media step COMPLETED)
                   |                                           v
                   |                           +-------------------------------+
                   +-------------------------- |  APPLYING_RETENTION_POLICIES  |
                   |                           | (Crowd claims & compliance:   |
                   |                           |  purge vs anonymize/hold)     |
                   |                           +---------------+---------------+
                   |                                           |
                   | (Auth API error)                          | (All dependent + media
                   |                                           |  + retention COMPLETED)
                   |                                           v
                   |                           +-------------------------------+
                   +-------------------------- |    DELETING_AUTH_IDENTITY     |
                                               | (Firebase Auth deleted LAST)  |
                                               +---------------+---------------+
                                                               |
                                                               v
                                               +-------------------------------+
                                               |           COMPLETED           |
                                               | (Write state: ACCOUNT_DELETED)|
                                               +-------------------------------+
```

---

## 3. Complete User Data Export Specification
- **Schema Version**: `2026-05.account-export.v1` (`CompleteUserDataExportEnvelope`)
- **Supported User-Owned Domain Sources (`ALL_USER_OWNED_DOMAIN_SOURCES`)**:
  1. `USER_PROFILE`
  2. `FAVORITES_AND_WORKSPACES`
  3. `BUYER_ALERTS`
  4. `BARGAIN_LISTINGS`
  5. `SPONSOR_RECORDS`
  6. `CROWD_CLAIMS`
  7. `MEDIA_METADATA`
- **Bounded Pagination**:
  - `pageSize`: bounded between `1` and `50` (default `20`).
  - `maxPagesPerSource`: bounded between `1` and `500` (default `50`).
- **Cross-User Isolation**:
  - Actor must be the account owner (`actor.uid === targetUid`) or an administrator (`actor.isAdmin === true`).
  - Every record returned by every domain adapter is inspected for `item.ownerUid === targetUid`. Any mismatch immediately aborts with `AccountLifecycleError('CROSS_USER_DATA_LEAK_DETECTED')`.
- **Truthful Completeness Reporting**:
  - If all sources finish with `hasMore === false`, `completenessStatus` is `'COMPLETE'` (`isComplete: true`).
  - If any page fails or hits `maxPagesPerSource` while `hasMore === true`, `completenessStatus` is `'INCOMPLETE_PARTIAL'` (`isComplete: false`), `omittedOrFailedSources` lists the affected sources, `omittedPagesCount` increments, and `sourceReports[source]` records the exact `failedPageNumber`, `lastCursor`, and `failureReason`. Failed pages are **never** silently omitted.

---

## 4. Crash Recovery & Retention Policy Guarantees
1. **No In-Memory Authoritative Plan**:
   - `FirestoreAndJournalAccountLifecycleStore` reads and commits every job transition and cursor update atomically (`0o600` temp file + rename, synced to Firestore `account_deletion_jobs_v2` and `account_write_blocks_v2` when configured).
   - If the Node.js process crashes or restarts mid-job, calling `executeDeletionJob(actor, jobId)` on a new process instance reloads the durable journal and resumes from `step.resumableCursor`.
2. **Immediate Write Blocking**:
   - `initiateAccountDeletionJob` atomically creates the write-block record (`WRITE_BLOCKED_DELETION_IN_PROGRESS`).
   - Upstream routes call `assertUserWritePermitted(uid)` before accepting mutations; it throws `USER_WRITES_BLOCKED_BY_DELETION` (HTTP `423`).
3. **Permanent Deletion vs. Approved Retention Policies**:
   - Each domain step separately records `permanentlyDeletedIds` (`PERMANENTLY_DELETED`) and `retainedRecords` (`ANONYMIZED_RETAINED_POLICY` or `LEGAL_HOLD_RETAINED` with `retentionPolicyCode` and `retentionReason`).
4. **Strict Firebase Auth Deletion Ordering**:
   - `assertAllDependentStepsCompletedBeforeAuth(job)` verifies that every dependent domain step (`BARGAIN_LISTINGS`, `BUYER_ALERTS`, `SPONSOR_RECORDS`, `FAVORITES_AND_WORKSPACES`, `USER_PROFILE`, `CROWD_CLAIMS`) and `mediaStep` have durably reached `'COMPLETED'` before `authAdapter.deleteFirebaseAuthUser` is ever invoked.

---

## 5. Integration Handoff Guide for Route / Server Owners
- **Factory Import**:
  ```ts
  import {
    createAccountLifecycleFacade,
    createEmployee6MediaLifecycleAdapters,
    createEmployee4CrowdClaimsLifecycleAdapter,
  } from './server/modules/account-lifecycle/index.ts';
  ```
- **Write-Guard Hook**:
  Call `await lifecycle.deletionOrchestrator.assertUserWritePermitted(actor.uid)` in mutating user endpoints (Bargains, Buyer Alerts, Sponsors, Crowd Claims, Media Upload).
