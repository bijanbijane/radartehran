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
| Initial data | PR #19 memoizes the validated nationwide aggregate; PR #22 changes initial storage hydration and market-pulse seed lookup to the active city, loading another city's expansion records only on first visit | Initial localStorage traversal and in-memory hydration are now city-scoped. Static city dataset modules are still imported in the initial bundle; code splitting remains a separate measured migration. |
| PWA | `public/sw.js` has shell/assets/data caches, offline shell, and network-first market pulse; map tiles are being moved to network-only Service Worker handling | Verify cache headers, eviction behavior, update lifecycle, offline semantics, and provider-specific permission before caching external tiles. |
| Map tiles | Service Worker previously cached OSM, CARTO, ArcGIS and `/api/osm-tile/*` tiles; PR #16 changes all recognized map tiles to network-only and purges old Cache API tile entries | Opaque responses do not expose response cache directives to this code. Review provider contracts and change behavior to an explicit, provider-compliant allowlist; default-deny opaque external tile caching. |
| Worker cache | `worker/cache/kvCacheManager.ts` implements KV TTL envelopes and instance-local revalidation, but search confirms it is only referenced by its test suite | The live API Worker has no `RADAR_KV` binding and this manager is not wired into production. PR #44 proposes built-in Workers Cache instead; it is zoneless, works on `workers.dev`, and uses response Cache-Control. Do not claim cache hits until post-deploy verification. |
| Cache classification | `worker/cache/cachePolicies.ts` classifies public static, public changing, private, authorization, transactional, coordination, and analytical data | Audit every real route's use of the policy and cache key; ensure cache key includes all response-varying dimensions and invalidation follows writes. |
| RUM | `BrowserPerformanceCollector.ts` supports LCP/INP/CLS and consent checks; the current `RtFePerformance013Subpanel` exposes a local diagnostic snapshot | No production field-RUM ingestion path or route-wide automatic collection was verified. Do not call RUM active until consented collection, sampling, ingestion, retention, and dashboard/alerts are connected. Add p99 and map/API-specific metrics only with valid sample semantics and privacy review. |
| Per-record market/traffic precomputation | PR #22 now memoizes `precomputeNeighborhoodStaticReports` by immutable neighborhood record and cloud snapshot identities | Unchanged records reuse computed market and traffic reports when another record changes; replacement of the base record, cloud-bargain array, or sponsor snapshot invalidates that record. |
| Existing map optimization | LOD, viewport selection, geometry cache, marker reconciliation, and map performance modules exist; PR #10 owns additional macro-clustering/labels | Reconcile and validate PR #10; do not implement duplicate clustering or culling. |
| Edge/network | Cloudflare Workers and Wrangler configuration exist | Repository files do not prove live HTTP/3, TLS, Brotli, Anycast path, CDN cache policy, or regional performance. Verify deployed response headers and network paths separately. |
| Capacity | Queue, rate-limit, and cache modules exist | Audit actual production bindings and call sites; repository configuration alone does not prove remote resources are provisioned or active. |

## 4. Live Cloudflare edge baseline (2026-11-23)

The connected Cloudflare account currently has no DNS zone or custom Worker domain for `tehranradar.ir`. The production frontend and API are reachable through `workers.dev`, and the frontend uses a Worker service binding to the API. The Cloudflare edge is active, but zone-level settings for a custom domain (DNS, zone Cache Rules, Early Hints, and custom-domain HTTP controls) cannot be tuned in this account until the domain is onboarded or the correct account is connected. Built-in Workers Cache is separate from zone configuration and can operate on `workers.dev`; it is proposed for the API Worker in PR #44.

### Observed Worker telemetry

A 48-hour Cloudflare Workers telemetry query returned:

| Worker / protocol | Fetch events | P95 wall time | P99 wall time | P95 CPU |
|---|---:|---:|---:|---:|
| API / HTTP/1.1 | 2,059 | 330 ms | 391 ms | 7 ms |
| API / HTTP/2 | 32 | 184 ms | 197 ms | 11 ms |
| Frontend / HTTP/1.1 | 9 | 616 ms | 616 ms | 1 ms |
| Frontend / HTTP/2 | 15 | 597 ms | 597 ms | 3 ms |

No HTTP/3 fetch events appeared in this sample. The event sample is dominated by synthetic health checks from Microsoft-hosted automation (including `curl` requests and a smoke-test query parameter), not verified end-user sessions. These values are Worker execution wall times, not browser navigation time, LCP, INP, or user-perceived latency. The frontend sample sizes are too small for reliable percentile conclusions.

**Interpretation:** Worker CPU is low in these probes; the observed wall time is mostly waiting/IO or the health-check route itself. The next measurement must be consented browser RUM and controlled regional synthetic tests, not extrapolation from these probes.

### Staging deployment drift

The live staging Worker had an hourly Cron Trigger while its D1 binding referenced a deleted database. That schedule was removed from the live staging Worker and verified empty. PR #9 also adds an explicit empty staging `triggers.crons` list and a regression assertion. The staging D1 binding itself remains unprovisioned; staging lifecycle processing must stay disabled until dedicated staging D1 databases and migrations exist.

Live Worker environment values and bindings do not fully match the repository configuration. The live API Worker has no `RADAR_KV` binding and no Workers Cache setting; the frontend has an `ASSETS` binding and a service binding to the API. Do not deploy Wrangler configuration blindly; reconcile APP_URL, compatibility date, Worker variables, bindings, and staging resources first.

### Workers Cache deployment state

- Current production API Worker settings show no built-in Workers Cache configuration.
- `CloudflareKVCacheManager` is not connected to a production route; creating a KV namespace is unnecessary for the first cache layer.
- PR #44 enables built-in Workers Cache only for the production API Worker and explicitly disables it in staging.
- JSON responses default to `no-store`; explicitly public catalog/MCP/telemetry/metadata responses have bounded TTLs; R2 object responses are `private`.
- Static error responses now force `no-store`, preventing a missing hashed asset from inheriting the one-year immutable asset policy.
- JSON responses always vary by `Origin`, including no-Origin and disallowed-Origin requests, preventing a cached CORS variant from crossing origins.
- No live cache setting has been changed. After merge/deploy, run `scripts/cloudflare/verify-workers-cache.mjs` against the public frontend Worker origin and confirm HIT on public catalog, no HIT on health, and correct CORS variants.

## 4. Important correctness findings

### 4.1 Service Worker external tile cache

At baseline, `public/sw.js` treated requests to `tile.openstreetmap.org`, `basemaps.cartocdn.com`, `arcgisonline.com`, and `/api/osm-tile/*` as cacheable map tiles. It stored successful and opaque responses without checking the response's `Cache-Control` directives. Opaque responses cannot be inspected by this code. PR #16 changes all recognized map tiles to network-only at the Service Worker layer, purges old tile entries, and delegates online caching to the browser HTTP cache.

**Required action:** keep all map tiles out of Service Worker Cache API so PWA offline mode does not become an offline-map feature. Let the browser HTTP cache and server-side proxy honor provider Cache-Control directives. Do not prefetch tile regions. Server-side shared cache must honor upstream private/no-store/no-cache and explicit TTLs; see PR #17.

### 4.2 Single-flight scope

`CloudflareKVCacheManager` keeps `inFlightRevalidations` in a JavaScript `Map` on the manager instance and is currently test-only. It does not coordinate independent Worker isolates or PoPs. KV itself is not a distributed mutex.

**Required action:** do not use this unbound manager as evidence of production caching. Use Workers Cache for public HTTP responses first; add cross-isolate coordination only if measured stampedes justify its latency/cost.

### 4.3 Initial hydration and repeated listing parsing

- PR #19 memoizes the validated nationwide aggregate; PR #22 scopes initial storage hydration and market-pulse seed matching to the URL-selected city, then hydrates another city's expansion records on its first visit.
- PR #22 does **not** yet split static city data modules into deferred JavaScript chunks. The initial bundle still imports the multi-city data graph; measure bundle composition before a separate dynamic-import migration.
- PR #35 adds a WeakMap cache for parsed live listing samples, keyed by immutable bargains-array identity and separated by sale/rent. It returns defensive copies of both the array and sample objects.
- PR #22 memoizes static market/traffic reports per immutable neighborhood record and cloud snapshot identity, avoiding repeated precomputation when another record changes.
- PR #38 memoizes the selected-neighborhood deal summary so unrelated component rerenders do not repeat listing parsing and aggregation.
- Duplicate PRs #27 and #32 were closed; their code ownership is consolidated into #38 and #35 respectively.

These are separate optimization layers: startup hydration, canonical sample parsing, and selected-view aggregation. Keep their regression tests and performance evidence distinct; do not infer a measured speedup from code shape alone.

### 4.4 HTTP cache and CORS variant safety

- A cacheable JSON response must include `Vary: Origin` even when the current request has no Origin or a disallowed Origin.
- Private/authenticated/transactional and error responses must explicitly bypass shared cache.
- A hashed filename is not proof that the asset exists; 4xx/5xx asset responses must be `no-store`.
- Workers Cache must be enabled only after route-level Cache-Control auditing and must remain disabled in staging until isolated validation.

## 5. Implementation sequence

### Gate A — Dependency and CI reconciliation
- Reconcile open PRs and their exact base/head ancestry before any overlapping edits.
- PR #9 is the shared backend integration base at head `5724ce60...`, but it still targets stale main SHA `e2940da...`; current main is `8d3e595d...` and GitHub reports PR #9 non-mergeable. Resolve this integration boundary before merging dependent work.
- PRs #10, #15, #16, #19, #20, #22, #26, and #44 are stacked on PR #9 or descendants. Several were created from older snapshots of the PR #9 branch; do not merge them out of order. PR #44 is based on the latest observed PR #9 head.
- PR #10 owns map clustering, viewport culling, and label LOD; PR #20 owns map provider/LOD changes; PR #16 owns Service Worker tile policy. Preserve these separate file scopes and do not duplicate map work.
- PR #7 is merged; PR #12 is closed without merge. PRs #27 and #32 were closed as duplicates/superseded by #38 and #35.
- Restore a green reproducible CI baseline before using build output as performance evidence.

### Gate B — Baseline instrumentation
- Build repeatable Lighthouse/WebPageTest or equivalent lab profiles and route-level browser measurements.
- Verify consented RUM wiring, data minimization, ingestion, sampling, and retention.
- Add map/API/Worker metrics and P99 where technically available; PR #26 adds P99 as a tail diagnostic and corrects long-task availability to reflect observed long tasks rather than observer presence.
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
- Configure immutable caching only for existing content-hashed assets; revalidate HTML; define explicit public-data cache policies; bypass shared cache for private, transactional, and error responses.
- Enable built-in Workers Cache only after auditing every response path; enforce `Vary: Origin` on JSON, and keep staging cache disabled until end-to-end validation.
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
- Run the Workers Cache post-deploy smoke test and verify public HIT, private/error BYPASS, and CORS variant isolation.
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

This commit records the engineering standard and current baseline. Performance work remains open under issue #13:
- PR #9 is the shared backend integration base; it is still open and non-mergeable against the stale main SHA `e2940da...`.
- PR #44 proposes production API Workers Cache on top of the latest PR #9 head, with staging disabled, static-error no-store, CORS `Vary: Origin`, config validation, and a post-deploy smoke test.
- PR #43 adds a Vite initial-bundle budget analyzer; its workflow has failed without retrievable step logs, so no bundle report or size improvement is claimed.
- PR #35 covers parsed listing-sample caching; its focused regression workflow passed, while full CI is blocked by the mainline TypeScript Gate A baseline.
- PR #38 covers selected-neighborhood deal-summary memoization; full CI is blocked by the same mainline TypeScript baseline.
- PR #22 scopes initial localStorage hydration to the active city and hydrates other cities on first visit; static city dataset modules are still eagerly imported.
- PR #26 improves RUM percentile/INP semantics and rejects incomplete Core Web Vitals samples; latest Actions attempts have no retrievable step logs.
- PR #16 keeps external map tiles network-only and tests exact provider hostnames; PR #10/#20 remain the map LOD/provider workstream.
- Duplicate PRs #27 and #32 are closed in favor of #38 and #35.

The current main HEAD is `8d3e595d25f508525849506e1441a68c0e2ae6fc`; it is newer than the base of PR #9 and the mainline performance PRs #35/#38. Multiple CI attempts currently fail without accessible job logs; do not label any unvalidated tranche complete. The only live Cloudflare mutation so far is removal of the broken staging-only Cron Trigger. No production cache setting, Worker deployment, D1 resource, DNS zone, or secret was changed.
