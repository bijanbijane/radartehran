# Performance & Capacity Validation Report (Phase 9.1 Reconciled)
## Tehran Radar — Edge Runtime & Worker Strangler Performance Audit

**Document Reference**: `docs/cloudflare/performance-validation.md`  
**Evaluation Date**: November 2026 (Updated Phase 9.1)  
**Auditor**: Cloudflare Platform & Performance Engineering Team  
**Evaluation Status**: `READY_WITH_DOCUMENTED_LIMITATIONS`

---

## 1. Executive Summary & Measurement Integrity

In compliance with Phase 9.1 reconciliation directives, this document separates **theoretical platform limits**, **local microbenchmark timings**, and **empirically observed Cloudflare telemetry**.

Critical corrections established in Phase 9.1:
1. **Wall-Clock vs. CPU Time**: `Date.now() - startedAtMs` measures wall-clock request duration, not V8 isolate CPU execution time. Billed CPU time can only be observed via Cloudflare Workers GraphQL Analytics.
2. **Memory Metrics**: V8 isolates do not expose OS-level RAM or `process.memoryUsage()`. The previously cited 38 MB figure is an **unverified theoretical projection** and has been retracted from verified data.
3. **Cold Start & Latency**: Sub-5ms startup times and edge TTFB reductions represent theoretical Cloudflare architecture specifications, not production-measured percentiles of Tehran Radar.

---

## 2. Metric Classification & Source Attribution

| Metric / Scenario | Value / Range Cited | Measurement Source | Methodology | Limitations & Environment | Reconciled Status |
|---|---|---|---|---|---|
| **Wall-Clock Request Latency** | ~2ms – 15ms (Health/Group 1B) | `worker/contextAndSecurity.ts` (L302) | `Date.now() - ctx.startedAtMs` | Measures total elapsed wall-clock time in local Node/tsx runner. Excludes WAN latency. | `TESTED_LOCALLY` |
| **Worker Billed CPU Time** | Unknown / Bounded by 30s limit | Cloudflare Platform Spec | Hardware thread metering (Cloudflare internal) | Not measurable via JavaScript `Date.now()` or `performance.now()`. Requires live GraphQL telemetry. | `UNVERIFIED_IN_WORKER_CODE` |
| **Isolate Peak Memory** | Retracted (previously ~38MB) | Analytical Estimate Only | Theoretical sum of JS heap structures | V8 isolates do not expose process memory. No empirical telemetry exists. | `NOT_VERIFIED` *(Retracted)* |
| **Cold Start Latency** | < 5ms (theoretical spec) | Cloudflare Architecture Docs | Zero-cold-start isolate fork model | Empirical cold start for Tehran Radar's bundled code has not been measured on real edge PoPs. | `ESTIMATED_FROM_PLATFORM_SPECS` |
| **Static Asset TTFB** | ~12ms – 35ms (projected) | Cloudflare Edge CDN Spec | Global PoP Anycast caching | Dependent on local ISP routing and Cloudflare PoP proximity. | `ESTIMATED_FROM_PLATFORM_SPECS` |
| **Hedonic Computation Time** | 1.8ms – 4.2ms | Local Node.js benchmark | `performance.now()` in Node.js test harness | Pure V8 in-memory math; fast, but Node.js V8 execution differs from edge isolate execution. | `TESTED_LOCALLY` |
| **Subrequest Limit per Req** | $\le 4$ subrequests | Code inspection of Group 1A/1B | Static analysis of fetch calls | Well within Cloudflare's 50 subrequests/request limit. | `VERIFIED` |

---

## 3. Worker Memory & Resource Protection Strategy

Because Cloudflare Workers isolates enforce a strict **128 MB RAM ceiling** per isolate without exposing a live memory meter, memory exhaustion is prevented through **architectural defensive boundaries**:

### 3.1 Strict Payload Ceilings (`worker/contextAndSecurity.ts` L207)
- **JSON Request Bodies**: Enforced maximum of 32 KB for standard `/api/*` endpoints. Requests exceeding this return HTTP 413 `PAYLOAD_TOO_LARGE` before full parsing.
- **Telemetry Envelopes**: Enforced maximum of 64 KB per batch.
- **Media Uploads**: Enforced maximum of 8 MB per image file.

### 3.2 Streaming Architecture for Large Objects
- For R2 object storage operations, all payloads exceeding 1 MB are piped directly using `ReadableStream` rather than buffered into `ArrayBuffer` in isolate memory:
  ```typescript
  // worker/storage/r2Adapter.ts
  // Streaming directly to R2 bucket without memory buffering:
  await bucket.put(key, request.body, { httpMetadata });
  ```

---

## 4. Cache Efficiency Targets & SWR Strategy

The distributed caching architecture (`worker/cache/kvCacheManager.ts`) implements **Stale-While-Revalidate (SWR)** and **Single-Flight Promise Coalescing**:

- **Target Hit Ratio**: $\ge 88\%$ for aggregate market indicators and static neighborhood geo-data.
- **Thundering Herd Protection**: Single-flight promise deduping guarantees that 500 concurrent misses trigger only 1 origin request.
- **Verification Evidence**: Tested via `tests/cloudflare-phase7-cache-and-kv.test.ts` (subtest 3, duration ~21ms).

---

## 5. Performance Staging Readiness Verdict

**Status**: `READY_WITH_DOCUMENTED_LIMITATIONS`

The application code contains appropriate defensive payload gates and streaming mechanisms to operate within Cloudflare's 128 MB isolate limit. Empirical latency percentiles (p50, p95, p99), cold-start behavior, and billed CPU time must be measured in the staging environment during Phase 10 using Cloudflare Workers Analytics.
