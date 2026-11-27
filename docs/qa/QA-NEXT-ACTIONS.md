# Radar Tehran QA — Next Actions

1. Restore a usable authorized local runner or obtain GitHub Actions job diagnostics.
2. Verify the exact checkout and branch before running commands.
3. Run `npm run test:auth`, `npm run test:triad`, `npm run test:irni-geographic-rpc`, and `npm run typecheck:irni-geographic-rpc`.
4. Run `npm run test:geography-catalog`, `npm run test:security`, and `npx tsx --test worker/db/writePause.test.ts`.
5. Run `npm run test:cloudflare`, the complete CI quality gates, and affected backend/IRNI workflows.
6. Inspect exact logs and record real test counts; classify failures by install, runner setup, typecheck, assertion, build, or infrastructure.
7. Keep the PR Draft and unmerged until all required gates pass and are reviewed. Do not deploy or apply production migrations.
