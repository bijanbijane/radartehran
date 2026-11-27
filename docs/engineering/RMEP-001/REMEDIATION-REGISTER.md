# Backend Remediation Register

Updated: 2026-11-27
Repository: `bijanbijane/radartehran`
Active branch: `codex/backend-resume-2026-11-27`
PR #78 remains Draft. No merge, deployment, production D1 mutation, or secret operation is authorized.

| ID | Priority | Finding / work package | Evidence | Status | Next action |
|---|---|---|---|---|---|
| BE-001 | P0 | Diagnose hosted GitHub Actions runner allocation failure | Issue #49; PR #67/#78 jobs fail with `runner_id=0`, empty runner name, zero steps | BLOCKED | Resolve account-level Actions availability, billing/usage and policy; do not infer source failures |
| BE-002 | P1 | Validate account-deletion outbox concurrent processing and retry semantics | `worker/account-lifecycle/workerLifecycleRuntime.ts`; USER_DB outbox schema | IN_PROGRESS | Complete deterministic race coverage and run it |
| BE-003 | P1 | Complete residual Express Firestore adapter retirement | CHK-194 continuation record | NOT_STARTED | Migrate one confirmed live adapter at a time with domain-owned D1 schema and parity tests |
| BE-004 | P1 | Verify Docker local Worker + USER_DB and Google OAuth callback | CHK-194 continuation record | BLOCKED | Restore local runtime and execute callback integration test |
| BE-005 | P1 | Reject completed research-erasure receipt replay when outbox ID is paired with a different subject key/version | Completed inbox fast path now validates subject identity before replay | IMPLEMENTED_BUT_NOT_VERIFIED | Run focused test and Worker typecheck |
| BE-006 | P1 | Prevent cross-subject data deletion when concurrent erasure deliveries reuse one outbox_id | Inbox identity is claimed first; destructive deletes are guarded by exact outbox_id + subject_key + subject_key_version; deterministic regression added | IMPLEMENTED_BUT_NOT_VERIFIED | Run focused D1 test and Worker typecheck |
| BE-007 | P1 | Prevent stale research-erasure worker from downgrading completed USER_DB outbox item | Catch-path retry update is status-fenced and reconciles a competing COMPLETED row | IMPLEMENTED_BUT_NOT_VERIFIED | Run focused triad test/typecheck |
| BE-008 | P1 | Retire mounted legal-regulatory Firestore persistence without weakening transactional guarantees | Confirmed live mount; ten logical collections; D1 migration design authored; owning binding not approved | DESIGN_COMPLETE / IMPLEMENTATION_BLOCKED | Confirm owning D1 binding; implement and parity-test D1 transaction runner before cutover |
| BE-009 | P1 | Prevent stale unavailable-RESEARCH_DB worker from downgrading completed outbox item | Retry update is status-fenced; attempt_count increments atomically; canonical completion is read when update affects zero rows | IMPLEMENTED_BUT_NOT_VERIFIED | Run focused RT-DB triad test and Worker typecheck |
| BE-010 | P1 | Prevent concurrent failed workers from losing outbox retry attempts | Retry updates previously wrote a stale scanned attempt_count; both retry paths now use atomic SQL increments and row-derived exponential backoff; success update is status-fenced; deterministic regression added | IMPLEMENTED_BUT_NOT_VERIFIED | Run TRIAD-001 and typecheck on exact PR head |
| BE-011 | P1 | Wire research consent revocation barrier into active HTTP/Queue runtime | Consent migrations and permit primitives exist, but active HTTP/Queue ingestion does not acquire permits; event inserts omit consent_revision/fence checks; privacy route does not start/reconcile revocation; TRIAD-003 tests are dormant | IN_PROGRESS | Implement permits, revision-scoped fencing/erasure, revocation job orchestration, route integration and activate six-scenario tests |
 
## Verification boundary

The code and test changes in BE-005 through BE-010 have been source-reviewed but not executed in this session. The latest PR #78 CI runs on code head `d0faff86e79dde909faeb3cacbfa57e65e55ae37` failed before runner assignment; they provide no TypeScript, test, build or browser evidence. The connected local execution device remains Offline.

No production data changes, migrations, deployments, merges, or secret operations were performed.
| BE-011 | P1 | Complete RT-DB-TRIAD-003 leased research consent revocation barrier | Direct HTTP + Queue permits, revision-tagged RESEARCH_DB writes, durable revision-scoped revocation outbox, lease draining/recovery, fence-backed erasure, recent-auth account reconcile route, deterministic concurrent IDs, expected-revision CAS, post-drain registry rescan and activated seven-scenario suite | IMPLEMENTED_BUT_NOT_VERIFIED | Run npm run test:triad and Worker/API typechecks when a runner is available; fix only observed failures |
| BE-012 | P1 | Make consent revocation intent unique and CAS-safe under concurrent privacy mutation | Migration 0008 unique (uid, revoked_consent_revision); deterministic revocation/outbox IDs; expected revision CAS; cancel unapplied stale intent; block unrelated privacy mutations while draining | IMPLEMENTED_BUT_NOT_VERIFIED | Run triad suites and migration/typecheck when a runner is available |


## Latest verification boundary (2026-11-27)

PR #78 head `7b4330e19603327aca6c662e3b43db2f8b606cf7` triggered runs 45996050993 (Quality Gates), 45996051002 (Backend Triad), 45996050998 (Native Auth), and 45996051233 (Path-Filtered Checks). Primary jobs report runner_id=0, empty runner_name and zero steps; downstream jobs are skipped. These runs provide no TypeScript, test, build or browser evidence. Issue #49 tracks the account-level runner allocation blocker. PR #78 remains Draft; no production data, migration, deployment, merge or secret operation occurred.
