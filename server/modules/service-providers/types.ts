/**
 * Real Estate Professionals & Service Providers Domain Types
 * (`server/modules/service-providers/types.ts`)
 * Exclusive ownership: `server/modules/service-providers/`
 */

export type ProviderCategory =
  | 'real_estate_agent'
  | 'real_estate_broker'
  | 'property_consultant'
  | 'property_valuation_specialist'
  | 'civil_engineer'
  | 'structural_engineer'
  | 'architect'
  | 'building_inspector'
  | 'general_contractor'
  | 'renovation_company'
  | 'interior_designer'
  | 'electrician'
  | 'plumber'
  | 'property_management_company'
  | 'cleaning_service'
  | 'legal_consultant';

export type PricingModel =
  | 'fixed_price'
  | 'hourly'
  | 'daily'
  | 'per_square_meter'
  | 'project_based'
  | 'negotiable'
  | 'quote_required';

export type ProfilePublicationStatus = 'draft' | 'under_review' | 'published' | 'suspended' | 'archived';

export type OrganizationRole = 'owner' | 'administrator' | 'staff' | 'member';

export type CredentialVerificationStatus =
  | 'not_submitted'
  | 'submitted'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'expired'
  | 'revoked';

export type ServiceRequestStatus =
  | 'draft'
  | 'submitted'
  | 'open'
  | 'responses_pending'
  | 'responses_received'
  | 'customer_reviewing'
  | 'provider_selected'
  | 'closed'
  | 'cancelled'
  | 'expired';

export type QuotationStatus =
  | 'draft'
  | 'submitted'
  | 'updated'
  | 'withdrawn'
  | 'accepted_for_discussion'
  | 'declined'
  | 'expired';

export type ReviewModerationStatus = 'pending_review' | 'approved' | 'flagged' | 'rejected';

export interface ServiceAreaDeclaration {
  cityId: string;
  districtId?: string;
  hoodId?: number;
  isNationwide: boolean;
  isRemoteOnlineAvailable: boolean;
  travelLimitationKm?: number;
}

export interface IndividualProviderProfile {
  providerId: string;
  userId: string;
  displayNameFa: string;
  professionalHeadlineFa: string;
  biographyFa?: string;
  primaryCategory: ProviderCategory;
  specialties: string[];
  yearsOfExperience?: number;
  languages: string[];
  serviceAreas: ServiceAreaDeclaration[];
  publicContactPhone?: string;
  publicEmail?: string;
  avatarMediaId?: string;
  verificationStatus: 'unverified' | 'identity_verified' | 'credential_verified';
  publicationStatus: ProfilePublicationStatus;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ProviderOrganization {
  organizationId: string;
  nameFa: string;
  organizationType: 'brokerage' | 'engineering_firm' | 'contracting_company' | 'property_management_firm' | 'consultancy';
  businessDescriptionFa?: string;
  primaryCategory: ProviderCategory;
  specialties: string[];
  serviceAreas: ServiceAreaDeclaration[];
  publicPhone?: string;
  publicEmail?: string;
  websiteUrl?: string;
  logoMediaId?: string;
  verificationStatus: CredentialVerificationStatus;
  publicationStatus: ProfilePublicationStatus;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface OrganizationMembership {
  membershipId: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  jobTitleFa?: string;
  isActive: boolean;
  joinedAtIso: string;
  invitedByUserId: string;
}

export interface ProviderCredentialRecord {
  credentialId: string;
  ownerId: string; // providerId or organizationId
  ownerType: 'individual' | 'organization';
  credentialType: 'engineering_license' | 'brokerage_license' | 'trade_certificate' | 'union_membership' | 'academic_degree';
  issuingAuthorityFa: string;
  credentialIdentifier?: string;
  issueDateIso: string;
  expiryDateIso?: string;
  supportingMediaIds: string[];
  verificationStatus: CredentialVerificationStatus;
  reviewerUserId?: string;
  reviewedAtIso?: string;
  rejectionReasonFa?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ProviderServiceOffering {
  serviceId: string;
  providerId?: string;
  organizationId?: string;
  category: ProviderCategory;
  titleFa: string;
  descriptionFa: string;
  serviceAreas: ServiceAreaDeclaration[];
  pricingModel: PricingModel;
  basePriceMillionToman?: number;
  maxPriceMillionToman?: number;
  currency: 'IRT';
  estimatedDurationDays?: number;
  isAvailable: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CustomerServiceRequest {
  requestId: string;
  requesterUserId: string;
  category: ProviderCategory;
  desiredServiceId?: string;
  propertyReferenceId?: string;
  cityId: string;
  hoodId?: number;
  titleFa: string;
  descriptionFa: string;
  preferredTimeframeFa?: string;
  budgetCapMillionToman?: number;
  currency: 'IRT';
  status: ServiceRequestStatus;
  targetProviderIds?: string[];
  selectedProviderId?: string;
  selectedQuotationId?: string;
  createdAtIso: string;
  updatedAtIso: string;
  expiresAtIso: string;
}

export interface ProviderQuotationRecord {
  quotationId: string;
  requestId: string;
  providerId?: string;
  organizationId?: string;
  submittingUserId: string;
  version: number;
  proposedPriceMillionToman: number;
  currency: 'IRT';
  pricingModel: PricingModel;
  proposalDetailsFa: string;
  estimatedDurationDays?: number;
  status: QuotationStatus;
  validUntilDateIso: string;
  submittedAtIso: string;
  updatedAtIso: string;
}

export interface ProviderReviewRecord {
  reviewId: string;
  reviewerUserId: string;
  providerId?: string;
  organizationId?: string;
  serviceId?: string;
  serviceRequestId?: string;
  rating: number; // 1 to 5
  reviewTextFa: string;
  isVerifiedEngagement: boolean;
  moderationStatus: ReviewModerationStatus;
  providerResponseFa?: string;
  providerRespondedAtIso?: string;
  createdAtIso: string;
}

export interface ProviderPerformanceMetrics {
  providerId: string;
  profileCompletenessPercent: number;
  publishedServicesCount: number;
  submittedQuotationsCount: number;
  verifiedCredentialsCount: number;
  approvedReviewsCount: number;
  averageRating: number;
}

export interface ProviderSearchFilters {
  category?: ProviderCategory;
  specialtyKeyword?: string;
  cityId?: string;
  districtId?: string;
  hoodId?: number;
  verifiedOnly?: boolean;
  pricingModel?: PricingModel;
  language?: string;
  limit: number;
  cursor?: string;
}

export interface ProviderDomainEvent {
  eventId: string;
  eventType:
    | 'provider.profile.created'
    | 'provider.profile.updated'
    | 'provider.profile.published'
    | 'provider.organization.created'
    | 'provider.organization.member_added'
    | 'provider.organization.member_removed'
    | 'provider.credential.submitted'
    | 'provider.credential.verified'
    | 'provider.credential.rejected'
    | 'provider.service.created'
    | 'provider.service_request.created'
    | 'provider.quotation.submitted'
    | 'provider.quotation.withdrawn'
    | 'provider.selection.recorded'
    | 'provider.review.submitted';
  aggregateId: string;
  aggregateType: 'provider' | 'organization' | 'credential' | 'service' | 'request' | 'quotation' | 'review';
  actorUserId: string;
  payload: Record<string, unknown>;
  timestampIso: string;
}
