# Geographic Reference Data Contract (`GEOGRAPHIC-DATA-CONTRACT.md`)

- **Module**: `server/modules/geography/`
- **Owner**: Employee 8 — Geographic Reference Data Backend
- **Dataset Version**: `v1.0.0-2026.11-reconciled`
- **Status**: CANONICAL & STABLE

---

## 1. Architectural Scope & Invariants

This document specifies the authoritative geographic reference-data contract for the Radartehran platform. All downstream backend modules (listings, buyer alerts, hedonic pricing, market pulse, and external integrations) must adhere to these interfaces and validation rules.

### Core Domain Invariants
1. **Single-City Ownership**: Every neighborhood belongs to exactly one city (`cityId`).
2. **Context-Aware Identifiers**: A neighborhood numeric identifier (`hoodId`) must always be evaluated in conjunction with its parent city identifier (`cityId`), or referenced via its globally unique composite identifier (`compositeId`).
3. **Identifier Immutability**: Existing numeric IDs (Tehran `1..80`, Karaj `101..155`, Mashhad `201..240`, Isfahan `301..345`, Shiraz `401..445`) are immutable and must never be altered or reassigned.
4. **Zero-Invention Principle**: No neighborhood names, IDs, coordinates, or boundary geometries may be invented. Only verified data from existing project catalogs is admitted.
5. **Geometric Honesty**: Approximate locations (center point + radius) are explicitly marked as `approximate_radius` and must never be misrepresented as surveyed polygons. Missing coordinates are safely handled with `geometryType: 'missing_coordinates'`.

---

## 2. Identifier Specifications

### Composite Geographic Identifier (`CompositeNeighborhoodId`)
- **Format**: `${cityId}:${hoodId}`
- **Pattern**: `^(tehran|karaj|mashhad|isfahan|shiraz):[1-9]\d*$`
- **Examples**:
  - `tehran:3` (Saadat Abad, Tehran)
  - `karaj:101` (Azimiyeh, Karaj)
  - `mashhad:201` (Sajjad, Mashhad)
  - `isfahan:301` (Mardavij, Isfahan)
  - `shiraz:401` (Qasr al-Dasht, Shiraz)
  - `shiraz:404` (Sattarkhan, Shiraz) vs `tehran:28` (Sattarkhan, Tehran)

### City Identifiers (`SupportedCityId`)
- Restricted enum: `'tehran' | 'karaj' | 'mashhad' | 'isfahan' | 'shiraz'`.

### Province Identifiers (`ProvinceId`)
- Restricted enum: `'tehran' | 'alborz' | 'razavi_khorasan' | 'isfahan' | 'fars'`.

---

## 3. Data Schemas

### Canonical Neighborhood Record
```typescript
interface CanonicalNeighborhood {
  id: number;
  compositeId: string;
  cityId: SupportedCityId;
  provinceId: ProvinceId;
  nameFa: string;
  slug: string;
  zone: string;
  districtNumber: number | null;
  coordinates: { lat: number; lng: number } | null;
  boundary: {
    geometryType: 'verified_polygon' | 'approximate_radius' | 'centroid_only' | 'missing_coordinates';
    center: { lat: number; lng: number } | null;
    radiusMeters: number | null;
    boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
    verifiedPolygonAvailable: boolean;
    sourceNote?: string;
  };
  aliases: string[];
  hierarchy: {
    country: 'IR';
    provinceId: ProvinceId;
    cityId: SupportedCityId;
    districtNumber: number | null;
  };
  status: 'active' | 'provisional' | 'deprecated' | 'redirect';
  provenance: {
    datasetVersion: string;
    sourceCatalog: string;
    verificationStatus: 'verified' | 'reconciled' | 'unverified';
    lastVerifiedDate: string;
    reconciliationNotes?: string;
  };
}
```

---

## 4. Validation Contract & Error Reason Codes

The primary validation method is `validateCityNeighborhood(cityId, hoodId)`.

| Reason Code | HTTP Status | Description | Recovery / Remediation |
|---|---|---|---|
| `VALID` | `200` | The neighborhood exists and belongs to the specified city. | Proceed with request. |
| `CITY_NOT_SUPPORTED` | `400` | The `cityId` is not in the supported registry. | Must be one of `tehran`, `karaj`, `mashhad`, `isfahan`, `shiraz`. |
| `INVALID_IDENTIFIER_FORMAT` | `400` | `hoodId` is not a positive integer. | Supply a valid positive integer ID. |
| `HOOD_DOES_NOT_BELONG_TO_CITY` | `422` | The neighborhood exists, but belongs to a different city. | Response includes `suggestedCityId`. Client should update city context. |
| `HOOD_NOT_FOUND` | `404` | No neighborhood with this ID exists in any city catalog. | Verify ID against the canonical inventory. |
| `AMBIGUOUS_NAME_WITHOUT_CITY` | `400` | A query matched multiple neighborhoods in different cities (e.g. Sattarkhan). | Client must qualify query with explicit `cityId`. |

---

## 5. Geographic Service Interface

```typescript
interface GeographicReferenceService {
  getCity(cityIdOrName: string): CanonicalCity | null;
  listCities(): CanonicalCity[];
  getProvince(provinceId: string): CanonicalProvince | null;
  listProvinces(): CanonicalProvince[];
  getNeighborhood(cityId: SupportedCityId, hoodId: number): CanonicalNeighborhood | null;
  getNeighborhoodByCompositeId(compositeId: string): CanonicalNeighborhood | null;
  validateCityNeighborhood(cityId: unknown, hoodId: unknown): CityNeighborhoodValidationResult;
  getNeighborhoodHierarchy(cityId: SupportedCityId, hoodId: number): AdministrativeHierarchy | null;
  findNeighborhoods(query: GeoLookupQuery): CanonicalNeighborhood[];
  findNearestNeighborhood(lat: number, lng: number, cityId?: SupportedCityId): { neighborhood: CanonicalNeighborhood; distanceKm: number } | null;
  findNeighborhoodsInBoundingBox(bbox: GeoBoundingBox, cityId?: SupportedCityId): CanonicalNeighborhood[];
  resolveAmbiguousName(query: string, preferredCityId?: SupportedCityId): NameResolutionResult;
}
```
