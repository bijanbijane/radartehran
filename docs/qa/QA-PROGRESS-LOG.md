# Radar Tehran QA Progress Log

## 2026-11-27 — QA-WP-001: D1 triad CI coverage

- Repository: `bijanbijane/radartehran`
- Base: `main` at `456dcacb387b908797756863b10da1f7104b658e`
- QA branch: `qa/triad-regression-coverage-2026-11-27`
- Pull request: [#71](https://github.com/bijanbijane/radartehran/pull/71)
- Change: added `npm run test:triad` to the `test:cloudflare` script.
- Rationale: the existing CI workflow invokes `npm run test:cloudflare`, while the two D1 triad suites were previously reachable only through a separate script.
- Source inspection: confirmed `tests/rt-db-triad-001.test.ts`, `tests/rt-db-triad-002-forensic.test.ts`, and the `test:triad` script exist.
- Test execution: **not yet verified**. No local tests were run. The linked MacBook device was offline, and the available GitHub status/workflow-run queries returned empty results for the PR commit.
- Result: implementation recorded; CI verification pending. No test pass is claimed.


## 2026-11-27 — CI execution attempt and runner blocker

- Five PR-associated workflows reported `failure`: Tehran Radar CI Quality Gates, Path-Filtered Checks, Cloudflare Native Auth Validation, IRNI Geographic RPC Consumer Contract, and Backend Triad & Frontend Service Binding.
- The returned jobs had empty step arrays; job logs were unavailable (the log retrieval endpoint returned a missing-blob error).
- One rerun of the primary CI workflow was requested. It returned to `queued` and then failed again with zero reported steps.
- Classification: CI infrastructure/runner startup blocker suspected; exact root cause unconfirmed. No test assertions or test counts are available.
- Local execution remains unavailable because the linked MacBook device is offline.
- Work package remains blocked. No merge or deployment performed.


## 2026-11-27 — QA-002 / OP-194: Native-auth workflow script repair

- Updated `.github/workflows/cloudflare-native-auth-validation.yml` on PR #71 from the nonexistent `test:cloudflare-native-auth` script to the existing `test:auth` script.
- Confirmed the five test files run by the root `test:auth` script from the same QA branch's `package.json`.
- Code commit: `a488f9750211d9afec46d4ed33258c47e70171f2`; the corrected workflow content was fetched again from GitHub.
- Five PR workflows triggered after this commit still reported `failure` before exposing usable steps or logs: `45978898874`, `45978898800`, `45978898927`, `45978898737`, and `45978898828`. The exact cause is unconfirmed.
- No test commands or assertions were observed; test counts remain 0 executed. The connected MacBook runner is offline.
- Status: `IMPLEMENTED_BUT_NOT_VERIFIED`; no merge or deployment.


## 2026-11-27 — QA-WP-002: CI command/script contract repair

Static inspection of the actual workflow files and root `package.json` found three additional missing-command references:

- `.github/workflows/radar-backend-triad.yml` invoked `npm run test:geo`, but no such script exists; the existing geography catalog regression script is `test:geography-catalog`.
- `.github/workflows/irni-geographic-rpc-contract.yml` invoked `test:irni-geographic-rpc` and `typecheck:irni-geographic-rpc`, neither of which existed in `package.json`.

Corrections on the QA branch:

- Added `test:irni-geographic-rpc` to run the canonical route, RPC client, and v2 consumer test files with Node's test runner through tsx.
- Added `typecheck:irni-geographic-rpc` using the existing strict `tsconfig.irni-geographic-rpc.json` project.
- Replaced the stale `test:geo` reference with the existing `test:geography-catalog` script.

Read-back verification: confirmed both new package scripts exist and the backend workflow no longer contains the missing `test:geo` command. Execution verification remains pending because no usable local runner is connected and GitHub Actions logs have not been retrievable. No test pass is claimed.
