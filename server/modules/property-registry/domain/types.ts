/**
 * @file server/modules/property-registry/domain/types.ts
 * @description Canonical domain types for the Physical Property Registry & Asset Identity Backend
 * (`server/modules/property-registry/`).
 */

export type PropertyEntityKind = 'PARCEL' | 'BUILDING' | 'UNIT' | 'OTHER_ASSET';

export type ParcelType =
  | 'URBAN_LAND_LOT'
  | 'SUBDIVIDED_PARCEL'
  | 'CONSOLIDATED_PARCEL'
  | 'AGRICULTURAL_OR_PERIPHERAL_LOT'
  | 'UNCLASSIFIED_PARCEL';

export type BuildingCategory =
  | 'RESIDENTIAL_TOWER'
  | 'RESIDENTIAL_APARTMENT_BLOCK'
  | 'SINGLE_FAMILY_VILLA'
  | 'COMMERCIAL_COMPLEX'
  | 'OFFICE_BUILDING'
  | 'MIXED_USE_BUILDING'
  | 'INDUSTRIAL_FACILITY';

export type UnitCategory =
  | 'RESIDENTIAL_APARTMENT'
  | 'COMMERCIAL_UNIT'
  | 'OFFICE_UNIT'
  | 'SHOP'
  | 'INDUSTRIAL_PREMISES'
  | 'PARKING_SPACE'
  | 'STORAGE_UNIT';

export type OtherPropertyEntitySubType =
  | 'DEVELOPMENT_SITE'
  | 'INDEPENDENT_COMMERCIAL_PREMISES'
  | 'MIXED_USE_COMPLEX'
  | 'SHARED_BUILDING_FACILITY'
  | 'PARKING_ASSET'
  | 'STORAGE_ASSET';

export type PropertyRegistrationStatus =
  | 'ACTIVE_CANONICAL'
  | 'PROVISIONAL_INCOMPLETE'
  | 'MERGED_REDIRECT'
  | 'SPLIT_RETIRED'
  | 'DEMOLISHED_ARCHIVED'
  | 'REPLACED_ARCHIVED'
  | 'DISPUTED_CONFLICT';

export type IdentityConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'PROVISIONAL';

export type SourceReliabilityLevel =
  | 'AUTHORITATIVE_OFFICIAL'
  | 'VERIFIED_PARTNER'
  | 'PLATFORM_INTERNAL'
  | 'USER_SUBMITTED'
  | 'UNVERIFIED_EXTERNAL';

export type EntityVerificationStatus =
  | 'OFFICIAL_VERIFIED'
  | 'MULTI_SOURCE_CORROBORATED'
  | 'SINGLE_SOURCE_REPORTED'
  | 'UNVERIFIED'
  | 'CONFLICTING';

export type CompletenessTier = 'COMPLETE' | 'SUBSTANTIAL' | 'PARTIAL' | 'MINIMAL';

export type DataFreshnessTier = 'CURRENT' | 'RECENT' | 'AGING' | 'STALE';

export type IdentityConflictStatus =
  | 'NO_CONFLICT'
  | 'MINOR_ATTRIBUTE_DISCREPANCY'
  | 'DUPLICATE_CANDIDATE_PENDING'
  | 'CRITICAL_IDENTITY_CONFLICT';

/**
 * Section 10: 7 Distinct Identity Verification & Data Quality Dimensions.
 * Never collapsed into one opaque score.
 */
export interface IdentityQualityDimensions {
  identityConfidence: IdentityConfidenceLevel;
  sourceReliability: SourceReliabilityLevel;
  verificationStatus: EntityVerificationStatus;
  attributeCompleteness: CompletenessTier;
  relationshipCompleteness: CompletenessTier;
  dataFreshness: DataFreshnessTier;
  conflictStatus: IdentityConflictStatus;
}

export interface SourceProvenanceReference {
  sourceRecordId: string;
  sourceSystemNamespace: string;
  reliabilityTier: SourceReliabilityLevel;
  observedAtIso: string;
  recordedByUid: string;
  notes?: string;
}

export interface CanonicalGeographicReference {
  countryCode: 'IR';
  provinceId: string;
  cityId: string;
  municipalityName: string | null;
  districtNumber: number | null;
  neighborhoodCompositeId: string | null;
  coordinates: { lat: number; lng: number } | null;
  geometryPrecision: 'EXACT_PARCEL_CENTROID' | 'BUILDING_ENTRANCE' | 'APPROXIMATE_STREET' | 'NEIGHBORHOOD_ONLY';
  geographyValidatedAtIso: string;
}

export interface SourceOriginalAddressEntry {
  rawAddressText: string;
  sourceRecordId: string;
  sourceSystemNamespace: string;
  observedAtIso: string;
  postalCodeRaw: string | null;
}

export interface PropertyAddressReference {
  country: string;
  provinceId: string;
  cityId: string;
  municipality: string | null;
  districtNumber: number | null;
  neighborhoodCompositeId: string | null;
  neighborhoodNameFa: string | null;
  street: string;
  streetNumberOrPlate: string | null;
  buildingEntranceOrBlock: string | null;
  unitDesignation: string | null;
  postalCode: string | null;
  normalizedAddressText: string;
  publicRedactedAddressSummary: string;
  sourceOriginalAddresses: SourceOriginalAddressEntry[];
  lastNormalizedAtIso: string;
}

export interface BaseCanonicalPropertyEntity {
  canonicalId: string;
  entityKind: PropertyEntityKind;
  registrationStatus: PropertyRegistrationStatus;
  retiredOrRedirectedToIds: string[];
  geographicRef: CanonicalGeographicReference;
  addressRef: PropertyAddressReference;
  qualityDimensions: IdentityQualityDimensions;
  sourceReferences: SourceProvenanceReference[];
  recordVersion: number;
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Section 3.A: Land Parcels
 */
export interface CanonicalParcelEntity extends BaseCanonicalPropertyEntity {
  entityKind: 'PARCEL';
  parcelType: ParcelType;
  parcelAreaSqm: number | null;
  areaMeasurementUnit: 'SQM';
  areaMeasurementBasis: 'OFFICIAL_DEED' | 'SURVEYED' | 'REPORTED_APPROXIMATE' | 'UNKNOWN';
  officialParcelIdentifier: string | null;
  officialParcelIdentifierVerified: boolean;
  boundaryReferenceId: string | null;
}

/**
 * Section 3.B: Buildings
 */
export interface BuildingConstructionYearSpec {
  exactYearSolarHijri: number | null;
  estimatedPeriodFromSolarHijri: number | null;
  estimatedPeriodToSolarHijri: number | null;
  isEstimated: boolean;
}

export interface BuildingFloorCountSpec {
  aboveGroundFloors: number | null;
  belowGroundFloors: number | null;
  isApproximate: boolean;
}

export interface CanonicalBuildingEntity extends BaseCanonicalPropertyEntity {
  entityKind: 'BUILDING';
  buildingCategory: BuildingCategory;
  associatedParcelIds: string[];
  footprintReferenceId: string | null;
  constructionYear: BuildingConstructionYearSpec;
  floorCount: BuildingFloorCountSpec;
  buildingUseClassification: 'RESIDENTIAL' | 'COMMERCIAL' | 'OFFICE' | 'MIXED_USE' | 'INDUSTRIAL' | 'PUBLIC_FACILITY';
  constructionStatus: 'COMPLETED_ACTIVE' | 'UNDER_CONSTRUCTION' | 'RENOVATION' | 'DEMOLISHED' | 'PLANNED';
}

/**
 * Section 3.C: Property Units and Premises
 */
export interface UnitAreaSpec {
  reportedAreaSqm: number | null;
  verifiedDeedAreaSqm: number | null;
  isApproximate: boolean;
}

export interface CanonicalUnitEntity extends BaseCanonicalPropertyEntity {
  entityKind: 'UNIT';
  parentBuildingId: string | null;
  associatedParcelId: string | null;
  unitDesignation: string;
  floorReference: string | null;
  unitCategory: UnitCategory;
  areaSpec: UnitAreaSpec;
  usageClassification: 'RESIDENTIAL' | 'COMMERCIAL' | 'ADMINISTRATIVE_OFFICE' | 'PARKING' | 'STORAGE' | 'INDUSTRIAL';
}

/**
 * Section 3.D: Other Property Entities
 */
export interface CanonicalOtherPropertyEntity extends BaseCanonicalPropertyEntity {
  entityKind: 'OTHER_ASSET';
  assetSubType: OtherPropertyEntitySubType;
  associatedParcelIds: string[];
  associatedBuildingId: string | null;
  reportedAreaSqm: number | null;
  descriptionSummary: string;
}

export type CanonicalPropertyEntity =
  | CanonicalParcelEntity
  | CanonicalBuildingEntity
  | CanonicalUnitEntity
  | CanonicalOtherPropertyEntity;

/**
 * Section 5: Parcel, Building, and Unit Relationships
 */
export type EntityRelationshipType =
  | 'PARCEL_CONTAINS_BUILDING'
  | 'BUILDING_CONTAINS_UNIT'
  | 'BUILDING_ASSOCIATED_WITH_PARCEL'
  | 'SHARED_FACILITY_BELONGS_TO_BUILDING'
  | 'ASSET_LOCATED_ON_PARCEL';

export interface EntityRelationshipRecord {
  relationshipId: string;
  sourceEntityId: string;
  sourceEntityKind: PropertyEntityKind;
  targetEntityId: string;
  targetEntityKind: PropertyEntityKind;
  relationshipType: EntityRelationshipType;
  status: 'ACTIVE' | 'REMOVED_HISTORICAL';
  validFromIso: string | null;
  validToIso: string | null;
  provenanceReferences: SourceProvenanceReference[];
  verificationStatus: EntityVerificationStatus;
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Section 6: External Identifiers and Source Records
 */
export type ExternalIdentifierType =
  | 'OFFICIAL_CADASTRAL_CODE'
  | 'MUNICIPAL_RENOVATION_CODE'
  | 'BUILDING_PERMIT_NUMBER'
  | 'POSTAL_TEN_DIGIT_CODE'
  | 'UTILITY_METER_PROPERTY_REF'
  | 'EXTERNAL_LISTING_PLATFORM_ID'
  | 'INTERNAL_BARGAIN_LISTING_ID'
  | 'LEGACY_MIGRATION_ID';

export interface ExternalIdentifierMappingRecord {
  mappingId: string;
  namespaceKey: string;
  identifierType: ExternalIdentifierType;
  identifierValue: string;
  issuingSourceNamespace: string;
  jurisdictionScope: string;
  canonicalEntityId: string;
  canonicalEntityKind: PropertyEntityKind;
  firstObservedAtIso: string;
  lastObservedAtIso: string;
  verificationStatus: EntityVerificationStatus;
  provenanceRef: SourceProvenanceReference;
  confidenceClassification: IdentityConfidenceLevel;
  status: 'ACTIVE' | 'SUPERSEDED_BY_MERGE' | 'REVOKED_INVALID';
}

/**
 * Section 8: Entity Resolution and Duplicate Detection
 */
export type MatchClassification =
  | 'CONFIRMED_SAME_ENTITY'
  | 'STRONG_CANDIDATE_REQUIRING_REVIEW'
  | 'POSSIBLE_MATCH_INSUFFICIENT_EVIDENCE'
  | 'CONFIRMED_DISTINCT_ENTITIES'
  | 'UNRESOLVED_IDENTITY_CONFLICT';

export interface DuplicateComparisonSignal {
  signalType:
    | 'OFFICIAL_IDENTIFIER_MATCH'
    | 'GEOGRAPHIC_PROXIMITY'
    | 'NORMALIZED_ADDRESS_SIMILARITY'
    | 'BUILDING_AND_UNIT_DESIGNATION'
    | 'SHARED_PARCEL_RELATIONSHIP'
    | 'AREA_CONSISTENCY'
    | 'CONFLICTING_UNIT_OR_FLOOR';
  matched: boolean;
  weightContribution: number;
  evidenceSummary: string;
}

export interface DuplicateCandidateMatchRecord {
  candidateId: string;
  entityKind: PropertyEntityKind;
  primaryEntityId: string;
  candidateEntityId: string;
  matchClassification: MatchClassification;
  evidenceScore: number;
  comparisonSignals: DuplicateComparisonSignal[];
  autoMergePermitted: false;
  reviewStatus:
    | 'PENDING_HUMAN_REVIEW'
    | 'APPROVED_FOR_MERGE'
    | 'REJECTED_CONFIRMED_DISTINCT'
    | 'CONFLICT_ESCALATED'
    | 'MERGED_COMPLETED';
  reviewedByUid: string | null;
  reviewedAtIso: string | null;
  reviewNotes: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Section 9: Merge, Split, and Identity Lineage
 */
export type IdentityLineageType =
  | 'MERGED_INTO'
  | 'SPLIT_FROM'
  | 'REPLACED_BY'
  | 'DEMOLISHED'
  | 'RECONFIGURED_FROM'
  | 'SUPERSEDES'
  | 'OTHER_APPROVED_RELATIONSHIP';

export interface IdentityLineageRecord {
  lineageId: string;
  lineageType: IdentityLineageType;
  previousEntityIds: string[];
  resultingEntityIds: string[];
  reason: string;
  supportingEvidenceRefs: string[];
  authorizedActorUid: string;
  authorizedActorRole: string;
  effectiveDateIso: string | null;
  recordedAtIso: string;
  reviewStatus: 'APPROVED_EXECUTED' | 'REVERSED_COMPENSATED';
  reversibleSnapshotRef: {
    previousEntityVersions: Record<string, number>;
    reassignedRelationshipIds: string[];
    reassignedIdentifierMappingIds: string[];
  };
}

/**
 * Section 10: Data Quality Findings
 */
export type DataQualityFindingType =
  | 'MISSING_CRITICAL_IDENTIFIERS'
  | 'INVALID_IDENTIFIER_FORMAT'
  | 'CONFLICTING_ADDRESSES'
  | 'INCONSISTENT_BUILDING_UNIT_RELATIONSHIP'
  | 'CONFLICTING_PROPERTY_AREAS'
  | 'DUPLICATE_CANDIDATE_RECORDS'
  | 'MISSING_GEOGRAPHIC_REFERENCE'
  | 'STALE_SOURCE_INFORMATION'
  | 'UNVERIFIED_EXTERNAL_IDENTIFIERS';

export interface DataQualityFindingRecord {
  findingId: string;
  canonicalEntityId: string;
  findingType: DataQualityFindingType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidenceDescription: string;
  conflictingValues?: { sourceA: unknown; sourceB: unknown };
  status: 'OPEN' | 'RESOLVED' | 'ACCEPTED_UNCERTAINTY';
  detectedAtIso: string;
  resolvedByUid: string | null;
  resolvedAtIso: string | null;
  resolutionNotes: string | null;
}

/**
 * Section 11: Historical Attributes and Change Tracking
 */
export interface AttributeChangeHistoryRecord {
  historyId: string;
  canonicalEntityId: string;
  attributeName: string;
  previousValue: unknown;
  newValue: unknown;
  sourceReference: SourceProvenanceReference;
  effectiveDateIso: string;
  recordedAtIso: string;
  actorUid: string;
  verificationStatus: EntityVerificationStatus;
  changeReason: string;
  entityVersionAfterChange: number;
}
