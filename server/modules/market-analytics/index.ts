/**
 * @file server/modules/market-analytics/index.ts
 * @description Canonical Entry Point and Barrel Exports for the Radartehran Property Valuation
 * and Market Analytics Backend Domain (Employee 10).
 */

export type {
  AnalyticalFactorExplanation,
  ApprovedBargainListingContract,
  ConfidenceAssessment,
  CrowdMarketObservationContract,
  DataQualityReport,
  EvaluatedComparableItem,
  HistoricalBacktestValidationResult,
  HistoricalTrendPoint,
  HistoricalTrendSeriesOutput,
  MarketMode,
  MarketObservationRecord,
  ObservationSourceCategory,
  OutlierDetectionResult,
  OutlierEntry,
  RejectedObservationEntry,
  RenovationGrade,
  SourceProportionSummary,
  SubjectPropertySpecs,
  SupplyDemandIndicatorOutput,
  SupplyDemandInputMetrics,
  ValidationRejectionReason,
  ValuationModelVersionSpec,
  VersionedValuationOutput,
} from './types';

export {
  adaptApprovedBargainToObservation,
  adaptCrowdClaimToObservation,
  CANONICAL_ANALYTICS_MODEL_VERSION,
  computeQuantile,
  DEFAULT_VALUATION_MODEL_SPEC,
  detectStatisticalOutliers,
  isFiniteNumber,
  sanitizeAndDeduplicateObservations,
  SOURCE_CATEGORY_META,
  type SanitizedObservationsBundle,
} from './dataQualityAndOutliers';

export {
  computeComparableSimilarityScore,
  computeMissingSafeQualityIndex,
  computeSourceProportionSummaries,
  evaluateAndWeightComparables,
  resolveExplicitBuildingAge,
  type ComparableSelectionCriteria,
} from './comparablesAndAdjustments';

export {
  computePropertyOrNeighborhoodValuation,
  computeReproducibilityHash,
  computeWeightedComparableStats,
  evaluateConfidenceAndAuthoritativeGate,
} from './valuationEngine';

export {
  compareNeighborhoodMarkets,
  computeHistoricalMarketTrends,
  computeNeighborhoodMarketIndicators,
  computeSupplyDemandIndicators,
  evaluateHistoricalValidationBacktest,
  type NeighborhoodComparisonOutput,
  type NeighborhoodMarketIndicatorsOutput,
} from './marketIndicatorsAndTrends';

export {
  collectObservationsFromContracts,
  defaultMarketAnalyticsService,
  InMemoryMarketAnalyticsRepository,
  MarketAnalyticsService,
  type MarketAnalyticsRepository,
  type UpstreamEvidenceSourcesInput,
} from './repositoryAndService';
