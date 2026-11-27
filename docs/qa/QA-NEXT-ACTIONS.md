# Radar Tehran QA — Next Actions

1. Poll Cloudflare Preview build `951d14a5-65c1-4912-9bcf-aee3136849f8` until it leaves `queued`; inspect package-manager selection, dependency installation, frontend build, and preview result.
2. Inspect GitHub check-run annotations for the five failed runs and verify repository/account Actions policy and billing/usage for the run date.
3. If the GitHub annotations do not identify a fix, open a GitHub Support request with the five run IDs, job IDs, repository URL, and workflow YAML; do not keep rerunning unchanged jobs.
4. Restore a usable authorized local runner or obtain GitHub Actions runner diagnostics.
5. Verify the exact checkout and branch before executing commands.
6. Run `npm run test:auth`, `npm run test:triad`, `npm run test:irni-geographic-rpc`, and `npm run typecheck:irni-geographic-rpc`.
7. Run `npm run test:geography-catalog`, `npm run test:security`, and `npx tsx --test worker/db/writePause.test.ts`.
8. Run `npm run test:cloudflare`, the complete CI quality gates, and affected backend/IRNI workflows.
9. Inspect exact logs and record real test counts; classify failures by install, runner setup, typecheck, assertion, build, or infrastructure.
10. Keep PR #79 Draft and unmerged until all required gates pass and are reviewed. Do not deploy or apply production migrations.
