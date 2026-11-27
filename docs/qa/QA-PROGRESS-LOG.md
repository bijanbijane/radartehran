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


## 2026-11-27 — Public GitHub status cross-check

- Checked GitHub's public status page after confirming `runner_id=0` on all five workflow jobs.
- The status page currently lists Actions as operational and reports no incident for November 27, 2026.
- Therefore the observed runner allocation failure cannot be attributed to a declared GitHub-wide Actions outage. A repository/account-specific runner eligibility, usage-limit, or configuration issue remains possible but unverified.
- Source: https://www.githubstatus.com/ (checked 2026-11-27).


## 2026-11-27 — Cloudflare Workers Build dependency-manager diagnosis

- Retrieved the Cloudflare Workers Build record and full available log for build `bdf2e772-1133-486a-98bf-f1d26c81355a` (commit `ee9d0d31b17089aa5a3fa9707688c0df0050dfd5`).
- The build environment initialized and cloned the repository successfully, restored caches, detected Bun 1.4.4, then ran `bun install --frozen-lockfile`.
- Bun stopped before `npm run build -w radartehran-frontend` because the frozen lockfile did not match the root manifest; it specifically identified `@tailwindcss/vite` as belonging to a different dependency group.
- Static comparison found the Bun lockfile's root workspace name `react-example` versus manifest name `radartehran`, plus mismatched root dependency groups. Cloudflare selected Bun despite the repository's npm package scripts because `bun.lock` was present.
- Remediation: delete the stale Bun lockfile and pin `packageManager` to `npm@10.9.2`, matching the npm version observed in the Cloudflare build image. The repository already has `package-lock.json`.
- Pending: a fresh Preview build must confirm npm selection, dependency installation, and frontend compilation. No runtime test or build pass is claimed.


## 2026-11-27 — Follow-up execution verification

- Rechecked the latest Cloudflare Preview build `951d14a5-65c1-4912-9bcf-aee3136849f8` for observed head `757322b10e5090b2889a208e1a041c1298b48912`. It remains `queued`; only `Initializing build environment...` is present. Two superseded Preview builds were stopped as `skipped`. Cloudflare account build-minute limit reports `has_reached_build_minutes_limit=false`.
- Rechecked five GitHub Actions runs on the same observed head. All five fail before runner allocation (`runner_id=0`, empty runner name, zero steps). No test, typecheck, checkout, or install command executed.
- Verified the QA branch is 26 commits ahead and 0 behind `main`; the compare reports exactly 10 changed files: two workflow files, root package.json, six QA docs, and deletion of the stale 1,663-line bun.lock. The deleted Bun lockfile was the only large deletion.
- Verified root `packageManager` is exactly `npm@10.9.2`, root `package-lock.json` identifies `radartehran`, the stale `bun.lock` returns 404 on the QA branch, and the relevant workflow scripts exist in the branch.
- Official Cloudflare guidance confirms the root `packageManager` field selects the package-manager version, while the repository lockfile determines which package manager is used. Removing `bun.lock` while retaining `package-lock.json` therefore aligns the project with npm; the new build is still required to verify this operationally.
- Root cause of GitHub runner rejection remains undetermined. Check-run annotations and Actions settings/billing endpoints were not available through the connected GitHub API. No tests were run; no pass is claimed.
