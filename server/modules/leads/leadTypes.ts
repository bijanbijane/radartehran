/**
 * @file server/modules/leads/leadTypes.ts
 * @description Canonical data models, taxonomy, lifecycle states, and domain event contracts
 * for the Lead Management and Real Estate CRM backend module.
 */

export type LeadType =
  | 'PROPERTY_INQUIRY'
  | 'GENERAL_PROPERTY_REQUIREMENT'
  | 'COMMERCIAL_OFFICE_INQUIRY'
  | 'AGENCY_PROFESSIONAL_INQUIRY';

export type PropertyCategory =
  | 'RESIDENTIAL_APARTMENT'
  | 'RESIDENTIAL_VILLA'
  | 'RESIDENTIAL_LAND'
  | 'OFFICE_SPACE'
  | 'RETAIL_SHOP'
  | 'COMMERCIAL_BUILDING'
  | 'WAREHOUSE_INDUSTRIAL'
  | 'BUSINESS_PREMISES'
  | 'INVESTMENT_PROPERTY';

export type LeadTransactionType = 'BUY' | 'RENT' | 'MORTGAGE' | 'PRE_SALE';

export type InquiryIntent =
  | 'CALLBACK_REQUEST'
  | 'PROPERTY_VISIT_REQUEST'
  | 'ADDITIONAL_INFO'
  | 'FINAL_PRICE_INQUIRY'
  | 'NEGOTIATION_CONDITIONS'
  | 'DOCUMENTS_PHOTOS_REQUEST'
  | 'DIRECT_CONSULTATION';

export type PreferredContactMethod =
  | 'PHONE'
  | 'SMS'
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'IN_APP_MESSAGE'
  | 'EMAIL';

/**
 * Controlled Lead Lifecycle State Machine.
 * Explicit Invariant: 'SUCCESSFUL' is a CRM outcome, NOT proof of a legally completed property transaction.
 */
export type LeadLifecycleState =
  | 'NEW'
  | 'AWAITING_ASSIGNMENT'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'CONTACT_ATTEMPTED'
  | 'CONTACTED'
  | 'FOLLOW_UP_REQUIRED'
  | 'VISIT_SCHEDULED'
  | 'NEGOTIATION'
  | 'SUCCESSFUL'
  | 'UNSUCCESSFUL'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED';

export type LeadAssignmentStatus =
  | 'UNASSIGNED'
  | 'ASSIGNED_TO_AGENCY'
  | 'ASSIGNED_TO_BRANCH'
  | 'ASSIGNED_TO_PROFESSIONAL'
  | 'REJECTED_BY_ASSIGNEE';

export type LeadPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type LeadSourceChannel =
  | 'PUBLIC_LISTING_PAGE'
  | 'GENERAL_CRM_PORTAL'
  | 'AGENCY_PROFILE_PAGE'
  | 'MOBILE_APP'
  | 'EXTERNAL_REFERRAL';

export type ActivityVisibility = 'PUBLIC_CUSTOMER' | 'INTERNAL_CRM';

export type LeadActivityType =
  | 'LEAD_CREATED'
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_ACCEPTED'
  | 'ASSIGNMENT_REJECTED'
  | 'CALL_ATTEMPTED'
  | 'CUSTOMER_CONTACTED'
  | 'MESSAGE_SENT'
  | 'VISIT_REQUESTED'
  | 'VISIT_SCHEDULED'
  | 'VISIT_COMPLETED'
  | 'NEGOTIATION_UPDATED'
  | 'FOLLOW_UP_SCHEDULED'
  | 'LEAD_CLOSED'
  | 'LEAD_REOPENED'
  | 'CONSENT_WITHDRAWN'
  | 'INTERNAL_NOTE_ADDED';

/**
 * Auditable customer consent record.
 * Never a hardcoded boolean; captures explicit purpose, version, and channels.
 */
export interface CustomerConsentRecord {
  readonly id: string;
  readonly customerUid: string;
  readonly consentPurpose: string;
  readonly consentTextVersion: string;
  readonly timestampIso: string;
  readonly communicationChannels: readonly PreferredContactMethod[];
  readonly marketingOptIn: boolean;
  readonly agencySharingConsent: boolean;
  readonly withdrawalTimestampIso?: string;
  readonly withdrawalReasonFa?: string;
}

/**
 * Structured customer requirement criteria for property inquiries and general requests.
 */
export interface LeadCustomerRequirements {
  readonly cityId: string;
  readonly hoodId?: number;
  readonly propertyCategory: PropertyCategory;
  readonly transactionType: LeadTransactionType;
  readonly budgetMinMillion?: number;
  readonly budgetMaxMillion?: number;
  readonly rentMinMillion?: number;
  readonly rentMaxMillion?: number;
  readonly sqmMin?: number;
  readonly sqmMax?: number;
  readonly roomsMin?: number;
  readonly roomsMax?: number;
  readonly requiredFeatures?: readonly string[];
  readonly commercialAttributes?: {
    readonly powerKW?: number;
    readonly ceilingHeightMeters?: number;
    readonly parkingSpots?: number;
    readonly commercialLicenseZone?: boolean;
    readonly loadingDockAvailable?: boolean;
  };
  readonly preferredVisitTime?: string;
  readonly customerNoteFa?: string;
}

/**
 * Lead assignment record tracking current and past assignees.
 */
export interface LeadAssignmentRecord {
  readonly assignmentId: string;
  readonly assignedToType: 'PROFESSIONAL' | 'AGENCY' | 'BRANCH';
  readonly agencyId?: string;
  readonly branchId?: string;
  readonly professionalId?: string;
  readonly assignedByUid: string;
  readonly assignedAtIso: string;
  readonly status: LeadAssignmentStatus;
  readonly acceptedAtIso?: string;
  readonly rejectedAtIso?: string;
  readonly rejectionReasonFa?: string;
  readonly notesFa?: string;
}

/**
 * Contact data access audit log entry.
 */
export interface ContactAccessAuditEntry {
  readonly id: string;
  readonly leadId: string;
  readonly accessedByUid: string;
  readonly accessedRole: string;
  readonly accessPurposeFa: string;
  readonly timestampIso: string;
  readonly ipAddressOrSubnet?: string;
}

/**
 * Activity timeline item.
 */
export interface LeadActivityRecord {
  readonly id: string;
  readonly leadId: string;
  readonly activityType: LeadActivityType;
  readonly actorUid: string;
  readonly actorRole: 'CUSTOMER' | 'PROFESSIONAL' | 'AGENCY_MANAGER' | 'ADMIN' | 'SYSTEM';
  readonly timestampIso: string;
  readonly transition?: {
    readonly fromState: LeadLifecycleState;
    readonly toState: LeadLifecycleState;
  };
  readonly notesFa?: string;
  readonly visibility: ActivityVisibility;
  readonly scheduledAtIso?: string;
  readonly followUpCompletedAtIso?: string;
}

/**
 * Canonical Lead Record stored securely in CRM persistence.
 */
export interface LeadRecord {
  readonly id: string;
  readonly leadType: LeadType;
  readonly customerAccountUid: string;
  readonly customerDisplayName: string;
  readonly customerPhone: string; // Strictly protected, never returned in public projections
  readonly customerEmail?: string;
  readonly targetListingId?: string;
  readonly targetAgencyId?: string;
  readonly targetBranchId?: string;
  readonly targetProfessionalId?: string;
  readonly intent: InquiryIntent;
  readonly requirements: LeadCustomerRequirements;
  readonly preferredContactMethod: PreferredContactMethod;
  readonly consent: CustomerConsentRecord;
  readonly assignmentStatus: LeadAssignmentStatus;
  readonly currentAssignment?: LeadAssignmentRecord;
  readonly assignmentHistory: readonly LeadAssignmentRecord[];
  readonly lifecycleState: LeadLifecycleState;
  readonly stateHistory: readonly {
    readonly fromState: LeadLifecycleState;
    readonly toState: LeadLifecycleState;
    readonly actorUid: string;
    readonly timestampIso: string;
    readonly reasonFa?: string;
  }[];
  readonly priority: LeadPriority;
  readonly sourceChannel: LeadSourceChannel;
  readonly idempotencyKey: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly lastActivityAtIso: string;
  readonly firstResponseAtIso?: string;
  readonly closedAtIso?: string;
  readonly closureReasonFa?: string;
  readonly isAnonymized?: boolean;
}

/**
 * Customer-Facing Lead Projection:
 * Customer sees only their own leads; internal CRM notes and commission details are strictly excluded.
 */
export interface CustomerLeadProjection {
  readonly id: string;
  readonly leadType: LeadType;
  readonly targetListingId?: string;
  readonly targetAgencyId?: string;
  readonly targetProfessionalId?: string;
  readonly intent: InquiryIntent;
  readonly requirements: LeadCustomerRequirements;
  readonly preferredContactMethod: PreferredContactMethod;
  readonly lifecycleState: LeadLifecycleState;
  readonly priority: LeadPriority;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly lastActivityAtIso: string;
  readonly closureReasonFa?: string;
}

/**
 * Professional / Agency CRM Lead Projection:
 * Customer phone and contact details are available ONLY if consent is valid and user is authorized assignee.
 */
export interface ProfessionalLeadProjection {
  readonly id: string;
  readonly leadType: LeadType;
  readonly customerDisplayName: string;
  readonly customerContactAvailable: boolean;
  readonly customerPhoneMasked: string; // e.g. "0912***4567"
  readonly targetListingId?: string;
  readonly targetAgencyId?: string;
  readonly targetBranchId?: string;
  readonly targetProfessionalId?: string;
  readonly intent: InquiryIntent;
  readonly requirements: LeadCustomerRequirements;
  readonly preferredContactMethod: PreferredContactMethod;
  readonly assignmentStatus: LeadAssignmentStatus;
  readonly currentAssigneeUid?: string;
  readonly lifecycleState: LeadLifecycleState;
  readonly priority: LeadPriority;
  readonly sourceChannel: LeadSourceChannel;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly lastActivityAtIso: string;
  readonly firstResponseAtIso?: string;
  readonly responseTimeMinutes?: number;
  readonly closureReasonFa?: string;
}

/**
 * Versioned Domain Event Contracts.
 * Omits full phone numbers, private notes, and raw customer PII.
 */
export interface LeadDomainEvent {
  readonly eventId: string;
  readonly eventType:
    | 'lead.created'
    | 'lead.assigned'
    | 'lead.assignment_accepted'
    | 'lead.assignment_rejected'
    | 'lead.status_changed'
    | 'lead.follow_up_scheduled'
    | 'lead.visit_scheduled'
    | 'lead.closed'
    | 'lead.reopened'
    | 'lead.consent_withdrawn';
  readonly leadId: string;
  readonly leadType: LeadType;
  readonly customerUid: string;
  readonly targetListingId?: string;
  readonly agencyId?: string;
  readonly professionalId?: string;
  readonly lifecycleState: LeadLifecycleState;
  readonly timestampIso: string;
  readonly summaryFa: string;
}

/**
 * CRM Operational Performance Metrics.
 */
export interface LeadOperationalMetrics {
  readonly periodStartIso: string;
  readonly periodEndIso: string;
  readonly totalLeadsCount: number;
  readonly newLeadsCount: number;
  readonly assignedLeadsCount: number;
  readonly contactedLeadsCount: number;
  readonly scheduledVisitsCount: number;
  readonly openNegotiationsCount: number;
  readonly successfulLeadsCount: number;
  readonly unsuccessfulLeadsCount: number;
  readonly averageResponseTimeMinutes?: number;
  readonly medianResponseTimeMinutes?: number;
  readonly followUpCompletionRatePercent?: number;
}
