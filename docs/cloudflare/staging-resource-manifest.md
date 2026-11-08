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
| `radartehran-staging` | Service Worker | Worker Script | `CONFIGURED_NOT_PROVISIONED` | `wrangler deploy --env staging` | Included ($5/mo plan) | `wrangler rollback` |
| `ASSETS` | Static Assets | Static CDN Binding | `EXISTING_AND_VERIFIED` | Bundled in `./dist` via Vite | Free / Included | Rebuild static bundle |
| `radartehran-staging-db` | `DB` | Cloudflare D1 | `CONFIGURED_NOT_PROVISIONED` | `wrangler d1 create radartehran-staging-db` | $0.00 (within 25B read limit) | Drop / Recreate table |
| `radartehran-staging-media` | `MEDIA_BUCKET` | Cloudflare R2 | `CONFIGURED_NOT_PROVISIONED` | `wrangler r2 bucket create radartehran-staging-media` | $0.00 (within 10GB free limit) | Delete staging objects |
| `CACHE_KV_STAGING` | `CACHE_KV` | Workers KV | `CONFIGURED_NOT_PROVISIONED` | `wrangler kv namespace create CACHE_KV --env staging` | $0.00 (within 10M read limit) | Flush KV namespace |
| `radar-jobs-staging` | `JOBS_QUEUE` | Cloudflare Queue | `CONFIGURED_NOT_PROVISIONED` | `wrangler queues create radar-background-jobs-staging` | $0.00 (within 1M ops limit) | Purge queue messages |
| `radar-dlq-staging` | `DLQ_QUEUE` | Cloudflare Queue (DLQ) | `CONFIGURED_NOT_PROVISIONED` | `wrangler queues create radar-dead-letter-staging` | $0.00 (within 1M ops limit) | Purge DLQ messages |
| *Durable Objects* | *None* | Class Binding | `NOT_REQUIRED` | None (No DO required in v1) | $0.00 | N/A |

---

## 2. Detailed Staging Resource Specifications

### 2.1 Staging Worker: `radartehran-staging`
- **Purpose**: Executes Group 1A/1B API endpoints, injects dynamic SEO tags on SPA requests, and acts as the gatekeeper for staging traffic.
- **Dependencies**: Static assets in `./dist`.
- **Permissions**: Workers Scripts Read/Write, Assets Read.
- **Expected Invocations**: ~5,000 to 25,000 requests / month during staging testing.
- **Pricing**: Included in Workers Paid tier ($5/mo).
- **Rollback**: `npx wrangler rollback --env staging`.

### 2.2 Staging D1 Database: `radartehran-staging-db`
- **Purpose**: Provides schema validation and derived relational query acceleration for staging property benchmarks.
- **Dependencies**: Migration file `worker/db/migrations/0001_initial_schema.sql`.
- **Permissions**: D1 Read/Write.
- **Lifecycle & Backup**: Non-destructive schema migration tracked via `_cf_migration_ledger` with SHA-256 integrity verification. Can be dropped and recreated at will with zero production impact.
- **Authoritative Rule**: Firestore remains the master. Staging D1 reads are inactive until initial seed validation in Phase 10-B.

### 2.3 Staging R2 Bucket: `radartehran-staging-media`
- **Purpose**: Isolated storage for staging property photos, floorplans, and valuation PDF certificates.
- **Dependencies**: `worker/storage/r2Adapter.ts`.
- **Permissions**: R2 Read/Write/Delete within `radartehran-staging-media`.
- **Access Control**: Strict HMAC-SHA256 signed URLs (15-minute expiration); public listing disabled by default.
- **Lifecycle Policy**: Auto-delete objects older than 30 days to prevent orphaned staging storage accumulation.

### 2.4 Staging KV Cache: `CACHE_KV_STAGING`
- **Purpose**: Ephemeral edge caching for aggregate market pulse indicators, rate limiting counters, and JWKS public keys.
- **Key Prefixing**: Strictly namespaced: `staging:rate:`, `staging:pulse:`, `staging:jwks:`.
- **Data Exclusion Invariant**: Absolute prohibition on storing PII, user phone numbers, or auth tokens in KV.

### 2.5 Staging Queues: `radar-jobs-staging` & `radar-dlq-staging`
- **Purpose**: Asynchronous execution of background telemetry aggregation, market pulse recalculations, and cleanup jobs.
- **Consumer Settings**: `max_batch_size: 10`, `max_batch_timeout: 30`, `max_retries: 3`.
- **Poison Handling**: Messages failing 3 consecutive attempts route automatically to `radar-dlq-staging` without stalling the batch.
