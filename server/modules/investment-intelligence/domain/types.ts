import type { NormalizedTimestamp } from '../../core';
import type {
  CanonicalPropertyCategory,
  FinancialInputProvenance,
  InvestmentDataClassification,
  SupportedCurrencyCode,
} from '../contracts/externalAdapters';

export type InvestmentPortfolioType =
  | 'PERSONAL_PROPERTY_PORTFOLIO'
  | 'COMPANY_PROPERTY_PORTFOLIO'
  | 'RENTAL_PROPERTY_PORTFOLIO'
  | 'COMMERCIAL_PROPERTY_PORTFOLIO'
  | 'DEVELOPMENT_PROPERTY_PORTFOLIO'
  | 'MIXED_ASSET_PROPERTY_PORTFOLIO';

export type InvestmentPortfolioStatus = 'ACTIVE' | 'ARCHIVED';

export interface PortfolioMembershipHistoryEntry {
  eventId: string;
  investmentAssetId: string;
  canonicalPropertyId: string;
  action: 'ADDED' | 'REMOVED';
  actorUid: string;
  occurredAt: NormalizedTimestamp;
  reason?: string;
}

export interface InvestmentPortfolioRecord {
  portfolioId: string;
  name: string;
  portfolioType: InvestmentPortfolioType;
  ownerUid: string;
  authorizedManagerUids: string[];
  description: string;
  baseReportingCurrency: SupportedCurrencyCode;
  portfolioCreationDateIso: string;
  status: InvestmentPortfolioStatus;
  activeAssetIds: string[];
  membershipHistory: PortfolioMembershipHistoryEntry[];
  nonLegalOwnershipDisclaimer: string;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type InvestmentHoldingStatus =
  | 'ACTIVE_HOLDING'
  | 'PRE_PLATFORM_HISTORICAL_HOLDING'
  | 'DISPOSED_EXITED'
  | 'REMOVED_FROM_PORTFOLIO';

export type AcquisitionPriceClassification =
  | 'AUTHORITATIVELY_CONFIRMED_TRANSACTION'
  | 'ACCEPTED_OFFER_NOT_YET_COMPLETED'
  | 'USER_ESTIMATED_ACQUISITION_PRICE'
  | 'UNAVAILABLE_ACQUISITION_PRICE';

export interface InvestmentAssetRecord {
  investmentAssetId: string;
  portfolioId: string;
  canonicalPropertyId: string;
  propertyCategory: CanonicalPropertyCategory;
  cityId: string;
  districtId?: string;
  neighborhoodId?: string;
  usableAreaSqm: number | null;
  buildingAgeYears: number | null;
  investmentClassification: 'CORE_RENTAL' | 'VALUE_ADD' | 'OPPORTUNISTIC' | 'DEVELOPMENT' | 'OWNER_OCCUPIED_ANALYTICAL';
  acquisitionTransactionRefId: string | null;
  disposalTransactionRefId: string | null;
  acquisitionDateIso: string | null;
  acquisitionPrice: number | null;
  acquisitionCurrency: SupportedCurrencyCode;
  acquisitionPriceClassification: AcquisitionPriceClassification;
  initialTransactionCostEstimate: number | null;
  initialRenovationCostEstimate: number | null;
  financingRefId: string | null;
  financedPrincipalAmount: number | null;
  annualFinancingCostEstimate: number | null;
  disposalDateIso: string | null;
  disposalPrice: number | null;
  disposalPriceClassification:
    | 'AUTHORITATIVELY_CONFIRMED_DISPOSAL'
    | 'USER_REPORTED_DISPOSAL'
    | 'NOT_DISPOSED';
  holdingStatus: InvestmentHoldingStatus;
  entryDateIso: string;
  exitDateIso: string | null;
  provenance: FinancialInputProvenance;
  nonLegalOwnershipDisclaimer: string;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type FinancialEntryMajorClass =
  | 'ACQUISITION_COST'
  | 'OPERATING_INCOME'
  | 'OPERATING_EXPENSE'
  | 'CAPITAL_EXPENDITURE'
  | 'FINANCING_COST_REFERENCE'
  | 'TAX_COST_REFERENCE';

export type AcquisitionCostSubcategory =
  | 'PURCHASE_PRICE'
  | 'BROKERAGE_COSTS'
  | 'LEGAL_AND_ADMIN_COSTS'
  | 'TRANSFER_AND_REGISTRATION_COSTS'
  | 'RENOVATION_COSTS'
  | 'INITIAL_SETUP_COSTS';

export type OperatingIncomeSubcategory =
  | 'CONTRACTUAL_MONTHLY_RENT'
  | 'DOCUMENTED_OTHER_RENTAL_INCOME'
  | 'EXPLICIT_OTHER_PROPERTY_INCOME';

export type OperatingExpenseSubcategory =
  | 'PROPERTY_MANAGEMENT_COSTS'
  | 'MAINTENANCE_COSTS'
  | 'INSURANCE_COSTS'
  | 'BUILDING_CHARGES'
  | 'PROPERTY_TAXES_AND_FEES'
  | 'OWNER_PAID_UTILITIES'
  | 'VACANCY_RELATED_COSTS'
  | 'OTHER_DOCUMENTED_OPERATING_EXPENSES';

export type CapitalExpenditureSubcategory =
  | 'STRUCTURAL_IMPROVEMENT'
  | 'MAJOR_RENOVATION'
  | 'EQUIPMENT_REPLACEMENT'
  | 'BUILDING_SYSTEM_UPGRADES'
  | 'OTHER_MAJOR_ASSET_IMPROVEMENTS';

export type FinancialSubcategory =
  | AcquisitionCostSubcategory
  | OperatingIncomeSubcategory
  | OperatingExpenseSubcategory
  | CapitalExpenditureSubcategory
  | 'AUTHORIZED_FINANCING_COST'
  | 'DOCUMENTED_PROPERTY_TAX';

export type ExpenseRecurrenceType = 'RECURRING' | 'ONE_TIME';

export interface InvestmentFinancialEntryRecord {
  entryId: string;
  portfolioId: string;
  investmentAssetId: string;
  canonicalPropertyId: string;
  majorClass: FinancialEntryMajorClass;
  subcategory: FinancialSubcategory;
  recurrence: ExpenseRecurrenceType;
  periodStartIso: string;
  periodEndIso: string;
  amount: number;
  currency: SupportedCurrencyCode;
  paymentStatus:
    | 'AUTHORITATIVELY_CONFIRMED_CASH_MOVEMENT'
    | 'REPORTED_UNVERIFIED_PAYMENT'
    | 'SCHEDULED_OBLIGATION'
    | 'PROJECTED_FORECAST';
  deduplicationKey: string;
  provenance: FinancialInputProvenance;
  createdAt: NormalizedTimestamp;
}

export type PropertyValueBasisType =
  | 'ORIGINAL_ACQUISITION_COST_BASIS'
  | 'CURRENT_VALUATION_ESTIMATE_BASIS';

export interface RentalYieldAnalysisResult {
  analysisId: string;
  portfolioId: string;
  investmentAssetId: string;
  canonicalPropertyId: string;
  periodStartIso: string;
  periodEndIso: string;
  observedDaysInPeriod: number;
  occupiedDaysInPeriod: number;
  vacantDaysInPeriod: number;
  annualizationFactorUsed: number;
  currency: SupportedCurrencyCode;
  valueBasisUsed: PropertyValueBasisType;
  acquisitionCostBasisTotal: number | null;
  currentEstimatedValue: number | null;
  valuationRefId: string | null;
  valuationDateIso: string | null;
  valuationMethodologyVersion: string | null;
  valuationIsStale: boolean;
  observedGrossRentalIncome: number | null;
  annualizedGrossRentalIncome: number | null;
  observedOperatingExpenses: number;
  annualizedOperatingExpenses: number;
  annualizedNetOperatingIncome: number | null;
  grossRentalYieldOnAcquisitionCostPct: number | null;
  netRentalYieldOnAcquisitionCostPct: number | null;
  grossRentalYieldOnCurrentValuationPct: number | null;
  netRentalYieldOnCurrentValuationPct: number | null;
  excludedExpenseCategories: string[];
  status: 'CALCULATED' | 'INSUFFICIENT_INCOME_OR_VALUE_BASIS';
  statusReason?: string;
  formulasUsed: {
    grossRentalYieldFormula: string;
    netOperatingYieldFormula: string;
  };
  methodologyVersion: string;
  createdAt: NormalizedTimestamp;
}

export interface PeriodCashFlowSummary {
  periodKey: string;
  periodType: 'MONTHLY' | 'ANNUAL' | 'CUSTOM_WINDOW';
  currency: SupportedCurrencyCode;
  confirmedRentalIncome: number;
  reportedUnverifiedRentalIncome: number;
  scheduledUnpaidRentalObligations: number;
  projectedRentalIncome: number;
  operatingExpensesTotal: number;
  maintenanceExpensesTotal: number;
  propertyManagementExpensesTotal: number;
  vacancyCostsTotal: number;
  capitalExpenditureTotal: number;
  financingCostReferencesTotal: number;
  taxCostReferencesTotal: number;
  netOperatingCashFlowConfirmed: number;
  netOperatingCashFlowIncludingReported: number;
  netCashFlowAfterCapexAndFinancing: number;
  missingHistoricalDataFlags: string[];
}

export interface CashFlowAnalysisResult {
  cashFlowAnalysisId: string;
  portfolioId: string;
  investmentAssetId: string;
  periodStartIso: string;
  periodEndIso: string;
  currency: SupportedCurrencyCode;
  aggregateSummary: PeriodCashFlowSummary;
  monthlyBreakdown: PeriodCashFlowSummary[];
  reconciliationMetadata: {
    duplicateEntriesExcludedCount: number;
    currencyMismatchesExcludedCount: number;
    authoritativeBankAccessClaimed: false;
    reconciliationDisclaimer: string;
  };
  methodologyVersion: string;
  createdAt: NormalizedTimestamp;
}

export interface DatedCashFlowPoint {
  dateIso: string;
  netAmount: number;
  classification: InvestmentDataClassification;
}

export interface ReturnOnInvestmentAnalysisResult {
  returnAnalysisId: string;
  portfolioId: string;
  investmentAssetId: string;
  currency: SupportedCurrencyCode;
  returnRealizationStatus: 'REALIZED_ON_COMPLETED_DISPOSAL' | 'UNREALIZED_ON_VALUATION_ESTIMATE' | 'INCOMPLETE_BASIS';
  holdingPeriodDays: number | null;
  holdingPeriodYears: number | null;
  annualizationEligible: boolean;
  totalAcquisitionBasis: number | null;
  capitalExpenditureTotal: number;
  terminalValueUsed: number | null;
  terminalValueClassification:
    | 'CONFIRMED_DISPOSAL_SALE_PRICE'
    | 'AUTHORITATIVE_VALUATION_ESTIMATE'
    | 'UNAVAILABLE';
  valuationRefId: string | null;
  valuationDateIso: string | null;
  cumulativeNetOperatingIncome: number;
  capitalAppreciationAmount: number | null;
  capitalAppreciationPct: number | null;
  totalInvestmentReturnAmount: number | null;
  holdingPeriodTotalReturnPct: number | null;
  annualizedReturnCagrPct: number | null;
  cashOnCashReturnPct: number | null;
  internalRateOfReturnAnnualPct: number | null;
  irrStatus: 'CALCULATED' | 'INSUFFICIENT_DATED_CASHFLOWS' | 'NON_CONVERGENT_OR_NO_SIGN_CHANGE';
  equityMultiple: number | null;
  inflationAdjustedRealTotalReturnPct: number | null;
  inflationMethodologyNote?: string;
  missingFinancialInputs: string[];
  formulasDocumented: Record<string, string>;
  methodologyVersion: string;
  nonGuaranteeDisclaimer: string;
  createdAt: NormalizedTimestamp;
}

export interface InvestmentScenarioRecord {
  scenarioId: string;
  outputClassification: 'HYPOTHETICAL_INVESTMENT_SCENARIO_NOT_A_FORECAST';
  portfolioId: string;
  investmentAssetId: string | null;
  scenarioName: string;
  currency: SupportedCurrencyCode;
  projectionHorizonYears: number;
  explicitAssumptions: {
    monthlyRentalIncomeChangePct: number;
    additionalVacancyDaysPerYear: number;
    maintenanceCostChangePct: number;
    hypotheticalPropertyValueChangePct: number;
    majorRenovationCapexAmount: number;
    hypotheticalHoldingPeriodYears: number;
    hypotheticalFutureSalePrice: number | null;
    financingCostDeltaPct: number;
  };
  baselineSummary: {
    annualNetOperatingIncome: number;
    netRentalYieldPct: number | null;
    holdingPeriodReturnPct: number | null;
    terminalPropertyValue: number | null;
  };
  projectedScenarioSummary: {
    projectedAnnualNetOperatingIncome: number;
    projectedNetRentalYieldPct: number | null;
    projectedHoldingPeriodReturnPct: number | null;
    projectedTerminalValue: number | null;
    noiDeltaFromBaseline: number;
    returnPctDeltaFromBaseline: number | null;
  };
  limitations: string[];
  methodologyVersion: string;
  createdAt: NormalizedTimestamp;
}

export interface PortfolioAllocationAndConcentrationResult {
  analysisId: string;
  portfolioId: string;
  reportingCurrency: SupportedCurrencyCode;
  valuationBasis: PropertyValueBasisType;
  totalAssetsCount: number;
  assetsWithValidValueCount: number;
  assetsMissingValueIds: string[];
  totalValuedPortfolioAmount: number;
  geographicAllocationByCity: Record<string, { amount: number; sharePct: number; assetCount: number }>;
  propertyCategoryAllocation: Record<string, { amount: number; sharePct: number; assetCount: number }>;
  residentialVsCommercialAllocation: {
    residentialSharePct: number;
    commercialAndOtherSharePct: number;
  };
  rentalVsNonRentalAllocation: {
    rentalProducingAssetCount: number;
    nonRentalAssetCount: number;
  };
  concentrationMetrics: {
    largestSingleAssetValueSharePct: number | null;
    assetValueHerfindahlHirschmanIndex: number | null;
    largestSingleAssetRentalIncomeSharePct: number | null;
    largestSingleAssetExpenseSharePct: number | null;
    portfolioVacancyExposurePct: number | null;
    concentrationFormulas: Record<string, string>;
  };
  nonLossGuaranteeDisclaimer: string;
  methodologyVersion: string;
  createdAt: NormalizedTimestamp;
}

export interface ExplainableRiskIndicatorItem {
  indicatorCode:
    | 'VACANCY_EXPOSURE_RISK'
    | 'RENTAL_INCOME_CONCENTRATION_RISK'
    | 'GEOGRAPHIC_CONCENTRATION_RISK'
    | 'PROPERTY_CATEGORY_CONCENTRATION_RISK'
    | 'MAINTENANCE_COST_VOLATILITY_RISK'
    | 'BUILDING_AGE_EXPOSURE_RISK'
    | 'VALUATION_UNCERTAINTY_AND_STALENESS_RISK'
    | 'LIQUIDITY_LIMITATION_RISK'
    | 'LEASE_CONCENTRATION_RISK'
    | 'DATA_QUALITY_AND_COMPLETENESS_RISK';
  riskBasis: 'OBSERVED_EVIDENCE' | 'HYPOTHETICAL_SENSITIVITY';
  qualitativeSeverity: 'LOW_OBSERVED_EXPOSURE' | 'MODERATE_OBSERVED_EXPOSURE' | 'ELEVATED_OBSERVED_EXPOSURE' | 'INSUFFICIENT_EVIDENCE';
  observedMetricValue: number | null;
  measurementUnit: string;
  evidenceSummary: string;
  limitations: string[];
}

export interface InvestmentRiskAnalysisResult {
  riskAnalysisId: string;
  portfolioId: string;
  indicators: ExplainableRiskIndicatorItem[];
  tenantPrivacyAndNonCreditworthinessDisclaimer: string;
  nonProfitabilityGuaranteeDisclaimer: string;
  methodologyVersion: string;
  createdAt: NormalizedTimestamp;
}

export interface InvestmentPerformanceSnapshotRecord {
  snapshotId: string;
  portfolioId: string;
  investmentAssetId: string | null;
  reportingPeriodKey: string;
  periodType: 'MONTHLY' | 'ANNUAL' | 'HOLDING_PERIOD';
  observationWindowStartIso: string;
  observationWindowEndIso: string;
  generatedAt: NormalizedTimestamp;
  currency: SupportedCurrencyCode;
  inputSnapshotHash: string;
  methodologyVersion: string;
  valuationRefIds: string[];
  dataQualityStatus: InvestmentDataClassification;
  missingDataIndicators: string[];
  cashFlowSummary: PeriodCashFlowSummary;
  grossRentalYieldPct: number | null;
  netRentalYieldPct: number | null;
  unrealizedReturnPct: number | null;
  realizedReturnPct: number | null;
}

export interface InvestmentCalculationJobRecord {
  jobId: string;
  operation: string;
  portfolioId: string;
  investmentAssetId: string | null;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  producedArtifactId: string | null;
  inputHash: string;
  requestedByUid: string;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}
