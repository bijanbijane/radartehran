# Radar Tehran — Provider Replacement & Portability Matrix
**Document ID**: `docs/architecture/PROVIDER-REPLACEMENT-MATRIX.md`  
**Verification Date**: `2026-11-01`  
**Authority**: Master Engineering Protocol & Gold Master Cloud/AI/Commerce Architecture v1.0

---

## 1. Provider Dependency & Replacement Matrix

| Subsystem | Current Primary Provider | Provider-Specific Coupling in Source | Verified / Prepared Alternatives | Migration Effort | Portability Status | Verification Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Property Valuation & PropTech Math** | Internal Pure TypeScript (`src/data/hedonicPricingEngine.ts`, `src/data/superModulesLogic.ts`) | None (Zero external SDK or runtime imports) | Any JS/TS runtime (Node.js, Cloudflare Workers, Bun, Deno, Browser) | **Zero** (Drop-in) | `VERIFIED REPLACEABLE` | `tests/hedonic-and-627-debug.test.ts`, `scripts/check-architecture.ts` |
| **Interactive Map Tiles** | Neshan Raster/Vector + OSM Proxy (`src/utils/neshanTileConfig.ts`, `src/utils/osmTileProxy.ts`) | Standard XYZ `{z}/{x}/{y}` tile URL template in Leaflet | OpenStreetMap Direct/Proxy, Mapbox, Cloudflare-cached XYZ tiles | **Low** (1-click runtime toggle in Admin Panel) | `VERIFIED REPLACEABLE` | `tests/neshan-osm-fallback.test.ts` |
| **Media Object Storage** | Local Atomic Bucket (`.object-storage-bucket/`) + ArvanCloud S3 (`src/utils/serverObjectStorage.ts`) | AWS Signature V4 HTTPS PUT/DELETE in `src/utils/objectStorageUpload.ts` | **Cloudflare R2**, AWS S3, MinIO, Backblaze B2, Portable Memory Adapter | **Low** (Env vars `OBJECT_STORAGE_PROVIDER=r2`, `OBJECT_STORAGE_ENDPOINT`, plus `migrateAndVerifyStorageObjects`) | `VERIFIED REPLACEABLE` | `tests/object-storage-security.test.ts`, `tests/object-storage-range.test.ts`, `src/utils/serverStoragePortabilityAndTracing.ts` |
| **AI Model Inference & Routing** | Google Gemini (`@google/genai` in `src/utils/serverUtilityRoutes.ts`) | Confined to backend adapter boundary (`serverUtilityRoutes.ts`, `aiModelRegistryAndGateway.ts`) | **Cloudflare AI Gateway**, **Cloudflare Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`), OpenAI-compatible API, Local Deterministic Engine | **Low** (Admin runtime routing switch + rollback in `AiModelRoutingManager`) | `VERIFIED REPLACEABLE` | `tests/cloudflare-ai-commerce-architecture.test.ts` |
| **Commercial Payment & API Metering** | Internal Entitlement & x402 Engine (`src/utils/dataCommerceMcpAndMonetization.ts`) | Provider-independent challenge/verification contract | **Cloudflare Monetization Gateway (x402)**, Zarinpal / Iranian IPG, Contractual Enterprise API Keys | **Low** (Adapter plug-in on settlement webhook) | `ARCHITECTURALLY PREPARED` | `tests/cloudflare-ai-commerce-architecture.test.ts` |
| **Frontend SPA Hosting** | Express Static / Vite Middleware (`server.ts`) | Relative `/api/*` fetches; configurable API base URL | **Cloudflare Pages**, Cloudflare Workers Static Assets, Nginx, Vercel | **Low** (`npm run build` outputs standalone `dist/` bundle) | `ARCHITECTURALLY PREPARED` | `npm run build` |
| **Backend Application Runtime** | Node.js `>=22.0.0` + Express (`server.ts`) | Uses `fs`, `http`, `sharp` (C++ image WebP processing), and `firebase-admin` | Cloud Run, Docker VPS, Kubernetes, or Cloudflare Containers (Workers requires offloading `sharp` to Cloudflare Images) | **Medium** (Container move is immediate; pure V8 Worker requires replacing `sharp` and `fs`) | `PARTIALLY REPLACEABLE` | `tests/stress-50-cycles.test.ts` |
| **Primary Operational Database** | Google Cloud Firestore (`src/firebase.ts`, `src/components/useRadarCloudSync.ts`) | Client real-time `onSnapshot` listeners + `firestore.rules` | PostgreSQL (Cloud SQL / Supabase), Cloudflare D1 (requires replacing `onSnapshot` with polling/SSE + REST CRUD) | **Medium-High** (Full JSON backup/restore exists in Admin Panel, but client sync hooks require adapter swap) | `PARTIALLY REPLACEABLE` | `docs/backup-and-recovery.md`, `tests/fifty-step-audit.test.ts` |
| **User & Admin Identity** | Firebase Authentication (`src/firebase.ts`, `serverAdminAndTelegramSecurity.ts`) | Client Google OAuth popup + server RSA256 JWT verifier | Cloudflare Access (Zero Trust) for Admin, OIDC / Custom JWT | **Medium** (Server auth is isolated in `verifyFirebaseUserAuthorization` / `verifyAdminApiAuthorization`) | `PARTIALLY REPLACEABLE` | `tests/security-telegram-and-admin.test.ts` |

---

## 2. Controlled Migration & Rollback Protocol

For any future provider switch (e.g., ArvanCloud S3 → Cloudflare R2, or Direct Gemini → Cloudflare AI Gateway):
1. **Pre-Cutover Backup**: Export full JSON database snapshot via Admin Panel (`پشتیبان‌گیری کامل دیتابیس`) and verify object storage checksums (`migrateAndVerifyStorageObjects`).
2. **Single Source of Truth**: Never enable uncoordinated dual writes. Maintain one authoritative store per dataset during cutover.
3. **Canary Verification**: Test target provider in preview/staging using the Admin Control Center (`پنل مدیریت ← مرکز هوش مصنوعی و تجارت داده`).
4. **Instant Rollback**: Use `AiModelRoutingManager.rollbackToPreviousConfig()` for AI routing or restore previous `.runtime-config.json` / environment variables within `< 60 seconds`.
