# Radar Tehran QA — Next Actions

1. Verify that the latest Cloudflare Workers Preview selects npm, installs from `package-lock.json`, and reaches the frontend build command.
2. Restore a usable authorized local runner or obtain GitHub Actions runner diagnostics.
3. Verify the exact checkout and branch before executing commands.
4. Run `npm run test:auth`, `npm run test:triad`, `npm run test:irni-geographic-rpc`, and `npm run typecheck:irni-geographic-rpc`.
5. Run `npm run test:geography-catalog`, `npm run test:security`, and `npx tsx --test worker/db/writePause.test.ts`.
6. Run `npm run test:cloudflare`, the complete CI quality gates, and affected backend/IRNI workflows.
7. Inspect exact logs and record real test counts; classify failures by install, runner setup, typecheck, assertion, build, or infrastructure.
8. Keep PR #79 Draft and unmerged until all required gates pass and are reviewed. Do not deploy or apply production migrations.
