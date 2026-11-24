# Firebase retirement — Cloudflare-native auth foundation

## Current implementation slice

The mainline retirement branch now contains Cloudflare Worker endpoints for:
- Google OpenID Connect Authorization Code + PKCE;
- Iranian phone OTP using Kavenegar delivery and locally verified keyed OTP digests;
- opaque D1-backed sessions in HttpOnly `__Host-radar_session` cookies;
- session lookup and revocation.

The route registry marks these endpoints `IMPLEMENTED`, not `VERIFIED`. The handlers fail closed when USER_DB schema or required runtime secrets are absent.

## Required Worker secrets

Provision these as Cloudflare Worker secrets, never as plaintext `vars` or committed files:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` (optional when the canonical APP_URL callback is used)
- `KAVENEGAR_API_KEY`
- `KAVENEGAR_VERIFY_TEMPLATE`
- `AUTH_PII_HMAC_SECRET` (minimum 32 characters)

The redirect URI registered with Google must exactly match the Worker callback URL.

## USER_DB migration sequence

`migrations/user-d1` contains migrations 0001–0010. The live production `radar-user-db` ledger was read and confirmed to contain exactly 0001–0006, with matching canonical names. The live database has a partial application of migration 0007: `user_sessions.token_hash` and `user_sessions.expires_at_iso` already exist, but `auth_provider` and auth identity/challenge tables do not.

**Do not run the raw Wrangler migration chain against the current production USER_DB.** The raw 0007 ALTER statements would collide with the two columns already present. Use `scripts/cloudflare/recover-user-d1-identity-migrations.mjs` after the configured D1 write-pause window has elapsed and the operator has supplied the required `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The script is dry-run by default and uses only additive DDL plus migration-ledger reconciliation for 0007–0009. Then apply migration 0010 separately through Wrangler and verify the resulting schema and ledger.

## Cutover boundary

The login UI and protected Express APIs are not switched in this slice. Several existing application and server modules still accept Firebase ID tokens or use Firebase Admin/Firestore directly. Do not remove their SDK dependencies or activate Cloudflare-only login until those API contracts have been migrated and tested together.

No Worker deployment, production D1 write, Firestore deletion, Firebase project deletion, or IRNI-owned resource mutation is performed by this code change.


## 24 November 2026 — mainline integration update

- The canonical USER_DB migration files 0001–0006 were restored into `migrations/user-d1`. Their exact filenames match the six rows in the live production `d1_migrations` ledger (read-only verification).
- Migration 0010 is present in the source chain for the D1 marketplace/neighborhood schema; it has **not** been applied to production.
- The route registry and Worker router now expose the six native auth endpoints through the Worker while preserving the existing global D1 write-pause and mutation-block gates.
- Google OAuth start/callback are GET requests that write OAuth state/session rows. The Worker now includes both in the D1 write-pause check so those GET endpoints cannot bypass a database freeze.
- The native auth regression suite is wired into `test:auth`, `test:cloudflare`, and the path-filtered Worker gate.
- The PR's initial GitHub Actions attempt failed before any runner steps were reported (runner id 0 / empty step list). Job logs were not available from GitHub. Rerun was attempted; no successful test result is claimed.
- Production Worker secrets have not been provisioned, no remote USER_DB migration has been applied, and no Firebase/Firestore resource has been deleted.


## 24 November 2026 — live Cloudflare cutover audit (read-only)

This section records the live Cloudflare account state inspected after the mainline integration update. It supersedes assumptions that the new login can already be enabled.

### Production USER_DB

- The live `radar-user-db` migration ledger contains exactly migrations 0001–0006.
- `user_sessions.token_hash` and `user_sessions.expires_at_iso` are present, but `user_sessions.auth_provider` is absent.
- `auth_identities`, `auth_oauth_states`, and `auth_phone_challenges` do not exist.
- Therefore migrations 0007–0009 are only partially reflected in the physical schema and are not recorded in the migration ledger. Do not run the raw migration chain. Use the idempotent recovery script only after confirming D1 write quota availability; then verify schema and ledger before enabling auth.
- The production Worker currently binds the user database as legacy alias `DB`, not `USER_DB`. The current resolver accepts this alias, but the cutover should converge on the explicit `USER_DB` binding and retain `DB` only during a tested compatibility window.

### Production identity configuration

- The live `radartehran-api` Worker secret inventory contains only `IRNI_PUBLISH_HMAC_SECRET` and `RESEARCH_HMAC_SECRET`.
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `KAVENEGAR_API_KEY`, `KAVENEGAR_VERIFY_TEMPLATE`, and `AUTH_PII_HMAC_SECRET` are not provisioned there.
- The live Worker still has `FIREBASE_PROJECT_ID` and `FIREBASE_APP_CHECK_MODE` plain-text bindings. Its current `APP_URL` points to the frontend `workers.dev` hostname, so the Google OAuth callback URI must be explicitly finalized and registered; do not infer or register a callback from the intended production hostname.
- Native Google OIDC code exists in the migration branch, but production Google sign-in is not configured or verified.

### Other Cloudflare resources and staging

- The account has three D1 databases: `radar-user-db`, `radar-neighborhood-db`, and `radar-researcher-db`.
- The account has three Workers: `radartehran-api`, `radartehran-api-staging`, and `radartehran-frontend`.
- The production API Worker has separate D1 bindings for user, research, and IRNI neighborhood data. Do not alter the IRNI-owned `radar-neighborhood-db` as part of Firebase retirement.
- R2 is not enabled for the account. R2-backed media routes must remain blocked; do not label them verified or remove the current storage path until a supported replacement and its data are available.
- The live staging API Worker references D1 ID `9bcadfaf-7dc1-4ee9-b821-19c8b57658b4`, which Cloudflare reports does not exist. Staging D1 provisioning/binding repair is required before it can validate this migration.
- No Cloudflare production resource, D1 row, Worker binding, secret, deployment, or Firebase resource was changed during this audit.

### Repository-wide scope

- The repository currently exposes 57 branches and 30 open pull requests.
- The new mainline migration branch still contains Firebase runtime/configuration paths, Firebase package dependencies, and Firestore-backed domain adapters. PR #58 is an authentication and D1 foundation, not complete retirement.
- PR #23 is a separate, heavily diverged migration stream (269 commits ahead and 217 behind the new mainline migration branch). Do not merge it wholesale.
- A branch-by-branch Firebase reference audit and migration plan is still required. Do not claim that all branches are clean until every branch tip has been checked and reconciled.
