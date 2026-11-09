import crypto from 'crypto';
import { CoreApiError } from '../core';
import type {
  BusinessModuleOrigin,
  CommissionCalculationResult,
  CommissionPolicy,
  LedgerJournalEntry,
  StoredJournalTransaction,
  StoredWalletAccount,
  SupportedPaymentCurrency,
  WalletOwnerType,
} from './types';

/**
 * Validates that total debits strictly equal total credits.
 * All amounts must be positive integers.
 */
export function validateBalancedJournalEntries(
  entries: LedgerJournalEntry[],
): { balanced: boolean; totalDebits: number; totalCredits: number; reason?: string } {
  if (!entries || entries.length < 2) {
    return {
      balanced: false,
      totalDebits: 0,
      totalCredits: 0,
      reason: 'A journal transaction must contain at least two entries.',
    };
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (const entry of entries) {
    if (!entry.accountRef || typeof entry.accountRef !== 'string') {
      return { balanced: false, totalDebits: 0, totalCredits: 0, reason: 'Invalid account reference.' };
    }
    if (!Number.isInteger(entry.amount) || entry.amount <= 0) {
      return { balanced: false, totalDebits: 0, totalCredits: 0, reason: `Entry amount must be a positive integer, got ${entry.amount}.` };
    }

    if (entry.direction === 'DEBIT') {
      totalDebits += entry.amount;
    } else if (entry.direction === 'CREDIT') {
      totalCredits += entry.amount;
    } else {
      return { balanced: false, totalDebits: 0, totalCredits: 0, reason: `Invalid entry direction: ${entry.direction}.` };
    }
  }

  if (totalDebits !== totalCredits) {
    return {
      balanced: false,
      totalDebits,
      totalCredits,
      reason: `Unbalanced journal entries: total debits (${totalDebits}) do not equal total credits (${totalCredits}).`,
    };
  }

  return { balanced: true, totalDebits, totalCredits };
}

/**
 * Creates an immutable balanced journal transaction for a successful payment.
 * DR: Asset (Gateway / Settlement Clearing Account)
 * CR: Revenue / Liability (Platform Revenue or Merchant Payable Account)
 */
export function buildPaymentJournalTransaction(params: {
  paymentIntentId: string;
  amount: number;
  currency: SupportedPaymentCurrency;
  businessModuleId: BusinessModuleOrigin;
  businessObjectId: string;
  customerAccountRef: string;
  gatewayAccountRef?: string;
  destinationAccountRef?: string;
  nowIso: string;
  idempotencyKey: string;
}): StoredJournalTransaction {
  const gatewayAcct = params.gatewayAccountRef ?? 'acct_clearing_gateway';
  const destAcct = params.destinationAccountRef ?? `acct_payable_${params.businessModuleId}`;

  const entries: LedgerJournalEntry[] = [
    {
      entryId: `ent_${crypto.randomUUID().slice(0, 8)}`,
      accountRef: gatewayAcct,
      accountType: 'ASSET',
      direction: 'DEBIT',
      amount: params.amount,
      memo: `Payment collection for ${params.paymentIntentId}`,
    },
    {
      entryId: `ent_${crypto.randomUUID().slice(0, 8)}`,
      accountRef: destAcct,
      accountType: 'REVENUE',
      direction: 'CREDIT',
      amount: params.amount,
      memo: `Revenue/payable from ${params.customerAccountRef}`,
    },
  ];

  const validation = validateBalancedJournalEntries(entries);
  if (!validation.balanced) {
    throw new CoreApiError('INTERNAL_ERROR', 500, validation.reason ?? 'Failed to balance payment journal.');
  }

  return {
    id: `jtx_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    timestampIso: params.nowIso,
    currency: params.currency,
    sourceBusinessRef: {
      module: params.businessModuleId,
      objectId: params.businessObjectId,
      action: 'payment_succeeded',
    },
    description: `Settled payment for ${params.paymentIntentId}`,
    idempotencyKey: params.idempotencyKey,
    entries,
  };
}

/**
 * Creates an immutable balanced journal transaction for an executed refund.
 * DR: Revenue / Liability (Platform Revenue or Merchant Payable Account)
 * CR: Asset (Gateway / Settlement Clearing Account)
 */
export function buildRefundJournalTransaction(params: {
  refundId: string;
  paymentIntentId: string;
  amount: number;
  currency: SupportedPaymentCurrency;
  businessModuleId: BusinessModuleOrigin;
  businessObjectId: string;
  gatewayAccountRef?: string;
  destinationAccountRef?: string;
  nowIso: string;
  idempotencyKey: string;
}): StoredJournalTransaction {
  const gatewayAcct = params.gatewayAccountRef ?? 'acct_clearing_gateway';
  const destAcct = params.destinationAccountRef ?? `acct_payable_${params.businessModuleId}`;

  const entries: LedgerJournalEntry[] = [
    {
      entryId: `ent_${crypto.randomUUID().slice(0, 8)}`,
      accountRef: destAcct,
      accountType: 'REVENUE',
      direction: 'DEBIT',
      amount: params.amount,
      memo: `Refund deduction for ${params.refundId}`,
    },
    {
      entryId: `ent_${crypto.randomUUID().slice(0, 8)}`,
      accountRef: gatewayAcct,
      accountType: 'ASSET',
      direction: 'CREDIT',
      amount: params.amount,
      memo: `Refund payout via gateway for ${params.paymentIntentId}`,
    },
  ];

  const validation = validateBalancedJournalEntries(entries);
  if (!validation.balanced) {
    throw new CoreApiError('INTERNAL_ERROR', 500, validation.reason ?? 'Failed to balance refund journal.');
  }

  return {
    id: `jtx_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    timestampIso: params.nowIso,
    currency: params.currency,
    sourceBusinessRef: {
      module: params.businessModuleId,
      objectId: params.businessObjectId,
      action: 'refund_executed',
    },
    description: `Refund for ${params.paymentIntentId}`,
    idempotencyKey: params.idempotencyKey,
    entries,
  };
}

/**
 * Creates a balanced reversal for any historical journal transaction.
 */
export function buildReversalJournalTransaction(
  original: StoredJournalTransaction,
  nowIso: string,
  idempotencyKey: string,
): StoredJournalTransaction {
  const reversedEntries: LedgerJournalEntry[] = original.entries.map((e) => ({
    entryId: `ent_${crypto.randomUUID().slice(0, 8)}`,
    accountRef: e.accountRef,
    accountType: e.accountType,
    direction: e.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
    amount: e.amount,
    memo: `Reversal of entry ${e.entryId}`,
  }));

  const validation = validateBalancedJournalEntries(reversedEntries);
  if (!validation.balanced) {
    throw new CoreApiError('INTERNAL_ERROR', 500, validation.reason ?? 'Failed to balance reversal journal.');
  }

  return {
    id: `jtx_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    timestampIso: nowIso,
    currency: original.currency,
    sourceBusinessRef: {
      module: original.sourceBusinessRef.module,
      objectId: original.sourceBusinessRef.objectId,
      action: 'journal_reversal',
    },
    description: `Reversal of ${original.id}`,
    idempotencyKey,
    entries: reversedEntries,
    reversalRef: original.id,
  };
}

/**
 * Wallet Subsystem Balances & Double-spending Protection.
 */
export function createDefaultWalletAccount(
  ownerUid: string,
  ownerType: WalletOwnerType,
  currency: SupportedPaymentCurrency,
  nowIso: string,
): StoredWalletAccount {
  return {
    id: `wlt_${ownerUid}_${currency.toLowerCase()}`,
    ownerUid,
    ownerType,
    currency,
    availableBalance: 0,
    reservedBalance: 0,
    pendingBalance: 0,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

export function applyWalletCredit(
  wallet: StoredWalletAccount,
  amount: number,
  nowIso: string,
): StoredWalletAccount {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Credit amount must be a positive integer.');
  }
  return {
    ...wallet,
    availableBalance: wallet.availableBalance + amount,
    updatedAtIso: nowIso,
  };
}

export function applyWalletDebit(
  wallet: StoredWalletAccount,
  amount: number,
  nowIso: string,
): StoredWalletAccount {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Debit amount must be a positive integer.');
  }
  if (wallet.availableBalance < amount) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Insufficient wallet balance. Available: ${wallet.availableBalance}, required: ${amount}.`,
    );
  }
  return {
    ...wallet,
    availableBalance: wallet.availableBalance - amount,
    updatedAtIso: nowIso,
  };
}

export function reserveWalletFunds(
  wallet: StoredWalletAccount,
  amount: number,
  nowIso: string,
): StoredWalletAccount {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Reservation amount must be a positive integer.');
  }
  if (wallet.availableBalance < amount) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Insufficient available balance to reserve. Available: ${wallet.availableBalance}, required: ${amount}.`,
    );
  }
  return {
    ...wallet,
    availableBalance: wallet.availableBalance - amount,
    reservedBalance: wallet.reservedBalance + amount,
    updatedAtIso: nowIso,
  };
}

export function releaseWalletReservation(
  wallet: StoredWalletAccount,
  amount: number,
  nowIso: string,
): StoredWalletAccount {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Release amount must be a positive integer.');
  }
  if (wallet.reservedBalance < amount) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Cannot release more than reserved balance. Reserved: ${wallet.reservedBalance}, requested: ${amount}.`,
    );
  }
  return {
    ...wallet,
    availableBalance: wallet.availableBalance + amount,
    reservedBalance: wallet.reservedBalance - amount,
    updatedAtIso: nowIso,
  };
}

/**
 * Pure Platform Commission Calculator.
 * Supports fixed, percentage (bps), and tiered calculations with min/max caps.
 */
export function calculateCommission(params: {
  baseAmount: number;
  currency: SupportedPaymentCurrency;
  policy: CommissionPolicy;
  nowIso: string;
}): CommissionCalculationResult {
  const { baseAmount, currency, policy, nowIso } = params;
  if (!Number.isInteger(baseAmount) || baseAmount <= 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Base amount for commission must be a positive integer.');
  }

  let rawCommission = 0;

  if (policy.calculationMethod === 'fixed') {
    rawCommission = policy.fixedAmount ?? 0;
  } else if (policy.calculationMethod === 'percentage') {
    const bps = policy.percentageBps ?? 0;
    rawCommission = Math.floor((baseAmount * bps) / 10_000);
  } else if (policy.calculationMethod === 'tiered' && policy.tierThresholds && policy.tierThresholds.length > 0) {
    let remaining = baseAmount;
    let accumulated = 0;
    let prevCeiling = 0;

    for (const tier of policy.tierThresholds) {
      if (remaining <= 0) break;
      const tierBand = tier.upToAmount - prevCeiling;
      const taxableInThisBand = Math.min(remaining, tierBand);
      accumulated += Math.floor((taxableInThisBand * tier.rateBps) / 10_000);
      remaining -= taxableInThisBand;
      prevCeiling = tier.upToAmount;
    }

    if (remaining > 0 && policy.percentageBps) {
      accumulated += Math.floor((remaining * policy.percentageBps) / 10_000);
    }
    rawCommission = accumulated;
  }

  if (policy.minFee !== undefined && rawCommission < policy.minFee) {
    rawCommission = policy.minFee;
  }
  if (policy.maxFee !== undefined && rawCommission > policy.maxFee) {
    rawCommission = policy.maxFee;
  }

  // Invariant: commission cannot exceed base amount
  const commissionAmount = Math.min(baseAmount, Math.max(0, Math.floor(rawCommission)));
  const netPayableAmount = baseAmount - commissionAmount;

  return {
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    baseAmount,
    commissionAmount,
    netPayableAmount,
    currency,
    calculationMethod: policy.calculationMethod,
    calculatedAtIso: nowIso,
  };
}
