# Backend Remediation Register

Updated: 2026-11-27

| ID | Priority | Finding / work package | Evidence | Status | Next action |
|---|---|---|---|---|---|
| BE-001 | P0 | Diagnose failing Cloudflare/triad CI checks without guessing | PR #71 head `b9f2e63704e2add8227880a32a68ec1d5688a0dd`; failed checks exist, E2E skipped; connector did not return logs/annotations | BLOCKED | Restore Actions log access; inspect exact failing job output |
| BE-002 | P1 | Validate account-deletion outbox concurrent processing and retry semantics | `worker/account-lifecycle/workerLifecycleRuntime.ts`; migration `0005_account_lifecycle_permits_and_outbox.sql` has no explicit claim/lease columns | IN_PROGRESS | Model duplicate concurrent workers and determine whether existing RESEARCH_DB inbox idempotency fully protects USER_DB completion updates |
| BE-003 | P1 | Complete residual Express Firestore adapter retirement | CHK-194 continuation record | NOT_STARTED | Inventory live Express Firestore imports/routes and migrate one bounded repository at a time |
| BE-004 | P1 | Verify Docker local Worker + USER_DB and Google OAuth callback | CHK-194 continuation record | BLOCKED | Restore local runtime and execute callback integration test |

No production data changes, migrations, deployments, or merges were performed in this session.
