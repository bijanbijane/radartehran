/**
 * @file server/modules/professional-verification/types.ts
 * @description Canonical Data Contracts & Domain Types for Radartehran Professional Identity,
 * Organization, and Credential-Verification Backend (Employee 12).
 *
 * Architectural Invariants:
 * - Exclusive ownership under `server/modules/professional-verification/`.
 * - Uses core authenticated principal and permission interfaces without mutating global auth.
 * - References Service Marketplace providers (`ServiceMarketplaceProviderRef`) without taking
 *   ownership of their canonical provider records.
 * - Explicitly models 8 lifecycle states (`unsubmitted` .. `suspended`).
 * - Strictly separates private verification evidence from minimum-disclosure public summaries.
 */

import type { CityId } from '../../../src/types/models';

/**
 * Regulated or professionally certified entity categories supported by Radartehran.
 */
export type VerifiedEntityType =
  | 'real_estate_agency'
  | 'real_estate_agent'
  | 'construction_company'
  | 'architect'
  | 'engineer'
  | 'contractor'
  | 'regulated_certified_provider';

/**
 * Explicit verification lifecycle states mandated by the domain contract.
 */
export type VerificationLifecycleState =
  | 'unsubmitted'
  | 'pending'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'suspended';

/**
 * Explicit distinction between unverified user submissions, manual document inspection by a human
 * reviewer, and manual cross-check against an authoritative official registry portal.
 * Note: Automated live registry verification is intentionally NOT claimed where no authorized
 * government/union API integration exists.
 */
export type VerificationMethodType =
  | 'unverified_submission'
  | 'manual_document_review'
  | 'official_authority_registry_cross_check';

/**
 * Categories of professional licenses and credentials in Iranian real estate & construction.
 */
export type CredentialCategory =
  | 'real_estate_union_business_license' // پروانه کسب اتحادیه مشاوران املاک
  | 'real_estate_specialist_certificate' // گواهینامه تخصصی مشاور / کارشناس معاملات ملکی
  | 'engineering_organization_employment_license' // پروانه اشتغال به کار مهندسی (نظام مهندسی)
  | 'construction_legal_entity_grade_certificate' // پروانه اشتغال حقوقی / رتبه‌بندی شرکت ساختمانی و پیمانکاری
  | 'official_judiciary_appraiser_license' // پروانه کارشناس رسمی دادگستری (رشته راه و ساختمان / ثبتی)
  | 'national_company_registration_certificate' // آگهی تاسیس و شناسه ملی ثبت شرکت‌ها
  | 'technical_contractor_qualification_certificate'; // گواهی صلاحیت پیمانکاری / فنی و حرفه‌ای

/**
 * Known Iranian regulatory and issuing authority identifiers.
 */
export type IssuingAuthorityCode =
  | 'tehran_real_estate_union' // اتحادیه صنف مشاوران املاک
  | 'iran_business_licenses_portal_mojavez' // درگاه ملی مجوزهای کشور (مجوز)
  | 'construction_engineering_org_irceo' // سازمان نظام مهندسی ساختمان
  | 'judiciary_official_experts_center' // کانون کارشناسان رسمی دادگستری / مرکز وکلا و کارشناسان
  | 'plan_and_budget_org_sajat' // سازمان برنامه و بودجه (سامانه ساجات - رتبه‌بندی پیمانکاران)
  | 'company_registration_org_ssaa' // سازمان ثبت اسناد و املاک کشور (ثبت شرکت‌ها)
  | 'other_regulated_authority';

/**
 * Core authenticated principal context passed from upstream authentication middleware.
 */
export interface AuthenticatedPrincipalContext {
  uid: string;
  email: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  roles: ReadonlyArray<'user' | 'professional' | 'reviewer' | 'compliance_officer' | 'admin'>;
  permissions: ReadonlyArray<VerificationPermission>;
}

export type VerificationPermission =
  | 'professional_verification:submit_own'
  | 'professional_verification:read_own_private'
  | 'professional_verification:review_credentials'
  | 'professional_verification:revoke_or_suspend'
  | 'professional_verification:audit_read';

/**
 * Non-owning reference to a provider record in the Service Marketplace or Sponsor module.
 * This module never duplicates or takes ownership of marketplace provider state.
 */
export interface ServiceMarketplaceProviderRef {
  serviceProviderId: string;
  providerCategory: VerifiedEntityType;
  cityId: CityId;
  coveredHoodIds: ReadonlyArray<number>;
  linkedSponsorSlotId: string | null;
}

/**
 * Metadata describing an official issuing authority and its integration capabilities.
 */
export interface OfficialVerificationAuthorityMetadata {
  authorityCode: IssuingAuthorityCode;
  nameFa: string;
  nameEn: string;
  officialPortalBaseUrl: string | null;
  allowedHostnameSuffixes: ReadonlyArray<string>;
  hasAuthorizedAutomatedApi: false; // Honest disclosure: no direct live government API is claimed
  verificationGuidanceFa: string;
}

/**
 * Private document evidence item attached to a credential submission.
 * MUST NEVER be exposed in public verification summaries.
 */
export interface PrivateDocumentEvidenceItem {
  evidenceItemId: string;
  documentType:
    | 'license_scan'
    | 'national_id_match_attestation'
    | 'official_portal_inquiry_screenshot'
    | 'company_gazette_notice';
  privateStorageObjectKey: string;
  sha256DigestHex: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  uploadedByUid: string;
  uploadedAtIso: string;
  accessClassification: 'restricted_reviewer_only';
}

/**
 * Comprehensive verification evidence record stored privately for compliance and review.
 */
export interface VerificationEvidenceRecord {
  evidenceRecordId: string;
  credentialId: string;
  ownerPrincipalUid: string;
  issuingAuthorityCode: IssuingAuthorityCode;
  issuingAuthorityNameFa: string;
  credentialType: CredentialCategory;
  credentialIdentifier: string;
  holderFullNameFa: string;
  linkedOrganizationId: string | null;
  submissionTimestampIso: string | null;
  reviewTimestampIso: string | null;
  privateDocuments: ReadonlyArray<PrivateDocumentEvidenceItem>;
  officialVerificationUrl: string | null;
  officialInquiryReferenceCode: string | null;
  verificationMethod: VerificationMethodType;
  reviewerIdentity: {
    reviewerUid: string;
    reviewerRole: 'reviewer' | 'compliance_officer' | 'admin';
    reviewedAtIso: string;
  } | null;
  expirationDateIso: string | null;
  currentStatus: VerificationLifecycleState;
  internalReviewerNotesFa: string | null;
  rejectionOrActionReasonFa: string | null;
}

/**
 * Canonical professional license/credential record.
 */
export interface ProfessionalLicenseRecord {
  credentialId: string;
  profileId: string;
  ownerPrincipalUid: string;
  entityType: VerifiedEntityType;
  credentialType: CredentialCategory;
  issuingAuthorityCode: IssuingAuthorityCode;
  issuingAuthorityNameFa: string;
  credentialIdentifier: string;
  maskedPublicIdentifier: string;
  holderFullNameFa: string;
  linkedOrganizationId: string | null;
  cityId: CityId;
  status: VerificationLifecycleState;
  verificationMethod: VerificationMethodType;
  submittedAtIso: string | null;
  reviewedAtIso: string | null;
  verifiedAtIso: string | null;
  expiresAtIso: string | null;
  revokedAtIso: string | null;
  suspendedAtIso: string | null;
  evidenceRecordId: string;
  officialVerificationUrl: string | null;
  updatedAtIso: string;
}

/**
 * Membership relationship between an individual professional profile and a business/agency organization.
 */
export type OrganizationMembershipRole =
  | 'licensed_principal_founder' // صاحب امتیاز پروانه / مدیرعامل
  | 'technical_manager' // مدیر فنی / مسئول فنی
  | 'affiliated_agent' // مشاور / کارشناس عضو
  | 'senior_engineer_or_architect'; // مهندس / معمار همکار

export type OrganizationMembershipStatus =
  | 'pending_organization_confirmation'
  | 'active_confirmed'
  | 'revoked_by_organization'
  | 'left_organization';

export interface OrganizationMembershipReference {
  membershipId: string;
  professionalProfileId: string;
  professionalPrincipalUid: string;
  organizationId: string;
  role: OrganizationMembershipRole;
  membershipStatus: OrganizationMembershipStatus;
  confirmedByOrganizationUid: string | null;
  joinedAtIso: string;
  updatedAtIso: string;
  endedAtIso: string | null;
}

/**
 * Individual professional profile record.
 */
export interface ProfessionalProfileRecord {
  profileId: string;
  ownerPrincipalUid: string;
  displayNameFa: string;
  entityType: Exclude<VerifiedEntityType, 'real_estate_agency' | 'construction_company'>;
  primaryCityId: CityId;
  coveredHoodIds: ReadonlyArray<number>;
  specialtySummaryFa: string;
  experienceYears: number;
  serviceMarketplaceProviderRef: ServiceMarketplaceProviderRef | null;
  activeOrganizationIds: ReadonlyArray<string>;
  credentialIds: ReadonlyArray<string>;
  overallVerificationState: VerificationLifecycleState;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Business or real-estate agency / construction company organization profile.
 */
export interface BusinessOrganizationProfileRecord {
  organizationId: string;
  ownerPrincipalUid: string;
  legalEntityNameFa: string;
  publicBrandNameFa: string;
  organizationType: Extract<
    VerifiedEntityType,
    'real_estate_agency' | 'construction_company' | 'contractor' | 'regulated_certified_provider'
  >;
  registrationNumber: string | null;
  primaryCityId: CityId;
  coveredHoodIds: ReadonlyArray<number>;
  serviceMarketplaceProviderRef: ServiceMarketplaceProviderRef | null;
  credentialIds: ReadonlyArray<string>;
  overallVerificationState: VerificationLifecycleState;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Immutable audit trail entry recorded on every verification lifecycle mutation or review decision.
 */
export interface VerificationAuditLogEntry {
  auditId: string;
  targetType: 'credential' | 'professional_profile' | 'organization_profile' | 'membership';
  targetId: string;
  actorPrincipalUid: string;
  actorRole: string;
  previousState: VerificationLifecycleState | string | null;
  nextState: VerificationLifecycleState | string;
  verificationMethod: VerificationMethodType | null;
  reasonFa: string;
  occurredAtIso: string;
  integrityHashHex: string;
}

/**
 * Minimum-disclosure public verification summary for an individual professional.
 * Never exposes private documents, storage keys, national IDs, or reviewer identities.
 */
export interface PublicProfessionalVerificationSummary {
  profileId: string;
  displayNameFa: string;
  entityType: VerifiedEntityType;
  primaryCityId: CityId;
  coveredHoodIds: ReadonlyArray<number>;
  specialtySummaryFa: string;
  isCurrentlyVerified: boolean;
  publicVerificationStatus: VerificationLifecycleState;
  badgeLabelFa: string;
  verificationDisclaimerFa: string;
  verifiedCredentialsSummary: ReadonlyArray<{
    credentialType: CredentialCategory;
    issuingAuthorityNameFa: string;
    maskedCredentialIdentifier: string;
    verificationMethod: VerificationMethodType;
    verificationMethodLabelFa: string;
    verifiedAtIso: string;
    expiresAtIso: string | null;
    officialAuthorityPortalUrl: string | null;
  }>;
  affiliatedOrganizations: ReadonlyArray<{
    organizationId: string;
    publicBrandNameFa: string;
    role: OrganizationMembershipRole;
    isOrganizationVerified: boolean;
  }>;
  serviceMarketplaceProviderId: string | null;
}

/**
 * Minimum-disclosure public verification summary for a business or agency organization.
 */
export interface PublicOrganizationVerificationSummary {
  organizationId: string;
  publicBrandNameFa: string;
  organizationType: VerifiedEntityType;
  primaryCityId: CityId;
  coveredHoodIds: ReadonlyArray<number>;
  isCurrentlyVerified: boolean;
  publicVerificationStatus: VerificationLifecycleState;
  badgeLabelFa: string;
  verificationDisclaimerFa: string;
  verifiedCredentialsSummary: ReadonlyArray<{
    credentialType: CredentialCategory;
    issuingAuthorityNameFa: string;
    maskedCredentialIdentifier: string;
    verificationMethod: VerificationMethodType;
    verificationMethodLabelFa: string;
    verifiedAtIso: string;
    expiresAtIso: string | null;
    officialAuthorityPortalUrl: string | null;
  }>;
  activeVerifiedMembersCount: number;
  serviceMarketplaceProviderId: string | null;
}
