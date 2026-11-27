# Radar Tehran QA Defect Register

## QA-001 — D1 triad suites omitted from the Cloudflare CI command

- **Severity:** INFORMATIONAL (test-coverage gap; no runtime defect asserted)
- **Subsystem:** QA automation / npm scripts / GitHub Actions
- **Affected file:** `package.json`
- **Related CI file:** `.github/workflows/ci.yml`
- **Precondition:** CI runs the existing Gate G command `npm run test:cloudflare`.
- **Expected:** D1 triad regression suites are executed as part of the Cloudflare gate.
- **Actual before remediation:** `test:triad` existed as a separate script but was not invoked by `test:cloudflare`.
- **Evidence:** Root `package.json` defined `test:triad` for `tests/rt-db-triad-001.test.ts` and `tests/rt-db-triad-002-forensic.test.ts`; the CI workflow invokes `npm run test:cloudflare`.
- **Correction:** Added `npm run test:triad` to `test:cloudflare` on the QA branch.
- **Regression verification:** Pending GitHub Actions execution on PR #71.
- **Status:** Self-remediated in code; not independently verified by execution.


## QA-002 — Cloudflare Native Auth workflow calls a nonexistent npm script

- **Severity:** P1 (CI gate correctness)
- **Subsystem:** GitHub Actions / Cloudflare native auth
- **Affected file:** `.github/workflows/cloudflare-native-auth-validation.yml`
- **Expected:** The workflow invokes the root script that runs the native session, Google OIDC, and cookie-forwarding tests.
- **Actual before remediation:** The workflow ran `npm run test:cloudflare-native-auth`; the root `package.json` does not define that script.
- **Evidence:** The workflow and root `package.json` were fetched from PR #71. `test:auth` exists and runs the five auth/OIDC/session test files.
- **Correction:** Replaced the stale command with `npm run test:auth` on the existing QA branch.
- **Commit:** `a488f9750211d9afec46d4ed33258c47e70171f2`.
- **Regression verification:** GitHub read-back verified the YAML. Test execution remains pending because the latest Actions jobs exposed no steps/logs and the local runner is offline.
- **Status:** `IMPLEMENTED_BUT_NOT_VERIFIED`.


## QA-003 — Backend workflow calls a nonexistent geography script

- **Severity:** P1 (CI command contract)
- **File:** `.github/workflows/radar-backend-triad.yml`
- **Expected:** Invoke a script defined by root `package.json`.
- **Actual:** Workflow called `npm run test:geo`; root package scripts had no `test:geo` entry.
- **Correction:** Replaced it with the existing `npm run test:geography-catalog`.
- **Verification:** Initial read-back caught an accidental doubled suffix in the replacement; corrected in commit `4a20d2e84527d2aab7b3a28c2cc469ab702fa4ee`. Final GitHub read-back confirms the exact `npm run test:geography-catalog` command matches the package script. Execution pending.

## QA-004 — IRNI RPC workflow calls two nonexistent npm scripts

- **Severity:** P1 (CI command contract)
- **Files:** `.github/workflows/irni-geographic-rpc-contract.yml`, `package.json`
- **Expected:** The workflow's RPC test and isolated typecheck commands resolve to package scripts.
- **Actual:** `test:irni-geographic-rpc` and `typecheck:irni-geographic-rpc` were absent.
- **Correction:** Added the test script for the canonical route, RPC client, and v2 consumer suites; added strict typecheck using the existing `tsconfig.irni-geographic-rpc.json`.
- **Verification:** Package read-back confirms both entries. Execution pending.
