# Backend Remediation Register

Updated: 2026-11-27

| ID | Priority | Finding / work package | Evidence | Status | Next action |
|---|---|---|---|---|---|
| BE-001 | P0 | Diagnose failing Cloudflare/triad CI checks without guessing | PR #71 head `b9f2e63704e2add8227880a32a68ec1d5688a0dd`; failed checks exist, E2E skipped; connector did not return logs/annotations | BLOCKED | Restore Actions log access; inspect exact failing job output |
| BE-002 | P1 | Validate account-deletion outbox concurrent processing and retry semantics | `worker/account-lifecycle/workerLifecycleRuntime.ts`; migration `0005_account_lifecycle_permits_and_outbox.sql` has no explicit claim/lease columns | IN_PROGRESS | Model duplicate concurrent workers and determine whether existing RESEARCH_DB inbox idempotency fully protects USER_DB completion updates |
| BE-003 | P1 | Complete residual Express Firestore adapter retirement | CHK-194 continuation record | NOT_STARTED | Inventory live Express Firestore imports/routes and migrate one bounded repository at a time |
| BE-004 | P1 | Verify Docker local Worker + USER_DB and Google OAuth callback | CHK-194 continuation record | BLOCKED | Restore local runtime and execute callback integration test |

No production data changes, migrations, deployments, or merges were performed in this session.
| BE-005 | P1 | Reject completed research-erasure receipt replay when outbox ID is paired with a different subject key/version | Completed inbox fast path previously selected receipt fields only; now validates subject identity before replay | IMPLEMENTED_BUT_NOT_VERIFIED | Run focused test and Worker typecheck; verify no regressions |
| BE-006 | P1 | Prevent cross-subject data deletion when concurrent erasure deliveries reuse one outbox_id | D1 batch previously deleted events before INSERT OR IGNORE established the inbox identity; now claims first and guards deletes with exact outbox_id + subject_key + subject_key_version; deterministic concurrency regression added | IMPLEMENTED_BUT_NOT_VERIFIED | Run focused D1 test and Worker typecheck; inspect latest CI failures |
