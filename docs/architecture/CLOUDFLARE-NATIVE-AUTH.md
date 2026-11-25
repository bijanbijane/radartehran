# Cloudflare-native identity and session authentication

## Decision

The Radar API Worker no longer requires Firebase Authentication ID tokens or Firebase App Check tokens for protected Worker routes. Browser authentication uses an opaque, D1-backed session cookie.

## Request path

1. The browser talks to the Frontend Worker on the same origin.
2. The Frontend Worker forwards the original request, including the browser-managed `Cookie` header, through the `RADAR_API` Service Binding.
3. The Backend Worker validates the opaque `__Host-radar_session` cookie against the SHA-256 token hash stored in the operational `DB` D1 database.
4. The Backend Worker returns session rotation and logout cookies through the Service Binding response. The Frontend Worker must preserve every `Set-Cookie` header.
5. Mutating cookie-authenticated requests require an exact configured `Origin` match. A bearer token or Firebase App Check header is not an authentication fallback.

The raw session token is never stored in D1. The cookie is Secure, HttpOnly, host-only, Path=/, and SameSite=Lax. Session records have a bounded expiry and are checked against account status and revocation watermarks.

## Identity providers

- Google OpenID Connect: requires a Google OAuth client ID and secret. This is Google OAuth, not a Firebase project.
- Phone OTP: requires a Kavenegar API key and verify template.
- Both providers create/link identities in D1. The primary admin account is determined by the verified Google email configured in `ADMIN_EMAIL`; phone verification alone never grants admin rights.

## Required Cloudflare Worker secrets

Configure these on the dedicated `radartehran-api` Worker. Do not commit values:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `AUTH_PII_HMAC_SECRET` — at least 32 cryptographically random bytes
- `KAVENEGAR_API_KEY`
- `KAVENEGAR_VERIFY_TEMPLATE`

Set `APP_URL` to the exact public Frontend Worker origin. The Google OAuth redirect URI must be `${APP_URL}/api/auth/google/callback`.

## D1 migrations and operational pause

Apply user-D1 migrations 0007–0009 before enabling login. They add provider identities, opaque sessions, OAuth state, phone OTP challenges, per-IP rate limiting, and keyed OTP digests.

The existing `DB_WRITES_PAUSED_UNTIL_UTC` guard remains authoritative. OAuth start/callback explicitly return 503 while writes are paused; session reads remain available but do not update `last_seen`. Phone OTP, logout, and other POST mutations remain blocked by the global write pause.

## Boundaries and remaining migration work

This change retires Firebase Auth and App Check from the protected Worker API path. It does **not** by itself migrate every legacy Firestore read/write in the React client or the legacy Express compatibility server. Those are separate data-plane dependencies and must be migrated to the D1/R2 APIs before claiming the entire product is Firebase-independent.

Existing Firebase UID-owned records are not automatically re-keyed to new Google/phone identities. Before production cutover, any real legacy users and their owned records need a trusted UID mapping or an explicit account-recovery/linking procedure.
