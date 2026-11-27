# Remediation Register — RMEP-001

Updated: 2026-11-27
Repository: `bijanbijane/radartehran`
Active engineering branch: `feat/nips-backend-runtime-foundation-2026-11-26`
Baseline main commit: `456dcacb387b908797756863b10da1f7104b658e`
Active branch head: `9180bffe91577e9a53460fcf54e0058549813f0d`
NIPS PR: #67 (Draft)

## Active remediation items

| ID | Priority | Finding | Evidence | Status | Required remediation |
|---|---|---|---|---|---|
| RT-NIPS-001 | P1 | NIPS runtime foundation exists, but no persistent adapter, schema migration, HTTP route, or ingestion pipeline is wired. | `server/modules/neighborhood-profile/README.md`; PR #67; branch diff | IN_PROGRESS | Implement only behind the approved IRNI-owned storage RPC; preserve immutable snapshots and transactional compare-and-swap publication. |
| RT-CI-001 | P1 | Five PR #67 workflows fail; rerunning the root quality job still yields a failed job with no steps/log artifact. | Runs #45977620112, #45977620069, #45977619999, #45977620151, #45977620040; rerun job #140435161931; empty steps and `BlobNotFound` | BLOCKED | Diagnose Actions runner/platform execution first. Once steps/logs are available, isolate each failing gate and fix command-level causes. |
| RT-NIPS-002 | P1 | Storage ownership requires an authenticated, versioned NIPS RPC implemented by the database-owning IRNI Worker. Radar must not receive a direct binding to shared IRNI D1. | PR #67 body and `NIPS-BACKEND-IMPLEMENTATION-FOUNDATION-V1.md` | BLOCKED | Coordinate paired IRNI implementation and verify service identity, authorization, idempotency and transaction semantics before adding Radar adapter. |
| RT-NIPS-003 | P1 | The intended `IRNI_GEOGRAPHY` service binding/provider is not available to the Radar runtime. | PR #67 body and implementation tracker | BLOCKED | Verify live service deployment and implement a version-pinned provider adapter without importing Worker bindings into Node/Express. |
| RT-NIPS-004 | P2 | No end-to-end D1 concurrency or migration tests exist for NIPS persistence. | Repository port is an interface; no NIPS migration/adapter in PR #67 | NOT_STARTED | Add adapter-backed tests for immutable snapshots, FK constraints, duplicate publication IDs, CAS races, rollback and retry/idempotency after RPC exists. |
| RT-CI-002 | P1 | Native-auth and Bun lockfile fixes are isolated in PRs #69 and #70 but remain unverified. | Open Draft PRs #69 and #70; their associated Actions runs failed before returning usable step details | BLOCKED | Verify Actions runner execution; confirm Cloudflare preview selects npm, dependency installation succeeds, and frontend/API builds complete. |

## Safety constraints

- Do not create a fourth D1 database.
- Do not add a direct Radar API D1 binding to the shared IRNI-owned neighborhood database.
- Do not read or mutate IRNI-owned geographic registry tables through the NIPS persistence adapter.
- Keep USER_DB and RESEARCH_DB isolated.
- Do not seed or publish the Golden Reference as real neighborhood data.
- No production binding, migration, secret, or deployment change is authorized by this register.

## CI evidence limitation

The GitHub connector returned empty step summaries for the failed jobs and the job-log download returned `BlobNotFound`. The root quality-gate job was rerun; its replacement job also failed with an empty step list and missing log artifact. The exact failing command and root cause remain unverified. Do not classify this as an application-code defect until logs or reproducible local evidence establish it.


## CHK-197 evidence update — 2026-11-27

- **RT-CI-001:** The latest PR #67 head is `ee2023a59128a9bad17f37e144995b5a6d67bc1f`. The native-auth workflow's missing script invocation was corrected to `npm run test:auth` (commit `eb76b22590c70dc81ddff2189fc1cca459099d8d`). The stale `bun.lock` was removed and `.npmrc` added (commits `dd28ff9aa9c2946a60ae9fbd34630ac4d6ad5c5f`, `ee2023a59128a9bad17f37e144995b5a6d67bc1f`). These changes are implemented but not verified: five latest workflows still fail before exposing steps; logs remain unavailable with `BlobNotFound`.
- **RT-CI-002:** PR #70 independently carries the stale Bun lockfile remediation. Its Cloudflare frontend preview reported a successful build and deployment for commit `f05b6228de9e36b38b039cb60d407048a0067720`; this is evidence for that PR's preview only, not PR #67 or production. Keep PR #69/#70 Draft until their own checks and required preview builds pass.
- **RT-NIPS-001/002:** No runtime NIPS persistence adapter, schema migration, HTTP route, or ingestion pipeline has been implemented by this checkpoint. These remain dependent on the IRNI-owned authenticated/versioned RPC contract.
- **Verification boundary:** GitHub confirmed the content commits and file state. No npm test, TypeScript check, architecture check, D1 integration test, production migration, or deployment was executed in this session.


## CHK-198 — additional CI script audit

Static comparison of workflow invocations against root `package.json` found and corrected two more mismatches: added `test:irni-geographic-rpc` and `typecheck:irni-geographic-rpc` scripts for the existing client test and isolated tsconfig; replaced the nonexistent `test:geo` invocation with the existing `test:geography-catalog` script. The workflow files and package scripts were re-fetched after the commits and the references match. The new Actions runs still fail before exposing steps; therefore no workflow execution is marked passed.


## 2026-11-27 — New evidence and remediation

| ID | Evidence / correction | Status |
|---|---|---|
| RT-CI-005 | PR #71 branch removed stale `bun.lock` and corrected `test:geo` and nonexistent IRNI workflow scripts. Latest checks still fail; no runner logs available. | IMPLEMENTED_BUT_NOT_VERIFIED |
| RT-STG-001 | API staging Worker build deployed with no staging D1/IRNI Service Binding because validator warning did not fail the build. | CONFIRMED_DEFECT |
| RT-STG-002 | API staging Build Trigger now passes `--require-staging-provisioned` to validator before dry-run/deploy. Trigger is branch-scoped to the staging QA branch. Manual verification build remains queued. | IMPLEMENTED_BUT_NOT_VERIFIED |
| RT-SEC-001 | Successful Cloudflare npm install reports 21 vulnerabilities, including 2 critical; package-level details unavailable. | BLOCKED — audit details required |


| ID | New verification | Status |
|---|---|---|
| RT-STG-002 | Build `ee140164-3d69-49f8-8f22-7849d19e4e80` stopped at `BLOCKED_STAGING_DATABASES_NOT_PROVISIONED` before Wrangler dry-run/deploy. | COMPLETED_AND_VERIFIED |
| RT-SEC-001 | Build `f993d88e-1b92-4e41-9f62-83b1c3ea34b4` queued with `npm audit --json` enabled before fail-closed staging gate. | IN_PROGRESS — audit output pending |


| ID | Production evidence | Status |
|---|---|---|
| RT-IRNI-OWN-001 | Production API still binds IRNI-owned `NEIGHBORHOOD_DB` and `IRNI_PUBLISH_HMAC_SECRET`; no `IRNI_GEOGRAPHY` binding. The configured D1 write-pause deadline is expired. | BLOCKED — ordered owner-side RPC cutover required |
| RT-IRNI-OWN-002 | Cloudflare Worker `irni-api` does not exist (404/10007). IRNI read RPC PR #22 and NIPS persistence proposal PR #25 are Draft; ADR-0002 not accepted. | BLOCKED — owner-side implementation/deployment gate |


## 2026-11-27 — CI and dependency remediation follow-up

| ID | Evidence / change | Status |
|---|---|---|
| RT-CI-005 | Cloudflare build `cfd42e27-7b3c-449b-88e9-106cd042aa41` confirms npm ci lock mismatch with missing Vitest 5 peer subtree. | CONFIRMED |
| RT-CI-006 | `.npmrc legacy-peer-deps=true` already exists on PR #70; added to PR #69 and #71 branches. Fresh CI still fails but logs unavailable. | IMPLEMENTED_BUT_NOT_VERIFIED |
| RT-CI-007 | PR #70 Cloudflare frontend preview build succeeds; API staging build succeeds and uploads a staging version. Overall PR checks remain failing. | PARTIALLY_VERIFIED |
| RT-CI-008 | Staging Worker configuration does not inherit vars, D1 bindings, or service bindings; staging provisioning is explicitly blocked. | BLOCKED — configuration/ownership review required |
| RT-SEC-001 | Cloudflare build output reports 21 dependency vulnerabilities: 14 moderate, 5 high, 2 critical. Exact advisory inventory not retrieved. | BLOCKED — need full npm audit JSON/advisories before remediation |


## 2026-11-27 — Corrected CI failure classification

| ID | Evidence | Correct status |
|---|---|---|
| RT-CI-009 | Raw GitHub Actions job payloads for runs #45980050543/#569/#567, #45981733704/#721/#699/#944, #45986054574/#580/#549/#62082/#62301/#62055/#62053, and #45987535979 show runner_id=0, zero steps, blank runner name, immediate failure. PR #81 rerun attempt 2 repeats this. | BLOCKED — runner allocation before execution; no source test result |
| RT-CI-010 | Cloudflare build #cfd42e27-7b3c-449b-88e9-106cd042aa41 actually ran npm ci and returned EUSAGE with missing Vitest 5 peer entries. | CONFIRMED Cloudflare install failure |
| RT-CI-011 | PR #70 frontend preview build #3072ec23-b98d-476d-b247-498a45cc0989 succeeded. | COMPLETED_AND_VERIFIED for this preview build only |

Do not label GitHub Actions failures as source-code test failures unless a runner actually starts and executes steps.

## CHK-203 — dependency and ownership evidence update (2026-11-27)

| ID | Finding / evidence | Status | Required remediation |
|---|---|---|---|
| RT-SEC-001 | Exact audit JSON: 21 findings (14 moderate, 5 high, 2 critical). Critical dev-only packages: `vitest@3.2.7`, `tinypool@1.1.1`. High production paths: `firebase@12.19.0`, `@firebase/firestore@4.17.2`, `@grpc/grpc-js@1.9.16`, `sharp@0.33.5`. `firebase-admin@13.10.0` has moderate findings. | FINDINGS_INVENTORIED; FIX_NOT_STARTED | Map import/runtime reachability; migrate Firebase Admin/Firestore and Sharp consumers; choose compatible patched versions, regenerate lockfile, run all relevant tests. Major upgrades are indicated by audit; no force fix. |
| RT-CI-009 | PR #67 latest five runs on `93328807ff66153827cc05a4c6c72acabe6d4080` all fail before steps. Jobs have empty step arrays; log downloads return `BlobNotFound`. Existing raw job payload evidence shows `runner_id=0` and blank runner identity. | BLOCKED — GitHub Actions runner allocation | Wait for runner allocation recovery or obtain a connected Node executor; do not infer source failure. |
| RT-NIPS-OWN-003 | NIPS README and design-only SQL previously described the shared physical database inconsistently / referenced the superseded `radar-profile-db` target. Both now consistently describe `nips_*` logical tables inside IRNI-owned `radar-neighborhood-db`, with Radar access only through owner RPC. | COMPLETED_AND_VERIFIED — documentation only | Keep SQL design-only; require IRNI owner-side migration/RPC and acceptance tests before adapter or route work. |

**Verification boundary:** documentation was re-fetched from the active GitHub branch after commits. No package update, lockfile regeneration, runtime test, migration, deployment or merge occurred.


| RT-DATA-002 | Added a static architecture guard prohibiting Firebase client/Admin SDK imports in browser-facing source layers, with virtual-override tests for `firebase/auth`, `@firebase/app`, and `firebase-admin/firestore`. | IMPLEMENTED_BUT_NOT_VERIFIED — CI runner allocation blocked | Run `npm run arch:check` and `npm run test:contracts` when a runner/executor is available; then keep the guard active while legacy Express adapters are migrated separately. |
