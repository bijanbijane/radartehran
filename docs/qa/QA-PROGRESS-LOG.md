# Radar Tehran QA Progress Log

## 2026-11-27 — QA-WP-002: CI command contract repair

- Repository: `bijanbijane/radartehran`
- Base: `main` at `456dcacb387b908797756863b10da1f7104b658e`
- Isolated QA branch: `qa/ci-contract-fixes-2026-11-27`
- The earlier PR #71 branch had accumulated unrelated changes (including RMEP documentation and `bun.lock`). This clean branch was created from the exact main base to isolate QA scope.
- **QA-001:** Added `npm run test:triad` to `test:cloudflare`.
- **QA-002:** Changed Cloudflare Native Auth workflow from missing `test:cloudflare-native-auth` to existing `test:auth`.
- **QA-003:** Changed Backend Triad workflow from missing `test:geo` to existing `test:geography-catalog`.
- **QA-004:** Added `test:irni-geographic-rpc` and `typecheck:irni-geographic-rpc` scripts, matching the existing IRNI workflow contract and test/config files.
- Source read-back and runtime verification are separate. At this point only code changes have been written; tests have not been run.
- The connected MacBook runner is offline. Recent Actions job records have null step arrays; logs and diagnostic artifacts have not been retrievable.
- Test counts remain **0 executed / 0 passed / 0 failed / 0 skipped**. No test pass is claimed.
- No merge, deployment, production migration, secret rotation, or production data mutation was performed.


## 2026-11-27 — Runner allocation diagnosis and one controlled retry

- Inspected the raw GitHub Actions job payloads for all five workflows on PR #79. Each failed job had `runner_id=0`, an empty `runner_name`, and `steps=[]`; jobs completed in approximately 2–5 seconds.
- Affected runs: `45982139278` (CI Quality Gates), `45982139311` (Path-Filtered Checks), `45982139268` (Native Auth), `45982139346` (IRNI RPC), and `45982139324` (Backend Triad).
- This confirms runner allocation did not occur; none of the jobs reached checkout, npm install, typecheck, or test execution.
- Requested one controlled rerun of CI Quality Gates. Retry job `140448953174` repeated the same zero-runner, zero-step failure.
- Classification: GitHub-hosted runner allocation failure confirmed from API job metadata. No application test failure can be inferred.
- Further blind retries are paused until runner allocation changes. Local MacBook remains Offline.
