# Radar Tehran — Engineering Assessment Deliverable: ASSESS-007 & ASSESS-008
## Workstreams:
- `ASSESS-007`: Leaflet Marker LOD, Collision Declustering & Viewport Culling
- `ASSESS-008`: PWA Caching, Manifest Compliance & Service Worker Resilience
## Campaign: `CAMPAIGN-PROD-03: Performance, Rendering & Offline Resilience`
## Role / Owner: Member 06 — Frontend & Geospatial Performance Engineer

---

## 1. Executive Summary & Objective
**Campaign PROD-03** evaluates the rendering performance, DOM memory bounds, and offline PWA resilience of Radar Tehran when scaling across nationwide metropolitan datasets (Tehran, Karaj, Mashhad, Isfahan, Shiraz) on constrained 3G/4G mobile devices.

---

## 2. Workstream `ASSESS-007`: Leaflet Marker LOD & Viewport Culling Audit

| # | Optimization Subsystem | Source Implementation | Verified Invariant | Status |
|---|---|---|---|---|
| 1 | **Live Viewport Culling** | `selectVisibleMapNeighborhoods` (`src/components/map/neighborhoodLayerReconciler.ts`) + `resolveGeoLazyLoadingPolicy` | Uses the actual Leaflet viewport after manual pans, with configured 8–22% padding; retains the selected neighborhood even when it is outside the viewport or excluded by the status filter. | `IMPLEMENTED` (`CI_PENDING`) |
| 2 | **Production Macro-Zoom Clustering** | `buildMacroZoomClusters`, `renderMacroClustersOnLeaflet` and `useLeafletRadarMap.ts` | Connects clustering to the production Leaflet render path at `zoom <= 9`; uses a spatial hash for nearby seed lookup and removes individual neighborhood layers while clusters are active. | `IMPLEMENTED` (`CI_PENDING`) |
| 3 | **Progressive Labels & Collision Budget** | `computeDeclutteredMarkerTiers`, `getMapLabelBudget` (`src/components/mapZoomLodAndDeclutter.ts`) | Zoom 10–11: dots; zoom 12–13: selected neighborhood only; zoom 14+: compact labels only for non-selected neighborhoods, with sponsored neighborhoods prioritized; hard budget is 12–40 text labels based on map dimensions. | `IMPLEMENTED` (`CI_PENDING`) |
| 4 | **Canonical Name vs. Map Label** | `getNeighborhoodMapLabel` + `formatCompactNeighborhoodName` | Compact map labels are shortened independently; the canonical neighborhood name remains unchanged for tooltips and downstream detail views. | `IMPLEMENTED` (`CI_PENDING`) |
| 4 | **Polygon LOD Decimation & Bounded LRU Cache** | `simplifyPolygonRingForZoomLod` & `BoundedGeoJsonLruCache` (`src/utils/geojsonViewportLazyEngine.ts`) | Decimates off-screen/low-zoom polygon vertices (down to 6–10 vertices on mobile) and strictly bounds cached GeoJSON features with automatic LRU eviction. | `VERIFIED` (`TEST_EXECUTED`) |

---

### 2.1. Implementation Record — `RT-MAP-UX-PERFORMANCE-001`

- **Viewport correctness:** removed the Tehran-specific culling bypass. Viewport filtering now follows the live map bounds, including after a user pans away from the selected neighborhood.
- **Selection invariant:** the selected neighborhood is retained across viewport and status-filter changes.
- **Low-zoom rendering:** at zoom levels 9 and below, the normal polygon/marker layers are cleared and replaced by weighted macro-clusters. Cluster markers are removed during zoom transitions, map teardown, and map off-screen cleanup.
- **Label policy:** text labels are deferred until zoom 14. The selected neighborhood keeps its own readable label at zoom 12–13. At higher zooms, non-selected labels use compact names; sponsor priority is limited to the 14–15 zoom band.
- **Performance bound:** visible text labels are capped at 12–40 according to the actual Leaflet map dimensions. Macro-cluster candidate lookup uses a spatial hash instead of scanning every existing group.
- **Regression coverage:** `tests/rt-map-ux-performance-001.test.ts` is included in `npm run test:assess`, which is part of `npm test`.
- **Validation status:** source and test changes are committed on the feature branch. Automated execution is not claimed until the GitHub Actions checks complete.

---

## 3. Workstream `ASSESS-008`: PWA Caching & Offline Recovery Resilience Audit

| # | PWA / Service Worker Subsystem | Source Implementation | Verified Invariant | Status |
|---|---|---|---|---|
| 1 | **WebAppManifest Compliance** | `public/manifest.json` + `validateManifestOfflineConfig` (`src/utils/pwaOfflineSupport.ts`) | Root `id: "/"`, `start_url: "/"`, `display: "standalone"`, `offline_enabled: true`, separate `any` (192x192, 512x512) and `maskable` icons, and offline exploration shortcuts. | `VERIFIED` (`TEST_EXECUTED`) |
| 2 | **Zero-Trust Auth & Admin Bypass** | `classifyServiceWorkerRequestStrategy` (`src/utils/pwaOfflineSupport.ts`) | Strictly returns `BypassPrivateOrMutation` for all non-GET mutations, requests with `Authorization` headers, `/api/admin/*`, `/api/system-health`, and `/api/object-storage/*`. | `VERIFIED` (`TEST_EXECUTED`) |
| 3 | **Provider-Compliant Map Tile Delivery & Asset Caching** | `classifyServiceWorkerRequestStrategy` (`public/sw.js`, `src/utils/pwaOfflineSupport.ts`) | Map tiles (including `/api/osm-tile/*`) use network fetch plus the browser/provider HTTP cache directives; Service Worker Cache API never persists tiles or enables offline map use. Hashed Vite `/assets/*` bundles remain `StaleWhileRevalidate`; `/api/market-pulse` remains `NetworkFirst`. | `IN_PROGRESS` (`PROVIDER_POLICY_ALIGNMENT`) |

---

## 4. Campaign PROD-03 Conclusion
The historical `ASSESS-007` and `ASSESS-008` baseline checks remain recorded above. The additional `RT-MAP-UX-PERFORMANCE-001` implementation is **not CI-verified yet**; its completion status must be updated only after the feature-branch quality gates pass. No deployment or production Cloudflare resource was changed by this implementation.
