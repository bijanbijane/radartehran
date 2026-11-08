# Staging Environment Map & Topology Architecture (Phase 10-A)
## Tehran Radar — Multi-Environment Infrastructure Boundaries

**Document Reference**: `docs/cloudflare/staging-environment-map.md`  
**Phase**: 10-A (Staging Environment Preparation & Deployment Preflight)  
**Evaluation Date**: November 2026  
**Status**: `PREPARED_WITH_DOCUMENTED_LIMITATIONS`  
**Execution Gate**: No remote resources created in this phase.

---

## 1. Multi-Environment Architecture Overview

Tehran Radar strictly isolates four distinct operational tiers. To prevent cross-environment pollution, staging must **never** share mutable databases, storage buckets, queues, or administrative secrets with production.

```
+-----------------------------------------------------------------------------------------+
|                                ENVIRONMENT TAXONOMY                                    |
+-----------------------------------------------------------------------------------------+
| [Local Development] ---> [Cloudflare Preview] ---> [Cloudflare Staging] ---> [Production]
|  - In-memory Sims         - Branch Workers          - Isolated Staging      - Live Domain
|  - Local Vite:3000        - Mock/Synthetic Data     - Synthetic Fixtures    - Firestore Master
|  - Mock Web Crypto        - Cloudflare Pages/Wrk    - Zero Prod Writes      - Strict RBAC
+-----------------------------------------------------------------------------------------+
```

---

## 2. Environment Specification Matrix

| Parameter / Configuration | 1. Local Development | 2. Cloudflare Preview | 3. Cloudflare Staging | 4. Production | Status & Notes |
|---|---|---|---|---|---|
| **Worker Script Name** | `radartehran-dev` | `radartehran-preview` | `radartehran-staging` | `radartehran` | Configured in `wrangler.jsonc` |
| **Target Runtime** | Node.js `tsx` / Vite dev | Cloudflare Workers Isolate | Cloudflare Workers Isolate | Cloudflare Workers Isolate | `IMPLEMENTED` |
| **Worker Entrypoint** | `worker/index.ts` | `worker/index.ts` | `worker/index.ts` | `worker/index.ts` | Unified entrypoint |
| **Static Assets Dir** | `public/` (Vite dev) | `./dist` (Workers Assets) | `./dist` (Workers Assets) | `./dist` (Workers Assets) | `CONFIGURED` |
| **Canonical App URL** | `http://localhost:3000` | `https://preview.radartehran.example.com` | `https://staging.radartehran.example.com` | `https://radartehran.ir` | Isolated hostnames |
| **Firebase Project ID** | `ai-studio-e48df7a4...` | `ai-studio-preview` (Synthetic) | `ai-studio-staging` (Synthetic/Isolated) | `ai-studio-prod` (Authoritative) | **Staging must not write to Prod** |
| **Firestore Database** | Emulator / Dev Project | Dev / Synthetic Database | Isolated Staging Database | Authoritative Master | Strict separation required |
| **D1 Database Binding** | `SimulatedD1Database` (RAM) | `NOT_CONFIGURED` | `radartehran-staging-db` | `radartehran-prod-db` | `NOT_PROVISIONED` (Awaits Phase 10-B) |
| **R2 Storage Bucket** | `SimulatedR2Storage` (RAM) | `NOT_CONFIGURED` | `radartehran-staging-media` | `radartehran-prod-media` | `NOT_PROVISIONED` (Awaits Phase 10-B) |
| **KV Cache Namespace** | `SimulatedKvStore` (RAM) | `NOT_CONFIGURED` | `CACHE_KV_STAGING` | `CACHE_KV_PROD` | `NOT_PROVISIONED` (Awaits Phase 10-B) |
| **Queues (Jobs / DLQ)** | `SimulatedWorkerQueue` | `NOT_CONFIGURED` | `radar-jobs-staging` / `radar-dlq-staging` | `radar-jobs-prod` / `radar-dlq-prod` | `NOT_PROVISIONED` (Awaits Phase 10-B) |
| **Durable Objects** | None | None | None | None | `NOT_REQUIRED` (No DO needed in v1) |
| **Admin API Secret** | Local Dev Mock Secret | Ephemeral Preview Secret | `wrangler secret put ADMIN_API_SECRET` | Production Vault Secret | Independent values enforced |
| **Valuation Seal Secret** | Local Mock HMAC Key | Preview HMAC Key | `wrangler secret put VALUATION_SEAL_SECRET` | Production HSM/Vault Key | Independent values enforced |
| **Data Classification** | Synthetic Test Fixtures | Ephemeral Synthetic Data | Anonymized / Synthetic Only | Real Real-Estate Market Data | **Zero Prod PII in Staging** |
| **Deployment Gate** | Manual `npm run dev` | Automated PR Preview | Explicit Operator Authorization | Release Board + Multi-Signoff | Strict manual promotion |

---

## 3. Strict Staging Isolation Invariants

1. **Zero Cross-Environment Writes**: Staging Workers are strictly prohibited from holding credentials or network routes that allow writes to the production Firestore instance or production Cloud Storage/R2 buckets.
2. **Synthetic Data Policy**: All property listings, pricing benchmarks, and agent profiles in staging are synthetic fixtures marked with `is_synthetic: true`.
3. **No Automatic Production Fallback**: If a staging resource is unavailable, it fails closed or returns structured synthetic responses. It must **never** fall back to reading from or writing to production infrastructure.
4. **Independent Secret Isolation**: Runtime secrets in staging (`ADMIN_API_SECRET`, `VALUATION_SEAL_SECRET`) are generated independently and never shared with production.
