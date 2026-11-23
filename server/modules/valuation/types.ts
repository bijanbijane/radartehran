import type {
  AdminAuthorizationStoreAdapter,
  AuditLoggerAdapter,
  FirebaseIdTokenVerifier,
  IdempotencyStoreAdapter,
  RateLimiterAdapter,
  TelemetryAdapter,
  TransactionRunnerAdapter,
} from '../core';

export type PropertyCategory =
  | 'residential'
  | 'detached_house'
  | 'villa_garden'
  | 'commercial'
  | 'office'
  | 'industrial'
  | 'land'
  | 'land_development'
  | 'agricultural'
  | 'mixed_use'
  | 'entire_building';

export type LandZoningCategory = 'residential' | 'commercial' | 'mixed' | 'agricultural';

export interface RentalConversionAnalysis {
  originalDepositMillion: number;
  originalMonthlyRentMillion: number;
  currency: CurrencyUnit;
  conversionConvention: string;
  monthlyConversionRatePercent: number;
  equivalentFullRahnMillion: number;
  equivalentFullMonthlyRentMillion: number;
  calculationVersion: string;
  calculatedAtIso: string;
}

export interface ValuationFactorAdjustment {
  factorId: string;
  factorLabelFa: string;
  impactPercent: number;
  impactAmountMillion: number;
  descriptionFa: string;
}

export type ValuationTransactionType = 'sale' | 'rent';

export type ValuationPurpose =
  | 'estimated_market_value'
  | 'asking_price_range'
  | 'estimated_rental_value'
  | 'price_per_sqm'
  | 'comparable_market_estimate'
  | 'historical_valuation'
  | 'scenario_valuation'
  | 'professional_appraisal_reference';

export type RenovationCondition =
  | 'luxury_renovated'
  | 'renovated'
  | 'standard'
  | 'needs_renovation';

export type ValuationConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient_data';

export type ValuationMethodology =
  | 'hedonic_regression'
  | 'comparable_sales_blend'
  | 'land_residual'
  | 'neighborhood_baseline_fallback'
  | 'insufficient_evidence';

export type CurrencyUnit = 'IRT_MILLION' | 'IRT' | 'IRR';

export type MarketEvidenceSourceType =
  | 'VERIFIED_COMPLETED_TRANSACTION'
  | 'VERIFIED_RENTAL_CONTRACT'
  | 'ACTIVE_PUBLISHED_LISTING'
  | 'HISTORICAL_LISTING'
  | 'VERIFIED_PROFESSIONAL_SUBMISSION'
  | 'APPROVED_MANUAL_OBSERVATION';

export type EvidenceVerificationStatus =
  | 'VERIFIED'
  | 'PENDING_REVIEW'
  | 'FLAGGED_OUTLIER'
  | 'REJECTED'
  | 'RESTORED'
  | 'CORRECTED';

export interface PropertyValuationInput {
  cityId: string;
  hoodId: number;
  hoodName?: string;
  districtId?: string;
  subNeighborhoodId?: string;
  streetName?: string;
  propertyId?: string;
  listingId?: string;
  buildingId?: string;
  propertyCategory: PropertyCategory;
  transactionType?: ValuationTransactionType;
  purpose?: ValuationPurpose;
  sqm: number;
  usableAreaSqm?: number;
  landAreaSqm?: number;
  landZoning?: LandZoningCategory;
  isCornerPlot?: boolean;
  frontageMeters?: number;
  densityPermitPercent?: number;
  rentalDepositMillion?: number;
  buildYear?: number;
  floor?: number;
  totalFloors?: number;
  unitsPerFloor?: number;
  bedrooms?: number;
  bathrooms?: number;
  hasElevator?: boolean;
  elevatorCount?: number;
  hasParking?: boolean;
  parkingSpaces?: number;
  hasStorage?: boolean;
  storageAreaSqm?: number;
  balconyAreaSqm?: number;
  yardAreaSqm?: number;
  renovationCondition?: RenovationCondition;
  constructionQuality?: 'luxury' | 'grade_a' | 'standard' | 'economy';
  unitOrientation?: 'north' | 'south' | 'east' | 'west' | 'two_sided';
  viewQuality?: 'panoramic' | 'open' | 'courtyard' | 'obstructed';
  buildingAmenities?: string[];
  heatingCoolingSystem?: string;
  commercialFrontageMeters?: number;
  ceilingHeightMeters?: number;
  zoningCode?: string;
  floorAreaRatio?: number;
  occupancyStatus?: 'vacant' | 'owner_occupied' | 'tenant_occupied' | 'under_construction';
  deedType?: 'single_page' | 'old_deed' | 'endowment' | 'promissory' | 'unknown';
  utilitiesAvailable?: string[];
  coordinates?: { lat: number; lng: number };
  distanceToMetroMeters?: number;
  distanceToMainRoadMeters?: number;
  furnishedStatus?: 'furnished' | 'semi_furnished' | 'unfurnished';
  leaseDurationMonths?: number;
  requestedDepositMillion?: number;
  sellerAskingTotalMillion?: number;
  currencyUnit?: CurrencyUnit;
  valuationDateIso?: string;
  asOfHistoricalDateIso?: string;
  modelVersionOverride?: string;
}

export interface HedonicFactorAdjustment {
  factorId: string;
  labelFa: string;
  weightPct: number;
  impactPercent: number;
  impactMillionPerSqm: number;
  direction: 'positive' | 'negative' | 'neutral';
  capped?: boolean;
}

export interface ComparablePropertyCandidate {
  listingId: string;
  sourceType?: MarketEvidenceSourceType;
  evidenceType?: 'confirmed_transaction' | 'asking_listing';
  sqm: number;
  pricePerSqmMillion: number;
  totalPriceMillion: number;
  buildYear?: number;
  distanceMeters?: number;
  similarityScore: number;
  included: boolean;
  exclusionReason?: string;
  observedAtIso?: string;
  temporalAdjustmentPct?: number;
  adjustedPricePerSqmMillion?: number;
  isVerifiedTransaction?: boolean;
}

export interface PublicValuationExplanation {
  summaryExplanationFa: string;
  neighborhoodBaselinePricePerSqmMillion: number;
  geographicFallbackLevel: 'sub_neighborhood' | 'neighborhood' | 'district' | 'city';
  positiveDriversFa: string[];
  negativeDriversFa: string[];
  comparableSummary: {
    includedCount: number;
    verifiedTransactionCount: number;
    activeListingCount: number;
    medianComparablePricePerSqmMillion: number | null;
  };
  confidenceExplanationFa: string;
  missingImportantInputs: string[];
  uncertaintyReasonFa: string;
  modelVersion: string;
  configVersion: number;
}

export interface InternalValuationDiagnostics {
  rawHedonicMultiplier: number;
  cappedHedonicMultiplier: number;
  hedonicPricePerSqmMillion: number;
  comparableWeightedPricePerSqmMillion: number | null;
  blendWeights: { hedonicWeight: number; comparableWeight: number };
  temporalAdjustmentPct: number;
  outlierExcludedIds: string[];
  duplicateExcludedIds: string[];
  fallbackTriggered: boolean;
  reproducibleInputHash: string;
}

export interface PropertyValuationResult {
  id: string;
  cityId: string;
  hoodId: number;
  hoodName: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  purpose: ValuationPurpose;
  sqm: number;
  basePricePerSqmMillion: number;
  estimatedPricePerSqmMillion: number;
  estimatedTotalMillion: number;
  lowEstimateTotalMillion: number;
  highEstimateTotalMillion: number;
  askingPriceLowMillion?: number;
  askingPriceHighMillion?: number;
  fastSaleTotalMillion?: number;
  estimatedDepositMillion?: number;
  estimatedMonthlyRentMillion?: number;
  fullRahnEquivalentMillion?: number;
  rentalPricePerSqmThousandToman?: number;
  nominalTotalMillion?: number;
  inflationAdjustedTotalMillion?: number;
  temporalTrendPct?: number;
  adjustments: HedonicFactorAdjustment[];
  comparables: ComparablePropertyCandidate[];
  dataQuality: {
    evidenceCount: number;
    confirmedTransactionCount: number;
    askingPriceCount: number;
  };
  confidenceLevel: ValuationConfidenceLevel;
  confidenceScore: number;
  methodology: ValuationMethodology;
  summaryExplanationFa: string;
  sellerPriceDiffPct?: number;
  sellerPriceEvaluation?: 'fair' | 'overpriced' | 'underpriced_bargain';
  modelVersion: string;
  configVersion: number;
  missingImportantInputs: string[];
  explanation: PublicValuationExplanation;
  diagnostics?: InternalValuationDiagnostics;
  calculatedAtIso: string;
  valuationDateIso: string;
}

export interface MarketEvidenceRecord {
  id: string;
  sourceType: MarketEvidenceSourceType;
  sourceRecordId: string;
  cityId: string;
  districtId?: string;
  hoodId: number;
  subNeighborhoodId?: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  sqm: number;
  landAreaSqm?: number;
  buildYear?: number;
  floor?: number;
  bedrooms?: number;
  hasElevator?: boolean;
  hasParking?: boolean;
  hasStorage?: boolean;
  renovationCondition?: RenovationCondition;
  coordinates?: { lat: number; lng: number };
  rawCurrencyUnit: CurrencyUnit;
  rawTotalAmount: number;
  normalizedTotalMillion: number;
  normalizedPricePerSqmMillion: number;
  normalizedDepositMillion?: number;
  normalizedMonthlyRentMillion?: number;
  isAskingPrice: boolean;
  isCompletedTransaction: boolean;
  reliabilityWeight: number;
  verificationStatus: EvidenceVerificationStatus;
  outlierFlag: boolean;
  outlierReason?: string;
  duplicateOfEvidenceId?: string;
  dedupeSignature: string;
  privateParticipantRef?: string;
  confidentialNotes?: string;
  observedAtIso: string;
  ingestedAtIso: string;
  reviewedByUid?: string;
  reviewedAtIso?: string;
  reviewReason?: string;
  correctionHistory?: Array<{
    correctedByUid: string;
    correctedAtIso: string;
    reason: string;
    previousTotalMillion: number;
    newTotalMillion: number;
  }>;
}

export interface EvidenceReviewDecisionInput {
  evidenceId: string;
  action: 'APPROVE' | 'REJECT' | 'RESTORE' | 'CORRECT';
  reason: string;
  correctedTotalMillion?: number;
  correctedSqm?: number;
}

export interface NeighborhoodBaselineRecord {
  id: string;
  cityId: string;
  districtId?: string;
  hoodId: number;
  subNeighborhoodId?: string;
  hoodName: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  geographicLevel: 'sub_neighborhood' | 'neighborhood' | 'district' | 'city';
  medianVerifiedPricePerSqmMillion: number | null;
  medianAskingPricePerSqmMillion: number | null;
  weightedPricePerSqmMillion: number;
  p25PricePerSqmMillion: number;
  p75PricePerSqmMillion: number;
  medianRentPerSqmThousandToman?: number;
  verifiedSampleCount: number;
  askingSampleCount: number;
  totalEligibleCount: number;
  outlierExcludedCount: number;
  sampleSufficiency: 'sufficient' | 'limited' | 'insufficient';
  freshnessDays: number;
  computedAtIso: string;
  modelVersion: string;
}

export interface NeighborhoodMarketIntelligenceIndicators {
  cityId: string;
  hoodId: number;
  hoodName: string;
  zone: string;
  medianAskingPricePerSqmMillion: number;
  averageAskingPricePerSqmMillion: number;
  p25PricePerSqmMillion: number;
  p75PricePerSqmMillion: number;
  activeListingCount: number;
  confirmedTransactionCount?: number;
  medianConfirmedTransactionPricePerSqmMillion?: number | null;
  outlierExcludedCount: number;
  priceChange30dPct: number | null;
  marketHeatStatus: 'hot' | 'balanced' | 'cool' | 'INSUFFICIENT_DATA';
  sampleSufficiency: 'sufficient' | 'limited' | 'insufficient';
  freshnessTimestampIso: string;
}

export interface ValuationModelConfiguration {
  id: string;
  modelVersion: string;
  configVersion: number;
  status: 'ACTIVE' | 'SUPERSEDED' | 'ROLLED_BACK';
  categoryMultipliers: Record<PropertyCategory, number>;
  renovationWeightsPct: Record<RenovationCondition, number>;
  elevatorWeightPct: number;
  noElevatorHighFloorPenaltyPct: number;
  parkingWeightPct: number;
  storageWeightPct: number;
  deedSinglePageWeightPct: number;
  deedPromissoryPenaltyPct: number;
  maxSingleFactorContributionPct: number;
  maxTotalAdjustmentPct: number;
  outlierIqrMultiplier: number;
  minPricePerSqmMillion: number;
  maxPricePerSqmMillion: number;
  minComparableSampleCount: number;
  maxComparableDistanceMeters: number;
  maxComparableAgeDays: number;
  monthlyInflationTrendPct: number;
  rahnToRentMonthlyRatePct: number;
  furnishedRentalPremiumPct: number;
  shortTermLeasePremiumPct: number;
  longTermLeaseDiscountPct: number;
  createdByUid: string;
  createdAtIso: string;
  changeReason: string;
  previousConfigId?: string;
}

export interface ValuationSnapshotRecord {
  id: string;
  ownerUid?: string;
  input: PropertyValuationInput;
  result: PropertyValuationResult;
  reproducibleHash: string;
  modelVersion: string;
  configVersion: number;
  evidenceIdsUsed: string[];
  createdAtIso: string;
}

export interface RecalculationJobRecord {
  id: string;
  idempotencyKey: string;
  cityId: string;
  hoodId?: number;
  propertyCategory?: PropertyCategory;
  reason: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  recalculatedSnapshotsCount: number;
  matchingHistoricalSnapshotsCount?: number;
  actuallyRecalculatedSnapshotsCount?: number;
  recalculatedBaselinesCount: number;
  requestedByUid: string;
  createdAtIso: string;
  completedAtIso?: string;
  errorMessage?: string;
}

export interface ValuationDataConsumerAdapter {
  getNeighborhoodBenchmark(params: { cityId: string; hoodId: number }): Promise<{
    basePricePerSqmMillion: number;
    baseRahn80mMillion: number;
    baseLandPricePerSqmMillion?: number;
    hoodName: string;
    zone: string;
    lastUpdatedIso: string;
  } | null>;
  queryComparableListings(params: {
    cityId: string;
    hoodId: number;
    propertyCategory: PropertyCategory;
    transactionType: ValuationTransactionType;
    sqm: number;
    limit: number;
  }): Promise<Array<{
    id: string;
    sqm: number;
    priceNumericMillion: number;
    buildYear?: number;
    hoodId: number;
    distanceMeters?: number;
    sourceType?: MarketEvidenceSourceType;
    evidenceType?: 'confirmed_transaction' | 'asking_listing';
    approvedAtIso?: string;
    observedAtIso?: string;
    isVerifiedTransaction?: boolean;
  }>>;
}

export interface ValuationModuleDependencies {
  dataConsumer: ValuationDataConsumerAdapter;
  txRunner?: TransactionRunnerAdapter;
  tokenVerifier?: FirebaseIdTokenVerifier;
  adminStore?: AdminAuthorizationStoreAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  rateLimiter?: RateLimiterAdapter;
  auditLogger?: AuditLoggerAdapter;
  telemetry?: TelemetryAdapter;
  primaryAdminEmails?: string[];
  snapshotsCollection?: string;
  now?: () => Date;
}
