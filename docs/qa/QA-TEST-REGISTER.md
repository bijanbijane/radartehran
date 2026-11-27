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

- PR #74 head at this update: `ea91cfcd6fe5fc76784cda97df98b722835792b4`.
- PR #79 head at this update: `9a6d650fa53e0ca9a5e3b3cf533c5375f516cc34`.
- Repository unit/contract/integration test commands executed in this QA session: 0.
- Unit/contract/integration test cases passed: 0.
- Unit/contract/integration test cases failed: 0.
- Test cases skipped by a test runner: 0.
- Separate hosted validation on PR #79: `npm ci --ignore-scripts --no-audit --no-fund` completed successfully (646 packages); `npm run lint` (`tsc --noEmit`) completed successfully. Cloudflare build `133c1163-ed8f-4f6b-9c0d-de34177f13f3`, stopped with outcome `success`. These are install/typecheck checks, not unit/contract test cases.
- PR #74 primary workflow jobs failed before steps: 5.
- PR #74 dependent jobs skipped: 4 (one Playwright job and three path-filtered gates).
- PR #79 primary workflow jobs failed before steps: 5.
- PR #79 dependent jobs skipped: 4 (one Playwright job and three path-filtered gates).
- CI startup failures are not counted as test failures. Zero-step jobs provide no application test result.

## Cross-branch notes

- On PR #74, `test:contracts` includes `tests/nips-golden-reference.test.ts`; the suite has not executed.
- PR #79's CI command fixes are statically present but remain unmerged and runtime-unverified.
- PR #79 head `9a6d650fa53e0ca9a5e3b3cf533c5375f516cc34` has matching root Vitest ranges in `package.json` and `package-lock.json` (`^3.0.8`); the lock resolves `3.2.7`. The manifest was aligned to the committed lockfile; no lockfile regeneration was needed for that correction. `npm ci` has since passed in the hosted validation build.
- PR #79 also contains a `bun.lock` change; it does not resolve the observed npm manifest/lockfile mismatch.
- Keep static source inspection, fixture inspection, and actual test execution as separate evidence classes.


## 2026-11-27 — Hosted install and TypeScript verification

- PR #74 remains open, Draft, unmerged at `ea91cfcd6fe5fc76784cda97df98b722835792b4`; PR #79 remains open, Draft, unmerged at `9a6d650fa53e0ca9a5e3b3cf533c5375f516cc34`.
- Cloudflare no-deploy build `133c1163-ed8f-4f6b-9c0d-de34177f13f3` cloned the PR #79 branch, detected Node.js `24.22.1` / npm `12.2.3`, completed `npm ci --ignore-scripts --no-audit --no-fund` (646 packages added), and ran `npm run lint` (`tsc --noEmit`) successfully. Build outcome: `success`; deploy command only echoed a QA-only message. No deployment occurred.
- A separate build `b1efc1f8-e256-4b99-80ae-421893c7ff10` was queued to run a fresh `npm audit --json`; it remained queued at the last poll and produced no audit evidence. No audit status or advisory count is inferred.
- Unit, contract, security, triad, geography, auth, and IRNI tests remain unexecuted. GitHub Actions startup failures remain unresolved.
- Next: obtain the audit build result; then execute focused test suites on the working hosted path. Keep both PRs Draft and unmerged.
