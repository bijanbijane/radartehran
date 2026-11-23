# Firebase Retirement Checkpoint

**Status:** IN PROGRESS — NOT DEPLOYABLE  
**Working branch:** `migration/cloudflare-native-auth-firebase-retirement`  
**Base commit:** `e2940da21c2f65fa85a5c26cdafb3495503ca27c`

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

An attempt to apply USER_DB migrations 0007–0009 through the D1 query endpoint hit Cloudflare's Free-tier daily row-write limit.

The first DDL statement succeeded before the limit stopped the next statement:

- `user_sessions.token_hash` **exists**.
- `user_sessions.expires_at_iso` and `user_sessions.auth_provider` do **not** exist.
- `auth_identities`, `auth_oauth_states`, and `auth_phone_challenges` do **not** exist.
- The D1 migration ledger still ends at 0006; migration 0007 is **not** recorded as applied.

Do not run `wrangler d1 migrations apply` against this partially modified schema without first repairing it: migration 0007 would attempt to add the already-existing `token_hash` column again.

### Recovery procedure after the D1 daily write limit resets

Use the Cloudflare D1 **raw** endpoint, not separate `/query` calls. The raw endpoint supports a batch of SQL statements. In one atomic batch:

1. Remove the one partially applied column: `ALTER TABLE user_sessions DROP COLUMN token_hash;`
2. Execute every statement from USER_DB migrations 0007, 0008, and 0009 in order.
3. Insert the three exact migration filenames into `d1_migrations` only after all DDL succeeds.
4. Re-read `PRAGMA table_info(user_sessions)`, the three auth tables, and the migration ledger. Verify all columns/tables exist and ledger entries 0001–0009 are present.
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
- USER_DB readiness now uses its own 0001–0009 migration catalog instead of incorrectly checking only the legacy D1 catalog.
- Tests were added for OIDC authorized-party validation and USER_DB migration readiness.
- R2-dependent media routes are blocked until the operator explicitly approves a provider.
