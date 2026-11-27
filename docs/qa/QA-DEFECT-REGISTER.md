# QA Defect Register

No application runtime defect has been independently reproduced. Confirmed CI configuration findings and dependency-security findings are tracked separately.

| Finding ID | Severity | Subsystem | Expected | Actual / Evidence | Status |
|---|---|---|---|---|---|
| QA-CI-001 | MEDIUM | Native Auth CI | Invoke an existing auth test script | Main workflow called missing `test:cloudflare-native-auth`; `test:auth` exists | Corrected in PR #79 branch; unmerged and GitHub Actions runtime-unverified |
| QA-CI-002 | MEDIUM | IRNI RPC CI | Invoke existing RPC test and typecheck scripts | Main workflow called missing `test:irni-geographic-rpc` and `typecheck:irni-geographic-rpc` | Scripts added in PR #79; unmerged and runtime-unverified |
| QA-CI-003 | MEDIUM | D1 triad CI | Invoke an existing geography test script | Main workflow called missing `test:geo`; `test:geography-catalog` exists | Corrected in PR #79 branch; unmerged and runtime-unverified |
| QA-CI-004 | LOW | Main CI PR trigger | Declare base-branch filters under `pull_request.branches` | A branch ref was incorrectly placed under `pull_request.types` | Corrected in PR #79 branch; unmerged and runtime-unverified |
| QA-SEC-001 | CRITICAL | Dependency security / test toolchain | No known Critical or High dependency advisories in the resolved tree | Fresh Cloudflare-run `npm audit --json` on PR #79 branch reported 22 advisories: 2 critical, 6 high, 14 moderate. Critical findings include Vitest/tinypool; npm identifies a major-version remediation path to Vitest 5.1.2. | OPEN — exact remediation requires compatibility review, lockfile update, test execution, and a fresh audit |

## Evidence and verification limits

- Main commit inspected: `456dcacb387b908797756863b10da1f7104b658e`.
- Static audit covered 16 workflow files and 40 `npm run` invocations; four missing script references were found on main.
- Static audit of PR #79 branch found zero missing script references across the same 16 workflow files and 40 invocations. This is source inspection, not workflow execution.
- PR #74 and PR #79 were last rechecked as open, Draft, unmerged. No merge or deployment was performed.
- PR #74 GitHub Actions jobs have repeatedly failed before runner allocation (`runner_id=0`, no steps). Such failures are not counted as failed test cases.
- No application runtime defect has been independently reproduced in this QA pass.
- A separate Cloudflare build completed `npm ci --ignore-scripts --no-audit --no-fund` and `npm run lint` successfully (Node 24.22.1, npm 12.2.3; 646 packages installed). This does not establish test-suite success.

## Dependency audit — verified

- Cloudflare Build: `b1efc1f8-e256-4b99-80ae-421893c7ff10`.
- Branch: `qa/ci-contract-fixes-2026-11-27`; trigger restricted to that QA branch.
- `npm ci --ignore-scripts --no-audit --no-fund` succeeded and installed 646 packages.
- `npm audit --json` completed and emitted a valid audit report; the command returned a failing build outcome because npm audit found vulnerabilities (this is an expected security-gate failure, not an install or runner failure).
- Summary: 22 total — 14 moderate, 6 high, 2 critical.
- Critical advisories reported in the output:
  - `GHSA-5gmw-xhrv-c9v3` — tinypool prototype-pollution gadget leading to remote code execution; affected range reported as `<=2.1.0`.
  - `GHSA-85c8-ppgw-ccpr` — tinypool prototype-pollution gadget in `run()` options; affected range reported as `<2.1.2`.
- The audit report marks Vitest as Critical because of the vulnerable transitive `tinypool` dependency. The current PR #79 root manifest declares Vitest `^3.0.8`; its lockfile resolves Vitest `3.2.7`. The audit suggests Vitest `5.1.2` as a major-version fix path. Do not apply a major upgrade without reviewing compatibility and committing a matching lockfile.
- High-severity findings include `@grpc/grpc-js` and Sharp-related dependency paths. The complete audit output is available in the Cloudflare build log; individual advisory reachability and production exposure have not been assessed here.
- The dependency tree includes development dependencies. The audit alone does not prove exploitability in the deployed runtime; it does establish an unresolved dependency-security gate.

## Application defects

No confirmed application runtime defects have been reproduced. Functional behavior remains incompletely verified because GitHub Actions has not allocated runners and the focused Cloudflare test build is still queued.

## Open QA blockers

1. Resolve or work around GitHub Actions pre-runner failures; preserve the distinction between workflow startup failures and test failures.
2. Execute focused auth, D1 triad, IRNI RPC, and geography suites on an isolated QA runner.
3. Review and remediate the 22 dependency advisories, prioritizing the two Critical Vitest/tinypool findings and six High findings.
4. Re-run `npm audit --json` after remediation and review any remaining advisories.
5. Execute NIPS contract tests on PR #74; fixture parsing is not a substitute for running the TypeScript test.

## Safety

Keep PR #74 and PR #79 Draft and unmerged until the relevant tests and reviews pass. No Production deployment, migration, secret rotation, destructive data operation, or merge is authorized by this QA work.
