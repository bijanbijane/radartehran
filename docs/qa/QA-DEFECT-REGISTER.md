# QA Defect Register

No application runtime defect has been independently reproduced. The following CI configuration defects are confirmed by source inspection on the current `main` base; their corrections are present in PR #79 but are not merged or runtime-verified.

| Finding ID | Severity | Subsystem | Expected | Actual on main | Status |
|---|---|---|---|---|---|
| QA-CI-001 | MEDIUM | Native Auth CI | Invoke an existing auth test script | Workflow calls missing `test:cloudflare-native-auth`; available script is `test:auth` | Corrected in PR #79 branch; unmerged/unverified |
| QA-CI-002 | MEDIUM | IRNI RPC CI | Invoke existing RPC test and typecheck scripts | Workflow calls missing `test:irni-geographic-rpc` and `typecheck:irni-geographic-rpc` | Scripts added in PR #79; unmerged/unverified |
| QA-CI-003 | MEDIUM | D1 triad CI | Invoke an existing geography test script | Workflow calls missing `test:geo`; available script is `test:geography-catalog` | Corrected in PR #79 branch; unmerged/unverified |
| QA-CI-004 | LOW | Main CI PR trigger | Declare base-branch filters under `pull_request.branches` | A branch ref is placed under `pull_request.types`, so the intended base-branch filter is not configured correctly | Corrected in PR #79 branch; unmerged/unverified |

## Evidence and verification limits

- Main commit inspected: `456dcacb387b908797756863b10da1f7104b658e`.
- Static audit covered all 16 workflow files and 40 `npm run` invocations; four missing script references were found.
- Static audit of PR #79 head `1907920698c24e950fbccc57cb80f7d5603205b0` found zero missing script references across the same 16 workflows and 40 invocations.
- PR #79 remains open and Draft. Static source correction is not execution evidence.
- Latest PR #74 GitHub Actions runs on head `b9e43ded6f6ecb9675eafd3d3694dfbba64fe44d` failed before runner allocation; zero steps ran. No test failure or application defect is inferred from those runs.

## Application defects

No confirmed application runtime defects have been reproduced in this session. Functional behavior remains unverified because no test runner or local execution device was available.


## PR #79 review findings — current head `1907920698c24e950fbccc57cb80f7d5603205b0`

| Finding ID | Severity | Subsystem | Evidence | Status |
|---|---|---|---|---|
| QA-DEP-001 | HIGH | Dependency reproducibility | PR changes root `package.json` Vitest range from `^3.0.8` to `^5.1.2`, while the complete PR changed-file list contains no `package-lock.json` update. The PR description explicitly says lockfile regeneration and post-upgrade audit are pending. | Open; clean-install compatibility not executed in this session |
| QA-SEC-001 | HIGH (reported) | Dependency security | PR description reports `npm audit` found 22 advisories (14 moderate, 6 high, 2 critical); it identifies Vitest/tinypool among critical findings and says post-upgrade audit is pending. Audit JSON/advisory IDs were not independently retrieved in this QA pass. | Open; remediation and post-upgrade audit unverified |

Additional execution evidence: Cloudflare's PR comment reports the build for exact head `1907920` failed (build `0158ddf9-b519-44de-929a-4ac555403ffd`). This confirms the current head did not receive a successful build, but does not establish the failure cause. Earlier successful Preview deployments cited in PR comments belong to older commits and must not be generalized to the current head.

The GitHub Actions run set for PR #74 at head `a1e03d3983d2ef3d63d50017eea79399a8645d9c` also remains blocked before test execution: five primary jobs have zero steps; E2E and path-filtered dependent jobs were skipped. Test counts remain zero.
