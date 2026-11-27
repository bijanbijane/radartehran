# QA Defect Register

No confirmed application defects have been reproduced in the observed QA sessions. No application finding is marked resolved or self-remediated.

| Finding ID | Severity | Subsystem | Finding | Status |
|---|---|---|---|---|
| — | — | — | No confirmed application defects | — |

## Infrastructure findings (not application defects)

- **QA-INFRA-001 — GitHub Actions hosted-runner allocation failure**
  - **Classification:** CI infrastructure / pre-runner startup failure
  - **Severity:** BLOCKER for independent verification; not an application defect severity
  - **Latest evidence:** Runs 46004991418, 46004991653, 46004991515, 46004991666, and 46004991463. Each failed job reports `runner_id=0`, empty `runner_name`, and `steps=[]`; jobs completed in 1–2 seconds.
  - **Log evidence:** Primary CI job 140525806828 returns HTTP 404 `BlobNotFound`; no command output is available.
  - **Impact:** No repository test command executed; Playwright and path-filtered dependent gates were skipped. Mainline and PR #74 are not QA-verified by these runs.
  - **Root cause:** UNCONFIRMED. Account Actions billing/quota, hosted-runner eligibility, and repository Actions policy remain to be checked.
  - **Status:** Open; requires account/repository-level investigation.

## Unverified observations

- The NIPS structural reference regression suite is present on PR #74 with five cases and is wired into `npm run test:contracts`, but it has not executed in an allocated runner.
- The persistent engineering memory contains historical stack statements that conflict with current `AGENTS.md` and the newer RMEP execution state. This is a documentation/state consistency concern, not a confirmed runtime defect.
- D1, authentication, browser E2E, accessibility, and build behavior remain unverified by the latest CI runs because no runner was allocated.
