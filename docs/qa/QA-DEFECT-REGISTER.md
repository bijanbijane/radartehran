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
- Latest PR #74 head revalidated: `46474ee232e33f9d2e5a96963d87a68ba1307ae2`. Five primary GitHub Actions jobs failed before runner allocation; all returned zero steps and `runner_id=0`. The Playwright E2E job and dependent path-filtered jobs were skipped. No test cases executed.
- The five latest primary run IDs on this head are `46008767562`, `46008767663`, `46008767698`, `46008767526`, and `46008767500`. The CI quality-gates run's primary job completed in approximately one second with no steps; its E2E job was skipped.
- Check-run metadata exposes one annotation on each primary failed GitHub Actions check, but the GitHub connector rejected direct retrieval of the annotations subresource. Annotation contents remain unavailable; do not infer a root cause from the annotation count.
- Job-log retrieval and step summaries did not provide execution output. The root cause of the pre-runner failures remains unconfirmed.

## Application defects

No confirmed application runtime defects have been reproduced in this session. Functional behavior remains unverified because no test runner or local execution device was available.

## PR #79 review findings — current head `1907920698c24e950fbccc57cb80f7d5603205b0`

| Finding ID | Severity | Subsystem | Evidence | Status |
|---|---|---|---|---|
| QA-DEP-001 | HIGH | Dependency reproducibility | PR changes root `package.json` Vitest range to `^5.1.2`, while root `package-lock.json` still declares `^3.0.8` and resolves Vitest 3.2.7. The lockfile is not included in the PR changed-file list. | Confirmed manifest/lockfile mismatch; clean-install compatibility not executed in this session |
| QA-SEC-001 | HIGH (reported) | Dependency security | PR description reports `npm audit` found 22 advisories (14 moderate, 6 high, 2 critical); it identifies Vitest/tinypool among critical findings and says post-upgrade audit is pending. Audit JSON/advisory IDs were not independently retrieved in this QA pass. | Open; remediation and post-upgrade audit unverified |

Additional execution evidence: Cloudflare's PR comment reports the build for exact head `1907920` failed (build `0158ddf9-b519-44de-929a-4ac555403ffd`). This confirms the current head did not receive a successful build, but does not establish the failure cause. Earlier successful Preview deployments cited in PR comments belong to older commits and must not be generalized to the current head.

The latest GitHub Actions check-run metadata for PR #74 head `46474ee232e33f9d2e5a96963d87a68ba1307ae2` confirms five primary failures before any step ran; dependent jobs were skipped. Test counts remain zero.
