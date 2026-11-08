/**
 * Mortgage & Real Estate Financing Intelligence Domain Types
 * (`server/modules/financing-intelligence/types.ts`)
 * Exclusive ownership: `server/modules/financing-intelligence/`
 */

export type InstitutionType =
  | 'commercial_bank'
  | 'specialized_housing_bank'
  | 'mortgage_lender'
  | 'credit_cooperative'
  | 'government_housing_program'
  | 'microfinance_institution'
  | 'other';

export type FinancingProductCategory =
  | 'residential_purchase'
  | 'first_time_homebuyer'
  | 'construction'
  | 'renovation_improvement'
  | 'commercial_property'
  | 'rental_investment'
  | 'land_purchase'
  | 'refinancing'
  | 'equity_release'
  | 'other';

export type InterestRateType =
  | 'fixed'
  | 'variable'
  | 'periodically_adjustable'
  | 'step_rate'
  | 'index_linked'
  | 'promotional_introductory';

export type RepaymentMethod =
  | 'equal_installments' // Annuity / French amortization
  | 'equal_principal'    // Linear / German amortization
  | 'interest_only'
  | 'bullet_balloon';

export type ProductAvailabilityStatus =
  | 'active'
  | 'suspended'
  | 'discontinued'
  | 'unverified'
  | 'expired';

export type VerificationStatus = 'verified' | 'unverified' | 'stale' | 'disputed';

export interface FinancingInstitution {
  institutionId: string;
  nameFa: string;
  nameEn?: string;
  institutionType: InstitutionType;
  jurisdiction: string; // e.g. 'IR', 'US', 'DE', etc.
  officialWebsite?: string;
  regulatoryCode?: string;
  verificationStatus: VerificationStatus;
  lastVerifiedTimestampIso: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface InterestRateStructure {
  rateModelId: string;
  rateType: InterestRateType;
  nominalAnnualRatePercent: number;
  rateRangeMinPercent?: number;
  rateRangeMaxPercent?: number;
  marginSpreadPercent?: number;
  referenceIndexName?: string;
  rateFloorPercent?: number;
  rateCeilingPercent?: number;
  promotionalPeriodMonths?: number;
  postPromotionalRatePercent?: number;
  effectiveDateIso: string;
}

export interface FinancingFeeItem {
  feeId: string;
  feeNameFa: string;
  isMandatory: boolean;
  feeCategory: 'origination' | 'valuation' | 'administrative' | 'legal_notary' | 'insurance' | 'early_repayment' | 'other';
  fixedAmount?: number;
  percentageOfPrincipal?: number;
  currency: string;
}

export interface EligibilityCriterionRule {
  ruleId: string;
  criterionType:
    | 'min_borrower_contribution_percent'
    | 'max_ltv_percent'
    | 'min_financing_amount'
    | 'max_financing_amount'
    | 'min_repayment_period_months'
    | 'max_repayment_period_months'
    | 'allowed_property_categories'
    | 'employment_status_required'
    | 'guarantor_required'
    | 'first_time_buyer_only';
  targetValue: unknown;
  isMandatory: boolean;
  descriptionFa: string;
  sourceReference: string;
}

export interface FinancingProduct {
  productId: string;
  institutionId: string;
  productVersion: number;
  productNameFa: string;
  category: FinancingProductCategory;
  jurisdiction: string;
  currency: string;
  minFinancingAmount: number;
  maxFinancingAmount: number;
  minRepaymentPeriodMonths: number;
  maxRepaymentPeriodMonths: number;
  allowedRepaymentMethods: RepaymentMethod[];
  rateStructure: InterestRateStructure;
  fees: FinancingFeeItem[];
  eligibilityRules: EligibilityCriterionRule[];
  requiredDocumentsChecklist: Array<{ documentKey: string; nameFa: string; isMandatory: boolean }>;
  requiredBorrowerContributionPercent: number; // e.g. 20%
  maxLtvPercent: number; // e.g. 80%
  availabilityStatus: ProductAvailabilityStatus;
  sourceReference: string;
  lastVerifiedTimestampIso: string;
  effectiveFromIso: string;
  effectiveUntilIso?: string;
  isStale: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface AmortizationInstallment {
  installmentNumber: number;
  paymentDateIso: string;
  installmentAmount: number;
  principalComponent: number;
  interestComponent: number;
  remainingPrincipal: number;
  accumulatedInterest: number;
}

export interface AmortizationScheduleResult {
  calculationId: string;
  principalAmount: number;
  annualInterestRatePercent: number;
  repaymentPeriodMonths: number;
  repaymentMethod: RepaymentMethod;
  currency: string;
  monthlyInstallmentAmount: number;
  totalRepaymentAmount: number;
  totalInterestAmount: number;
  effectiveAprPercent?: number;
  installments: AmortizationInstallment[];
  calculationMethodologyVersion: string;
  calculatedAtIso: string;
}

export interface AffordabilityEvaluationInput {
  userMonthlyNetIncome: number;
  userMonthlyExistingDebtObligations: number;
  userEstimatedLivingExpenses: number;
  proposedFinancingAmount: number;
  proposedRepaymentPeriodMonths: number;
  proposedAnnualInterestRatePercent: number;
  repaymentMethod?: RepaymentMethod;
  currency: string;
  maxAllowedDtiPercent?: number; // Default e.g. 40%
}

export interface AffordabilityEvaluationResult {
  monthlyInstallment: number;
  currentDebtToIncomePercent: number;
  projectedDebtToIncomePercent: number;
  maxAllowedDtiPercent: number;
  isWithinDtiThreshold: boolean;
  netResidualIncomeAfterDebtAndExpenses: number;
  isResidualIncomePositive: boolean;
  recommendedMaxFinancingAmount: number;
  disclaimerFa: string;
  calculatedAtIso: string;
}

export interface EarlyRepaymentScenarioInput {
  originalPrincipal: number;
  annualInterestRatePercent: number;
  originalPeriodMonths: number;
  repaymentMethod: RepaymentMethod;
  currentInstallmentIndex: number; // Which month prepayment happens
  prepaymentAmount: number;
  strategy: 'reduce_installment' | 'reduce_period';
  prepaymentPenaltyPercent?: number;
}

export interface EarlyRepaymentScenarioResult {
  remainingPrincipalBeforePrepayment: number;
  prepaymentAmountApplied: number;
  prepaymentPenaltyFee: number;
  remainingPrincipalAfterPrepayment: number;
  newMonthlyInstallment: number;
  newRemainingPeriodMonths: number;
  modeledTotalInterestSaved: number;
  netModeledSavings: number;
}

export interface RefinancingScenarioInput {
  currentRemainingPrincipal: number;
  currentMonthlyInstallment: number;
  currentRemainingMonths: number;
  currentInterestRatePercent: number;
  proposedNewInterestRatePercent: number;
  proposedNewPeriodMonths: number;
  refinancingClosingCosts: number;
}

export interface RefinancingScenarioResult {
  currentRemainingTotalPayments: number;
  proposedNewMonthlyInstallment: number;
  proposedNewTotalPayments: number;
  grossInterestSavings: number;
  refinancingClosingCosts: number;
  netRefinancingSavings: number;
  breakEvenPeriodMonths: number;
  isEconomicallyBeneficial: boolean;
}

export interface ProductComparisonItem {
  product: FinancingProduct;
  institutionNameFa: string;
  modeledMonthlyInstallment: number;
  modeledTotalRepayment: number;
  modeledTotalInterest: number;
  totalKnownMandatoryFees: number;
  hasMissingFeeInformation: boolean;
  meetsRequestedCriteria: boolean;
  unmetCriteriaExplanationFa?: string[];
  dataFreshnessStatus: 'fresh' | 'stale';
}

export interface ProductComparisonReport {
  comparisonId: string;
  criteria: {
    requestedAmount: number;
    propertyValue: number;
    repaymentPeriodMonths: number;
    currency: string;
    jurisdiction: string;
  };
  comparedProducts: ProductComparisonItem[];
  rankingMethodology: 'lowest_modeled_installment' | 'lowest_total_repayment' | 'lowest_nominal_rate';
  generatedAtIso: string;
  disclaimerFa: string;
}

export interface FinancingDomainEvent {
  eventId: string;
  eventType:
    | 'financing.institution.created'
    | 'financing.institution.updated'
    | 'financing.product.created'
    | 'financing.product.updated'
    | 'financing.product.versioned'
    | 'financing.product.discontinued'
    | 'financing.calculation.completed'
    | 'financing.scenario.created'
    | 'financing.comparison.created';
  aggregateId: string;
  actorUserId?: string;
  payload: Record<string, unknown>;
  timestampIso: string;
}
