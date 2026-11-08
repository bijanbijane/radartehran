import type {
  AdminAuthorizationStoreAdapter,
  AuditLoggerAdapter,
  FirebaseIdTokenVerifier,
  RateLimiterAdapter,
  TelemetryAdapter,
  TransactionRunnerAdapter,
} from '../core';
import type { PropertyCategory, ValuationService, ValuationTransactionType } from '../valuation';

export type MarketGeographicLevel =
  | 'city'
  | 'district'
  | 'neighborhood'
  | 'sub_neighborhood'
  | 'street_micro';

export type TimeGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

export type DataAvailabilityStatus =
  | 'AVAILABLE'
  | 'LIMITED_SAMPLE'
  | 'INSUFFICIENT_SAMPLE'
  | 'SUPPRESSED_PRIVACY'
  | 'STALE_EVIDENCE'
  | 'NO_OBSERVATIONS';

export type AnomalyCategory = 'MARKET_ANOMALY' | 'DATA_QUALITY_ANOMALY' | 'METHODOLOGY_SHIFT';

export type AnomalyType =
  | 'SUDDEN_PRICE_SPIKE'
  | 'SUDDEN_PRICE_DROP'
  | 'UNUSUAL_LISTING_VOLUME_CHANGE'
  | 'ABNORMAL_TRANSACTION_VOLUME_CHANGE'
  | 'SUSPICIOUS_REPEATED_PRICES'
  | 'NEIGHBORHOOD_DIVERGENCE'
  | 'DATA_INGESTION_GAP';

export interface MarketEvidenceEventInput {
  id: string;
  sourceRecordId: string;
  sourceCategory:
    | 'VERIFIED_TRANSACTION'
    | 'VERIFIED_TENANCY'
    | 'PUBLISHED_LISTING'
    | 'VALUATION_EVIDENCE'
    | 'BROKERAGE_DEAL';
  cityId: string;
  districtId?: string;
  hoodId: number;
  hoodName?: string;
  subNeighborhoodId?: string;
  streetName?: string;
  boundaryVersion?: string;
  propertyCategory: PropertyCategory;
  commercialSubSegment?: 'retail' | 'office' | 'commercial_building' | 'industrial' | 'warehouse' | 'mixed_use' | 'development_land';
  transactionType: ValuationTransactionType;
  sqm: number;
  buildYear?: number;
  bedrooms?: number;
  floor?: number;
  renovationCondition?: 'luxury_renovated' | 'renovated' | 'standard' | 'needs_renovation';
  constructionQuality?: 'luxury' | 'grade_a' | 'standard' | 'economy';
  furnishedStatus?: 'furnished' | 'semi_furnished' | 'unfurnished';
  commercialFrontageMeters?: number;
  askingPriceMillion?: number;
  completedPriceMillion?: number;
  monthlyRentMillion?: number;
  depositMillion?: number;
  isReservationActive?: boolean;
  isRenewal?: boolean;
  priceReducedCount?: number;
  isWithdrawnOrExpired?: boolean;
  publishedAtIso?: string;
  completedAtIso?: string;
  observedAtIso: string;
  isOutlier?: boolean;
  privateParticipantId?: string;
}

export interface AnalyticalReliabilityMetadata {
  observationCount: number;
  verifiedObservationCount: number;
  askingObservationCount: number;
  sourceDiversityCount: number;
  freshnessDays: number;
  missingValueRatio: number;
  outlierExcludedCount: number;
  availabilityStatus: DataAvailabilityStatus;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
  methodologyVersion: string;
  aggregationVersion: number;
  configVersion: number;
}

export interface DataLineageMetadata {
  lineageId: string;
  sourceRecordIds: string[];
  sourceCategories: string[];
  geographicLevel: MarketGeographicLevel;
  cityId: string;
  districtId?: string;
  hoodId?: number;
  subNeighborhoodId?: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  periodStartIso: string;
  periodEndIso: string;
  calculationMethod: string;
  aggregationVersion: number;
  methodologyVersion: string;
  configVersion: number;
  calculatedAtIso: string;
  exclusionRulesApplied: string[];
}

export interface ValidatedMarketIndicators {
  id: string;
  geographicLevel: MarketGeographicLevel;
  cityId: string;
  districtId?: string;
  hoodId?: number;
  hoodName?: string;
  subNeighborhoodId?: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  periodStartIso: string;
  periodEndIso: string;
  // Price indicators (separated between asking and verified completed)
  medianAskingTotalMillion: number | null;
  medianVerifiedTransactionTotalMillion: number | null;
  weightedAveragePricePerSqmMillion: number | null;
  medianAskingPricePerSqmMillion: number | null;
  medianVerifiedPricePerSqmMillion: number | null;
  rentalPricePerSqmThousandToman: number | null;
  estimatedGrossRentalYieldPct: number | null;
  // Volume & inventory
  activeSaleListingInventory: number;
  activeRentalListingInventory: number;
  newListingVolume: number;
  completedSaleVolume: number;
  completedRentalVolume: number;
  // Dynamics & liquidity
  priceReductionFrequencyPct: number | null;
  listingWithdrawalFrequencyPct: number | null;
  averageListingAgeDays: number | null;
  medianListingAgeDays: number | null;
  medianDaysToCompletion: number | null;
  listingToTransactionConversionPct: number | null;
  inventoryTurnoverRatio: number | null;
  // Supply & Demand
  observedSupplyCount: number;
  observedCompletedDemandCount: number;
  activeReservationCount: number;
  modelDerivedAbsorptionRatePct: number | null;
  modelDerivedMonthsOfInventory: number | null;
  supplyDemandBalanceStatus: 'seller_market' | 'balanced' | 'buyer_market' | 'insufficient_evidence';
  marketActivityLevel: 'very_high' | 'high' | 'moderate' | 'low' | 'insufficient_evidence';
  reliability: AnalyticalReliabilityMetadata;
  lineage?: DataLineageMetadata;
}

export interface TemporalSeriesBucket {
  bucketKey: string;
  periodStartIso: string;
  periodEndIso: string;
  hasObservations: boolean;
  observationCount: number;
  verifiedCount: number;
  medianAskingPsmMillion: number | null;
  medianVerifiedPsmMillion: number | null;
  weightedPsmMillion: number | null;
  rollingMedianPsmMillion: number | null;
  rollingAveragePsmMillion: number | null;
  absolutePriceChangePsmMillion: number | null;
  percentagePriceChangePct: number | null;
  accelerationPctDelta: number | null;
  transactionVolume: number | null;
  transactionVolumeChangePct: number | null;
  activeInventoryCount: number | null;
  inventoryChangePct: number | null;
  medianRentPerSqmThousandToman: number | null;
  statusNote?: string;
}

export interface TemporalMarketSeriesResult {
  cityId: string;
  hoodId?: number;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  granularity: TimeGranularity;
  periodStartIso: string;
  periodEndIso: string;
  buckets: TemporalSeriesBucket[];
  historicalMinPsmMillion: number | null;
  historicalMaxPsmMillion: number | null;
  overallGrowthPct: number | null;
  methodologyVersion: string;
}

export interface MarketSegmentBucket {
  segmentDimension:
    | 'area_range'
    | 'building_age'
    | 'renovation_status'
    | 'bedrooms'
    | 'furnished_status'
    | 'commercial_sub_segment';
  segmentKey: string;
  labelFa: string;
  sampleCount: number;
  suppressedForPrivacyOrSampleSize: boolean;
  medianPricePerSqmMillion: number | null;
  medianRentPerSqmThousandToman: number | null;
  shareOfMarketPct: number | null;
  commercialFrontageMedianMeters?: number | null;
}

export interface NeighborhoodMarketProfile {
  cityId: string;
  districtId?: string;
  hoodId: number;
  hoodName: string;
  boundaryReference: string;
  saleIndicators: ValidatedMarketIndicators;
  rentalIndicators: ValidatedMarketIndicators;
  categoryBreakdown: Array<{
    propertyCategory: PropertyCategory;
    observationCount: number;
    medianPsmMillion: number | null;
  }>;
  segments: MarketSegmentBucket[];
  recentTrendSummary: {
    priceChangePct: number | null;
    rentChangePct: number | null;
    direction: 'upward' | 'stable' | 'downward' | 'insufficient_data';
  };
  coverageLevel: 'comprehensive' | 'moderate' | 'sparse' | 'insufficient';
  lastUpdatedAtIso: string;
  methodologyVersion: string;
}

export interface GeographicComparisonEntry {
  cityId: string;
  hoodId: number;
  hoodName: string;
  eligibleForRanking: boolean;
  ineligibilityReason?: string;
  sampleCount: number;
  verifiedSampleCount: number;
  medianVerifiedPsmMillion: number | null;
  medianAskingPsmMillion: number | null;
  weightedPsmMillion: number | null;
  rentalYieldPct: number | null;
  marketActivityLevel: ValidatedMarketIndicators['marketActivityLevel'];
  rankByPricePerSqm?: number;
  normalizedPriceIndexToCityMedian?: number | null;
}

export interface MarketAnomalyRecord {
  id: string;
  category: AnomalyCategory;
  anomalyType: AnomalyType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  cityId: string;
  hoodId?: number;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  detectedAtIso: string;
  periodStartIso: string;
  periodEndIso: string;
  observedValue: number;
  baselineExpectedValue: number;
  deviationPct: number;
  descriptionFa: string;
  reviewStatus: 'PENDING_REVIEW' | 'APPROVED_PUBLIC' | 'DISMISSED_FALSE_POSITIVE' | 'INTERNAL_DATA_ISSUE';
  publiclyApproved: boolean;
  reviewedByUid?: string;
  reviewedAtIso?: string;
  reviewNotes?: string;
  methodologyVersion: string;
}

export interface ShortTermMarketForecast {
  cityId: string;
  hoodId: number;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  eligible: boolean;
  ineligibilityReason?: string;
  horizonMonths: number;
  inputObservationsCount: number;
  inputBucketsCount: number;
  currentBaselinePsmMillion: number | null;
  projections: Array<{
    monthOffset: number;
    targetMonthIso: string;
    pointForecastPsmMillion: number;
    lowBoundPsmMillion: number;
    highBoundPsmMillion: number;
    uncertaintyWidthPct: number;
  }>;
  modelVersion: string;
  disclaimerFa: string;
  generatedAtIso: string;
}

export interface MarketIntelligenceConfig {
  configVersion: number;
  methodologyVersion: string;
  minSampleThresholdPublic: number;
  minSampleThresholdRanking: number;
  minBucketsForForecast: number;
  anomalyPriceSpikeThresholdPct: number;
  anomalyVolumeSpikeThresholdPct: number;
  rahnToRentConversionRatePct: number;
  staleEvidenceThresholdDays: number;
  updatedByUid: string;
  updatedAtIso: string;
}

export interface AggregationJobRecord {
  id: string;
  idempotencyKey: string;
  jobType: 'INCREMENTAL_NEIGHBORHOOD' | 'SCHEDULED_ROLLUP' | 'HISTORICAL_BACKFILL' | 'RECALCULATION';
  cityId: string;
  hoodIds: number[];
  propertyCategory?: PropertyCategory;
  status: 'COMPLETED' | 'FAILED';
  processedSnapshotsCount: number;
  newAggregationVersion: number;
  requestedByUid: string;
  startedAtIso: string;
  completedAtIso: string;
  errorMessage?: string;
}

export interface MarketIntelligenceDependencies {
  valuationService?: ValuationService;
  txRunner?: TransactionRunnerAdapter;
  tokenVerifier?: FirebaseIdTokenVerifier;
  adminStore?: AdminAuthorizationStoreAdapter;
  auditLogger?: AuditLoggerAdapter;
  rateLimiter?: RateLimiterAdapter;
  telemetry?: TelemetryAdapter;
  primaryAdminEmails?: string[];
  now?: () => Date;
}
