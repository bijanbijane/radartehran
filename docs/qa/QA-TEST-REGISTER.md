# QA Test Register

| Test ID | Layer | Scope | Command / Trigger | Status | Evidence |
|---|---|---|---|---|---|
| QA-T-001 | Contract / structural regression | NIPS 1.0.0 reference identity; 12 categories; 120 unique variables; declared counts; required metadata; null reference values; non-publication invariants | `npm run test:contracts` | Added; not executed | `tests/nips-golden-reference.test.ts`; five test cases; wired into `package.json` and CI Gate C |
| QA-T-002 | CI integration | Confirm PR contract test is executed by GitHub Actions | PR #74 | Blocked before runner allocation | Latest CI run 46004991666; job 140525806828; runner_id=0; steps=[]; logs BlobNotFound |
| QA-T-003 | CI workflow startup | Verify configured workflows can allocate GitHub-hosted runners | PR #74 | Failed before execution | Runs 46004991418, 46004991653, 46004991515, 46004991666, 46004991463; each failed job runner_id=0 and steps=[] |
| QA-T-004 | D1 integration / isolation | D1 domain isolation, Worker bundle, frontend service binding | PR-triggered triad workflow | Blocked before test execution | Run 46004991515; job 140525805246 failed before runner allocation; no test steps |
| QA-T-005 | Authentication | Cloudflare native auth regression | PR-triggered auth workflow | Blocked before test execution | Run 46004991653; job 140525805946 failed before runner allocation; no test steps |
| QA-T-006 | Browser E2E / accessibility | Playwright user journeys and accessibility checks | CI dependency job | Skipped by dependency | Run 46004991666; E2E job 140525822947 skipped because quality-gates job failed before runner allocation |

## Execution accounting — latest observed session

- Repository test commands actually executed: 0
- Test cases passed: 0
- Test cases failed: 0
- Test cases skipped by a test runner: 0
- CI jobs failed before runner assignment: 5
- Dependent CI jobs skipped: 4 (one Playwright job and three path-filtered gates)
- CI startup failures are not counted as test failures.


| QA-T-007 | CI static contract audit | Compare every workflow `npm run` invocation with root/workspace package scripts; inspect PR event branch filters | Static GitHub source audit | Static audit complete; not executed as a test | Main: 16 workflow files, 40 invocations, 4 missing script references. PR #79 branch: same 16 files and 40 invocations, 0 missing references. PR #79 remains unmerged; no Actions job executed. |

## Cross-branch note

- On the QA branch for PR #74, `test:contracts` correctly runs both `engineering-quality-foundation.test.ts` and `nips-golden-reference.test.ts`.
- The `main` base branch still lacks that NIPS test wiring until PR #74 is accepted; this is an intentional PR change, not a defect in the QA branch.
- The PR #79 CI contract fixes are statically present but remain unmerged and runtime-unverified.
