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

## QA-005 — Cloudflare Workers Build selected stale Bun lockfile

- Severity: P1 (Preview build blocked before project build command)
- Evidence: Cloudflare Workers Build `bdf2e772-1133-486a-98bf-f1d26c81355a` selected `bun install --frozen-lockfile` because the repository contains `bun.lock`; Bun reported the lockfile was out of sync with the root manifest (`@tailwindcss/vite` dependency-group mismatch). The lockfile also identifies the root workspace as `react-example`, while the root package manifest is `radartehran`, and its root dependency groups differ materially.
- Correction: remove the stale Bun lockfile and explicitly pin the repository's existing npm lockfile workflow to `npm@10.9.2` in the root package manifest.
- Verification: GitHub source read-back and a fresh Cloudflare Preview build are required. This edit does not claim a successful install or build.
