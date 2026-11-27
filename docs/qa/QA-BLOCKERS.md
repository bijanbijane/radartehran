# QA Blockers

## Active blockers

1. **Dependency security gate — 22 advisories remain unresolved**
   - Cloudflare Build `b1efc1f8-e256-4b99-80ae-421893c7ff10` completed `npm audit --json` and reported 22 advisories: 2 Critical, 6 High, 14 Moderate.
   - Critical findings: `GHSA-5gmw-xhrv-c9v3` and `GHSA-85c8-ppgw-ccpr`, associated with the Vitest/tinypool dependency path.
   - Audit output suggests Vitest `5.1.2` as a major-version remediation path. No upgrade has been applied; compatibility and lockfile review are required first.
   - Audit findings do not by themselves prove exploitability in the deployed runtime. They do keep the dependency security gate open.
   - Next evidence: review all advisory IDs and dependency paths, determine runtime/dev exposure, implement compatible fixes with a matching lockfile, run affected tests, then rerun the audit.

2. **GitHub Actions jobs fail before runner allocation — root cause unresolved**
   - PR #74 and PR #79 have repeatedly triggered primary jobs that conclude before any runner steps execute (`runner_id=0`, no steps).
   - Dependent Playwright/path-filter jobs are skipped because prerequisite jobs fail.
   - This is a CI infrastructure/startup failure, not an application test failure.
   - The GitHub connector has not exposed usable annotations or job logs for the failing startup attempts. Account/repository Actions policy, hosted-runner permissions, and billing usage still need review through an authorized GitHub settings interface or Support escalation.
   - A separate Cloudflare hosted QA path is now working for focused test commands, so this blocker no longer prevents all test execution.

3. **NIPS golden-reference suite on PR #74 — execution pending**
   - Five TypeScript cases are defined in `tests/nips-golden-reference.test.ts` and wired into `npm run test:contracts`.
   - The suite has not yet been executed. JSON fixture parsing is not a substitute for executing the test.
   - A Cloudflare trigger dedicated to a second branch configuration could not be created because the API reported that a trigger already exists for that configuration. An attempted trigger update returned HTTP 500; subsequent read-back confirmed the original PR #79 trigger remained unchanged.
   - Next action: use an authorized isolated runner for PR #74, or arrange a supported separate trigger configuration without weakening the existing branch filter.

## Completed verification that is not a blocker

- Cloudflare Build `133c1163-ed8f-4f6b-9c0d-de34177f13f3`: clean npm install (646 packages) and TypeScript check completed successfully.
- Cloudflare Build `2c700586-8a6d-47b5-a6bd-c3dc14b593eb`: Auth 62/62, D1 Triad 49/49, IRNI RPC 23/23, Geography Catalog 8/8; aggregate **142 passed, 0 failed, 0 skipped**.
- Both builds used a no-deploy command. No Worker deployment occurred.
- PR #74 and PR #79 remain open, Draft, and unmerged.

## Remaining quality gaps (not yet established as defects)

- Full GIS dataset validation: authoritative IRNI provenance, CRS, geometry topology, boundary accuracy, coverage, and property-to-neighborhood assignment.
- Real service integration against isolated non-Production Cloudflare resources; current tests include local SQLite and contract/fail-closed tests and do not establish full live-service integration.
- Frontend Playwright E2E, responsive behavior, cross-browser, and accessibility testing.
- Load/performance baselines for API, map rendering, spatial queries, and background processing.
- Full Unit/Contract/Integration regression outside the focused suites.

## Safety

No Production deployment, migration, secret rotation, destructive data operation, or merge was performed. Keep both QA PRs Draft and unmerged until outstanding gates and independent review are complete.
