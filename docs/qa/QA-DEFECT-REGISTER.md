# Radar Tehran QA Defect Register

## QA-001 — D1 triad omitted from Cloudflare Gate G

- Severity: P1 (regression coverage)
- Evidence: `test:triad` existed, but `test:cloudflare` did not invoke it.
- Correction: `npm run test:triad` added to `test:cloudflare`.
- Verification: package script wiring requires CI execution.

## QA-002 — Native Auth workflow referenced nonexistent script

- Severity: P1 (CI correctness)
- Evidence: workflow invoked `test:cloudflare-native-auth`; root package scripts define `test:auth`.
- Correction: workflow now calls `npm run test:auth`.
- Verification: static source change only; execution pending.

## QA-003 — Backend Triad workflow referenced nonexistent geography script

- Severity: P1 (CI correctness)
- Evidence: workflow invoked `test:geo`; package scripts define `test:geography-catalog`, not `test:geo`.
- Correction: workflow now calls `npm run test:geography-catalog`.
- Verification: static source change only; execution pending.

## QA-004 — IRNI Geographic RPC workflow script contract missing

- Severity: P1 (CI correctness)
- Evidence: workflow invokes `test:irni-geographic-rpc` and `typecheck:irni-geographic-rpc`, but neither script existed in `package.json`.
- Correction: added both scripts. The test script runs the existing canonical route, RPC client, and v2 consumer test files; typecheck uses existing `tsconfig.irni-geographic-rpc.json`.
- Verification: static source change only; execution pending.

## Scope note

All findings above are workflow/package command-contract defects. No claim is made that the underlying application tests pass or that GitHub Actions failures have been fully diagnosed.
