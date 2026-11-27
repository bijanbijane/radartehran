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

## Worker -> Express session trust bridge

Cloudflare-native sessions are verified against D1 at the Worker edge. When a route still falls back to legacy Express, the Worker may forward the verified principal in a short-lived HMAC-SHA256 assertion:

- Header: `x-radar-session-assertion`, minted only by the Worker after D1 session verification.
- Claims are bound to HTTP method, exact path and query, correlation ID, and Worker-hop marker.
- Maximum assertion lifetime is 30 seconds. Express verifies the MAC with a constant-time comparison and rejects expired, malformed, mismatched, or unverifiable assertions.
- Express removes the private assertion header before downstream middleware and exposes the principal only through request-scoped AsyncLocalStorage.
- A present but invalid D1 session cookie fails closed; it must not downgrade to Firebase bearer credentials within the same request.
- Cloudflare session Admin authorization uses the primary/delegated role flags already verified from D1. Legacy Firebase bearer requests retain the existing Firebase/Firestore authorization path during the migration window.
- Firebase App Check is not treated as equivalent to a Cloudflare session. Routes that explicitly enforce App Check remain gated until their App Check contract is migrated separately.

The Worker and Express origin must both receive the same `AUTH_INTERNAL_HMAC_SECRET` as a secret (at least 32 random bytes). The value is intentionally blank in `.env.example`; do not commit or provision it through plaintext Worker vars. Missing bridge configuration returns HTTP 503 for a request carrying a D1 session cookie. No runtime secret has been provisioned and no deployment/cutover is included in this code change.



## 27 November 2026 — Worker runtime configuration retirement

- Removed obsolete `FIREBASE_PROJECT_ID`, `FIREBASE_PROJECT_NUMBER`, `FIREBASE_APP_CHECK_APP_ID`, and `FIREBASE_APP_CHECK_MODE` values from the Cloudflare API Worker configuration (`wrangler.backend.jsonc`), its preview-check configuration, and the legacy root Worker configuration (`wrangler.jsonc`).
- The Worker runtime's `WorkerEnv` contract and native OIDC/session authorization path do not declare or consume these Firebase variables. Worker browser authentication is Google OIDC + D1 opaque sessions; Firebase App Check is not part of the Worker session contract.
- Extended `scripts/cloudflare/validate-backend-config.mjs` to reject `FIREBASE_*` and `FIRESTORE_*` runtime variables across production, previews, and named environments. Added regression assertions to `tests/rt-db-triad-001.test.ts`.
- Replaced the obsolete App Check project-pinning workflow with `.github/workflows/worker-native-auth-config.yml`, a lightweight Node-only config guard. This avoids treating Firebase App Check as the active Worker auth mechanism.
- **Scope limitation:** this removes Firebase configuration from Worker runtime manifests only. Legacy Express adapters, Firestore-backed domain modules, frontend compatibility code, Firebase packages, and legacy emulator tests still exist and remain a separate migration program. Do not claim complete Firebase/Firestore retirement.
- **Verification status:** source/config changes committed on branch `fix/backend-remove-retired-firebase-worker-vars-2026-11-27`. The workflow is expected to run on the PR, but no CI pass is claimed until a GitHub runner actually executes it. No Worker deployment, production secret change, database mutation, Firebase project deletion, or Firestore data deletion was performed.


### CI execution note — PR #81

- Draft PR #81 triggered the new native-auth config workflow as run `45987535979`.
- GitHub assigned `runner_id: 0`, returned zero steps, and completed the job in approximately two seconds. A rerun (attempt 2) produced the same runner allocation failure (`runner_id: 0`, zero steps).
- The config validator and test suite have therefore **not executed** in GitHub Actions. This is an execution infrastructure blocker; it is not a source-level pass or source-level test failure.
