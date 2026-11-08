/**
 * @file server/modules/payments/paymentTypes.ts
 * @description Canonical financial data models, payment lifecycles, ledger structures,
 * wallet contracts, and domain events for Employee 15 — Payments, Wallet & Settlement Backend.
 */

export type PaymentLifecycleState =
  | 'CREATED'
  | 'PENDING'
  | 'REDIRECT_REQUIRED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'DISPUTED';

export type PaymentCurrency = 'IRR' | 'IRT'; // Rial or Toman minor units

export type OriginatingBusinessModule =
  | 'SPONSORS'
  | 'PROPERTY_SERVICES'
  | 'SUBSCRIPTIONS'
  | 'PLATFORM_SERVICES'
  | 'WALLET';

export type PaymentPurpose =
  | 'SPONSOR_CAMPAIGN_RESERVATION'
  | 'SERVICE_BOOKING_DEPOSIT'
  | 'SERVICE_FINAL_SETTLEMENT'
  | 'PRO_SUBSCRIPTION_MONTHLY'
  | 'AGENCY_SUBSCRIPTION_ANNUAL'
  | 'FEATURED_LISTING_FEE'
  | 'WALLET_TOPUP';

export type LedgerEntryType = 'DEBIT' | 'CREDIT';

export type SettlementStatus =
  | 'PENDING'
  | 'ELIGIBLE'
  | 'RESERVED'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'REVERSED'
  | 'ON_HOLD';

export type RefundStatus =
  | 'REQUESTED'
  | 'AUTHORIZED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

/**
 * Payment Intent: Represents a customer's intention to pay for a verified business object.
 * Invariant: Amount is an integer minor unit (no floating point) validated by the originating module.
 */
export interface PaymentIntent {
  readonly id: string;
  readonly customerUid: string;
  readonly businessModule: OriginatingBusinessModule;
  readonly businessObjectId: string;
  readonly purpose: PaymentPurpose;
  readonly amount: number; // Integer minor units (e.g. Rials)
  readonly currency: PaymentCurrency;
  readonly descriptionFa: string;
  readonly providerId: string;
  readonly providerTransactionReference?: string;
  readonly idempotencyKey: string;
  readonly lifecycleState: PaymentLifecycleState;
  readonly expiresAtIso: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly failureReasonFa?: string;
  readonly refundedAmount: number;
}

/**
 * Payment Attempt: Individual gateway attempt for a payment intent.
 */
export interface PaymentAttempt {
  readonly id: string;
  readonly intentId: string;
  readonly attemptNumber: number;
  readonly providerId: string;
  readonly providerTransactionReference?: string;
  readonly redirectUrl?: string;
  readonly startedAtIso: string;
  readonly completedAtIso?: string;
  readonly isSuccess: boolean;
  readonly verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED' | 'REJECTED';
  readonly normalizedErrorCode?: string;
  readonly rawProviderStatusCode?: string;
  readonly errorMessageFa?: string;
}

/**
 * Double-Entry Financial Ledger Entry.
 * Invariant: For every balanced transaction, sum(DEBIT) == sum(CREDIT) within the same currency.
 */
export interface LedgerEntry {
  readonly id: string;
  readonly transactionReference: string; // Groups balancing entries
  readonly accountId: string; // e.g. "wallet:uid", "platform:escrow", "platform:revenue"
  readonly entryType: LedgerEntryType;
  readonly amount: number; // Positive integer minor units
  readonly currency: PaymentCurrency;
  readonly timestampIso: string;
  readonly descriptionFa: string;
  readonly sourceBusinessModule: OriginatingBusinessModule;
  readonly sourceBusinessObjectId: string;
  readonly reversalReference?: string;
}

/**
 * Balanced Journal Transaction.
 */
export interface JournalTransaction {
  readonly transactionId: string;
  readonly entries: readonly LedgerEntry[];
  readonly currency: PaymentCurrency;
  readonly timestampIso: string;
  readonly idempotencyKey: string;
}

/**
 * Wallet Subsystem Account.
 */
export interface WalletAccount {
  readonly walletId: string;
  readonly ownerUid: string;
  readonly ownerType: 'USER' | 'AGENCY' | 'SERVICE_PROVIDER' | 'PLATFORM';
  readonly currency: PaymentCurrency;
  readonly availableBalance: number; // Derived from posted ledger
  readonly reservedBalance: number; // Pending settlements or active dispute holds
  readonly pendingBalance: number; // Unsettled incoming transactions
  readonly isActive: boolean;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

/**
 * Refund Record.
 */
export interface RefundRecord {
  readonly id: string;
  readonly paymentIntentId: string;
  readonly amount: number; // Positive integer <= original payment
  readonly currency: PaymentCurrency;
  readonly reasonFa: string;
  readonly requestedByUid: string;
  readonly authorizedByUid?: string;
  readonly status: RefundStatus;
  readonly providerRefundReference?: string;
  readonly createdAtIso: string;
  readonly completedAtIso?: string;
  readonly failureReasonFa?: string;
}

/**
 * Commission / Platform Fee Calculation Record.
 */
export interface CommissionRecord {
  readonly id: string;
  readonly paymentIntentId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly calculationMethod: 'FIXED' | 'PERCENTAGE' | 'TIERED';
  readonly baseAmount: number;
  readonly commissionAmount: number;
  readonly currency: PaymentCurrency;
  readonly effectiveTimestampIso: string;
  readonly relatedBusinessObjectId: string;
}

/**
 * Settlement / Provider Payout Record.
 */
export interface SettlementRecord {
  readonly id: string;
  readonly payeeUid: string;
  readonly payeeType: 'AGENCY' | 'SERVICE_PROVIDER';
  readonly periodStartIso: string;
  readonly periodEndIso: string;
  readonly grossAmount: number;
  readonly commissionDeduction: number;
  readonly refundDeduction: number;
  readonly netPayableAmount: number;
  readonly currency: PaymentCurrency;
  readonly status: SettlementStatus;
  readonly payoutReference?: string;
  readonly executedAtIso?: string;
  readonly failureReasonFa?: string;
  readonly relatedPaymentIntentIds: readonly string[];
}

/**
 * Reconciliation Discrepancy Record.
 */
export interface ReconciliationDiscrepancy {
  readonly id: string;
  readonly discrepancyType:
    | 'STATUS_MISMATCH'
    | 'AMOUNT_MISMATCH'
    | 'CURRENCY_MISMATCH'
    | 'DUPLICATE_PROVIDER_TX'
    | 'MISSING_INTERNAL_RECORD'
    | 'MISSING_SETTLEMENT_REPORT';
  readonly internalIntentId?: string;
  readonly providerTransactionReference?: string;
  readonly internalStatus?: PaymentLifecycleState;
  readonly providerStatus?: string;
  readonly internalAmount?: number;
  readonly providerAmount?: number;
  readonly detectedAtIso: string;
  readonly resolutionStatus: 'UNRESOLVED' | 'REVIEWED' | 'RESOLVED' | 'DISMISSED';
  readonly resolutionNotesFa?: string;
}

/**
 * Versioned Payment Domain Events.
 * Strictly excludes payment cards, CVV, passwords, and raw secrets.
 */
export interface PaymentDomainEvent {
  readonly eventId: string;
  readonly eventType:
    | 'payment.intent_created'
    | 'payment.attempt_started'
    | 'payment.succeeded'
    | 'payment.failed'
    | 'payment.refund_succeeded'
    | 'payment.wallet_entry_posted'
    | 'payment.commission_calculated'
    | 'payment.settlement_created'
    | 'payment.payout_succeeded'
    | 'payment.discrepancy_detected';
  readonly paymentIntentId?: string;
  readonly customerUid?: string;
  readonly businessModule?: OriginatingBusinessModule;
  readonly businessObjectId?: string;
  readonly amount?: number;
  readonly currency?: PaymentCurrency;
  readonly timestampIso: string;
  readonly summaryFa: string;
}
