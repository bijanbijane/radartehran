# QA Defect Register — Radar Tehran

## QA-CI-001 — Main CI quality-gates failure

- **Severity:** HIGH (release confidence blocked; application impact not yet established)
- **Status:** Confirmed CI failure; root cause unresolved
- **Affected commit:** `456dcacb387b908797756863b10da1f7104b658e`
- **Workflow:** Tehran Radar CI Quality Gates
- **Run:** [45837739418](https://github.com/bijanbijane/radartehran/actions/runs/45837739418)
- **Failed job:** TypeScript, Architecture, Unit, Storage, Stress & Build (`139970977818`)
- **Dependent job:** Real Browser E2E & Accessibility Suite (Playwright) skipped (`139971000087`)
- **Additional failed checks:** staging API Worker build and frontend Worker build.
- **Expected:** All required CI checks complete with valid evidence; Playwright executes after prerequisites pass.
- **Actual:** Required quality-gates job failed; Playwright did not run; Worker build checks failed.
- **Reproduction:** Not yet performed locally.
- **Root cause:** Unknown. Job logs could not be retrieved (HTTP 404); run exposed no retained artifacts.
- **Impact:** Current mainline cannot be considered CI-verified. Browser behavior and accessibility are unverified for this commit.
- **Regression test:** To be determined after the failing command is identified.
- **Resolution:** Open.

Do not infer a source-code defect from a failed workflow conclusion alone. Classify after obtaining logs and reproducing the failing command.
