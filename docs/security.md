# Security Architecture & Audit — Tehran Housing Radar (رادار مسکن)

## 1. Firestore Security Rules (`firestore.rules`)
- **Authentication & Admin Identity**:
  - `isSignedIn()`: `request.auth != null`
  - `isVerifiedUser()`: `isSignedIn() && request.auth.token.email_verified == true`
  - `hasDelegatedAdminRole()`: `isVerifiedUser() && exists(/databases/$(database)/documents/admins/$(request.auth.uid)) && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'admin'`
  - `isAdmin()`: `isVerifiedUser() && (request.auth.token.email == 'masirsalamatt@gmail.com' || request.auth.token.email == 'radio837isf@gmail.com' || request.auth.token.email == 'bijanbijane.1@gmail.com' || hasDelegatedAdminRole())`
- **Collection Access Matrix**:
  - `/admins/{adminId}`: Admin `get` and `list` (`existing().role == 'admin'`), and `allow create, update, delete: if false;` (managed out-of-band via Admin SDK/Console).
  - `/votes/{voteId}`: Admin or owner `get` and bounded `list` (`hoodId >= 1 && hoodId <= 999`), verified owner `create` with deterministic ID `request.auth.uid + '_hood_' + string(incoming().hoodId)` and `createdAt == request.time && lastUpdatedAt == request.time`, owner `update` enforcing 24-hour cooldown (`request.time >= existing().lastUpdatedAt + duration.value(24, 'h')`), and owner/admin `delete`.
  - `/bargains/{bargainId}` & `/bargainOwners/{bargainId}`: Public `get` and bounded `list` (`hoodId >= 1 && hoodId <= 999`) on `/bargains` without exposing `userId`; ownership is stored in private `/bargainOwners/{bargainId}` and verified atomically via `hasBargainOwnerInCurrentBatch(bargainId)` and `ownsBargain(bargainId)`. Supports bounded `objectStorageKeys` and `objectStorageObjectIds` (`<= 6` items).
  - `/buyerAlerts/{alertId}`: Owner and admin `get`, admin-only bounded `list` (`hoodId >= 1 && hoodId <= 999`), verified owner `create` with deterministic ID `request.auth.uid + '_hood_' + string(incoming().hoodId)` and valid Iranian mobile regex `^09[0-9]{9}$`, owner/admin `update` and `delete`.
  - `/sponsorRequests/{requestId}`: Admin-only `get` and bounded `list` (`hoodId >= 1 && hoodId <= 999`), verified `create` enforcing `(incoming().status == 'pending' || isAdmin())` to prevent non-admin self-approval, and admin-only `update` (`status`, `expiresAtIso`) and `delete`.
  - `/publicSponsors/{hoodId}`: Public `get` and bounded `list` (`<= 60` docs) of approved agency sponsor badges without exposing internal billing/tracking metadata; admin-only `create`/`update`/`delete` validated by `isValidPublicSponsorDoc(hoodId)` (`status == 'approved'`).
  - `/neighborhoodOverrides/{hoodId}`: Public `get`/`list`, admin-only `create`/`update`/`delete` for all multi-city neighborhood IDs (`1..999`, formatted as numeric `<id>` or `hood_<id>`).
  - `/appConfig/{configId}`: Public `get` (`configId == 'featureFlags' || configId == 'monetization'`), `allow list: if false`, admin-only `create`/`update` with `isValidFeatureFlags()`, `allow delete: if false`.
  - `/userPreferences/{userId}`: Owner and admin `get`, admin-only `list`, owner `create`/`update` with validated `favoriteHoodIds` (`<= 25` IDs in `1..999`), and owner/admin `delete`.
  - `/{document=**}`: Explicit catch-all deny (`allow read, write: if false`).

## 2. Backend HTTP & API Security (`server.ts`, `src/utils/serverAdminAndTelegramSecurity.ts`)
- **Security Headers**: Sets `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **Body Size Limits**: `express.json({ limit: '250kb' })` for general API routes; `express.json({ limit: '70mb', strict: true })` restricted to authenticated `POST /api/object-storage/upload`.
- **Rate Limiting (`server.ts`)**:
  - General `/api/*` limiter: `180` requests per `60,000 ms` window per IP (bounded at `20,000` keys per bucket).
  - Map tile proxy (`/api/osm-tile/*`): `360` requests per `60,000 ms` window per IP.
  - Media upload (`POST /api/object-storage/upload`): `8` requests per `600,000 ms` (10-minute) window per IP.
  - Deep market sync (`POST /api/sync-real-prices` & `GET /api/market-pulse?refresh=1`): Admin-only + `3` requests per `600,000 ms` (10-minute) window per IP.
  - Buyer leads (`POST /api/buyer-alerts`): `5` requests per `3,600,000 ms` (1-hour) window per IP.
- **Secret & PII Protection**:
  - `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_API_SECRET`, `OBJECT_STORAGE_ACCESS_KEY`, and `OBJECT_STORAGE_SECRET_KEY` are never exposed in `/api/admin/runtime-config` responses or persisted in plaintext in `.runtime-config.json`.
  - Buyer contact leads are not persisted to `.cache-data.json`.
