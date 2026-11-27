# QA Next Actions

## In progress

1. Poll Cloudflare build `06f4dc2e-c773-4c75-8e3a-36841f3db2a0` to completion. It runs clean install, IRNI RPC typecheck, security regression tests, contract foundation tests, and architecture guardrails. Do not dispatch another build while it is queued/running.

## Highest priority after the current build

2. Review and remediate the 22 dependency advisories (2 Critical, 6 High, 14 Moderate). Inspect exact advisory paths and affected dependency versions; assess production versus development dependency exposure. Do not perform a blind major upgrade. Commit manifest and lockfile together, then run affected tests and a fresh `npm audit --json`.
3. Execute the five NIPS golden-reference TypeScript cases on PR #74. The fixture was structurally inspected, but the test itself remains unexecuted.
4. Investigate GitHub Actions pre-runner failures through an authorized Actions settings interface; inspect annotations, hosted-runner permissions, policy, and usage. Escalate with run IDs if no self-service cause is visible.
5. Expand beyond focused contracts to full Unit, Backend Integration, Frontend Playwright E2E, accessibility, responsive/cross-browser, GIS dataset, and performance suites.
6. For GIS, validate IRNI authoritative provenance, CRS, topology, boundary accuracy, geographic coverage, and property-to-neighborhood assignment. Current Geography Catalog tests only verify legacy identifier and authority guardrails; they do not certify official boundary geometry.
7. Verify live integration only against isolated non-Production resources with synthetic data; never run destructive tests against Production.
8. Keep PR #74 and PR #79 Draft and unmerged until all required runtime checks and independent reviews pass.

## Verified evidence

- Build `2c700586-8a6d-47b5-a6bd-c3dc14b593eb`: 142 passed, 0 failed, 0 skipped across Auth, D1 Triad, IRNI RPC, and Geography Catalog.
- Build `133c1163-ed8f-4f6b-9c0d-de34177f13f3`: npm clean install and TypeScript lint passed.
- Build `b1efc1f8-e256-4b99-80ae-421893c7ff10`: npm audit completed with 22 advisories; dependency security gate remains open.
- All Cloudflare QA builds use an echo-only deploy command; no Worker deployment was performed.
