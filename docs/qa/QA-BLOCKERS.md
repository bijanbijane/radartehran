# QA Blockers

## Active

1. **GitHub Actions hosted-job startup failures — root cause unresolved**
   - Latest complete run set on current PR #74 head `cb04de5c893e093666d1bde63f0e6672a5b42ff2` (2026-11-27 13:53 UTC): `46010987531` Native Auth, `46010986325` CI Quality Gates, `46010986332` IRNI RPC, `46010987152` Path-Filtered Checks, and `46010986381` Backend Triad/Frontend Binding. All five workflows concluded failure.
   - Their primary jobs have zero steps. The CI Playwright job and three Path-Filtered dependent jobs were skipped. No tests or typechecks ran.
   - The same failure pattern is not isolated to the QA PR: an unrelated PR #67 on head `a68465e4eec9ce26007ced11c43c548e1781a6c0` triggered run `46010999058` (Path-Filtered), `46010999035` (Native Auth), and additional workflows; the first two inspected primary jobs also failed with zero steps. This is cross-PR evidence of a repository/account-level Actions startup problem, but it does not identify the cause.
   - PR #79 head `1907920698c24e950fbccc57cb80f7d5603205b0` also has five failed workflow runs: `45994874018`, `45994873975`, `45994873954`, `45994873874`, and `45994873930`. The path-filtered detect job failed with zero steps and its three dependent jobs were skipped.
   - Check-run metadata reports annotations on primary failures, but the GitHub connector rejects the annotations subresource. Job log retrieval for the latest failures returns `BlobNotFound`. Annotation content and exact startup cause remain unavailable.
   - Repository Actions settings, hosted-runner permissions, and billing/usage endpoints are not exposed through the connected GitHub tool's permitted API surface; direct fetch attempts were rejected. This is a tooling/access limitation, not evidence that settings or quota are misconfigured.
   - Required investigation: inspect repository/account Actions policy and hosted-runner availability/usage through an authorized GitHub settings interface; if no self-service cause is found, escalate to GitHub Support with the run IDs above.

2. **Local execution device unavailable**
   - Desktop Commander last reported `MacBook-Air.local` Offline.
   - GitHub repository APIs permit source inspection and commits but do not execute npm/Node/Wrangler/Playwright commands.
   - Therefore clean install, audit, unit/contract tests, typechecks, and browser tests cannot be run locally in this session.

3. **PR #79 dependency reproducibility and security gate remains open**
   - Exact PR head `1907920698c24e950fbccc57cb80f7d5603205b0`: root `package.json` declares Vitest `^5.1.2`; root `package-lock.json` declares `^3.0.8` and resolves `3.2.7`. The lockfile is absent from the PR changed-file list.
   - This is a confirmed manifest/lockfile mismatch at the inspected head; `npm ci` was not executed against it in this session.
   - PR description reports 22 npm audit advisories (14 moderate, 6 high, 2 critical); this is a PR-reported result, not an independently retrieved audit artifact. The PR body says lockfile regeneration and post-upgrade audit remain pending.
   - PR #79 body records an earlier successful Cloudflare Preview on an older head, while the exact current head has a failed Cloudflare build. Do not generalize old Preview success to the current commit.
   - Do not rewrite the lockfile manually or change dependency versions blindly. Complete a controlled npm 12.2.3 lockfile update and post-upgrade audit in an actual Node/npm environment.

4. **CI command-contract corrections are not integrated**
   - Four confirmed missing workflow script references on `main` were corrected in PR #79.
   - Static audit on PR #79 head found zero missing script references across 16 workflow files and 40 `npm run` invocations.
   - PR #79 remains Draft/open/unmerged; its affected GitHub Actions jobs have not executed. Static correctness is not runtime verification.

## Not blockers

- Repository read/write access is available.
- PR #74 and PR #79 remain open, Draft, and unmerged.
- QA defect register was refreshed and verified at commit `eaadcede3a8cc90688c0084f837a4f170c497f8a`.
- No Production deployment, migration, secret rotation, destructive data operation, or merge was performed.

## Required next evidence

1. Obtain usable GitHub Actions startup diagnostics: inspect check annotations and repository/account Actions policy, hosted-runner availability, and usage through an authorized interface; escalate with the run IDs if necessary.
2. Restore an online local execution environment or a working hosted runner.
3. In that environment, resolve the exact PR #79 dependency tree with npm 12.2.3, regenerate the lockfile through npm (not hand editing), run clean install and `npm audit --json`, and record advisory IDs and residual severity.
4. Execute NIPS golden-reference tests, auth, triad, IRNI RPC, geography, TypeScript, build, and Playwright/accessibility gates; retain logs and actual test counts.
5. Revalidate both PR heads after any change. Keep both PRs Draft/unmerged until required evidence passes and review is complete.

## Safety

Keep PR #74 and PR #79 open, Draft, and unmerged until applicable execution gates pass and are reviewed. No Production deployment, migration, secret rotation, destructive data operation, or merge is authorized by this QA work.
