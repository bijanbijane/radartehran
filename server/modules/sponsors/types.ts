import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../core';

export type SponsorSupportedCityId = 'tehran' | 'karaj' | 'mashhad' | 'isfahan' | 'shiraz';

export type SponsorPlanMonths = 1 | 3;

/**
 * Canonical sponsorship reservation lifecycle statuses.
 * - `pending_review`: Submitted by sponsor; awaiting admin review.
 * - `approved_awaiting_payment`: Approved by admin, awaiting verified payment event before going live.
 * - `active`: Approved and payment-verified (or free-tier/waived by policy); live on neighborhood slot.
 * - `rejected`: Rejected by admin moderation; neighborhood slot lock released.
 * - `cancelled`: Cancelled by the sponsor owner; neighborhood slot lock released.
 * - `expired`: Passed `expiresAt`; neighborhood slot lock released.
 */
export type SponsorReservationStatus =
  | 'pending_review'
  | 'approved_awaiting_payment'
  | 'active'
  | 'rejected'
  | 'cancelled'
  | 'expired';

/**
 * Provider-agnostic payment statuses.
 * Never trusted from client request bodies; only mutated via verified server-side payment events.
 */
export type SponsorPaymentStatus =
  | 'unpaid'
  | 'payment_pending'
  | 'paid_verified'
  | 'waived_by_policy'
  | 'refunded'
  | 'failed';

export type SlotAvailabilityStatus = 'available' | 'reserved_pending' | 'active_occupied';

/**
 * Provider-agnostic verified payment event contract.
 * Does not invent or hardcode any specific gateway (e.g. Zarinpal/IDPay/Stripe);
 * instead requires cryptographic/adapter verification before mutating payment state.
 */
export interface VerifiedPaymentEventInput {
  eventId: string;
  reservationId: string;
  amountMillionToman: number;
  externalReferenceId: string;
  verificationSignature: string;
  occurredAtIso: string;
}

export interface PaymentVerificationAdapter {
  verifyPaymentEvent: (
    event: VerifiedPaymentEventInput,
    expectedAmountMillion: number,
  ) => Promise<{ verified: boolean; reason?: string }>;
}

export interface SponsorNeighborhoodSlot {
  cityId: SponsorSupportedCityId;
  hoodId: number;
  hoodName: string;
  baseMonthlyTariffMillion: number;
}

export interface SponsorSlotCatalogAdapter {
  resolveNeighborhoodSlot: (
    cityId: SponsorSupportedCityId,
    hoodId: number,
  ) => SponsorNeighborhoodSlot | null;
}

/**
 * Durable neighborhood slot lock stored at `/sponsorSlotLocks/{cityId}_hood_{hoodId}`.
 * Guarantees at most one active or pending-held sponsorship per neighborhood slot.
 */
export interface SponsorSlotLockRecord {
  slotKey: string;
  cityId: SponsorSupportedCityId;
  hoodId: number;
  reservationId: string;
  ownerUid: string;
  status: 'held_pending' | 'active' | 'released';
  updatedAt: NormalizedTimestamp;
  expiresAt?: NormalizedTimestamp;
}

/**
 * Canonical stored sponsor reservation in `/sponsorRequests/{reservationId}`.
 */
export interface StoredSponsorReservation {
  id: string;
  slotKey: string;
  ownerUid: string;
  ownerEmail: string;
  cityId: SponsorSupportedCityId;
  hoodId: number;
  hoodName: string;
  agencyName: string;
  phone: string;
  specialty: string;
  experienceYears: number;
  planMonths: SponsorPlanMonths;
  monthlyTariffMillion: number;
  totalPayableMillion: number;
  trackingCode: string;
  status: SponsorReservationStatus;
  paymentStatus: SponsorPaymentStatus;
  paymentReferenceId?: string;
  paidAt?: NormalizedTimestamp;
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
  approvedAt?: NormalizedTimestamp;
  approvedByUid?: string;
  expiresAt?: NormalizedTimestamp;
  cancelledAt?: NormalizedTimestamp;
  rejectionReason?: string;
}

/**
 * Durable state-change audit entry stored at `/sponsorAuditTrail/{eventId}`.
 */
export interface SponsorAuditHistoryRecord {
  eventId: string;
  reservationId: string;
  slotKey: string;
  actorUid: string;
  actorRole: string;
  action: string;
  fromStatus: SponsorReservationStatus | 'none';
  toStatus: SponsorReservationStatus;
  paymentStatus: SponsorPaymentStatus;
  revision: number;
  timestampIso: string;
  note?: string;
}

/**
 * Owner-authorized view of a sponsor reservation.
 */
export interface OwnerSponsorReservationView {
  id: string;
  slotKey: string;
  ownerUid: string;
  cityId: SponsorSupportedCityId;
  hoodId: number;
  hoodName: string;
  agencyName: string;
  phone: string;
  specialty: string;
  experienceYears: number;
  planMonths: SponsorPlanMonths;
  monthlyTariffMillion: number;
  totalPayableMillion: number;
  trackingCode: string;
  status: SponsorReservationStatus;
  paymentStatus: SponsorPaymentStatus;
  paymentReferenceId?: string;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
  expiresAtIso?: string;
  rejectionReason?: string;
}

/**
 * Public placement projection containing ONLY active, non-expired placement display data.
 * Never exposes ownerUid, ownerEmail, trackingCode, paymentStatus, totalPayableMillion, or rejectionReason.
 */
export interface PublicSponsorPlacementProjection {
  cityId: SponsorSupportedCityId;
  hoodId: number;
  hoodName: string;
  agencyName: string;
  phone: string;
  specialty: string;
  experienceYears: number;
  planMonths: SponsorPlanMonths;
  expiresAtIso: string;
}

export interface SubmitSponsorReservationInput {
  cityId: SponsorSupportedCityId;
  hoodId: number;
  agencyName: string;
  phone: string;
  specialty: string;
  experienceYears: number;
  planMonths: SponsorPlanMonths;
}

export interface ModerateSponsorReservationInput {
  decision: 'approve' | 'reject';
  expectedRevision?: number;
  waivePaymentRequirement?: boolean;
  rejectionReason?: string;
}

export interface CancelSponsorReservationInput {
  expectedRevision: number;
  reason?: string;
}

export interface SponsorsModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  slotCatalog?: SponsorSlotCatalogAdapter;
  paymentVerifier?: PaymentVerificationAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  nowFn?: () => number;
}
