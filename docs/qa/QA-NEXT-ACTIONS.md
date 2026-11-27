# QA Next Actions

1. Poll Cloudflare focused test build `2c700586-8a6d-47b5-a6bd-c3dc14b593eb` until it stops. Capture install status, each suite's output, test counts, and exit code. Do not dispatch another build while this one is queued/running.
2. If the focused build runs, triage failures by suite and classify actual assertion failures separately from environment/startup failures. Add regression tests only for reproduced defects.
3. Run `npm run test:contracts` on PR #74 once a supported runner is available; its NIPS suite currently has five defined cases but zero executions.
4. Investigate GitHub Actions pre-runner failures using repository/account Actions policy and run annotations. Do not change workflow YAML to hide runner allocation failures.
5. Review all 22 npm audit advisories, prioritizing Critical Vitest/tinypool findings and six High findings. Review major-version compatibility before changing Vitest; update manifest and lockfile atomically, execute clean install and tests, then rerun audit.
6. After focused tests, extend execution to full Unit, Backend Integration, Frontend E2E/Playwright, GIS regression, Accessibility, and Performance suites using synthetic data and isolated environments.
7. Keep PR #74 and PR #79 Draft and unmerged until the relevant runtime checks and independent review pass.
8. No Production deployment, migration, destructive data operation, or merge without explicit authorization.
