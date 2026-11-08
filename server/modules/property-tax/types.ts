export type TaxAuthorityType =
  | 'NATIONAL_TAX_AUTHORITY'
  | 'REGIONAL_TAX_AUTHORITY'
  | 'MUNICIPAL_GOVERNMENT'
  | 'LOCAL_PROPERTY_ASSESSMENT_AUTHORITY'
  | 'MUNICIPAL_SERVICE_AUTHORITY'
  | 'OTHER_SUPPORTED_AUTHORITY';

export type TaxAuthorityVerificationStatus =
  | 'USER_REPORTED_AUTHORITY'
  | 'DOCUMENTED_AUTHORITY'
  | 'VERIFIED_AUTHORITY'
  | 'UNKNOWN_AUTHORITY_STATUS';

export type TaxRecordVerificationStatus =
  | 'UNVERIFIED_USER_REPORTED'
  | 'DOCUMENT_SUPPORTED_UNVERIFIED'
  | 'OFFICIALLY_VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'CONFLICTING_RECORDS'
  | 'UNKNOWN';

export type PropertyTaxCategory =
  | 'ANNUAL_PROPERTY_TAX'
  | 'MUNICIPAL_PROPERTY_TAX'
  | 'LAND_TAX'
  | 'PROPERTY_RELATED_LOCAL_LEVY'
  | 'BUILDING_RELATED_MUNICIPAL_CHARGE'
  | 'PROPERTY_TRANSFER_TAX_REFERENCE'
  | 'RENTAL_RELATED_TAX_REFERENCE'
  | 'VACANT_PROPERTY_TAX_REFERENCE'
  | 'OTHER_SUPPORTED_PROPERTY_TAX';

export type TaxAssessmentClassification =
  | 'OFFICIAL_ASSESSMENT'
  | 'PRELIMINARY_ASSESSMENT'
  | 'ESTIMATED_ASSESSMENT'
  | 'USER_REPORTED_ASSESSMENT'
  | 'DISPUTED_ASSESSMENT'
  | 'UNVERIFIED_ASSESSMENT';

export type TaxAssessmentStatus = 'ACTIVE' | 'PRELIMINARY' | 'DISPUTED' | 'CORRECTED' | 'SUPERSEDED' | 'CANCELLED';

export type TaxObligationStatus =
  | 'DRAFT'
  | 'REPORTED'
  | 'ASSESSED'
  | 'DUE'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'DISPUTED'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'WAIVED'
  | 'UNKNOWN';

export type TaxObligationEpistemicClassification =
  | 'OFFICIALLY_ASSESSED_OBLIGATION'
  | 'USER_REPORTED_OBLIGATION'
  | 'ESTIMATED_OBLIGATION'
  | 'DISPUTED_OBLIGATION'
  | 'UNKNOWN_OBLIGATION';

export type TaxBillStatus =
  | 'REGISTERED_UNVERIFIED'
  | 'VERIFIED_ISSUED'
  | 'SUPPLEMENTAL'
  | 'REISSUED'
  | 'CORRECTED'
  | 'DISPUTED'
  | 'PAID_CONFIRMED'
  | 'CANCELLED';

export type MunicipalChargeCategory =
  | 'MUNICIPAL_SERVICE_CHARGE'
  | 'WASTE_COLLECTION_CHARGE'
  | 'LOCAL_INFRASTRUCTURE_LEVY'
  | 'BUILDING_RELATED_MUNICIPAL_CHARGE'
  | 'PROPERTY_RELATED_SERVICE_FEE'
  | 'MUNICIPAL_MAINTENANCE_CHARGE'
  | 'OTHER_DOCUMENTED_LOCAL_CHARGE';

export type MunicipalFinancialNature =
  | 'TAX'
  | 'MUNICIPAL_SERVICE_CHARGE'
  | 'FEE'
  | 'LEVY'
  | 'PENALTY'
  | 'UTILITY_BILL_REFERENCE';

export type TaxPaymentStatusClassification =
  | 'PAYMENT_REPORTED_BY_USER'
  | 'PAYMENT_RECEIPT_UPLOADED'
  | 'PAYMENT_SUBMITTED'
  | 'PAYMENT_CONFIRMED_BY_AUTHORITY'
  | 'PAYMENT_PARTIALLY_CONFIRMED'
  | 'PAYMENT_DISPUTED'
  | 'PAYMENT_REVERSED'
  | 'REFUND_RECORDED';

export type TaxDeadlineType =
  | 'ASSESSMENT_PAYMENT_DEADLINE'
  | 'FILING_DEADLINE'
  | 'APPEAL_DEADLINE'
  | 'EXEMPTION_APPLICATION_DEADLINE'
  | 'RENEWAL_OR_REASSESSMENT_DEADLINE'
  | 'MUNICIPAL_CHARGE_DEADLINE'
  | 'DOCUMENT_SUBMISSION_DEADLINE';

export type TaxDeadlineEpistemicBasis =
  | 'OFFICIAL_DEADLINE'
  | 'USER_ENTERED_DEADLINE'
  | 'ESTIMATED_DEADLINE'
  | 'UNVERIFIED_DEADLINE';

export type TaxExemptionCategory =
  | 'PROPERTY_TAX_EXEMPTION'
  | 'OWNER_OCCUPIER_RELIEF'
  | 'DISABILITY_RELATED_EXEMPTION_REFERENCE'
  | 'SENIOR_RELATED_EXEMPTION_REFERENCE'
  | 'AGRICULTURAL_PROPERTY_EXEMPTION'
  | 'HISTORIC_PROPERTY_EXEMPTION'
  | 'LOW_INCOME_RELIEF'
  | 'TEMPORARY_RELIEF'
  | 'OTHER_JURISDICTION_SPECIFIC_EXEMPTION';

export type TaxExemptionLifecycleStatus =
  | 'POTENTIAL_ELIGIBILITY'
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_PENDING'
  | 'APPROVED_EXEMPTION'
  | 'REJECTED_EXEMPTION'
  | 'EXPIRED_EXEMPTION'
  | 'UNVERIFIED_EXEMPTION';

export type TaxDisputeStatus =
  | 'DRAFT'
  | 'PREPARING'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'UNDER_REVIEW'
  | 'ADDITIONAL_INFORMATION_REQUIRED'
  | 'ACCEPTED'
  | 'PARTIALLY_ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'RESOLVED'
  | 'CLOSED'
  | 'UNKNOWN';

export type TaxResponsiblePartyRole =
  | 'TAXPAYER'
  | 'PROPERTY_OWNER'
  | 'CO_OWNER'
  | 'LEGAL_REPRESENTATIVE'
  | 'PROPERTY_MANAGER'
  | 'AUTHORIZED_TAX_AGENT'
  | 'TENANT_LEGALLY_RELEVANT'
  | 'OTHER_SUPPORTED_ROLE';

export type TaxDocumentCategory =
  | 'TAX_ASSESSMENT_NOTICE'
  | 'PROPERTY_TAX_BILL'
  | 'PAYMENT_RECEIPT'
  | 'EXEMPTION_APPROVAL'
  | 'TAX_AUTHORITY_CORRESPONDENCE'
  | 'APPEAL_SUBMISSION'
  | 'APPEAL_DECISION'
  | 'MUNICIPAL_CHARGE_NOTICE'
  | 'REFUND_DOCUMENT'
  | 'OTHER_OFFICIAL_TAX_DOCUMENT';

export type TaxHistoryClassification =
  | 'ORIGINAL_RECORD'
  | 'CORRECTED_RECORD'
  | 'SUPERSEDED_RECORD'
  | 'REVERSED_RECORD'
  | 'DISPUTED_RECORD';

export interface TaxJurisdictionRef {
  citySlug: string;
  districtCode?: string;
  legalRegulatorySourceRef?: string;
}

export interface TaxPeriodRange {
  fiscalYearLabel: string;
  periodStartIso: string;
  periodEndIso: string;
}

export interface TaxAuthorityReferenceRecord {
  id: string;
  authorityName: string;
  authorityType: TaxAuthorityType;
  jurisdiction: TaxJurisdictionRef;
  officialSourceReference?: string;
  verifiedContactReference?: string;
  verificationStatus: TaxAuthorityVerificationStatus;
  sourceProvenance: string;
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyTaxRecord {
  id: string;
  propertyId: string;
  taxAuthorityId: string;
  jurisdiction: TaxJurisdictionRef;
  taxCategory: PropertyTaxCategory;
  taxpayerPartyId: string;
  taxPeriod: TaxPeriodRange;
  latestAssessmentId?: string;
  taxAccountReference?: string;
  recordStatus: 'ACTIVE' | 'ARCHIVED' | 'DISPUTED' | 'SUPERSEDED';
  sourceDocumentId?: string;
  verificationStatus: TaxRecordVerificationStatus;
  provesLegalOwnership: false;
  isSyntheticTestFixture: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxAssessmentRecord {
  id: string;
  propertyTaxRecordId: string;
  propertyId: string;
  taxAuthorityId: string;
  assessmentPeriod: TaxPeriodRange;
  assessmentDateIso: string;
  documentedTaxableValueRials?: number;
  assessedAmountRials: number;
  currency: 'IRR';
  assessmentBasis: string;
  assessmentMethodReference?: string;
  officialAssessmentIdentifier?: string;
  sourceDocumentId?: string;
  classification: TaxAssessmentClassification;
  verificationStatus: TaxRecordVerificationStatus;
  status: TaxAssessmentStatus;
  supersededByAssessmentId?: string;
  supersedesAssessmentId?: string;
  usesPlatformValuationAsOfficialAssessment: false;
  assumesMarketValueEqualsTaxableValue: false;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxObligationRecord {
  id: string;
  propertyId: string;
  propertyTaxRecordId: string;
  assessmentId?: string;
  taxCategory: PropertyTaxCategory;
  taxPeriod: TaxPeriodRange;
  originalAmountRials: number;
  confirmedPaidAmountRials: number;
  currency: 'IRR';
  dueDateIso: string;
  status: TaxObligationStatus;
  epistemicClassification: TaxObligationEpistemicClassification;
  sourceReference: string;
  verificationStatus: TaxRecordVerificationStatus;
  collectionSuspendedByAuthority: boolean;
  isLegallyDueByUserEntryAlone: false;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxBillRecord {
  id: string;
  taxAuthorityId: string;
  propertyId: string;
  propertyTaxRecordId: string;
  obligationId?: string;
  taxpayerPartyId: string;
  taxAccountReference?: string;
  taxPeriod: TaxPeriodRange;
  issueDateIso: string;
  dueDateIso: string;
  originalAmountRials: number;
  adjustmentsRials: number;
  officiallyDocumentedPenaltiesRials: number;
  officiallyDocumentedFeesRials: number;
  totalPayableRials: number;
  currency: 'IRR';
  billKind: 'INITIAL' | 'CORRECTED' | 'SUPPLEMENTAL' | 'REISSUED';
  replacesBillId?: string;
  disputeId?: string;
  sourceDocumentId?: string;
  verificationStatus: TaxRecordVerificationStatus;
  status: TaxBillStatus;
  isAuthenticByUploadAlone: false;
  duplicatesPaymentsLedger: false;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MunicipalChargeRecord {
  id: string;
  taxAuthorityId: string;
  propertyId: string;
  chargeCategory: MunicipalChargeCategory;
  financialNature: MunicipalFinancialNature;
  chargePeriod: TaxPeriodRange;
  amountRials: number;
  currency: 'IRR';
  dueDateIso: string;
  chargeBasis: string;
  sourceSupportsTaxClassification: boolean;
  sourceReference: string;
  verificationStatus: TaxRecordVerificationStatus;
  status: 'REPORTED' | 'VERIFIED_DUE' | 'PAID_CONFIRMED' | 'DISPUTED' | 'CANCELLED';
  duplicatesUtilityBillingSystem: false;
  createdAt: string;
  updatedAt: string;
}

export interface TaxPaymentStatusReferenceRecord {
  id: string;
  propertyId: string;
  obligationId: string;
  billId?: string;
  amountRials: number;
  currency: 'IRR';
  paymentDateIso: string;
  paymentMethodReference: string;
  authorityReceiptReference?: string;
  externalPaymentsModuleRef?: string;
  receiptDocumentId?: string;
  paymentStatus: TaxPaymentStatusClassification;
  sourceProvenance: string;
  verificationStatus: TaxRecordVerificationStatus;
  processedByTaxModule: false;
  storesPaymentCredentials: false;
  createdAt: string;
  updatedAt: string;
}

export interface TaxDeadlineRecord {
  id: string;
  propertyId: string;
  relatedRecordType: 'TAX_RECORD' | 'ASSESSMENT' | 'OBLIGATION' | 'BILL' | 'EXEMPTION' | 'DISPUTE' | 'MUNICIPAL_CHARGE';
  relatedRecordId: string;
  deadlineType: TaxDeadlineType;
  dueDateIso: string;
  jurisdiction: TaxJurisdictionRef;
  epistemicBasis: TaxDeadlineEpistemicBasis;
  sourceReference: string;
  verificationStatus: TaxRecordVerificationStatus;
  reminderEligible: boolean;
  reminderConfirmedByNotificationsModule: boolean;
  extensionConfirmedByAuthoritativeSource: boolean;
  status: 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'SATISFIED' | 'EXTENDED_BY_AUTHORITY' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface TaxExemptionRecord {
  id: string;
  propertyId: string;
  propertyTaxRecordId: string;
  taxpayerPartyId: string;
  taxAuthorityId: string;
  exemptionCategory: TaxExemptionCategory;
  eligibilityCriteriaReference: string;
  applicationDateIso?: string;
  effectivePeriod: TaxPeriodRange;
  documentedExemptionAmountRials?: number;
  documentedExemptionPercentage?: number;
  status: TaxExemptionLifecycleStatus;
  officialApprovalReference?: string;
  sourceDocumentId?: string;
  verificationStatus: TaxRecordVerificationStatus;
  determinedFromDemographicsAlone: false;
  autoAppliedWithoutApproval: false;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxDisputeRecord {
  id: string;
  propertyId: string;
  relatedRecordType: 'ASSESSMENT' | 'OBLIGATION' | 'BILL';
  relatedRecordId: string;
  taxAuthorityId: string;
  disputeCategory: string;
  submissionDateIso?: string;
  appealDeadlineIso?: string;
  groundsReference: string;
  supportingDocumentIds: string[];
  status: TaxDisputeStatus;
  officialCaseReference?: string;
  resolutionReference?: string;
  resolutionSummary?: string;
  sourceProvenance: string;
  suspensionConfirmedByAuthority: boolean;
  providesLegalAdvice: false;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxPartyRelationshipRecord {
  id: string;
  propertyTaxRecordId: string;
  propertyId: string;
  partyId: string;
  role: TaxResponsiblePartyRole;
  effectiveStartIso: string;
  effectiveEndIso?: string;
  authorizationReference: string;
  legalOrContractualLiabilityBasisRef?: string;
  verificationStatus: TaxRecordVerificationStatus;
  sourceDocumentId?: string;
  inferredLiabilityFromOwnershipAlone: false;
  createdAt: string;
  updatedAt: string;
}

export interface TaxDocumentReferenceRecord {
  id: string;
  propertyId: string;
  relatedTaxRecordId: string;
  documentCategory: TaxDocumentCategory;
  issuingAuthorityName: string;
  issueDateIso?: string;
  sourceProvenance: string;
  verificationStatus: TaxRecordVerificationStatus;
  mediaReferenceId: string;
  restrictedConfidentiality: boolean;
  isAuthenticWithoutVerification: false;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxHistoryEntryRecord {
  id: string;
  propertyId: string;
  entityType: 'TAX_RECORD' | 'ASSESSMENT' | 'OBLIGATION' | 'BILL' | 'PAYMENT' | 'EXEMPTION' | 'DISPUTE' | 'MUNICIPAL_CHARGE';
  entityId: string;
  historyClassification: TaxHistoryClassification;
  actionSummary: string;
  actorUserId: string;
  previousSnapshot?: Record<string, unknown>;
  newSnapshot?: Record<string, unknown>;
  provenanceReference: string;
  recordedAtIso: string;
}

export interface PropertyTaxReportingSummary {
  propertyId: string;
  generatedAtIso: string;
  hasAnyRecordedTaxData: boolean;
  missingInformationSummary: string[];
  conflictingRecordIds: string[];
  officiallyVerifiedObligationsTotalRials: number;
  officiallyConfirmedPaidTotalRials: number;
  officiallyConfirmedUnpaidTotalRials: number;
  userReportedUnverifiedObligationsTotalRials: number;
  estimatedObligationsTotalRials: number;
  municipalChargesSummary: {
    verifiedChargesTotalRials: number;
    unverifiedReportedChargesTotalRials: number;
    chargeCount: number;
  };
  upcomingDeadlinesCount: number;
  overdueRecordsCount: number;
  activeApprovedExemptionsCount: number;
  pendingOrUnverifiedExemptionsCount: number;
  openDisputesCount: number;
  missingRecordsMeanNoTaxLiability: false;
  combinesUnrelatedPropertyExpenses: false;
}

export type PropertyTaxActorRole =
  | 'PROPERTY_OWNER'
  | 'TAXPAYER'
  | 'AUTHORIZED_REPRESENTATIVE_OR_AGENT'
  | 'PROPERTY_MANAGER'
  | 'TENANT_WITH_LEGAL_BASIS'
  | 'AUTHORITY_VERIFIER_OR_ADMIN'
  | 'UNRELATED_USER';

export interface PropertyTaxActorContext {
  userId: string;
  role: PropertyTaxActorRole;
  partyId: string;
  authorizedPropertyIds?: string[];
}

export type PropertyTaxErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'INVALID_PROPERTY_REFERENCE'
  | 'INVALID_AUTHORITY_REFERENCE'
  | 'UNAUTHORIZED_TAX_ACCESS'
  | 'RESTRICTED_TAX_DOCUMENT_DENIED'
  | 'PLATFORM_VALUATION_NOT_OFFICIAL_ASSESSMENT'
  | 'USER_REPORTED_AMOUNT_NOT_LEGALLY_DUE'
  | 'INVALID_OBLIGATION_TRANSITION'
  | 'INVALID_MUNICIPAL_CHARGE_CLASSIFICATION'
  | 'RECEIPT_UPLOAD_DOES_NOT_CONFIRM_PAYMENT'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'UNVERIFIED_OFFICIAL_DEADLINE_REJECTED'
  | 'EXEMPTION_APPROVAL_REQUIRES_VERIFIER'
  | 'APPEAL_SUBMISSION_REQUIRES_OFFICIAL_REF'
  | 'TENANT_LIABILITY_REQUIRES_LEGAL_SOURCE'
  | 'CONCURRENCY_CONFLICT'
  | 'PERSISTENCE_FAILURE'
  | 'CROSS_MODULE_WRITE_FORBIDDEN';

export class PropertyTaxError extends Error {
  constructor(
    public readonly code: PropertyTaxErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'PropertyTaxError';
  }
}
