# Backend Blockers — RMEP-001

Updated: 2026-11-27
Active branch: `feat/nips-backend-runtime-foundation-2026-11-26`
Latest inspected main: `456dcacb387b908797756863b10da1f7104b658e`
Active NIPS branch head: `9180bffe91577e9a53460fcf54e0058549813f0d`

## BLOCKED

### B-001 — GitHub Actions jobs fail before exposing executable steps
- PR: #67
- Latest observed workflow runs on head `9180bffe91577e9a53460fcf54e0058549813f0d`:
  - #45977620112 — Tehran Radar CI Quality Gates: FAILURE
  - #45977620069 — Path-Filtered Checks: FAILURE
  - #45977619999 — Backend Triad & Frontend Service Binding: FAILURE
  - #45977620151 — IRNI Geographic RPC Consumer Contract: FAILURE
  - #45977620040 — Cloudflare Native Auth Validation: FAILURE
- Root quality-gate job was rerun successfully as an API operation; rerun job ID `140435161931` also completed with FAILURE.
- GitHub returned an empty step list for the rerun job; downloading its logs returned `BlobNotFound`. No failing command or source-level root cause is currently observable.
- **Next:** inspect the same run/job in GitHub Actions UI or restore usable Actions log access. If it still has no runner/steps, diagnose repository Actions runner availability/configuration before changing application code. Do not guess the failing command.

### B-002 — Shared NIPS persistence provider
- The recorded owner decision is to reuse the existing physical `radar-neighborhood-db`, not create a fourth D1 database.
- Radar API must not receive a direct D1 binding to that database.
- Persistence must be exposed by the database-owning IRNI Worker through an authenticated, versioned NIPS storage RPC.
- **Next:** paired IRNI Worker RPC, owner-side migration, auth contract, request/response versioning, idempotency, and transactional CAS acceptance tests. Radar-side D1 access is prohibited.

### B-003 — Canonical identity/boundary provider
- The NIPS runtime requires confirmed canonical identity and reviewed boundary evidence.
- The recorded target is the version-pinned, read-only `IRNI_GEOGRAPHY` Service Binding.
- The intended `irni-api` service is not deployed and the binding is absent from the inspected live configuration.
- **Next:** verify the owner-side service deployment and implement a version-pinned provider boundary only after the service contract is available.

## Cross-PR build blockers
- PR #69 fixes the native-auth workflow's nonexistent npm script, but its Actions runs also fail without usable step evidence.
- PR #70 removes the stale Bun lockfile; its Actions runs also fail without usable step evidence. Cloudflare preview installation/build has not yet verified the change.
- Both PRs remain Draft; neither is merged.

## Explicitly not blockers
- Ordinary reversible branch code, test, and documentation changes require no additional user approval.
- Production deployment, destructive production database operations, irreversible data changes, secret rotation/disclosure, and paid-service activation remain approval-gated.
 

## CHK-197 update — 2026-11-27

- Active branch head after this checkpoint: `ee2023a59128a9bad17f37e144995b5a6d67bc1f`.
- A reproducible workflow defect was found: `.github/workflows/cloudflare-native-auth-validation.yml` invoked `npm run test:cloudflare-native-auth`, but root `package.json` has no such script. The existing `test:auth` script covers the required native-auth/OIDC/session suites. The workflow now invokes `npm run test:auth` (commit `eb76b22590c70dc81ddff2189fc1cca459099d8d`).
- A separate reproducible Cloudflare preview build defect was confirmed from PR #70's Cloudflare build evidence: the stale root `bun.lock` caused Cloudflare to select `bun install --frozen-lockfile` and fail because the lockfile did not match the npm workspace manifest. On this branch, `bun.lock` was removed and `.npmrc` was added with `legacy-peer-deps=true` (commits `dd28ff9aa9c2946a60ae9fbd34630ac4d6ad5c5f`, `ee2023a59128a9bad17f37e144995b5a6d67bc1f`). PR #70 independently carries the same remediation; no merge was performed.
- The five workflows on the new head `ee2023a59128a9bad17f37e144995b5a6d67bc1f` still conclude FAILURE. Their jobs expose empty/null step lists and log download returns `BlobNotFound`. Thus the workflow changes are committed but not CI-verified; the remaining Actions failure is still not attributable to an application command.
- No local test execution was available in this GitHub-only session. No migration, binding, secret, production deployment, or merge was performed.

**Next:** restore usable Actions runner/log evidence, then execute the NIPS, typecheck, architecture, auth, and D1 isolation suites in an executable environment. Do not guess at the remaining failure.


## CHK-198 update — additional CI script defects fixed

On branch head `e006fda6be0bff13df920b3cdd6b3cdcba117651`, static inspection found two further workflow/package-script mismatches and corrected them:

- `irni-geographic-rpc-contract.yml` invoked `test:irni-geographic-rpc` and `typecheck:irni-geographic-rpc`, but neither script existed. Added both scripts to root `package.json`, targeting the existing RPC client test and `tsconfig.irni-geographic-rpc.json` (commit `29dcf30cba962d50de3501364b75d9f0140d0aab`).
- `radar-backend-triad.yml` invoked missing `npm run test:geo`; changed it to the existing `npm run test:geography-catalog` (commit `e006fda6be0bff13df920b3cdd6b3cdcba117651`).

Re-fetched package scripts and both workflow files to verify the command names now resolve to registered scripts. The five workflows triggered on the updated head still report FAILURE; job steps are null and log retrieval again returns `BlobNotFound`. These source/config fixes remain IMPLEMENTED_BUT_NOT_VERIFIED. No npm commands ran locally.


## B-005 — Staging D1/Service Binding provisioning is incomplete
- Cloudflare API staging build `65cb411a-aea7-4702-bd2f-6148ae2175f4` completed and deployed Worker version `487db2f1-22e8-4299-b954-cc248858fa2a`.
- Build logs confirm no staging D1 bindings or IRNI service binding; staging environment inherited only APP_ENV, WORKER_ENV and APP_URL. Top-level vars, D1 bindings and services were explicitly warned as non-inherited.
- Validator's optional staging gate was not enabled and returned a warning rather than an error.
- **Mitigation:** the staging-only Build Trigger now requires `--require-staging-provisioned` before the deploy command.
- **Status:** COMPLETED_AND_VERIFIED. Manual build ee140164-3d69-49f8-8f22-7849d19e4e80 stopped at BLOCKED_STAGING_DATABASES_NOT_PROVISIONED before dry-run/deploy.
- Do not create or bind new databases or IRNI service names by assumption.

## B-006 — Dependency security audit
- Cloudflare npm install reports 21 vulnerabilities: 14 moderate, 5 high, 2 critical.
- Exact package names, paths and fix availability have not yet been retrieved.
- **Next:** capture `npm audit --json` from a reproducible executor; prioritize critical/high direct or runtime dependencies. No blind `npm audit fix --force`.


### B-007 — GitHub Actions runner diagnostics remain unavailable
- PR #67, #69, #70 and #71 remain Draft/open; latest checks show failure for detect, root quality gates, native auth, backend triad and IRNI RPC workflows.
- Job step arrays are empty and job-log downloads return `BlobNotFound`.
- **Next:** use an execution environment with GitHub Actions logs or a local Node/npm worktree; do not guess at root causes from check conclusions alone.


## B-008 — Production IRNI ownership cutover is incomplete
- Live production API Worker settings still include `NEIGHBORHOOD_DB` -> `radar-neighborhood-db` and `IRNI_PUBLISH_HMAC_SECRET`; no `IRNI_GEOGRAPHY` Service Binding exists.
- The production `DB_WRITES_PAUSED_UNTIL_UTC` value is `2026-11-24T00:00:00Z`; code semantics treat an expired deadline as unpaused.
- Cloudflare confirms Worker `irni-api` does not exist (HTTP 404, error 10007).
- IRNI read RPC PR #22 and NIPS persistence PR #25 are Draft; ADR-0002 is proposed and does not authorize an owner-side NIPS persistence migration/RPC.
- **Risk:** current production geography publication still depends on the legacy Radar-side D1 binding/secret path. The new Radar branch cannot be deployed until IRNI replacement read/write contracts and the service are deployed and tested.
- **Do not:** remove production binding/secret, change the production write-pause deadline, run a D1 migration, or deploy a replacement Worker without the required approval and ordered cutover.


## Additional blockers — 2026-11-27

### B-004 — npm lockfile peer resolution
- Cloudflare build log confirms npm ci fails because package.json and package-lock.json are out of sync; Wrangler's optional peer range requests Vitest 5 while root project declares Vitest 3.
- PR #70 already contains legacy-peer-deps=true and its frontend preview build passed. PR #69 and #71 were updated with the same .npmrc setting, but fresh GitHub Actions jobs still fail and their logs are inaccessible.
- Do not upgrade Vitest or hand-edit package-lock without reproducible npm output.
- Next: obtain a working Node/npm executor and run clean npm ci under Node 22/npm 10, compare with and without the repo .npmrc, then regenerate lockfile only if required.

### B-005 — staging Worker binding isolation
- Cloudflare API staging build logs warn that vars, d1_databases, and services are absent from env.staging because Wrangler does not inherit them.
- Backend validation reports BLOCKED_STAGING_DATABASES_NOT_PROVISIONED. The uploaded staging Worker version had only APP_ENV, WORKER_ENV, APP_URL bindings.
- Do not deploy or provision staging resources until intended staging DB/service IDs and owner-approved topology are verified.
- Next: inventory current staging DBs and IRNI service binding contract; reconcile config and provisioning in a non-production change.

### B-006 — dependency vulnerabilities
- Build output reports 21 npm audit findings (14 moderate, 5 high, 2 critical), but the advisory JSON and dependency paths are not present in accessible logs.
- Next: retrieve full npm audit JSON from a working executor and triage direct/transitive exposure. No force upgrades.


### B-007 — GitHub Actions runner allocation unavailable
- The raw job payloads show `runner_id: 0`, empty runner name, zero steps, and immediate failure across the inspected recent PR runs, including PR #81's dedicated config guard.
- Rerunning PR #81's failed workflow reproduced the same result.
- This is a GitHub Actions runner/queue infrastructure blocker. No workflow commands ran; no code failure or pass can be inferred.
- Next: wait for runner allocation to recover or use an available connected Node/npm executor. Keep PRs Draft until the actual checks execute.
