# Implementation Inventory — Tehran Housing Radar (رادار مسکن)

## 1. Repository Stack & Runtime Truth
- **Frontend Framework**: React 19 (`19.0.1`) + TypeScript (`^7.0.2`) + Vite (`^8.3.0`) + Tailwind CSS v4 (`@tailwindcss/vite`).
- **Map Engine**: Leaflet (`1.9.4`) with keyless raster tile failover and server-side `/api/osm-tile/:z/:x/:y` proxy + Overpass/Nominatim/Voronoi GeoJSON boundary engine.
- **Backend Server**: Express (`^4.21.2`) executed via `tsx server.ts` on port `3000`.
- **Cloud Database & Auth**: Firebase Client SDK (`^13.1.0`) & Firebase Admin SDK (`^14.5.0`) configured via `firebase-applet-config.json` (`projectId: gen-lang-client-0713157837`, `firestoreDatabaseId: ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`).
- **Server-Side Persistence**: Asynchronous atomic JSON disk persistence at `.cache-data.json`, `.runtime-config.json` (secrets excluded), and `.object-storage-bucket/index.json` with `0o600` permissions.

---

## 2. Pre-Deployment Verification Matrix

| Area | Feature / Module | Status | Verified Implementation Location | Evidence & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Security** | Firestore Rules (`/votes`, `/bargains`, `/bargainOwners`, `/buyerAlerts`, `/sponsorRequests`, `/neighborhoodOverrides`, `/appConfig`, `/userPreferences`, `/admins`) | **PASS** | `firestore.rules`, `firestore.rules.test.ts` | Enforces deterministic IDs on `/votes` & `/buyerAlerts`, 24h vote cooldown, private `/bargainOwners` batch ownership, and `1..80` Tehran overrides. |
| **Security** | Server Admin Auth & Secret Hygiene (`verifyAdminApiAuthorization`, `verifyFirebaseUserAuthorization`) | **PASS** | `src/utils/serverAdminAndTelegramSecurity.ts`, `src/utils/serverRuntimeEnvStore.ts`, `tests/security-telegram-and-admin.test.ts` | Verifies Firebase ID tokens (Admin SDK / RSA256) and `ADMIN_API_SECRET`; never persists `SECRET_ENV_KEYS` to disk or `buyerLeads` to `.cache-data.json`. |
| **Object Storage** | Authenticated Media Upload, Magic-Bytes, WebP 800px & Byte-Range Streaming | **PASS** | `src/utils/serverObjectStorage.ts`, `src/utils/objectStorageUpload.ts`, `tests/object-storage-*.test.ts` | Enforces verified Firebase user token, strict Base64 & Magic-Bytes checks, `sharp` WebP (`failOn: 'error'`), 300-object / 2GB quota, and S3 HTTPS host allowlist. |
| **Domain Logic** | Unified Hedonic Engine (`FAST_SALE_FACTOR = 0.88`), PropTech Calculators & 1405 Tax/Inheritance Rules | **PASS** | `src/data/hedonicPricingEngine.ts`, `src/data/superModulesLogic.ts`, `src/data/legalAndBuildingLogic.ts`, `tests/domain-regressions.test.ts` | Separates tenant rahn liability from net equity, uses city median for inter-city migration, and replaces unverified TDS/dB numbers with `null`. |
| **Architecture** | Module Boundaries & `< 500` Line Guardrails | **PASS** | `scripts/check-architecture.ts`, `architecture-baseline.json`, `tests/architecture-guardrails.test.ts` | All feature components, hooks, domain modules, and server utilities stay below 500 lines with zero upward dependencies. |
