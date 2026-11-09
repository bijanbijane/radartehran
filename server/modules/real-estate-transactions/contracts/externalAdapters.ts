import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../../core';

export type TransactionCurrencyCode = 'TOMAN' | 'IRR' | 'USD' | 'EUR';

/**
 * 1. Canonical Property Registry Read Adapter (Section 3A, 4)
 */
export interface CanonicalTransactionPropertySnapshot {
  canonicalPropertyId: string;
  cityId: string;
  districtId?: string;
  propertyCategory: 'RESIDENTIAL' | 'COMMERCIAL' | 'OFFICE' | 'RETAIL' | 'LAND';
  registeredOwnerParticipantRef?: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface RealEstateTransactionPropertyRegistryReadAdapter {
  getCanonicalPropertyById(
    canonicalPropertyId: string,
  ): Promise<CanonicalTransactionPropertySnapshot | null>;
}

/**
 * 2. Bargains / Listing Origin Read Adapter (Section 4)
 */
export interface ListingOriginReferenceSnapshot {
  listingId: string;
  canonicalPropertyId: string;
  askingPriceTotal?: number | null;
  askingMonthlyRent?: number | null;
  askingSecurityDeposit?: number | null;
  currency: TransactionCurrencyCode;
}

export interface RealEstateTransactionBargainsReadAdapter {
  getListingOriginById(listingId: string): Promise<ListingOriginReferenceSnapshot | null>;
}

/**
 * 3. Property Due Diligence Read Adapter (Section 3I, 4)
 */
export interface DueDiligenceCaseReadinessSnapshot {
  dueDiligenceCaseId: string;
  canonicalPropertyId: string;
  overallState:
    | 'NOT_STARTED'
    | 'IN_PROGRESS'
    | 'INCOMPLETE'
    | 'BLOCKED'
    | 'COMPLETED_WITH_FINDINGS'
    | 'COMPLETED_WITHOUT_IDENTIFIED_FINDINGS';
  hasBlockingFindings: boolean;
  assessmentVersion: number;
}

export interface RealEstateTransactionDueDiligenceReadAdapter {
  getDueDiligenceCaseReadiness(
    dueDiligenceCaseId: string,
  ): Promise<DueDiligenceCaseReadinessSnapshot | null>;
}

/**
 * 4. Media Document Reference Read Adapter (Section 3F, 4)
 */
export interface TransactionMediaDocumentSnapshot {
  mediaId: string;
  sha256Checksum: string;
  mimeType: string;
  uploadedAtIso: string;
}

export interface RealEstateTransactionMediaReadAdapter {
  verifyDocumentReference(mediaId: string): Promise<TransactionMediaDocumentSnapshot | null>;
}

/**
 * 5. Authoritative Payment Verification Read Adapter (Section 3H, 4)
 * This module NEVER processes payments or trusts client-supplied payment confirmations.
 */
export type PaymentReferenceLifecycleState =
  | 'NOT_DUE'
  | 'DUE'
  | 'INITIATED'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'FAILED'
  | 'REFUNDED'
  | 'DISPUTED'
  | 'UNKNOWN';

export interface AuthoritativePaymentReferenceVerification {
  externalPaymentReferenceId: string;
  verifiedByPaymentModule: boolean;
  paymentState: PaymentReferenceLifecycleState;
  confirmedAmount: number | null;
  currency: TransactionCurrencyCode;
  verifiedAtIso: string;
  providerReferenceCode: string | null;
}

export interface RealEstateTransactionPaymentVerificationReadAdapter {
  verifyAuthoritativePaymentReference(
    externalPaymentReferenceId: string,
  ): Promise<AuthoritativePaymentReferenceVerification | null>;
}

/**
 * 6. Notifications & Property Management Handoff Outbox Adapter (Section 4)
 */
export interface TransactionEventNotificationPayload {
  eventId: string;
  transactionId: string;
  canonicalPropertyId: string;
  eventType:
    | 'PARTICIPANT_INVITED'
    | 'OFFER_SUBMITTED'
    | 'COUNTEROFFER_SUBMITTED'
    | 'OFFER_ACCEPTED'
    | 'MILESTONE_UPDATED'
    | 'TRANSACTION_COMPLETED'
    | 'TRANSACTION_CANCELLED'
    | 'TRANSACTION_DISPUTED';
  recipientUids: string[];
  occurredAtIso: string;
}

export interface RealEstateTransactionNotificationsAdapter {
  publishTransactionEvent(payload: TransactionEventNotificationPayload): Promise<void>;
}

export interface RealEstateTransactionsModuleDependencies {
  txRunner: TransactionRunnerAdapter;
  adminStore?: DelegatedAdminStoreAdapter | null;
  tokenVerifier?: FirebaseTokenVerifierAdapter | null;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  authorizedCoordinatorUids?: string[];
  nowFn?: () => number;
  propertyRegistry: RealEstateTransactionPropertyRegistryReadAdapter;
  bargains?: RealEstateTransactionBargainsReadAdapter;
  dueDiligence?: RealEstateTransactionDueDiligenceReadAdapter;
  media?: RealEstateTransactionMediaReadAdapter;
  payments?: RealEstateTransactionPaymentVerificationReadAdapter;
  notifications?: RealEstateTransactionNotificationsAdapter;
}

export type { NormalizedTimestamp };
