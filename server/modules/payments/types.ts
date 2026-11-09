import type {
  AuditEventSink,
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core';

export type SupportedPaymentCurrency = 'IRT' | 'IRR';

export type PaymentLifecycleStatus =
  | 'created'
  | 'pending'
  | 'redirect_required'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refund_pending'
  | 'partially_refunded'
  | 'refunded'
  | 'disputed';

export type PaymentAttemptStatus = 'pending' | 'succeeded' | 'failed';

export type PaymentVerificationStatus = 'unverified' | 'verified' | 'failed_verification';

export type RefundLifecycleStatus =
  | 'requested'
  | 'authorized'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type SettlementBatchStatus =
  | 'pending'
  | 'eligible'
  | 'reserved'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'reversed'
  | 'on_hold';

export type WalletOwnerType = 'user' | 'agency' | 'service_provider';

export type BusinessModuleOrigin =
  | 'sponsors'
  | 'property_services'
  | 'subscriptions'
  | 'listings'
  | 'marketplace'
  | 'wallet';

export type LedgerAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type LedgerEntryDirection = 'DEBIT' | 'CREDIT';

/**
 * Authoritative Payment Intent record.
 * Amounts are strictly positive integers (no floating point numbers).
 */
export interface StoredPaymentIntent {
  id: string;
  customerAccountRef: string;
  businessModuleId: BusinessModuleOrigin;
  businessObjectId: string;
  paymentPurpose: string;
  amount: number;
  currency: SupportedPaymentCurrency;
  description: string;
  providerId: string | null;
  providerTxRef: string | null;
  idempotencyKey: string;
  status: PaymentLifecycleStatus;
  totalRefundedAmount: number;
  expiresAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
  metadata: Record<string, unknown>;
}

/**
 * Isolated Payment Attempt record.
 * One payment intent may have multiple sequential attempts.
 */
export interface StoredPaymentAttempt {
  id: string;
  paymentIntentId: string;
  providerId: string;
  providerTxRef: string | null;
  attemptNumber: number;
  startedAtIso: string;
  completedAtIso: string | null;
  result: PaymentAttemptStatus;
  normalizedErrorCode: string | null;
  providerResponseRef: string | null;
  verificationStatus: PaymentVerificationStatus;
}

/**
 * Double-entry ledger journal entry.
 */
export interface LedgerJournalEntry {
  entryId: string;
  accountRef: string;
  accountType: LedgerAccountType;
  direction: LedgerEntryDirection;
  amount: number;
  memo?: string;
}

/**
 * Immutable balanced journal transaction.
 * Invariant: sum(DEBIT) === sum(CREDIT) within the same currency.
 */
export interface StoredJournalTransaction {
  id: string;
  timestampIso: string;
  currency: SupportedPaymentCurrency;
  sourceBusinessRef: {
    module: BusinessModuleOrigin;
    objectId: string;
    action: string;
  };
  description: string;
  idempotencyKey: string;
  entries: LedgerJournalEntry[];
  reversalRef?: string;
}

/**
 * Wallet Account balance model.
 * All balances derived from or reconciled with ledger operations.
 */
export interface StoredWalletAccount {
  id: string;
  ownerUid: string;
  ownerType: WalletOwnerType;
  currency: SupportedPaymentCurrency;
  availableBalance: number;
  reservedBalance: number;
  pendingBalance: number;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Authoritative Refund record.
 */
export interface StoredRefundRecord {
  id: string;
  paymentIntentId: string;
  amount: number;
  currency: SupportedPaymentCurrency;
  reason: string;
  requestedByUid: string;
  authorizedByUid: string | null;
  status: RefundLifecycleStatus;
  providerRefundRef: string | null;
  idempotencyKey: string;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Commission calculation policy.
 */
export interface CommissionPolicy {
  policyId: string;
  policyVersion: string;
  category: string;
  calculationMethod: 'percentage' | 'fixed' | 'tiered';
  percentageBps?: number;
  fixedAmount?: number;
  minFee?: number;
  maxFee?: number;
  tierThresholds?: Array<{ upToAmount: number; rateBps: number }>;
}

export interface CommissionCalculationResult {
  policyId: string;
  policyVersion: string;
  baseAmount: number;
  commissionAmount: number;
  netPayableAmount: number;
  currency: SupportedPaymentCurrency;
  calculationMethod: string;
  calculatedAtIso: string;
}

/**
 * Settlement Batch for provider and agency payouts.
 */
export interface StoredSettlementBatch {
  id: string;
  payeeRef: string;
  payeeType: 'service_provider' | 'agency' | 'platform';
  periodStartIso: string;
  periodEndIso: string;
  grossAmount: number;
  commissionDeductions: number;
  refundDeductions: number;
  netPayableAmount: number;
  currency: SupportedPaymentCurrency;
  status: SettlementBatchStatus;
  payoutRef: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Financial Reconciliation discrepancy report.
 */
export type ReconciliationDiscrepancyType =
  | 'PROVIDER_SUCCESS_INTERNAL_PENDING'
  | 'INTERNAL_SUCCESS_PROVIDER_FAILED'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'DUPLICATE_PROVIDER_TRANSACTION'
  | 'MISSING_PROVIDER_RECORD'
  | 'UNBALANCED_LEDGER_TRANSACTION';

export interface ReconciliationDiscrepancy {
  discrepancyId: string;
  type: ReconciliationDiscrepancyType;
  paymentIntentId?: string;
  providerTxRef?: string;
  description: string;
  internalValue?: unknown;
  providerValue?: unknown;
  detectedAtIso: string;
  resolved: boolean;
}

export interface ReconciliationReport {
  reportId: string;
  evaluatedAtIso: string;
  periodStartIso: string;
  periodEndIso: string;
  totalRecordsEvaluated: number;
  matchedCount: number;
  discrepancies: ReconciliationDiscrepancy[];
}

/**
 * Provider-Agnostic Adapter Contracts.
 */
export interface ProviderInitiatePaymentParams {
  paymentIntentId: string;
  amount: number;
  currency: SupportedPaymentCurrency;
  description: string;
  callbackUrl: string;
  customerRef: string;
}

export interface ProviderInitiateResult {
  ok: boolean;
  providerTxRef?: string;
  redirectUrl?: string;
  failureReason?: string;
  normalizedErrorCode?: string;
}

export interface ProviderVerifyPaymentParams {
  providerTxRef: string;
  expectedAmount: number;
  expectedCurrency: SupportedPaymentCurrency;
  rawPayload?: Record<string, unknown>;
}

export interface ProviderVerifyResult {
  verified: boolean;
  providerTxRef: string;
  amount: number;
  currency: SupportedPaymentCurrency;
  failureReason?: string;
  normalizedErrorCode?: string;
}

export interface ProviderCallbackVerificationParams {
  rawHeaders: Record<string, string | string[] | undefined>;
  rawBody: unknown;
  expectedMerchantRef?: string;
}

export interface PaymentProviderAdapter {
  readonly providerId: string;
  initiatePayment(params: ProviderInitiatePaymentParams): Promise<ProviderInitiateResult>;
  verifyPayment(params: ProviderVerifyPaymentParams): Promise<ProviderVerifyResult>;
  verifyCallbackSignature(params: ProviderCallbackVerificationParams): Promise<{ valid: boolean; reason?: string }>;
  lookupTransaction(providerTxRef: string): Promise<{ found: boolean; status: PaymentAttemptStatus; amount?: number }>;
  executeRefund(params: { providerTxRef: string; amount: number; reason: string }): Promise<{ ok: boolean; providerRefundRef?: string; failureReason?: string }>;
  normalizeError(rawError: unknown): string;
}

/**
 * Originating Module Payable Verifier.
 * The Payments module never trusts client-supplied amounts.
 */
export interface BusinessModulePayableVerifier {
  verifyPayableEligibility(params: {
    moduleId: BusinessModuleOrigin;
    objectId: string;
    customerUid: string;
  }): Promise<{
    eligible: boolean;
    expectedAmount: number;
    expectedCurrency: SupportedPaymentCurrency;
    purpose: string;
    reason?: string;
  }>;
}

/**
 * Notification / Domain Event Publisher contract.
 */
export interface PaymentDomainEventPublisher {
  publishPaymentEvent(event: {
    eventType: string;
    paymentIntentId: string;
    businessModuleId: BusinessModuleOrigin;
    businessObjectId: string;
    amount: number;
    currency: SupportedPaymentCurrency;
    status: PaymentLifecycleStatus;
    occurredAtIso: string;
  }): Promise<void>;
}

/**
 * Repository interface for decoupled persistence.
 */
export interface PaymentsRepositoryAdapter {
  getPaymentIntent(id: string): Promise<StoredPaymentIntent | null>;
  savePaymentIntent(intent: StoredPaymentIntent): Promise<void>;
  getPaymentAttempts(intentId: string): Promise<StoredPaymentAttempt[]>;
  savePaymentAttempt(attempt: StoredPaymentAttempt): Promise<void>;
  saveRefundRecord(refund: StoredRefundRecord): Promise<void>;
  getRefundRecords(intentId: string): Promise<StoredRefundRecord[]>;
  saveJournalTransaction(journal: StoredJournalTransaction): Promise<void>;
  getJournalTransactions(sourceObjectId?: string): Promise<StoredJournalTransaction[]>;
  getWalletAccount(ownerUid: string, currency: SupportedPaymentCurrency): Promise<StoredWalletAccount | null>;
  saveWalletAccount(account: StoredWalletAccount): Promise<void>;
  saveSettlementBatch(batch: StoredSettlementBatch): Promise<void>;
  getSettlementBatch(id: string): Promise<StoredSettlementBatch | null>;
}

export interface PaymentsModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  idempotencyStore: IdempotencyStoreAdapter;
  auditSink: AuditEventSink;
  repository: PaymentsRepositoryAdapter;
  payableVerifier: BusinessModulePayableVerifier;
  providerAdapters?: Map<string, PaymentProviderAdapter>;
  defaultProviderId?: string;
  eventPublisher?: PaymentDomainEventPublisher;
  primaryAdminEmails?: string[];
  nowFn?: () => number;
}
