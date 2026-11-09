/**
 * @file server/modules/property-insurance/domain/types.ts
 * @description Canonical domain types for the Property Insurance & Claims Management Backend
 * (`server/modules/property-insurance/`).
 */

export type InsuranceCurrencyCode = 'IRR' | 'TOMAN';

export type InsurancePolicyCategory =
  | 'RESIDENTIAL_PROPERTY_INSURANCE'
  | 'COMMERCIAL_PROPERTY_INSURANCE'
  | 'FIRE_COVERAGE'
  | 'NATURAL_DISASTER_COVERAGE'
  | 'FLOOD_COVERAGE'
  | 'EARTHQUAKE_COVERAGE'
  | 'LIABILITY_COVERAGE'
  | 'CONSTRUCTION_OR_RENOVATION_COVERAGE'
  | 'LANDLORD_INSURANCE'
  | 'OTHER_SUPPORTED_PROPERTY_INSURANCE';

export type InsurancePolicyLifecycleStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_VERIFICATION'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'NON_RENEWED'
  | 'DISPUTED'
  | 'UNKNOWN';

export type InsuranceVerificationStatus =
  | 'UNVERIFIED_USER_RECORDED'
  | 'DOCUMENT_REVIEWED_PENDING_PROVIDER'
  | 'PROVIDER_CONFIRMED_AUTHORITATIVE'
  | 'REJECTED_INVALID'
  | 'DISPUTED_VERIFICATION';

export type InsurancePartyRole =
  | 'POLICYHOLDER'
  | 'INSURED_PARTY'
  | 'ADDITIONAL_INSURED'
  | 'BENEFICIARY'
  | 'MORTGAGEE_OR_SECURED_PARTY'
  | 'AUTHORIZED_REPRESENTATIVE';

export interface InsuranceProviderReferenceRecord {
  providerId: string;
  providerCode: string;
  providerNameFa: string;
  regulatoryRegistrationRef: string | null;
  verificationStatus: 'VERIFIED_PROVIDER_ENTITY' | 'UNVERIFIED_EXTERNAL_REFERENCE';
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Section 4: Insured Party & Policyholder Distinction
 * A person purchasing or maintaining a policy must not automatically be treated as the legal owner.
 */
export interface PolicyPartyReference {
  partyId: string;
  partyRole: InsurancePartyRole;
  displayName: string;
  isVerifiedLegalOwnerOfInsuredAsset: boolean;
  ownershipVerificationNote: string;
}

/**
 * Section 8: Premiums, Deductibles and Financial References
 * Distinguishes quoted, issued, reported-paid, authoritative-confirmed-paid, outstanding, and refunded.
 */
export interface PolicyFinancialPremiumStructure {
  currency: InsuranceCurrencyCode;
  paymentFrequency: 'ANNUAL' | 'SEMI_ANNUAL' | 'QUARTERLY' | 'MONTHLY' | 'SINGLE_TERM';
  quotedPremiumAmount: number | null;
  issuedPremiumAmount: number;
  clientReportedPaidAmount: number;
  authoritativeConfirmedPaidAmount: number;
  outstandingPremiumAmount: number;
  refundedPremiumAmount: number;
  authoritativePaymentRefIds: string[];
  defaultDeductibleMethod: 'FIXED_AMOUNT' | 'PERCENTAGE_OF_LOSS';
  defaultDeductibleValue: number;
}

export interface InsurancePolicyRecord {
  policyId: string;
  providerId: string;
  externalPolicyNumber: string;
  policyCategory: InsurancePolicyCategory;
  insuredPropertyCanonicalIds: string[];
  policyholderUid: string;
  policyholderIsConfirmedPropertyOwner: boolean;
  partyReferences: PolicyPartyReference[];
  coverageStartIso: string;
  coverageEndIso: string;
  policyIssueDateIso: string;
  status: InsurancePolicyLifecycleStatus;
  verificationStatus: InsuranceVerificationStatus;
  providerConfirmedActive: boolean;
  financialStructure: PolicyFinancialPremiumStructure;
  generalCoverageTermsSummary: string;
  generalExclusionsSummary: string;
  policyDocumentMediaId: string | null;
  sourceProvenance: {
    sourceType: 'POLICYHOLDER_SUBMISSION' | 'BROKER_SUBMISSION' | 'PROVIDER_PORTAL_IMPORT' | 'ADMIN_ENTRY';
    submittedByUid: string;
    recordedAtIso: string;
  };
  previousPolicyId: string | null;
  replacementPolicyId: string | null;
  recordVersion: number;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Section 5: Coverage Structure
 */
export type RiskCoverageCategory =
  | 'FIRE'
  | 'EXPLOSION'
  | 'FLOOD'
  | 'EARTHQUAKE'
  | 'STORM'
  | 'WATER_DAMAGE'
  | 'THEFT'
  | 'VANDALISM'
  | 'STRUCTURAL_DAMAGE'
  | 'THIRD_PARTY_LIABILITY'
  | 'EQUIPMENT_DAMAGE'
  | 'OTHER_SUPPORTED_RISK';

export interface CoverageSubLimitSpec {
  subCategoryName: string;
  limitAmount: number;
}

export interface PolicyCoverageRecord {
  coverageId: string;
  policyId: string;
  coverageCategory: RiskCoverageCategory;
  insuredAssetCanonicalIds: string[];
  coverageLimitAmount: number;
  currency: InsuranceCurrencyCode;
  deductibleMethod: 'FIXED_AMOUNT' | 'PERCENTAGE_OF_LOSS';
  deductibleValue: number;
  subLimits: CoverageSubLimitSpec[];
  effectiveStartIso: string;
  effectiveEndIso: string;
  conditions: string[];
  exclusions: string[];
  specialClauses: string[];
  sourcePolicyProvisionRef: string;
  verificationStatus: InsuranceVerificationStatus;
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Section 6: Exclusions, Conditions and Limitations
 * Preserves original source wording separately from structured classifications or summaries.
 */
export type PolicyLimitationCategory =
  | 'GENERAL_EXCLUSION'
  | 'EVENT_SPECIFIC_EXCLUSION'
  | 'ASSET_SPECIFIC_EXCLUSION'
  | 'GEOGRAPHIC_LIMITATION'
  | 'TIME_LIMITATION'
  | 'MAINTENANCE_CONDITION'
  | 'OCCUPANCY_CONDITION'
  | 'SECURITY_REQUIREMENT'
  | 'DEDUCTIBLE_CONDITION'
  | 'MAXIMUM_COVERAGE_LIMIT'
  | 'SPECIAL_ENDORSEMENT'
  | 'WAITING_PERIOD';

export interface PolicyExclusionOrLimitationRecord {
  limitationId: string;
  policyId: string;
  limitationCategory: PolicyLimitationCategory;
  excludedRiskCategories: RiskCoverageCategory[];
  affectedAssetCanonicalIds: string[];
  waitingPeriodDays: number | null;
  sourcePolicyProvisionRef: string;
  originalSourceWordingVerbatim: string;
  structuredClassificationSummary: string;
  aiSummaryNeverOverridesOriginal: true;
  verificationStatus: InsuranceVerificationStatus;
  createdByUid: string;
  createdAtIso: string;
}

/**
 * Section 9 & 10: Insurance Claims Management & Claim State Machine
 */
export type InsuranceClaimLifecycleStatus =
  | 'DRAFT'
  | 'REPORTED'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'UNDER_REVIEW'
  | 'INSPECTION_REQUIRED'
  | 'ADDITIONAL_EVIDENCE_REQUIRED'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED'
  | 'SETTLEMENT_PENDING'
  | 'SETTLED'
  | 'WITHDRAWN'
  | 'CLOSED'
  | 'DISPUTED';

export interface InsuranceClaimRecord {
  claimId: string;
  policyId: string;
  insuredPropertyCanonicalIds: string[];
  claimantUid: string;
  claimEventCategory: RiskCoverageCategory;
  incidentDateIso: string;
  reportedDateIso: string;
  incidentLocationDescription: string;
  incidentDescription: string;
  initialClaimedAmount: number | null;
  currency: InsuranceCurrencyCode;
  status: InsuranceClaimLifecycleStatus;
  isVerifiedInsuredEvent: boolean;
  assignedAdjusterOrReviewerUid: string | null;
  providerExternalClaimRef: string | null;
  relatedPropertyRiskRefId: string | null;
  evidenceIds: string[];
  assessmentIds: string[];
  requiredAdditionalEvidencePrompt: string | null;
  latestDecisionSummary: {
    decisionType: 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED' | null;
    decidedByUid: string | null;
    decidedAtIso: string | null;
    decisionReason: string | null;
    verifiedEligibleLossAmount: number | null;
  };
  settlementId: string | null;
  recordVersion: number;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Section 11: Damage and Loss Assessments
 * Clearly distinguishes 6 loss dimensions and never claims to certify structural safety.
 */
export interface DamageAndLossAssessmentRecord {
  assessmentId: string;
  claimId: string;
  policyId: string;
  affectedAssetCanonicalId: string;
  damageCategory: RiskCoverageCategory;
  affectedBuildingComponent: string;
  inspectionDateIso: string;
  assessmentMethod: 'ON_SITE_PROFESSIONAL_INSPECTION' | 'DOCUMENT_AND_PHOTO_REVIEW' | 'INITIAL_CLAIMANT_REPORT';
  assessorUidOrCredentialRef: string;
  lossDimensions: {
    reportedPhysicalDamageText: string;
    observedPhysicalDamageText: string | null;
    professionallyAssessedDamageText: string | null;
    estimatedRepairCostAmount: number | null;
    estimatedReplacementCostAmount: number | null;
    verifiedEligibleLossAmount: number | null;
    insuranceApprovedSettlementAmount: number | null;
  };
  supportingEvidenceIds: string[];
  assessmentLimitations: string[];
  confidenceClassification: 'HIGH_PROFESSIONAL' | 'MODERATE_OBSERVED' | 'LOW_PRELIMINARY' | 'DISPUTED_CONFLICTING';
  doesNotCertifyStructuralSafety: true;
  assessmentVersion: number;
  reviewStatus: 'RECORDED' | 'VERIFIED_BY_ADJUSTER' | 'DISPUTED_BY_COUNTER_ASSESSMENT';
  createdAtIso: string;
}

/**
 * Section 12: Claim Evidence and Document References
 * Uses Media module IDs; never stores raw binaries; never treats upload/OCR as proof of authenticity.
 */
export type InsuranceEvidenceCategory =
  | 'INSURANCE_POLICY_DOCUMENT'
  | 'POLICY_ENDORSEMENT'
  | 'INCIDENT_PHOTOGRAPH'
  | 'INCIDENT_VIDEO'
  | 'INSPECTION_REPORT'
  | 'REPAIR_ESTIMATE'
  | 'REPAIR_INVOICE'
  | 'OFFICIAL_INCIDENT_REPORT'
  | 'THIRD_PARTY_STATEMENT'
  | 'PROVIDER_CORRESPONDENCE'
  | 'SETTLEMENT_DOCUMENT';

export interface InsuranceEvidenceRecord {
  evidenceId: string;
  policyId: string;
  claimId: string | null;
  evidenceCategory: InsuranceEvidenceCategory;
  mediaId: string;
  originalDocumentReference: string;
  sourceUploadedByUid: string;
  receivedAtIso: string;
  verificationStatus:
    | 'UPLOADED_UNVERIFIED'
    | 'OCR_EXTRACTED_UNVERIFIED'
    | 'REVIEWER_VERIFIED'
    | 'PROVIDER_AUTHENTICATED'
    | 'REJECTED_INAUTHENTIC';
  reviewerUid: string | null;
  reviewedAtIso: string | null;
  knownLimitations: string[];
}

/**
 * Section 13: Claim Settlement and Recovery References
 */
export type ClaimSettlementStatus =
  | 'SETTLEMENT_APPROVED'
  | 'SETTLEMENT_SCHEDULED'
  | 'SETTLEMENT_PAYMENT_INITIATED'
  | 'SETTLEMENT_PAYMENT_CONFIRMED'
  | 'SETTLEMENT_PAYMENT_DISPUTED';

export interface ClaimSettlementRecord {
  settlementId: string;
  claimId: string;
  policyId: string;
  currency: InsuranceCurrencyCode;
  verifiedEligibleLossAmount: number;
  deductibleAppliedAmount: number;
  approvedSettlementAmount: number;
  rejectedAmount: number;
  partiallyApprovedFlag: boolean;
  disputedSettlementAmount: number | null;
  settlementDecisionReference: string;
  settlementDateIso: string;
  authoritativePaymentRefId: string | null;
  settlementStatus: ClaimSettlementStatus;
  reconsiderationOrAppealRef: string | null;
  recordedByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Section 14: Renewals and Policy Continuity
 */
export interface PolicyRenewalRecord {
  renewalId: string;
  previousPolicyId: string;
  replacementPolicyId: string | null;
  renewalEligibilityStatus: 'ELIGIBLE_FOR_RENEWAL' | 'CONDITIONAL_UNDERWRITING_REQUIRED' | 'INELIGIBLE_NON_RENEWED';
  renewalQuotationReference: string | null;
  proposedCoverageStartIso: string;
  proposedCoverageEndIso: string;
  proposedPremiumAmount: number;
  currency: InsuranceCurrencyCode;
  coverageChangesSummary: string;
  updatedExclusionsSummary: string;
  renewalStatus:
    | 'REMINDER_RECORDED_NOT_RENEWED'
    | 'QUOTATION_PROPOSED'
    | 'ACCEPTED_AUTHORITATIVE_RENEWED'
    | 'REJECTED_BY_POLICYHOLDER'
    | 'DECLINED_BY_PROVIDER';
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface InsuranceLifecycleHistoryEntry {
  historyId: string;
  targetType: 'POLICY' | 'CLAIM';
  targetId: string;
  previousState: string | null;
  newState: string;
  actorUid: string;
  actorRole: string;
  reason: string;
  supportingEvidenceIds: string[];
  verificationStatus: InsuranceVerificationStatus;
  timestampIso: string;
}
