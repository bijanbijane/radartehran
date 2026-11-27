# QA Defect Register

No confirmed application defects have been reproduced in this QA session.

| Finding ID | Severity | Subsystem | Finding | Status |
|---|---|---|---|---|
| — | — | — | No confirmed application defects | — |

## Infrastructure findings (not application defects)

- **QA-INFRA-001 — GitHub Actions runner allocation failure**: Five PR-triggered workflow runs failed within 2–3 seconds. All five failed jobs had `runner_id: 0`, empty `runner_name`, and no steps. No logs were available. Root cause is unconfirmed; account billing/quota, repository Actions policy, and hosted-runner dispatch need investigation.

## Unverified observations

- The NIPS structural reference on main had no dedicated automated contract test. The regression suite has been added on the QA branch but remains unverified until the test actually executes.
- The persistent engineering memory contains historical stack statements that conflict with current AGENTS.md and the newer execution state. This is a documentation/state consistency concern, not a confirmed runtime defect.
