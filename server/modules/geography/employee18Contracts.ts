/**
 * Employee 18 — Geography & Spatial Intelligence Backend Contracts
 * (`server/modules/geography/employee18Contracts.ts`)
 *
 * Exclusive ownership: `server/modules/geography/`
 */

import type { GeoBoundingBox, GeoPoint } from './types';

// ============================================================================
// SECTION 3, 4, 5 & 6: CANONICAL GEOGRAPHIC HIERARCHY & IDENTIFIERS
// ============================================================================

export type CanonicalEntityType =
  | 'country'
  | 'province'
  | 'county'
  | 'city'
  | 'municipal_district'
  | 'urban_zone'
  | 'neighborhood'
  | 'sub_neighborhood'
  | 'village'
  | 'rural_district'
  | 'street_or_road'
  | 'point_of_interest'
  | 'custom_geographic_area';

export type EntityVerificationStatus =
  | 'verified_official'
  | 'reconciled_catalog'
  | 'provisional_review'
  | 'unverified';

export type EntityGeographicStatus =
  | 'active'
  | 'inactive'
  | 'merged'
  | 'split'
  | 'deprecated';

export interface CanonicalGeographicEntityV2 {
  readonly id: string;
  readonly entityType: CanonicalEntityType;
  readonly officialNameFa?: string;
  readonly displayNameFa: string;
  readonly nameEn?: string;
  readonly alternativeNames: readonly string[];
  readonly parentId?: string;
  readonly administrativeCode?: string;
  readonly sourceReference: string;
  readonly verificationStatus: EntityVerificationStatus;
  readonly geographicStatus: EntityGeographicStatus;
  /** True if name is a real-estate marketing or colloquial label rather than an official division. */
  readonly isInformalOrMarketingName: boolean;
  readonly center?: GeoPoint;
  readonly activeBoundaryId?: string;
  readonly replacedByIds?: readonly string[];
  readonly splitIntoIds?: readonly string[];
  readonly splitMappingRule?: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly version: number;
}

export interface GeographicAliasRecord {
  readonly aliasId: string;
  readonly entityId: string;
  readonly cityScopeId?: string;
  readonly aliasText: string;
  readonly normalizedAlias: string;
  readonly aliasKind: 'official_historical' | 'spelling_variant' | 'colloquial' | 'marketing_label' | 'zwnj_variant';
  readonly isHistoricalRename: boolean;
  readonly createdAtIso: string;
}

// ============================================================================
// SECTION 7 & 8: GEOGRAPHIC BOUNDARIES & COORDINATE REFERENCE SYSTEMS (CRS)
// ============================================================================

export type SupportedCrsCode =
  | 'EPSG:4326'   // WGS84 [lng, lat] / [lat, lng]
  | 'EPSG:3857'   // Web Mercator [xMeters, yMeters]
  | 'EPSG:32639'  // WGS84 / UTM Zone 39N (Western & Central Iran including Tehran)
  | 'EPSG:32640'; // WGS84 / UTM Zone 40N (Eastern Iran including Mashhad)

export type GeoJsonGeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'Polygon'
  | 'MultiPolygon';

export type GeoJsonGeometry =
  | { readonly type: 'Point'; readonly coordinates: readonly [number, number] }
  | { readonly type: 'MultiPoint'; readonly coordinates: readonly (readonly [number, number])[] }
  | { readonly type: 'LineString'; readonly coordinates: readonly (readonly [number, number])[] }
  | { readonly type: 'Polygon'; readonly coordinates: readonly (readonly (readonly [number, number])[])[] }
  | { readonly type: 'MultiPolygon'; readonly coordinates: readonly (readonly (readonly (readonly [number, number])[])[])[] };

export type BoundaryClassification =
  | 'official'
  | 'estimated'
  | 'manually_reviewed'
  | 'unverified';

export interface BoundaryRecordV2 {
  readonly boundaryId: string;
  readonly entityId: string;
  readonly geometryType: GeoJsonGeometryType;
  readonly crs: SupportedCrsCode;
  readonly boundarySource: string;
  readonly sourceVersion: string;
  readonly verificationStatus: EntityVerificationStatus;
  readonly boundaryClassification: BoundaryClassification;
  readonly effectiveDateIso: string;
  readonly importedAtIso: string;
  readonly geometryVersion: number;
  readonly accuracyMeters?: number;
  readonly boundingBox: GeoBoundingBox;
  readonly areaSqMeters?: number;
  readonly geometry: GeoJsonGeometry;
}

export interface GeometryValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly boundingBox?: GeoBoundingBox;
  readonly computedAreaSqMeters?: number;
  readonly hasHoles: boolean;
  readonly hasSelfIntersection: boolean;
}

export interface CrsTransformationResult {
  readonly valid: boolean;
  readonly sourceCrs: SupportedCrsCode;
  readonly targetCrs: 'EPSG:4326';
  readonly originalCoordinates: readonly [number, number];
  readonly wgs84Point?: GeoPoint;
  readonly transformationMethod: string;
  readonly transformationVersion: string;
  readonly error?: string;
}

// ============================================================================
// SECTION 9, 10 & 13: SPATIAL QUERIES, PAGINATION & LOCATION RESOLUTION
// ============================================================================

export interface PaginatedGeoEnvelope<T> {
  readonly items: readonly T[];
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
  readonly nextOffset: number | null;
}

export interface LocationResolutionRequest {
  readonly canonicalId?: string;
  readonly administrativeCode?: string;
  readonly cityNameOrId?: string;
  readonly neighborhoodNameOrAlias?: string;
  readonly coordinates?: GeoPoint;
  readonly structuredAddress?: Partial<StructuredAddressReference>;
}

export interface LocationResolutionResponse {
  readonly resolved: boolean;
  readonly entity: CanonicalGeographicEntityV2 | null;
  readonly parentHierarchy: readonly CanonicalGeographicEntityV2[];
  readonly matchType:
    | 'canonical_id'
    | 'administrative_code'
    | 'exact_name'
    | 'alias_match'
    | 'polygon_containment'
    | 'approximate_radius'
    | 'structured_address'
    | 'unresolved';
  readonly confidence: number | null;
  readonly isAmbiguous: boolean;
  readonly ambiguityCandidates: readonly CanonicalGeographicEntityV2[];
  readonly disambiguationRequiredReason?: string;
  readonly sourceReference?: string;
  readonly verificationStatus?: EntityVerificationStatus;
}

// ============================================================================
// SECTION 11 & 20: STRUCTURED ADDRESS MODEL & LOCATION PRIVACY BOUNDARIES
// ============================================================================

export type AddressVisibilityPolicy =
  | 'PUBLIC_NEIGHBORHOOD_ONLY'
  | 'PUBLIC_STREET_LEVEL'
  | 'AUTHORIZED_PRECISE_LOCATION';

export interface StructuredAddressReference {
  readonly addressId: string;
  readonly countryCode: string;
  readonly provinceId?: string;
  readonly countyId?: string;
  readonly cityId: string;
  readonly districtId?: string;
  readonly neighborhoodId: string;
  readonly street?: string;
  readonly mainRoad?: string;
  readonly secondaryRoad?: string;
  readonly alley?: string;
  readonly buildingNumber?: string;
  readonly unitNumber?: string;
  readonly postalCode?: string;
  readonly preciseCoordinates?: GeoPoint;
  readonly publicApproxCenter?: GeoPoint;
  readonly addressSource: string;
  readonly verificationStatus: EntityVerificationStatus;
  readonly visibilityPolicy: AddressVisibilityPolicy;
  readonly ownerUid?: string;
}

export interface PublicSafeAddressView {
  readonly addressId: string;
  readonly countryCode: string;
  readonly provinceId?: string;
  readonly cityId: string;
  readonly districtId?: string;
  readonly neighborhoodId: string;
  readonly mainRoad?: string;
  readonly street?: string;
  readonly coordinatesExposed: boolean;
  readonly displayCoordinates: GeoPoint | null;
  readonly verificationStatus: EntityVerificationStatus;
}

// ============================================================================
// SECTION 12: POINTS OF INTEREST (POI)
// ============================================================================

export type PoiCategory =
  | 'school'
  | 'university'
  | 'hospital'
  | 'clinic'
  | 'pharmacy'
  | 'public_transport_station'
  | 'metro_station'
  | 'bus_terminal'
  | 'park'
  | 'shopping_center'
  | 'market'
  | 'government_office'
  | 'cultural_facility'
  | 'sports_facility'
  | 'public_service'
  | 'major_road'
  | 'other_verified_facility';

export type PoiOperationalStatus = 'verified_open' | 'verified_closed' | 'Temporarily_Closed' | 'unknown_unverified';

export interface PointOfInterestRecord {
  readonly poiId: string;
  readonly nameFa: string;
  readonly nameEn?: string;
  readonly category: PoiCategory;
  readonly coordinates: GeoPoint;
  readonly parentEntityId: string;
  readonly sourceReference: string;
  readonly verificationStatus: EntityVerificationStatus;
  /** Never claimed open unless explicitly verified by an authoritative source. */
  readonly operationalStatus: PoiOperationalStatus;
  readonly lastVerifiedAtIso?: string;
  readonly publicVisibility: 'public' | 'restricted';
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

// ============================================================================
// SECTION 16, 17, 18 & 19: VERSIONING, QUALITY, INTELLIGENCE & RELATIONSHIP GRAPH
// ============================================================================

export type GeographicChangeType =
  | 'ENTITY_CREATED'
  | 'ENTITY_RENAMED'
  | 'ALIAS_ADDED'
  | 'BOUNDARY_CORRECTED'
  | 'PARENT_REASSIGNED'
  | 'ENTITY_MERGED'
  | 'ENTITY_SPLIT'
  | 'ENTITY_DEACTIVATED';

export interface GeographicChangeHistoryEntry {
  readonly changeId: string;
  readonly entityId: string;
  readonly changeType: GeographicChangeType;
  readonly previousValue: Record<string, unknown> | null;
  readonly newValue: Record<string, unknown>;
  readonly sourceReference: string;
  readonly actorUid: string;
  readonly timestampIso: string;
  readonly approvalStatus: 'approved' | 'pending_approval' | 'rejected';
  readonly reason: string;
  readonly version: number;
}

export type GeographicRelationshipType =
  | 'PARENT_OF'
  | 'CHILD_OF'
  | 'LOCATED_WITHIN'
  | 'ADJACENT_TO'
  | 'INTERSECTS'
  | 'CONTAINS'
  | 'CONNECTED_TO'
  | 'ALIAS_OF'
  | 'REPLACED_BY'
  | 'MERGED_INTO'
  | 'SPLIT_INTO';

export interface GeographicRelationshipEdge {
  readonly relationshipId: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationshipType: GeographicRelationshipType;
  readonly sourceReference: string;
  readonly verificationStatus: EntityVerificationStatus;
  readonly effectiveTimestampIso: string;
  readonly version: number;
}

export interface GeographicQualityReport {
  readonly reportId: string;
  readonly generatedAtIso: string;
  readonly ruleVersion: string;
  readonly duplicateIdentifiers: readonly string[];
  readonly duplicateCanonicalNamesInScope: readonly { parentId: string; nameFa: string; entityIds: readonly string[] }[];
  readonly missingParentReferences: readonly { entityId: string; missingParentId: string }[];
  readonly invalidHierarchyLinks: readonly { childId: string; childType: CanonicalEntityType; parentId: string; parentType: CanonicalEntityType }[];
  readonly orphanEntities: readonly string[];
  readonly invalidCoordinatesEntities: readonly string[];
  readonly invalidGeometryBoundaries: readonly { boundaryId: string; errors: readonly string[] }[];
  readonly unexpectedSameTypeBoundaryOverlaps: readonly { entityA: string; entityB: string }[];
  readonly legitimateCrossTypeOverlapsCount: number;
  readonly unresolvedAliases: readonly string[];
  readonly unverifiedSourceEntityCount: number;
  readonly staleDatasetEntities: readonly string[];
}

export interface NeighborhoodSpatialAggregation {
  readonly neighborhoodEntityId: string;
  readonly administrativeDistrictIds: readonly string[];
  readonly areaSqMeters: number | null;
  readonly boundaryClassification: BoundaryClassification | 'missing';
  readonly nearbyPublicFacilitiesCountByCategory: Readonly<Record<string, number>>;
  readonly nearestMetroOrTransportDistanceMeters: number | null;
  readonly adjacentNeighborhoodIds: readonly string[];
  /** Explicitly excludes market prices, rental stats, and socioeconomic guesses. */
  readonly containsMarketValuationData: false;
}

// ============================================================================
// SECTION 15, 21, 22 & 23: IMPORT QUARANTINE, EVENTS & REPOSITORY CONTRACTS
// ============================================================================

export interface QuarantinedGeographicImportRecord {
  readonly quarantineId: string;
  readonly candidateEntityId: string;
  readonly sourceDatasetId: string;
  readonly datasetVersion: string;
  readonly reasonCode:
    | 'INVALID_GEOMETRY'
    | 'DUPLICATE_ENTITY'
    | 'PARENT_CHILD_CONFLICT'
    | 'AMBIGUOUS_ASSIGNMENT'
    | 'UNAPPROVED_CANONICAL_REPLACEMENT';
  readonly details: string;
  readonly rawCandidate: Record<string, unknown>;
  readonly status: 'pending_review' | 'approved' | 'rejected';
  readonly createdAtIso: string;
}

export type GeographyDomainEventType =
  | 'GeographicEntityCreated'
  | 'GeographicEntityUpdated'
  | 'GeographicAliasAdded'
  | 'GeographicBoundaryUpdated'
  | 'GeographicEntityMerged'
  | 'GeographicEntitySplit'
  | 'GeographicEntityDeactivated'
  | 'GeographicDatasetImported'
  | 'GeographicDatasetApproved'
  | 'GeographicResolutionFailed';

export interface GeographyDomainEvent {
  readonly eventId: string;
  readonly eventType: GeographyDomainEventType;
  readonly eventVersion: '1.0';
  readonly timestampIso: string;
  readonly entityId?: string;
  readonly datasetId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface GeographyEventPublisherAdapter {
  publishGeographyEvent: (event: GeographyDomainEvent) => Promise<void>;
}

export interface GeographyAdminActor {
  readonly uid: string;
  readonly isAdmin: boolean;
}
