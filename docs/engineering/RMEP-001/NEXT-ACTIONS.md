# Next Backend Actions

Priority order for the next active execution:

1. **Restore a test runner.** Reconnect the authorized MacBook checkout or obtain usable GitHub Actions job diagnostics. Confirm the exact repository, branch, and working tree before executing commands.
2. **Run the unverified Cloudflare/auth gates.** Execute `npm run test:auth`, `npm run test:triad`, `npx tsx --test worker/db/writePause.test.ts`, `npm run test:cloudflare`, and `npm run test:security`. Record exit codes and test counts; do not treat empty GitHub job payloads as passing tests.
3. **Run broad backend checks.** Execute root tests, frontend/API typechecks, `tsc --noEmit -p tsconfig.worker.json`, applicable builds, `npm run arch:check`, and the Wrangler dry-run. Diagnose each failure from its actual output.
4. **Continue Phase 6 data-plane retirement by domain.** Inventory each still-live Express Firestore repository, its mounted routes, D1 schema/ownership, and tests. Migrate one domain at a time only where a safe D1 model and rollback path exist; keep legacy reads/writes intact until parity is proven.
5. **Resolve external IRNI dependency before NIPS persistence.** Radar must consume IRNI's authenticated/versioned RPC contract; do not add a direct Radar binding to IRNI's physical D1 database or create another database.
6. **Keep Phase 6 PARTIALLY_VERIFIED** until all required test/build/runtime gates pass. Do not merge PRs, deploy, or apply production migrations without explicit authorization.
