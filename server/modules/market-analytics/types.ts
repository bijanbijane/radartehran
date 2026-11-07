/**
 * @file server/modules/market-analytics/types.ts
 * @description Canonical Type Contracts for the Radartehran Property Valuation & Market Analytics Backend (Employee 10).
 * Defines upstream integration contracts (Geography, Bargains, Crowd Claims), strict 5-way source categories,
 * versioned valuation outputs, outlier diagnostics, backtest validation, and neighborhood comparison/trend schemas.
 */

import type { SupportedCityId, ProvinceId } from '../geography';

export type MarketMode = 'sale' | 'rental';

/**
 * Mandatory 5-way distinction of valuation evidence sources.
 * An asking price is never treated as a completed transaction price.
 */
export type ObservationSourceCategory =
  | 'verified_transaction'
  | 'approved_property_listing'
  | 'public_asking_price'
  | 'user_submitted_observation'
  | 'model_derived_estimate';

export type RenovationGrade = 'luxury_renovated' | 'renovated' | 'standard' | 'needs_renovation';

/**
 * Approved Read-Only Contract from the Bargains Module.
 * Source of truth remains owned by the Bargains module.
 */
export interface ApprovedBargainListingContract {
  id: string;
  cityId: SupportedCityId;
  hoodId: number;
  dealMode: MarketMode;
  status: 'approved' | 'pending' | 'rejected' | 'expired';
  sqm: number | null;
  askingTotalMillion?: number | null;
  depositMillion?: number | null;
  monthlyRentMillion?: number | null;
  buildYear?: number | null;
  buildingAgeYears?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  hasParking?: boolean | null;
  hasElevator?: boolean | null;
  hasStorage?: boolean | null;
  renovationGrade?: RenovationGrade | null;
  observedAtIso: string;
}

/**
 * Approved Read-Only Contract from Crowd Claims and Market Observations Module.
 * Source of truth remains owned by the Crowd Claims module.
 */
export interface CrowdMarketObservationContract {
  claimId: string;
  cityId: SupportedCityId;
  hoodId: number;
  marketMode: MarketMode;
  claimType: 'completed_deal_report' | 'asking_quote_observation' | 'rent_quote_observation';
  verificationState: 'verified_by_document' | 'community_corroborated' | 'unverified_claim' | 'rejected';
  sqm: number | null;
  reportedTotalMillion?: number | null;
  reportedDepositMillion?: number | null;
  reportedMonthlyRentMillion?: number | null;
  buildYear?: number | null;
  buildingAgeYears?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  hasParking?: boolean | null;
  hasElevator?: boolean | null;
  hasStorage?: boolean | null;
  renovationGrade?: RenovationGrade | null;
  observedAtIso: string;
  reporterTrustWeight?: number | null;
}

/**
 * Canonical Normalized Observation Input for the Analytics Engine.
 * Never substitutes 0 for missing fields; missing values are explicitly null.
 */
export interface MarketObservationRecord {
  observationId: string;
  cityId: SupportedCityId;
  hoodId: number;
  marketMode: MarketMode;
  sourceCategory: ObservationSourceCategory;
  observedAtIso: string;
  sqm: number | null;
  totalPriceMillion: number | null;
  depositMillion: number | null;
  monthlyRentMillion: number | null;
  buildYear: number | null;
  buildingAgeYears: number | null;
  floor: number | null;
  totalFloors: number | null;
  hasParking: boolean | null;
  hasElevator: boolean | null;
  hasStorage: boolean | null;
  renovationGrade: RenovationGrade | null;
  reliabilityWeight?: number | null;
}

/**
 * Subject Property Attributes for Property-Specific Valuation & Comparable Selection.
 */
export interface SubjectPropertySpecs {
  propertyId?: string;
  cityId: SupportedCityId;
  hoodId: number;
  marketMode: MarketMode;
  sqm: number | null;
  buildYear?: number | null;
  buildingAgeYears?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  hasParking?: boolean | null;
  hasElevator?: boolean | null;
  hasStorage?: boolean | null;
  renovationGrade?: RenovationGrade | null;
  candidateAskingTotalMillion?: number | null;
  candidateDepositMillion?: number | null;
  candidateMonthlyRentMillion?: number | null;
}

/**
 * Versioned Analytical Model Configuration.
 */
export interface ValuationModelVersionSpec {
  modelVersion: string;
  releasedAtIso: string;
  currentJalaliYear: number;
  monthlyRentToRahnRate: number;
  askingToTransactionAdjustment: Record<ObservationSourceCategory, number>;
  sourceCategoryBaseWeight: Record<ObservationSourceCategory, number>;
  temporalHalfLifeDays: number;
  maxObservationAgeDays: number;
  iqrOutlierMultiplier: number;
  minSampleSizeForRange: number;
  minSampleSizeForAuthoritativeCentral: number;
  maxCoefficientOfVariationForCentral: number;
}

export type ValidationRejectionReason =
  | 'INVALID_GEOGRAPHY_REFERENCE'
  | 'CROSS_MODE_CONTAMINATION'
  | 'MISSING_OR_NON_POSITIVE_PRICE'
  | 'INVALID_AREA_SQM'
  | 'INVALID_OR_FUTURE_TIMESTAMP'
  | 'STALE_OBSERVATION_EXCEEDED_MAX_AGE'
  | 'DUPLICATE_OBSERVATION_ID'
  | 'DUPLICATE_CONTENT_FINGERPRINT'
  | 'MODEL_DERIVED_EXCLUDED_FROM_PRIMARY_EVIDENCE';

export interface RejectedObservationEntry {
  observationId: string;
  reason: ValidationRejectionReason;
  detail: string;
}

export interface OutlierEntry {
  observationId: string;
  sourceCategory: ObservationSourceCategory;
  metricValue: number;
  direction: 'high_extreme' | 'low_extreme';
  fenceThreshold: number;
  explanation: string;
}

export interface OutlierDetectionResult {
  method: 'tukey_iqr_and_mad_guard';
  iqrMultiplier: number;
  q1: number | null;
  median: number | null;
  q3: number | null;
  iqr: number | null;
  lowerFence: number | null;
  upperFence: number | null;
  inlierIds: string[];
  outliers: OutlierEntry[];
}

export interface DataQualityReport {
  totalSubmittedCount: number;
  validDeduplicatedCount: number;
  inlierComparableCount: number;
  rejectedDuplicateCount: number;
  rejectedInvalidCount: number;
  outlierExcludedCount: number;
  missingAreaCount: number;
  missingAgeCount: number;
  missingAmenitiesCount: number;
  sampleSufficiency: 'insufficient' | 'limited' | 'adequate' | 'high';
  rejections: RejectedObservationEntry[];
}

export interface SourceProportionSummary {
  sourceCategory: ObservationSourceCategory;
  categoryLabelFa: string;
  isTransactionEvidence: boolean;
  observationCount: number;
  rawCountProportion: number;
  effectiveWeightProportion: number;
  appliedAskingToTransactionFactor: number;
  weightingExplanation: string;
}

export interface ConfidenceAssessment {
  score: number;
  level: 'insufficient_evidence' | 'low' | 'moderate' | 'high';
  verifiedTransactionShare: number;
  coefficientOfVariation: number | null;
  medianObservationAgeDays: number | null;
  rationale: string[];
}

export interface AnalyticalFactorExplanation {
  factorId:
    | 'source_composition'
    | 'asking_to_deal_spread'
    | 'hedonic_subject_adjustment'
    | 'temporal_recency_weighting'
    | 'outlier_trimming'
    | 'sample_size_gate';
  labelFa: string;
  direction: 'upward' | 'downward' | 'neutral' | 'guardrail';
  impactPercent: number | null;
  explanation: string;
}

export interface EvaluatedComparableItem {
  observationId: string;
  sourceCategory: ObservationSourceCategory;
  observedAtIso: string;
  ageDays: number;
  sqm: number | null;
  rawMetricMillion: number;
  transactionAdjustedMetricMillion: number;
  subjectQualityAdjustedMetricMillion: number;
  similarityScore: number;
  recencyWeight: number;
  sourceBaseWeight: number;
  combinedWeight: number;
}

/**
 * Canonical Versioned Valuation Output.
 * Never produces an authoritative central estimate when evidence is insufficient.
 */
export interface VersionedValuationOutput {
  resultId: string;
  reproducibilityHash: string;
  valuationTimestampIso: string;
  modelVersion: string;
  marketMode: MarketMode;
  reference: {
    targetType: 'property' | 'neighborhood';
    cityId: SupportedCityId;
    provinceId: ProvinceId;
    hoodId: number;
    compositeNeighborhoodId: string;
    neighborhoodNameFa: string;
    propertyId?: string;
    subjectSqm: number | null;
  };
  status: 'authoritative_estimate' | 'provisional_range_only' | 'insufficient_evidence';
  isAuthoritativeEstimateAllowed: boolean;
  estimatedRange: {
    minTotalMillion: number | null;
    maxTotalMillion: number | null;
    minPerSqmMillion: number | null;
    maxPerSqmMillion: number | null;
    minRahnEquivalentMillion?: number | null;
    maxRahnEquivalentMillion?: number | null;
  } | null;
  centralValue: {
    totalMillion: number | null;
    perSqmMillion: number | null;
    rahnEquivalentMillion?: number | null;
    estimatedMonthlyRentMillion?: number | null;
  } | null;
  comparableObservationsCount: { submittedTotal: number; validDeduplicated: number; inliersUsed: number };
  dataSources: SourceProportionSummary[];
  confidence: ConfidenceAssessment;
  limitations: string[];
  contributingFactors: AnalyticalFactorExplanation[];
  dataQuality: DataQualityReport;
  outlierReport: OutlierDetectionResult;
  selectedComparables: EvaluatedComparableItem[];
  candidateQuoteEvaluation?: {
    quotedMetricMillion: number;
    deviationPercent: number;
    classification: 'undervalued_bargain' | 'within_fair_range' | 'overpriced_asking';
    explanation: string;
  };
}

export interface SupplyDemandInputMetrics {
  periodStartIso: string;
  periodEndIso: string;
  activeSaleListingsCount: number | null;
  activeRentalListingsCount: number | null;
  newListingsInPeriodCount: number | null;
  verifiedDealsInPeriodCount: number | null;
  activeBuyerAlertsCount: number | null;
}

export interface SupplyDemandIndicatorOutput {
  status: 'sufficient_data' | 'insufficient_supply_demand_evidence';
  liquidityRegime: 'high_demand' | 'balanced' | 'oversupplied' | 'unknown';
  monthsOfInventory: number | null;
  absorptionRatePercent: number | null;
  buyerAlertToListingRatio: number | null;
  limitations: string[];
  explanation: string;
}

export interface HistoricalTrendPoint {
  periodKey: string;
  periodStartIso: string;
  periodEndIso: string;
  indicatorType: 'observed_indicator' | 'insufficient_period_sample';
  sampleCount: number;
  centralPerSqmMillion: number | null;
  centralRahn80mMillion: number | null;
  q1Metric: number | null;
  q3Metric: number | null;
  periodChangePercent: number | null;
}

export interface HistoricalBacktestValidationResult {
  isValidated: boolean;
  predictiveAccuracyClaimAllowed: boolean;
  evaluatedHoldoutDealsCount: number;
  meanAbsolutePercentageError: number | null;
  medianAbsolutePercentageError: number | null;
  rangeCoverageRate: number | null;
  validationSummaryFa: string;
}

export interface HistoricalTrendSeriesOutput {
  cityId: SupportedCityId;
  hoodId: number;
  compositeNeighborhoodId: string;
  marketMode: MarketMode;
  modelVersion: string;
  computedAtIso: string;
  reproducibilityHash: string;
  points: HistoricalTrendPoint[];
  inferredOverallDirection: {
    classification: 'inferred_trend' | 'insufficient_history';
    direction: 'upward' | 'downward' | 'flat' | 'indeterminate';
    cumulativeChangePercent: number | null;
    observedPeriodsWithData: number;
    totalPeriodsEvaluated: number;
    predictiveClaimDisclaimer: string;
  };
  historicalValidation?: HistoricalBacktestValidationResult;
}
