/**
 * @file server/modules/geography/types.ts
 * @description Canonical Type Definitions for the Radartehran Geographic Reference-Data Backend.
 * Defines stable identifiers, administrative boundaries, hierarchy, aliases, and validation contracts.
 */

export type SupportedCityId = 'tehran' | 'karaj' | 'mashhad' | 'isfahan' | 'shiraz';

export type ProvinceId = 'tehran' | 'alborz' | 'razavi_khorasan' | 'isfahan' | 'fars';

export type GeometryType =
  | 'verified_polygon'
  | 'approximate_radius'
  | 'centroid_only'
  | 'missing_coordinates';

export type RecordStatus = 'active' | 'provisional' | 'deprecated' | 'redirect';

export type VerificationStatus = 'verified' | 'reconciled' | 'unverified';

/**
 * Geographic Point with latitude and longitude (WGS84).
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Axis-aligned geographic bounding box.
 */
export interface GeoBoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Boundary metadata distinguishing verified geometries from approximate locations.
 */
export interface BoundaryMetadata {
  geometryType: GeometryType;
  center: GeoPoint | null;
  radiusMeters: number | null;
  boundingBox: GeoBoundingBox | null;
  verifiedPolygonAvailable: boolean;
  sourceNote?: string;
}

/**
 * Dataset Version & Provenance Metadata.
 */
export interface DatasetProvenance {
  datasetVersion: string;
  sourceCatalog: string;
  verificationStatus: VerificationStatus;
  lastVerifiedDate: string;
  reconciliationNotes?: string;
}

/**
 * Canonical Province Record.
 */
export interface CanonicalProvince {
  id: ProvinceId;
  nameFa: string;
  nameEn: string;
  capitalFa: string;
  officialCode: string;
  center: GeoPoint;
  boundingBox: GeoBoundingBox;
  status: RecordStatus;
  provenance: DatasetProvenance;
}

/**
 * Canonical City Record.
 */
export interface CanonicalCity {
  id: SupportedCityId;
  provinceId: ProvinceId;
  nameFa: string;
  nameEn: string;
  slug: string;
  officialCode: string;
  center: GeoPoint;
  defaultZoom: number;
  boundingBox: GeoBoundingBox;
  neighborhoodCount: number;
  municipalDistrictsCount: number;
  status: RecordStatus;
  provenance: DatasetProvenance;
}

/**
 * Canonical Neighborhood Record.
 * Every neighborhood belongs to exactly one city.
 */
export interface CanonicalNeighborhood {
  /** Stable numeric identifier from existing source catalog */
  id: number;
  /** Global composite identifier: `${cityId}:${id}` */
  compositeId: string;
  /** Primary city foreign key */
  cityId: SupportedCityId;
  /** Province foreign key derived from city */
  provinceId: ProvinceId;
  /** Official primary Persian name */
  nameFa: string;
  /** Normalized ASCII slug */
  slug: string;
  /** Municipal zone or administrative district string */
  zone: string;
  /** Municipal district number if parsed (e.g. 1 for منطقه ۱) */
  districtNumber: number | null;
  /** Geographic coordinates (null if missing) */
  coordinates: GeoPoint | null;
  /** Boundary and geometry metadata */
  boundary: BoundaryMetadata;
  /** Alternative spellings and aliases registered for this neighborhood */
  aliases: string[];
  /** Parent administrative identifiers */
  hierarchy: {
    country: 'IR';
    provinceId: ProvinceId;
    cityId: SupportedCityId;
    districtNumber: number | null;
  };
  /** Record lifecycle status */
  status: RecordStatus;
  /** Dataset provenance */
  provenance: DatasetProvenance;
}

/**
 * Neighborhood Alias Definition for spelling normalization and search resolution.
 */
export interface NeighborhoodAlias {
  alias: string;
  normalizedAlias: string;
  targetHoodId: number;
  targetCityId: SupportedCityId;
  kind: 'spelling_variant' | 'colloquial' | 'sub_area' | 'zwnj_variant';
  isAmbiguousAcrossCities: boolean;
}

/**
 * Administrative Hierarchy Path from Country to Neighborhood.
 */
export interface AdministrativeHierarchy {
  country: { code: 'IR'; nameFa: 'ایران' };
  province: CanonicalProvince;
  city: CanonicalCity;
  district: { districtNumber: number | null; zoneLabel: string };
  neighborhood: CanonicalNeighborhood;
}

/**
 * City-to-Neighborhood validation result.
 */
export interface CityNeighborhoodValidationResult {
  valid: boolean;
  cityId: SupportedCityId | null;
  hoodId: number | null;
  reasonCode:
    | 'VALID'
    | 'CITY_NOT_SUPPORTED'
    | 'HOOD_NOT_FOUND'
    | 'HOOD_DOES_NOT_BELONG_TO_CITY'
    | 'INVALID_IDENTIFIER_FORMAT'
    | 'AMBIGUOUS_NAME_WITHOUT_CITY'
    | 'DEPRECATED_RECORD_UNMIGRATED';
  errorMessage?: string;
  suggestedCityId?: SupportedCityId;
  neighborhood?: CanonicalNeighborhood;
}

/**
 * Geographic Query Parameters for lookups.
 */
export interface GeoLookupQuery {
  cityId?: SupportedCityId;
  query?: string;
  coordinates?: GeoPoint;
  boundingBox?: GeoBoundingBox;
  districtNumber?: number;
  includeDeprecated?: boolean;
  limit?: number;
}

/**
 * Name Resolution Outcome (handles duplicate names and ambiguous aliases).
 */
export interface NameResolutionResult {
  resolved: boolean;
  isAmbiguous: boolean;
  candidates: Array<{
    neighborhood: CanonicalNeighborhood;
    matchType: 'exact_name' | 'alias' | 'normalized';
    confidence: number;
  }>;
}

/**
 * Dataset Inventory Reconciliation Report.
 */
export interface DatasetInventoryReport {
  datasetVersion: string;
  generatedAtIso: string;
  supportedCitiesCount: number;
  totalNeighborhoodsCount: number;
  neighborhoodsByCity: Record<SupportedCityId, number>;
  historical59Reconciliation: {
    reportedCount: 59;
    reconciledCount: number;
    explanation: string;
    tehranMunicipalCoreCount: number;
    tehranCountyCount: number;
    totalTehranCatalogCount: number;
  };
  dataIntegrityAudit: {
    duplicateNumericIds: number[];
    missingCoordinatesCount: number;
    crossCityDuplicateNames: Array<{ name: string; cities: SupportedCityId[]; hoodIds: number[] }>;
    allHoodsBelongToExactlyOneCity: boolean;
  };
}
