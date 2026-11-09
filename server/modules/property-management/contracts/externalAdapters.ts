import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../../core';

export type CanonicalPropertyCategory =
  | 'RESIDENTIAL_UNIT'
  | 'MULTI_UNIT_BUILDING'
  | 'COMMERCIAL_UNIT'
  | 'OFFICE_UNIT'
  | 'MIXED_USE_BUILDING'
  | 'INDIVIDUAL_PROPERTY';

export interface CanonicalPropertyRegistrySnapshot {
  propertyRefId: string;
  buildingRefId?: string;
  unitRefId?: string;
  category: CanonicalPropertyCategory;
  verifiedOwnerUids: string[];
  supportsMultipleConcurrentOccupancies: boolean;
  maxConcurrentOccupancies?: number;
  geographicRef: {
    cityId: string;
    hoodId: number;
  };
  publicLocationSummaryFa: string;
  privateExactAddressFa: string;
  sharedFacilities?: string[];
  unitRefIdsInBuilding?: string[];
}

/**
 * Adapter contract for the Property Registry module.
 * Property Management never creates a competing property, building, or unit registry.
 */
export interface PropertyRegistryReadAdapter {
  getPropertyOrUnitSnapshot(propertyRefId: string): Promise<CanonicalPropertyRegistrySnapshot | null>;
}

export interface VerifiedDealReferenceSnapshot {
  dealId: string;
  propertyRefId: string;
  landlordUid: string;
  tenantUid: string;
  negotiationStatus: 'OFFER_SUBMITTED' | 'OFFER_ACCEPTED' | 'DEAL_CLOSED' | 'CANCELLED';
}

/**
 * Adapter contract for the Property Transactions module.
 * Links rental agreements to prior deal references without duplicating negotiation history.
 */
export interface PropertyTransactionsReadAdapter {
  getVerifiedDealReference(dealId: string): Promise<VerifiedDealReferenceSnapshot | null>;
}

export interface VerifiedServiceProviderSnapshot {
  providerId: string;
  active: boolean;
  supportedCategories: string[];
  verifiedCredentialState: 'VERIFIED' | 'UNVERIFIED' | 'SUSPENDED';
}

export interface VerifiedWorkOrderSnapshot {
  workOrderId: string;
  providerId: string;
  propertyRefId: string;
  status: 'CREATED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

/**
 * Adapter contract for the Property Services module.
 * Links maintenance requests to verified service providers and work orders without duplicating profiles.
 */
export interface PropertyServicesIntegrationAdapter {
  verifyServiceProvider(providerId: string): Promise<VerifiedServiceProviderSnapshot | null>;
  verifyWorkOrderReference(workOrderId: string, providerId: string): Promise<VerifiedWorkOrderSnapshot | null>;
}

/**
 * Adapter contract for the Geography module.
 */
export interface GeographyReadAdapter {
  validateGeographicReference(cityId: string, hoodId: number): Promise<{
    valid: boolean;
    cityNameFa?: string;
    hoodNameFa?: string;
  }>;
}

export type OperationalMediaVisibility =
  | 'PRIVATE_OPERATIONAL_EVIDENCE'
  | 'PARTICIPANT_RESTRICTED_DOCUMENT';

export interface VerifiedMediaReferenceSnapshot {
  mediaId: string;
  ownerUid: string;
  mimeType: string;
  visibility: OperationalMediaVisibility;
  retentionHoldActive: boolean;
}

/**
 * Adapter contract for the Media module.
 * Stores references and metadata only; never stores binary files in Property Management.
 */
export interface MediaReferenceAdapter {
  verifyMediaReferences(
    mediaIds: string[],
    actorUid: string,
  ): Promise<{ valid: boolean; records: VerifiedMediaReferenceSnapshot[]; invalidIds: string[] }>;
}

export type AuthoritativePaymentEventStatus =
  | 'PAYMENT_REPORTED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED_AUTHORITATIVE'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REVERSED'
  | 'PAYMENT_DISPUTED';

export interface AuthoritativePaymentVerificationResult {
  externalPaymentRefId: string;
  obligationId: string;
  agreementId: string;
  payerUid: string;
  amount: number;
  currency: 'IRT' | 'TOMAN' | 'IRR';
  status: AuthoritativePaymentEventStatus;
  providerId: string;
  authoritativeSignatureVerified: boolean;
  occurredAtIso: string;
}

/**
 * Strict Payment Integration Boundary Adapter (Section 11).
 * This module never collects money, stores bank/card credentials, holds deposits, or issues receipts.
 */
export interface PaymentAuthorityAdapter {
  verifyAuthoritativePaymentEvent(
    externalPaymentRefId: string,
  ): Promise<AuthoritativePaymentVerificationResult | null>;
}

export type PropertyManagementNotificationEventType =
  | 'AGREEMENT_COMMENCEMENT_APPROACHING'
  | 'RENT_OBLIGATION_APPROACHING'
  | 'RENT_OBLIGATION_OVERDUE'
  | 'PAYMENT_CONFIRMATION_RECEIVED'
  | 'RENEWAL_WINDOW_APPROACHING'
  | 'RENEWAL_REQUESTED'
  | 'RENEWAL_ACCEPTED'
  | 'RENEWAL_REJECTED'
  | 'TERMINATION_REQUESTED'
  | 'HANDOVER_SCHEDULED'
  | 'HANDOVER_COMPLETED'
  | 'INSPECTION_SCHEDULED'
  | 'MAINTENANCE_REQUEST_SUBMITTED'
  | 'MAINTENANCE_APPROVED'
  | 'MAINTENANCE_REJECTED'
  | 'MAINTENANCE_COMPLETED'
  | 'PROPERTY_INCIDENT_REPORTED';

export interface PropertyManagementNotificationOutboxEvent {
  eventId: string;
  eventType: PropertyManagementNotificationEventType;
  recipientUid: string;
  idempotencyKey: string;
  correlationId: string;
  occurredAtIso: string;
  sanitizedVariables: Record<string, string | number | boolean>;
}

/**
 * Adapter contract for the Notifications module.
 * Publishes domain events to durable outbox without sending SMS/email directly.
 */
export interface NotificationsEventPublisherAdapter {
  publishNotificationEvent(
    event: PropertyManagementNotificationOutboxEvent,
  ): Promise<{ accepted: boolean; outboxId: string }>;
}

export type TrustAndSafetyCaseCategory =
  | 'TENANT_LANDLORD_DISPUTE'
  | 'UNAUTHORIZED_PROPERTY_ACCESS'
  | 'SUSPECTED_IMPERSONATION'
  | 'FRAUDULENT_PAYMENT_CLAIM'
  | 'PROPERTY_DAMAGE_DISPUTE'
  | 'HARASSMENT_OR_SAFETY_REPORT'
  | 'UNAUTHORIZED_MANAGEMENT_ACTIVITY';

export interface TrustAndSafetyEscalationPayload {
  escalationId: string;
  category: TrustAndSafetyCaseCategory;
  reportingUid: string;
  subjectUid?: string;
  propertyRefId: string;
  relatedEntityType: 'OCCUPANCY' | 'AGREEMENT' | 'OBLIGATION' | 'HANDOVER' | 'MAINTENANCE' | 'INCIDENT' | 'AUTHORIZATION';
  relatedEntityId: string;
  summary: string;
  evidenceMediaIds: string[];
  correlationId: string;
  createdAtIso: string;
}

/**
 * Adapter contract for the Trust & Safety module.
 */
export interface TrustAndSafetyEscalationAdapter {
  escalateCase(
    payload: TrustAndSafetyEscalationPayload,
  ): Promise<{ investigationRefId: string; status: 'QUEUED_FOR_INVESTIGATION' }>;
}

/**
 * Optional separately verified legal policy interface for lease notice rules (Section 9).
 */
export interface LeaseLegalPolicyVerificationAdapter {
  evaluateTerminationNoticeWindow(params: {
    agreementId: string;
    agreementEndDateIso: string;
    intendedTerminationDateIso: string;
    requestedAtIso: string;
  }): Promise<{ policyVerified: boolean; policyReferenceCode: string; note: string }>;
}

export interface PropertyManagementModuleDependencies {
  txRunner: TransactionRunnerAdapter;
  adminStore?: DelegatedAdminStoreAdapter | null;
  tokenVerifier?: FirebaseTokenVerifierAdapter | null;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  nowFn?: () => number;
  propertyRegistry: PropertyRegistryReadAdapter;
  propertyTransactions?: PropertyTransactionsReadAdapter;
  propertyServices?: PropertyServicesIntegrationAdapter;
  geography?: GeographyReadAdapter;
  media?: MediaReferenceAdapter;
  paymentAuthority?: PaymentAuthorityAdapter;
  notifications?: NotificationsEventPublisherAdapter;
  trustAndSafety?: TrustAndSafetyEscalationAdapter;
  legalPolicy?: LeaseLegalPolicyVerificationAdapter;
}

export type { NormalizedTimestamp };
