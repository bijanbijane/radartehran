/** @file src/features/services/types/service.types.ts — Stage 21 Real Estate Services Marketplace Types */

export type ServiceCategory =
  | 'all'
  | 'brokerage'
  | 'contractor'
  | 'architecture'
  | 'inspection'
  | 'legal_valuation'
  | 'materials'
  | 'renovation_repair';

export type ServiceCanonicalCategory =
  | 'advisory'
  | 'legal'
  | 'valuation'
  | 'inspection'
  | 'architecture'
  | 'renovation'
  | 'mortgage_finance'
  | 'moving_settlement'
  | 'documentation_municipality'
  | 'property_management';

export type ServiceDeliveryMode = 'onsite' | 'remote' | 'hybrid';
export type ServiceSortMode = 'recommended' | 'verified_first' | 'experienced' | 'coverage_match';
export type ServiceListingTier = 'organic_directory' | 'featured_directory' | 'sponsored_ad';

export type CredentialVerificationStatus =
  | 'identity_verified'
  | 'license_verified'
  | 'self_declared'
  | 'unverified';

export type VerificationTrackKey = 'identity' | 'business' | 'qualification' | 'portfolio';
export type VerificationTrackStatus =
  | 'not_submitted'
  | 'pending'
  | 'verified'
  | 'revision_required'
  | 'rejected'
  | 'expired'
  | 'suspended';

export interface VerificationTrackRecord {
  track: VerificationTrackKey;
  status: VerificationTrackStatus;
  labelFa: string;
  badgeTextFa: string;
  verifiedByFa: string | null;
  issuedAtIso: string | null;
  expiresAtIso: string | null;
  licenseCodeMasked: string | null;
  noteFa: string;
}

export type ServicePricingMode =
  | 'fixed'
  | 'starting_from'
  | 'per_unit'
  | 'negotiable'
  | 'inspection_required'
  | 'free';

export interface ServicePricingModel {
  mode: ServicePricingMode;
  displayLabelFa: string;
  minMillionToman: number | null;
  maxMillionToman: number | null;
  unitLabelFa: string | null;
  includesListFa: string[];
  excludesListFa: string[];
}

export type ServiceCoverageScope =
  | 'office_only'
  | 'local'
  | 'citywide'
  | 'multi_city'
  | 'national'
  | 'remote';

export interface ServiceCoverageSpec {
  officeAddressSummaryFa: string;
  officeNeighborhoodName: string;
  scope: ServiceCoverageScope;
  coveredAreaNames: string[];
  remoteAvailable: boolean;
}

export interface ServiceDefinition {
  serviceId: string;
  slug: string;
  category: ServiceCanonicalCategory;
  legacyCategory: Exclude<ServiceCategory, 'all'>;
  titleFa: string;
  summaryFa: string;
  deliveryModes: ServiceDeliveryMode[];
  requiredFields: string[];
}

export interface ProviderIdentity {
  id: string;
  displayName: string;
  entityKind: 'agency' | 'specialist' | 'company';
  primaryNeighborhoodId: number;
  primaryNeighborhoodName: string;
  zone: string;
  phone: string;
}

export interface ProviderCredential {
  status: CredentialVerificationStatus;
  statusLabelFa: string;
  licenseNumber: string | null;
  separationNoteFa: string;
  tracks: VerificationTrackRecord[];
}

export interface ProviderActivityHistory {
  experienceYearsDeclared: number;
  activeListingsCount: number;
  responseTimeLabelFa: string;
}

export interface ProviderFeedbackSummary {
  verifiedReviewsCount: number;
  averageScore: number | null;
  noteFa: string;
}

export interface ServiceOfferingEntity {
  offeringId: string;
  providerId: string;
  serviceId: string;
  canonicalCategory: ServiceCanonicalCategory;
  titleFa: string;
  summaryFa: string;
  pricing: ServicePricingModel;
  deliveryModes: ServiceDeliveryMode[];
  coverage: ServiceCoverageSpec;
  estimatedTurnaroundFa: string;
}

export interface ServiceProviderEntity {
  identity: ProviderIdentity;
  credential: ProviderCredential;
  activity: ProviderActivityHistory;
  category: Exclude<ServiceCategory, 'all'>;
  canonicalCategory: ServiceCanonicalCategory;
  specialtyFa: string;
  pricingModelFa: string;
  listingTier: ServiceListingTier;
  adDisclosureLabelFa: string | null;
  feedback: ProviderFeedbackSummary;
  coverage: ServiceCoverageSpec;
  offerings: ServiceOfferingEntity[];
}

export interface ServiceFilterState {
  category: ServiceCategory;
  canonicalCategory?: ServiceCanonicalCategory | 'all';
  searchQuery: string;
  hoodId: number | 'all';
  onlyWithDeclaredPhone: boolean;
  onlyVerifiedTrack?: boolean;
  deliveryMode?: ServiceDeliveryMode | 'all';
  sortMode?: ServiceSortMode;
  hideSponsored: boolean;
}

export type {
  ProviderOnboardingSubmission,
  ProviderReviewRecord,
  ServiceComplaintRecord,
  ServiceDisputeRecord,
  ServiceProposalRecord,
  ServiceRequestRecord,
  ServiceRequestStatus,
} from './serviceWorkflow.types';
export {
  CANONICAL_CATEGORY_LABELS_FA,
  SERVICE_CATEGORY_LABELS_FA,
} from './serviceWorkflow.types';

