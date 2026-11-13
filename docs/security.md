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
  - `/sponsorRequests/{requestId}`: Admin-only `get` and bounded `list` (`hoodId >= 1 && hoodId <= 999`), verified `create` enforcing `(incoming().status == 'pending' || isAdmin())` to prevent non-admin self-approval with 1-month or 3-month (20% discount ±0.1M rounding tolerance) tariff validation, and admin-only `update` (`status`, `expiresAtIso`) and `delete`.
  - `/neighborhoodOverrides/{hoodId}`: Public `get`. Public `list` requires `hoodId >= 1 && hoodId <= 999`. Admin-only `create`/`update`/`delete` for ids `1..999` (`<id>` or `hood_<id>`). The public sponsor card is `neighborhoodOverrides.sponsor` (`name`, `phone`, `specialty`, `experienceYears`, optional `expiresAtIso` and `planType`) validated by `isValidOverrideSponsor`. Optional `pros` and `cons` are strings of at most 400 characters. Price fields are `buyPerSqm` `10..5000` and `rahn80m` `50..100000`.
  - `/appConfig/{configId}`: Public `get` (`configId == 'featureFlags' || configId == 'monetization'`), `allow list: if false`, admin-only `create`/`update` with `isValidFeatureFlags()`, `allow delete: if false`.
  - `/userPreferences/{userId}`: Owner and admin `get`, admin-only `list`, owner `create`/`update` with validated `favoriteHoodIds` (at most 25 members, and every member is an integer from 1 to 999), and owner/admin `delete`.
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
  - `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_API_SECRET`, `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY`, and `CASPER_HUB_TOKEN` are never exposed in `/api/admin/runtime-config` responses, encrypted backup envelopes (`scrubSecretsFromBackupObject`), or `.runtime-config.json`.
  - `/api/admin/casper-hub/*` routes enforce admin RBAC (`verifyAdminAuth`), rate limiting (`30 req/min` with `Retry-After: 60`), SHA-256 token-digest identity binding (`CASPER-03`), `redirect: "manual"`, SSRF host validation, and prompt-injection/token-redaction shields.
  - Buyer contact leads are not persisted to `.cache-data.json`.

## 2.1 Epistemic Trust & User-Facing Price Claims
- **No false transaction facts**: UI copy under `src/components/**` must not use forbidden deal-fact phrases (`FORBIDDEN_DEAL_FACT_LABELS` in `src/utils/epistemicUiLabels.ts`) unless negated in context (e.g. «مشاهده آگهی ≠ نرخ قطعی معامله»).
- **Consistent evidence**: High-traffic views (Compare, Inspector, Intelligence) must aggregate with live listing samples and show `EpistemicMarketDisclaimer` when `isDealPriceDisplayableAsFact` is false.
- **Regression**: `tests/engineering-quality-foundation.test.ts` scans components for forbidden labels; `tests/real-market-price-aggregator.test.ts` asserts zero-sample paths do not fabricate listings or present verified deal facts.
- **Listing verdict (client)**: `ListingVerdictHero` and `InstantListingVerifierModal` must both call `buildListingVerdict` in `src/utils/listingVerdictService.ts` (live comparables + `disclaimerFa` + hood mismatch guard). Never call `diagnoseListingDeal` directly from UI. Covered by `tests/listing-verdict-service.test.ts`.
