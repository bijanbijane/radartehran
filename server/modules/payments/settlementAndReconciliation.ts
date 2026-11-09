import crypto from 'crypto';
import { CoreApiError } from '../core';
import { validateBalancedJournalEntries } from './ledgerAndWalletEngine';
import type {
  PaymentsRepositoryAdapter,
  ReconciliationDiscrepancy,
  ReconciliationReport,
  StoredSettlementBatch,
  SupportedPaymentCurrency,
} from './types';

export function buildSettlementBatchRecord(params: {
  payeeRef: string;
  payeeType: 'service_provider' | 'agency' | 'platform';
  periodStartIso: string;
  periodEndIso: string;
  grossAmount: number;
  commissionDeductions: number;
  refundDeductions: number;
  currency: SupportedPaymentCurrency;
  nowIso: string;
}): StoredSettlementBatch {
  const netPayable = params.grossAmount - params.commissionDeductions - params.refundDeductions;
  if (netPayable < 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Net payable cannot be negative.');
  }

  return {
    id: `set_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    payeeRef: params.payeeRef,
    payeeType: params.payeeType,
    periodStartIso: params.periodStartIso,
    periodEndIso: params.periodEndIso,
    grossAmount: params.grossAmount,
    commissionDeductions: params.commissionDeductions,
    refundDeductions: params.refundDeductions,
    netPayableAmount: netPayable,
    currency: params.currency,
    status: 'pending',
    payoutRef: null,
    createdAtIso: params.nowIso,
    updatedAtIso: params.nowIso,
  };
}

export async function executeReconciliationAudit(params: {
  repository: PaymentsRepositoryAdapter;
  periodStartIso: string;
  periodEndIso: string;
  nowIso: string;
}): Promise<ReconciliationReport> {
  const { repository, periodStartIso, periodEndIso, nowIso } = params;
  const discrepancies: ReconciliationDiscrepancy[] = [];
  const journalEntries = await repository.getJournalTransactions();

  for (const jtx of journalEntries) {
    const balanceCheck = validateBalancedJournalEntries(jtx.entries);
    if (!balanceCheck.balanced) {
      discrepancies.push({
        discrepancyId: `disc_${crypto.randomUUID().slice(0, 8)}`,
        type: 'UNBALANCED_LEDGER_TRANSACTION',
        description: `Journal ${jtx.id} is unbalanced. ${balanceCheck.reason}`,
        detectedAtIso: nowIso,
        resolved: false,
      });
    }
  }

  return {
    reportId: `rec_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    evaluatedAtIso: nowIso,
    periodStartIso,
    periodEndIso,
    totalRecordsEvaluated: journalEntries.length,
    matchedCount: journalEntries.length - discrepancies.length,
    discrepancies,
  };
}
