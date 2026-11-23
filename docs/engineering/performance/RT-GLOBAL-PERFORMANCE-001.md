# RT-GLOBAL-PERFORMANCE-001 — Performance Engineering Standard and Baseline

**Status:** Baseline audit; implementation not yet complete  
**Audit date:** 2026-11-23  
**Repository baseline:** `main` at `e2940da21c2f65fa85a5c26cdafb3495503ca27c`  
**Tracking issue:** [#13](https://github.com/bijanbijane/radartehran/issues/13)

This document is the repository-level engineering standard for the global performance program. It does not assert that every listed technology is already enabled, nor that a local test proves production performance. Every implementation tranche must have an owning PR, explicit scope, focused tests, CI evidence, measured before/after results, and rollback notes.

## 1. Governing principles

1. Optimize the complete user-perceived path, not a protocol or isolated server benchmark.
2. Prioritize the critical user journey: initial shell, search, active-city/neighborhood context, base map, and selected neighborhood. Load secondary dashboards, overlays, media, and expensive analytics on demand.
3. Prefer fewer bytes, fewer round trips, less main-thread work, bounded memory, and locality before adding infrastructure.
4. Use HTTP/2 and HTTP/3/QUIC where the serving platform, browser, and network support them. Protocol availability must be verified at the deployed hostname; application code alone cannot guarantee it.
5. Keep public read models and private/transactional paths separate. No authenticated, user-specific, privileged, or mutation response may enter a shared cache.
6. Every cache must define data classification, full cache-key dimensions, TTL, stale window, invalidation, negative-cache eligibility, and ownership. Stale data must be visibly timestamped where freshness matters.
7. Map tile caching and delivery must obey each provider's attribution, cache directives, rate limits, and licensing. Do not cache opaque third-party responses unless the provider contract explicitly authorizes it.
8. Keep IRNI as the canonical writer of shared geographic identities. Radar may consume revision-pinned data and build derived read models, but may not mutate the canonical registry.
9. Keep telemetry consented, aggregated, and privacy-preserving. Never collect credentials, personal content, keystrokes, mouse trails, precise permanent location, or inferred personal dossiers.
10. Use graceful degradation, bounded retries, backpressure, and isolation. A non-critical dependency must not prevent the core experience from working.
11. Do not infer global performance from a single region, ISP, device, cache state, or lab run.
12. Never merge or deploy a tranche with unresolved security, ownership, data-integrity, or CI regressions.

## 2. Performance budgets and evidence

### Core Web Vitals targets

| Metric | Target | Measurement cohort |
|---|---:|---|
| LCP | p75 <= 2,500 ms | Field RUM, mobile and desktop reported separately |
| INP | p75 < 200 ms | Field RUM, mobile and desktop reported separately |
| CLS | p75 < 0.1 | Field RUM, mobile and desktop reported separately |

Additional product metrics must include route-ready time, first usable search, first usable map, map tile latency/failure rate, visible marker count, map interaction duration, long tasks, API latency, cache hit/stale/miss rates, Worker CPU where available, and database query duration.

Report sample counts and P50/P75/P95/P99 where the source supports them. A missing or unsupported metric is `NO_DATA`, not zero. Separate `FIELD_RUM`, `LAB`, and `SYNTHETIC` evidence. Do not compare results from different test conditions as a before/after improvement.

### Test profiles

- Warm and cold cache.
- Fast network, high RTT, packet loss, and low-bandwidth/mobile profiles.
- Constrained CPU and memory mobile emulation plus representative physical devices.
- Different geographic regions and network providers where test infrastructure permits.
- Provider/API degradation, timeout, 429, 5xx, and offline scenarios.
- Concurrent read bursts and write contention; do not use synthetic load against production without explicit controlled authorization.

## 3. Repository baseline inventory

The following items were confirmed by reading files on the recorded `main` commit. Presence is not proof of production activation or end-to-end effectiveness.

| Area | Existing implementation on baseline | Required verification / gap |
|---|---|---|
| Frontend build | `vite.config.ts` uses `manualChunks`, esbuild minification, no public sourcemaps, and a 700 KB chunk warning threshold | A manual chunk is not lazy loading. Establish actual entry and route chunk sizes, compressed transfer sizes, and a hard regression budget. |
| Route loading | `RadarWorkspaceShell.tsx` has at least one `React.lazy` feature import | Audit every route and heavyweight feature; prove unused pages and libraries are absent from the initial critical path. |
| Initial data | `RadarWorkspaceShell.tsx` constructs `allExpansionSeeds` using `getAllMultiCityNeighborhoods()` and hydrates state from all expansion seeds | Likely unnecessary nationwide work for a single-city initial session. Profile and replace only with a tested active-city-first strategy that preserves URL, storage, and city-switch behavior. |
| PWA | `public/sw.js` has shell/assets/data caches, offline shell, network-first market pulse, map tile handling, and bounded tile count | Verify cache headers, eviction behavior, update lifecycle, offline semantics, and provider-specific permission before caching external tiles. |
| Map tiles | Service Worker classifies OSM, CARTO, ArcGIS and `/api/osm-tile/*` as tiles; external opaque responses are currently eligible for Cache API storage | Opaque responses do not expose response cache directives to this code. Review provider contracts and change behavior to an explicit, provider-compliant allowlist; default-deny opaque external tile caching. |
| Worker cache | `worker/cache/kvCacheManager.ts` implements KV TTL envelopes, stale-while-revalidate, negative caching, and an in-flight Promise map | The in-flight map is instance/isolate-local, not a global cross-isolate or cross-PoP lock. Do not claim global single-flight or a universal one-origin-request guarantee. Measure and document scope. |
| Cache classification | `worker/cache/cachePolicies.ts` classifies public static, public changing, private, authorization, transactional, coordination, and analytical data | Audit every real route's use of the policy and cache key; ensure cache key includes all response-varying dimensions and invalidation follows writes. |
| RUM | `BrowserPerformanceCollector.ts` supports LCP/INP/CLS and consent checks; percentile evaluation currently exposes p50/p75/p95 | Verify that collection is wired into real routes and a safe ingestion path. Add p99 and map/API-specific metrics only with valid sample semantics and privacy review. |
| Existing map optimization | LOD, viewport selection, geometry cache, marker reconciliation, and map performance modules exist; PR #10 owns additional macro-clustering/labels | Reconcile and validate PR #10; do not implement duplicate clustering or culling. |
| Edge/network | Cloudflare Workers and Wrangler configuration exist | Repository files do not prove live HTTP/3, TLS, Brotli, Anycast path, CDN cache policy, or regional performance. Verify deployed response headers and network paths separately. |
| Capacity | Queue, rate-limit, and cache modules exist | Audit actual production bindings and call sites; repository configuration alone does not prove remote resources are provisioned or active. |

## 4. Important correctness findings

### 4.1 Service Worker external tile cache

At baseline, `public/sw.js` treats requests to `tile.openstreetmap.org`, `basemaps.cartocdn.com`, and `arcgisonline.com` as cacheable map tiles. It stores successful and opaque responses without checking the response's `Cache-Control` directives. Opaque responses cannot be inspected by this code. This is a provider-policy and cache-correctness risk, not a performance feature to expand blindly.

**Required action:** provider-specific explicit policy, default-deny for opaque external responses, and tests for no-store/private/no-cache/max-age behavior. Preserve caching only where the response and provider terms authorize it. Do not prefetch tile regions.

### 4.2 Single-flight scope

`CloudflareKVCacheManager` keeps `inFlightRevalidations` in a JavaScript `Map` on the manager instance. This can coalesce work within that instance, but does not coordinate independent Worker isolates or PoPs. KV itself is not a distributed mutex.

**Required action:** narrow documentation and tests to the actual scope. If cross-isolate stampede control is later required, design a bounded, failure-safe coordination mechanism and account for its latency/cost; do not pretend a KV lease is strongly consistent.

### 4.3 Nationwide startup hydration

`RadarWorkspaceShell.tsx` constructs all multi-city expansion seeds and passes them into initial storage hydration. This is a concrete candidate for profiling and active-city-first loading, but must be changed only with regression coverage for city changes, selected neighborhoods, URL restoration, persisted preferences, and search.

## 5. Implementation sequence

### Gate A — Dependency and CI reconciliation
- Reconcile open PRs and their base/head ancestry before any overlapping edits.
- PR #9 currently owns backend diagnostics, queue idempotency, and dependency/lockfile work; do not edit those paths while its CI is active.
- PR #10 owns map clustering, viewport culling, and label LOD; its current base is `rt-map-validation-base`, not `main`. Resolve its `action_required` workflow state and base dependency before treating the code as validated.
- PR #7 and PR #12 are stacked integration/auth work; preserve the dependency and fail-closed boundaries.
- Restore a green reproducible CI baseline before using build output as performance evidence.

### Gate B — Baseline instrumentation
- Build repeatable Lighthouse/WebPageTest or equivalent lab profiles and route-level browser measurements.
- Verify consented RUM wiring, data minimization, ingestion, sampling, and retention.
- Add map/API/Worker metrics and P99 where technically available.
- Record baseline results before optimizing.

### Gate C — Frontend delivery
- Measure initial HTML, CSS, JS, font, and image transfer sizes (compressed and uncompressed).
- Replace unnecessary eager imports with route/feature lazy loading.
- Use responsive images and modern formats where supported.
- Use preload/preconnect/prefetch only for measured critical dependencies; avoid speculative bandwidth waste.
- Establish enforced bundle and route budgets in CI.

### Gate D — Map pipeline
- Reconcile PR #10.
- Profile Leaflet render cost, tile request concurrency, marker count, polygon complexity, and overlays.
- Use viewport queries, clustering, zoom LOD, geometry simplification, bounded caches, and deferred overlays.
- Move computation to Web Workers only when profiling demonstrates main-thread contention.
- Apply provider-specific tile policy.

### Gate E — Edge and HTTP
- Verify deployed HTTP/2 and HTTP/3 negotiation, TLS, DNS, compression, cache headers, and cache hit behavior from multiple regions.
- Configure immutable caching only for content-hashed assets; revalidate HTML; define explicit public-data cache policies; bypass shared cache for private or transactional responses.
- Evaluate Cloudflare Tiered Cache and regional routing only where account/product support and measurements justify them.

### Gate F — API and data reads
- Audit N+1 and serial dependency chains.
- Introduce bounded batch endpoints, request coalescing, conditional GET/ETag, pagination, indexed queries, read models/materialized aggregates, and write-triggered cache invalidation.
- Keep authoritative geography revision-pinned and read-only in Radar.

### Gate G — Resilience and capacity
- Add bounded timeouts/retries with jitter, circuit breakers, backpressure, rate limits, queue prioritization, load shedding, and bulkhead isolation where needed.
- Preserve idempotency and explicit stale-data metadata.
- Verify graceful degradation for tile, market data, auth, storage, and analytics dependencies.

### Gate H — Load/failure tests and rollout
- Run controlled load profiles, cold/warm cache tests, regional checks, and dependency failure tests.
- Use canary/feature flags and documented rollback.
- Publish before/after evidence and unresolved limitations.

## 6. Definition of done for every tranche

A tranche is done only when:
- its scope is isolated and does not duplicate an existing PR;
- code and tests are reviewed against the current remote branch head;
- focused tests, TypeScript, architecture checks, build, and relevant browser tests pass;
- CI is green (or the exact external blocker is recorded without misrepresenting the tranche as complete);
- before/after metrics use the same test profiles and include sample counts;
- security, privacy, cache correctness, data ownership, provider terms, and rollback are verified;
- the issue and PR record exact files, commit, test results, and remaining limitations.

## 7. Current status

This commit records the engineering standard and baseline audit only. It does not change runtime behavior, Worker bindings, Cloudflare resources, secrets, D1 migrations, or deployments. Implementation remains open under issue #13.
