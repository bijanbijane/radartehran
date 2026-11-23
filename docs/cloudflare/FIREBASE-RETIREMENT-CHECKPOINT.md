# Firebase Retirement Checkpoint

**Status:** IN PROGRESS — NOT DEPLOYABLE  
**Working branch:** `migration/cloudflare-native-auth-firebase-retirement`  
**Base commit:** `e2940da21c2f65fa85a5c26cdafb3495503ca27c`

## 23 November 2026 — continuation checkpoint

**Working HEAD:** `00be8d494bfac30076121d538716ee124b89f3f9`  
**Comparison:** 190 commits ahead of `main`, 0 behind; 99 changed files in the branch comparison.  
**Deployment:** No deployment or production data mutation was performed in this continuation.

### Completed in this continuation

- Replaced Firebase bearer-token usage in the admin Telegram, AI control-center, CASPER monitor, unified control-plane, storage-recovery, and environment-diagnostics UI requests with same-origin HttpOnly Cloudflare session-cookie requests.
- Replaced the legacy environment configuration form (which called an endpoint not implemented in the Worker router and exposed Firebase project/database identifiers) with a read-only `GET /api/admin/worker-diagnostics` view backed by the existing Worker admin diagnostics route. Secret and binding changes remain deployment-managed.
- Migrated the listing media uploader to the Cloudflare session client; removed Firebase App Check token generation from this upload flow. All chunk-init, chunk, completion, single-upload, status, and delete requests now send same-origin credentials.
- Removed Firebase Storage from the browser storage-provider type and provider allowlist. Legacy `firebase` provider labels now normalize to generic S3-compatible mode, which still requires explicit S3 credentials and does not silently fall back to Firebase.
- Changed default `dev` and `start` package scripts so the default development/runtime commands target Cloudflare Vite and Wrangler rather than the legacy Express server.
- Hardened Google OIDC `azp` validation and made OTP challenge finalization revoke a newly issued session if challenge finalization fails.

### Remaining blockers — do not claim full Firebase retirement

- The frontend still contains direct `firebase/firestore` imports and active Firestore-backed hooks/repositories, including `useRadarCloudSync`, `useRadarAdminActions`, `useRadarCrudActions`, and `firestoreNeighborhoodRepository`. These require explicit Worker/D1 API contracts and replacement, not mass deletion.
- `src/firebase.ts`, `src/utils/appCheck.ts`, `src/utils/clientAppCheck.ts`, `src/utils/serverAdminAndTelegramSecurity.ts`, `src/utils/serverConfigValidator.ts`, and legacy Express media/domain adapters still contain Firebase or Firestore runtime code.
- `package.json` still declares `firebase`, `firebase-admin`, and Firebase emulator test dependencies because source imports remain. They must not be removed until the replacement graph typechecks and builds.
- Several legacy server modules still implement Firestore stores. The Worker migration register must remain the source of truth for which routes are actually available; an Express route is not considered migrated merely because a Worker route has a similarly named path.
- The production Worker remains on its previously observed configuration and does not yet have the Google OAuth, Kavenegar, and HMAC secrets needed for login. The D1 0007–0009 partial-migration recovery described above remains unresolved.
- The repository was not built or tested by this connector. GitHub Actions currently reports no workflow runs for this branch; the changes above are source edits, not verified CI results.

### Safety boundary

Do not delete Firestore-backed repositories, Firebase configuration, or packages in bulk until each active caller has a working Worker/D1 replacement and tests prove parity. Do not deploy the branch until D1 migration recovery, required secrets, OAuth callback configuration, and Worker binding alignment are verified. R2 remains deferred.

## Target architecture

- Google sign-in through Google OpenID Connect directly to the Cloudflare Worker.
- Iranian mobile sign-in through Kavenegar SMS OTP.
- Opaque, HttpOnly, Secure, SameSite session cookie; only a SHA-256 token digest is stored in USER_DB.
- Identity, sessions, OAuth state, OTP challenges, account status, and authorization records in Cloudflare D1.
- No Firebase Authentication, Firestore, Firebase Admin SDK, Firebase ID tokens, or Firebase App Check in the target runtime.
- R2 is explicitly deferred. Do not create R2 buckets, add R2 bindings, or enable media routes until the operator approves and provisions a storage provider.

## Verified Cloudflare production state at checkpoint

- USER_DB currently has migration ledger entries 0001 through 0006.
- Read-only queries showed zero rows in `user_profiles`, `user_sessions`, `admin_role_bindings`, `bargain_projections`, `media_objects`, and `user_favorites`.
- The active Worker configuration still exposes legacy `DB` and `NEIGHBORHOOD_DB` bindings and Firebase-related plain-text variables. The active Worker has not been cut over to the branch configuration.
- The active Worker secrets list did not contain Google OAuth client secret, Kavenegar API key, or AUTH_PII_HMAC_SECRET.
- R2 is not enabled for the account. Group 5 media routes are therefore deliberately marked BLOCKED in the migration register and fail closed.

## Partial D1 migration incident — recovery required

An attempt to apply USER_DB migrations 0007–0010 through the D1 query endpoint hit Cloudflare's Free-tier daily row-write limit.

The first DDL statement succeeded before the limit stopped the next statement:

- `user_sessions.token_hash` **exists**.
- `user_sessions.expires_at_iso` and `user_sessions.auth_provider` do **not** exist.
- `auth_identities`, `auth_oauth_states`, and `auth_phone_challenges` do **not** exist.
- The D1 migration ledger still ends at 0006; migration 0007 is **not** recorded as applied.

Do not run `wrangler d1 migrations apply` against this partially modified schema without first repairing it: migration 0007 would attempt to add the already-existing `token_hash` column again.

### Recovery procedure after the D1 daily write limit resets

Use the Cloudflare D1 **raw** endpoint, not separate `/query` calls. The raw endpoint supports a batch of SQL statements. In one atomic batch:

1. Remove the one partially applied column: `ALTER TABLE user_sessions DROP COLUMN token_hash;`
2. Execute every statement from USER_DB migrations 0007, 0008, 0009, and 0010 in order.
3. Insert the four exact migration filenames into `d1_migrations` only after all DDL succeeds.
4. Re-read `PRAGMA table_info(user_sessions)`, the three auth tables, and the migration ledger. Verify all columns/tables exist and ledger entries 0001–0010 are present.
5. Re-run the USER_DB migration-readiness endpoint/test.

The D1 write-limit error is an account quota constraint, not a SQL error. Do not retry writes before the quota resets or the account limit is upgraded.

## Credentials required before enabling login

Configure these values in the Cloudflare Worker environment:

**Non-secret variables**
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_REDIRECT_URI` (expected callback: `https://radartehran.ir/api/auth/google/callback`)
- `KAVENEGAR_VERIFY_TEMPLATE`

**Worker Secrets**
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `KAVENEGAR_API_KEY`
- `AUTH_PII_HMAC_SECRET` (at least 32 cryptographically random bytes)

Do not place secret values in Git, Wrangler vars, logs, or this checkpoint.

## Additional cutover safety controls

- Google OIDC, SMS OTP, account-management, account-deletion, and D1 marketplace endpoints are now explicitly registered in the migration control register.
- Those routes are marked `BLOCKED` and the Worker router returns a fail-closed 501 until the corresponding USER_DB migrations and provider configuration are ready. This prevents partially migrated routes from being treated as production-ready.
- Public marketplace projections no longer expose other users' raw owner UIDs. Sponsor phone numbers are masked for non-admin callers, and public sponsor JSON is reduced to an allowlist.
- The account workspace now exposes Google sign-in and SMS OTP sign-in through the Cloudflare AuthClient. Persian and Arabic numerals are normalized for Iranian phone numbers and OTP entry.

## Remaining retirement work

- Frontend and legacy server still contain Firebase imports and Firestore adapters. `src/firebase.ts`, Firebase App Check helpers, Firestore-based UI hooks, Firestore stores in legacy server modules, Firebase rules/configuration files, and Firebase dependencies in package manifests have not all been removed.
- The Cloudflare-native AuthClient exists, but remaining UI flows and all Firestore-backed domain workflows still need to be migrated to explicit Worker/D1 APIs.
- Legacy projection metadata still contains Firestore terminology (including `firestore_version_iso`) and must be renamed through a forward-only D1 migration; historical migrations must not be edited in place.
- Do not remove Firebase packages or config files until all remaining imports and runtime paths have been replaced and the full typecheck/build passes.
- No GitHub Actions runs were found for this working branch at the time of this checkpoint. The new auth and USER_DB migration-readiness tests have been added but are not yet verified by CI.

## Changes in this checkpoint

- Cloudflare-native Google OIDC + Kavenegar OTP routes and opaque D1 sessions are on the working branch.
- Google OIDC verifier now checks `azp` whenever there are multiple audiences and rejects a conflicting `azp` even for a single audience.
- OTP challenge finalization now occurs after identity/session creation; if finalization fails, the newly issued session is revoked and the challenge remains retryable where attempts remain.
- USER_DB readiness now uses its own 0001–0010 migration catalog instead of incorrectly checking only the legacy D1 catalog. Migration 0010 adds D1-owned marketplace and neighborhood state tables; binary media remains excluded.
- Tests were added for OIDC authorized-party validation and USER_DB migration readiness.
- R2-dependent media routes are blocked until the operator explicitly approves a provider.


## 23 November 2026 — independent read-only verification (audit source HEAD: `fd970261c2dfc4c33d593bef17f667f260b8ff3e`)

This note supersedes the earlier working-HEAD and partial-schema statements above where they conflict. The audit was performed against the actual PR #23 branch ref. The checkpoint update itself advances that branch by one documentation commit.

### Branch and CI state

- The branch advanced by 62 commits after the previously recorded `00be8d494bfac30076121d538716ee124b89f3f9` checkpoint.
- PR #23 is still OPEN/DRAFT and not deployable. No merge, deployment, or Firebase/Firestore data deletion was performed.
- CI run `45156557286` failed in Gate A (TypeScript/Lint/Typecheck); Gate B browser E2E was skipped. The failing TypeScript job logged 51 diagnostics across legacy server modules, frontend contracts, D1 migration code, queue types, Worker routes, and storage helpers. This is not a test pass.
- PR #23 overlaps 20 files with open PR #9; PR #28 also depends on files changed by PR #9. Do not make parallel edits to shared files until the dependency/merge plan is reconciled.

### Live USER_DB state (Cloudflare API, read-only)

- Account and database ownership were matched against `wrangler.backend.jsonc`; only Radar-owned `radar-user-db` and `radar-researcher-db` were queried. The IRNI-owned `radar-neighborhood-db` was not queried or modified.
- USER_DB migration ledger contains only migrations 0001–0006.
- The production `user_sessions` table currently contains `token_hash` and `expires_at_iso`, but not `auth_provider`. This is a two-column partial application of migration 0007, not the one-column state described in the older note.
- `auth_identities`, `auth_oauth_states`, and `auth_phone_challenges` are absent. Migration 0010 marketplace tables (including `bargains`, `sponsor_requests`, `buyer_alerts`, `neighborhood_votes`, `neighborhood_overrides`, and `app_config`) are also absent.
- Read-only aggregate counts were zero for `user_profiles`, `user_sessions`, `admin_role_bindings`, `bargain_projections`, `media_objects`, `user_favorites`, `user_privacy_consents`, `user_saved_searches`, `upload_sessions`, `account_deletion_jobs`, `admin_audit_logs`, and `research_erasure_outbox`. No row contents were returned.
- The current recovery script at `scripts/cloudflare/recover-user-d1-identity-migrations.mjs` is dry-run by default and uses idempotent existence checks. It skips the two columns already present, adds the missing `auth_provider`, creates the missing auth tables/indexes, verifies the schema, then reconciles only migrations 0007–0009. It performs no DROP/DELETE or row rewrite. It does **not** apply migration 0010. Re-run only after the D1 write quota is available; then independently apply and verify migration 0010 before unblocking marketplace routes.

### Firebase/Firestore retirement is not complete

- Direct active Firestore client operations remain in `src/components/useRadarAdminActions.ts` and `src/data/firestoreNeighborhoodRepository.ts`.
- `src/components/AdminPanel.tsx` still exposes live Firestore audit, repair, and quarantine-delete actions.
- `src/firebase.ts` still initializes the Firestore SDK. `src/utils/serverAdminAndTelegramSecurity.ts` and the legacy `server.ts` path still use Firebase Admin/Express behavior; `src/utils/serverConfigValidator.ts` still validates Firebase project/database configuration.
- The branch tree still contains 35 Firebase/Firestore-named paths, and the package manifest still declares `firebase`, `firebase-admin`, and Firebase rules test tooling.
- The migration register still marks authentication, account workflows, marketplace writes, object storage, and admin/governance routes as BLOCKED or legacy-Express; several public market/telemetry routes remain DISCOVERED.
- The connected GitHub/Cloudflare tools provide no authenticated Firebase/Firestore inventory or export. Firestore document counts and migration parity are therefore **unknown**.

### Safety decision

Do not delete the Firebase project, Firestore database/collections, Firebase configuration, or packages yet. The active frontend/admin paths still depend on Firestore, the production Cloudflare replacement schema is incomplete, no Firestore-to-D1 data parity proof exists, and the current branch does not pass typecheck. Complete and verify every replacement path, obtain an authenticated Firestore export/inventory, prove record and authorization parity, and only then schedule a separate decommissioning operation. No production database mutation was made during this audit.


## 23 November 2026 — destructive source/config cutout (commit `11a63bec1bb076eb190cf2323d61b1c2a7f7feec`)

At the operator's explicit direction, the Firebase-retirement branch removed 22 legacy Firebase/Firestore repository paths in one commit. The deletion set covered:
- Firebase project/deployment configuration: `.firebaserc`, `firebase-applet-config.json`, `firebase-blueprint.json`, `firebase.json`.
- Firestore security/deployment assets: `firestore.rules`, `firestore.indexes.json`, rules test runner and root rules test.
- Firestore-only server persistence adapters for brokerage operations, community, disputes, legal-regulatory transactions, permits, property rights, viewings, and real-estate transactions.
- Legacy Firestore auditing/integrity, App Check, connection-state, HTTP helper, and sponsor helper modules.

### Important scope and remaining blockers

- These are deletions on `migration/cloudflare-native-auth-firebase-retirement` / PR #23 only. `main` and production deployments were not changed. Git history still retains prior versions of deleted files.
- The live Firebase project and Firestore database were **not** deleted or modified. No Firebase/GCP admin API or connector is available in this session to perform or verify that remote destructive operation.
- Three source paths shared with active PR #9 were deliberately not changed: `src/data/firestoreDataAuditor.ts`, `src/data/firestoreNeighborhoodMappers.ts`, and `src/data/firestoreNeighborhoodRepository.ts`. `src/firebase.ts`, `package.json`, and `package-lock.json` are also shared with PR #9 and remain.
- The package manifest still contains Firebase SDK/admin and rules-test dependencies. Direct Firestore usage remains in frontend/admin code, including `src/components/useRadarAdminActions.ts` and `src/components/AdminPanel.tsx`; legacy server security/configuration paths also remain. The branch is therefore **not yet Firebase-free** and the application can have missing-module/config build failures as a result of this intentional cutout.
- CI run `45172596829` was triggered for the cutout commit and was still running at the latest check. Do not claim it passed until a completed run is inspected.
- The prior read-only audit found zero rows in the listed USER_DB tables but did not query Firestore; this does not establish that the Firebase project or Firestore collections are empty.

No Cloudflare D1 data was deleted, no IRNI-owned resource was modified, and no production deploy was performed.

## 23 November 2026 — live GitHub continuation audit (before checkpoint refresh)

**Audited branch HEAD:** `661c8ff718c09d9051adbf572f067250c40aa6f6`  
**PR:** #23, OPEN / DRAFT, base `main`.  
**Latest CI for audited HEAD:** run `45172789714`, completed with **failure**. The earlier cutout commit run `45172596829` is cancelled. No passing full CI result exists for this branch.

### Confirmed source-retirement state

- The 22-file Firebase/Firestore source/config cutout remains on this branch only. It did not remove or modify the remote Firebase project or Firestore data.
- The branch tree still contains 35 Firebase/Firestore-named paths.
- `src/firebase.ts` still imports the removed `firebase-applet-config.json` and imports `firebase/app` and `firebase/firestore`; it remains a live legacy adapter, not a harmless compatibility shim.
- Direct Firestore operations remain in `src/components/useRadarAdminActions.ts`: neighborhood override writes, sponsor approval/expiry/deletion, bargain deletion/approval, feature-flag persistence, and restore-to-Firestore.
- `src/components/AdminPanel.tsx` still exposes live Firestore audit, repair, and quarantine-delete actions through `src/data/firestoreDataAuditor.ts` and `src/data/firestoreNeighborhoodRepository.ts`.
- `package.json` and `package-lock.json` still declare Firebase SDK/Admin and rules-test dependencies. Removing them now would leave unresolved imports and broken runtime paths.
- The Worker currently has D1-backed market-state reads and creation endpoints for bargains/sponsor requests/buyer alerts, but does not yet expose the complete admin mutation contract used by the legacy admin actions. The migration register classifies marketplace routes as BLOCKED pending USER_DB migration 0010.
- Production USER_DB has not been proven to contain migration 0010 or a Firestore-to-D1 data/authorization parity export. Firestore inventory and document counts remain unknown.

### Concurrency boundary

PR #9 remains open and touches these shared files: `src/firebase.ts`, `src/data/firestoreDataAuditor.ts`, `src/data/firestoreNeighborhoodMappers.ts`, `src/data/firestoreNeighborhoodRepository.ts`, `package.json`, and `package-lock.json`. Do not edit these paths in parallel with PR #9. PR #28 is dependent on PR #9. PR #34 is a child validation PR of PR #9 and must not merge independently.

### Next safe implementation unit

Implement and test the missing Cloudflare Worker/D1 admin mutation contracts for the independent admin-action module, including transactional authorization, ownership checks, idempotency where applicable, and explicit fail-closed behavior. Only after those contracts exist should the frontend Firestore calls be replaced. Keep the migration register BLOCKED until USER_DB migration 0010 and required data/authorization parity are verified. Do not delete Firebase project/data, deploy, mutate production D1, or alter IRNI-owned resources as part of source migration.


## 23 November 2026 — Google sign-in route activation (source-only)

**Branch:** `migration/cloudflare-native-auth-firebase-retirement`  
**PR:** #23, OPEN / DRAFT; base `main`.  
**Implementation HEAD before this checkpoint refresh:** `62a534e34a10fd9ceb008f6d769cefcee0384e7c`  
**Implementation commits:** `db7b6964449781b0ac3927b3d5a4b66c185eb997`, `436a479b6d1ac0ae4490d00156bb8248801c1171`, `62a534e34a10fd9ceb008f6d769cefcee0384e7c`.

### Implemented in source

- Existing frontend Google sign-in action calls the Cloudflare session client and redirects to `/api/auth/google/start`; it no longer needs a Firebase popup for this flow.
- The Worker OAuth callback exchanges the authorization code, validates Google ID-token signature/issuer/audience/authorized-party/nonce/time claims, persists the provider identity in USER_DB, and issues an opaque HttpOnly session cookie.
- The migration register now classifies the native-auth route family as `IMPLEMENTED` on the Cloudflare Worker. The router permits only that explicitly classified group through the migration gate.
- The auth handler probes the required D1 schema before executing. Missing/partial schema returns `503 AUTH_SCHEMA_NOT_READY`; missing USER_DB returns `503 USER_DB_NOT_BOUND`. Google login requires the base identity/session/OAuth schema (migration 0007); SMS OTP additionally checks the SMS-specific columns from migrations 0008–0009.
- Regression tests were added for migration-register dispatch, the no-USER_DB fail-closed response, and Google-versus-SMS schema readiness.

### Operational blockers — do not bypass

- No production D1 migration was applied. The USER_DB migration history and the documented partial-application recovery for migrations 0007–0009 still require verification before use.
- Google OAuth credentials were not provisioned or exposed. Set the real `GOOGLE_OAUTH_CLIENT_ID` variable and `GOOGLE_OAUTH_CLIENT_SECRET` Worker secret, with the exact callback URI registered at Google. Do not put secrets in Git.
- No Worker deployment, DNS change, production database mutation, Firebase project deletion, or Firestore data deletion was performed.
- CI was not run for the new HEAD; the last known run for an earlier branch commit failed. Source changes are not yet CI-verified and PR #23 remains Draft.

### Concurrency boundary

The only file shared with PR #9 among the auth changes is `src/platform/auth/core/authClient.ts`; it was not edited. PR #9, dependent PR #28, and validation PR #34 remain untouched. `main` and Production remain unchanged.


## 23 November 2026 — live USER_DB identity recovery preflight

**Repository branch:** `migration/cloudflare-native-auth-firebase-retirement`  \
**PR:** #23, OPEN / DRAFT; base `main`.  \
**Source HEAD before this checkpoint:** `b4b29e7e1314781dde1502fac4de255b294d9ee5`  \
**Production database:** `radar-user-db` (`fbb98e6b-5200-4047-b4bc-15a51c06aa84`), binding `USER_DB` in `wrangler.backend.jsonc`.

### Read-only Cloudflare verification

The live D1 API was queried directly. All statements were read-only; every response reported `changed_db=false` / `rows_written=0`.

- `d1_migrations` contains exactly canonical USER_DB migrations `0001`–`0006`; no ledger row exists for `0007`, `0008`, or `0009`.
- `user_sessions` has the two already-partially-applied columns `token_hash TEXT` and `expires_at_iso TEXT`; `auth_provider` is absent.
- `auth_identities`, `auth_oauth_states`, and `auth_phone_challenges` do not exist.
- All eight indexes expected by the recovery script are absent.
- `user_profiles` and `user_sessions` both currently contain zero rows. No duplicate non-null `token_hash` values were found.
- Migration `0010` was not included in the recovery plan and remains outside this Google-auth readiness operation.
- D1 Insights reported 2 rows written for this database from 00:00 UTC to 16:19:26 UTC on 2026-11-23. This usage metric is not proof of remaining quota; the previous daily write-quota incident remains a reason to avoid blind retries.

### Recovery script review

The existing `scripts/cloudflare/recover-user-d1-identity-migrations.mjs` is pinned to the exact Production `USER_DB` binding, defaults to dry-run, requires `--apply` for writes, checks for existing columns/tables/indexes, verifies the resulting schema, and records migration ledger rows only after schema verification. It is limited to migrations `0007`–`0009`; it does not apply `0010`, drop data, or rewrite user rows.

The observed live schema matches the script's intended partial-recovery case: skip `token_hash` and `expires_at_iso`, add `auth_provider`, create the three auth tables and eight indexes, then reconcile ledger rows 7–9. No recovery DDL or ledger write has been executed in this checkpoint.

### Current GitHub coordination

- PR #23 remains OPEN / DRAFT. The implementation HEAD audited above was `b4b29e7e1314781dde1502fac4de255b294d9ee5`; no passing CI run has been observed for that implementation. Subsequent commits in this section only update the checkpoint documentation and do not constitute code verification.
- PR #9 has advanced to `5724ce60bde741ba0869875e8a23e4502ac2990c`; it remains OPEN / DRAFT. PR #9 and PR #23 still share files, including `src/platform/auth/core/authClient.ts`, `package.json`, `package-lock.json`, and shared Worker/test files. Do not edit those overlapping files without rechecking the current PR diffs.
- No Worker deployment, OAuth secret read/write, DNS change, Production migration, Firebase deletion, or IRNI resource change was performed.

### Next gated operation

The recovery plan is technically aligned with the observed schema, but Production DDL must remain a separate explicit operation. Before applying it, verify the D1 write quota is available, retain the exact target binding, execute the existing recovery script in `--apply` mode only against `radar-user-db`, and immediately re-read the schema and ledger. Then configure the Google OAuth client ID/secret and callback, validate Worker bindings, and deploy only through a separately reviewed cutover. Keep PR #23 Draft until its complete CI and remaining Firebase retirement work are verified.
