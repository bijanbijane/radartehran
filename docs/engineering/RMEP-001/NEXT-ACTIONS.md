# Next Actions — RMEP-001 Backend

Updated: 2026-11-27
Active branch: `feat/nips-backend-runtime-foundation-2026-11-26`
PR: #67 (Draft)
Main baseline: `456dcacb387b908797756863b10da1f7104b658e`
Active branch head: `9180bffe91577e9a53460fcf54e0058549813f0d`

## Ordered execution queue

1. **Resolve Actions execution visibility.** Latest PR #67 runs #45977620112, #45977620069, #45977619999, #45977620151 and #45977620040 all concluded FAILURE. Rerunning the root quality-gate job succeeded as an API operation but produced another failed job (`140435161931`) with no steps and `BlobNotFound` logs. Inspect GitHub Actions UI/runner availability; do not patch application code without a reproducible command failure.
2. **Verify the NIPS domain foundation.** Run `npm run test:nips`, applicable TypeScript checks, architecture checks and security gates in an executable environment. Source presence and PR metadata do not count as test execution.
3. **Reconcile adjacent CI PRs.** PR #69 corrects the auth test script; PR #70 removes the stale Bun lockfile. Keep both Draft until GitHub Actions executes actual steps and Cloudflare preview install/build confirms npm selection and successful builds.
4. **Implement the paired IRNI NIPS storage RPC.** This is owner-side work in `bijanbijane/Iran-Neighborhood-Intelligence`: version pinning, service authentication, least-privilege operations, request validation, idempotency, bounded payloads and transactional publication activation.
5. **Implement the Radar adapter.** Keep the domain boundary runtime-neutral. Radar must call the IRNI storage RPC; it must not bind directly to the shared IRNI D1 database.
6. **Add migration and adapter tests.** Use the approved `migrations/neighborhood-d1` ownership path; verify immutable snapshots, constraints, transactional CAS, rollback and retry semantics in local/staging only.
7. **Add read API and authorization.** Expose only approved public snapshots through the allow-list serializer. Add separately authorized internal/admin operations; do not mount write routes before ownership and authorization tests pass.
8. **Prove neighborhood coverage.** Enumerate all eligible canonical neighborhoods from the approved registry revision. Create structural profiles with explicit gaps only after runtime and storage are verified. Never invent observations or treat the Golden Reference as real data.
9. **Reconcile execution records.** Update state, progress, remediation, blockers and next-action records after each verified work package.

## Immediate next action

Open the failed rerun job `140435161931` in GitHub Actions and establish why the job has no returned steps/log artifact. If this is a runner/platform failure, restore CI execution first; then rerun the five PR #67 workflows and diagnose the first real command-level failure.


## CHK-197 — Current exact next actions

1. **Resolve GitHub Actions execution visibility.** Latest PR #67 head is `ee2023a59128a9bad17f37e144995b5a6d67bc1f`. All five associated workflows conclude FAILURE, but jobs return empty/null steps and logs return `BlobNotFound`. Inspect GitHub Actions UI/runner availability or obtain valid log access; do not modify application code based on a failure with no executed-step evidence.
2. **Verify the two CI/build remediations.** The native-auth workflow now uses the existing `npm run test:auth` script. The stale `bun.lock` is removed and `.npmrc` aligns npm 10 installation with the committed lockfile. Both changes are committed but not yet verified by CI/Cloudflare preview on PR #67.
3. **Execute local gates when a runner is available:** `npm run test:nips`, `npm run typecheck`, `npm run arch:check`, `npm run test:auth`, `npm run test:cloudflare`, and the D1 triad/write-pause tests.
4. **Continue NIPS persistence only through the IRNI owner boundary.** Build the authenticated/versioned NIPS storage RPC and its owner-side additive migration in IRNI; Radar must not receive a direct D1 binding to the shared neighborhood database.
5. **Implement Radar's RPC adapter only after the owner contract is executable.** Add request validation, service identity, idempotency, bounded payloads, immutable snapshot writes, CAS publication activation and integration tests.
6. Keep PR #67 Draft; no merge, production deployment, remote migration, or secret change without explicit approval.


## CHK-198 — updated immediate queue

1. Resolve Actions runner/job initialization and restore step/log visibility; the latest run set still fails with null steps and `BlobNotFound`.
2. Re-run the exact workflow commands after runner access is restored: `npm run test:auth`, `npm run test:irni-geographic-rpc`, `npm run typecheck:irni-geographic-rpc`, `npm run test:geography-catalog`, plus the root CI and D1 triad suites.
3. Run NIPS foundation tests, TypeScript and architecture gates; fix only reproducible failures.
4. Continue the IRNI-owned NIPS storage RPC and Radar RPC adapter only within the approved ownership boundary. No direct Radar D1 binding.


## 2026-11-27 — Updated immediate queue

1. Verify Cloudflare staging build `ee140164-3d69-49f8-8f22-7849d19e4e80` reaches stopped/fail at `--require-staging-provisioned` and does not run the deploy command.
2. Obtain full `npm audit --json` findings for the current lockfile; triage the two critical and five high vulnerabilities before upgrading.
3. Recover GitHub Actions job diagnostics. Re-runs of PR #69/#70/#71 still fail, with empty step arrays and `BlobNotFound` log downloads.
4. Run the actual npm/typecheck/architecture/auth/triad/NIPS suites in a working executor; do not mark CI remediations complete from source inspection alone.
5. Continue the authenticated, versioned NIPS storage RPC in the database-owning IRNI repository; Radar must remain without a direct shared-neighborhood D1 binding.


## Latest verified change
The staging fail-closed guard is verified: build ee140164-3d69-49f8-8f22-7849d19e4e80 failed at the required staging provisioning check before Wrangler dry-run/deploy. The next action is to poll audit build f993d88e-1b92-4e41-9f62-83b1c3ea34b4 for package-level npm audit findings, then prioritize CI diagnostic recovery.


## Production ownership cutover gate
Before any Radar production deployment:
1. Obtain an accepted IRNI owner-side decision for NIPS profile persistence (ADR-0002) and complete the authenticated/versioned service contract.
2. Complete and verify IRNI read RPC v2 and the NIPS storage RPC in the database-owning IRNI Worker.
3. Deploy `irni-api` in a controlled sequence and verify the service identity/contract.
4. Verify Radar's `IRNI_GEOGRAPHY` Service Binding and read/write contract tests in staging.
5. Only then schedule a reviewed production cutover of the legacy `NEIGHBORHOOD_DB` binding and `IRNI_PUBLISH_HMAC_SECRET`; preserve the legacy path until replacement is proven.
6. Reassess the expired production write-pause timestamp with the operator; no production pause change was made here.


## CHK-200 — Updated execution queue (2026-11-27)

1. **Dependency security triage:** inspect the lockfile paths and production/dev reachability for the two critical findings (`vitest`, transitive `tinypool`) and five high findings, including Firebase/Firestore, `@grpc/grpc-js` and `sharp`. Prioritize removing residual Firebase dependencies in line with the approved Firebase retirement; avoid `npm audit fix --force` and unreviewed major upgrades.
2. **Recover GitHub Actions diagnostics:** latest PR #67 jobs fail within 0–2 seconds with zero steps and `BlobNotFound` log downloads. Retrieve check annotations/job startup diagnostics or use an available Node/npm executor. Do not infer test failures from empty job records.
3. **Run the actual validation suite when an executor is available:** `npm ci`, `npm run test:nips`, `npm run test:auth`, `npm run test:irni-geographic-rpc`, `npm run typecheck:irni-geographic-rpc`, `npm run test:geography-catalog`, `npm run test:cloudflare`, root typecheck/architecture gates and D1 triad/write-pause tests. Record exact exit codes and environment.
4. **Keep staging fail-closed:** build `f993d88e-1b92-4e41-9f62-83b1c3ea34b4` confirmed `BLOCKED_STAGING_DATABASES_NOT_PROVISIONED` before Wrangler dry-run/deploy. Do not create or bind staging databases/services by assumption.
5. **Continue NIPS only at the IRNI ownership boundary:** the owner-side authenticated/versioned storage RPC, migration and service deployment must exist and pass tests before Radar's adapter integration. Radar must not receive a direct binding to `radar-neighborhood-db`.
6. Keep PR #67 Draft. No merge, Production deployment, remote migration, secret change, or destructive data operation without explicit approval.

**Evidence boundary:** Cloudflare frontend preview succeeded on PR #67 head `ede0dac6e57cb06191d434877eeab997f7801cb2`; this does not establish backend test success. No local Node/npm test was executed in this session.


## Immediate next actions — 2026-11-27 follow-up

1. Recover usable diagnostics for the fresh failed GitHub runs on PR #69 and #71; current jobs have null/empty steps, no artifacts, and log downloads return BlobNotFound.
2. Verify whether .npmrc resolves npm ci on a working Node 22/npm 10 executor. PR #70 already has the setting and its frontend preview build passed; PR #69/#71 settings remain unverified.
3. Retrieve full npm audit JSON and remediate the two critical and five high findings based on actual advisory paths, without force upgrades.
4. Review Wrangler staging environment config. Do not add inherited production D1/services/vars wholesale; staging must use explicit staging-only IDs and a verified IRNI service endpoint.
5. Resume NIPS persistent storage only after the IRNI-owned authenticated/versioned RPC and canonical geography Service Binding are confirmed.
6. Reconcile execution state after each verified work package.


## Immediate next action — runner infrastructure

1. Re-attempt the dedicated PR #81 config guard only after runner allocation becomes available; current attempts fail with runner_id=0 before steps.
2. Obtain a working Node 22/npm 10 executor to run the validator, `npm ci`, `npm audit --json`, `npm run test:triad`, and native auth contracts.
3. Do not attribute GitHub Actions failures to source code until a runner executes the workflow steps.
4. Keep NIPS persistent storage blocked until the IRNI-owned authenticated/versioned RPC and canonical geography service binding are verified.


## CHK-203 — GitHub-only execution queue (2026-11-27)

1. **Firebase/Firestore migration map:** enumerate every active import and runtime consumer of `firebase-admin/app`, `firebase-admin/firestore`, Firebase client packages, Firestore emulator/rules tests, and Firebase-specific Vite chunks. The browser compatibility facade is SDK-free, but legacy Express code still imports Firebase Admin. Map each consumer to an approved Cloudflare-native API/adapter before removing packages.
2. **Sharp runtime migration:** map every `sharp` consumer, especially `src/utils/objectStorageUpload.ts`, to the supported image-processing path for each runtime. The Cloudflare Worker import boundary forbids Sharp; do not remove the Node/Express implementation until its replacement and byte-level/security parity tests are ready.
3. **Dependency remediation:** audit identified 2 critical dev-only findings (`vitest@3.2.7`, `tinypool@1.1.1`) and 5 high findings (Firebase/Firestore, `@grpc/grpc-js`, Sharp). Audit fix suggestions include major upgrades. Do not run `npm audit fix --force`; regenerate package-lock only in a compatible Node 22/npm 10 executor and run focused plus full tests.
4. **GitHub Actions infrastructure:** latest PR #67 runs #45987832174, #45987830960, #45987830877, #45987830888 and #45987830940 fail before steps; logs return `BlobNotFound`. Existing raw payload evidence points to `runner_id=0`. Wait for runner allocation recovery or use an available executor; do not patch source to address an infrastructure failure.
5. **NIPS persistence:** continue only after IRNI implements the authenticated/versioned purpose-scoped NIPS storage RPC, additive `nips_*` schema and owner migration-ledger path. Radar must not bind `radar-neighborhood-db` directly. Keep SQL design-only.
6. **Verification:** when a runner/executor becomes available, run `npm ci`, `npm run test:nips`, `npm run test:auth`, `npm run test:irni-geographic-rpc`, `npm run typecheck:irni-geographic-rpc`, `npm run test:geography-catalog`, `npm run test:cloudflare`, `npm run test:triad`, typecheck, architecture and security suites. Record actual exit codes; no result is assumed.
7. Keep PR #67 Draft. No merge, production deployment, remote migration, direct shared-D1 binding, secret change or destructive operation.

**Scope rule:** until the user changes the instruction, continue work only against the GitHub repository. Do not use Cloudflare dashboards/APIs or local machine execution.


### Call-site inventory added
- `docs/engineering/RMEP-001/FIREBASE-SHARP-RETIREMENT-CALLSITE-INVENTORY.md` records the verified active Firebase Admin/Firestore and Sharp consumers, the SDK-free browser compatibility facade, stale Vite chunk/prebundle references, architecture-guard gap, and a safe migration sequence. Use it as the working inventory; do not remove packages until each runtime consumer has a tested replacement.


### Browser Firebase import guard — verification pending
- Added `CLIENT_FIREBASE_SDK_IMPORT` in `scripts/check-architecture.ts` for browser-facing source layers and regression fixtures in `tests/architecture-guardrails.test.ts`. It blocks future Firebase client/Admin SDK imports in browser modules while allowing transitional Node-only Express adapters to remain temporarily.
- **Next:** run `npm run arch:check` and `npm run test:contracts` once GitHub Actions runner allocation recovers. Treat the guard as IMPLEMENTED_BUT_NOT_VERIFIED until those commands execute and pass.


### Latest CI retry status — 2026-11-27
- PR #67 runs #45989808778, #45989808702, #45989808715, #45989808637 and #45989808717 all failed before exposing steps; job logs again return `BlobNotFound`. Do not rerun repeatedly while runner allocation is unavailable.
- The new browser Firebase SDK guard is implemented but unverified. Required first checks after runner recovery: `npm run arch:check` and `npm run test:contracts`, followed by the full auth/NIPS/RPC/triad suite.

## CHK-207 — NIPS public serializer hardening and verification queue

1. **First executable action when a runner is available:** run `npm run test:nips`; inspect any real assertion/type failure and correct only reproducible defects.
2. Run `npm run typecheck`, `npm run arch:check`, and `npm run test:contracts`; then run `npm run test:auth`, `npm run test:irni-geographic-rpc`, `npm run typecheck:irni-geographic-rpc`, `npm run test:geography-catalog`, `npm run test:cloudflare`, `npm run test:triad`, and the security suites.
3. Keep the public serializer change **IMPLEMENTED_BUT_NOT_VERIFIED** until these checks actually execute and pass.
4. Continue NIPS persistence only after the IRNI owner implements and verifies the authenticated, versioned, purpose-scoped storage RPC and additive `nips_*` migration. Radar must not receive a direct binding to `radar-neighborhood-db`.
5. Keep PR #67 Draft; no merge, production deployment, production migration, secret change, or destructive operation without explicit approval.

## CHK-208 — Worker request body streaming

1. Run `npm run test:worker` and confirm the five new request-body boundary cases pass.
2. Run `npm run test:cloudflare`, `npm run test:auth`, `npm run test:security`, `npm run typecheck`, `npm run arch:check`, and Worker TypeScript compilation using `tsc --noEmit -p tsconfig.worker.json`.
3. If a runner remains unavailable, use an authorized Node 22/npm 10 executor; do not mark the work verified based on source inspection alone.
4. Resume NIPS serialization tests and the IRNI-owned persistence RPC dependency after the Worker security gate.


## CHK-209 — immediate execution queue (2026-11-27)

1. Restore usable GitHub Actions runner/step/log visibility. Current PR #67 head `3004fd05714137a6129212d1ca27e81f1660dff7` has five associated failed workflows; all returned jobs have null/empty steps and log downloads return `BlobNotFound`. Do not treat this as an application test failure.
2. Obtain an authorized Node 22/npm 10 executor and run `npm ci`, `npm run test:worker`, `npm run test:nips`, `npm run test:cloudflare`, `npm run test:auth`, `npm run test:security`, `npm run typecheck`, `npm run arch:check`, and `tsc --noEmit -p tsconfig.worker.json`. Capture exact command output and exit codes.
3. Worker call-site audit is complete: all nine inspected route modules propagate parser status/code. Preserve existing endpoint-specific limits; specifically measure the 14 MiB JSON/base64 upload path before changing its accepted payload ceiling or parser strategy.
4. Keep NIPS serializer and Worker parser **IMPLEMENTED_BUT_NOT_VERIFIED** until executable tests pass. Keep PR #67 Draft. No merge, Production deployment, remote migration, or production binding/secret changes without explicit approval.

 
## CHK-210 — immediate verification queue

1. First executable check: `npm run test:nips`; confirm both `UNDER_REVIEW` and explicit `SUPPRESSED` public-disclosure regressions and prior NIPS serializer tests pass.
2. Run root typecheck, `npm run arch:check`, `npm run test:security`, and the applicable Worker/auth/Cloudflare suites.
3. Keep SEC-NIPS-002, NIPS serializer hardening, and Worker streaming parser **IMPLEMENTED_BUT_NOT_VERIFIED** until commands execute successfully.
4. Keep PR #67 Draft. Do not implement Radar-side NIPS persistence until the IRNI-owned authenticated/versioned storage RPC and canonical geography Service Binding are available and verified.

 
## CHK-211 — immediate verification queue

1. Inspect PR #67 workflow runs for updated head `c65f6478473c890ed5ea8754faf3f5f896bf2ed7`; confirm runner allocation and non-empty steps before reading test outcomes.
2. Confirm root CI Gate G executes `npm run test:worker` and retains `ci-gate-g-worker-tests.log`. Root `npm test` already includes NIPS via `test:unit`.
3. If commands execute, diagnose concrete output from `npm run test:worker`, `npm test`, typecheck, architecture, security and Cloudflare gates; do not infer results from job conclusion alone.
4. Keep SEC-NIPS-002, Worker streaming parser, and CI workflow change **IMPLEMENTED_BUT_NOT_VERIFIED** until executable checks pass.
5. Keep PR #67 Draft. Preserve the IRNI-owned storage RPC and geography Service Binding prerequisites; no direct Radar binding to IRNI D1 or Production changes.
