import type {
  AdminAuthorizationStoreAdapter,
  AuditLoggerAdapter,
  FirebaseIdTokenVerifier,
  RateLimiterAdapter,
  TelemetryAdapter,
  TransactionRunnerAdapter,
} from '../core';
import type { GeographyService } from '../geography';
import type { MarketIntelligenceService } from '../market-intelligence';
import type { PropertyCategory, ValuationService, ValuationTransactionType } from '../valuation';

export type CanonicalGeoLevel =
  | 'country'
  | 'province'
  | 'city'
  | 'district'
  | 'neighborhood'
  | 'sub_neighborhood'
  | 'street'
  | 'road_segment'
  | 'building'
  | 'property'
  | 'property_unit'
  | 'poi'
  | 'boundary';

export type PoiCategory =
  | 'school'
  | 'university'
  | 'hospital'
  | 'clinic'
  | 'pharmacy'
  | 'public_transport'
  | 'metro_station'
  | 'bus_terminal'
  | 'park'
  | 'shopping_center'
  | 'market'
  | 'government_facility'
  | 'public_service'
  | 'cultural_facility'
  | 'sports_facility'
  | 'road_hub';

export interface Wgs84Coordinate {
  lat: number;
  lng: number;
}

export interface NormalizedCoordinateResult {
  valid: boolean;
  coordinate?: Wgs84Coordinate;
  precisionDecimals?: number;
  sourceProvenance: string;
  transformationMethod: 'NONE_WGS84' | 'PRECISION_ROUNDED' | 'REJECTED';
  errorCode?: 'LAT_LNG_REVERSED' | 'OUT_OF_IRAN_BOUNDS' | 'IMPOSSIBLE_COORDINATE' | 'NON_FINITE';
  errorMessage?: string;
}

export type LinearRingCoords = Array<[number, number]>; // [lng, lat] GeoJSON convention

export interface PolygonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: LinearRingCoords[] | LinearRingCoords[][];
}

export interface BoundaryVersionRecord {
  id: string;
  entityId: string;
  cityId: string;
  districtId?: string;
  hoodId?: number;
  subNeighborhoodId?: string;
  level: 'city' | 'district' | 'neighborhood' | 'sub_neighborhood';
  nameFa: string;
  nameEn?: string;
  historicalNames?: string[];
  version: number;
  status: 'ACTIVE' | 'SUPERSEDED' | 'PENDING_REVIEW' | 'REJECTED';
  geometry: PolygonGeometry;
  /** Server-computed digest of the exact persisted GeoJSON geometry. Legacy records may omit it and fail profile eligibility. */
  geometrySha256?: string;
  /** GeoJSON coordinates are only profile-eligible when the stored CRS is explicit. */
  geometryCrs?: 'EPSG:4326' | 'UNKNOWN';
  simplifiedGeometry: PolygonGeometry;
  boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  sourceProvenance: string;
  createdByUid: string;
  createdAtIso: string;
  reviewedByUid?: string;
  reviewedAtIso?: string;
  previousVersionId?: string;
}

export interface PolygonValidationReport {
  valid: boolean;
  issues: Array<{
    code:
      | 'UNCLOSED_RING'
      | 'TOO_FEW_VERTICES'
      | 'SELF_INTERSECTION'
      | 'INVALID_COORDINATE'
      | 'DEGENERATE_ZERO_AREA';
    message: string;
  }>;
  boundingBox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export interface PointResolutionResult {
  resolved: boolean;
  status: 'RESOLVED_INSIDE' | 'RESOLVED_ON_EDGE' | 'AMBIGUOUS_OVERLAP' | 'OUTSIDE_KNOWN_BOUNDARIES';
  confidence: 'high' | 'medium' | 'none';
  cityId?: string;
  districtId?: string;
  hoodId?: number;
  hoodNameFa?: string;
  subNeighborhoodId?: string;
  boundaryVersionId?: string;
  boundaryVersion?: number;
  sourceProvenance?: string;
  candidateBoundaryIds: string[];
}

export interface PointOfInterestRecord {
  id: string;
  nameFa: string;
  nameEn?: string;
  category: PoiCategory;
  coordinates: Wgs84Coordinate;
  cityId: string;
  districtId?: string;
  hoodId?: number;
  sourceProvenance: string;
  verificationStatus: 'VERIFIED' | 'PENDING_REVIEW' | 'REJECTED';
  publicVisible: boolean;
  attributes: Record<string, string | number | boolean>;
  lastValidatedAtIso: string;
  dedupeKey: string;
}

export interface SpatialPublishableListing {
  id: string;
  propertyId: string;
  cityId: string;
  districtId?: string;
  hoodId: number;
  subNeighborhoodId?: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  sqm: number;
  priceMillion: number;
  monthlyRentMillion?: number;
  bedrooms?: number;
  buildYear?: number;
  hasElevator?: boolean;
  hasParking?: boolean;
  coordinates: Wgs84Coordinate;
  exactPrivateAddress?: string;
  publicationStatus: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  verificationStatus: 'VERIFIED' | 'PENDING' | 'REJECTED';
  available: boolean;
}

export interface SpatialSearchQuery {
  cityId: string;
  hoodIds?: number[];
  districtId?: string;
  center?: Wgs84Coordinate;
  radiusMeters?: number;
  boundingBox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  polygon?: PolygonGeometry;
  corridorLine?: Array<Wgs84Coordinate>;
  corridorBufferMeters?: number;
  propertyCategory?: PropertyCategory;
  transactionType?: ValuationTransactionType;
  minPriceMillion?: number;
  maxPriceMillion?: number;
  minSqm?: number;
  maxSqm?: number;
  minBedrooms?: number;
  hasParking?: boolean;
  zoomLevel?: number;
  page?: number;
  pageSize?: number;
}

export interface SpatialClusterItem {
  clusterId: string;
  center: Wgs84Coordinate;
  count: number;
  medianPriceMillion: number;
  sampleListingIds: string[];
}

export interface SpatialSearchResult {
  mode: 'INDIVIDUAL_LISTINGS' | 'CLUSTERED_VIEWPORT';
  totalMatched: number;
  page: number;
  pageSize: number;
  items: Array<Omit<SpatialPublishableListing, 'exactPrivateAddress'> & { distanceMeters?: number }>;
  clusters?: SpatialClusterItem[];
}

export interface LocationContextIndicators {
  coordinates: Wgs84Coordinate;
  cityId: string;
  hoodId?: number;
  distanceUnit: 'meters';
  distanceMethod: 'geodesic_straight_line_haversine';
  travelTimeClaimed: false;
  factualDistances: {
    nearestMetroMeters: number | null;
    nearestBusOrTransitMeters: number | null;
    nearestParkMeters: number | null;
    nearestSchoolMeters: number | null;
    nearestHospitalOrClinicMeters: number | null;
    nearestShoppingOrMarketMeters: number | null;
    nearestRoadHubMeters: number | null;
  };
  nearbyServiceDensityCount1km: number;
  derivedAccessibilityScores: {
    transitScore: number;
    greenSpaceScore: number;
    dailyServicesScore: number;
    overallAccessibilityIndex: number;
    scoringRuleVersion: string;
  };
}

export interface GeographicOverlayLayer {
  layerId: string;
  layerType:
    | 'NEIGHBORHOOD_BOUNDARIES'
    | 'DISTRICT_BOUNDARIES'
    | 'PUBLISHED_LISTINGS'
    | 'MARKET_PRICE_HEATMAP'
    | 'POINTS_OF_INTEREST'
    | 'TRANSIT_NETWORK'
    | 'INTERNAL_ADMIN_AUDIT_LAYER';
  dataSourceReference: string;
  cityId: string;
  version: number;
  updatedAtIso: string;
  visibilityPolicy: 'PUBLIC' | 'ADMIN_ONLY';
  accessPolicy: 'PUBLIC_READ' | 'PRIVILEGED_ADMIN';
  featuresCount: number;
  payload: unknown;
}

export interface ValuationLocationFeatureVector {
  coordinates: Wgs84Coordinate;
  cityId: string;
  districtId?: string;
  hoodId: number;
  subNeighborhoodId?: string;
  boundaryVersion: number;
  distanceToMetroMeters?: number;
  distanceToMainRoadMeters?: number;
  overallAccessibilityIndex: number;
  locationCategory: 'prime_transit_corridor' | 'high_amenity_urban' | 'standard_residential' | 'peripheral';
  featureVectorVersion: string;
  reproducibleHash: string;
}

export interface GeospatialImportBatchResult {
  batchId: string;
  idempotencyKey: string;
  dryRun: boolean;
  status: 'PREVIEW_READY' | 'COMMITTED' | 'PARTIAL_WITH_FAILURES';
  importedBoundariesCount: number;
  importedPoisCount: number;
  duplicateSkippedCount: number;
  conflictCount: number;
  failedRecords: Array<{ index: number; reason: string }>;
  sourceProvenance: string;
  processedAtIso: string;
}

export interface GeospatialObservabilityMetrics {
  spatialQueriesCount: number;
  totalQueryLatencyMs: number;
  pointResolutionFailuresCount: number;
  invalidGeometryEventsCount: number;
  importFailuresCount: number;
  cacheHitsCount: number;
  cacheMissesCount: number;
  geocodingErrorsCount: number;
}

export type ProfileBoundaryAuthority =
  | 'OFFICIAL_PRIMARY'
  | 'OFFICIAL_DERIVED'
  | 'VERIFIED_SECONDARY'
  | 'REVIEWED_COMMUNITY'
  | 'ALGORITHMIC'
  | 'UNKNOWN';

export type ProfileBoundaryVerificationStatus =
  | 'VERIFIED_OFFICIAL_PRIMARY'
  | 'VERIFIED_OFFICIAL_DERIVED'
  | 'VERIFIED_INTERNATIONAL_STANDARD'
  | 'VERIFIED_SECONDARY_GAZETTEER'
  | 'PROVISIONAL_UNVERIFIED'
  | 'DISPUTED'
  | 'REQUIRES_REVIEW'
  | 'NOT_VERIFIED';

export interface CanonicalNeighborhoodProfileIdentity {
  geographicEntityId: string;
  cityId: string;
  legacyNeighborhoodId: number;
  level: 'neighborhood' | 'district' | 'city';
  identityStatus: 'CONFIRMED_CANONICAL' | 'DISPUTED' | 'RETIRED' | 'UNVERIFIED';
  verificationStatus: ProfileBoundaryVerificationStatus;
}

export interface TrustedNeighborhoodBoundarySource {
  sourceProvenance: string;
  sourceReference: string;
  authority: ProfileBoundaryAuthority;
  crs: 'EPSG:4326' | 'UNKNOWN';
  verificationStatus: ProfileBoundaryVerificationStatus;
}

export interface NeighborhoodProfileBoundaryResolvers {
  /** Must read from the authoritative canonical geography registry, not from request payloads. */
  resolveIdentity(input: {
    cityId: string;
    legacyNeighborhoodId: number;
  }): Promise<CanonicalNeighborhoodProfileIdentity | null>;
  /** Must resolve source metadata from a trusted source registry, not from the boundary record itself. */
  resolveSource(sourceProvenance: string): Promise<TrustedNeighborhoodBoundarySource | null>;
}

export interface GeospatialModuleDependencies {
  geographyService?: GeographyService;
  valuationService?: ValuationService;
  marketIntelligenceService?: MarketIntelligenceService;
  txRunner?: TransactionRunnerAdapter;
  tokenVerifier?: FirebaseIdTokenVerifier;
  adminStore?: AdminAuthorizationStoreAdapter;
  auditLogger?: AuditLoggerAdapter;
  rateLimiter?: RateLimiterAdapter;
  telemetry?: TelemetryAdapter;
  neighborhoodProfileBoundaryResolvers?: NeighborhoodProfileBoundaryResolvers;
  primaryAdminEmails?: string[];
  now?: () => Date;
}
