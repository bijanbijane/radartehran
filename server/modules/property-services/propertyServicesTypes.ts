/**
 * @file server/modules/property-services/propertyServicesTypes.ts
 * @description Canonical data models, state machines, and interfaces for the Property Services Marketplace.
 */

export type ServiceGroupType =
  | 'construction_building'
  | 'renovation_interior'
  | 'repairs_maintenance'
  | 'materials_equipment'
  | 'property_professional'
  | 'specialized_custom';

export interface ServiceCategoryDefinition {
  readonly id: string; // e.g. "cat_arch", "cat_electrician", "cat_plumbing"
  readonly group: ServiceGroupType;
  readonly titleFa: string;
  readonly descriptionFa: string;
  readonly keywordsFa: readonly string[];
  readonly requiresProfessionalLicense: boolean;
  readonly isActive: boolean;
}

export type ProviderType =
  | 'individual_professional'
  | 'small_business'
  | 'registered_company'
  | 'supplier_distributor'
  | 'contractor_team';

export type VerificationState =
  | 'NOT_SUBMITTED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED';

export type CredentialType =
  | 'ENGINEERING_ORGANIZATION_LICENSE' // سازمان نظام مهندسی ساختمان
  | 'MUNICIPAL_CONTRACTOR_CERTIFICATE'  // صلاحیت پیمانکاری شهرداری
  | 'TRADE_UNION_BUSINESS_LICENSE'      // پروانه کسب اتحادیه
  | 'OFFICIAL_COMPANY_REGISTRATION'     // روزنامه رسمی و ثبت شرکت‌ها
  | 'TECHNICAL_VOCATIONAL_CERTIFICATE'  // مدرک فنی و حرفه‌ای
  | 'SPECIALIZED_SAFETY_CERTIFICATE';   // گواهی ایمنی (HSE)

export interface ProviderCredential {
  readonly id: string;
  readonly providerId: string;
  readonly credentialType: CredentialType;
  readonly issuingAuthorityFa: string;
  readonly licenseNumber: string;
  readonly issuanceDateIso?: string;
  readonly expiryDateIso?: string;
  readonly documentMediaId: string; // Private media reference in Media module
  readonly verificationState: VerificationState;
  readonly reviewerUid?: string;
  readonly reviewedAtIso?: string;
  readonly rejectionReasonFa?: string;
  readonly submittedAtIso: string;
  readonly updatedAtIso: string;
}

export interface ProviderServiceArea {
  readonly cityId: string;
  readonly districtIds?: readonly string[];
  readonly hoodIds?: readonly number[];
  readonly isCitywide: boolean;
  readonly isNationwide?: boolean;
}

export interface ProviderPublicProfile {
  readonly id: string;
  readonly userId: string; // Account reference from verified Auth
  readonly publicDisplayName: string;
  readonly businessName?: string;
  readonly providerType: ProviderType;
  readonly primaryCategoryIds: readonly string[];
  readonly descriptionFa: string;
  readonly serviceAreas: readonly ProviderServiceArea[];
  readonly portfolioMediaIds: readonly string[];
  readonly verificationState: VerificationState;
  readonly operatingStatus: 'active' | 'busy' | 'inactive';
  readonly completedJobsCount: number;
  readonly averageRating?: number; // 1.0 to 5.0
  readonly reviewCount: number;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface ProviderPrivateProfile extends ProviderPublicProfile {
  readonly contactPhone: string;
  readonly contactEmail?: string;
  readonly taxOrNationalId?: string;
  readonly officeAddressFa?: string;
  readonly bankIban?: string;
  readonly credentials: readonly ProviderCredential[];
  readonly internalAdminNotes?: string;
}

export type PricingModel =
  | 'FIXED_PRICE'
  | 'STARTING_PRICE'
  | 'HOURLY_RATE'
  | 'PER_SQM'
  | 'PROJECT_BASED_QUOTATION'
  | 'CONSULTATION_FEE'
  | 'UPON_INSPECTION'
  | 'NO_PUBLIC_PRICE';

export interface ServiceOfferingDocument {
  readonly id: string;
  readonly providerId: string;
  readonly categoryId: string;
  readonly titleFa: string;
  readonly descriptionFa: string;
  readonly pricingModel: PricingModel;
  readonly basePriceToman?: number;
  readonly maxPriceToman?: number;
  readonly unitLabelFa?: string; // e.g. "هر متر مربع", "ساعتی", "پروژه‌ای"
  readonly portfolioMediaIds: readonly string[];
  readonly publicationStatus: 'draft' | 'published' | 'archived';
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export type ServiceRequestStatus =
  | 'open'
  | 'in_review'
  | 'quoted'
  | 'accepted'
  | 'closed'
  | 'cancelled';

export interface ServiceRequestDocument {
  readonly id: string;
  readonly clientUid: string;
  readonly categoryId: string;
  readonly titleFa: string;
  readonly descriptionFa: string;
  readonly cityId: string;
  readonly hoodId?: number;
  readonly targetLocationText?: string;
  readonly budgetMaxToman?: number;
  readonly preferredScheduleFa?: string;
  readonly mediaReferences: readonly string[];
  readonly status: ServiceRequestStatus;
  readonly selectedQuotationId?: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export type QuotationStatus =
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export interface QuotationDocument {
  readonly id: string;
  readonly requestId: string;
  readonly providerId: string;
  readonly providerUserId: string;
  readonly clientUid: string;
  readonly priceToman: number;
  readonly scopeOfWorkFa: string;
  readonly exclusionsFa?: string;
  readonly estimatedDurationDays: number;
  readonly validityPeriodDays: number;
  readonly termsFa?: string;
  readonly status: QuotationStatus;
  readonly submittedAtIso: string;
  readonly updatedAtIso: string;
}

export type BookingLifecycleState =
  | 'REQUESTED'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface BookingDocument {
  readonly id: string;
  readonly requestId: string;
  readonly quotationId: string;
  readonly providerId: string;
  readonly clientUid: string;
  readonly categoryId: string;
  readonly agreedPriceToman: number;
  readonly currentState: BookingLifecycleState;
  readonly scheduledStartDateIso?: string;
  readonly completedAtIso?: string;
  readonly cancelledAtIso?: string;
  readonly cancellationReasonFa?: string;
  readonly statusHistory: readonly {
    readonly state: BookingLifecycleState;
    readonly changedByUid: string;
    readonly timestampIso: string;
    readonly noteFa?: string;
  }[];
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface ReviewDocument {
  readonly id: string;
  readonly bookingId: string;
  readonly providerId: string;
  readonly clientUid: string;
  readonly categoryId: string;
  readonly ratingScore: number; // 1 to 5
  readonly commentFa: string;
  readonly providerResponseFa?: string;
  readonly providerRespondedAtIso?: string;
  readonly isVerifiedCompletedWork: boolean;
  readonly moderationStatus: 'pending' | 'approved' | 'rejected';
  readonly createdAtIso: string;
}

export interface ModerationAuditEntry {
  readonly id: string;
  readonly entityType: 'provider' | 'offering' | 'credential' | 'review';
  readonly entityId: string;
  readonly action: 'approve' | 'reject' | 'suspend' | 'revoke' | 'reinstate';
  readonly reviewerUid: string;
  readonly reasonFa?: string;
  readonly timestampIso: string;
}

export type PropertyServicesEventType =
  | 'provider.profile_submitted'
  | 'provider.verified'
  | 'provider.suspended'
  | 'credential.submitted'
  | 'credential.reviewed'
  | 'service_request.created'
  | 'quotation.received'
  | 'quotation.accepted'
  | 'booking.status_changed'
  | 'booking.completed'
  | 'review.submitted';

export interface PropertyServicesDomainEvent {
  readonly eventId: string;
  readonly eventType: PropertyServicesEventType;
  readonly recipientUid: string;
  readonly relatedEntityId: string;
  readonly summaryFa: string;
  readonly timestampIso: string;
}
