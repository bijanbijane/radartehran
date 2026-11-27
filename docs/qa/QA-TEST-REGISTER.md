# QA Test Register

## Test inventory

| Test ID | Layer | Scope | Command / Trigger | Status | Evidence |
|---|---|---|---|---|---|
| QA-T-001 | Contract / structural regression | NIPS 1.0.0 reference identity; 12 categories; 120 unique variables; declared counts; required metadata; null reference values; non-publication invariants | `npm run test:contracts` | Added; not executed | `tests/nips-golden-reference.test.ts`; five assertions/cases defined and wired on PR #74 branch |
| QA-T-002 | CI integration | Confirm NIPS contract suite executes in GitHub Actions | PR #74 | Blocked before runner steps | Latest observed PR #74 head `8c0213edb881943f546a526aa5ace2d55c30dc9c`; CI run `46011394071`; primary job `140547511625` has zero steps; Playwright skipped |
| QA-T-003 | CI workflow startup | Verify configured workflows allocate GitHub-hosted runners | PR #74 | Failed before execution | Current PR #74 head produced runs `46011394123`, `46011394061`, `46011394071`, `46011394037`, `46011394146`; each primary job has zero steps |
| QA-T-004 | D1 integration / isolation | D1 domain isolation, Worker bundle, frontend service binding | PR-triggered triad workflow | Blocked before test execution | Run `46011394061`; job `140547512423`; zero steps |
| QA-T-005 | Authentication | Cloudflare native auth regression | PR-triggered auth workflow | Blocked before test execution | Run `46011394037`; job `140547511241`; zero steps |
| QA-T-006 | Browser E2E / accessibility | Playwright user journeys and accessibility checks | CI dependency job | Skipped by dependency | Run `46011394071`; E2E job `140547530978` skipped because quality-gates job failed before steps |
| QA-T-007 | CI static contract audit | Compare workflow `npm run` invocations with root/workspace package scripts; inspect PR event branch filters | Static GitHub source audit | Static audit complete; not executed as a test | Base `main`: 16 workflows, 40 invocations, 4 missing script references. PR #79 fix branch: 16 workflows, 40 invocations, 0 missing references. PR #79 remains unmerged and runtime-unverified |
| QA-T-008 | Cross-PR runner startup | Check whether pre-step failures are isolated to QA PRs | PR #67 / PR #79 | Failure pattern reproduced; root cause unconfirmed | PR #79 current head `50e4394f6ffd9810dfacd3d18f25d55e9683c3e8`: runs `46016465354`, `46016465373`, `46016465319`, `46016465303`, `46016465456`; all five primary jobs have zero steps. Two inspected workflows on unrelated PR #67 also had zero steps |

## Execution accounting — latest inspected heads

- PR #74 head: `8c0213edb881943f546a526aa5ace2d55c30dc9c`.
- PR #79 head: `50e4394f6ffd9810dfacd3d18f25d55e9683c3e8`.
- Repository test commands actually executed in this QA session: 0.
- Test cases passed: 0.
- Test cases failed: 0.
- Test cases skipped by a test runner: 0.
- PR #74 primary workflow jobs failed before steps: 5.
- PR #74 dependent jobs skipped: 4 (one Playwright job and three path-filtered gates).
- PR #79 primary workflow jobs failed before steps: 5.
- PR #79 dependent jobs skipped: 4 (one Playwright job and three path-filtered gates).
- CI startup failures are not counted as test failures. Zero-step jobs provide no application test result.

## Cross-branch notes

- On PR #74, `test:contracts` includes `tests/nips-golden-reference.test.ts`; the suite has not executed.
- PR #79's CI command fixes are statically present but remain unmerged and runtime-unverified.
- PR #79's current head still has a root package manifest/lockfile Vitest version mismatch: `package.json` declares `^5.1.2`; `package-lock.json` root metadata declares `^3.0.8`. The lockfile is not in PR #79's changed-file list. No `npm ci` was run in this session.
- PR #79 also contains a `bun.lock` change; it does not resolve the observed npm manifest/lockfile mismatch.
- Keep static source inspection, fixture inspection, and actual test execution as separate evidence classes.
