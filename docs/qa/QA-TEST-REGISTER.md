# QA Test Register

## Test inventory

| Test ID | Layer | Scope | Command / Trigger | Status | Evidence |
|---|---|---|---|---|---|
| QA-T-001 | Contract / structural regression | NIPS 1.0.0 reference identity; 12 categories; 120 unique variables; declared counts; required metadata; null reference values; non-publication invariants | `npm run test:contracts` | Implemented; execution pending | `tests/nips-golden-reference.test.ts`; five test cases defined and wired on PR #74 branch |
| QA-T-002 | Authentication | Browser session, Google OIDC, native D1 sessions, revocation, origin enforcement, Worker-to-Express assertion bridge | `npm run test:auth` | <span>VERIFIED: 62 passed</span> | Cloudflare Build `2c700586-8a6d-47b5-a6bd-c3dc14b593eb`; PR #79 branch |
| QA-T-003 | Database / integration regression | USER_DB and RESEARCH_DB isolation, consent, erasure, legal hold, k-anonymity, concurrency, rollback, R2 safety, D1 fail-closed behavior | `npm run test:triad` | <span>VERIFIED: 49 passed</span> | Same Cloudflare build; RT-DB-TRIAD-001: 14 passed; RT-DB-TRIAD-002: 35 passed |
| QA-T-004 | IRNI geographic RPC contract | Canonical route ownership, v1/v2 client guards, revision/checksum pinning, fail-closed service binding behavior | `npm run test:irni-geographic-rpc` | <span>VERIFIED: 23 passed</span> | Same Cloudflare build; PR #79 branch |
| QA-T-005 | Geography catalog regression | Legacy catalog authority classification, explicit city-to-province mappings, fail-closed unknown identifiers, namespaced legacy aliases | `npm run test:geography-catalog` | <span>VERIFIED: 8 passed</span> | Same Cloudflare build; PR #79 branch |
| QA-T-006 | CI workflow startup | Verify configured GitHub Actions jobs allocate runners and execute steps | PR-triggered workflows | BLOCKED before test execution | Latest inspected PR #74 and PR #79 workflow runs repeatedly failed before runner steps; no test-case result can be inferred |
| QA-T-007 | Browser E2E / accessibility | Playwright user journeys, responsive behavior, keyboard navigation, accessibility | `npm run test:e2e` and dedicated accessibility checks | NOT VERIFIED | GitHub Actions E2E jobs skipped after upstream jobs failed; no successful independent Playwright run recorded |
| QA-T-008 | CI static contract audit | Compare workflow `npm run` invocations with root/workspace package scripts; inspect PR event branch filters | Static GitHub source audit | Static audit complete; not runtime verification | Main: 16 workflow files, 40 invocations, 4 missing references. PR #79: same inventory, 0 missing references |
| QA-T-009 | Dependency security | Audit resolved dependency tree and classify advisories | `npm audit --json` | VERIFIED finding; gate OPEN | Cloudflare Build `b1efc1f8-e256-4b99-80ae-421893c7ff10`: 22 advisories (2 critical, 6 high, 14 moderate) |
| QA-T-010 | Install / TypeScript | Reproducible clean install and static typecheck | `npm ci --ignore-scripts --no-audit --no-fund && npm run lint` | VERIFIED | Cloudflare Build `133c1163-ed8f-4f6b-9c0d-de34177f13f3`; 646 packages; lint is `tsc --noEmit` |

## Latest execution evidence

**Focused hosted QA build:** `2c700586-8a6d-47b5-a6bd-c3dc14b593eb`

- Branch: `qa/ci-contract-fixes-2026-11-27`
- Runtime: Node.js `24.22.1`, npm `12.2.3`
- Install: `npm ci --ignore-scripts --no-audit --no-fund`; 646 packages added
- Auth: 62 passed, 0 failed, 0 skipped
- D1 Triad: 49 passed, 0 failed, 0 skipped
- IRNI geographic RPC: 23 passed, 0 failed, 0 skipped
- Geography catalog: 8 passed, 0 failed, 0 skipped
- **Aggregate: 142 passed, 0 failed, 0 skipped**
- Build outcome: `success`
- Deploy command was echo-only and explicitly did not deploy the Worker.

These are automated test results on the PR #79 QA branch. They do not establish real Production service behavior, official boundary accuracy, or complete GIS dataset correctness.

## Execution accounting

| Measure | Result |
|---|---:|
| Focused suites executed | 4 |
| Test cases passed | 142 |
| Test cases failed | 0 |
| Test cases skipped | 0 |
| NIPS TypeScript cases defined | 5 |
| NIPS TypeScript cases executed | 0 |
| Dependency advisories | 22 |
| GitHub Actions startup issue | Open |

## Cross-branch and verification notes

- PR #74 contains the NIPS golden-reference suite and wires it into `test:contracts`; it has not yet been executed.
- The successful focused suites ran on PR #79 branch. They validate code at that branch's checked-out commit, not PR #74's additional NIPS test changes.
- PR #74 and PR #79 remain open, Draft, and unmerged.
- GitHub Actions pre-runner failures are not counted as test failures.
- `npm ci` was run with `--ignore-scripts`; dependency lifecycle scripts were not executed. The focused tests are therefore validated under this controlled install mode, not a full lifecycle-enabled production install.
- The dependency audit is a separate run and remains a failing security gate; the successful focused build used `--no-audit`.
- Static source inspection, fixture inspection, and actual test execution remain separate evidence classes.
