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
| 1 | **Viewport + Radial Buffer Culling** | `filterNeighborhoodsInViewportWithBuffer` (`src/components/mapZoomLodAndDeclutter.ts`) | Only mounts neighborhoods inside the 10% padded Leaflet viewport (`STANDARD_VIEWPORT_BUFFER_PAD = 0.10`) while guaranteeing the active `selectedHoodId` is never culled. | `VERIFIED` (`TEST_EXECUTED`) |
| 2 | **Macro-Zoom Spatial Clustering** | `buildMacroZoomClusters` (`src/components/mapZoomLodAndDeclutter.ts`) | Compresses dense city markers into weighted regional clusters at `zoom <= 9` (merge radius: 85km at $\le 7$, 55km at $8$, 36km at $9$). | `VERIFIED` (`TEST_EXECUTED`) |
| 3 | **Screen-Space Collision Declustering** | `computeDeclutteredMarkerTiers` (`src/components/mapZoomLodAndDeclutter.ts`) | Prioritizes selected > sponsored > high-score neighborhoods; demotes colliding screen-space bounding boxes from `detailed_pill` $\to$ `standard_pill` $\to$ `compact_chip` $\to$ `dot`. | `VERIFIED` (`TEST_EXECUTED`) |
| 4 | **Polygon LOD Decimation & Bounded LRU Cache** | `simplifyPolygonRingForZoomLod` & `BoundedGeoJsonLruCache` (`src/utils/geojsonViewportLazyEngine.ts`) | Decimates off-screen/low-zoom polygon vertices (down to 6–10 vertices on mobile) and strictly bounds cached GeoJSON features with automatic LRU eviction. | `VERIFIED` (`TEST_EXECUTED`) |

---

## 3. Workstream `ASSESS-008`: PWA Caching & Offline Recovery Resilience Audit

| # | PWA / Service Worker Subsystem | Source Implementation | Verified Invariant | Status |
|---|---|---|---|---|
| 1 | **WebAppManifest Compliance** | `public/manifest.json` + `validateManifestOfflineConfig` (`src/utils/pwaOfflineSupport.ts`) | Root `id: "/"`, `start_url: "/"`, `display: "standalone"`, `offline_enabled: true`, separate `any` (192x192, 512x512) and `maskable` icons, and offline exploration shortcuts. | `VERIFIED` (`TEST_EXECUTED`) |
| 2 | **Zero-Trust Auth & Admin Bypass** | `classifyServiceWorkerRequestStrategy` (`src/utils/pwaOfflineSupport.ts`) | Strictly returns `BypassPrivateOrMutation` for all non-GET mutations, requests with `Authorization` headers, `/api/admin/*`, `/api/system-health`, and `/api/object-storage/*`. | `VERIFIED` (`TEST_EXECUTED`) |
| 3 | **Stale-While-Revalidate Map Tiles & Assets** | `classifyServiceWorkerRequestStrategy` (`public/sw.js`, `src/utils/pwaOfflineSupport.ts`) | Serves `/api/osm-tile/*`, Carto/OSM basemaps, and hashed Vite `/assets/*` bundles via `StaleWhileRevalidate` while using `NetworkFirst` for `/api/market-pulse`. | `VERIFIED` (`TEST_EXECUTED`) |

---

## 4. Campaign PROD-03 Conclusion
Both `ASSESS-007` and `ASSESS-008` are verified via `tests/assess-007-008-performance-lod-and-pwa.test.ts`. **Campaign PROD-03 (`Performance, Rendering & Offline Resilience`)** is formally complete (`CAMPAIGN_COMPLETE`).
