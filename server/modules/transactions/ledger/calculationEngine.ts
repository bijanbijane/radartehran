import { CoreApiError } from '../../core';
import type { TransactionCurrency } from '../types';
import {
  MAX_MONETARY_SAFE_INT,
  type CommissionCalculationMode,
  type FinancialLedgerEntryRecord,
  type FinancialObligationRecord,
  type LedgerAccountType,
  type LedgerEntryType,
  type ObligationCategory,
  type ObligationStatus,
  type RentalFrequency,
  type TransactionRefundRecord,
  type TransactionSettlementRecord,
} from './types';

export function assertSafeMonetaryInteger(amount: number, fieldName: string, allowZero = false): void {
  if (
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(amount) ||
    (allowZero ? amount < 0 : amount <= 0) ||
    amount > MAX_MONETARY_SAFE_INT
  ) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Monetary field "${fieldName}" must be a safe ${allowZero ? 'non-negative' : 'positive'} integer minor unit.`,
    );
  }
}

export function safeAddMonetary(a: number, b: number, label = 'monetary addition'): number {
  assertSafeMonetaryInteger(a, `${label}.a`, true);
  assertSafeMonetaryInteger(b, `${label}.b`, true);
  const sum = a + b;
  if (!Number.isSafeInteger(sum) || sum > MAX_MONETARY_SAFE_INT) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Monetary overflow in ${label}.`);
  }
  return sum;
}

export function safeSubtractMonetary(a: number, b: number, label = 'monetary subtraction'): number {
  assertSafeMonetaryInteger(a, `${label}.a`, true);
  assertSafeMonetaryInteger(b, `${label}.b`, true);
  if (b > a) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Negative monetary balance prohibited in ${label} (${a} - ${b}).`,
    );
  }
  return a - b;
}

export function assertMatchingCurrency(
  expected: TransactionCurrency,
  actual: TransactionCurrency,
  context: string,
): void {
  if (expected !== actual) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Currency mismatch in ${context}: expected "${expected}", received "${actual}".`,
    );
  }
}

export const ALLOWED_OBLIGATION_TRANSITIONS: Readonly<
  Record<ObligationStatus, readonly ObligationStatus[]>
> = {
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['PARTIALLY_SETTLED', 'SETTLED', 'OVERDUE', 'CANCELLED', 'DISPUTED'],
  OVERDUE: ['PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED', 'DISPUTED'],
  PARTIALLY_SETTLED: ['SETTLED', 'OVERDUE', 'DISPUTED'],
  SETTLED: ['DISPUTED', 'PARTIALLY_SETTLED', 'PENDING'], // Only via verified refund/reversal or dispute
  DISPUTED: ['PENDING', 'PARTIALLY_SETTLED', 'SETTLED', 'OVERDUE', 'CANCELLED'],
  CANCELLED: [],
};

export function validateObligationStatusTransition(params: {
  obligation: FinancialObligationRecord;
  targetStatus: ObligationStatus;
  isAdmin: boolean;
  viaSettlementOrRefundEngine?: boolean;
}): { allowed: boolean; reason?: string } {
  const { obligation, targetStatus, isAdmin, viaSettlementOrRefundEngine = false } = params;
  const current = obligation.status;

  if (current === targetStatus) {
    return { allowed: false, reason: `Obligation is already in status "${current}".` };
  }

  if (current === 'CANCELLED') {
    return { allowed: false, reason: 'Cancelled obligation cannot be modified.' };
  }

  if (current === 'DISPUTED' && !isAdmin && !viaSettlementOrRefundEngine) {
    return { allowed: false, reason: 'Disputed obligations can only be transitioned via dispute resolution.' };
  }

  if (current === 'SETTLED' && targetStatus !== 'DISPUTED' && !viaSettlementOrRefundEngine) {
    return {
      allowed: false,
      reason: 'Settled obligations cannot be directly modified; use an authorized refund or reversal workflow.',
    };
  }

  if (
    (targetStatus === 'SETTLED' || targetStatus === 'PARTIALLY_SETTLED') &&
    !viaSettlementOrRefundEngine &&
    !isAdmin
  ) {
    return {
      allowed: false,
      reason: `Status "${targetStatus}" requires verified settlement confirmation.`,
    };
  }

  const allowed = ALLOWED_OBLIGATION_TRANSITIONS[current] ?? [];
  if (!allowed.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Obligation transition from "${current}" to "${targetStatus}" is not permitted.`,
    };
  }

  return { allowed: true };
}

export function buildBalancedDoubleEntryPair(params: {
  postingGroupId: string;
  debitEntryId: string;
  creditEntryId: string;
  transactionId: string;
  entryType: LedgerEntryType;
  debitAccount: LedgerAccountType;
  creditAccount: LedgerAccountType;
  amount: number;
  currency: TransactionCurrency;
  financialCategory: ObligationCategory;
  responsiblePartyUid: string;
  beneficiaryUid?: string;
  relatedObligationId?: string;
  relatedSettlementId?: string;
  relatedRefundId?: string;
  actorUid: string;
  createdAtIso: string;
  idempotencyReference: string;
  reversesDebitEntryId?: string;
  reversesCreditEntryId?: string;
  metadata?: Record<string, string | number | boolean>;
}): [FinancialLedgerEntryRecord, FinancialLedgerEntryRecord] {
  assertSafeMonetaryInteger(params.amount, 'ledgerPosting.amount', false);

  const sharedMeta = params.metadata ? { ...params.metadata } : {};

  const debitEntry: FinancialLedgerEntryRecord = {
    entryId: params.debitEntryId,
    postingGroupId: params.postingGroupId,
    transactionId: params.transactionId,
    entryType: params.entryType,
    direction: 'DEBIT',
    accountType: params.debitAccount,
    amount: params.amount,
    currency: params.currency,
    financialCategory: params.financialCategory,
    responsiblePartyUid: params.responsiblePartyUid,
    ...(params.beneficiaryUid ? { beneficiaryUid: params.beneficiaryUid } : {}),
    ...(params.relatedObligationId ? { relatedObligationId: params.relatedObligationId } : {}),
    ...(params.relatedSettlementId ? { relatedSettlementId: params.relatedSettlementId } : {}),
    ...(params.relatedRefundId ? { relatedRefundId: params.relatedRefundId } : {}),
    createdAtIso: params.createdAtIso,
    actorUid: params.actorUid,
    status: 'POSTED',
    ...(params.reversesDebitEntryId ? { reversesEntryId: params.reversesDebitEntryId } : {}),
    idempotencyReference: params.idempotencyReference,
    metadata: sharedMeta,
  };

  const creditEntry: FinancialLedgerEntryRecord = {
    entryId: params.creditEntryId,
    postingGroupId: params.postingGroupId,
    transactionId: params.transactionId,
    entryType: params.entryType,
    direction: 'CREDIT',
    accountType: params.creditAccount,
    amount: params.amount,
    currency: params.currency,
    financialCategory: params.financialCategory,
    responsiblePartyUid: params.responsiblePartyUid,
    ...(params.beneficiaryUid ? { beneficiaryUid: params.beneficiaryUid } : {}),
    ...(params.relatedObligationId ? { relatedObligationId: params.relatedObligationId } : {}),
    ...(params.relatedSettlementId ? { relatedSettlementId: params.relatedSettlementId } : {}),
    ...(params.relatedRefundId ? { relatedRefundId: params.relatedRefundId } : {}),
    createdAtIso: params.createdAtIso,
    actorUid: params.actorUid,
    status: 'POSTED',
    ...(params.reversesCreditEntryId ? { reversesEntryId: params.reversesCreditEntryId } : {}),
    idempotencyReference: params.idempotencyReference,
    metadata: sharedMeta,
  };

  return [debitEntry, creditEntry];
}

export function validateLedgerEntriesBalance(
  entries: readonly FinancialLedgerEntryRecord[],
  expectedTransactionId: string,
  expectedCurrency: TransactionCurrency,
): {
  balanced: boolean;
  totalDebits: number;
  totalCredits: number;
  unbalancedGroupIds: string[];
  crossTransactionEntryIds: string[];
  currencyMismatchEntryIds: string[];
} {
  let totalDebits = 0;
  let totalCredits = 0;
  const groupTotals = new Map<string, { debits: number; credits: number; currencies: Set<string> }>();
  const crossTransactionEntryIds: string[] = [];
  const currencyMismatchEntryIds: string[] = [];

  for (const entry of entries) {
    if (entry.transactionId !== expectedTransactionId) {
      crossTransactionEntryIds.push(entry.entryId);
    }
    if (entry.currency !== expectedCurrency) {
      currencyMismatchEntryIds.push(entry.entryId);
    }

    const group = groupTotals.get(entry.postingGroupId) ?? {
      debits: 0,
      credits: 0,
      currencies: new Set<string>(),
    };
    group.currencies.add(entry.currency);

    if (entry.direction === 'DEBIT') {
      group.debits = safeAddMonetary(group.debits, entry.amount, 'ledgerGroup.debits');
      totalDebits = safeAddMonetary(totalDebits, entry.amount, 'ledger.totalDebits');
    } else {
      group.credits = safeAddMonetary(group.credits, entry.amount, 'ledgerGroup.credits');
      totalCredits = safeAddMonetary(totalCredits, entry.amount, 'ledger.totalCredits');
    }

    groupTotals.set(entry.postingGroupId, group);
  }

  const unbalancedGroupIds: string[] = [];
  for (const [groupId, totals] of groupTotals.entries()) {
    if (
      totals.debits !== totals.credits ||
      totals.debits <= 0 ||
      totals.currencies.size !== 1
    ) {
      unbalancedGroupIds.push(groupId);
    }
  }

  const balanced =
    totalDebits === totalCredits &&
    unbalancedGroupIds.length === 0 &&
    crossTransactionEntryIds.length === 0 &&
    currencyMismatchEntryIds.length === 0;

  return {
    balanced,
    totalDebits,
    totalCredits,
    unbalancedGroupIds,
    crossTransactionEntryIds,
    currencyMismatchEntryIds,
  };
}

export function computeObligationOutstandingBalance(obligation: FinancialObligationRecord): number {
  if (obligation.status === 'CANCELLED') return 0;
  const netSettled = safeSubtractMonetary(
    obligation.settledAmount,
    obligation.refundedAmount,
    `obligation(${obligation.obligationId}).netSettled`,
  );
  if (netSettled >= obligation.amount) return 0;
  return safeSubtractMonetary(obligation.amount, netSettled, `obligation(${obligation.obligationId}).outstanding`);
}

export function computeSettlementRefundableBalance(
  settlement: TransactionSettlementRecord,
  existingRefunds: readonly TransactionRefundRecord[],
): number {
  if (settlement.status !== 'CONFIRMED' && settlement.status !== 'COMPLETED' && settlement.status !== 'PARTIALLY_SETTLED') {
    return 0;
  }
  let committedRefunds = 0;
  for (const ref of existingRefunds) {
    if (ref.settlementId === settlement.settlementId && (ref.status === 'REQUESTED' || ref.status === 'AUTHORIZED' || ref.status === 'CONFIRMED')) {
      committedRefunds = safeAddMonetary(committedRefunds, ref.amount, 'refunds.committed');
    }
  }
  if (committedRefunds >= settlement.confirmedAmount) return 0;
  return safeSubtractMonetary(settlement.confirmedAmount, committedRefunds, 'settlement.refundable');
}

export function computeCommissionAmount(params: {
  calculationMode: CommissionCalculationMode;
  baseTransactionAmount: number;
  basisPoints?: number;
  fixedAmount?: number;
}): number {
  assertSafeMonetaryInteger(params.baseTransactionAmount, 'baseTransactionAmount', false);

  if (params.calculationMode === 'FIXED_AMOUNT') {
    if (params.fixedAmount === undefined) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'fixedAmount is required for FIXED_AMOUNT commission mode.');
    }
    assertSafeMonetaryInteger(params.fixedAmount, 'fixedAmount', false);
    if (params.fixedAmount > params.baseTransactionAmount) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Fixed commission cannot exceed baseTransactionAmount.');
    }
    return params.fixedAmount;
  }

  if (
    params.basisPoints === undefined ||
    !Number.isSafeInteger(params.basisPoints) ||
    params.basisPoints < 1 ||
    params.basisPoints > 5000
  ) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'basisPoints must be an integer between 1 (0.01%) and 5000 (50.00%).',
    );
  }

  // Deterministic integer arithmetic using BigInt to prevent intermediate overflow or floating-point rounding
  const baseBig = BigInt(params.baseTransactionAmount);
  const bpsBig = BigInt(params.basisPoints);
  const calculatedBig = (baseBig * bpsBig) / 10000n;
  const calculated = Number(calculatedBig);
  assertSafeMonetaryInteger(calculated, 'calculatedCommissionAmount', false);
  return calculated;
}

export function generateDeterministicRentalInstallmentDates(params: {
  startDateIso: string;
  frequency: RentalFrequency;
  customIntervalDays?: number;
  installmentCount: number;
}): string[] {
  if (!Number.isSafeInteger(params.installmentCount) || params.installmentCount < 1 || params.installmentCount > 60) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'installmentCount must be an integer between 1 and 60 (bounded recurring schedule).',
    );
  }

  const startMs = Date.parse(params.startDateIso);
  if (!Number.isFinite(startMs)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid startDateIso for rental schedule.');
  }

  const dates: string[] = [];
  const baseDate = new Date(startMs);

  for (let i = 0; i < params.installmentCount; i++) {
    const d = new Date(baseDate.getTime());
    if (params.frequency === 'MONTHLY') {
      d.setUTCMonth(baseDate.getUTCMonth() + i);
    } else if (params.frequency === 'QUARTERLY') {
      d.setUTCMonth(baseDate.getUTCMonth() + i * 3);
    } else if (params.frequency === 'SEMI_ANNUAL') {
      d.setUTCMonth(baseDate.getUTCMonth() + i * 6);
    } else if (params.frequency === 'ANNUAL') {
      d.setUTCFullYear(baseDate.getUTCFullYear() + i);
    } else {
      const intervalDays = params.customIntervalDays ?? 30;
      if (!Number.isSafeInteger(intervalDays) || intervalDays < 1 || intervalDays > 366) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'customIntervalDays must be between 1 and 366.');
      }
      d.setUTCDate(baseDate.getUTCDate() + i * intervalDays);
    }
    dates.push(d.toISOString());
  }

  return dates;
}
