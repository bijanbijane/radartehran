# Radar Tehran QA — Next Actions

1. Re-establish a usable local or GitHub Actions runner and obtain job-level diagnostics.
2. Execute `npm run test:auth`, `npm run test:triad`, `npm run test:irni-geographic-rpc`, and `npm run typecheck:irni-geographic-rpc`.
3. Execute `npm run test:geography-catalog` and `npx tsx --test worker/db/writePause.test.ts`.
4. Execute `npm run test:cloudflare`, then the relevant backend and IRNI workflows.
5. Inspect exact logs, record actual test counts, and classify any failure by setup, typecheck, test assertion, build, or infrastructure.
6. Continue with auth/security, D1 isolation, Worker dry-run, and browser E2E gates only after runner execution is available.
7. Keep PR #71 Draft and unmerged until all required gates are green and reviewed. Do not deploy or run production migrations.
