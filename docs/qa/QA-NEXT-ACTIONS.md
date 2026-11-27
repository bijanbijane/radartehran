# QA Next Actions

1. Restore a real command execution path: bring the authorized Desktop Commander device online or resolve GitHub-hosted runner allocation. Do not create repeated CI triggers while the pre-runner failure persists.
2. Keep PR #74 open and Draft; its NIPS contract suite is correctly wired on the QA branch. Once execution is available, run `npm run test:contracts` first and capture full output/exit code.
3. Review PR #79's four CI command fixes and PR event-filter correction. It statically resolves all 4 missing command references found across 16 main-branch workflow files / 40 npm invocations. Do not mark these defects resolved until PR #79 is merged and the workflows execute successfully.
4. After runner recovery, run focused auth, D1 triad, IRNI RPC, and geography suites; then lint/typecheck, full CI quality gates, build, and Playwright E2E/accessibility.
5. For each executed suite, record actual cases passed/failed/skipped and retain logs. Keep CI startup failures separate from test results.
6. Continue to use synthetic data and isolated environments. Do not run production migrations, mutate production data, deploy, or merge without explicit approval.
7. Update all six QA records after each meaningful package, preserving the latest verified commit SHA and exact blockers.
