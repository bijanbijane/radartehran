import type { TransactionCurrency } from '../types';
import {
  computeObligationOutstandingBalance,
  safeAddMonetary,
  validateLedgerEntriesBalance,
} from './calculationEngine';
import type {
  FinancialDisputeRecord,
  FinancialLedgerEntryRecord,
  FinancialObligationRecord,
  PaymentStatusReferenceRecord,
  ReconciliationDiscrepancy,
  ReconciliationReportRecord,
  ReconciliationStatus,
  TransactionRefundRecord,
  TransactionSettlementRecord,
} from './types';

export function runTransactionFinancialReconciliation(params: {
  reportId: string;
  transactionId: string;
  currency: TransactionCurrency;
  obligations: readonly FinancialObligationRecord[];
  ledgerEntries: readonly FinancialLedgerEntryRecord[];
  paymentRefs: readonly PaymentStatusReferenceRecord[];
  settlements: readonly TransactionSettlementRecord[];
  refunds: readonly TransactionRefundRecord[];
  financialDisputes: readonly FinancialDisputeRecord[];
  actorUid: string;
  nowIso: string;
}): ReconciliationReportRecord {
  const {
    reportId,
    transactionId,
    currency,
    obligations,
    ledgerEntries,
    paymentRefs,
    settlements,
    refunds,
    financialDisputes,
    actorUid,
    nowIso,
  } = params;

  const discrepancies: ReconciliationDiscrepancy[] = [];

  // 1. Validate double-entry ledger balance, cross-transaction integrity, and currency uniformity
  const ledgerBalance = validateLedgerEntriesBalance(ledgerEntries, transactionId, currency);
  for (const groupId of ledgerBalance.unbalancedGroupIds) {
    discrepancies.push({
      code: 'UNBALANCED_LEDGER_GROUP',
      referenceId: groupId,
      message: `Ledger posting group "${groupId}" has unbalanced debits and credits or mixed currencies.`,
      severity: 'CRITICAL',
    });
  }
  for (const crossId of ledgerBalance.crossTransactionEntryIds) {
    discrepancies.push({
      code: 'CROSS_TRANSACTION_REFERENCE',
      referenceId: crossId,
      message: `Ledger entry "${crossId}" belongs to a different transaction.`,
      severity: 'CRITICAL',
    });
  }
  for (const currId of ledgerBalance.currencyMismatchEntryIds) {
    discrepancies.push({
      code: 'CURRENCY_MISMATCH',
      referenceId: currId,
      message: `Ledger entry "${currId}" currency does not match transaction currency "${currency}".`,
      severity: 'CRITICAL',
    });
  }

  // 2. Detect duplicate ledger postings by (entryType, direction, idempotencyReference)
  const seenIdempotencyKeys = new Set<string>();
  for (const entry of ledgerEntries) {
    const key = `${entry.entryType}:${entry.direction}:${entry.idempotencyReference}`;
    if (seenIdempotencyKeys.has(key)) {
      discrepancies.push({
        code: 'DUPLICATE_LEDGER_POSTING',
        referenceId: entry.entryId,
        message: `Duplicate ledger entry detected for idempotency reference "${entry.idempotencyReference}".`,
        severity: 'CRITICAL',
      });
    }
    seenIdempotencyKeys.add(key);
  }

  // 3. Validate obligations & compute totals
  let totalObligationAmount = 0;
  let outstandingObligationBalance = 0;
  const obligationMap = new Map<string, FinancialObligationRecord>();

  for (const ob of obligations) {
    obligationMap.set(ob.obligationId, ob);
    if (ob.transactionId !== transactionId) {
      discrepancies.push({
        code: 'CROSS_TRANSACTION_REFERENCE',
        referenceId: ob.obligationId,
        message: `Obligation "${ob.obligationId}" references another transaction.`,
        severity: 'CRITICAL',
      });
    }
    if (ob.currency !== currency) {
      discrepancies.push({
        code: 'CURRENCY_MISMATCH',
        referenceId: ob.obligationId,
        message: `Obligation "${ob.obligationId}" currency "${ob.currency}" mismatches transaction currency "${currency}".`,
        severity: 'CRITICAL',
      });
    }
    if (ob.settledAmount < 0 || ob.refundedAmount < 0 || ob.settledAmount - ob.refundedAmount > ob.amount) {
      discrepancies.push({
        code: 'INVALID_OBLIGATION_BALANCE',
        referenceId: ob.obligationId,
        message: `Obligation "${ob.obligationId}" has invalid settled/refunded balance relative to obligation amount.`,
        severity: 'CRITICAL',
      });
    }
    if (ob.status !== 'CANCELLED') {
      totalObligationAmount = safeAddMonetary(totalObligationAmount, ob.amount, 'reconcile.totalObligation');
      const out = computeObligationOutstandingBalance(ob);
      outstandingObligationBalance = safeAddMonetary(outstandingObligationBalance, out, 'reconcile.outstanding');
    }
  }

  // 4. Validate payment references
  let totalConfirmedPaymentAmount = 0;
  const paymentRefMap = new Map<string, PaymentStatusReferenceRecord>();
  for (const pRef of paymentRefs) {
    paymentRefMap.set(pRef.paymentRefId, pRef);
    if (pRef.transactionId !== transactionId) {
      discrepancies.push({
        code: 'CROSS_TRANSACTION_REFERENCE',
        referenceId: pRef.paymentRefId,
        message: `Payment reference "${pRef.paymentRefId}" references another transaction.`,
        severity: 'CRITICAL',
      });
    }
    if (pRef.currency !== currency) {
      discrepancies.push({
        code: 'CURRENCY_MISMATCH',
        referenceId: pRef.paymentRefId,
        message: `Payment reference "${pRef.paymentRefId}" currency mismatches "${currency}".`,
        severity: 'CRITICAL',
      });
    }
    if (
      pRef.status === 'CONFIRMED' ||
      pRef.status === 'PARTIALLY_REFUNDED' ||
      pRef.status === 'REFUNDED'
    ) {
      totalConfirmedPaymentAmount = safeAddMonetary(
        totalConfirmedPaymentAmount,
        pRef.amount,
        'reconcile.confirmedPayments',
      );
    }
  }

  // 5. Validate settlements against payment references, obligations, and ledger postings
  let totalConfirmedSettlementAmount = 0;
  const settlementMap = new Map<string, TransactionSettlementRecord>();
  const ledgerGroupSet = new Set(ledgerEntries.map((e) => e.postingGroupId));

  for (const stl of settlements) {
    settlementMap.set(stl.settlementId, stl);
    if (stl.transactionId !== transactionId) {
      discrepancies.push({
        code: 'CROSS_TRANSACTION_REFERENCE',
        referenceId: stl.settlementId,
        message: `Settlement "${stl.settlementId}" references another transaction.`,
        severity: 'CRITICAL',
      });
    }
    if (stl.currency !== currency) {
      discrepancies.push({
        code: 'CURRENCY_MISMATCH',
        referenceId: stl.settlementId,
        message: `Settlement "${stl.settlementId}" currency mismatches "${currency}".`,
        severity: 'CRITICAL',
      });
    }

    for (const alloc of stl.allocations) {
      if (!obligationMap.has(alloc.obligationId)) {
        discrepancies.push({
          code: 'MISSING_SETTLEMENT_REFERENCE',
          referenceId: stl.settlementId,
          message: `Settlement "${stl.settlementId}" references non-existent obligation "${alloc.obligationId}".`,
          severity: 'CRITICAL',
        });
      }
    }

    if (stl.status === 'CONFIRMED' || stl.status === 'COMPLETED' || stl.status === 'PARTIALLY_SETTLED') {
      totalConfirmedSettlementAmount = safeAddMonetary(
        totalConfirmedSettlementAmount,
        stl.confirmedAmount,
        'reconcile.confirmedSettlements',
      );

      if (stl.ledgerPostingGroupIds.length === 0) {
        discrepancies.push({
          code: 'MISSING_LEDGER_ENTRY',
          referenceId: stl.settlementId,
          message: `Confirmed settlement "${stl.settlementId}" has no linked ledger posting groups.`,
          severity: 'CRITICAL',
        });
      } else {
        for (const pgId of stl.ledgerPostingGroupIds) {
          if (!ledgerGroupSet.has(pgId)) {
            discrepancies.push({
              code: 'MISSING_LEDGER_ENTRY',
              referenceId: stl.settlementId,
              message: `Settlement "${stl.settlementId}" references missing ledger posting group "${pgId}".`,
              severity: 'CRITICAL',
            });
          }
        }
      }

      if (!stl.paymentRefId) {
        discrepancies.push({
          code: 'INCONSISTENT_PAYMENT_STATE',
          referenceId: stl.settlementId,
          message: `Confirmed settlement "${stl.settlementId}" is missing a verified payment status reference.`,
          severity: 'CRITICAL',
        });
      } else {
        const linkedPayment = paymentRefMap.get(stl.paymentRefId);
        if (
          !linkedPayment ||
          (linkedPayment.status !== 'CONFIRMED' &&
            linkedPayment.status !== 'PARTIALLY_REFUNDED' &&
            linkedPayment.status !== 'REFUNDED')
        ) {
          discrepancies.push({
            code: 'INCONSISTENT_PAYMENT_STATE',
            referenceId: stl.settlementId,
            message: `Confirmed settlement "${stl.settlementId}" links to unconfirmed payment reference "${stl.paymentRefId}".`,
            severity: 'CRITICAL',
          });
        } else if (linkedPayment.amount < stl.confirmedAmount) {
          discrepancies.push({
            code: 'AMOUNT_MISMATCH',
            referenceId: stl.settlementId,
            message: `Confirmed settlement "${stl.settlementId}" amount (${stl.confirmedAmount}) exceeds payment reference amount (${linkedPayment.amount}).`,
            severity: 'CRITICAL',
          });
        }
      }
    }
  }

  // 6. Validate refunds against settlements and ledger postings
  let totalRefundedAmount = 0;
  const refundsBySettlement = new Map<string, number>();

  for (const ref of refunds) {
    if (ref.transactionId !== transactionId) {
      discrepancies.push({
        code: 'CROSS_TRANSACTION_REFERENCE',
        referenceId: ref.refundId,
        message: `Refund "${ref.refundId}" references another transaction.`,
        severity: 'CRITICAL',
      });
    }
    if (ref.status === 'CONFIRMED') {
      totalRefundedAmount = safeAddMonetary(totalRefundedAmount, ref.amount, 'reconcile.refunds');
      const prev = refundsBySettlement.get(ref.settlementId) ?? 0;
      const next = safeAddMonetary(prev, ref.amount, 'reconcile.refundBySettlement');
      refundsBySettlement.set(ref.settlementId, next);

      const parentStl = settlementMap.get(ref.settlementId);
      if (!parentStl) {
        discrepancies.push({
          code: 'MISSING_SETTLEMENT_REFERENCE',
          referenceId: ref.refundId,
          message: `Confirmed refund "${ref.refundId}" references missing settlement "${ref.settlementId}".`,
          severity: 'CRITICAL',
        });
      } else if (next > parentStl.confirmedAmount) {
        discrepancies.push({
          code: 'UNEXPECTED_REFUND',
          referenceId: ref.refundId,
          message: `Confirmed refunds (${next}) exceed confirmed settlement amount (${parentStl.confirmedAmount}) for "${ref.settlementId}".`,
          severity: 'CRITICAL',
        });
      }

      if (!ref.ledgerPostingGroupId || !ledgerGroupSet.has(ref.ledgerPostingGroupId)) {
        discrepancies.push({
          code: 'MISSING_LEDGER_ENTRY',
          referenceId: ref.refundId,
          message: `Confirmed refund "${ref.refundId}" is missing its double-entry ledger posting.`,
          severity: 'CRITICAL',
        });
      }
    }
  }

  // 7. Determine overall reconciliation status
  const hasActiveDisputes = financialDisputes.some(
    (d) => d.status === 'OPEN' || d.status === 'UNDER_REVIEW',
  );
  const hasPendingSettlements = settlements.some(
    (s) => s.status === 'CREATED' || s.status === 'INITIATED',
  );

  let status: ReconciliationStatus = 'RECONCILED';
  if (discrepancies.some((d) => d.code === 'UNBALANCED_LEDGER_GROUP' || d.code === 'CROSS_TRANSACTION_REFERENCE' || d.code === 'DUPLICATE_LEDGER_POSTING')) {
    status = 'FAILED';
  } else if (discrepancies.length > 0) {
    status = 'MISMATCH';
  } else if (hasActiveDisputes) {
    status = 'UNDER_REVIEW';
  } else if (hasPendingSettlements) {
    status = 'PENDING';
  }

  return {
    reportId,
    transactionId,
    status,
    currency,
    totalObligationAmount,
    totalConfirmedSettlementAmount,
    totalConfirmedPaymentAmount,
    totalRefundedAmount,
    totalLedgerDebits: ledgerBalance.totalDebits,
    totalLedgerCredits: ledgerBalance.totalCredits,
    outstandingObligationBalance,
    discrepancies,
    generatedByUid: actorUid,
    generatedAtIso: nowIso,
  };
}
