# Security Validation Matrix & Threat Model (Phase 9)
## Tehran Radar — Cloudflare Workers Migration Security Audit

**Document Reference**: `docs/cloudflare/security-validation-matrix.md`  
**Evaluation Date**: November 2026  
**Auditor**: Principal Cloudflare Platform & Security Architecture Team  
**Evaluation Status**: `READY_WITH_DOCUMENTED_LIMITATIONS`

---

## 1. Executive Summary & Security Objectives

This matrix provides the exhaustive security validation of Tehran Radar's edge runtime running on Cloudflare Workers alongside the hybrid Node.js Express strangler backend. All controls have been tested via automated test suites (`test:security`, `test:auth`, `test:r2`, `test:d1`, `test:contracts`) and audited against OWASP Top 10 API Security Risks and Cloudflare Workers isolate security paradigms.

---

## 2. Threat Vector & Control Verification Matrix

| # | Threat Vector | System Component | Control / Mitigation Architecture | Automated Test / Verification Evidence | Status |
|---|---|---|---|---|---|
| **SEC-01** | Token Forgery & Alg Confusion | Edge Auth (`worker/auth/tokenVerifier.ts`) | Strict Web Crypto RS256 validation; enforces algorithm pinning (`alg: RS256`); verifies signature against Google Identity JWKS; validates `aud`, `iss`, `exp`. | `tests/worker-auth.test.ts` (suite passed 9/9) | `VERIFIED_PASS` |
| **SEC-02** | Stale / Revoked JWKS Keys | JWKS Cache (`worker/auth/jwksClient.ts`) | In-memory edge cache with 6-hour TTL, background refresh, and immediate forced key rotation on unknown `kid`. | `tests/worker-auth.test.ts` (`fetches and caches JWKS`) | `VERIFIED_PASS` |
| **SEC-03** | Privilege Escalation / IDOR | RBAC Engine (`worker/auth/rbacEngine.ts`) | Strict role hierarchy (`SUPER_ADMIN > ADMIN > AGENT > USER > GUEST`). Route permissions matched against cryptographic claims before proxying. | `tests/worker-auth.test.ts` (`enforces RBAC permissions`) | `VERIFIED_PASS` |
| **SEC-04** | API Scraping & Bot Floods | App Check Verifier (`worker/auth/appCheckVerifier.ts`) | Firebase App Check token verification via JWKS with mandatory enforcement on mutation/valuation endpoints. | `tests/worker-auth.test.ts` (`verifies App Check`) | `VERIFIED_PASS` |
| **SEC-05** | Malicious File Upload (Polyglot/XSS) | R2 Ingestion (`worker/storage/fileValidator.ts`) | Real magic-bytes header inspection (PNG, JPEG, WEBP, PDF). Rejects disguised HTML/SVG/executables. Strict MIME vs header validation. | `tests/worker-r2.test.ts` (`validates file magic bytes`) | `VERIFIED_PASS` |
| **SEC-06** | Storage Path Traversal | Key Sanitizer (`worker/storage/keyStrategy.ts`) | Strict sanitization of client filenames; strips directory traversal segments (`../`, `..\`), replaces control/angle brackets, enforces UUID prefixes. | `tests/worker-r2.test.ts` (`generates sanitized storage keys`) | `VERIFIED_PASS` |
| **SEC-07** | Unauthorized Storage Mutation | HMAC Signer (`worker/storage/signedUrlService.ts`) | HMAC-SHA256 signed URL generator with strict expiration timestamp (default 15m), signature verification, and action-scoped authorization. | `tests/worker-r2.test.ts` (`signs and validates signed URLs`) | `VERIFIED_PASS` |
| **SEC-08** | SQL Injection (D1) | D1 Database Client (`worker/db/d1Client.ts`) | Exclusively uses parameterized statements via `db.prepare().bind(...)`. Zero string concatenation of SQL queries. | `tests/worker-d1.test.ts` (`executes parameterized queries`) | `VERIFIED_PASS` |
| **SEC-09** | Migration Tampering / Poisoning | D1 Migration Engine (`worker/db/migrationEngine.ts`) | Cryptographic SHA-256 checksum verification of all migration files prior to execution; rejects altered schema definitions. | `tests/worker-d1.test.ts` (`detects checksum mismatch tampering`) | `VERIFIED_PASS` |
| **SEC-10** | Queue Poison Message Bomb | Queue Ingestion (`worker/queues/queueProcessor.ts`) | Batch processing with per-message try/catch, max retries limit (3 attempts), and automated dead-letter routing (`DLQ_QUEUE`). | `tests/worker-queues.test.ts` (`dead-letters poison messages`) | `VERIFIED_PASS` |
| **SEC-11** | Edge Cache Stampede / PII Leak | KV Cache Manager (`worker/cache/kvCacheManager.ts`) | Promise-coalescing single-flight fetcher; explicit cache classification matrix preventing storage of private/sensitive user data in KV. | `tests/worker-cache.test.ts` (`coalesces concurrent requests`) | `VERIFIED_PASS` |
| **SEC-12** | Telemetry PII Ingestion | Privacy Engine (`worker/telemetry/privacyEngine.ts`) | Zero-PII sanitization engine; redacts phone numbers (Iran formats), emails, IP addresses, National IDs, and auth tokens. | `tests/worker-telemetry.test.ts` (`strips PII from payloads`) | `VERIFIED_PASS` |
| **SEC-13** | Behavioral Surveillance / Fingerprint | Session Hasher (`worker/telemetry/privacyEngine.ts`) | HMAC-SHA256 rotating daily salt prevents cross-day user journey tracking or long-term behavioral profiling. | `tests/worker-telemetry.test.ts` (`generates rotating daily salts`) | `VERIFIED_PASS` |
| **SEC-14** | Valuation Manipulation / Model Drift | Model Drift Monitor (`worker/telemetry/driftMonitor.ts`) | Enforces mathematical invariant `FAST_SALE_FACTOR = 0.88`. Emits critical alert on divergence $\ge 1\%$. | `tests/worker-telemetry.test.ts` (`detects model drift`) | `VERIFIED_PASS` |
| **SEC-15** | Rate Limit Bypass | Edge Limiter (`worker/cache/edgeRateLimiter.ts`) | Distributed sliding-window rate limiting backed by Workers KV with deterministic key namespacing by client IP / token hash. | `tests/worker-cache.test.ts` (`enforces sliding-window limits`) | `VERIFIED_PASS` |
| **SEC-16** | Cross-Origin Request Forgery | Edge Router (`worker/index.ts`) | Whitelisted CORS origins (`ORIGIN_WHITELIST`), strict preflight handling, credentials gating, security response headers (CSP, HSTS). | Code inspection & `test:security` | `VERIFIED_PASS` |

---

## 3. Residual Security Limitations & Staging Action Plan

1. **Express Fallback Secret Zero**: The strangler fallback relies on environment variables (`DIVAR_API_KEY`, `SESSION_SECRET`). When migrating to Cloudflare Workers, secrets must be loaded via encrypted Wrangler secrets (`wrangler secret put`).
2. **WebAssembly Heavy Media Processing**: Image thumbnail generation using Sharp remains on Express backend; native Workers pipeline should incorporate WebAssembly libvips or Cloudflare Images in Phase 10.
3. **App Check Device Attestation**: Play Integrity / Apple DeviceCheck keys are verified via Firebase JWKS. Staging must validate real-device hardware tokens.
