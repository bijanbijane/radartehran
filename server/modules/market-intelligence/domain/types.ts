import type { NormalizedTimestamp } from '../../core';
import type {
  AgeBandCategory,
  ConstructionStageCategory,
  MarketGeographicLevel,
  MarketTransactionMode,
  PropertyFormCategory,
  PropertyUseCategory,
  SizeBandCategory,
} from '../contracts/externalAdapters';

export type MarketDataQualityClassification =
  | 'VERIFIED_SOURCE_DATA'
  | 'REPORTED_NOT_INDEPENDENTLY_VERIFIED'
  | 'IMPORTED'
  | 'MODELED'
  | 'INCOMPLETE'
  | 'STALE'
  | 'CONFLICTING'
  | 'INSUFFICIENT_SAMPLE'
  | 'REJECTED';

export interface MarketSegmentDefinitionRecord {
  segmentId: string;
  version: string;
  name: string;
  marketType: MarketTransactionMode;
  propertyUse: PropertyUseCategory;
  propertyForm: PropertyFormCategory | 'ALL_FORMS';
  constructionStage: ConstructionStageCategory | 'ALL_STAGES';
  sizeBandSqm: SizeBandCategory | 'ALL_SIZES';
  ageBandYears: AgeBandCategory | 'ALL_AGES';
  minimumSampleSizeThreshold: number;
}

export interface DistributionSummaryMetrics {
  sampleCount: number;
  sufficientSample: boolean;
  median: number | null;
  mean: number | null;
  p25: number | null;
  p75: number | null;
  iqrOutliersRemovedCount: number;
}

export interface HousingSupplyIndicators {
  rawAdvertisementCount: number;
  duplicateAdvertisementsRemovedCount: number;
  deduplicatedActiveInventoryCount: number;
  newListingCount: number;
  withdrawnListingCount: number;
  expiredListingCount: number;
  reactivatedListingCount: number;
  bySizeBandCounts: Record<SizeBandCategory | 'UNKNOWN_SIZE', number>;
  byConstructionStageCounts: Record<ConstructionStageCategory, number>;
  withdrawnNotCountedAsSoldDisclaimer: string;
}

export interface HousingDemandIndicators {
  minimumUniqueActorPrivacyThreshold: number;
  privacySuppressionApplied: boolean;
  ignoredRawTelemetryPageViewsCount: number;
  totalSubmittedInquiriesCount: number | null;
  uniqueInquiringActorsCount: number | null;
  repeatInquiryRatePct: number | null;
  qualifiedInquiriesCount: number | null;
  submittedOffersCount: number | null;
  acceptedAgreementsCount: number | null;
  inquiryToOfferConversionPct: number | null;
  offerToAgreementConversionPct: number | null;
  demandProxyLimitations: string[];
}

export interface SaleMarketIndicators {
  currency: 'TOMAN' | 'IRT' | 'IRR';
  areaBasisUsed: 'VERIFIED_AREA_SQM' | 'LISTED_AREA_SQM' | 'MIXED_PREFER_VERIFIED';
  askingPriceTotalDistribution: DistributionSummaryMetrics;
  askingPricePerSqmDistribution: DistributionSummaryMetrics;
  agreedPendingPricePerSqmDistribution: DistributionSummaryMetrics;
  confirmedTransactionPriceTotalDistribution: DistributionSummaryMetrics;
  confirmedTransactionPricePerSqmDistribution: DistributionSummaryMetrics;
  confirmedTransactionCount: number;
  confirmedTransactionTotalVolume: number | null;
  medianListingPriceReductionPct: number | null;
  medianNegotiatedDiscountFromAskingPct: number | null;
  askingVsTransactionSeparationDisclaimer: string;
}

export interface RentalMarketIndicators {
  currency: 'TOMAN' | 'IRT' | 'IRR';
  activeRentalListingCount: number;
  newRentalListingCount: number;
  askingMonthlyRentDistribution: DistributionSummaryMetrics;
  askingSecurityDepositDistribution: DistributionSummaryMetrics;
  askingMonthlyRentPerSqmDistribution: DistributionSummaryMetrics;
  agreedUnverifiedRentalCount: number;
  confirmedRentalAgreementCount: number;
  confirmedMonthlyRentDistribution: DistributionSummaryMetrics;
  confirmedSecurityDepositDistribution: DistributionSummaryMetrics;
  /** Documented optional analytical reference only; deposit and monthly rent are always stored separately */
  analyticalEquivalentRentReference?: {
    documentedAnnualConversionRatePct: number;
    formula: string;
    medianAskingEquivalentMonthlyRent: number | null;
  };
  rentAndDepositSeparationDisclaimer: string;
}

export interface MarketLiquidityIndicators {
  marketType: MarketTransactionMode;
  observedCompletedSampleCount: number;
  rightCensoredActiveListingCount: number;
  medianDaysOnMarketObserved: number | null;
  averageDaysOnMarketObserved: number | null;
  medianRightCensoredActiveDays: number | null;
  medianListingToOfferDays: number | null;
  medianOfferToAgreementDays: number | null;
  medianAgreementToCompletionDays: number | null;
  withdrawalRatePct: number | null;
  expirationRatePct: number | null;
  completionRatePct: number | null;
  censoringAndReactivationMethodologyNote: string;
}

export interface SupplyAbsorptionIndicators {
  timeWindowKey: string;
  activeInventoryCount: number;
  newSupplyCount: number;
  confirmedTransactionsCount: number;
  absorptionStatus:
    | 'AVAILABLE_OBSERVED'
    | 'UNAVAILABLE_ZERO_TRANSACTIONS'
    | 'UNAVAILABLE_INSUFFICIENT_TRANSACTION_VOLUME';
  monthsOfSupply: number | null;
  inventoryTurnoverRatePct: number | null;
  newSupplyAbsorptionRatePct: number | null;
  listingToConfirmedTransactionRatio: number | null;
  absorptionMethodologyDisclaimer: string;
}

export interface MarketDataQualityMetadata {
  classification: MarketDataQualityClassification;
  sourceModules: string[];
  sourceDatasetIds: string[];
  sourceObservationDateIso: string;
  processingDateIso: string;
  methodologyVersion: string;
  sampleSize: number;
  geographicCoverage: MarketGeographicLevel;
  completenessRatio: number;
  isStale: boolean;
  knownLimitations: string[];
}

export interface ImmutableMarketSnapshotRecord {
  snapshotId: string;
  geographicEntityId: string;
  cityId: string;
  districtId?: string;
  geographicLevel: MarketGeographicLevel;
  boundaryVersion: string;
  marketType: MarketTransactionMode;
  segment: MarketSegmentDefinitionRecord;
  reportingPeriodKey: string;
  generatedAt: NormalizedTimestamp;
  observationWindowStartIso: string;
  observationWindowEndIso: string;
  eligibleObservationCount: number;
  methodologyVersion: string;
  inputSnapshotHash: string;
  supply: HousingSupplyIndicators;
  demand: HousingDemandIndicators;
  saleMarket?: SaleMarketIndicators;
  rentalMarket?: RentalMarketIndicators;
  liquidity: MarketLiquidityIndicators;
  absorption: SupplyAbsorptionIndicators;
  dataQuality: MarketDataQualityMetadata;
  provenanceRefs: string[];
}

export interface MarketPriceOrRentIndexRecord {
  indexId: string;
  indexType:
    | 'SALE_ASKING_PRICE_SQM_INDEX'
    | 'CONFIRMED_TRANSACTION_PRICE_SQM_INDEX'
    | 'RENTAL_ASKING_RENT_SQM_INDEX'
    | 'CONFIRMED_RENTAL_AGREEMENT_INDEX';
  geographicEntityId: string;
  segmentId: string;
  basePeriodKey: string;
  reportingPeriodKey: string;
  methodologyVersion: string;
  weightingMethodology: 'FIXED_BASE_SIZE_STRATUM_LASPEYRES_WEIGHTS';
  stratumWeights: Record<SizeBandCategory, number>;
  sampleSize: number;
  status: 'PUBLISHED' | 'SUPPRESSED_INSUFFICIENT_SAMPLE';
  nominalIndexValueBase100: number | null;
  realInflationAdjustedIndexValueBase100: number | null;
  deflatorCpiUsed?: number | null;
  nominalPeriodChangePct: number | null;
  realPeriodChangePct: number | null;
  nonOfficialProprietaryIndexDisclaimer: string;
  createdAt: NormalizedTimestamp;
}

export type ForecastModelIdentifier =
  | 'DAMPED_LINEAR_TREND_V1'
  | 'NAIVE_RANDOM_WALK_BASELINE_V1'
  | 'MOVING_AVERAGE_3P_BASELINE_V1';

export interface ForecastPointOutput {
  horizonStep: number;
  targetPeriodKey: string;
  pointEstimate: number;
  interval80Lower: number;
  interval80Upper: number;
  interval95Lower: number;
  interval95Upper: number;
}

export interface ForecastEvaluationMetrics {
  chronologicalTrainCount: number;
  chronologicalValidationCount: number;
  mae: number;
  rmse: number;
  mapePct: number;
  baselineNaiveRmse: number;
  beatsOrMatchesBaseline: boolean;
  degradationFlagged: boolean;
  degradationReason?: string;
}

export interface MarketForecastRecord {
  forecastId: string;
  outputClassification: 'STATISTICAL_FORECAST_WITH_UNCERTAINTY';
  geographicEntityId: string;
  segmentId: string;
  targetMetric:
    | 'SALE_ASKING_PRICE_SQM_MEDIAN'
    | 'CONFIRMED_TX_PRICE_SQM_MEDIAN'
    | 'RENTAL_ASKING_RENT_MEDIAN'
    | 'ACTIVE_LISTING_SUPPLY'
    | 'MEDIAN_DAYS_ON_MARKET';
  modelId: ForecastModelIdentifier;
  modelVersion: string;
  modelDeprecated: boolean;
  trainingStartPeriodKey: string;
  trainingCutoffPeriodKey: string;
  horizonPeriods: number;
  status: 'COMPLETED' | 'INSUFFICIENT_HISTORICAL_DATA';
  insufficientDataReason?: string;
  forecasts: ForecastPointOutput[];
  evaluation: ForecastEvaluationMetrics | null;
  nonGuaranteeDisclaimer: string;
  createdAt: NormalizedTimestamp;
}

export interface HypotheticalScenarioResultRecord {
  scenarioId: string;
  outputClassification: 'HYPOTHETICAL_SCENARIO_NOT_A_FORECAST';
  geographicEntityId: string;
  segmentId: string;
  baselinePeriodKey: string;
  scenarioName: string;
  explicitAssumptions: {
    supplyShockPct: number;
    demandInquiryShockPct: number;
    constructionCostShockPct: number;
    financingRateDeltaBps: number;
  };
  baselineMetrics: {
    activeSupply: number;
    monthsOfSupply: number | null;
    medianPricePerSqm: number | null;
  };
  projectedScenarioMetrics: {
    projectedActiveSupply: number;
    projectedMonthsOfSupply: number | null;
    projectedDirectionalPressure: 'UPWARD_PRESSURE' | 'DOWNWARD_PRESSURE' | 'NEUTRAL';
    modeledPriceElasticityImpactPct: number;
  };
  methodologyVersion: string;
  nonForecastAndNonInvestmentGuaranteeDisclaimer: string;
  createdAt: NormalizedTimestamp;
}

export interface MarketCalculationJobRecord {
  jobId: string;
  operation: string;
  geographicEntityId: string;
  reportingPeriodKey: string;
  segmentId: string;
  inputSnapshotHash: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  producedSnapshotId?: string;
  failureReason?: string;
  requestedByUid: string;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}
