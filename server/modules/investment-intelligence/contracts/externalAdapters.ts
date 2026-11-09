import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../../core';

export type SupportedCurrencyCode = 'TOMAN' | 'IRR' | 'USD' | 'EUR';

export type CanonicalPropertyCategory =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'OFFICE'
  | 'RETAIL'
  | 'LAND'
  | 'MIXED_USE';

export type InvestmentDataClassification =
  | 'CONFIRMED'
  | 'REPORTED'
  | 'ESTIMATED'
  | 'FORECAST'
  | 'IMPORTED'
  | 'INCOMPLETE'
  | 'CONFLICTING'
  | 'UNAVAILABLE';

export interface FinancialInputProvenance {
  sourceModule:
    | 'INVESTMENT_INTELLIGENCE_USER_INPUT'
    | 'PROPERTY_TRANSACTIONS'
    | 'PROPERTY_MANAGEMENT'
    | 'VALUATION'
    | 'MARKET_INTELLIGENCE'
    | 'URBAN_INTELLIGENCE'
    | 'AUTHORIZED_PAYMENT_SOURCE';
  sourceRecordRefId: string | null;
  originalAmount: number | null;
  originalCurrency: SupportedCurrencyCode;
  observationDateIso: string;
  recordedAtIso: string;
  classification: InvestmentDataClassification;
  verificationState: 'AUTHORITATIVELY_VERIFIED' | 'USER_DECLARED_UNVERIFIED' | 'MODEL_DERIVED' | 'UNVERIFIED';
  calculationInclusionStatus: 'INCLUDED' | 'EXCLUDED_UNVERIFIED' | 'EXCLUDED_CURRENCY_MISMATCH' | 'EXCLUDED_DUPLICATE';
  knownLimitations: string[];
}

/**
 * 1. Canonical Property Registry Read Adapter (Section 4, 5, 6, 15, 16)
 */
export interface CanonicalPropertySnapshot {
  canonicalPropertyId: string;
  cityId: string;
  districtId?: string;
  neighborhoodId?: string;
  propertyCategory: CanonicalPropertyCategory;
  isResidential: boolean;
  usableAreaSqm: number | null;
  buildingAgeYears: number | null;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface InvestmentPropertyRegistryReadAdapter {
  getCanonicalPropertyById(canonicalPropertyId: string): Promise<CanonicalPropertySnapshot | null>;
}

/**
 * 2. Authoritative Property Valuation Read Adapter (Section 11)
 * Consumes valuation estimates without creating a second valuation engine.
 */
export interface AuthoritativePropertyValuationSnapshot {
  valuationId: string;
  canonicalPropertyId: string;
  estimatedMarketValue: number;
  currency: SupportedCurrencyCode;
  valuationDateIso: string;
  methodologyVersion: string;
  confidenceGrade: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  isStale: boolean;
  limitations: string[];
}

export interface InvestmentValuationReadAdapter {
  getLatestValuationForProperty(params: {
    canonicalPropertyId: string;
    asOfDateIso?: string;
  }): Promise<AuthoritativePropertyValuationSnapshot | null>;
  getHistoricalValuationsForProperty?(params: {
    canonicalPropertyId: string;
    startDateIso?: string;
    endDateIso?: string;
  }): Promise<AuthoritativePropertyValuationSnapshot[]>;
}

/**
 * 3. Property Management Rental & Occupancy Read Adapter (Section 12)
 * Consumes aggregated, privacy-safe rental agreement, occupancy/vacancy, and expense summaries.
 * Never exposes tenant PII (names, national IDs, phone numbers, emails).
 */
export interface AggregatedRentalOccupancySummary {
  canonicalPropertyId: string;
  reportingPeriodStartIso: string;
  reportingPeriodEndIso: string;
  activeAgreementRefId: string | null;
  agreementCommencementIso: string | null;
  agreementExpiryIso: string | null;
  currency: SupportedCurrencyCode;
  contractualMonthlyRent: number | null;
  contractualSecurityDeposit: number | null;
  scheduledRentObligationTotal: number;
  tenantSelfReportedPaymentTotal: number;
  authoritativelyConfirmedCollectedRentTotal: number;
  occupiedDaysInPeriod: number;
  vacantDaysInPeriod: number;
  totalDaysInPeriod: number;
  renewalEventsCount: number;
  documentedManagementExpensesTotal: number;
  documentedMaintenanceExpensesTotal: number;
  activeLeaseCount: number;
  singleLeaseConcentrationRatio: number | null;
}

export interface InvestmentPropertyManagementReadAdapter {
  getAggregatedRentalAndOccupancySummary(params: {
    canonicalPropertyId: string;
    periodStartIso: string;
    periodEndIso: string;
  }): Promise<AggregatedRentalOccupancySummary | null>;
}

/**
 * 4. Property Transactions Acquisition & Disposal Read Adapter (Section 13)
 */
export interface AuthoritativePropertyTransactionSnapshot {
  transactionId: string;
  canonicalPropertyId: string;
  workflowType: 'ACQUISITION' | 'DISPOSAL';
  workflowStage: 'ACCEPTED_OFFER_PENDING_COMPLETION' | 'COMPLETED_TRANSACTION';
  paymentSettlementStage: 'UNSETTLED' | 'PARTIALLY_SETTLED' | 'AUTHORITATIVELY_SETTLED';
  agreedPriceTotal: number;
  confirmedSettledPriceTotal: number | null;
  documentedBrokerageAndLegalCostsTotal: number | null;
  currency: SupportedCurrencyCode;
  offerAcceptedAtIso: string;
  completedAtIso: string | null;
}

export interface InvestmentTransactionsReadAdapter {
  getPropertyTransactionById(transactionId: string): Promise<AuthoritativePropertyTransactionSnapshot | null>;
}

/**
 * 5. Market Intelligence & Urban Intelligence Read Adapters (Section 17)
 */
export interface MarketBenchmarkSnapshot {
  benchmarkId: string;
  geographicEntityId: string;
  propertyCategory: CanonicalPropertyCategory;
  reportingPeriodKey: string;
  currency: SupportedCurrencyCode;
  medianGrossRentalYieldPct: number | null;
  salePricePeriodChangePct: number | null;
  rentalRatePeriodChangePct: number | null;
  medianVacancyRatePct: number | null;
  medianMonthsOfSupply: number | null;
  sampleSize: number;
  methodologyVersion: string;
  sourceCoverageNote: string;
}

export interface InvestmentMarketBenchmarkReadAdapter {
  getMarketBenchmark(params: {
    geographicEntityId: string;
    propertyCategory: CanonicalPropertyCategory;
    reportingPeriodKey: string;
  }): Promise<MarketBenchmarkSnapshot | null>;
}

export interface UrbanContextIndicatorSnapshot {
  geographicEntityId: string;
  accessibilityScoreSummary: string | null;
  infrastructureCompletenessRatio: number | null;
  methodologyVersion: string;
}

export interface InvestmentUrbanIntelligenceReadAdapter {
  getUrbanContextSummary(geographicEntityId: string): Promise<UrbanContextIndicatorSnapshot | null>;
}

/**
 * 6. Currency Exchange & Inflation Reference Read Adapter (Section 18)
 */
export interface VerifiedExchangeRateQuote {
  fromCurrency: SupportedCurrencyCode;
  toCurrency: SupportedCurrencyCode;
  rate: number;
  asOfDateIso: string;
  sourceAuthority: string;
}

export interface VerifiedInflationIndexRecord {
  periodKey: string;
  currency: SupportedCurrencyCode;
  cpiIndexBase100: number;
  sourceAuthority: string;
}

export interface CurrencyAndInflationReadAdapter {
  getVerifiedExchangeRate(params: {
    fromCurrency: SupportedCurrencyCode;
    toCurrency: SupportedCurrencyCode;
    asOfDateIso: string;
  }): Promise<VerifiedExchangeRateQuote | null>;
  getInflationIndex(params: {
    periodKey: string;
    currency: SupportedCurrencyCode;
  }): Promise<VerifiedInflationIndexRecord | null>;
}

export interface InvestmentIntelligenceModuleDependencies {
  txRunner: TransactionRunnerAdapter;
  adminStore?: DelegatedAdminStoreAdapter | null;
  tokenVerifier?: FirebaseTokenVerifierAdapter | null;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  nowFn?: () => number;
  propertyRegistry: InvestmentPropertyRegistryReadAdapter;
  valuation?: InvestmentValuationReadAdapter;
  propertyManagement?: InvestmentPropertyManagementReadAdapter;
  transactions?: InvestmentTransactionsReadAdapter;
  marketBenchmarks?: InvestmentMarketBenchmarkReadAdapter;
  urbanIntelligence?: InvestmentUrbanIntelligenceReadAdapter;
  currencyAndInflation?: CurrencyAndInflationReadAdapter;
}

export type { NormalizedTimestamp };
