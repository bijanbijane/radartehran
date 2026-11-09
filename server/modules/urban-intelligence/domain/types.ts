import type { NormalizedTimestamp } from '../../core';
import type {
  BoundaryVerificationClassification,
  SourceDataAccessLevel,
  SourceDatasetProvenanceRef,
  SourceReliabilityClass,
  SourceVerificationState,
  UrbanGeographicEntityType,
} from '../contracts/externalAdapters';

export type IndicatorDomainCategory =
  | 'DEMOGRAPHIC_POPULATION'
  | 'ECONOMIC_SOCIOECONOMIC'
  | 'EDUCATION_ACCESS'
  | 'HEALTHCARE_ACCESS'
  | 'TRANSPORTATION_MOBILITY'
  | 'PUBLIC_AMENITIES'
  | 'ENVIRONMENTAL'
  | 'INFRASTRUCTURE_DEVELOPMENT'
  | 'HOUSING_MARKET';

export type MeasurementUnitCode =
  | 'PERSONS'
  | 'HOUSEHOLDS'
  | 'PERSONS_PER_SQ_KM'
  | 'HOUSEHOLDS_PER_SQ_KM'
  | 'PERSONS_PER_HOUSEHOLD'
  | 'PERCENTAGE'
  | 'COUNT'
  | 'FACILITIES_PER_SQ_KM'
  | 'FACILITIES_PER_10K_RESIDENTS'
  | 'KILOMETERS'
  | 'SQ_METERS_PER_RESIDENT'
  | 'AQI_INDEX'
  | 'UG_PER_M3'
  | 'DECIBELS_DB'
  | 'CELSIUS'
  | 'TOMAN_PER_SQM'
  | 'PRICE_TO_INCOME_RATIO'
  | 'INDEX_BASE_100'
  | 'SCORE_1_TO_10';

export type IndicatorAvailabilityState =
  | 'AVAILABLE'
  | 'UNAVAILABLE_MISSING_SOURCE'
  | 'SUPPRESSED_PRIVACY_THRESHOLD'
  | 'REJECTED_QUALITY_OR_EXTRAPOLATION';

export type DataQualityStatusCode =
  | 'VERIFIED_SOURCE'
  | 'IMPORTED_NOT_INDEPENDENTLY_VERIFIED'
  | 'ESTIMATED'
  | 'INCOMPLETE'
  | 'STALE'
  | 'CONFLICTING'
  | 'INSUFFICIENT_DATA'
  | 'REJECTED';

export interface IndicatorValueEnvelope<T = number> {
  indicatorId: string;
  availability: IndicatorAvailabilityState;
  /** Strictly null when unavailable or privacy-suppressed; missing data is NEVER represented as 0 */
  value: T | null;
  unit: MeasurementUnitCode;
  dataNature: 'RAW_SOURCE_VALUE' | 'DERIVED_ANALYTICAL_VALUE';
  evidenceClass:
    | 'CENSUS_OBSERVED'
    | 'STATISTICAL_ESTIMATE'
    | 'DIRECT_MEASUREMENT'
    | 'MODELED_INDICATOR'
    | 'ASKING_PRICE_METRIC'
    | 'CONFIRMED_TRANSACTION_METRIC'
    | 'VALUATION_MODEL_REFERENCE'
    | 'VERIFIED_CROWD_OBSERVATION'
    | 'INFRASTRUCTURE_REFERENCE';
  methodologyVersion: string;
  qualityStatus: DataQualityStatusCode;
  isStale: boolean;
  suppressionOrUnavailableReason?: string;
  provenanceRefs: string[];
}

export interface DataQualityAssessment {
  overallStatus: DataQualityStatusCode;
  completenessRatio: number; // 0..1 across expected domain sections
  availableSectionCount: number;
  totalSectionCount: number;
  temporalFreshness: {
    evaluatedAtIso: string;
    oldestObservationTimestampIso: string | null;
    newestObservationTimestampIso: string | null;
    hasStaleIndicators: boolean;
    staleIndicatorIds: string[];
  };
  sourceReliabilitySummary: SourceReliabilityClass[];
  sourceVerificationStates: SourceVerificationState[];
  geographicCoverageStatus: BoundaryVerificationClassification;
  internalConsistencyValid: boolean;
  unitCompatibilityValid: boolean;
  methodologyValid: boolean;
  outlierAndAnomalyFlags: string[];
  knownLimitations: string[];
}

export interface DemographicIndicatorSection {
  sectionAvailable: boolean;
  dataBasis: 'CENSUS_ENUMERATION' | 'INTERCENSAL_STATISTICAL_ESTIMATE' | 'UNAVAILABLE';
  privacyAggregationThresholdApplied: boolean;
  minimumPopulationThreshold: number;
  totalPopulation: IndicatorValueEnvelope<number>;
  populationDensityPerSqKm: IndicatorValueEnvelope<number>;
  householdCount: IndicatorValueEnvelope<number>;
  averageHouseholdSize: IndicatorValueEnvelope<number>;
  residentialDensityHouseholdsPerSqKm: IndicatorValueEnvelope<number>;
  populationChangePct: IndicatorValueEnvelope<number>;
  broadAgeDistributionPct: IndicatorValueEnvelope<{
    under15Pct: number;
    workingAge15To64Pct: number;
    senior65PlusPct: number;
  }>;
  privacyAndNonProfilingDisclaimer: string;
}

export interface EconomicIndicatorSection {
  sectionAvailable: boolean;
  currency: 'IRT' | 'TOMAN' | 'IRR';
  activeBusinessEnterprisesCount: IndicatorValueEnvelope<number>;
  businessActivityDensityPerSqKm: IndicatorValueEnvelope<number>;
  localServiceBusinessDensityPerSqKm: IndicatorValueEnvelope<number>;
  employmentRatePct: IndicatorValueEnvelope<number>;
  medianAnnualHouseholdIncome: IndicatorValueEnvelope<number>;
  costOfLivingIndexBase100: IndicatorValueEnvelope<number>;
  housingPriceToAnnualIncomeRatio: IndicatorValueEnvelope<number>;
  nonDiscriminatoryMethodologyDisclaimer: string;
}

export interface FacilityAccessIndicatorSection {
  domain: 'EDUCATION' | 'HEALTHCARE';
  sectionAvailable: boolean;
  recordedMappedFacilityCount: IndicatorValueEnvelope<number>;
  verifiedOperatingFacilityCount: IndicatorValueEnvelope<number>;
  verifiedTotalCapacity: IndicatorValueEnvelope<number>;
  operatingFacilityDensityPerSqKm: IndicatorValueEnvelope<number>;
  operatingFacilitiesPer10kResidents: IndicatorValueEnvelope<number>;
  nearestVerifiedFacilityDistanceKm: IndicatorValueEnvelope<number>;
  coverageGapDetected: boolean;
  categoryBreakdownCounts: Record<string, { mapped: number; verifiedOperating: number }>;
  calculationMethodNote: string;
  proximityVsServiceAvailabilityDisclaimer: string;
}

export interface TransportationMobilitySection {
  sectionAvailable: boolean;
  recordedTransitStopCount: IndicatorValueEnvelope<number>;
  verifiedOperatingTransitStopCount: IndicatorValueEnvelope<number>;
  transitStopDensityPerSqKm: IndicatorValueEnvelope<number>;
  metroStationCount: IndicatorValueEnvelope<number>;
  busStopCount: IndicatorValueEnvelope<number>;
  transportHubAccessDistanceKm: IndicatorValueEnvelope<number>;
  majorRoadConnectivityRef: IndicatorValueEnvelope<number>;
  realTimeAndRoutingDisclaimer: string;
}

export interface PublicAmenitiesSection {
  sectionAvailable: boolean;
  parksAndGreenSpacesCount: IndicatorValueEnvelope<number>;
  verifiedOperatingAmenitiesCount: IndicatorValueEnvelope<number>;
  greenSpaceSqMetersPerResident: IndicatorValueEnvelope<number>;
  categoryCounts: Record<string, { mappedCount: number; verifiedOperatingCount: number; verifiedCapacity: number | null }>;
  nonQualityEquivalenceDisclaimer: string;
}

export interface EnvironmentalIndicatorSection {
  sectionAvailable: boolean;
  measurementScope: 'MONITORING_STATION_POINT_READING' | 'DOCUMENTED_SPATIAL_INTERPOLATION_MODEL' | 'UNAVAILABLE';
  airQualityIndexAqi: IndicatorValueEnvelope<number>;
  pm25Concentration: IndicatorValueEnvelope<number>;
  daytimeNoiseExposureDb: IndicatorValueEnvelope<number>;
  greenSpaceCoveragePct: IndicatorValueEnvelope<number>;
  treeCanopyCoveragePct: IndicatorValueEnvelope<number>;
  surfaceTemperatureCelsius: IndicatorValueEnvelope<number>;
  floodRiskClassification: string | null;
  environmentalHealthAndExtrapolationDisclaimer: string;
}

export interface InfrastructureAndDevelopmentSection {
  sectionAvailable: boolean;
  networkPresenceReferences: {
    water: 'RECORDED_NETWORK_PRESENCE' | 'UNAVAILABLE_DATA';
    electricity: 'RECORDED_NETWORK_PRESENCE' | 'UNAVAILABLE_DATA';
    gas: 'RECORDED_NETWORK_PRESENCE' | 'UNAVAILABLE_DATA';
    telecomFiber: 'RECORDED_NETWORK_PRESENCE' | 'UNAVAILABLE_DATA';
    sewer: 'RECORDED_NETWORK_PRESENCE' | 'UNAVAILABLE_DATA';
  };
  developmentProjectsByStage: {
    proposedCount: number;
    approvedCount: number;
    completedCount: number;
    projects: Array<{
      projectId: string;
      titleFa: string;
      lifecycleStage: 'PROPOSED' | 'APPROVED' | 'COMPLETED';
      category: string;
      verifiedAuthorityRef: string;
    }>;
  };
  dominantLandUseClassification: string | null;
  utilityConnectionAndCapacityDisclaimer: string;
}

export interface HousingMarketIntelligenceSection {
  sectionAvailable: boolean;
  currency: 'IRT' | 'TOMAN' | 'IRR';
  activeSaleListingCount: IndicatorValueEnvelope<number>;
  activeRentalListingCount: IndicatorValueEnvelope<number>;
  saleAskingPricePerSqmMedian: IndicatorValueEnvelope<number>;
  monthlyRentAskingPerSqmMedian: IndicatorValueEnvelope<number>;
  confirmedSaleTransactionCount: IndicatorValueEnvelope<number>;
  confirmedSaleTransactionPricePerSqmMedian: IndicatorValueEnvelope<number>;
  authoritativeValuationReferencePerSqm: IndicatorValueEnvelope<number>;
  valuationTrendChangePct: IndicatorValueEnvelope<number>;
  authoritativeValuationModelVersion: string | null;
  marketCategorySeparationDisclaimer: string;
}

export interface UrbanIntelligenceProfileRecord {
  profileId: string;
  geographicEntityId: string;
  cityId: string;
  provinceId: string;
  districtId?: string;
  geographicEntityType: UrbanGeographicEntityType;
  nameFa: string;
  nameEn: string;
  profileVersion: number;
  boundaryVersion: string;
  crs: 'EPSG:4326';
  reportingPeriodKey: string;
  generatedAt: NormalizedTimestamp;
  methodologyVersion: string;
  sourceDatasetRevisionsHash: string;
  isPartialProfile: boolean;
  demographics: DemographicIndicatorSection;
  economics: EconomicIndicatorSection;
  educationAccess: FacilityAccessIndicatorSection;
  healthcareAccess: FacilityAccessIndicatorSection;
  transportation: TransportationMobilitySection;
  publicAmenities: PublicAmenitiesSection;
  environmental: EnvironmentalIndicatorSection;
  infrastructure: InfrastructureAndDevelopmentSection;
  housingMarket: HousingMarketIntelligenceSection;
  crowdObservationsSummary?: {
    verifiedObservationCount: number;
    perceivedQuietnessMedianScore1To10: IndicatorValueEnvelope<number>;
    perceivedParkingEaseMedianScore1To10: IndicatorValueEnvelope<number>;
  };
  dataQuality: DataQualityAssessment;
  sourceProvenanceRefs: Array<
    Omit<SourceDatasetProvenanceRef, 'confidentialSourceNotes'> & {
      confidentialSourceNotes?: string;
    }
  >;
  knownLimitations: string[];
}

export interface IndicatorDefinitionRecord {
  indicatorId: string;
  name: string;
  description: string;
  category: IndicatorDomainCategory;
  measurementUnit: MeasurementUnitCode;
  calculationMethod: string;
  formulaDocumentation: string;
  requiredInputs: string[];
  sourceContractReferences: string[];
  geographicScope: UrbanGeographicEntityType[];
  reportingFrequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'PERIODIC_CENSUS';
  aggregationMethod: 'SUM' | 'DENSITY_RATIO' | 'MEAN' | 'MEDIAN' | 'HAVERSINE_NEAREST_DISTANCE' | 'DIRECT_PASS_THROUGH';
  minimumDataRequirements: string;
  minimumPopulationPrivacyThreshold?: number;
  missingDataBehavior: 'RETURN_UNAVAILABLE_NULL_NEVER_ZERO';
  knownLimitations: string[];
  methodologyVersion: string;
  effectiveDateIso: string;
  deprecated: boolean;
}

export interface HistoricalIndicatorSnapshotRecord {
  snapshotId: string;
  geographicEntityId: string;
  cityId: string;
  indicatorId: string;
  value: number | null;
  availability: IndicatorAvailabilityState;
  unit: MeasurementUnitCode;
  reportingPeriodKey: string;
  observationTimestampIso: string;
  sourceTimestampIso: string;
  calculationTimestampIso: string;
  methodologyVersion: string;
  boundaryVersion: string;
  datasetRevision: string;
  revisionNumber: number;
  supersedesSnapshotId?: string;
  dataQualityStatus: DataQualityStatusCode;
  provenanceRefs: string[];
  createdAt: NormalizedTimestamp;
}

export type CalculationJobState =
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED';

export interface ProfileCalculationJobRecord {
  jobId: string;
  geographicEntityId: string;
  reportingPeriodKey: string;
  methodologyVersion: string;
  boundaryVersion: string;
  inputSnapshotHash: string;
  status: CalculationJobState;
  producedProfileId?: string;
  failureReason?: string;
  requestedByUid: string;
  attemptCount: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type { SourceDataAccessLevel };
