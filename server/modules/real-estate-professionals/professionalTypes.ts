/**
 * @file server/modules/real-estate-professionals/professionalTypes.ts
 * @description Canonical data models, verification state machines, and interfaces for Real Estate Professionals & Agencies.
 */

export type RealEstateRole =
  | 'broker'             // مدیر صنف / دارنده پروانه تخصصی
  | 'agency_owner'       // صاحب جواز کسب دفتر املاک
  | 'agency_manager'     // مدیر معاملات / مدیر داخلی
  | 'branch_manager'     // مدیر شعبه
  | 'licensed_consultant'// مشاور دارای گواهینامه معتبر
  | 'agency_agent';      // کارشناس فروش / مشاور املاک

export type VerificationStatus =
  | 'NOT_SUBMITTED'
  | 'SUBMITTED_UNVERIFIED'
  | 'PENDING_VERIFICATION'
  | 'UNDER_MANUAL_REVIEW'
  | 'VERIFIED_BY_REGISTRY'            // استعلام موفق از سامانه رسمی (کاتب / اصناف)
  | 'MANUALLY_REVIEWED_BY_PLATFORM'   // بررسی دستی مستندات توسط کارشناسان حقوقی پلتفرم
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'REGISTRY_UNAVAILABLE';

export type ProfessionalCredentialType =
  | 'TRADE_UNION_REAL_ESTATE_LICENSE'    // پروانه کسب اتحادیه مشاوران املاک
  | 'KATIB_OFFICIAL_BROKER_CODE'         // کد صنفی سامانه کاتب / سازمان ثبت
  | 'COMMERCE_MINISTRY_BUSINESS_ID'     // شناسه یکتای درگاه ملی مجوزها (نوین اصناف)
  | 'CORPORATE_OFFICIAL_REGISTRATION'    // شناسه ملی ثبت شرکت‌ها
  | 'JUDICIARY_APPRAISER_CERTIFICATE';   // پروانه کارشناسی رسمی دادگستری

export type AgencyMembershipState =
  | 'INVITED'
  | 'APPLICATION_SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'TERMINATED';

export interface VerificationPillars {
  readonly phoneVerified: boolean;         // ۱. کنترل مالکیت شماره تماس (OTP)
  readonly identityVerified: boolean;      // ۲. احراز هویت دارنده حساب کاربری
  readonly licenseVerified: boolean;       // ۳. استعلام و تایید پروانه شغلی
  readonly verificationMethod: 'OFFICIAL_REGISTRY' | 'MANUAL_COMPLIANCE_AUDIT' | 'UNVERIFIED';
  readonly lastVerifiedAtIso?: string;
}

export interface ProfessionalPublicProfile {
  readonly id: string;
  readonly userId: string; // Account reference from verified Auth
  readonly publicDisplayName: string;
  readonly role: RealEstateRole;
  readonly agencyId?: string;
  readonly branchId?: string;
  readonly primaryCityId: string;
  readonly activeHoodIds: readonly number[];
  readonly publicBioFa: string;
  readonly verificationStatus: VerificationStatus;
  readonly verificationPillars: VerificationPillars;
  readonly operatingStatus: 'active' | 'busy' | 'inactive';
  readonly officialVerificationUrl?: string; // Approved external link
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface ProfessionalPrivateProfile extends ProfessionalPublicProfile {
  readonly contactPhone: string;
  readonly nationalIdMasked?: string;
  readonly privateNotes?: string;
  readonly credentialIds: readonly string[];
}

export interface AgencyBranch {
  readonly id: string;
  readonly agencyId: string;
  readonly branchNameFa: string;
  readonly cityId: string;
  readonly districtId?: string;
  readonly hoodId?: number;
  readonly streetAddressFa: string;
  readonly phone: string;
  readonly branchManagerUid?: string;
  readonly isActive: boolean;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface AgencyProfile {
  readonly id: string;
  readonly ownerUid: string;
  readonly registeredLegalNameFa: string;
  readonly publicTradingNameFa: string;
  readonly tradeUnionLicenseNumber: string;
  readonly nationalCompanyId?: string;
  readonly cityId: string;
  readonly centralOfficeAddressFa: string;
  readonly publicPhone: string;
  readonly privateContactPhone: string;
  readonly verificationStatus: VerificationStatus;
  readonly verificationPillars: VerificationPillars;
  readonly branches: readonly AgencyBranch[];
  readonly managerUids: readonly string[];
  readonly officialVerificationUrl?: string;
  readonly isActive: boolean;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface ProfessionalCredential {
  readonly id: string;
  readonly ownerId: string; // professionalId or agencyId
  readonly ownerType: 'professional' | 'agency';
  readonly credentialType: ProfessionalCredentialType;
  readonly issuingAuthorityFa: string;
  readonly licenseNumber: string;
  readonly issuanceDateIso?: string;
  readonly expiryDateIso?: string;
  readonly documentMediaId: string; // Private media reference in Media module
  readonly verificationStatus: VerificationStatus;
  readonly verificationMethod: 'OFFICIAL_REGISTRY' | 'MANUAL_COMPLIANCE_AUDIT' | 'UNVERIFIED';
  readonly reviewerUid?: string;
  readonly reviewedAtIso?: string;
  readonly rejectionReasonFa?: string;
  readonly officialRegistryReference?: string;
  readonly submittedAtIso: string;
  readonly updatedAtIso: string;
}

export interface AgencyMembershipRecord {
  readonly id: string;
  readonly agencyId: string;
  readonly branchId?: string;
  readonly professionalId: string;
  readonly professionalUserId: string;
  readonly roleInAgency: RealEstateRole;
  readonly state: AgencyMembershipState;
  readonly invitedByUid?: string;
  readonly stateHistory: readonly {
    readonly state: AgencyMembershipState;
    readonly actorUid: string;
    readonly timestampIso: string;
    readonly reasonFa?: string;
  }[];
  readonly joinedAtIso?: string;
  readonly terminatedAtIso?: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface ListingAgentAssociation {
  readonly id: string;
  readonly listingId: string;
  readonly professionalId: string;
  readonly agencyId?: string;
  readonly branchId?: string;
  readonly representationType: 'EXCLUSIVE_BROKER' | 'CO_BROKER' | 'ADVERTISER';
  readonly status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  readonly authorizedUntilIso: string;
  readonly createdAtIso: string;
}

export interface RegistryLookupResult {
  readonly status: 'VERIFIED' | 'NOT_FOUND' | 'EXPIRED' | 'UNAVAILABLE' | 'SUSPENDED';
  readonly authorityName: string;
  readonly licenseNumber: string;
  readonly holderNameFa?: string;
  readonly officialReferenceNumber?: string;
  readonly expiryDateIso?: string;
  readonly isExpired: boolean;
  readonly failureReason?: string;
  readonly executionTimeMs: number;
}

export interface OfficialVerificationLinkMetadata {
  readonly authorityName: string;
  readonly verifiedDomain: string;
  readonly url: string;
  readonly isApproved: boolean;
}

export interface ProfessionalDomainEvent {
  readonly eventId: string;
  readonly eventType:
    | 'professional.profile_submitted'
    | 'agency.submitted'
    | 'agency.verified'
    | 'credential.submitted'
    | 'credential.reviewed'
    | 'membership.invited'
    | 'membership.accepted'
    | 'membership.terminated'
    | 'listing_association.created';
  readonly recipientUid: string;
  readonly relatedEntityId: string;
  readonly summaryFa: string;
  readonly timestampIso: string;
}
