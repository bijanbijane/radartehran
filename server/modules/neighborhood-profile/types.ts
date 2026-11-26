/**
 * NIPS — Neighborhood Intelligence Profile.
 * Backend domain contract only. It does not own raw source payloads,
 * canonical geography, listings, evidence blobs, or source permissions.
 */
export const NIPS_PROFILE_SCHEMA_VERSION = '1.0.0' as const;
export const NIPS_DOMAIN_IDS = ['identity','geography','demographics','socioeconomic','real_estate','building_stock','land_use','infrastructure','mobility','environment','safety','history','intelligence','evidence'] as const;
export type NipsDomainId = (typeof NIPS_DOMAIN_IDS)[number];
export type NipsPublicationState = 'DRAFT' | 'PROVISIONAL' | 'PUBLISHED' | 'REVOKED' | 'STALE';
export type NipsDomainState = 'READY' | 'PARTIAL' | 'STALE' | 'BLOCKED' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
export type NipsMetricState = 'OBSERVED' | 'ESTIMATED' | 'ALLOCATED' | 'SUPPRESSED' | 'MISSING' | 'UNAVAILABLE' | 'NOT_APPLICABLE' | 'UNDER_REVIEW' | 'STALE';
export type NipsGeographicLevel = 'COUNTRY' | 'PROVINCE' | 'CITY' | 'DISTRICT' | 'NEIGHBORHOOD' | 'SUB_NEIGHBORHOOD' | 'GRID' | 'POINT' | 'NETWORK_SEGMENT';
export type NipsTemporalKind = 'STATIC' | 'SNAPSHOT' | 'PERIOD' | 'EVENT' | 'CONTINUOUS';
/** JSON-safe value accepted by D1 JSON columns and deterministic snapshot hashing. */
export type NipsJsonValue = string | number | boolean | null | readonly NipsJsonValue[] | { readonly [key: string]: NipsJsonValue };
export type NipsMetricValue = NipsJsonValue;

export interface NipsIdentityReference {
  readonly canonicalEntityId: string;
  readonly registryRevision: number;
  readonly entityType: 'URBAN_NEIGHBORHOOD';
  readonly identityStatus: 'CONFIRMED_CANONICAL' | 'DISPUTED' | 'RETIRED' | 'UNVERIFIED';
  readonly officialName: string;
  readonly localizedNames: Readonly<Record<string, string>>;
  readonly verifiedAliases: readonly { readonly value: string; readonly language: string; readonly aliasType: 'OFFICIAL' | 'HISTORICAL' | 'TRANSLITERATION' | 'LOCAL'; readonly registryReference: string }[];
  readonly parentEntities: readonly { readonly canonicalEntityId: string; readonly level: 'COUNTRY' | 'PROVINCE' | 'CITY' | 'DISTRICT'; readonly name: string }[];
  readonly legacyCrosswalks: readonly { readonly system: string; readonly legacyId: string; readonly mappingStatus: 'VERIFIED' | 'AMBIGUOUS' | 'RETIRED'; readonly mappingReference: string }[];
}
export interface NipsEvidenceReference {
  readonly evidenceId: string; readonly sourceId: string; readonly sourceVersion: string | null;
  readonly evidenceHash: string; readonly evidenceReference: string;
  readonly permissionStatus: 'PUBLIC_REDISTRIBUTION' | 'DERIVED_ONLY' | 'RESTRICTED' | 'PROHIBITED' | 'UNVERIFIED';
  readonly verifiedAt: string | null;
}
export interface NipsMetricProvenance {
  readonly evidence: readonly NipsEvidenceReference[];
  readonly canonicalObservationIds: readonly string[];
  readonly sourceVariableMappingIds: readonly string[];
  readonly transformationIds: readonly string[];
}
export interface NipsMetricPeriod {
  readonly kind: NipsTemporalKind; readonly observedAt: string;
  readonly periodStart: string | null; readonly periodEnd: string | null; readonly asOf: string | null;
}
export interface NipsMetricGeography {
  readonly level: NipsGeographicLevel; readonly canonicalEntityId: string | null;
  readonly boundaryVersionId: string | null; readonly boundarySchemeId: string | null; readonly boundarySchemeVersion: string | null;
  readonly assignmentMethod: 'DIRECT' | 'SPATIAL_JOIN' | 'APPROVED_ALLOCATION' | 'NETWORK' | 'UNKNOWN';
  readonly precision: 'EXACT' | 'APPROXIMATE' | 'ALLOCATED' | 'UNKNOWN';
}
export interface NipsMetricQuality {
  readonly status: 'VERIFIED' | 'VALIDATED' | 'ESTIMATED' | 'LOW_CONFIDENCE' | 'UNDER_REVIEW' | 'REJECTED';
  readonly confidence: number | null; readonly sampleSize: number | null; readonly coverageRatio: number | null;
  readonly freshnessStatus: 'CURRENT' | 'AGING' | 'STALE' | 'UNKNOWN'; readonly limitations: readonly string[];
}
export interface NipsMetric<T extends NipsMetricValue = NipsMetricValue> {
  readonly metricId: string; readonly value: T; readonly state: NipsMetricState;
  readonly unit: string | null; readonly currency: string | null; readonly semanticRole: string;
  readonly period: NipsMetricPeriod; readonly geography: NipsMetricGeography;
  readonly methodologyId: string; readonly methodologyVersion: string;
  readonly provenance: NipsMetricProvenance; readonly quality: NipsMetricQuality;
  readonly comparabilityKey: string | null;
  readonly display: { readonly labelKey: string; readonly format: 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'AREA' | 'DISTANCE' | 'DURATION' | 'DATE' | 'TEXT' | 'BOOLEAN' | 'DISTRIBUTION'; readonly precision: number | null };
}
export interface NipsDomainEnvelope<T> {
  readonly domainId: NipsDomainId; readonly state: NipsDomainState; readonly updatedAt: string | null;
  readonly metrics: readonly NipsMetric[]; readonly data: T;
  readonly readiness: { readonly publishableMetricCount: number; readonly blockedMetricCount: number; readonly staleMetricCount: number; readonly unavailableMetricCount: number; readonly reasons: readonly string[] };
}
export interface NipsGeographyData {
  readonly center: { readonly latitude: number; readonly longitude: number } | null;
  readonly boundary: {
    readonly boundaryVersionId: string | null; readonly version: number | null;
    readonly status: 'ACTIVE' | 'PENDING_REVIEW' | 'REJECTED' | 'SUPERSEDED' | 'MISSING';
    readonly authority: 'OFFICIAL_PRIMARY' | 'OFFICIAL_DERIVED' | 'VERIFIED_SECONDARY' | 'REVIEWED_COMMUNITY' | 'UNKNOWN';
    readonly geometryReference: string | null; readonly geometryHash: string | null; readonly crs: 'EPSG:4326' | 'UNKNOWN';
    readonly reviewedIndependently: boolean; readonly reviewedAt: string | null;
    readonly areaSqKm: number | null; readonly areaMethod: 'GEODESIC_APPROXIMATION' | 'OFFICIAL_REGISTER' | 'UNAVAILABLE';
    readonly areaQuality: 'OFFICIAL_GEOMETRY_DERIVED_APPROXIMATION' | 'REVIEWED_GEOMETRY_DERIVED_APPROXIMATION' | 'OFFICIAL_REGISTERED' | 'UNAVAILABLE';
  };
  readonly neighboringEntityIds: readonly string[];
  readonly spatialCapabilities: { readonly pointLookup: boolean; readonly polygonAnalysis: boolean; readonly areaMetrics: boolean; readonly networkAnalysis: boolean };
}
export interface NipsDemographicsData {
  readonly population: { readonly total: NipsMetric<number>; readonly densityPerSqKm: NipsMetric<number> | null };
  readonly households: { readonly total: NipsMetric<number> | null; readonly averageSize: NipsMetric<number> | null };
  readonly distributions: Readonly<Record<'age' | 'sex' | 'education' | 'employment' | 'householdType' | 'migration', readonly NipsMetric[]>>;
  readonly projections: readonly NipsMetric[];
  readonly disclosure: { readonly suppressionApplied: boolean; readonly policyReference: string | null };
}
export interface NipsSocioeconomicData {
  readonly income: readonly NipsMetric[]; readonly employment: readonly NipsMetric[]; readonly occupations: readonly NipsMetric[];
  readonly economicActivity: readonly NipsMetric[]; readonly businessDensity: NipsMetric<number> | null;
  readonly deprivation: readonly NipsMetric[]; readonly householdEconomics: readonly NipsMetric[];
}
export type NipsPropertyUse = 'RESIDENTIAL' | 'COMMERCIAL' | 'OFFICE' | 'INDUSTRIAL' | 'AGRICULTURAL' | 'GARDEN' | 'GREEN' | 'MIXED' | 'PUBLIC_INSTITUTIONAL' | 'VACANT' | 'OTHER';
export type NipsMarketSegment = 'RESIDENTIAL' | 'COMMERCIAL' | 'OFFICE' | 'LAND' | 'INDUSTRIAL' | 'OTHER';
export type NipsMarketRole = 'ASKING_SALE' | 'ASKING_RENT' | 'RENT_DEPOSIT' | 'CONFIRMED_SALE' | 'CONFIRMED_RENT' | 'SUPPLY' | 'DEMAND' | 'LIQUIDITY';
export interface NipsMarketSeries {
  readonly segment: NipsMarketSegment; readonly role: NipsMarketRole; readonly metrics: readonly NipsMetric[];
  readonly sample: { readonly rawCount: number | null; readonly deduplicatedCount: number | null; readonly eligibleCount: number | null; readonly rejectedCount: number | null; readonly coverageDescription: string | null };
}
export interface NipsRealEstateData {
  readonly series: readonly NipsMarketSeries[]; readonly priceDistributions: readonly NipsMetric[];
  readonly rentalYield: readonly NipsMetric[]; readonly affordability: readonly NipsMetric[];
  readonly valuation: { readonly estimates: readonly NipsMetric[]; readonly modelId: string | null; readonly modelVersion: string | null; readonly validationReportId: string | null };
}
export interface NipsBuildingStockData {
  readonly buildingCounts: readonly NipsMetric[]; readonly unitCounts: readonly NipsMetric[];
  readonly ageDistribution: readonly NipsMetric[]; readonly floorDistribution: readonly NipsMetric[];
  readonly typologyDistribution: readonly NipsMetric[]; readonly structuralSystems: readonly NipsMetric[];
  readonly condition: readonly NipsMetric[]; readonly occupancy: readonly NipsMetric[];
  readonly vacancy: readonly NipsMetric[]; readonly renovation: readonly NipsMetric[];
}
export interface NipsLandUseData {
  readonly classificationSchemeId: string | null; readonly classificationSchemeVersion: string | null;
  readonly denominatorSqKm: NipsMetric<number> | null;
  readonly classes: readonly { readonly use: NipsPropertyUse; readonly areaSqKm: NipsMetric<number>; readonly sharePercent: NipsMetric<number> }[];
  readonly buildingCoverageRatio: NipsMetric<number> | null; readonly floorAreaRatio: NipsMetric<number> | null;
}
export interface NipsInfrastructureData {
  readonly facilities: readonly { readonly categoryId: string; readonly activeCount: NipsMetric<number> | null; readonly totalCount: NipsMetric<number> | null; readonly nearestDistanceMeters: NipsMetric<number> | null; readonly facilityRegistryRevision: string | null }[];
  readonly utilities: readonly NipsMetric[]; readonly digitalConnectivity: readonly NipsMetric[];
}
export interface NipsMobilityData {
  readonly networkCoverage: readonly NipsMetric[]; readonly publicTransport: readonly NipsMetric[];
  readonly traffic: readonly NipsMetric[]; readonly walkability: readonly NipsMetric[];
  readonly cycling: readonly NipsMetric[]; readonly travelTimes: readonly NipsMetric[]; readonly accessibility: readonly NipsMetric[];
}
export interface NipsEnvironmentData {
  readonly airQuality: readonly NipsMetric[]; readonly noise: readonly NipsMetric[]; readonly climate: readonly NipsMetric[];
  readonly greenCover: readonly NipsMetric[]; readonly water: readonly NipsMetric[]; readonly waste: readonly NipsMetric[];
  readonly environmentalRisks: readonly NipsMetric[];
}
export interface NipsSafetyData {
  readonly crime: readonly NipsMetric[]; readonly trafficIncidents: readonly NipsMetric[];
  readonly emergencyResponse: readonly NipsMetric[]; readonly fireRisk: readonly NipsMetric[];
  readonly naturalHazards: readonly NipsMetric[]; readonly infrastructureRisks: readonly NipsMetric[];
}
export interface NipsHistoryData {
  readonly events: readonly {
    readonly eventId: string; readonly eventType: 'BOUNDARY_CHANGE' | 'LAND_USE_CHANGE' | 'INFRASTRUCTURE_PROJECT' | 'DEMOGRAPHIC_CHANGE' | 'MARKET_CHANGE' | 'POLICY_CHANGE' | 'OTHER';
    readonly title: string; readonly description: string | null; readonly occurredAt: string | null;
    readonly periodStart: string | null; readonly periodEnd: string | null;
    readonly status: 'PROPOSED' | 'APPROVED' | 'UNDER_CONSTRUCTION' | 'COMPLETED' | 'CANCELLED' | 'UNKNOWN';
    readonly provenance: NipsMetricProvenance;
  }[];
  readonly timeSeriesMetricIds: readonly string[];
}
export interface NipsIntelligenceData {
  readonly indices: readonly NipsMetric[]; readonly rankings: readonly NipsMetric[];
  readonly forecasts: readonly NipsMetric[]; readonly riskAssessments: readonly NipsMetric[];
  readonly modelRegistryReferences: readonly string[];
}
export interface NipsEvidenceData {
  readonly sourceRegistryRevision: number; readonly evidenceRegistryRevision: string;
  readonly variableCatalogVersion: string; readonly methodologyCatalogVersion: string;
  readonly lineageGraphReference: string | null;
  readonly sourceCoverage: readonly { readonly sourceId: string; readonly domains: readonly NipsDomainId[]; readonly permissionStatus: 'PUBLIC_REDISTRIBUTION' | 'DERIVED_ONLY' | 'RESTRICTED' | 'PROHIBITED' | 'UNVERIFIED'; readonly lastVerifiedAt: string | null }[];
  readonly unresolvedConflicts: number;
}
export interface NipsProfileDomainMap {
  readonly identity: NipsDomainEnvelope<NipsIdentityReference>; readonly geography: NipsDomainEnvelope<NipsGeographyData>;
  readonly demographics: NipsDomainEnvelope<NipsDemographicsData>; readonly socioeconomic: NipsDomainEnvelope<NipsSocioeconomicData>;
  readonly real_estate: NipsDomainEnvelope<NipsRealEstateData>; readonly building_stock: NipsDomainEnvelope<NipsBuildingStockData>;
  readonly land_use: NipsDomainEnvelope<NipsLandUseData>; readonly infrastructure: NipsDomainEnvelope<NipsInfrastructureData>;
  readonly mobility: NipsDomainEnvelope<NipsMobilityData>; readonly environment: NipsDomainEnvelope<NipsEnvironmentData>;
  readonly safety: NipsDomainEnvelope<NipsSafetyData>; readonly history: NipsDomainEnvelope<NipsHistoryData>;
  readonly intelligence: NipsDomainEnvelope<NipsIntelligenceData>; readonly evidence: NipsDomainEnvelope<NipsEvidenceData>;
}
export interface NipsProfileMetadata {
  readonly profileId: string; readonly schemaVersion: typeof NIPS_PROFILE_SCHEMA_VERSION; readonly profileVersion: number;
  readonly publicationState: NipsPublicationState; readonly createdAt: string; readonly assembledAt: string;
  readonly publishedAt: string | null; readonly assemblyBuildId: string; readonly methodologyVersion: string;
  readonly publicationPolicyVersion: string; readonly sourceWatermarks: Readonly<Record<string, string>>; readonly contentHash: string | null;
}
export interface NipsProfileQuality {
  readonly domainCount: number; readonly readyDomainCount: number; readonly partialDomainCount: number;
  readonly blockedDomainCount: number; readonly staleDomainCount: number; readonly publishableMetricCount: number;
  readonly blockedMetricCount: number; readonly unavailableMetricCount: number; readonly overallReasons: readonly string[];
}
export interface NipsNeighborhoodProfile {
  readonly metadata: NipsProfileMetadata; readonly identity: NipsProfileDomainMap['identity'];
  readonly domains: Omit<NipsProfileDomainMap, 'identity'>; readonly quality: NipsProfileQuality;
}
/** Normalized, versioned observation. Raw payload remains in Evidence Store. */
export interface NipsCanonicalObservation {
  readonly observationId: string; readonly canonicalEntityId: string; readonly variableId: string;
  readonly value: NipsMetricValue; readonly state: NipsMetricState; readonly unit: string | null; readonly currency: string | null;
  readonly semanticRole: string; readonly observedAt: string; readonly periodStart: string | null; readonly periodEnd: string | null;
  readonly sourceGeographicLevel: NipsGeographicLevel; readonly targetGeographicLevel: NipsGeographicLevel;
  readonly boundaryVersionId: string | null; readonly assignmentMethod: NipsMetricGeography['assignmentMethod'];
  readonly evidenceIds: readonly string[]; readonly sourceVariableMappingId: string;
  readonly methodologyId: string; readonly methodologyVersion: string; readonly lifecycle: 'ACTIVE' | 'SUPERSEDED' | 'REJECTED';
}
/** Immutable evidence metadata; raw bytes/payload live in Evidence Store object storage. */
export interface NipsRawEvidenceManifest {
  readonly evidenceId: string; readonly sourceId: string; readonly sourceRecordKey: string | null;
  readonly receivedAt: string; readonly observedAt: string | null; readonly rawObjectReference: string;
  readonly sha256: string; readonly mediaType: string; readonly sourceVersion: string | null;
  readonly permissionStatus: NipsEvidenceReference['permissionStatus'];
  readonly lifecycle: 'RECEIVED' | 'VALIDATED' | 'REJECTED' | 'SUPERSEDED' | 'REMOVED';
}
