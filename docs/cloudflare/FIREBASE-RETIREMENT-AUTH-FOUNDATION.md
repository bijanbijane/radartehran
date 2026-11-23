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
