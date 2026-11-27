# QA Blockers

## Active

1. **GitHub Actions hosted-job startup failures — root cause unresolved**
   - PR #74 latest observed run set was triggered on parent head `46474ee232e33f9d2e5a96963d87a68ba1307ae2`: `46008767562`, `46008767663`, `46008767698`, `46008767526`, and `46008767500`.
   - Five primary jobs completed as failures with `runner_id=0`, empty runner names, and zero steps. Playwright E2E and dependent path-filtered jobs were skipped.
   - PR #79 head `1907920698c24e950fbccc57cb80f7d5603205b0` also has a failed path-filtered run `45994874018`: its `detect` job failed with `runner_id=0` and zero steps; three dependent jobs were skipped.
   - Check-run metadata reports annotations on primary failures, but the GitHub connector rejects the annotations subresource. Annotation content and exact startup cause remain unavailable.
   - These are pre-step infrastructure/job-start failures, not test failures. No tests or typechecks ran in these jobs.
   - Required investigation: repository/account Actions policy and hosted-runner availability/usage, plus GitHub Support if the annotations and account settings do not reveal a self-service cause.

2. **Local execution device unavailable**
   - Desktop Commander last reported `MacBook-Air.local` Offline.
   - GitHub repository APIs permit source inspection and commits but do not execute npm/Node/Wrangler/Playwright commands.
   - Therefore clean install, audit, unit/contract tests, typechecks, and browser tests cannot be run locally in this session.

3. **PR #79 dependency reproducibility and security gate remains open**
   - Exact current PR head `1907920698c24e950fbccc57cb80f7d5603205b0`: root `package.json` declares Vitest `^5.1.2`; root `package-lock.json` still declares `^3.0.8` and resolves `3.2.7`.
   - The lockfile is absent from the PR changed-file list. This is a confirmed manifest/lockfile mismatch; `npm ci` was not executed against this exact head.
   - PR description reports 22 npm audit advisories (14 moderate, 6 high, 2 critical); this report is not an independently retrieved audit artifact. The PR body itself says lockfile regeneration and post-upgrade audit are pending.
   - PR #79's earlier Cloudflare build evidence includes a successful Preview on a prior head, but the exact current head `1907920...` has a failed Cloudflare build. Neither older Preview success nor current build failure establishes behavior of a later, different commit.
   - Do not rewrite the lockfile manually or change dependency versions blindly. Complete a clean, controlled npm 12.2.3 lockfile update and post-upgrade audit in an actual Node/npm environment.

4. **CI command-contract corrections are not integrated**
   - Four confirmed missing workflow script references on `main` were corrected in PR #79.
   - Static audit on PR #79 head found zero missing script references across 16 workflow files and 40 `npm run` invocations.
   - PR #79 remains Draft/open/unmerged and the affected GitHub Actions jobs have not executed. Static correctness is not runtime verification.

## Not blockers

- Repository read/write access is available.
- PR #74 and PR #79 remain open, Draft, and unmerged.
- QA defect register was refreshed and verified at commit `eaadcede3a8cc90688c0084f837a4f170c497f8a`.
- No Production deployment, migration, secret rotation, destructive data operation, or merge was performed.

## Required next evidence

1. Obtain usable GitHub Actions startup diagnostics: check annotations via a supported path, inspect repository Actions settings/hosted-runner permissions and account usage, and escalate with the listed run IDs if necessary.
2. Restore an online local execution environment or a working hosted runner.
3. In that environment, resolve the exact PR #79 dependency tree with npm 12.2.3, regenerate the lockfile through npm (not hand editing), run `npm ci`/clean install and `npm audit --json`, and record the complete advisory IDs and residual severity.
4. Execute the NIPS golden-reference tests, auth, triad, IRNI RPC, geography, TypeScript, build, and Playwright/accessibility gates; retain logs and actual test counts.
5. Revalidate both PR heads after any change. Keep both PRs Draft/unmerged until required evidence passes and review is complete.

## Safety

Keep PR #74 and PR #79 open, Draft, and unmerged until the applicable execution gates pass and are reviewed. No Production deployment, migration, secret rotation, destructive data operation, or merge is authorized by this QA work.
