/**
 * @file server/modules/brokerage/types.ts
 * @description Core Domain Models and Contract Types for Real Estate Brokerage & Agency Management.
 */

export type AgencyOrganizationType =
  | 'independent_brokerage'
  | 'real_estate_office'
  | 'multi_branch_agency'
  | 'consulting_company'
  | 'property_management_agency';

export type AgencyOperatingStatus =
  | 'draft'
  | 'pending_review'
  | 'active'
  | 'suspended'
  | 'restricted'
  | 'closed';

export type VerificationState =
  | 'unverified'
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'expired';

export interface BusinessContactInfo {
  phone: string;
  email: string;
  website?: string;
  supportPhone?: string;
}

export interface GeographicReference {
  cityId: string;
  province?: string;
  neighborhoodId?: number;
  district?: string;
  postalCode?: string;
  addressLine?: string;
  latitude?: number;
  longitude?: number;
}

export interface RegistrationInfoReference {
  registrationNumber?: string;
  taxIdentifier?: string;
  unionLicenseNumber?: string;
  issuingAuthority?: string;
  verifiedAtIso?: string;
}

export interface AgencyRecord {
  id: string;
  legalBusinessName?: string;
  publicDisplayName: string;
  description: string;
  organizationType: AgencyOrganizationType;
  businessContact: BusinessContactInfo;
  publicContactPhone: string;
  publicContactEmail: string;
  mainGeographicReference: GeographicReference;
  operatingStatus: AgencyOperatingStatus;
  ownerUid: string;
  registrationReference?: RegistrationInfoReference;
  verificationState: VerificationState;
  createdAtIso: string;
  updatedAtIso: string;
  version: number;
  suspensionReason?: string;
  suspendedAtIso?: string;
}

export type BranchStatus = 'active' | 'suspended' | 'closed';

export interface BranchRecord {
  id: string;
  agencyId: string;
  branchName: string;
  contact: BusinessContactInfo;
  geographicReference: GeographicReference;
  operatingHours?: string;
  branchManagerUid: string;
  status: BranchStatus;
  createdAtIso: string;
  updatedAtIso: string;
  version: number;
}

export type AgentPublicationStatus = 'draft' | 'published' | 'archived';

export type ServiceCategory =
  | 'residential_sale'
  | 'residential_rent'
  | 'commercial_sale'
  | 'commercial_rent'
  | 'office_sale'
  | 'office_rent'
  | 'land_and_development'
  | 'pre_sale_projects'
  | 'property_valuation_consulting';

export interface AgentProfessionalProfile {
  id: string;
  userUid: string;
  publicDisplayName: string;
  professionalBio: string;
  languages: string[];
  serviceCategories: ServiceCategory[];
  geographicCoverage: {
    cityId: string;
    coveredNeighborhoodIds: number[];
  }[];
  experienceYears?: number;
  credentialReferences: string[];
  publicationStatus: AgentPublicationStatus;
  verificationState: VerificationState;
  createdAtIso: string;
  updatedAtIso: string;
  version: number;
}

export type InternalAgencyRole =
  | 'agency_owner'
  | 'agency_director'
  | 'general_manager'
  | 'branch_manager'
  | 'senior_consultant'
  | 'real_estate_consultant'
  | 'listing_coordinator'
  | 'operations_employee'
  | 'administrative_employee';

export type MembershipStatus =
  | 'invited'
  | 'active'
  | 'suspended'
  | 'terminated'
  | 'rejected';

export interface AgencyMembershipRecord {
  id: string;
  agencyId: string;
  userUid: string;
  branchId?: string | null;
  teamId?: string | null;
  role: InternalAgencyRole;
  status: MembershipStatus;
  invitationToken?: string;
  invitedByUid?: string;
  invitedAtIso: string;
  expiresAtIso?: string;
  acceptedAtIso?: string;
  rejectedAtIso?: string;
  terminatedAtIso?: string;
  terminationReason?: string;
  createdAtIso: string;
  updatedAtIso: string;
  version: number;
}

export interface AgencyTeamRecord {
  id: string;
  agencyId: string;
  branchId?: string | null;
  teamName: string;
  teamLeaderUid: string;
  memberUids: string[];
  createdAtIso: string;
  updatedAtIso: string;
  version: number;
}

export type RepresentationType =
  | 'sale_representation'
  | 'rental_representation'
  | 'commercial_representation'
  | 'land_representation'
  | 'property_management_authority'
  | 'exclusive_sale_representation'
  | 'exclusive_rental_representation'
  | 'SELLER_REPRESENTATION'
  | 'BUYER_REPRESENTATION'
  | 'LANDLORD_REPRESENTATION'
  | 'TENANT_REPRESENTATION'
  | 'DUAL_DISCLOSED';

export type MandateStatus =
  | 'pending'
  | 'active'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'disputed';

export interface ScopeOfAuthority {
  canAdvertise: boolean;
  canConductViewings: boolean;
  canNegotiateTerms: boolean;
  canCollectDeposit: boolean;
  canSignContractOnBehalf: boolean;
}

export interface RepresentationMandateRecord {
  id: string;
  agencyId: string;
  agentUid?: string | null;
  propertyReference: string;
  clientReference: string;
  representationType: RepresentationType;
  scopeOfAuthority: ScopeOfAuthority;
  startDateIso: string;
  expirationDateIso: string;
  evidenceReferences: string[];
  issuingParty: string;
  confirmationStatus: MandateStatus;
  revocationReason?: string;
  revokedAtIso?: string;
  revokedByUid?: string;
  createdAtIso: string;
  updatedAtIso: string;
  version: number;
}

export type ListingAssignmentStatus = 'active' | 'reassigned' | 'ended' | 'suspended';

export interface ListingRepresentationRelationship {
  id: string;
  listingReference: string;
  agencyId: string;
  branchId?: string | null;
  assignedAgentUid: string;
  assignedByUid: string;
  mandateId?: string | null;
  status: ListingAssignmentStatus;
  assignedAtIso: string;
  reassignedAtIso?: string;
  endedAtIso?: string;
  notes?: string;
}

export type CommissionType =
  | 'fixed_amount'
  | 'percentage_of_transaction_value'
  | 'agency_agent_revenue_share'
  | 'referral_agreement'
  | 'tiered_split';

export type CommissionCalculationBasis =
  | 'confirmed_transaction_value'
  | 'fixed_fee'
  | 'first_month_rent'
  | 'total_lease_value';

export type CommissionPayer =
  | 'buyer'
  | 'seller'
  | 'landlord'
  | 'tenant'
  | 'co_broker'
  | 'agency_internal';

export type CommissionApprovalStatus =
  | 'proposed'
  | 'approved_by_agent'
  | 'approved_by_agency'
  | 'active'
  | 'amended'
  | 'cancelled';

export interface CommissionAllocationRules {
  agencySharePercentage: number;
  agentSharePercentage: number;
  referralSharePercentage?: number;
  brokerageBonusPercentage?: number;
}

export interface CommissionAgreementRecord {
  id: string;
  agencyId: string;
  agentUid: string;
  dealReference: string;
  commissionType: CommissionType;
  agreedAmountOrPercentage: number;
  currency: 'IRT' | 'IRR' | 'USD';
  calculationBasis: CommissionCalculationBasis;
  payer: CommissionPayer;
  allocationRules: CommissionAllocationRules;
  version: number;
  effectiveDateIso: string;
  expirationDateIso?: string;
  approvalStatus: CommissionApprovalStatus;
  supportingDocumentReferences: string[];
  createdAtIso: string;
  updatedAtIso: string;
  amendedFromId?: string;
}

export type CredentialType =
  | 'realtor_license'
  | 'trade_union_permit'
  | 'broker_certificate'
  | 'legal_counsel_accreditation';

export interface ProfessionalCredentialRecord {
  id: string;
  ownerType: 'agent' | 'agency';
  ownerReferenceId: string;
  credentialType: CredentialType;
  issuingAuthority: string;
  credentialIdentifier: string;
  issueDateIso: string;
  expirationDateIso?: string;
  verificationSource: string;
  verificationStatus: VerificationState;
  evidenceReference?: string;
  lastVerifiedAtIso?: string;
  verifiedByUid?: string;
  notes?: string;
}

export type BrokerageActionType =
  | 'agency_created'
  | 'agency_updated'
  | 'agency_status_changed'
  | 'branch_created'
  | 'branch_updated'
  | 'branch_status_changed'
  | 'profile_created'
  | 'profile_updated'
  | 'invitation_created'
  | 'invitation_accepted'
  | 'invitation_rejected'
  | 'membership_role_changed'
  | 'membership_status_changed'
  | 'branch_reassigned'
  | 'team_created'
  | 'team_updated'
  | 'mandate_created'
  | 'mandate_status_changed'
  | 'listing_assigned'
  | 'listing_reassigned'
  | 'listing_assignment_ended'
  | 'commission_agreement_created'
  | 'commission_agreement_amended'
  | 'credential_submitted'
  | 'credential_verified';

export interface BrokerageActivityRecord {
  id: string;
  agencyId: string;
  branchId?: string | null;
  actorUid: string;
  actorRole: InternalAgencyRole | 'platform_admin' | 'guest';
  actionType: BrokerageActionType;
  resourceType:
    | 'agency'
    | 'branch'
    | 'agent_profile'
    | 'membership'
    | 'team'
    | 'mandate'
    | 'listing_assignment'
    | 'commission_agreement'
    | 'credential';
  resourceId: string;
  metadata?: Record<string, unknown>;
  timestampIso: string;
}

export interface AgencyPerformanceSummary {
  agencyId: string;
  timeWindowDays: number;
  activeAgentCount: number;
  activeBranchCount: number;
  activeMandatesCount: number;
  activeListingAssignmentsCount: number;
  inquiryReferencesCount: number;
  viewingActivityReferencesCount: number;
  offerActivityReferencesCount: number;
  dealParticipationCount: number;
  completedTransactionsCount: number;
  activeCommissionAgreementsCount: number;
  totalAgreedCommissionPotentialIRT: number;
  generatedAtIso: string;
}

export interface BrokerageDependencies {
  txRunner: import('../core').TransactionRunnerAdapter;
  idempotencyStore: import('../core').IdempotencyStoreAdapter;
  tokenVerifier?: import('../core').FirebaseTokenVerifierAdapter;
  adminStore?: Parameters<typeof import('../core').verifyAdminOrDelegatedPrincipal>[1];
  auditSink?: { writeAuditEvent: (event: any) => Promise<void> | void };
  primaryAdminEmails?: string[];
  notificationEmitter?: (event: unknown) => Promise<void> | void;
  telemetryEmitter?: (event: unknown) => void;
  idGenerator?: (prefix: string) => string;
  nowFn?: () => number;
}

export type BrokerageOrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type BrokerageVerificationStatus = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
export type BrokerageRole =
  | 'BROKERAGE_OWNER'
  | 'BROKERAGE_ADMIN'
  | 'BRANCH_MANAGER'
  | 'TEAM_LEAD'
  | 'SENIOR_AGENT'
  | 'AGENT'
  | 'COORDINATOR';
export type BrokerageMembershipStatus =
  | 'INVITED'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'TERMINATED';
export type AgentProfileStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type BrokerageClientCategory = 'BUYER' | 'SELLER' | 'TENANT' | 'LANDLORD' | 'INVESTOR';
export type BrokerageLeadCategory =
  | 'BUYER'
  | 'SELLER'
  | 'TENANT'
  | 'LANDLORD'
  | 'INVESTOR'
  | 'BUY_INQUIRY'
  | 'SELL_INQUIRY'
  | 'RENT_INQUIRY'
  | 'LEASE_INQUIRY'
  | 'VALUATION_INQUIRY';
export type BrokerageLeadSource =
  | 'WEBSITE'
  | 'PROPERTY_LISTING_INQUIRY'
  | 'DIRECT_PORTAL'
  | 'BARGAIN_LISTING'
  | 'REFERRAL'
  | 'WALK_IN'
  | 'PHONE_CALL'
  | 'CAMPAIGN';
export type BrokerageLeadStatus =
  | 'NEW'
  | 'UNASSIGNED'
  | 'ASSIGNED'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'VIEWING_SCHEDULED'
  | 'NEGOTIATION'
  | 'CONVERTED'
  | 'LOST'
  | 'ARCHIVED';
export type LeadDistributionStrategy =
  | 'MANUAL'
  | 'ROUND_ROBIN'
  | 'WORKLOAD_AWARE'
  | 'SERVICE_AREA_MATCH'
  | 'PROPERTY_CATEGORY_MATCH';
export type LeadFollowUpPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type LeadFollowUpTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'OVERDUE';

export const ALL_REPRESENTATION_TYPES: readonly RepresentationType[] = [
  'SELLER_REPRESENTATION',
  'BUYER_REPRESENTATION',
  'LANDLORD_REPRESENTATION',
  'TENANT_REPRESENTATION',
  'DUAL_DISCLOSED',
  'sale_representation',
  'rental_representation',
  'commercial_representation',
  'land_representation',
  'property_management_authority',
  'exclusive_sale_representation',
  'exclusive_rental_representation',
] as const;

export type RepresentationExclusivity = 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'OPEN';
export type ListingAcquisitionStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'WITHDRAWN';
export type TransactionParticipationSide =
  | 'BUYER_SIDE'
  | 'SELLER_SIDE'
  | 'LANDLORD_SIDE'
  | 'TENANT_SIDE'
  | 'DUAL_SIDE'
  | RepresentationType;
export type BrokerageAgreementType =
  | 'COMMISSION_AGREEMENT'
  | 'EXCLUSIVE_LISTING'
  | 'OPEN_LISTING'
  | 'BUYER_REPRESENTATION'
  | 'TENANT_REPRESENTATION'
  | 'PROPERTY_MANAGEMENT_MANDATE'
  | 'REFERRAL_AGREEMENT';
export const ALL_BROKERAGE_AGREEMENT_TYPES: readonly BrokerageAgreementType[] = [
  'COMMISSION_AGREEMENT',
  'EXCLUSIVE_LISTING',
  'OPEN_LISTING',
  'BUYER_REPRESENTATION',
  'TENANT_REPRESENTATION',
  'PROPERTY_MANAGEMENT_MANDATE',
  'REFERRAL_AGREEMENT',
] as const;
export type CommissionStructureType =
  | 'PERCENTAGE_OF_BASE'
  | 'PERCENTAGE_BASIS_POINTS'
  | 'FIXED_AMOUNT'
  | 'TIERED_BASIS_POINTS'
  | 'HYBRID';
export const ALL_COMMISSION_STRUCTURES: readonly CommissionStructureType[] = [
  'PERCENTAGE_OF_BASE',
  'PERCENTAGE_BASIS_POINTS',
  'FIXED_AMOUNT',
  'TIERED_BASIS_POINTS',
  'HYBRID',
] as const;
export type BrokerageAgreementStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTED'
  | 'AMENDED'
  | 'EXPIRED'
  | 'TERMINATED';

export interface CommissionAllocationShare {
  recipientType: 'BROKERAGE' | 'AGENT' | 'TEAM_LEAD' | 'REFERRAL_PARTNER';
  recipientUid: string;
  allocatedAmount: number;
  basisPointsShare?: number;
  notes?: string;
}

export type ReferralStatus =
  | 'CREATED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'CONVERTED'
  | 'EXPIRED'
  | 'DECLINED'
  | 'REJECTED';
export type ClientCommunicationVisibility =
  | 'CLIENT_VISIBLE'
  | 'TEAM_SHARED'
  | 'INTERNAL_PRIVATE';
export type ClientCommunicationEventType =
  | 'CALL_SUMMARY'
  | 'MEETING_NOTE'
  | 'VIEWING_FEEDBACK'
  | 'OFFER_DISCUSSION'
  | 'DOCUMENT_FOLLOW_UP'
  | 'GENERAL_NOTE'
  | 'NEGOTIATION'
  | 'CONTACT_ATTEMPT'
  | 'SCHEDULED_MEETING'
  | 'VIEWING_APPOINTMENT'
  | 'FOLLOW_UP_OUTCOME'
  | 'INTERNAL_NOTE';
export type ViewingStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'RESCHEDULED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface BrokerageOrganizationRecord {
  [key: string]: unknown;
  brokerageId: string;
  legalName: string;
  displayName: string;
  status: BrokerageOrganizationStatus;
  ownerUid: string;
  adminUids: string[];
  officeIds: string[];
  memberUids: string[];
  activeAgentUids: string[];
  verificationStatus: BrokerageVerificationStatus;
  verificationEvidenceIds: string[];
  businessContactPhone: string;
  businessContactEmail?: string;
  cityId: string;
  roundRobinCursor: number;
  version: number;
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface BrokerageIndexRecord {
  [key: string]: unknown;
  brokerageId: string;
  membershipIds: string[];
  teamIds: string[];
  clientIds: string[];
  leadIds: string[];
  followUpTaskIds: string[];
  representationIds: string[];
  acquisitionIds: string[];
  participationIds: string[];
  agreementIds: string[];
  commissionIds: string[];
  referralIds: string[];
  communicationIds: string[];
  viewingIds: string[];
  updatedAtIso: string;
}

export interface AgentProfileRecord {
  [key: string]: unknown;
  agentId: string;
  userUid: string;
  brokerageId?: string;
  displayName: string;
  bioSummary?: string;
  yearsOfExperience: number;
  serviceNeighborhoodIds: string[];
  propertyCategories: string[];
  transactionCategories: string[];
  verificationReferenceId?: string;
  licenseReferenceId?: string;
  status: AgentProfileStatus;
  membershipStatus?: BrokerageMembershipStatus;
  activeLeadCount: number;
  isAvailableForLeads: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface BrokerageMembershipRecord {
  [key: string]: unknown;
  membershipId: string;
  brokerageId: string;
  agentId: string;
  userUid: string;
  role: BrokerageRole;
  status: BrokerageMembershipStatus;
  teamId?: string;
  permissions: string[];
  invitedByUid: string;
  approvedByUid?: string;
  history: Array<{
    fromStatus?: BrokerageMembershipStatus;
    toStatus: BrokerageMembershipStatus;
    role: BrokerageRole;
    actorUid: string;
    reason?: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface BrokerageTeamRecord {
  [key: string]: unknown;
  teamId: string;
  brokerageId: string;
  name: string;
  leaderUid: string;
  memberUids: string[];
  serviceNeighborhoodIds: string[];
  permissions: string[];
  roundRobinCursor: number;
  assignmentHistory: Array<{
    userUid: string;
    action: 'ADDED' | 'TRANSFERRED_IN' | 'TRANSFERRED_OUT' | 'REMOVED';
    actorUid: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface BrokerageClientRecord {
  [key: string]: unknown;
  clientId: string;
  brokerageId: string;
  clientUserUid?: string;
  displayName: string;
  categories: BrokerageClientCategory[];
  relationshipStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  assignedAgentUid: string;
  teamId?: string;
  preferredNeighborhoodIds: string[];
  preferredPropertyCategories: string[];
  communicationChannelPreference: string;
  ownedPropertyIds: string[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface BrokerageLeadRecord {
  [key: string]: unknown;
  leadId: string;
  brokerageId: string;
  source: BrokerageLeadSource;
  category: BrokerageLeadCategory;
  propertyCategory?: string;
  neighborhoodId?: string;
  interestedPropertyId?: string;
  clientId?: string;
  assignedAgentUid?: string;
  assignedTeamId?: string;
  status: BrokerageLeadStatus;
  priority: LeadFollowUpPriority;
  assignmentExpiresAtIso?: string;
  firstContactedAtIso?: string;
  convertedAtIso?: string;
  conversionTransactionId?: string;
  conversionClientId?: string;
  assignmentHistory: Array<{
    fromAgentUid?: string;
    toAgentUid: string;
    teamId?: string;
    strategy: LeadDistributionStrategy;
    actorUid: string;
    reason?: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  lastActivityAtIso: string;
}

export interface LeadFollowUpTaskRecord {
  [key: string]: unknown;
  taskId: string;
  brokerageId: string;
  leadId: string;
  assignedAgentUid: string;
  title: string;
  priority: LeadFollowUpPriority;
  status: LeadFollowUpTaskStatus;
  dueAtIso: string;
  contactAttemptsCount: number;
  outcome?: string;
  nextActionReference?: string;
  completedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface PropertyRepresentationRecord {
  [key: string]: unknown;
  representationId: string;
  brokerageId: string;
  responsibleAgentUid: string;
  representationType: RepresentationType;
  exclusivity: RepresentationExclusivity;
  propertyId?: string;
  listingId?: string;
  clientId?: string;
  principalUserUid: string;
  contractReferenceId: string;
  startDateIso: string;
  expirationDateIso: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'COMPLETED';
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ListingAcquisitionRecord {
  [key: string]: unknown;
  acquisitionId: string;
  brokerageId: string;
  propertyId: string;
  listingId?: string;
  representationId: string;
  assignedAgentUid: string;
  ownerAuthorizationReferenceId: string;
  documentationIds: string[];
  status: ListingAcquisitionStatus;
  approvedByUid?: string;
  expirationDateIso: string;
  history: Array<{
    status: ListingAcquisitionStatus;
    assignedAgentUid: string;
    actorUid: string;
    note?: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface BrokerageTransactionParticipationRecord {
  [key: string]: unknown;
  participationId: string;
  brokerageId: string;
  transactionId: string;
  representationId?: string;
  side: TransactionParticipationSide;
  assignedAgentUid: string;
  teamId?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'WITHDRAWN';
  history: Array<{
    action: string;
    agentUid: string;
    actorUid: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface BrokerageAgreementRecord {
  [key: string]: unknown;
  agreementId: string;
  brokerageId: string;
  clientId?: string;
  agentUid: string;
  propertyId?: string;
  transactionId?: string;
  agreementType: BrokerageAgreementType;
  effectiveDateIso: string;
  expirationDateIso: string;
  serviceScope: string;
  commissionStructure: CommissionStructureType;
  commissionRateBasisPoints?: number;
  fixedCommissionAmount?: number;
  currency: 'IRR' | 'IRT';
  status: BrokerageAgreementStatus;
  contractDocumentIds: string[];
  executionDocumentIds: string[];
  versionNumber: number;
  amendments: Array<{
    versionNumber: number;
    previousServiceScope: string;
    previousCommissionRateBasisPoints?: number;
    previousFixedCommissionAmount?: number;
    reason: string;
    actorUid: string;
    amendedAtIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface BrokerageCommissionRecord {
  [key: string]: unknown;
  brokerageCommissionId: string;
  brokerageId: string;
  transactionId: string;
  agreementId: string;
  payerUid: string;
  currency: 'IRR' | 'IRT';
  structureType: CommissionStructureType;
  contractualBaseAmount: number;
  totalCommissionAmount: number;
  allocations: CommissionAllocationShare[];
  ledgerCommissionId: string;
  ledgerObligationId: string;
  ledgerPostingGroupId: string;
  status: 'POSTED_TO_LEDGER' | 'REVERSED';
  adjustments: Array<{
    previousTotalAmount: number;
    newTotalAmount: number;
    reason: string;
    authorizedByUid: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface BrokerageReferralRecord {
  [key: string]: unknown;
  referralId: string;
  referringBrokerageId: string;
  receivingBrokerageId: string;
  referringAgentUid: string;
  receivingAgentUid: string;
  leadId?: string;
  clientId?: string;
  referralTermsSummary: string;
  referralBasisPoints?: number;
  fixedReferralAmount?: number;
  currency: 'IRR' | 'IRT';
  status: ReferralStatus;
  convertedTransactionId?: string;
  brokerageCommissionId?: string;
  expiresAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ClientCommunicationEventRecord {
  [key: string]: unknown;
  communicationId: string;
  brokerageId: string;
  clientId: string;
  leadId?: string;
  agentUid: string;
  eventType: ClientCommunicationEventType;
  visibility: ClientCommunicationVisibility;
  summary: string;
  createdAtIso: string;
}

export interface PropertyViewingRecord {
  [key: string]: unknown;
  viewingId: string;
  brokerageId: string;
  propertyId: string;
  listingId?: string;
  clientId: string;
  assignedAgentUid: string;
  startTimeIso: string;
  endTimeIso: string;
  status: ViewingStatus;
  feedbackSummary?: string;
  clientInterestRating?: number;
  history: Array<{
    status: ViewingStatus;
    startTimeIso: string;
    endTimeIso: string;
    actorUid: string;
    note?: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
}
