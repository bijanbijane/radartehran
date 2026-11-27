# Active Engineering Blockers

## BLK-CI-RUNNER-001 — GitHub Actions jobs fail before step execution

- **Status:** BLOCKED
- **Severity:** HIGH
- **Observed on:** PR #71, head commit `a488f9750211d9afec46d4ed33258c47e70171f2`.
- **Evidence:** The five workflow runs associated with the commit reported failure: `45978898737`, `45978898927`, `45978898828`, `45978898874`, and `45978898800`. Returned job payloads contain `steps: null` and `logs_url: null`; the log-download endpoint previously returned `404 BlobNotFound`.
- **Impact:** No workflow test assertion has been executed or observed. The cause is not established; do not label it an application test failure or assert that GitHub itself is at fault without diagnostic evidence.
- **Unblock:** Obtain an Actions run with real job steps/logs or retrieve the platform-level job annotation through an execution environment that exposes it.

## BLK-LOCAL-RUNNER-001 — Linked local checkout is unavailable

- **Status:** BLOCKED
- **Severity:** HIGH
- **Evidence:** Desktop Commander device `MacBook-Air.local` (`ae251c1c-bfb2-441d-8716-ffa91b6e4ae5`) reported Offline.
- **Impact:** Local npm, TypeScript, Wrangler, and integration suites could not be executed in this session.
- **Unblock:** Restore the authorized MacBook runner and confirm its repository checkout and branch before running commands.

## Deployment boundary

Production deployment, production database migrations, destructive data operations, secret rotation, and paid-service activation remain outside this session's authorization. No such action has been taken.
