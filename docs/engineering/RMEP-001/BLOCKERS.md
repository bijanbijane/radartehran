# RMEP-001 Blockers

## BLK-195-LOCAL-TEST-RUNTIME — HIGH — OPEN

The connected local Mac device is Offline. GitHub branch and file operations work, but this session cannot execute Node/TypeScript tests in the user's checkout. The targeted regression test is identified but has not been run. Do not label OP-194 verified until it passes.

## BLK-195-CI-LOG-ACCESS — MEDIUM — OPEN

Prior GitHub Actions checks on open backend PRs report failures, but the connected GitHub job-log endpoint returned `404 BlobNotFound` and supplied no step annotations. The root causes are not established. Retry via GitHub Actions UI or a functioning runner/log endpoint; do not infer failure causes from status alone.

## Authorization boundary

Production deployment, main merge, destructive production D1 operations, irreversible data changes, secret disclosure/rotation, and paid-service activation remain gated on explicit user approval.
