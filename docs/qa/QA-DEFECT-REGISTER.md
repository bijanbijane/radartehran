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
