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
  | 'exclusive_rental_representation';

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
