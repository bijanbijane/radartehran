# Security Validation Matrix & Threat Model (Phase 9.1 Reconciled)
## Tehran Radar — Cloudflare Workers Migration Security Audit

**Document Reference**: `docs/cloudflare/security-validation-matrix.md`  
**Evaluation Date**: November 2026 (Updated Phase 9.1)  
**Auditor**: Principal Cloudflare Platform & Security Architecture Team  
**Evaluation Status**: `READY_WITH_DOCUMENTED_LIMITATIONS`

---

## 1. Executive Summary & Security Verification Taxonomy

This security matrix provides an evidence-based audit of Tehran Radar's edge runtime running on Cloudflare Workers. Every mitigation is referenced to exact source files, line ranges, and reproducible local test suites.

Statuses strictly follow the Phase 9.1 evidence taxonomy:
- `VERIFIED`: Proven by local tests with real cryptographic math.
- `PARTIALLY_VERIFIED`: Core validation verified; external revocation/status checks require Google Identity Toolkit API.
- `TESTED_LOCALLY`: Verified against in-memory local adapters; remote Cloudflare bindings pending staging provisioning.
- `NOT_TESTED_IN_REMOTE_ENVIRONMENT`: Awaits live Cloudflare staging network deployment.

---

## 2. Threat Vector & Evidence Reconciliation Matrix

| # | Threat Vector | Target Component | Exact Source Code & Line Reference | Supporting Test File | Local Test Evidence | Reconciled Status |
|---|---|---|---|---|---|---|
| **SEC-01** | Token Forgery & Alg Confusion | Edge Auth Verifier | `worker/auth/firebaseTokenVerifier.ts` (L45-124, L188-208) | `tests/cloudflare-phase3-identity-and-auth.test.ts` | Tested with Web Crypto RSA-2048 keys; rejected alg `none`, `HS256`, and forged payloads | `VERIFIED` |
| **SEC-02** | Stale / Revoked JWKS Keys | JWKS Client Cache | `worker/auth/jwksClient.ts` (L12-98) | `tests/cloudflare-phase3-identity-and-auth.test.ts` | Edge cache TTL, forced rotation on unknown `kid` | `VERIFIED` |
| **SEC-03** | Token Revocation & User Deletion | Token Revocation Engine | `worker/auth/firebaseTokenVerifier.ts` (L132) | None | **Revocation (`checkRevoked`) is NOT evaluated** in Worker runtime. Only verifies signature, `exp`, `iat`, `aud`, `iss`. Real-time revocation requires Firebase Admin / Identity Toolkit call. | `PARTIALLY_VERIFIED` *(Limitation Documented)* |
| **SEC-04** | Privilege Escalation / IDOR | RBAC Policy Engine | `worker/auth/authorizationPolicy.ts` (L1-120) | `tests/cloudflare-phase3-identity-and-auth.test.ts` | Role hierarchy evaluated: `SUPER_ADMIN > ADMIN > AGENT > USER > GUEST`. Unverified emails blocked. | `VERIFIED` |
| **SEC-05** | Bot Inundation & Scraping | App Check Verifier | `worker/auth/appCheckVerifier.ts` (L1-110) | `tests/cloudflare-phase3-identity-and-auth.test.ts` | Verifies Firebase App Check JWT envelope and Google JWKS keys. Hardware Play Integrity attestation requires device. | `PARTIALLY_VERIFIED` |
| **SEC-06** | Malicious File Upload (Polyglot / XSS) | Media Header Validator | `worker/storage/mediaValidation.ts` (L15-105) | `tests/cloudflare-phase4-r2-and-storage.test.ts` | Binary magic bytes verified (JPEG, PNG, WebP, PDF). Rejects SVG, XML, and embedded `<?php` or `<script>` polyglots. | `VERIFIED` |
| **SEC-07** | Storage Path Traversal | Storage Key Strategy | `worker/storage/keyStrategy.ts` (L1-85) | `tests/cloudflare-phase4-r2-and-storage.test.ts` | Strips `../` and control chars; forces deterministic UUID namespaces (`listings/{env}/{city}/hood-{id}/...`). | `VERIFIED` |
| **SEC-08** | Unauthorized Storage Mutation | HMAC Signed URL Service | `worker/storage/signedUrlSecurity.ts` (L1-110) | `tests/cloudflare-phase4-r2-and-storage.test.ts` | Web Crypto HMAC-SHA256 signature generated and verified; rejects expired or method-tampered requests. | `VERIFIED` |
| **SEC-09** | Remote R2 Storage Write Tampering | R2 Adapter Binding | `worker/storage/r2Adapter.ts` (L1-120) | `tests/cloudflare-phase4-r2-and-storage.test.ts` | Verified against `SimulatedR2StorageAdapter` in memory. Remote R2 bucket not yet provisioned. | `TESTED_LOCALLY` |
| **SEC-10** | SQL Injection (D1) | D1 SQL Interface | `worker/db/types.ts`, `worker/db/simulatedD1.ts` | `tests/cloudflare-phase5-d1-and-database.test.ts` | Exclusively uses parameterized `db.prepare().bind(...)`. Zero string interpolation. | `TESTED_LOCALLY` |
| **SEC-11** | Migration Script Tampering | D1 Migration Engine | `worker/db/migrationEngine.ts` (L1-115) | `tests/cloudflare-phase5-d1-and-database.test.ts` | Cryptographic SHA-256 checksum calculated before execution; detects altered SQL statements. | `VERIFIED` |
| **SEC-12** | Queue Poison Message Bomb | Queue Batch Ingestion | `worker/queues/queueProcessor.ts` (L1-135) | `tests/cloudflare-phase6-queues-and-cron.test.ts` | Exponential backoff for retries; isolates unparseable or failing messages to DLQ after 3 attempts. | `TESTED_LOCALLY` |
| **SEC-13** | Edge Cache Stampede & Leak | KV Cache Manager | `worker/cache/kvCacheManager.ts` (L1-160) | `tests/cloudflare-phase7-cache-and-kv.test.ts` | Promise coalescing deduplicates simultaneous misses; cache classification prevents storing PII. | `TESTED_LOCALLY` |
| **SEC-14** | Telemetry PII Ingestion | Privacy Validator | `worker/telemetry/privacyValidator.ts` (L18-125) | `tests/cloudflare-phase8-telemetry-and-privacy.test.ts` | Strips Iranian mobile numbers, national IDs, IBANs, emails, and sensitive keys. | `VERIFIED` |
| **SEC-15** | Cross-Day User Tracking | Session Hasher | `worker/telemetry/privacyValidator.ts` (L51-61) | `tests/cloudflare-phase8-telemetry-and-privacy.test.ts` | Rotating daily salt prevents cross-day user journey profiling. | `VERIFIED` |
| **SEC-16** | Valuation Invariant Drift | Market Intelligence Engine | `worker/telemetry/marketIntelligenceEngine.ts`, `src/data/hedonicPricingEngine.ts` | `tests/cloudflare-phase8-telemetry-and-privacy.test.ts` | Strictly monitors `FAST_SALE_FACTOR = 0.88` mathematical constant. Divergence $\ge 1\%$ triggers alert. | `VERIFIED` |
| **SEC-17** | Rate Limit Bypass | Edge Rate Limiter | `worker/cache/rateLimiter.ts` (L1-95) | `tests/cloudflare-phase7-cache-and-kv.test.ts` | Sliding-window algorithm enforced by IP and route namespace. | `TESTED_LOCALLY` |

---

## 3. Secret Management & Deployment Credentials Architecture

A strict separation must be maintained between **deployment credentials** and **Worker runtime secrets**:

### Category A: Deployment Credentials (CI/CD & CLI Only)
*Never exposed to browser code, never bundled in Worker source, never stored in repository files.*
- `CLOUDFLARE_ACCOUNT_ID`: Account identifier for Cloudflare API.
- `CLOUDFLARE_API_TOKEN`: Provisioned via Cloudflare Dashboard with scoped permissions:
  - `Workers Scripts: Edit`
  - `Workers KV Storage: Edit`
  - `D1: Edit`
  - `R2 Storage: Edit`
  - `Workers Queues: Edit`

### Category B: Worker Runtime Secrets (Encrypted via Wrangler)
*Injected into Worker environment bindings via `wrangler secret put <NAME>` in staging.*
- `ADMIN_API_SECRET`: Required for administrative endpoint authorization.
- `VALUATION_SEAL_SECRET`: Required for cryptographic HMAC signing of valuation certificates.
- `FIREBASE_PROJECT_ID`: Target Firebase project for token audience and issuer validation.

---

## 4. Residual Security Limitations & Staging Controls

1. **Token Revocation Window**:
   Because Firebase ID tokens have a 1-hour lifespan and real-time revocation checks are not evaluated on the edge isolate, a revoked user could technically use an existing valid token until expiration (up to 60 minutes).  
   *Staging Control*: For high-privilege administrative actions, the Worker checks `auth_time` (ensuring recent login within 15 minutes) and validates `ADMIN_API_SECRET`.
2. **Device Hardware Attestation**:
   App Check verification currently validates JWT signatures against Google's public JWKS. Hardware attestation (Play Integrity / DeviceCheck) requires real-device testing in Phase 10.
