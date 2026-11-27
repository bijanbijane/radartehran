# Radar Tehran QA Progress Log

## 2026-11-27 — QA-WP-001

- Inspected repository metadata, default branch, current main commit, AGENTS.md, architecture policy, persistent engineering memory, execution state, package scripts, and CI workflow.
- Base branch: `main`; inspected base commit: `456dcacb387b908797756863b10da1f7104b658e`.
- Created isolated branch: `qa/radar-tehran-autonomous-qa-2026-11-27`.
- Added `tests/nips-golden-reference.test.ts` with five contract assertions for NIPS structural-reference identity, category and variable counts, uniqueness, metadata, and non-publication invariants.
- Updated `test:contracts` so the new suite runs through the existing CI Gate C contract-test command.
- Parsed the committed golden-reference JSON independently: 12 categories, 120 variables, 120 unique variable IDs, zero non-null values, zero incorrect reference statuses, and no missing required fields. This is fixture inspection, **not execution of the TypeScript test suite**.
- Five GitHub Actions workflows were observed failing before runner allocation. Jobs reported `runner_id=0`, empty runner name, and no steps. The E2E job was skipped because its dependency failed.
- Job-log retrieval for GitHub Actions did not provide test output. No test case execution is claimed.
- No confirmed application runtime defect has been reproduced. No production runtime, data, secrets, migration, or deployment was changed.

## 2026-11-27 — Workflow command contract audit

- Audited 16 workflow files and 40 `npm run` invocations on main commit `456dcacb387b908797756863b10da1f7104b658e`.
- Found four missing script references: native-auth test, two IRNI RPC scripts, and geography test command.
- PR #79 adds the missing scripts and corrects the workflow command references. Static source audit of PR #79 finds zero missing script references across the same 16 workflows and 40 invocations. This is not runtime verification.
- PR #74 and PR #79 remain open, Draft, and unmerged.

## 2026-11-27 — Hosted npm and TypeScript gate

- Cloudflare no-deploy build `133c1163-ed8f-4f6b-9c0d-de34177f13f3` completed successfully using Node.js `24.22.1` and npm `12.2.3`.
- `npm ci --ignore-scripts --no-audit --no-fund` added 646 packages.
- `npm run lint` (`tsc --noEmit`) completed successfully.
- This build did not execute Unit, Contract, Auth, Geography, Triad, IRNI, or E2E test suites.

## 2026-11-27 — Dependency audit result and focused test dispatch

- Polled the existing audit build `b1efc1f8-e256-4b99-80ae-421893c7ff10`; it had stopped with outcome `fail`, not remained queued.
- Retrieved the complete available audit-log section. `npm ci --ignore-scripts --no-audit --no-fund` succeeded and installed 646 packages; `npm audit --json` emitted a valid report and returned a non-zero status because vulnerabilities were present.
- Verified audit totals: **22 advisories — 14 moderate, 6 high, 2 critical**.
- Two Critical advisories are associated with `tinypool`: `GHSA-5gmw-xhrv-c9v3` and `GHSA-85c8-ppgw-ccpr`. The audit report marks the current Vitest dependency path Critical and suggests Vitest `5.1.2` as a major-version remediation path. Current PR #79 root manifest and lockfile remain aligned at `^3.0.8` / resolved `3.2.7`; no dependency upgrade was applied.
- The Cloudflare build failure is therefore an expected failing security gate after successful installation, not a failed dependency installation or runner allocation.
- Updated `QA-DEFECT-REGISTER.md` with this verified audit evidence and its limitations. No claim of runtime exploitability or remediation is made.
- Updated the branch-scoped Cloudflare QA trigger to run clean install followed by `test:auth`, `test:triad`, `test:irni-geographic-rpc`, and `test:geography-catalog`. Its branch filter remains limited to `qa/ci-contract-fixes-2026-11-27`; deploy command remains an echo-only no-op; build caching remains disabled.
- Dispatched focused test build `2c700586-8a6d-47b5-a6bd-c3dc14b593eb`. It completed with `build_outcome=success`; clean install added 646 packages and all four requested suites completed with zero failures. Exact totals: Auth 62/62, D1 Triad 49/49 (14 + 35), IRNI RPC 23/23, Geography Catalog 8/8. Overall: **142 passed, 0 failed, 0 skipped**. Deploy command was an echo-only QA no-op; no Worker deployment occurred.
- No GitHub PR was merged and no deployment, migration, or Production change occurred.

## Current test accounting

- NIPS TypeScript cases defined: 5; executed: 0.
- Focused auth/triad/IRNI/geography build `2c700586-8a6d-47b5-a6bd-c3dc14b593eb`: successful; 142 passed, 0 failed, 0 skipped.
- Dependency audit: executed; 22 advisories reported (14 moderate, 6 high, 2 critical); security gate remains open.
- npm clean install and TypeScript check: verified successful in build `133c1163-ed8f-4f6b-9c0d-de34177f13f3`.
- GitHub Actions failures before runner allocation are tracked separately and are not counted as failed test cases.


## 2026-11-27 — Focused hosted QA execution verified

- Build: `2c700586-8a6d-47b5-a6bd-c3dc14b593eb`; branch: `qa/ci-contract-fixes-2026-11-27`; Cloudflare Workers Builds; Node.js `24.22.1`; npm `12.2.3`.
- Clean install: `npm ci --ignore-scripts --no-audit --no-fund`; 646 packages added.
- `npm run test:auth`: **62 passed, 0 failed, 0 skipped**.
- `npm run test:triad`: RT-DB-TRIAD-001 **14 passed**; RT-DB-TRIAD-002 **35 passed**; combined **49 passed, 0 failed, 0 skipped**.
- `npm run test:irni-geographic-rpc`: **23 passed, 0 failed, 0 skipped**.
- `npm run test:geography-catalog`: **8 passed, 0 failed, 0 skipped**.
- Aggregate for this focused build: **142 passed, 0 failed, 0 skipped**.
- The run verifies the invoked test suites in this hosted environment. It does not establish official boundary accuracy, live Cloudflare/D1 integration, complete product E2E behavior, or Production readiness.
- The configured deploy command printed `QA verification only; no deployment requested.`; no Worker deployment was performed.
- NIPS golden-reference TypeScript suite on PR #74 remains unexecuted. GitHub Actions startup failures remain a separate unresolved infrastructure blocker.
- Dependency audit remains open with 22 findings; this test build deliberately used `--no-audit` and does not change the audit result.
