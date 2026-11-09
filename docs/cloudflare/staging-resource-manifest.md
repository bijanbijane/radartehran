# Staging Resource Manifest & Provisioning Specifications (Phase 10-A)
## Tehran Radar — Cloudflare Staging Infrastructure Inventory

**Document Reference**: `docs/cloudflare/staging-resource-manifest.md`  
**Phase**: 10-A (Staging Environment Preparation & Deployment Preflight)  
**Evaluation Date**: November 2026  
**Status**: `PREPARED_WITH_DOCUMENTED_LIMITATIONS`  
**Provisioning State**: All remote cloud resources are `CONFIGURED_NOT_PROVISIONED` or `LOCAL_SIMULATION_ONLY`. No live cloud resources created.

---

## 1. Master Cloudflare Staging Resource Manifest

| Resource Name | Intended Cloudflare Binding | Target Type | Classification | Required Provisioning Command (Phase 10-B) | Expected Monthly Cost | Rollback Strategy |
|---|---|---|---|---|---|---|
| `radartehran-staging` | Service Worker | Worker Script | `CONFIGURED_NOT_PROVISIONED` | `wrangler deploy --env staging` | Included ($5/mo plan) | `wrangler rollback --env staging` |
| `ASSETS` | `ASSETS` | Static CDN Binding | `EXISTING_AND_VERIFIED` | Bundled in `./dist` via Vite | Free / Included | Rebuild static bundle |
| `radartehran-staging-db` | `DB` | Cloudflare D1 | `CONFIGURED_NOT_PROVISIONED` | `wrangler d1 create radartehran-staging-db` | $0.00 (within 25B read limit) | Recreate Staging D1 |
| `radartehran-staging-media` | `MEDIA_BUCKET` | Cloudflare R2 | `CONFIGURED_NOT_PROVISIONED` | `wrangler r2 bucket create radartehran-staging-media` | $0.00 (within 10GB free limit) | Delete staging objects |
| `radartehran-staging-kv` | `RADAR_KV` | Workers KV | `CONFIGURED_NOT_PROVISIONED` | `wrangler kv namespace create radartehran-staging-kv` | $0.00 (within 10M read limit) | Flush KV namespace |
| `radartehran-staging-queue` | `RADAR_QUEUE` | Cloudflare Queue | `CONFIGURED_NOT_PROVISIONED` | `wrangler queues create radartehran-staging-queue` | $0.00 (within 1M ops limit) | Purge queue messages |
| `radartehran-staging-dlq` | `RADAR_DLQ` | Cloudflare Queue (DLQ) | `CONFIGURED_NOT_PROVISIONED` | `wrangler queues create radartehran-staging-dlq` | $0.00 (within 1M ops limit) | Purge DLQ messages |
| *Durable Objects* | *None* | Class Binding | `NOT_REQUIRED` | None (No DO required in v1) | $0.00 | N/A |

---

## 2. Detailed Staging Resource Specifications

### 2.1 Staging Worker: `radartehran-staging` (`workers_dev: true`)
- **Purpose**: Executes migrated `/api/*` and SEO endpoints, processes `RADAR_QUEUE` messages, and injects dynamic SSR SEO tags on SPA requests via `workers.dev`.
- **Dependencies**: Static assets in `./dist` (`ASSETS`).
- **Permissions**: Workers Scripts Read/Write, Assets Read.
- **Expected Invocations**: ~5,000 to 25,000 requests / month during staging testing.
- **Pricing**: Included in Workers Paid tier ($5/mo).
- **Rollback**: `npx wrangler rollback --env staging`.

### 2.2 Staging D1 Database: `radartehran-staging-db` (Binding: `DB`)
- **Purpose**: Provides schema validation and derived relational query acceleration for staging property projections and upload sessions.
- **Dependencies**: Canonical SQL migration files in `migrations/d1/*.sql`.
- **Permissions**: D1 Read/Write (isolated in `staging-bootstrap` and `staging-migrations`).
- **Lifecycle & Backup**: Non-destructive schema migration tracked exclusively via Wrangler's authoritative `d1_migrations` ledger with SHA-256 integrity verification.
- **Authoritative Rule**: Cloud Firestore (`ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`) remains the primary transactional source of truth.

### 2.3 Staging R2 Bucket: `radartehran-staging-media` (Binding: `MEDIA_BUCKET`)
- **Purpose**: Isolated storage for staging property photos, videos, floorplans, and valuation certificates.
- **Dependencies**: `worker/storage/r2StorageAdapter.ts`.
- **Permissions**: R2 Read/Write/Delete within `radartehran-staging-media`.
- **Access Control**: Strict HMAC-SHA256 signed URLs (`R2_SIGNING_SECRET`); public listing disabled.

### 2.4 Staging KV Cache: `radartehran-staging-kv` (Binding: `RADAR_KV`)
- **Purpose**: Ephemeral edge caching for SWR market pulse indicators and Firebase Google JWKS public keys.
- **Key Prefixing**: Strictly namespaced (`v1:staging:market_pulse:*`, `v1:auth:firebase_jwks`).
- **Data Exclusion Invariant**: Absolute prohibition on storing PII, user phone numbers, or authoritative auth state in KV.

### 2.5 Staging Queues: `radartehran-staging-queue` (`RADAR_QUEUE`) & `radartehran-staging-dlq` (`RADAR_DLQ`)
- **Purpose**: Asynchronous execution of background D1 projection sync, R2 orphan sweeps, and telemetry aggregation.
- **Consumer Settings**: `max_batch_size: 10`, `max_batch_timeout: 5`, `max_retries: 3`, `dead_letter_queue: "radartehran-staging-dlq"`.
- **Poison Handling**: Messages failing 3 consecutive attempts or permanent validation route automatically to `radartehran-staging-dlq` without stalling the batch.
