import type {
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../core';

export type PropertyCategory = 'residential' | 'commercial' | 'office';
export type ValuationTransactionType = 'sale' | 'rent';
export type ValuationMethod = 'hedonic_regression' | 'comparable_sales' | 'neighborhood_benchmark';
export type ConfidenceLevel = 'high' | 'moderate' | 'low' | 'insufficient_data';
export type RenovationCondition = 'luxury_renovated' | 'renovated' | 'standard' | 'needs_renovation';

export interface PropertyValuationInput {
  cityId: string;
  hoodId: number;
  hoodName?: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  sqm: number;
  buildYear?: number;
  floor?: number;
  totalFloors?: number;
  hasElevator?: boolean;
  hasParking?: boolean;
  hasStorage?: boolean;
  renovationCondition?: RenovationCondition;
  sellerAskingTotalMillion?: number;
}

export interface ValuationFactorAdjustment {
  factorId: string;
  factorLabelFa: string;
  impactPercent: number;
  impactAmountMillion: number;
  descriptionFa: string;
}

export interface ComparableRecordExplanation {
  listingId: string;
  similarityScore: number;
  included: boolean;
  exclusionReason?: string;
  pricePerSqmMillion: number;
  sqm: number;
  buildYear?: number;
  distanceOrNeighborhoodMatch: 'exact_neighborhood' | 'adjacent_zone' | 'city_wide';
}

export interface PropertyValuationResult {
  id: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  cityId: string;
  hoodId: number;
  hoodName?: string;
  sqm: number;
  estimatedTotalMillion: number;
  estimatedPricePerSqmMillion: number;
  estimatedMonthlyRentMillion?: number;
  estimatedDepositMillion?: number;
  valuationRangeMillion: {
    min: number;
    max: number;
  };
  fastSaleTotalMillion?: number;
  confidence: ConfidenceLevel;
  confidenceScore: number; // 0 to 100
  methodology: ValuationMethod;
  methodologyVersion: string;
  comparableCount: number;
  comparables: ComparableRecordExplanation[];
  adjustments: ValuationFactorAdjustment[];
  netAdjustmentPercent: number;
  summaryExplanationFa: string;
  limitationsFa: string[];
  calculatedAtIso: string;
}

export interface NeighborhoodMarketIndicators {
  cityId: string;
  hoodId: number;
  hoodName: string;
  observationPeriod: string;
  recordCount: number;
  medianAskingPricePerSqmMillion: number;
  averageAskingPricePerSqmMillion: number;
  medianRentMillion: number;
  averageRentMillion: number;
  priceChangePercent6m: number;
  sampleSufficiency: 'sufficient' | 'limited' | 'insufficient';
  dataFreshnessIso: string;
  methodologyVersion: string;
}

export interface StoredValuationSnapshot {
  id: string;
  ownerUid?: string;
  input: PropertyValuationInput;
  result: PropertyValuationResult;
  reproducibleHash: string;
  createdAt: NormalizedTimestamp;
}

export interface ValuationDataConsumerAdapter {
  getNeighborhoodBenchmark: (params: {
    cityId: string;
    hoodId: number;
  }) => Promise<{
    basePricePerSqmMillion: number;
    baseRahn80mMillion: number;
    hoodName: string;
    zone: string;
    lastUpdatedIso: string;
  } | null>;
  queryComparableListings: (params: {
    cityId: string;
    hoodId: number;
    propertyCategory: PropertyCategory;
    transactionType: ValuationTransactionType;
    sqm: number;
    limit: number;
  }) => Promise<Array<{
    id: string;
    sqm: number;
    priceNumericMillion?: number;
    rentNumericMillion?: number;
    buildYear?: number;
    hoodId: number;
    approvedAtIso?: string;
  }>>;
}

export interface ValuationModuleDependencies {
  tokenVerifier?: FirebaseTokenVerifierAdapter;
  txRunner?: TransactionRunnerAdapter;
  dataConsumer: ValuationDataConsumerAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  nowFn?: () => number;
}
