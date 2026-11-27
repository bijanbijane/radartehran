# QA Test Register

| Test ID | Layer | Scope | Command / Trigger | Status | Evidence |
|---|---|---|---|---|---|
| QA-T-001 | Contract / structural regression | NIPS 1.0.0 reference identity; 12 categories; 120 unique variables; declared counts; required metadata; null reference values; non-publication invariants | `npm run test:contracts` | Added; not executed | `tests/nips-golden-reference.test.ts`; wired into `package.json` and CI Gate C |
| QA-T-002 | CI integration | Confirm PR contract test is executed by GitHub Actions | PR #74 | Blocked before runner allocation | Run 45978213208; job runner_id=0; steps=[]; no logs |
| QA-T-003 | CI workflow startup | Verify configured workflows can allocate GitHub-hosted runners | PR #74 | Failed before execution | Runs 45978213210, 45978213295, 45978213292, 45978213208, 45978213244; all failed jobs runner_id=0 and steps=[] |

## Execution accounting

- Repository test commands actually executed: 0
- Test cases passed: 0
- Test cases failed: 0
- Test cases skipped by a test runner: 0
- CI workflow jobs rejected before runner assignment: 5
- E2E job skipped by dependency: 1
