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
