# Employee 18 — Geography & Spatial Intelligence Backend Architecture & Handoff Report

- **Module Path:** `server/modules/geography/`
- **Target Branch:** `feature/backend-geography`
- **Schema & Rule Version:** `v1.0.0-employee18`

---

## 1. Existing Geographic Catalog Inspection & Reconciled Inconsistencies

Before implementing the Employee 18 architecture, all existing geographic sources across `src/data/` and `server/modules/geography/` were inspected:

1. **Historical "59-Neighborhood" Count vs. 265 Active Neighborhoods**:
   - Record `#59` in `src/data/neighborhoods.ts` is `خانی‌آباد نو و عبدل‌آباد` (`hood:tehran:59`).
   - Record `#60` (`چیتگر و شهرک راه‌آهن`) completes the 60 municipal Tehran core neighborhoods (`1..30` in `src/data/neighborhoods.ts` + `31..60` in `src/data/tehranCityRemainingHoods.ts`).
   - Records `61..80` in `src/data/tehranCountiesHoods.ts` represent 20 satellite county cities/towns in Tehran Province (Pardis, Robat Karim, Eslamshahr, Lavasan, Damavand, etc.).
   - Records `101..155` (Karaj, 55), `201..240` (Mashhad, 40), `301..345` (Isfahan, 45), and `401..445` (Shiraz, 45) in `src/data/multiCityData.ts` bring the total canonical neighborhood catalog to **265 neighborhoods**.
2. **Tehran Municipal Core (`1..60`) vs. Satellite Counties (`61..80`)**:
   - Previously, satellite towns (`61..80`) had non-district `zone` strings (`حومه شرقی`, `شمیرانات`, etc.) and fell back to `city:tehran` without a county distinction.
   - `CanonicalHierarchyAndGraphStore` now provisions `county:tehran_satellite` under `province:tehran` and assigns neighborhoods `61..80` to `county:tehran_satellite`, while preserving metropolitan Tehran search compatibility when `cityNameOrId: 'tehran'` is queried.
3. **Multi-District Neighborhoods**:
   - Several Tehran neighborhoods span multiple municipal districts in their `zone` label (e.g., `"منطقه ۱ و ۳"` or `"منطقه ۲ و ۵"`).
   - `extractAllDistrictNumbersFromZone()` extracts all referenced district numbers, marks multi-district entities as `provisional_review`, assigns the primary district as `parentId`, and records all secondary districts via `LOCATED_WITHIN` edges in the Geographic Relationship Graph.
4. **Province Slug Reconciliation (`razavi_khorasan` vs `khorasan_razavi`)**:
   - `server/modules/geography/provinces.ts` uses `razavi_khorasan`, whereas `src/data/iranProvincesDirectory.ts` and `geographyCatalog.ts` used `khorasan_razavi`.
   - `CanonicalHierarchyAndGraphStore` normalizes the canonical ID to `province:razavi_khorasan` and registers `province:khorasan_razavi` as an official alias so both identifiers resolve deterministically.
5. **Coordinate & Boundary Provenance Honesty**:
   - Existing neighborhood records have centroid (`lat`, `lng`) coordinates and radius-derived bounding boxes, **not** official surveyed municipal polygons.
   - Centroid-only records are explicitly labeled with `boundaryClassification: 'missing'` (or `'approximate'` when a synthetic/radius polygon is registered) and `verificationStatus: 'reconciled_catalog'`, never claiming `verified_official` polygon status without an authoritative GIS boundary import.

---

## 2. Canonical Geographic Hierarchy & Multi-City Architecture

Supported `CanonicalEntityType` levels (`server/modules/geography/employee18Contracts.ts`):
- `country` (`country:IR`)
- `province` (`province:<slug>`, 31 provinces of Iran)
- `county` (`county:<slug>`, e.g., `county:tehran_satellite`)
- `city` (`city:<slug>`, e.g., `city:tehran`, `city:karaj`, `city:mashhad`, `city:isfahan`, `city:shiraz`)
- `municipal_district` (`district:<city>:<num>`, e.g., `district:tehran:1` .. `district:tehran:22`)
- `urban_zone` (`urban_zone:<city>:<code_or_slug>`)
- `neighborhood` (`hood:<city>:<numericId>`)
- `sub_neighborhood` (`subhood:<city>:<slug>`, supporting informal/marketing names with `isInformalOrMarketingName: true`)
- `village` / `rural_district`
- `street_or_road`
- `point_of_interest`
- `custom_geographic_area`

Parent-child hierarchy rules are strictly enforced by `ALLOWED_PARENT_ENTITY_TYPES` and `CanonicalHierarchyAndGraphStore.validateHierarchyLink()`.

---

## 3. Stable Identifiers, Naming, Aliases, Versioning & Historical Continuity

- **Persian Text Normalization**: Normalizes Arabic Yeh (`ي` → `ی`), Arabic Kaf (`ك` → `ک`), Teh Marbuta (`ة` → `ه`), ZWNJ/half-spaces, Persian/Arabic numerals (`۰-۹` / `٠-٩` → `0-9`), and prefixes (`محله`, `شهرک`, `کوی`).
- **Multi-City Homonym Disambiguation**: `ستارخان` exists in both Tehran (`hood:tehran:9`) and Shiraz (`hood:shiraz:405`). Calling `resolveLocationReference({ neighborhoodNameOrAlias: 'ستارخان' })` without `cityNameOrId` returns `resolved: false, isAmbiguous: true` with both candidate entities instead of guessing silently.
- **Lifecycle Operations**:
  - `renameEntity`: Increments `version`, records a `GeographicChangeHistoryEntry`, emits `GeographicEntityUpdated`, and registers the previous name as a `historical_name` alias.
  - `mergeEntities`: Marks source entities `geographicStatus: 'merged'`, sets `replacedByIds`, adds `MERGED_INTO` and `REPLACED_BY` graph edges, and automatically redirects canonical ID lookups to the active merged entity.
  - `splitEntity`: Requires an explicit `EntitySplitMappingRule` (`coordinate_containment_then_manual_review`, `proportional_allocation`, or `manual_reassignment_required`), marks the source entity `split`, and records `SPLIT_INTO` graph edges.
  - `deactivateEntity`: Marks an entity `inactive` or `retired` while keeping its ID resolvable for historical records.

---

## 4. Boundary Management, CRS & Spatial Query Capabilities

- **Supported Geometry Types**: `Point`, `MultiPoint`, `LineString`, `Polygon`, and `MultiPolygon`.
- **Topological Validation (`validateGeoJsonGeometry`)**:
  - Verifies finite coordinates and valid `EPSG:4326` ranges (`lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`) plus Iran lat/lng swap detection.
  - Verifies closed exterior and interior rings (`≥ 4` positions, first === last).
  - Detects non-adjacent segment self-intersections.
  - Validates that interior holes lie strictly inside the exterior ring.
- **Coordinate Reference Systems (`transformCoordinates`)**:
  - Canonical storage: `EPSG:4326` (`WGS84`).
  - Supported conversions: `EPSG:4326` ↔ `EPSG:3857` (Web Mercator) and `EPSG:4326` ↔ `EPSG:32639` / `EPSG:32640` (UTM Zones 39N and 40N covering Iran).
- **Spatial Query Engine (`geometryCrsAndSpatialEngine.ts` & `queryEntitiesPaginated`)**:
  - Point-in-polygon (accounting for interior holes), polygon intersection, polygon containment, geodesic distance, radius search, bounding-box filtering, and polygon area filtering (`minAreaSqMeters`, `maxAreaSqMeters`).
  - Enforces bounded pagination (`MAX_BULK_SPATIAL_QUERY_LIMIT = 100`).

---

## 5. Address Privacy, POIs, Spatial Indexing, External Import & Quality Controls

- **Public vs Private Address Separation (`toPublicSafeAddressView`)**:
  - `PUBLIC_NEIGHBORHOOD_ONLY` and `PUBLIC_STREET_LEVEL` policies strip `preciseCoordinates`, `buildingNumber`, `unitOrFloor`, and `postalCode` unless the caller is the listing owner or an authorized administrator.
- **Points of Interest (`registerPointOfInterest`)**:
  - Stored in `pointsOfInterest` separately from property listings.
  - Enforces operational status honesty: unless `verificationStatus === 'verified_official'`, `operationalStatus` is forced to `'unknown_unverified'`.
- **Spatial Indexing (`UnconfiguredH3Provider`)**:
  - Provides a clean H3 hexagonal indexing contract (`latLngToCell`, `cellToBoundary`, `gridDisk`) that reports `status: 'UNAVAILABLE_DEPENDENCY'` until `h3-js` is installed in `package.json`.
- **Controlled External Dataset Import (`stageExternalGeographicImport` & `approveAndCommitStagedImport`)**:
  - Validates candidate records produced by Employee 17 (`data-ingestion`), quarantines records with `INVALID_GEOMETRY`, `PARENT_CHILD_CONFLICT`, or `DUPLICATE_ENTITY`, and requires explicit admin approval before committing to canonical entities.
- **Quality Auditor & Spatial Intelligence**:
  - `generateQualityReport()` checks duplicate IDs, duplicate canonical names in the same parent scope, missing parents, invalid hierarchy links, invalid coordinates, invalid geometries, and distinguishes unexpected same-type boundary overlaps from legitimate cross-type containment.
  - `getNeighborhoodSpatialIntelligence()` computes purely spatial aggregations (`containsMarketValuationData: false`).

---

## 6. Cross-Module Integration Contracts & Versioned Events

- **Search & Discovery**: Uses `resolveLocationReference`, `queryEntitiesPaginated`, and `getParentChain` for hierarchical city/district/neighborhood filtering and bounding-box/radius queries.
- **Listing & Property Management**: Uses `resolveLocationReference` and `toPublicSafeAddressView` to validate listing locations and protect seller coordinate privacy.
- **Crowd Data & Valuation**: Uses canonical entity IDs (`hood:<city>:<id>`), `getNeighborhoodSpatialIntelligence`, and merge/split history to maintain continuity across valuation baselines without embedding pricing logic inside Geography.
- **External Data Ingestion (Employee 17)**: Delivers normalized geographic candidate payloads into `stageExternalGeographicImport`.
- **Admin & Moderation**: Uses `generateQualityReport`, `quarantinedImports`, `approveAndCommitStagedImport`, `mergeEntities`, `splitEntity`, and `upsertBoundary`.
- **Emitted Versioned Events (`GeographicEventType`)**:
  - `GeographicEntityCreated`, `GeographicEntityUpdated`, `GeographicEntityRenamed`, `GeographicEntityMerged`, `GeographicEntitySplit`, `GeographicEntityDeactivated`, `GeographicBoundaryUpdated`, `GeographicAliasUpdated`, `GeographicDatasetImported`, `GeographicDatasetApproved`, `GeographicResolutionFailed`.
