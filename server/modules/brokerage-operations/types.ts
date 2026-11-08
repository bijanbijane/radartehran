export type BrokerageOrganizationType =
  | 'INDEPENDENT_REAL_ESTATE_AGENCY'
  | 'BROKERAGE_COMPANY'
  | 'PROPERTY_CONSULTANCY'
  | 'COMMERCIAL_PROPERTY_BROKERAGE'
  | 'RENTAL_AND_LEASING_AGENCY';

export type OrganizationOperatingStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'RESTRICTED'
  | 'CLOSED';

export type OrganizationVerificationStatus =
  | 'SELF_REPORTED'
  | 'DOCUMENTED'
  | 'INDEPENDENTLY_VERIFIED'
  | 'EXPIRED_OR_REVOKED'
  | 'UNVERIFIED';

export interface BrokerageJurisdictionRef {
  countryCode?: string;
  provinceCode?: string;
  citySlug: string;
  districtCode?: string;
  neighborhoodIdOrSlug?: string;
}

export interface BrokerageOrganizationRecord {
  id: string;
  officialRegisteredName?: string;
  displayName: string;
  organizationType: BrokerageOrganizationType;
  registrationReference?: string;
  professionalLicenseReference?: string;
  jurisdiction: BrokerageJurisdictionRef;
  primaryOfficeBranchId?: string;
  branchIds: string[];
  authorizedRepresentativeUserIds: string[];
  operatingStatus: OrganizationOperatingStatus;
  verificationStatus: OrganizationVerificationStatus;
  contactInfo: {
    phone: string;
    email: string;
    website?: string;
  };
  sourceProvenance: string;
  isSyntheticTestFixture: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type BranchOperationalStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export interface AgencyBranchHistoryEntry {
  changedAt: string;
  changedByUserId: string;
  action: string;
  summary: string;
}

export interface AgencyBranchRecord {
  id: string;
  parentOrganizationId: string;
  branchName: string;
  addressReference: string;
  jurisdiction: BrokerageJurisdictionRef;
  branchManagerProfileId?: string;
  contactInfo: {
    phone: string;
    email: string;
  };
  operationalStatus: BranchOperationalStatus;
  openingDateIso?: string;
  closingDateIso?: string;
  authorizationReferences: string[];
  history: AgencyBranchHistoryEntry[];
  isSyntheticTestFixture: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ProfessionalRoleCategory =
  | 'REAL_ESTATE_AGENT'
  | 'LICENSED_BROKER'
  | 'BRANCH_MANAGER'
  | 'AGENCY_SUPERVISOR'
  | 'RENTAL_SPECIALIST'
  | 'COMMERCIAL_PROPERTY_SPECIALIST'
  | 'PROPERTY_CONSULTANT';

export type QualificationStatus =
  | 'SELF_REPORTED'
  | 'DOCUMENTED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'REJECTED'
  | 'UNKNOWN';

export interface ProfessionalProfileRecord {
  id: string;
  userIdentityRef: string;
  displayName: string;
  organizationIds: string[];
  branchIds: string[];
  professionalRole: ProfessionalRoleCategory;
  qualificationIds: string[];
  specializations: string[];
  serviceLanguages: string[];
  geographicServiceAreas: BrokerageJurisdictionRef[];
  experienceClaims: { summary: string; provenance: 'SELF_REPORTED' | 'VERIFIED' }[];
  profileVerificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'RESTRICTED';
  professionalStatus: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  publicVisibility: 'PUBLIC_SUMMARY' | 'PRIVATE_INTERNAL';
  privateContactEmail?: string;
  isSyntheticTestFixture: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProfessionalQualificationRecord {
  id: string;
  professionalProfileId: string;
  qualificationCategory: string;
  issuingAuthorityRef: string;
  licenseOrCertificateNumber: string;
  jurisdiction: BrokerageJurisdictionRef;
  issueDateIso: string;
  expirationDateIso?: string;
  status: QualificationStatus;
  verificationMethod?: string;
  supportingEvidenceIds: string[];
  sourceUrl?: string;
  lastVerifiedAtIso?: string;
  reviewerUserId?: string;
  verificationHistory: {
    changedAt: string;
    changedByUserId: string;
    previousStatus: QualificationStatus;
    newStatus: QualificationStatus;
    notes: string;
  }[];
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AffiliationStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

export interface OrganizationAgentAffiliationRecord {
  id: string;
  organizationId: string;
  branchId?: string;
  professionalProfileId: string;
  userIdentityRef: string;
  roleWithinOrganization: ProfessionalRoleCategory;
  startDateIso: string;
  endDateIso?: string;
  affiliationStatus: AffiliationStatus;
  authorityPermissions: string[];
  supervisingProfessionalProfileId?: string;
  supportingAgreementRef?: string;
  recordedByUserId: string;
  history: {
    changedAt: string;
    changedByUserId: string;
    action: string;
    summary: string;
  }[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type MandateCategory =
  | 'SELLER_REPRESENTATION'
  | 'BUYER_REPRESENTATION'
  | 'LANDLORD_REPRESENTATION'
  | 'TENANT_REPRESENTATION'
  | 'RENTAL_MARKETING_MANDATE'
  | 'PROPERTY_MANAGEMENT_REFERRAL_MANDATE'
  | 'COMMERCIAL_LEASING_MANDATE'
  | 'PROPERTY_CONSULTATION_ENGAGEMENT';

export type MandateLifecycleStatus =
  | 'CLIENT_INQUIRY'
  | 'PROPOSED_REPRESENTATION'
  | 'MANDATE_DRAFT'
  | 'ACCEPTED_BY_CLIENT'
  | 'VERIFIED_AGAINST_EVIDENCE'
  | 'EXPIRED'
  | 'TERMINATED';

export type PermittedMandateAction =
  | 'CONTACT_COUNTERPARTIES'
  | 'PUBLISH_OR_PROMOTE_LISTING'
  | 'ARRANGE_PROPERTY_VISITS'
  | 'SHARE_APPROVED_PROPERTY_INFO'
  | 'RECEIVE_AND_TRANSMIT_OFFERS'
  | 'COORDINATE_NEGOTIATIONS'
  | 'COMMUNICATE_AGREED_TERMS'
  | 'COORDINATE_DOCUMENTATION'
  | 'PROVIDE_PROPERTY_CONSULTATION'
  // Restricted actions that MUST NEVER be inferred:
  | 'SIGN_CONTRACT_ON_BEHALF_OF_CLIENT'
  | 'TRANSFER_OWNERSHIP'
  | 'RECEIVE_OR_HOLD_CLIENT_FUNDS'
  | 'ACCEPT_BINDING_OFFER'
  | 'CHANGE_CONTRACTUAL_TERMS'
  | 'MAKE_LEGAL_DECLARATIONS';

export const NON_INFERRABLE_RESTRICTED_ACTIONS = new Set<PermittedMandateAction>([
  'SIGN_CONTRACT_ON_BEHALF_OF_CLIENT',
  'TRANSFER_OWNERSHIP',
  'RECEIVE_OR_HOLD_CLIENT_FUNDS',
  'ACCEPT_BINDING_OFFER',
  'CHANGE_CONTRACTUAL_TERMS',
  'MAKE_LEGAL_DECLARATIONS',
]);

export interface MandateAuthorityScopeRecord {
  id: string;
  mandateId: string;
  authorizedAction: PermittedMandateAction;
  grantingPartyId: string;
  effectiveStartIso: string;
  effectiveEndIso?: string;
  conditions?: string;
  restrictions?: string;
  supportingEvidenceIds: string[];
  verificationStatus: 'UNVERIFIED' | 'EXPLICITLY_VERIFIED';
}

export interface RepresentationMandateRecord {
  id: string;
  clientPartyId: string;
  organizationId: string;
  assignedProfessionalProfileId?: string;
  propertyId?: string;
  mandateCategory: MandateCategory;
  serviceScopeSummary: string;
  exclusivity: 'NON_EXCLUSIVE' | 'EXCLUSIVE_AGENCY' | 'EXCLUSIVE_RIGHT_TO_REPRESENT';
  geographicOrAssetScope: string;
  effectiveStartIso: string;
  expirationDateIso: string;
  authorityLimitations: string[];
  authorityScopes: MandateAuthorityScopeRecord[];
  commissionAgreementId?: string;
  supportingContractEvidenceIds: string[];
  clientAcceptedAtIso?: string;
  clientAcceptedByUserId?: string;
  status: MandateLifecycleStatus;
  grantsTransactionExecutionAuthority: false;
  version: number;
  versionHistory: {
    version: number;
    changedAt: string;
    changedByUserId: string;
    status: MandateLifecycleStatus;
    scopeSummary: string;
  }[];
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AssignmentWorkloadStatus =
  | 'ASSIGNED_PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface AgentAssignmentRecord {
  id: string;
  organizationId: string;
  branchId?: string;
  professionalProfileId: string;
  mandateId?: string;
  transactionRef?: string;
  assignmentType:
    | 'PROPERTY_MARKETING'
    | 'BUYER_REPRESENTATION'
    | 'TENANT_REPRESENTATION'
    | 'TRANSACTION_COORDINATION'
    | 'PROPERTY_CONSULTATION'
    | 'INTERNAL_AGENCY_TASK';
  responsibilitiesSummary: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  startDateIso: string;
  endDateIso?: string;
  workloadStatus: AssignmentWorkloadStatus;
  supervisorProfileId?: string;
  reassignmentHistory: {
    reassignedAt: string;
    fromProfessionalProfileId: string;
    toProfessionalProfileId: string;
    reassignedByUserId: string;
    reason: string;
  }[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type CompensationModelType =
  | 'FIXED_FEE'
  | 'PERCENTAGE_COMMISSION'
  | 'TIERED_COMMISSION'
  | 'RENTAL_SERVICE_FEE'
  | 'CONSULTATION_FEE'
  | 'SHARED_COMMISSION'
  | 'REFERRAL_FEE';

export type CommissionLifecycleState =
  | 'PROPOSED_TERMS'
  | 'ACCEPTED_AGREEMENT'
  | 'EARNED_PER_AGREEMENT'
  | 'CALCULATED'
  | 'INVOICED_OR_REQUESTED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_CONFIRMED'
  | 'DISPUTED_OR_REVERSED';

export interface InternalCommissionAllocationRecord {
  id: string;
  commissionAgreementId: string;
  beneficiaryId: string;
  beneficiaryRole: 'ORGANIZATION' | 'BRANCH' | 'LEAD_AGENT' | 'SUPPORTING_AGENT' | 'REFERRING_AGENCY';
  allocationMethod: 'PERCENTAGE' | 'FIXED_AMOUNT';
  percentageOrAmount: number;
  calculationBasis: string;
  approvalStatus: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  supportingAgreementRef: string;
}

export interface CommissionAgreementRecord {
  id: string;
  mandateId: string;
  organizationId: string;
  professionalProfileId?: string;
  payerPartyId: string;
  beneficiaryIds: string[];
  compensationModel: CompensationModelType;
  ratePercentage?: number;
  fixedAmountRials?: number;
  tieredRules?: { upToAmountRials: number; ratePercentage: number }[];
  currency: 'IRR';
  applicableTransactionType: 'SALE' | 'PURCHASE' | 'RENTAL_LEASE' | 'CONSULTATION';
  calculationBasisDescription: string;
  earningConditions: string;
  paymentDueConditions: string;
  effectiveStartIso: string;
  effectiveEndIso?: string;
  sourceAgreementEvidenceIds: string[];
  lifecycleState: CommissionLifecycleState;
  financialSeparation: {
    agreedAmountRials?: number;
    calculatedAmountRials?: number;
    invoicedAmountRials?: number;
    reportedPaymentAmountRials?: number;
    authoritativelyConfirmedPaymentAmountRials?: number;
    disputedAmountRials?: number;
    refundedAmountRials?: number;
    authoritativePaymentReceiptRef?: string;
  };
  allocations: InternalCommissionAllocationRecord[];
  version: number;
  versionHistory: {
    version: number;
    amendedAt: string;
    amendedByUserId: string;
    lifecycleState: CommissionLifecycleState;
    ratePercentage?: number;
    fixedAmountRials?: number;
    reason: string;
  }[];
  processedByPlatform: false;
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientEngagementRecord {
  id: string;
  clientPartyId: string;
  organizationId: string;
  assignedProfessionalProfileId: string;
  engagementCategory: 'BUYER_INQUIRY' | 'SELLER_INQUIRY' | 'TENANT_INQUIRY' | 'LANDLORD_INQUIRY' | 'CONSULTATION';
  propertyId?: string;
  mandateId?: string;
  originChannel: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'FOLLOW_UP_SCHEDULED' | 'TRANSFERRED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  nextActionSummary?: string;
  lastInteractionAtIso: string;
  communicationConsent: {
    consentGranted: boolean;
    allowedChannels: ('PHONE' | 'SMS' | 'IN_APP_NOTIFICATION' | 'EMAIL')[];
    consentReferenceId: string;
  };
  interactionNotes: { recordedAt: string; recordedByUserId: string; summary: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface SupervisionReviewRecord {
  id: string;
  organizationId: string;
  targetType: 'ORGANIZATION' | 'PROFESSIONAL' | 'MANDATE' | 'ASSIGNMENT' | 'COMMISSION';
  targetId: string;
  supervisorProfileId: string;
  reviewScopeSummary: string;
  findingsSummary: string;
  evidenceIds: string[];
  reviewStatus: 'OPEN' | 'ACTION_REQUIRED' | 'RESOLVED' | 'ESCALATED_TO_TRUST_AND_SAFETY';
  requiredCorrectiveActions: string[];
  escalatedTrustAndSafetyCaseRef?: string;
  legalRegulatoryRuleRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OperationalMetricItem {
  metricKey: string;
  metricDefinition: string;
  value: number;
  measurementPeriod: { fromIso: string; toIso: string };
  includedRecordsCriteria: string;
  excludedRecordsCriteria: string;
  sourceModule: 'server/modules/brokerage-operations';
  calculatedAtIso: string;
  dataCompletenessLimitations: string;
}

export interface OrganizationOperationalReport {
  organizationId: string;
  generatedAtIso: string;
  metrics: Record<string, OperationalMetricItem>;
}

export type BrokerageActorRole =
  | 'ORG_ADMIN'
  | 'BRANCH_MANAGER'
  | 'SUPERVISOR'
  | 'PROFESSIONAL_AGENT'
  | 'CLIENT'
  | 'COMPLIANCE_VERIFIER'
  | 'AUDITOR_READ_ONLY';

export interface BrokerageActorContext {
  userId: string;
  role: BrokerageActorRole;
  organizationId?: string;
  branchId?: string;
  professionalProfileId?: string;
}

export type BrokerageOpsErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'JURISDICTION_MISMATCH'
  | 'INSUFFICIENT_PRIVILEGE'
  | 'CROSS_ORGANIZATION_ACCESS_DENIED'
  | 'UNAUTHORIZED_BRANCH_ACCESS'
  | 'QUALIFICATION_NOT_VERIFIED_OR_EXPIRED'
  | 'AFFILIATION_INACTIVE_OR_TERMINATED'
  | 'CLIENT_ACCEPTANCE_REQUIRED'
  | 'MANDATE_EXPIRED_OR_INACTIVE'
  | 'RESTRICTED_AUTHORITY_NOT_INFERRED'
  | 'OUTSIDE_MANDATE_AUTHORITY_SCOPE'
  | 'INVALID_ALLOCATION_TOTAL'
  | 'UNVERIFIED_PAYMENT_CONFIRMATION_REJECTED'
  | 'COMMUNICATION_CONSENT_REQUIRED'
  | 'CONCURRENCY_VERSION_CONFLICT'
  | 'PERSISTENCE_FAILURE';

export class BrokerageOpsError extends Error {
  constructor(
    public readonly code: BrokerageOpsErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'BrokerageOpsError';
  }
}
