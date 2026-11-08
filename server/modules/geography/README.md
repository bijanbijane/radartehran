# Geography & Spatial Intelligence Backend Module (`server/modules/geography/`)

**Exclusive Module Owner:** Employee 18 (`feature/backend-geography`)  
**Scope:** `server/modules/geography/`

---

## 1. Mission & Responsibility

`server/modules/geography/` owns the canonical geographic reference system and spatial intelligence engine for Tehran Radar. It provides:

1. **Canonical Versioned Geographic Hierarchy** (`country`, `province`, `county`, `city`, `municipal_district`, `urban_zone`, `neighborhood`, `sub_neighborhood`, `village`, `rural_district`, `street_or_road`, `point_of_interest`, `custom_geographic_area`).
2. **Tehran & Multi-City Reconciled Structure**:
   - **Country**: `country:IR` (Iran)
   - **Provinces**: 31 canonical Iranian provinces (`province:tehran`, `province:alborz`, `province:razavi_khorasan` with alias `province:khorasan_razavi`, `province:isfahan`, `province:fars`, etc.)
   - **Tehran Satellite County**: `county:tehran_satellite` under `province:tehran` for the 20 satellite county cities/towns (`61..80`, e.g., Pardis, Robat Karim, Eslamshahr, Lavasan, Damavand)
   - **Cities**: 5 full-neighborhood-coverage cities (`city:tehran`, `city:karaj`, `city:mashhad`, `city:isfahan`, `city:shiraz`) + extensible city catalog
   - **Tehran Municipal Districts**: 22 official districts (`district:tehran:1` .. `district:tehran:22`)
   - **Neighborhoods**: 265 reconciled neighborhoods (`hood:<cityId>:<numericId>`) — 80 in Tehran (`1..60` municipal core + `61..80` satellite counties), 55 in Karaj (`101..155`), 40 in Mashhad (`201..240`), 45 in Isfahan (`301..345`), and 45 in Shiraz (`401..445`).
3. **Stable Identifiers, Alternative Names & Versioning**:
   - Persian normalization (Arabic Yeh `ي` → `ی`, Kaf `ك` → `ک`, ZWNJ, digit normalization).
   - Multi-city homonym disambiguation (e.g., `ستارخان` in Tehran `hood:tehran:9` vs Shiraz `hood:shiraz:405`).
   - Safe entity rename, merge (`MERGED_INTO` / `REPLACED_BY`), split (requiring explicit `splitMappingRule`), and deactivation without breaking historical references.
4. **Boundary Management & Coordinate Reference Systems (CRS)**:
   - Supports `Point`, `MultiPoint`, `LineString`, `Polygon`, and `MultiPolygon` with exterior ring closure, self-intersection detection, and interior hole containment validation.
   - Canonical storage in `EPSG:4326` (`WGS84`) with verified transformations for `EPSG:3857` (Web Mercator) and `EPSG:32639` / `EPSG:32640` (UTM Zones 39N/40N for Iran) plus swapped latitude/longitude detection.
   - Versioned boundary history (`boundaryVersion = 1, 2, ...`) distinguishing `official`, `approximate`, `provisional`, and `manually_reviewed` boundaries.
5. **Spatial Query Engine & Bounded Pagination**:
   - Point-in-polygon (respecting interior holes), polygon intersection, polygon containment, Haversine/geodesic distance, radius queries, bounding-box queries, and area filtering with strict pagination (`MAX_BULK_SPATIAL_QUERY_LIMIT = 100`).
6. **Location Resolution, Address Privacy & Points of Interest (POIs)**:
   - Multi-modal location resolution (`resolveLocationReference`) by canonical ID, administrative code, Persian/English name or alias, coordinates, or structured address.
   - Public vs private address separation (`toPublicSafeAddressView`) stripping exact coordinates, building numbers, and postal codes from unauthorized public views.
   - Separate POI registry (`registerPointOfInterest`) that never fabricates live open/closed facility status.
7. **Controlled External Dataset Import, Quality Auditor & Relationship Graph**:
   - Staging & quarantine workflow (`stageExternalGeographicImport`, `approveAndCommitStagedImport`) that prevents unapproved external imports from overwriting verified canonical entities.
   - Automated `GeographicQualityReport` generator and `NeighborhoodSpatialAggregation` (`containsMarketValuationData: false`).
   - Explicit Relationship Graph (`PARENT_OF`, `CHILD_OF`, `LOCATED_WITHIN`, `ADJACENT_TO`, `INTERSECTS`, `CONTAINS`, `CONNECTED_TO`, `ALIAS_OF`, `REPLACED_BY`, `MERGED_INTO`, `SPLIT_INTO`).

---

## 2. Module File Layout

| File | Responsibility |
|---|---|
| `index.ts` | Canonical barrel exports for backward-compatible reference services and Employee 18 engines |
| `employee18Contracts.ts` | Employee 18 types: 13 entity types, boundaries, CRS, spatial queries, resolution, address privacy, POIs, relationship graph, quality report, quarantine, and 10 versioned events |
| `geometryCrsAndSpatialEngine.ts` | GeoJSON geometry validation (ring closure, self-intersection, holes), CRS transformation (`EPSG:4326`, `EPSG:3857`, `EPSG:32639`, `EPSG:32640`), spatial predicates, and bounded pagination |
| `hierarchyVersioningAndGraphEngine.ts` | `CanonicalHierarchyAndGraphStore`: hierarchy seeding, multi-district reconciliation, entity create/rename/merge/split/deactivate, boundary versioning, relationship graph, and domain events |
| `qualityIntelligenceAndCrossModuleService.ts` | `Employee18GeographyEngine`: location resolution, public/private address view, POI registry, external import staging/quarantine/approval, quality auditor, and neighborhood spatial intelligence |
| `types.ts`, `provinces.ts`, `cities.ts`, `neighborhoods.ts`, `aliases.ts`, `inventory.ts`, `service.ts` | Reconciled baseline datasets and backward-compatible reference service |
| `geographyTypes.ts`, `geographyCatalog.ts`, `geographySpatialEngine.ts`, `geographyNormalizer.ts`, `geographyProviders.ts`, `geographyAddressResolver.ts`, `geographyImportPipeline.ts`, `geographyService.ts` | Backward-compatible spatial, normalization, H3 provider (`UnconfiguredH3Provider`), and import pipeline modules |
| `__tests__/employee18Geography.test.ts` | Comprehensive verification test suite covering all 6 mandatory Employee 18 test categories |
| `docs/INITIAL-DATA-INVENTORY.md` | Initial 59-vs-265 neighborhood audit and reconciliation ledger |
| `docs/EMPLOYEE-18-ARCHITECTURE-AND-HANDOFF.md` | Full architecture, cross-module integration contracts, and handoff report |

---

## 3. Verification Commands

```bash
npx tsx --test server/modules/geography/__tests__/employee18Geography.test.ts
npx tsx tests/geography-reference-data.test.ts
npx tsx tests/geography-module.test.ts
npm run lint
npm run arch:check
```
