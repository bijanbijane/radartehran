import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../../core';
import type {
  ParticipantRole,
  TransactionCurrency,
  TransactionStatus,
  TransactionType,
} from '../types';

export const CURRENCY_MINOR_UNIT_DECIMALS: Readonly<Record<TransactionCurrency, number>> = {
  IRR: 0,
  IRT: 0,
};

export const MAX_MONETARY_SAFE_INT = 9_000_000_000_000_000;

export type ObligationCategory =
  | 'PURCHASE_PRICE'
  | 'RENTAL_PAYMENT'
  | 'SECURITY_DEPOSIT'
  | 'BROKER_COMMISSION'
  | 'SERVICE_FEE'
  | 'CONTRACTUAL_FEE'
  | 'REFUND_OBLIGATION'
  | 'CLOSING_EXPENSE'
  | 'OTHER';

export const ALL_OBLIGATION_CATEGORIES: readonly ObligationCategory[] = [
  'PURCHASE_PRICE',
  'RENTAL_PAYMENT',
  'SECURITY_DEPOSIT',
  'BROKER_COMMISSION',
  'SERVICE_FEE',
  'CONTRACTUAL_FEE',
  'REFUND_OBLIGATION',
  'CLOSING_EXPENSE',
  'OTHER',
] as const;

export type ObligationStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'OVERDUE'
  | 'CANCELLED'
  | 'DISPUTED';

export const ALL_OBLIGATION_STATUSES: readonly ObligationStatus[] = [
  'DRAFT',
  'PENDING',
  'PARTIALLY_SETTLED',
  'SETTLED',
  'OVERDUE',
  'CANCELLED',
  'DISPUTED',
] as const;

export type LedgerEntryDirection = 'DEBIT' | 'CREDIT';

export type LedgerEntryType =
  | 'OBLIGATION_RECOGNITION'
  | 'SETTLEMENT_POSTING'
  | 'COMMISSION_RECOGNITION'
  | 'COMMISSION_SETTLEMENT'
  | 'REFUND_POSTING'
  | 'ADJUSTMENT_POSTING'
  | 'REVERSAL_POSTING';

export const ALL_LEDGER_ENTRY_TYPES: readonly LedgerEntryType[] = [
  'OBLIGATION_RECOGNITION',
  'SETTLEMENT_POSTING',
  'COMMISSION_RECOGNITION',
  'COMMISSION_SETTLEMENT',
  'REFUND_POSTING',
  'ADJUSTMENT_POSTING',
  'REVERSAL_POSTING',
] as const;

export type LedgerAccountType =
  | 'PARTY_RECEIVABLE'
  | 'OBLIGATION_CONTROL'
  | 'SETTLEMENT_CLEARING'
  | 'PARTY_PAYABLE'
  | 'COMMISSION_PAYABLE'
  | 'DEPOSIT_CUSTODY_REF'
  | 'REFUND_CLEARING'
  | 'ADJUSTMENT_CONTROL';

export const ALL_LEDGER_ACCOUNT_TYPES: readonly LedgerAccountType[] = [
  'PARTY_RECEIVABLE',
  'OBLIGATION_CONTROL',
  'SETTLEMENT_CLEARING',
  'PARTY_PAYABLE',
  'COMMISSION_PAYABLE',
  'DEPOSIT_CUSTODY_REF',
  'REFUND_CLEARING',
  'ADJUSTMENT_CONTROL',
] as const;

export type LedgerEntryStatus = 'POSTED' | 'REVERSED';

export type FinancialLedgerEntryRecord = {
  entryId: string;
  postingGroupId: string;
  transactionId: string;
  entryType: LedgerEntryType;
  direction: LedgerEntryDirection;
  accountType: LedgerAccountType;
  amount: number;
  currency: TransactionCurrency;
  financialCategory: ObligationCategory;
  responsiblePartyUid: string;
  beneficiaryUid?: string;
  relatedObligationId?: string;
  relatedSettlementId?: string;
  relatedRefundId?: string;
  createdAtIso: string;
  actorUid: string;
  status: LedgerEntryStatus;
  reversesEntryId?: string;
  reversedByEntryId?: string;
  idempotencyReference: string;
  metadata: Record<string, string | number | boolean>;
};

export type FinancialObligationRecord = {
  obligationId: string;
  transactionId: string;
  category: ObligationCategory;
  title: string;
  amount: number;
  settledAmount: number;
  refundedAmount: number;
  currency: TransactionCurrency;
  payerUid: string;
  payeeUid: string;
  dueDateIso: string;
  status: ObligationStatus;
  statusBeforeDispute?: ObligationStatus;
  contractReferenceId?: string;
  settlementIds: string[];
  scheduleId?: string;
  installmentIndex?: number;
  commissionAgreementId?: string;
  activeFinancialDisputeId?: string;
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PaymentReferenceStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PROCESSING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export const ALL_PAYMENT_REFERENCE_STATUSES: readonly PaymentReferenceStatus[] = [
  'CREATED',
  'PENDING',
  'PROCESSING',
  'CONFIRMED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

export type PaymentFailureClassification =
  | 'PROVIDER_TIMEOUT'
  | 'INSUFFICIENT_FUNDS'
  | 'REJECTED_BY_BANK'
  | 'SIGNATURE_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'CANCELLED_BY_PAYER'
  | 'COMPLIANCE_HOLD'
  | 'OTHER';

export type PaymentStatusReferenceRecord = {
  paymentRefId: string;
  transactionId: string;
  obligationId?: string;
  initiationReference: string;
  externalProviderName?: string;
  externalProviderRef?: string;
  confirmationReference?: string;
  status: PaymentReferenceStatus;
  amount: number;
  refundedAmount: number;
  currency: TransactionCurrency;
  payerUid: string;
  payeeUid: string;
  confirmedAtIso?: string;
  confirmedBySource?: 'TRUSTED_PROVIDER_WEBHOOK' | 'ADMIN_VERIFIED';
  ConfirmedByActorUid?: string;
  failureReasonClassification?: PaymentFailureClassification;
  failureDetail?: string;
  refundIds: string[];
  createdAtIso: string;
  updatedAtIso: string;
};

export type SettlementStatus =
  | 'CREATED'
  | 'INITIATED'
  | 'PARTIALLY_SETTLED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'DISPUTED';

export const ALL_SETTLEMENT_STATUSES: readonly SettlementStatus[] = [
  'CREATED',
  'INITIATED',
  'PARTIALLY_SETTLED',
  'CONFIRMED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'DISPUTED',
] as const;

export type SettlementObligationAllocation = {
  obligationId: string;
  allocatedAmount: number;
};

export type TransactionSettlementRecord = {
  settlementId: string;
  transactionId: string;
  allocations: SettlementObligationAllocation[];
  totalAmount: number;
  confirmedAmount: number;
  refundedAmount: number;
  currency: TransactionCurrency;
  payerUid: string;
  payeeUid: string;
  paymentRefId?: string;
  status: SettlementStatus;
  statusBeforeDispute?: SettlementStatus;
  ledgerPostingGroupIds: string[];
  activeFinancialDisputeId?: string;
  initiatedByUid: string;
  initiatedAtIso?: string;
  confirmedAtIso?: string;
  completedAtIso?: string;
  cancelledAtIso?: string;
  failureReason?: string;
  cancellationReason?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type RefundStatus =
  | 'REQUESTED'
  | 'AUTHORIZED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'REVERSED';

export type TransactionRefundRecord = {
  refundId: string;
  transactionId: string;
  settlementId: string;
  obligationId: string;
  paymentRefId?: string;
  amount: number;
  currency: TransactionCurrency;
  payerUid: string;
  payeeUid: string;
  reason: string;
  status: RefundStatus;
  externalRefundRef?: string;
  ledgerPostingGroupId?: string;
  reversalPostingGroupId?: string;
  requestedByUid: string;
  authorizedByUid?: string;
  confirmedByUid?: string;
  createdAtIso: string;
  updatedAtIso: string;
  confirmedAtIso?: string;
  reversedAtIso?: string;
};

export type RentalFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'CUSTOM_DAYS';

export type RentalSchedulePlanRecord = {
  scheduleId: string;
  transactionId: string;
  contractReferenceId: string;
  tenantUid: string;
  landlordUid: string;
  currency: TransactionCurrency;
  securityDepositAmount: number;
  securityDepositObligationId: string;
  securityDepositRefundableBalance: number;
  periodicRentAmount: number;
  frequency: RentalFrequency;
  customIntervalDays?: number;
  installmentCount: number;
  startDateIso: string;
  generatedObligationIds: string[];
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type CommissionCalculationMode = 'FIXED_AMOUNT' | 'BASIS_POINTS';

export type CommissionAgreementRecord = {
  commissionId: string;
  transactionId: string;
  obligationId: string;
  brokerUid: string;
  payerUid: string;
  calculationMode: CommissionCalculationMode;
  baseTransactionAmount: number;
  basisPoints?: number;
  fixedAmount?: number;
  calculatedCommissionAmount: number;
  currency: TransactionCurrency;
  contractReferenceId: string;
  status: 'PENDING' | 'SETTLED' | 'REVERSED' | 'DISPUTED';
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
  reversedAtIso?: string;
  reversalReason?: string;
};

export type FinancialDisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';

export type FinancialDisputeRecord = {
  financialDisputeId: string;
  transactionId: string;
  linkedTransactionDisputeId?: string;
  disputedObligationIds: string[];
  disputedSettlementIds: string[];
  disputedAmount: number;
  currency: TransactionCurrency;
  reason: string;
  status: FinancialDisputeStatus;
  initiatedByUid: string;
  resolutionReference?: string;
  resolvedByAdminUid?: string;
  resolutionSummary?: string;
  createdAtIso: string;
  updatedAtIso: string;
  resolvedAtIso?: string;
};

export type ReconciliationStatus =
  | 'RECONCILED'
  | 'PENDING'
  | 'MISMATCH'
  | 'FAILED'
  | 'UNDER_REVIEW';

export type ReconciliationIssueCode =
  | 'UNBALANCED_LEDGER_GROUP'
  | 'MISSING_LEDGER_ENTRY'
  | 'DUPLICATE_LEDGER_POSTING'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'MISSING_SETTLEMENT_REFERENCE'
  | 'INCONSISTENT_PAYMENT_STATE'
  | 'UNEXPECTED_REFUND'
  | 'INVALID_OBLIGATION_BALANCE'
  | 'CROSS_TRANSACTION_REFERENCE';

export type ReconciliationDiscrepancy = {
  code: ReconciliationIssueCode;
  referenceId: string;
  message: string;
  severity: 'WARNING' | 'CRITICAL';
};

export type ReconciliationReportRecord = {
  reportId: string;
  transactionId: string;
  status: ReconciliationStatus;
  currency: TransactionCurrency;
  totalObligationAmount: number;
  totalConfirmedSettlementAmount: number;
  totalConfirmedPaymentAmount: number;
  totalRefundedAmount: number;
  totalLedgerDebits: number;
  totalLedgerCredits: number;
  outstandingObligationBalance: number;
  discrepancies: ReconciliationDiscrepancy[];
  generatedByUid: string;
  generatedAtIso: string;
};

export type FinancialHistoryEventType =
  | 'OBLIGATION_CREATED' | 'OBLIGATION_UPDATED' | 'LEDGER_POSTED' | 'LEDGER_REVERSED'
  | 'PAYMENT_REF_RECORDED' | 'PAYMENT_REF_UPDATED' | 'SETTLEMENT_CREATED' | 'SETTLEMENT_INITIATED'
  | 'SETTLEMENT_CONFIRMED' | 'SETTLEMENT_FAILED' | 'SETTLEMENT_CANCELLED' | 'REFUND_REQUESTED'
  | 'REFUND_CONFIRMED' | 'REFUND_REVERSED' | 'RENTAL_SCHEDULE_GENERATED' | 'COMMISSION_RECORDED'
  | 'COMMISSION_REVERSED' | 'RECONCILIATION_EXECUTED' | 'FINANCIAL_DISPUTE_OPENED'
  | 'FINANCIAL_DISPUTE_RESOLVED' | 'ADMIN_FINANCIAL_INTERVENTION';

export type FinancialHistoryEventRecord = {
  eventId: string;
  transactionId: string;
  sequenceNumber: number;
  eventType: FinancialHistoryEventType;
  actorUid: string;
  summary: string;
  metadata: Record<string, string | number | boolean>;
  timestampIso: string;
};

export type TransactionFinancialIndexRecord = {
  transactionId: string;
  currency: TransactionCurrency;
  obligationIds: string[];
  ledgerEntryIds: string[];
  postingGroupIds: string[];
  paymentRefIds: string[];
  settlementIds: string[];
  refundIds: string[];
  rentalScheduleIds: string[];
  commissionIds: string[];
  financialDisputeIds: string[];
  reconciliationReportIds: string[];
  historyEventIds: string[];
  lastReconciliationStatus: ReconciliationStatus;
  historySequence: number;
  updatedAtIso: string;
};

export type TransactionFinancialSummary = {
  transactionId: string;
  transactionType: TransactionType;
  transactionStatus: TransactionStatus;
  currency: TransactionCurrency;
  viewerRole: ParticipantRole | 'ADMIN';
  totalObligationAmount: number;
  totalSettledAmount: number;
  totalRefundedAmount: number;
  outstandingBalance: number;
  refundableBalance: number;
  disputedAmount: number;
  ledgerBalanced: boolean;
  totalPostedDebits: number;
  totalPostedCredits: number;
  reconciliationStatus: ReconciliationStatus;
  obligationCount: number;
  settledObligationCount: number;
  overdueObligationCount: number;
  activeFinancialDisputeCount: number;
};

export type FinancialAnalyticsSnapshot = {
  totalObligationVolume: number;
  totalSettledVolume: number;
  outstandingObligationTotal: number;
  totalRefundedVolume: number;
  settlementCompletionRate: number;
  refundRate: number;
  reconciliationFailureRate: number;
  averageSettlementDurationMs: number;
  rentalPaymentCompletionRate: number;
  commissionSettlementRate: number;
};

export interface FinancialLedgerDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  trustedWebhookSecrets?: string[];
  telemetryEmitter?: (event: {
    eventName: string;
    transactionId: string;
    metrics: Record<string, number>;
    occurredAtMs: number;
  }) => void;
  nowFn?: () => number;
}
