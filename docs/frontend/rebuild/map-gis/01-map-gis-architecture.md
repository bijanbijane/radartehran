# RT-FE-REBUILD-MAP-GIS-004 — Map Engine, GIS Architecture & Spatial Synchronization

## 1. Core Spatial Engine (`src/platform/geo/`)
- **Coordinate System**: Canonical `WGS84_EPSG_4326` (`GeoTypes.ts`, `GeoValidation.ts`), automatic detection of swapped `[lng, lat]` coordinates, `[0, 0]` rejection, and Iran/Tehran bounding constraints.
- **Leaflet Lifecycle (`MapInstanceRegistry.ts`, `MapLifecycle.ts`)**: Enforces `1` active map instance per container and `0` after unmount, with deterministic listener cleanup.
- **9 Managed Spatial Layers (`LayerRegistry.ts`, `LayerLifecycle.ts`)**: Independent ownership and keyed diffing for `Tile`, `Boundary`, `Neighborhood`, `Marker`, `GoldPin`, `Heatmap`, `Landmark`, `Route`, and `Drawing`.
- **Map ↔ List ↔ URL Synchronization (`ViewportController.ts`)**: Shared `MapViewportState` with `300–500ms` debounced URL query serialization (`lat`, `lng`, `zoom`, `neighborhood`, `property`, `view`).
- **5-Tier Clustering & LOD Policy (`ClusterPolicy.ts`, `ClusterController.ts`)**:
  - `0–100`: `DIRECT_MARKERS`
  - `101–500`: `LIGHT_CLUSTER`
  - `501–2000`: `FULL_CLUSTER_SUMMARY`
  - `2001–10000`: `SPATIAL_INDEX_WORKER`
  - `>10000`: `SERVER_AGGREGATION`
- **Polygon & Rectangle Drawing (`GeometryValidator.ts`, `PolygonEditor.ts`, `DrawingController.ts`)**: Enforces `>= 3` vertices, self-intersection detection, spherical area/perimeter calculation, and `>= 20` undo steps.
- **Tile Resilience (`LeafletRuntime.ts`)**: Tracks tile load/error ratio and activates fallback provider when tile errors exceed `30%`.
