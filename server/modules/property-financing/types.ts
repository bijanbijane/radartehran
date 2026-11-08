export type FinancingProviderType =
  | 'BANK'
  | 'MORTGAGE_LENDER'
  | 'CREDIT_INSTITUTION'
  | 'MORTGAGE_BROKER'
  | 'FINANCING_INTERMEDIARY'
  | 'NON_BANK_FINANCING_PROVIDER'
  | 'GOVERNMENT_BACKED_FINANCING_PROGRAM'
  | 'OTHER_SUPPORTED_PROVIDER';

export type FinancingProviderVerificationStatus =
  | 'USER_REPORTED_PROVIDER'
  | 'DOCUMENTED_PROVIDER'
  | 'VERIFIED_PROVIDER'
  | 'INACTIVE_PROVIDER'
  | 'UNKNOWN_PROVIDER_STATUS';

export type FinancingVerificationStatus =
  | 'UNVERIFIED_USER_REPORTED'
  | 'DOCUMENT_SUPPORTED_UNVERIFIED'
  | 'LENDER_OR_AUTHORITY_VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'CONFLICTING_RECORDS'
  | 'UNKNOWN';

export type PropertyFinancingType =
  | 'RESIDENTIAL_MORTGAGE'
  | 'COMMERCIAL_PROPERTY_MORTGAGE'
  | 'CONSTRUCTION_FINANCING'
  | 'RENOVATION_FINANCING'
  | 'PROPERTY_ACQUISITION_FINANCING'
  | 'REFINANCING'
  | 'BRIDGE_FINANCING'
  | 'EQUITY_RELEASE'
  | 'GOVERNMENT_SUPPORTED_HOUSING_LOAN'
  | 'OTHER_SUPPORTED_FINANCING';

export type FinancingApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'DOCUMENTS_REQUIRED'
  | 'UNDER_REVIEW'
  | 'PRE_APPROVED'
  | 'APPROVED'
  | 'REJECTED'
  | 'OFFER_ISSUED'
  | 'OFFER_ACCEPTED'
  | 'CONTRACT_PENDING'
  | 'FUNDED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type FinancingApplicationStatusOrigin =
  | 'USER_REPORTED_STATUS'
  | 'LENDER_CONFIRMED_STATUS'
  | 'PLATFORM_WORKFLOW_STATUS'
  | 'UNKNOWN_STATUS';

export type FinancingPartyRole =
  | 'PRIMARY_BORROWER'
  | 'CO_BORROWER'
  | 'GUARANTOR'
  | 'AUTHORIZED_REPRESENTATIVE'
  | 'PROPERTY_OWNER'
  | 'OTHER_SUPPORTED_ROLE';

export type FinancingTermCategory =
  | 'ORIGINAL_PRINCIPAL'
  | 'INTEREST_RATE'
  | 'RATE_STRUCTURE'
  | 'RATE_ADJUSTMENT_FREQUENCY'
  | 'LOAN_DURATION_MONTHS'
  | 'MATURITY_DATE'
  | 'REPAYMENT_FREQUENCY'
  | 'GRACE_PERIOD'
  | 'LOAN_TO_VALUE_RATIO'
  | 'PREPAYMENT_CONDITIONS'
  | 'LATE_PAYMENT_CONDITIONS'
  | 'FEES'
  | 'COLLATERAL_REQUIREMENTS'
  | 'COVENANTS'
  | 'LOAN_SPECIFIC_RESTRICTIONS';

export type FinancingTermEpistemicStage =
  | 'QUOTED_TERMS'
  | 'PRELIMINARY_TERMS'
  | 'APPROVED_TERMS'
  | 'CONTRACTUAL_TERMS'
  | 'USER_REPORTED_TERMS'
  | 'VERIFIED_TERMS';

export type InterestRateEpistemicStage =
  | 'ADVERTISED_RATE'
  | 'QUOTED_RATE'
  | 'APPROVED_RATE'
  | 'CONTRACTUAL_RATE'
  | 'CURRENT_LENDER_CONFIRMED_RATE'
  | 'ESTIMATED_RATE';

export type RepaymentScheduleOrigin =
  | 'CONTRACTUAL_SCHEDULE'
  | 'LENDER_GENERATED_SCHEDULE'
  | 'ESTIMATED_SCHEDULE'
  | 'USER_ENTERED_SCHEDULE';

export type InstallmentPaymentStatus =
  | 'SCHEDULED'
  | 'PAYMENT_REPORTED_UNVERIFIED'
  | 'PAID_CONFIRMED'
  | 'PARTIALLY_PAID_CONFIRMED'
  | 'OVERDUE'
  | 'DEFERRED_OR_HOLIDAY'
  | 'WAIVED';

export type CollateralLifecycleStatus =
  | 'PROPOSED_COLLATERAL'
  | 'SUBMITTED_COLLATERAL'
  | 'ACCEPTED_COLLATERAL'
  | 'REGISTERED_SECURITY'
  | 'RELEASED_SECURITY'
  | 'DISPUTED_SECURITY'
  | 'UNVERIFIED_SECURITY';

export type LtvValuationBasis =
  | 'VERIFIED_PROPERTY_VALUE'
  | 'OFFICIAL_LENDER_VALUATION'
  | 'PLATFORM_VALUATION_ESTIMATE'
  | 'ESTIMATED_PROPERTY_VALUE'
  | 'UNVERIFIED_ASKING_PRICE';

export type FinancingOfferStage =
  | 'ADVERTISED_OFFER'
  | 'PERSONALIZED_QUOTE'
  | 'PRELIMINARY_OFFER'
  | 'APPROVED_OFFER'
  | 'CONTRACTUAL_OFFER'
  | 'EXPIRED_OFFER';

export type RefinancingStatus =
  | 'DRAFT'
  | 'EVALUATING'
  | 'APPLICATION_SUBMITTED'
  | 'OFFER_RECEIVED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONTRACT_PENDING'
  | 'COMPLETED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'UNKNOWN';

export type PayoffLifecycleStatus =
  | 'ESTIMATED_PAYOFF'
  | 'LENDER_ISSUED_PAYOFF_QUOTE'
  | 'PAYOFF_PAYMENT_SUBMITTED'
  | 'PAYOFF_PAYMENT_CONFIRMED'
  | 'LOAN_BALANCE_SETTLED'
  | 'LOAN_CLOSED'
  | 'COLLATERAL_SECURITY_RELEASED';

export type FinancingRiskCategory =
  | 'MISSING_LOAN_TERMS'
  | 'UNVERIFIED_INTEREST_RATE'
  | 'VARIABLE_RATE_EXPOSURE'
  | 'MATURITY_APPROACHING'
  | 'REPAYMENT_SCHEDULE_MISSING'
  | 'REPORTED_OVERDUE_INSTALLMENT'
  | 'COLLATERAL_VERIFICATION_INCOMPLETE'
  | 'REFINANCING_DEPENDENCY'
  | 'LTV_DATA_OUTDATED'
  | 'CONTRACTUAL_TERM_CONFLICT'
  | 'UNVERIFIED_PAYOFF_AMOUNT';

export interface FinancingProviderReferenceRecord {
  id: string;
  providerName: string;
  providerType: FinancingProviderType;
  jurisdictionCitySlug: string;
  officialRegistrationReference?: string;
  contactReference?: string;
  verificationStatus: FinancingProviderVerificationStatus;
  sourceProvenance: string;
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancingApplicationRecord {
  id: string;
  propertyId: string;
  providerId: string;
  applicantPartyId: string;
  financingType: PropertyFinancingType;
  jurisdictionCitySlug: string;
  requestedPrincipalRials: number;
  currency: 'IRR';
  status: FinancingApplicationStatus;
  statusOrigin: FinancingApplicationStatusOrigin;
  lenderConfirmationReference?: string;
  expirationDateIso?: string;
  notes?: string;
  preApprovalGuaranteesFinancing: false;
  isSyntheticTestFixture: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyFinancingRecord {
  id: string;
  propertyId: string;
  providerId: string;
  applicationId?: string;
  primaryBorrowerPartyId: string;
  coBorrowerPartyIds: string[];
  financingType: PropertyFinancingType;
  jurisdictionCitySlug: string;
  loanAccountReference?: string;
  currency: 'IRR';
  originalPrincipalRials: number;
  verifiedCurrentPrincipalBalanceRials?: number;
  activeInterestRateId?: string;
  durationMonths: number;
  originationDateIso: string;
  maturityDateIso: string;
  status: 'ACTIVE' | 'DELINQUENT_REPORTED' | 'RESTRUCTURED' | 'PAID_OFF_PENDING_CLOSURE' | 'CLOSED' | 'CANCELLED';
  sourceDocumentIds: string[];
  verificationStatus: FinancingVerificationStatus;
  provesPropertyOwnership: false;
  isSyntheticTestFixture: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinancingPartyRelationshipRecord {
  id: string;
  financingId: string;
  propertyId: string;
  partyId: string;
  role: FinancingPartyRole;
  effectiveStartIso: string;
  effectiveEndIso?: string;
  verificationStatus: FinancingVerificationStatus;
  authorizationReference: string;
  contractualGuaranteeDocumentId?: string;
  assumesOwnerIsBorrower: false;
  assumesBorrowerIsOwner: false;
  createdAt: string;
  updatedAt: string;
}

export interface FinancingTermRecord {
  id: string;
  financingId: string;
  propertyId: string;
  termCategory: FinancingTermCategory;
  termValue: string | number;
  unitOrCurrency?: string;
  effectiveStartIso: string;
  effectiveEndIso?: string;
  epistemicStage: FinancingTermEpistemicStage;
  sourceDocumentId?: string;
  verificationStatus: FinancingVerificationStatus;
  supersededByTermId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinancingInterestRateRecord {
  id: string;
  financingId: string;
  propertyId: string;
  annualRatePercent: number;
  rateStructure: 'FIXED' | 'VARIABLE';
  rateBasis: string;
  referenceIndexName?: string;
  spreadPercent?: number;
  effectiveDateIso: string;
  rateResetDateIso?: string;
  epistemicStage: InterestRateEpistemicStage;
  sourceReference: string;
  verificationStatus: FinancingVerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RepaymentInstallmentItem {
  installmentNumber: number;
  dueDateIso: string;
  principalComponentRials: number;
  interestComponentRials: number;
  documentedFeesComponentRials: number;
  totalInstallmentRials: number;
  remainingPrincipalReferenceRials: number;
  paymentStatus: InstallmentPaymentStatus;
  externalPaymentConfirmationRef?: string;
}

export interface RepaymentScheduleRecord {
  id: string;
  financingId: string;
  propertyId: string;
  scheduleVersion: number;
  scheduleOrigin: RepaymentScheduleOrigin;
  currency: 'IRR';
  installments: RepaymentInstallmentItem[];
  sourceProvenance: string;
  duplicatesPaymentsLedger: false;
  createdAt: string;
  updatedAt: string;
}

export interface CollateralReferenceRecord {
  id: string;
  financingId: string;
  propertyId: string;
  collateralType: 'MORTGAGE_DEED' | 'PROMISSORY_SECURITY' | 'BANK_GUARANTEE' | 'OTHER_DOCUMENTED_SECURITY';
  documentedSecurityAmountRials?: number;
  currency: 'IRR';
  securityRegistrationReference?: string;
  registrationAuthorityReference?: string;
  effectiveStartIso: string;
  effectiveEndIso?: string;
  status: CollateralLifecycleStatus;
  releaseConfirmationReference?: string;
  sourceDocumentId?: string;
  verificationStatus: FinancingVerificationStatus;
  determinesLegalPriorityOrEnforceability: false;
  createdAt: string;
  updatedAt: string;
}

export interface LtvCalculationRecord {
  id: string;
  financingId: string;
  propertyId: string;
  loanAmountUsedRials: number;
  loanAmountBasis: 'ORIGINAL_LOAN_AMOUNT' | 'CURRENT_OUTSTANDING_BALANCE';
  propertyValueUsedRials: number;
  propertyValuationReference: string;
  valuationBasis: Exclude<LtvValuationBasis, 'UNVERIFIED_ASKING_PRICE'>;
  valuationDateIso: string;
  currency: 'IRR';
  calculatedAtIso: string;
  formulaVersion: 'LTV_STANDARD_V1';
  ltvPercentage: number;
  dataProvenance: string;
  limitations: string[];
  isOfficialLenderUnderwritingRatio: false;
  decidesFinancingEligibility: false;
}

export interface FinancingOfferRecord {
  id: string;
  providerId: string;
  propertyId?: string;
  financingType: PropertyFinancingType;
  principalAmountRials: number;
  annualInterestRatePercent: number;
  rateStructure: 'FIXED' | 'VARIABLE';
  durationMonths: number;
  documentedFeesRials: number;
  requiredCollateralSummary: string;
  eligibilityConditions: string[];
  expirationDateIso: string;
  offerStage: FinancingOfferStage;
  sourceReference: string;
  verificationStatus: FinancingVerificationStatus;
  createdAt: string;
}

export interface RefinancingWorkflowRecord {
  id: string;
  propertyId: string;
  existingFinancingId: string;
  proposedNewFinancingId?: string;
  currentTermsSummary: string;
  proposedNewTermsSummary: string;
  estimatedCostsRials: number;
  documentedFeesRials: number;
  prepaymentPenaltyReference?: string;
  status: RefinancingStatus;
  sourceReference: string;
  verificationStatus: FinancingVerificationStatus;
  automaticallyClosesExistingLoanOnApproval: false;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoanPayoffAndClosureRecord {
  id: string;
  financingId: string;
  propertyId: string;
  payoffQuoteReference?: string;
  quoteExpirationDateIso?: string;
  outstandingPrincipalRials: number;
  accruedInterestRials: number;
  documentedFeesRials: number;
  documentedPenaltiesRials: number;
  totalPayoffAmountRials: number;
  currency: 'IRR';
  payoffDateIso?: string;
  providerClosureConfirmationRef?: string;
  externalPaymentConfirmationRef?: string;
  securityReleaseReference?: string;
  status: PayoffLifecycleStatus;
  processedByFinancingModule: false;
  assumesCollateralReleasedOnPayoff: false;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinancingRiskIndicatorRecord {
  id: string;
  financingId: string;
  propertyId: string;
  category: FinancingRiskCategory;
  severity: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  epistemicNature: 'CONFIRMED_CONTRACTUAL_ISSUE' | 'USER_REPORTED_ISSUE' | 'POTENTIAL_RISK' | 'MISSING_INFORMATION';
  ruleReference: string;
  inputProvenance: string;
  limitations: string;
  inventsDefaultProbabilityOrCreditScore: false;
  recordedAtIso: string;
}

export interface FinancingDocumentReferenceRecord {
  id: string;
  financingId: string;
  propertyId: string;
  documentCategory:
    | 'MORTGAGE_CONTRACT'
    | 'FINANCING_APPLICATION'
    | 'LOAN_OFFER'
    | 'APPROVAL_LETTER'
    | 'REPAYMENT_SCHEDULE'
    | 'COLLATERAL_DOCUMENT'
    | 'MORTGAGE_REGISTRATION_RECORD'
    | 'REFINANCING_AGREEMENT'
    | 'PAYOFF_STATEMENT'
    | 'LOAN_CLOSURE_CONFIRMATION';
  issuingProviderName: string;
  issueDateIso?: string;
  sourceProvenance: string;
  verificationStatus: FinancingVerificationStatus;
  mediaReferenceId: string;
  restrictedConfidentiality: boolean;
  isAuthenticWithoutVerification: false;
  version: number;
  createdAt: string;
}

export interface FinancingHistoryEntryRecord {
  id: string;
  propertyId: string;
  financingOrApplicationId: string;
  entityType: string;
  actionSummary: string;
  actorUserId: string;
  provenanceReference: string;
  recordedAtIso: string;
}

export type PropertyFinancingActorRole =
  | 'PRIMARY_BORROWER'
  | 'CO_BORROWER'
  | 'PROPERTY_OWNER'
  | 'AUTHORIZED_INTERMEDIARY_OR_BROKER'
  | 'LENDER_OR_VERIFIER'
  | 'UNRELATED_USER';

export interface PropertyFinancingActorContext {
  userId: string;
  role: PropertyFinancingActorRole;
  partyId: string;
  authorizedPropertyIds?: string[];
}

export type PropertyFinancingErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'INVALID_PROPERTY_REFERENCE'
  | 'INVALID_PROVIDER_REFERENCE'
  | 'UNAUTHORIZED_FINANCING_ACCESS'
  | 'RESTRICTED_DOCUMENT_ACCESS_DENIED'
  | 'INVALID_APPLICATION_TRANSITION'
  | 'LENDER_CONFIRMATION_REQUIRED_FOR_APPROVAL_OR_FUNDING'
  | 'GUARANTOR_REQUIRES_CONTRACTUAL_DOCUMENT'
  | 'CONTRACTUAL_TERMS_CANNOT_BE_SILENTLY_OVERWRITTEN'
  | 'ESTIMATED_RATE_CANNOT_BE_MARKED_CONTRACTUAL'
  | 'PAYMENT_CONFIRMATION_REQUIRED_FOR_INSTALLMENT_PAID'
  | 'COLLATERAL_REGISTRATION_REQUIRES_OFFICIAL_REF'
  | 'ASKING_PRICE_NOT_VALID_VALUATION'
  | 'STALE_OR_MISSING_VALUATION'
  | 'PAYOFF_INITIATION_DOES_NOT_CLOSE_LOAN'
  | 'CLOSURE_REQUIRES_PROVIDER_CONFIRMATION'
  | 'CONCURRENCY_CONFLICT'
  | 'PERSISTENCE_FAILURE'
  | 'CROSS_MODULE_WRITE_FORBIDDEN';

export class PropertyFinancingError extends Error {
  constructor(
    public readonly code: PropertyFinancingErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'PropertyFinancingError';
  }
}
