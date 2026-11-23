# Deployment & Operations Runbook

**Project**: رادار هوشمند محله‌ها و مسکن تهران و کلان‌شهرها (`gen-lang-client-0713157837` / `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`)

---

## 1. Complete Environment Variable Reference (`.env.example` & `RUNTIME_ENV_KEYS`)

Copy `.env.example` to `.env` (or configure in your hosting environment). All secret keys (`SECRET_ENV_KEYS`) are server-only and never exposed to client bundles or persisted in plaintext to `.runtime-config.json`:

| Variable | Required? | Default | Sensitivity | Description |
| :--- | :--- | :--- | :--- | :--- |
| `PORT` | No | `3000` | Public | HTTP port for the Express + Vite server. Must be `3000` in AI Studio preview. |
| `APP_URL` | Optional | Request Host | Public | Public canonical origin used when generating `/sitemap.xml` and `/robots.txt`. |
| `TRUST_PROXY_HOPS` | Optional | `false` / `1` | Public | Number of trusted reverse-proxy hops (`1..5`) for `req.ip` resolution. |
| `GEMINI_API_KEY` | Optional | Fallback Engine | **Secret** | Enables live Google Search Grounding in `/api/sync-real-prices` and AI clause analysis in `/api/contract-check`. |
| `GEMINI_MODEL` | Optional | `gemini-2.5-flash` | Public | Gemini model identifier used by server-side market & legal routes. |
| `TELEGRAM_BOT_TOKEN` | Optional | Empty | **Secret** | Server-side bot token for `/api/send-telegram`. |
| `TELEGRAM_CHANNEL_ID` | Optional | Empty | Public | Target Telegram channel/chat ID (e.g. `@TehranRadar`) for digest broadcasts. |
| `FIREBASE_PROJECT_ID` | Optional | `gen-lang-client-0713157837` | Public | Expected Firebase project ID for JWT `aud`/`iss` verification. |
| `FIREBASE_API_KEY` | Optional | From applet config | **Secret** | Optional server-side Firebase Web API key override. |
| `ADMIN_EMAIL` | Optional | `radio837isf@gmail.com` | Public | Primary bootstrap administrator email address. |
| `ADMIN_API_SECRET` | Optional | Empty | **Secret** | Optional `>= 24`-char server-to-server token for `X-Admin-Token` automation. |
| `VALUATION_SEAL_SECRET` | Required for valuation seals | Empty | **Secret** | 32-byte hexadecimal HMAC-SHA256 key; set via deployment secret store / `wrangler secret put`, never runtime config. |
| `VITE_NESHAN_API_KEY` | Optional | OSM/CARTO Fallback | Public/Server | Optional Neshan raster tile API key used by `/api/neshan-tile/:z/:x/:y`. |
| `OBJECT_STORAGE_PROVIDER` | Optional | `local` / `r2` | Public | Storage driver: `local` (`.object-storage-bucket/`), `r2` (Cloudflare R2 `auto` region), `arvan`, `liara`, or `s3`. |
| `OBJECT_STORAGE_BUCKET` | Optional | `radartehran-staging-media` | Public | Bucket name for property photos and videos. |
| `OBJECT_STORAGE_REGION` | Optional | `auto` / `us-east-1` | Public | Region identifier (`auto` automatically selected when `OBJECT_STORAGE_PROVIDER=r2`). |
| `OBJECT_STORAGE_ENDPOINT` | Optional | Empty | Public | HTTPS S3/R2-compatible endpoint URL (`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` for R2). |
| `OBJECT_STORAGE_PUBLIC_BASE_URL` | Optional | `/api/object-storage/file` | Public | Base URL prefix returned for public media objects. |
| `OBJECT_STORAGE_ACCESS_KEY` | Optional | Empty | **Secret** | S3/R2 access key ID (or `R2_ACCESS_KEY_ID` when `OBJECT_STORAGE_PROVIDER=r2`). |
| `OBJECT_STORAGE_SECRET_KEY` | Optional | Empty | **Secret** | S3/R2 secret access key (or `R2_SECRET_ACCESS_KEY` when `OBJECT_STORAGE_PROVIDER=r2`). |
| `OBJECT_STORAGE_MAX_IMAGE_MB` | Optional | `10` | Public | Maximum image upload size in MB (`1..20`). |
| `OBJECT_STORAGE_MAX_VIDEO_MB` | Optional | `50` | Public | Maximum video upload size in MB (`5..100`). |
| `OBJECT_STORAGE_ALLOWED_HOSTS` | Optional | Default S3/R2/Arvan/Liara | Public | Comma-separated allowlist of HTTPS S3/R2 endpoints to prevent SSRF. |
| `R2_ACCOUNT_ID` | Optional | Empty | Public | Cloudflare account ID used to construct `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`. |
| `R2_SIGNING_SECRET` | Optional | Empty | **Secret** | Worker HMAC-SHA256 secret for presigned R2 media URLs (`worker/storage/r2StorageAdapter.ts`). |
| `CASPER_HUB_URL` | Optional | `https://casper-hub-api.bijanbijane-1.workers.dev` | Public | Server-side base URL for the shared CASPER HUB coordination service (`server/modules/casper-hub`). |
| `CASPER_HUB_TOKEN` | Optional | Empty | **Secret** | Dedicated server-only Bearer credential for authenticating `CASPER-02` with CASPER HUB. Never exposed to the browser or persisted to disk. |
| `BACKUP_ENCRYPTION_KEY` | Optional | Empty | **Secret** | Symmetric key for encrypted AES-256-GCM admin full-backup exports (`/api/admin/encrypted-backup/*`). |
| `VITE_FIREBASE_APP_CHECK_SITE_KEY` | Optional | Empty | Public | Browser reCAPTCHA Enterprise site key enabling client-side Firebase App Check initialization (`src/utils/clientAppCheck.ts`). |

---

## 2. Build, Verify & Run Commands

```bash
npm install
npm run lint
npm run arch:check
npm test
npm run test:cloudflare
npx tsx tests/stress-50-cycles.test.ts
npx tsx tests/object-storage-upload-auth.test.ts
npx tsx tests/object-storage-security.test.ts
npx tsx tests/object-storage-range.test.ts
npm run build
npm run cf:dry-run:staging
NODE_ENV=production npm start
```

---

## 3. Deploying Firestore Security Rules

1. Confirm all behavioral assertions in `firestore.rules.test.ts` pass against the local Firestore Emulator (`npm run test:rules`).
2. Deploy `firestore.rules` to the provisioned Firebase project (`projectId: gen-lang-client-0713157837`, database: `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`):
   ```bash
   firebase deploy --only firestore:rules
   ```

---

## 4. Operational Runbook (10 Core Production Scenarios)

1. **Routine Health Check**: Call `GET /api/system-health` (Node) or `GET /api/healthz` / `GET /api/admin/worker-diagnostics` (Cloudflare Worker) with an Admin Bearer token. Verify `status === "ok"`.
2. **Startup Failure (`EADDRINUSE` / Port 3000)**: Inspect `[DIAGNOSTIC PORT CONFLICT]` log; ensure no duplicate process is bound to `3000` before restarting.
3. **Authentication Failure (`401` / `403` on Admin Endpoints)**: Verify the operator signed in via Google Popup with a verified email matching `ADMIN_EMAILS` or has `/admins/{uid}` (`role: 'admin'`).
4. **Firestore Permission Errors (`PERMISSION_DENIED`)**: Inspect the structured JSON error produced by `handleFirestoreError` (`operationType`, `path`, `authInfo`). Verify deterministic document IDs (`${uid}_hood_${hoodId}`) and the 24-hour vote cooldown.
5. **Object Storage Upload Failures (`413`, `415`, `502`, `503`, `507`)**: Check `GET /api/object-storage/status`. `415` indicates invalid magic bytes; `502` indicates fail-closed remote R2/S3 write error; `503` indicates all `MAX_CONCURRENT_SHARP_JOBS` slots are busy; `507` indicates the 300-object or 2 GB quota is full.
6. **Orphaned File & Pending-Delete Cleanup**: Run `POST /api/object-storage/admin/orphan-audit` (`{"dryRun": true}`) first, inspect candidate object keys, and only execute with `{"dryRun": false}` after verifying zero active references in `/bargains`.
7. **Corrupted or Stale `.cache-data.json`**: `loadDiskPersistedCache()` automatically discards invalid/out-of-bounds records and legacy un-scoped numeric keys. To force a clean refresh, trigger `POST /api/sync-real-prices` as an admin.
8. **External API Outage (Open-Meteo / Gemini / Overpass / Neshan)**: All external dependencies fail open to deterministic local fallbacks (`CITY_AIR_STATIONS` seed AQI, rule-based legal contract checker, Voronoi neighborhood polygons, and CARTO/OSM SVG fallback tiles).
9. **Safe Secret & Credential Rotation**: Update secrets (`GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_API_SECRET`, `OBJECT_STORAGE_SECRET_KEY`, `R2_SIGNING_SECRET`) via environment variables or `wrangler secret put --env staging`; never commit secrets to Git or `.runtime-config.json`.
10. **Emergency Rollback**: On Cloudflare Workers, run `npx wrangler rollback <version-id> --env staging` (or `--env production`). On Node/Containers, revert the container/commit and use the Admin Panel's **Validated Atomic JSON Restore**.

---

## 5. Cloudflare Workers & Staging Deployment (`radartehran-staging`)

See [`docs/cloudflare/CLOUDFLARE-MASTER-OPERATIONS.md`](./cloudflare/CLOUDFLARE-MASTER-OPERATIONS.md) for the complete 31-section Cloudflare architecture, D1 migration commands, R2 bucket provisioning, KV/Queue bindings, and staging cutover runbook.


