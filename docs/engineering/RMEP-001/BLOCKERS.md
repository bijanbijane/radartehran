# RMEP-001 Blockers

## BLK-195-LOCAL-TEST-RUNTIME — HIGH — OPEN

The connected local Mac device is Offline. GitHub branch and file operations work, but this session cannot execute Node/TypeScript tests in the user's checkout. The targeted regression test is identified but has not been run. Do not label OP-194 verified until it passes.

## BLK-195-CI-LOG-ACCESS — MEDIUM — OPEN

Prior GitHub Actions checks on open backend PRs report failures, but the connected GitHub job-log endpoint returned `404 BlobNotFound` and supplied no step annotations. The root causes are not established. Retry via GitHub Actions UI or a functioning runner/log endpoint; do not infer failure causes from status alone.

## Authorization boundary

Production deployment, main merge, destructive production D1 operations, irreversible data changes, secret disclosure/rotation, and paid-service activation remain gated on explicit user approval.


## RT-DB-TRIAD-003 consent revocation barrier — verification status

- Implementation is integrated: leased research-processing permits, durable revocation jobs, revision-scoped erasure, and RESEARCH_DB consent fences.
- The TRIAD-003 regression suite is wired into npm run test:triad, but it has not been executed in this session. Keep status IMPLEMENTED_BUT_NOT_VERIFIED until the suite, TypeScript checks, and Worker build pass.
- Migration migrations/user-d1/0011_research_consent_revocation_uniqueness.sql adds indexes only. It has NOT been applied to any remote database. Validate existing duplicate rows and run it only in an approved, controlled migration process.
- GitHub Actions job logs remain unavailable in this session; prior failed checks do not establish test failures or root cause.
