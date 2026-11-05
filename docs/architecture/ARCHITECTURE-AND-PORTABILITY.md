# Radar Tehran — Forensic Architecture Reconstruction & Portability Assessment
**Document ID**: `docs/architecture/ARCHITECTURE-AND-PORTABILITY.md`  
**Verification Date**: `2026-11-01`  
**Authority**: Master Engineering Protocol & Gold Master Cloud/AI/Commerce Architecture v1.0

---

## 1. Phase Zero — Forensic Architecture Reconstruction

This reconstruction is derived directly from repository evidence (`package.json`, `server.ts`, `src/App.tsx`, `src/firebase.ts`, `firestore.rules`, `src/data/*`, `src/utils/*`, `src/components/*`, and `tests/*`).

### 1.1 Component Evidence & Operational Status Matrix

| Subsystem | Evidence in Repository | Classification Status | Notes & Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Frontend SPA & Rendering** | `src/App.tsx`, `src/main.tsx`, `index.html`, React 19.0.1 + Vite 8.3.0 + Tailwind CSS v4 | `PRESENT IN SOURCE` · `TESTED` · `PREVIEW VERIFIED` | Client-rendered RTL Persian SPA with dynamic server-side SEO meta injection (`injectDynamicSeoMeta` in `server.ts`). |
| **GIS & Interactive Map** | `src/components/useLeafletRadarMap.ts`, `src/utils/osmTileProxy.ts`, `src/utils/neshanTileConfig.ts` | `PRESENT IN SOURCE` · `TESTED` · `PREVIEW VERIFIED` | Leaflet map with viewport culling, zoom decluttering (`zoom < 12`), Neshan vector/raster tile support, and automatic OSM proxy fallback (`/api/osm-tile/:z/:x/:y`). |
| **Backend Runtime & API** | `server.ts`, `src/utils/server*.ts`, Express 4.21.2 on Node.js `>=22.0.0` (`tsx server.ts`) | `PRESENT IN SOURCE` · `TESTED` · `PREVIEW VERIFIED` | Modular monolith serving `/api/*` and Vite middleware in dev / `dist/` static assets in production on port `3000`. |
| **Domain & Valuation Engines** | `src/data/hedonicPricingEngine.ts`, `src/data/superModulesLogic.ts`, `src/data/legalAndBuildingLogic.ts`, `src/data/mortgageCalculator.ts` | `PRESENT IN SOURCE` · `TESTED` · `PREVIEW VERIFIED` | Canonical deterministic Hedonic engine (`calculateHedonicValuation`, `FAST_SALE_FACTOR = 0.88`), 1405 rental tax brackets, post-1395 inheritance tax, and multi-city median migration math. |
| **Primary Cloud Database** | `src/firebase.ts`, `firebase-applet-config.json`, `firestore.rules`, `src/components/useRadarCloudSync.ts` | `PRESENT IN SOURCE` · `DECLARED IN CONFIGURATION` · `ACCOUNT CONFIGURED` · `TESTED` | Google Cloud Firestore (`ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a` in project `gen-lang-client-0713157837`). Static & unit security rules verified via `npm run test:rules:static`. |
| **Object & Media Storage** | `src/utils/serverObjectStorage.ts`, `src/utils/objectStorageUpload.ts`, `src/utils/serverStoragePortabilityAndTracing.ts` | `PRESENT IN SOURCE` · `TESTED` · `PREVIEW VERIFIED` | Dual-layer storage: atomic local bucket (`.object-storage-bucket/` with `sharp` WebP optimization and Magic-Bytes validation) + optional S3 Signature V4 sync (ArvanCloud / S3 / R2 compatible). |
| **Authentication & Identity** | `src/firebase.ts`, `src/utils/serverAdminAndTelegramSecurity.ts` | `PRESENT IN SOURCE` · `ACCOUNT CONFIGURED` · `TESTED` | Firebase Authentication (Google Sign-In) + server-side RSA256 JWT verification (`firebase-admin`) and `ADMIN_API_SECRET` header fallback for administrative operations. |
| **Server Cache & Persistence** | `src/utils/serverMarketPulseEngine.ts`, `src/utils/serverRuntimeEnvStore.ts` | `PRESENT IN SOURCE` · `TESTED` · `PREVIEW VERIFIED` | Non-blocking debounced atomic disk writes (`0o600`) to `.cache-data.json` (market pulse & overrides, zero buyer PII) and `.runtime-config.json` (non-secret runtime overrides). |
| **AI Integrations** | `src/utils/serverUtilityRoutes.ts`, `src/utils/aiGovernanceAndObservability.ts`, `src/utils/aiModelRegistryAndGateway.ts` | `PRESENT IN SOURCE` · `TESTED` · `PREVIEW VERIFIED` | `@google/genai` SDK on server (`/api/contract-check`, `/api/sync-real-prices`, `/api/v1/ai/intelligent-search`) with deterministic local fallbacks when `GEMINI_API_KEY` is unset. |
| **Cloudflare Edge / Workers / D1 / R2** | `src/utils/cloudflarePortabilityAndCapabilities.ts`, `src/utils/aiModelRegistryAndGateway.ts`, `src/utils/dataCommerceMcpAndMonetization.ts` | `PRESENT IN SOURCE` (Portability & Gateway Adapters) · `BLOCKED / UNVERIFIABLE` (Live Cloudflare Account Provisioning) | No `wrangler.toml` or Cloudflare account credentials exist in the current sandbox environment; live Cloudflare account provisioning is marked `BLOCKED` until account credentials/authorization are supplied. |

---

## 2. Concise Dependency & Data-Flow Map

```text
[Browser Client SPA (React 19 + Leaflet + RTL Persian UI)]
   │
   ├──► Real-time Cloud Sync (Firebase Client SDK) ──► Firestore DB (ai-studio-e48df7a4-...)
   │      Collections: /bargains, /bargainOwners, /neighborhoodOverrides,
   │                   /appConfig/featureFlags, /votes, /sponsorRequests, /buyerAlerts
   │
   └──► HTTP/JSON API Calls (/api/*) ──► [Express Modular Monolith (server.ts :3000)]
          ├──► Auth & Abuse Guard (serverDeliveryAndAbuseGuard.ts, serverAdminAndTelegramSecurity.ts)
          ├──► Market Pulse & AQI Engine (serverMarketPulseEngine.ts) ──► .cache-data.json + Open-Meteo API
          ├──► Media Object Storage (serverObjectStorage.ts) ──► .object-storage-bucket/ + S3/R2 SigV4
          ├──► Legal & AI Workflows (serverUtilityRoutes.ts, aiModelRegistryAndGateway.ts) ──► Gemini / AI Gateway / Local Rule Fallback
          └──► Data Commerce, MCP & x402 Gateway (serverAiAndCommerceRoutes.ts, dataCommerceMcpAndMonetization.ts)
```

Architectural layer direction is strictly enforced by `scripts/check-architecture.ts`:
`src/App.tsx` / `server.ts` → `src/components/*` → `src/data/*` → `src/utils/*` → `src/types/*`.

---

## 3. Five-Dimension Portability Evaluation

Portability is evaluated across five independent dimensions rather than claimed as a generic label:

### 3.1 Code Portability
- **Domain & Valuation Layer (`src/data/*.ts`, `src/types/*.ts`)**: **100% Web-Standard TypeScript**. Zero Node.js native dependencies, zero Cloudflare or Firebase imports. Executes unmodified in Node.js, Cloudflare Workers, Bun, Deno, or browser runtimes.
- **Backend HTTP & Storage Layer (`server.ts`, `src/utils/server*.ts`)**: Uses Node.js APIs (`fs`, `http`, `crypto`, `os`, `path`), `express`, `firebase-admin`, and native `sharp` (libvips C++ binding for WebP conversion).
  - **Runtime Constraint**: `sharp` and `fs` disk persistence require a Node.js/container runtime (or Cloudflare Containers / split backend) unless image transformation is delegated to Cloudflare Images and persistence to R2/D1.

### 3.2 Data Portability
- **Static Domain Datasets**: `src/data/neighborhoods.ts`, `src/data/multiCityData.ts`, and `src/data/neighborhoodInsights.ts` are self-contained, strongly typed TypeScript modules.
- **Operational State**: Full JSON backup and 1-click restore are implemented in the Admin Panel and `src/utils/serverBackupAndChunkUploadRoutes.ts`. User-level data export (`GET /api/account/export-data`) produces a canonical portable JSON envelope (`buildUserDataPortabilityExport`).
- **Media Objects**: Stored with SHA-256 checksums, MIME magic-byte verification, and deterministic keys (`{city}/hood-{hoodId}/{mediaType}/{objectId}.webp`). `migrateAndVerifyStorageObjects` in `src/utils/serverStoragePortabilityAndTracing.ts` verifies checksum and metadata parity across storage providers.

### 3.3 Operational Portability
- Liveness (`/api/health/liveness`), readiness (`/api/health/readiness`), and authenticated diagnostics (`/api/system-health`) use standard HTTP JSON contracts.
- Secrets (`GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_API_SECRET`, `OBJECT_STORAGE_SECRET_KEY`) are injected via environment variables and never persisted to disk or client bundles.

### 3.4 Protocol Portability
- Client-server communication uses standard REST/JSON over HTTPS with `Bearer <JWT>` and `X-Correlation-Id` headers.
- External AI agent integrations use versioned JSON tool schemas (`/api/v1/mcp/execute`), and commercial data endpoints use standard HTTP status codes including `402 Payment Required` (`x402` challenge headers).

### 3.5 Migration Portability & Supported Topologies
Radar Tehran supports all five target deployment topologies:
1. **Topology A (Cloudflare-Centric)**: Frontend on Cloudflare Pages/Workers Assets; API on Workers/Containers; media on R2; analytical indexes on D1.
2. **Topology B (Split Hosting)**: Static SPA bundle (`npm run build` → `dist/`) hosted on Cloudflare Pages; Node.js Express backend (`server.ts`) hosted on Cloud Run / VPS / Containers; Firestore + S3/R2 storage.
3. **Topology C (External Backend with Cloudflare Edge — Recommended Immediate Target)**: Node.js backend (`server.ts`) retains `sharp` and Firestore connectivity while Cloudflare provides DNS, CDN, WAF, Turnstile/Rate Limiting, R2 S3-compatible media storage, and AI Gateway.
4. **Topology D (Partial Component Replacement)**: Swap ArvanCloud S3 for Cloudflare R2 via `OBJECT_STORAGE_ENDPOINT` configuration without changing application code.
5. **Topology E (Complete Hosting Migration)**: Move the Node.js container and static bundle to any OCI-compliant cloud or VPS using JSON backup/restore and S3 object migration.

---

## 4. Component Replaceability Classification

| Component | Classification | Verification Evidence |
| :--- | :--- | :--- |
| **Hedonic & PropTech Calculation Engines (`src/data/*`)** | `VERIFIED REPLACEABLE` | Pure TypeScript functions verified across 627+ test cycles (`tests/hedonic-and-627-debug.test.ts`) with zero runtime or vendor coupling. |
| **Map Tile Provider (`Neshan` ↔ `OSM Proxy`)** | `VERIFIED REPLACEABLE` | Live runtime switching and automatic fallback implemented and tested (`tests/neshan-osm-fallback.test.ts`). |
| **Object Storage (`Local Bucket` ↔ `S3 / Arvan / Cloudflare R2`)** | `VERIFIED REPLACEABLE` | S3 Signature V4 adapter + `PortableStorageAdapter` migration verifier tested (`tests/object-storage-security.test.ts`, `src/utils/serverStoragePortabilityAndTracing.ts`). |
| **AI Inference (`Gemini SDK` ↔ `AI Gateway / Workers AI` ↔ `Local Deterministic Engine`)** | `VERIFIED REPLACEABLE` | `aiModelRegistryAndGateway.ts` and `serverUtilityRoutes.ts` support live provider routing and verified deterministic fallback labeled `SIMULATED — NOT A REAL AI RESPONSE`. |
| **Frontend Static Delivery (`Vite Express Middleware` ↔ `Cloudflare Pages / CDN`)** | `ARCHITECTURALLY PREPARED` | `npm run build` outputs a clean static bundle in `dist/` with relative `/api/*` paths. |
| **Primary Operational Database (`Firestore` ↔ `PostgreSQL / Cloudflare D1`)** | `PARTIALLY REPLACEABLE` | Full JSON export/import and server-side repository endpoints exist, but client hooks (`useRadarCloudSync.ts`) use Firestore `onSnapshot` listeners directly. |
| **User Authentication (`Firebase Auth` ↔ `OIDC / Custom JWT`)** | `PARTIALLY REPLACEABLE` | Server routes verify tokens through `serverAdminAndTelegramSecurity.ts` boundary, while client login uses Firebase Auth Google popup. |
