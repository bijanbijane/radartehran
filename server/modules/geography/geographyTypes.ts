/**
 * @file server/modules/geography/geographyTypes.ts
 * @description Canonical data models, schemas, and spatial contracts for Geography & Location Intelligence.
 */

export type GeographicLevel =
  | 'country'
  | 'province'
  | 'county'
  | 'city'
  | 'urban_district'
  | 'neighborhood'
  | 'sub_neighborhood';

export type BoundaryProvenance =
  | 'OFFICIAL_CADASTRAL_VERIFIED'
  | 'EMPIRICAL_MUNICIPAL_SURVEY'
  | 'APPROXIMATE_RADIUS_SYNTHESIS'
  | 'UNVERIFIED_SOURCE'
  | 'MISSING';

export type CoordinateSystem = 'EPSG:4326_WGS84';

export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface GeoBoundingBox {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

export interface GeoPolygonGeometry {
  readonly type: 'Polygon' | 'MultiPolygon';
  readonly coordinates: number[][][] | number[][][][]; // GeoJSON [lng, lat]
}

export interface GeographicBoundary {
  readonly provenance: BoundaryProvenance;
  readonly sourceAuthority?: string;
  readonly datasetVersion?: string;
  readonly importedAtIso?: string;
  readonly boundingBox?: GeoBoundingBox;
  readonly centroid?: GeoPoint;
  readonly geometry?: GeoPolygonGeometry;
  readonly approximateRadiusMeters?: number;
}

export interface GeographicEntity {
  readonly id: string; // Global stable identifier, e.g. "province:tehran", "city:tehran", "hood:tehran:5"
  readonly level: GeographicLevel;
  readonly parentId?: string; // Stable ID of direct parent in hierarchy
  readonly nameFa: string;
  readonly nameEn?: string;
  readonly altNamesFa?: readonly string[];
  readonly code?: string; // Official municipal/cadastral code if available
  readonly center?: GeoPoint;
  readonly boundary: GeographicBoundary;
  readonly isActive: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface NormalizedAddress {
  readonly rawAddress: string;
  readonly cleanText: string;
  readonly detectedProvinceFa?: string;
  readonly detectedCityFa?: string;
  readonly detectedDistrictFa?: string;
  readonly detectedNeighborhoodFa?: string;
  readonly detectedStreets?: readonly string[];
  readonly tokens: readonly string[];
}

export interface AddressResolutionOutcome {
  readonly normalizedAddress: NormalizedAddress;
  readonly resolvedEntity?: GeographicEntity;
  readonly confidence: number; // 0.0 to 1.0
  readonly isCoordinateVerified: boolean;
  readonly verifiedCoordinates?: GeoPoint;
  readonly resolutionNotesFa: string;
}

export interface SpatialLookupResult {
  readonly entity: GeographicEntity;
  readonly distanceMeters: number;
  readonly isExactInsidePolygon: boolean;
  readonly isWithinApproximateRadius: boolean;
}

export interface GeocodingProviderResult {
  readonly status: 'SUCCESS' | 'NOT_FOUND' | 'UNAVAILABLE' | 'RATE_LIMITED' | 'ERROR';
  readonly query: string;
  readonly location?: GeoPoint;
  readonly boundingBox?: GeoBoundingBox;
  readonly formattedAddressFa?: string;
  readonly providerName: string;
  readonly executionTimeMs: number;
  readonly error?: string;
}

export interface GeocodingProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  forwardGeocode(addressText: string): Promise<GeocodingProviderResult>;
  reverseGeocode(point: GeoPoint): Promise<GeocodingProviderResult>;
}

export interface H3SpatialIndexingResult {
  readonly status: 'ACTIVE' | 'UNAVAILABLE';
  readonly h3Resolution?: number;
  readonly cellIndex?: string;
  readonly reason?: string;
}

export interface H3SpatialIndexingProvider {
  readonly isAvailable: boolean;
  getResolutionForLevel(level: GeographicLevel): number;
  pointToCell(point: GeoPoint, resolution: number): H3SpatialIndexingResult;
  cellToPoint(cellIndex: string): GeoPoint | null;
}

export interface DatasetChangeSummary {
  readonly totalImported: number;
  readonly addedCount: number;
  readonly updatedCount: number;
  readonly deprecatedCount: number;
  readonly invalidCount: number;
  readonly errors: readonly string[];
  readonly dryRun: boolean;
}
