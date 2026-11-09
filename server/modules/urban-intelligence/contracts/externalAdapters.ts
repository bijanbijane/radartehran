import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../../core';

export type UrbanGeographicEntityType =
  | 'CITY'
  | 'PROVINCE'
  | 'DISTRICT'
  | 'NEIGHBORHOOD'
  | 'SMALL_STATISTICAL_AREA'
  | 'CUSTOM_ANALYTICAL_AREA';

export type BoundaryVerificationClassification =
  | 'VERIFIED_POLYGON_BOUNDARY'
  | 'APPROXIMATE_CENTROID_AND_BBOX'
  | 'MISSING_GEOMETRY';

export interface CanonicalUrbanGeographicEntity {
  /** Globally unambiguous composite ID, e.g., `tehran:hood:1` or `karaj:hood:1` */
  geographicEntityId: string;
  cityId: string;
  provinceId: string;
  districtId?: string;
  numericNeighborhoodId?: number;
  entityType: UrbanGeographicEntityType;
  nameFa: string;
  nameEn: string;
  boundaryVersion: string;
  crs: 'EPSG:4326';
  areaSqKm: number | null;
  centroid: { lat: number; lng: number } | null;
  boundaryVerification: BoundaryVerificationClassification;
  parentEntityId?: string;
}

export interface GeographicLookupInput {
  geographicEntityId?: string;
  cityId?: string;
  districtId?: string;
  numericNeighborhoodId?: number;
  nameFa?: string;
  boundaryVersion?: string;
}

export interface GeographicResolutionOutcome {
  resolved: boolean;
  ambiguous: boolean;
  errorCode?: 'NOT_FOUND' | 'AMBIGUOUS_REPEATED_NAME_ACROSS_CITIES' | 'UNSUPPORTED_BOUNDARY_VERSION';
  candidateEntityIds?: string[];
  entity?: CanonicalUrbanGeographicEntity;
}

/**
 * Adapter contract for the Geography module (Section 5).
 * Urban Intelligence never creates a competing geographic hierarchy or invents boundaries/coordinates.
 */
export interface UrbanGeographyReadAdapter {
  resolveGeographicEntity(input: GeographicLookupInput): Promise<GeographicResolutionOutcome>;
  listChildEntities(parentEntityId: string): Promise<CanonicalUrbanGeographicEntity[]>;
}

/**
 * Explicit Spatial Calculation Adapter (Section 17).
 * Declares actual repository spatial capabilities; never claims H3 indexing, polygon intersections, or turn-by-turn routing.
 */
export interface SpatialCalculationAdapter {
  readonly crs: 'EPSG:4326';
  readonly resolutionDescription: string;
  readonly capabilities: {
    centroidHaversineDistanceSupported: boolean;
    h3IndexingSupported: false;
    polygonIntersectionSupported: false;
    turnByTurnRoutingSupported: false;
    realTimeTransitSupported: false;
  };
  calculateHaversineDistanceKm(
    pointA: { lat: number; lng: number },
    pointB: { lat: number; lng: number },
  ): number;
}

export type SourceDataAccessLevel = 'PUBLIC_AGGREGATED' | 'RESTRICTED_CONFIDENTIAL_SOURCE';

export type SourceReliabilityClass =
  | 'OFFICIAL_STATISTICAL_AUTHORITY'
  | 'MUNICIPAL_OPEN_DATA'
  | 'IMPORTED_THIRD_PARTY_DATASET'
  | 'CALIBRATED_SENSOR_NETWORK'
  | 'MODELED_ESTIMATE_SOURCE'
  | 'VERIFIED_CROWD_AGGREGATE';

export type SourceVerificationState =
  | 'VERIFIED_SOURCE'
  | 'IMPORTED_NOT_INDEPENDENTLY_VERIFIED'
  | 'ESTIMATED_MODEL_OUTPUT'
  | 'CONFLICTING_SOURCES'
  | 'REJECTED_INVALID';

export interface SourceDatasetProvenanceRef {
  datasetId: string;
  datasetRevision: string;
  sourceAuthorityName: string;
  reliabilityClass: SourceReliabilityClass;
  verificationState: SourceVerificationState;
  accessLevel: SourceDataAccessLevel;
  reportingPeriodKey: string;
  observationTimestampIso: string;
  sourcePublishedTimestampIso: string;
  freshnessMaxAgeDays: number;
  licenseOrPolicyRef: string;
  confidentialSourceNotes?: string;
}

export interface RawDemographicSourceRecord {
  geographicEntityId: string;
  boundaryVersion: string;
  dataBasis: 'CENSUS_ENUMERATION' | 'INTERCENSAL_STATISTICAL_ESTIMATE';
  totalPopulation: number | null;
  previousPeriodPopulation: number | null;
  householdCount: number | null;
  ageDistributionBroadPercentages?: {
    under15Pct: number;
    workingAge15To64Pct: number;
    senior65PlusPct: number;
  };
  provenance: SourceDatasetProvenanceRef;
}

export interface RawEconomicSourceRecord {
  geographicEntityId: string;
  boundaryVersion: string;
  dataBasis: 'OBSERVED_STATISTIC' | 'MODELED_ECONOMIC_ESTIMATE';
  currency: 'IRT' | 'TOMAN' | 'IRR';
  activeBusinessEnterprisesCount: number | null;
  localServiceBusinessesCount: number | null;
  employmentRatePct: number | null;
  medianAnnualHouseholdIncomeAmount: number | null;
  costOfLivingIndexBase100: number | null;
  provenance: SourceDatasetProvenanceRef;
}

export type UrbanFacilityDomainCategory =
  | 'EDUCATION_SCHOOL'
  | 'EDUCATION_UNIVERSITY'
  | 'EDUCATION_VOCATIONAL'
  | 'HEALTHCARE_HOSPITAL'
  | 'HEALTHCARE_CLINIC'
  | 'HEALTHCARE_PHARMACY'
  | 'HEALTHCARE_EMERGENCY'
  | 'TRANSIT_METRO_STATION'
  | 'TRANSIT_BUS_STOP'
  | 'TRANSIT_HUB'
  | 'AMENITY_PARK_GREEN_SPACE'
  | 'AMENITY_SPORTS_FACILITY'
  | 'AMENITY_CULTURAL_LIBRARY'
  | 'AMENITY_COMMUNITY_RELIGIOUS'
  | 'AMENITY_RETAIL_MARKET'
  | 'AMENITY_PUBLIC_ADMINISTRATION'
  | 'AMENITY_PARKING';

export interface RawUrbanFacilityRecord {
  facilityId: string;
  geographicEntityId: string;
  category: UrbanFacilityDomainCategory;
  nameFa: string;
  operationalStatus: 'RECORDED_MAPPED_PRESENCE_ONLY' | 'VERIFIED_CURRENTLY_OPERATING' | 'TEMPORARILY_CLOSED';
  verifiedCapacityCount: number | null;
  coords: { lat: number; lng: number } | null;
  greenSpaceAreaSqMeters?: number | null;
  lastVerifiedAtIso: string;
  provenance: SourceDatasetProvenanceRef;
}

export interface RawEnvironmentalSourceRecord {
  geographicEntityId: string;
  boundaryVersion: string;
  measurementScope: 'MONITORING_STATION_POINT_READING' | 'DOCUMENTED_SPATIAL_INTERPOLATION_MODEL';
  spatialExtrapolationMethodologyRef?: string;
  airQualityIndexAqi: number | null;
  pm25MicrogramsPerCubicMeter: number | null;
  daytimeNoiseDecibelsDb: number | null;
  greenSpaceCoveragePct: number | null;
  treeCanopyCoveragePct: number | null;
  surfaceTemperatureCelsius: number | null;
  floodRiskClassification?: 'LOW_AUTHORITATIVE' | 'MODERATE_AUTHORITATIVE' | 'HIGH_AUTHORITATIVE';
  provenance: SourceDatasetProvenanceRef;
}

export interface RawInfrastructureAndDevelopmentRecord {
  geographicEntityId: string;
  boundaryVersion: string;
  networkPresenceRefs: {
    waterNetworkPresence: 'RECORDED_NETWORK_PRESENCE' | 'UNAVAILABLE_DATA';
    electricityNetworkPresence: 'RECORDED_NETWORK_PRESENCE' | 'UNAVAILABLE_DATA';
    gasNetworkPresence: 'RECORDED_NETWORK_PRESENCE' | 'UNAVAILABLE_DATA';
    telecomFiberPresence: 'RECORDED_NETWORK_PRESENCE' | 'UNAVAILABLE_DATA';
    sewerNetworkPresence: 'RECORDED_NETWORK_PRESENCE' | 'UNAVAILABLE_DATA';
    majorRoadConnectivityScoreRef: number | null;
  };
  developmentProjects: Array<{
    projectId: string;
    titleFa: string;
    lifecycleStage: 'PROPOSED' | 'APPROVED' | 'COMPLETED';
    category: 'TRANSIT_EXPANSION' | 'PUBLIC_UTILITY' | 'URBAN_RENEWAL' | 'GREEN_SPACE';
    verifiedAuthorityRef: string;
  }>;
  dominantLandUseClassification?: 'RESIDENTIAL' | 'MIXED_RESIDENTIAL_COMMERCIAL' | 'COMMERCIAL_OFFICE' | 'INDUSTRIAL_LOGISTICS';
  provenance: SourceDatasetProvenanceRef;
}

/**
 * Adapter contract for the Data Ingestion module (Section 20).
 */
export interface UrbanDataIngestionReadAdapter {
  getDemographicSourceRecord(
    geographicEntityId: string,
    reportingPeriodKey: string,
  ): Promise<RawDemographicSourceRecord | null>;
  getEconomicSourceRecord(
    geographicEntityId: string,
    reportingPeriodKey: string,
  ): Promise<RawEconomicSourceRecord | null>;
  listFacilitiesForArea(
    geographicEntityId: string,
  ): Promise<RawUrbanFacilityRecord[]>;
  getEnvironmentalSourceRecord(
    geographicEntityId: string,
    reportingPeriodKey: string,
  ): Promise<RawEnvironmentalSourceRecord | null>;
  getInfrastructureAndDevelopmentRecord(
    geographicEntityId: string,
    reportingPeriodKey: string,
  ): Promise<RawInfrastructureAndDevelopmentRecord | null>;
}

export interface VerifiedCrowdUrbanObservationSummary {
  geographicEntityId: string;
  reportingPeriodKey: string;
  verifiedObservationCount: number;
  epistemicClass: 'VERIFIED_MARKET_OBSERVATION';
  publicationPolicySatisfied: boolean;
  perceivedQuietnessMedianScore1To10: number | null;
  perceivedParkingEaseMedianScore1To10: number | null;
  provenance: SourceDatasetProvenanceRef;
}

/**
 * Adapter contract for the Crowd Data module (Section 20).
 * Consumes only observations satisfying Crowd Data's publication and verification policies.
 */
export interface UrbanCrowdObservationsReadAdapter {
  getVerifiedCrowdObservationSummary(
    geographicEntityId: string,
    reportingPeriodKey: string,
  ): Promise<VerifiedCrowdUrbanObservationSummary | null>;
}

export interface AuthoritativeHousingMarketSummary {
  geographicEntityId: string;
  reportingPeriodKey: string;
  currency: 'IRT' | 'TOMAN' | 'IRR';
  areaUnit: 'SQM';
  askingPriceMetrics: {
    activeSaleListingCount: number;
    activeRentalListingCount: number;
    saleAskingPricePerSqmMedian: number | null;
    saleAskingPricePerSqmP25: number | null;
    saleAskingPricePerSqmP75: number | null;
    monthlyRentAskingPerSqmMedian: number | null;
    sourceModule: 'PROPERTY_SEARCH_AND_BARGAINS';
  };
  confirmedTransactionMetrics: {
    confirmedSaleTransactionCount: number;
    confirmedSaleTransactionPricePerSqmMedian: number | null;
    sourceModule: 'PROPERTY_TRANSACTIONS_REGISTRY';
  };
  valuationTrendReferences: {
    authoritativeValuationModelVersion: string;
    referenceEstimatedValuePerSqm: number | null;
    periodOverPeriodChangePct: number | null;
    sourceModule: 'VALUATION_AND_MARKET_ANALYTICS';
  };
  provenance: SourceDatasetProvenanceRef;
}

/**
 * Adapter contract for Bargains, Property Search, and Valuation modules (Section 14).
 * Never creates a second valuation engine or conflates asking prices with confirmed transactions.
 */
export interface HousingMarketIndicatorsReadAdapter {
  getAuthoritativeHousingMarketSummary(
    geographicEntityId: string,
    reportingPeriodKey: string,
  ): Promise<AuthoritativeHousingMarketSummary | null>;
}

export interface UrbanIntelligenceModuleDependencies {
  txRunner: TransactionRunnerAdapter;
  adminStore?: DelegatedAdminStoreAdapter | null;
  tokenVerifier?: FirebaseTokenVerifierAdapter | null;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  nowFn?: () => number;
  geography: UrbanGeographyReadAdapter;
  spatial?: SpatialCalculationAdapter;
  dataIngestion?: UrbanDataIngestionReadAdapter;
  crowdData?: UrbanCrowdObservationsReadAdapter;
  housingMarket?: HousingMarketIndicatorsReadAdapter;
}

export type { NormalizedTimestamp };
