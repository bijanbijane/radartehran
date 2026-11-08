import { randomUUID } from 'node:crypto';
import { CoreApiError, type TransactionContextLike } from '../../core';
import {
  assertMatchingCurrency,
  buildBalancedDoubleEntryPair,
  computeObligationOutstandingBalance,
  computeSettlementRefundableBalance,
  safeAddMonetary,
  safeSubtractMonetary,
} from './calculationEngine';
import {
  appendFinancialHistoryEvent,
  assertActiveTransactionPartyUid,
  loadTransactionAndVerifyFinancialParticipant,
  saveFinancialIndex,
} from './obligationScheduleAndCommissionOps';
import type {
  CommissionAgreementRecord,
  FinancialDisputeRecord,
  FinancialObligationRecord,
  PaymentStatusReferenceRecord,
  RentalSchedulePlanRecord,
  TransactionRefundRecord,
  TransactionSettlementRecord,
} from './types';
import type {
  CreateFinancialDisputeInput,
  CreatePaymentReferenceInput,
  CreateRefundInput,
  CreateSettlementInput,
  RefundDecisionInput,
  ResolveFinancialDisputeInput,
  SettlementActionInput,
  UpdatePaymentReferenceInput,
} from './validation';

export async function executeCreatePaymentReference(params: {
  tx: TransactionContextLike;
  transactionId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreatePaymentReferenceInput;
  nowIso: string;
}): Promise<PaymentStatusReferenceRecord> {
  const { tx, transactionId, actorUid, isAdmin, input, nowIso } = params;
  const { txDoc, participants, finIndex } = await loadTransactionAndVerifyFinancialParticipant(
    tx,
    transactionId,
    actorUid,
    isAdmin,
  );

  assertMatchingCurrency(txDoc.monetary.currency, input.currency, 'createPaymentReference');
  assertActiveTransactionPartyUid(participants, input.payerUid, 'payerUid');
  assertActiveTransactionPartyUid(participants, input.payeeUid, 'payeeUid');

  if (input.obligationId) {
    const obSnap = await tx.get<FinancialObligationRecord>(`transactionObligations/${input.obligationId}`);
    if (!obSnap.exists || !obSnap.data || obSnap.data.transactionId !== transactionId) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Referenced obligationId does not belong to this transaction.');
    }
  }

  const paymentRefId = input.paymentRefId ?? `pmr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  if (finIndex.paymentRefIds.includes(paymentRefId)) {
    throw new CoreApiError('CONFLICT', 409, `Payment status reference "${paymentRefId}" already exists.`);
  }

  const record: PaymentStatusReferenceRecord = {
    paymentRefId,
    transactionId,
    ...(input.obligationId ? { obligationId: input.obligationId } : {}),
    initiationReference: input.initiationReference,
    ...(input.externalProviderName ? { externalProviderName: input.externalProviderName } : {}),
    ...(input.externalProviderRef ? { externalProviderRef: input.externalProviderRef } : {}),
    status: 'CREATED',
    amount: input.amount,
    refundedAmount: 0,
    currency: input.currency,
    payerUid: input.payerUid,
    payeeUid: input.payeeUid,
    refundIds: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`transactionPaymentRefs/${paymentRefId}`, record);
  finIndex.paymentRefIds.push(paymentRefId);
  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'PAYMENT_REF_RECORDED',
    actorUid,
    summary: `Payment status reference "${paymentRefId}" recorded (${input.amount} ${input.currency}).`,
    metadata: { paymentRefId, amount: input.amount, status: 'CREATED' },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return record;
}

export async function executeUpdatePaymentReferenceStatus(params: {
  tx: TransactionContextLike;
  transactionId: string;
  paymentRefId: string;
  actorUid: string;
  isAdmin: boolean;
  isTrustedProviderWebhook: boolean;
  input: UpdatePaymentReferenceInput;
  nowIso: string;
}): Promise<PaymentStatusReferenceRecord> {
  const { tx, transactionId, paymentRefId, actorUid, isAdmin, isTrustedProviderWebhook, input, nowIso } = params;
  const { finIndex } = await loadTransactionAndVerifyFinancialParticipant(
    tx,
    transactionId,
    actorUid,
    isAdmin || isTrustedProviderWebhook,
  );

  // Security Invariant: NEVER trust client-side payment-success claims
  if (input.status === 'CONFIRMED' && !isAdmin && !isTrustedProviderWebhook) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Payment confirmation is restricted to trusted server-side provider webhooks or authorized administrators.',
    );
  }

  const pSnap = await tx.get<PaymentStatusReferenceRecord>(`transactionPaymentRefs/${paymentRefId}`);
  if (!pSnap.exists || !pSnap.data || pSnap.data.transactionId !== transactionId) {
    throw new CoreApiError('NOT_FOUND', 404, `Payment reference "${paymentRefId}" was not found.`);
  }
  const current = pSnap.data;

  if (current.status === 'CONFIRMED' && input.status !== 'CONFIRMED') {
    throw new CoreApiError('CONFLICT', 409, 'Confirmed payment reference cannot be reverted directly; use a refund.');
  }

  const updated: PaymentStatusReferenceRecord = {
    ...current,
    status: input.status,
    ...(input.confirmationReference ? { confirmationReference: input.confirmationReference } : {}),
    ...(input.status === 'CONFIRMED'
      ? {
          confirmedAtIso: nowIso,
          confirmedBySource: isTrustedProviderWebhook ? 'TRUSTED_PROVIDER_WEBHOOK' : 'ADMIN_VERIFIED',
          ConfirmedByActorUid: actorUid,
        }
      : {}),
    ...(input.failureReasonClassification ? { failureReasonClassification: input.failureReasonClassification } : {}),
    ...(input.failureDetail ? { failureDetail: input.failureDetail } : {}),
    updatedAtIso: nowIso,
  };

  tx.set(`transactionPaymentRefs/${paymentRefId}`, updated);
  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'PAYMENT_REF_UPDATED',
    actorUid,
    summary: `Payment reference "${paymentRefId}" transitioned to "${input.status}".`,
    metadata: { paymentRefId, fromStatus: current.status, toStatus: input.status },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return updated;
}

export async function executeCreateSettlement(params: {
  tx: TransactionContextLike;
  transactionId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateSettlementInput;
  nowIso: string;
}): Promise<TransactionSettlementRecord> {
  const { tx, transactionId, actorUid, isAdmin, input, nowIso } = params;
  const { txDoc, participants, finIndex } = await loadTransactionAndVerifyFinancialParticipant(
    tx,
    transactionId,
    actorUid,
    isAdmin,
  );

  assertMatchingCurrency(txDoc.monetary.currency, input.currency, 'createSettlement');
  assertActiveTransactionPartyUid(participants, input.payerUid, 'payerUid');
  assertActiveTransactionPartyUid(participants, input.payeeUid, 'payeeUid');

  let totalAllocated = 0;
  for (const alloc of input.allocations) {
    const obSnap = await tx.get<FinancialObligationRecord>(`transactionObligations/${alloc.obligationId}`);
    if (!obSnap.exists || !obSnap.data || obSnap.data.transactionId !== transactionId) {
      throw new CoreApiError('NOT_FOUND', 404, `Obligation "${alloc.obligationId}" does not belong to this transaction.`);
    }
    const ob = obSnap.data;
    assertMatchingCurrency(ob.currency, input.currency, `settlementAllocation(${ob.obligationId})`);

    if (ob.status === 'DISPUTED' || ob.activeFinancialDisputeId) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `Obligation "${ob.obligationId}" is under active financial dispute and cannot be settled.`,
      );
    }
    if (ob.status === 'CANCELLED' || ob.status === 'SETTLED') {
      throw new CoreApiError('CONFLICT', 409, `Obligation "${ob.obligationId}" is in status "${ob.status}" and cannot accept new settlements.`);
    }
    if (ob.payerUid !== input.payerUid || ob.payeeUid !== input.payeeUid) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Obligation "${ob.obligationId}" payer/payee does not match settlement payer/payee.`,
      );
    }

    const outstanding = computeObligationOutstandingBalance(ob);
    if (alloc.allocatedAmount > outstanding) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Settlement allocation (${alloc.allocatedAmount}) exceeds outstanding balance (${outstanding}) for obligation "${ob.obligationId}".`,
      );
    }
    totalAllocated = safeAddMonetary(totalAllocated, alloc.allocatedAmount, 'settlement.totalAllocated');
  }

  const settlementId = input.settlementId ?? `stl_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  if (finIndex.settlementIds.includes(settlementId)) {
    throw new CoreApiError('CONFLICT', 409, `Settlement "${settlementId}" already exists.`);
  }

  const settlement: TransactionSettlementRecord = {
    settlementId,
    transactionId,
    allocations: input.allocations,
    totalAmount: totalAllocated,
    confirmedAmount: 0,
    refundedAmount: 0,
    currency: input.currency,
    payerUid: input.payerUid,
    payeeUid: input.payeeUid,
    ...(input.paymentRefId ? { paymentRefId: input.paymentRefId } : {}),
    status: 'CREATED',
    ledgerPostingGroupIds: [],
    initiatedByUid: actorUid,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`transactionSettlements/${settlementId}`, settlement);
  finIndex.settlementIds.push(settlementId);
  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'SETTLEMENT_CREATED',
    actorUid,
    summary: `Settlement "${settlementId}" created for ${totalAllocated} ${input.currency}.`,
    metadata: { settlementId, totalAmount: totalAllocated },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return settlement;
}

export async function executeSettlementAction(params: {
  tx: TransactionContextLike;
  transactionId: string;
  settlementId: string;
  actorUid: string;
  isAdmin: boolean;
  isTrustedProviderWebhook: boolean;
  input: SettlementActionInput;
  nowIso: string;
}): Promise<TransactionSettlementRecord> {
  const { tx, transactionId, settlementId, actorUid, isAdmin, isTrustedProviderWebhook, input, nowIso } = params;
  const { finIndex } = await loadTransactionAndVerifyFinancialParticipant(
    tx,
    transactionId,
    actorUid,
    isAdmin || isTrustedProviderWebhook,
  );

  const stlSnap = await tx.get<TransactionSettlementRecord>(`transactionSettlements/${settlementId}`);
  if (!stlSnap.exists || !stlSnap.data || stlSnap.data.transactionId !== transactionId) {
    throw new CoreApiError('NOT_FOUND', 404, `Settlement "${settlementId}" was not found.`);
  }
  const stl = stlSnap.data;

  if (stl.status === 'DISPUTED' && !isAdmin) {
    throw new CoreApiError('CONFLICT', 409, `Settlement "${settlementId}" is locked due to an active financial dispute.`);
  }

  if (input.action === 'INITIATE') {
    if (stl.status !== 'CREATED') {
      throw new CoreApiError('CONFLICT', 409, `Settlement in status "${stl.status}" cannot be initiated.`);
    }
    const updated: TransactionSettlementRecord = {
      ...stl,
      status: 'INITIATED',
      ...(input.paymentRefId ? { paymentRefId: input.paymentRefId } : {}),
      initiatedAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    tx.set(`transactionSettlements/${settlementId}`, updated);
    appendFinancialHistoryEvent(tx, finIndex, {
      eventType: 'SETTLEMENT_INITIATED',
      actorUid,
      summary: `Settlement "${settlementId}" initiated.`,
      metadata: { settlementId },
      nowIso,
    });
    saveFinancialIndex(tx, finIndex);
    return updated;
  }

  if (input.action === 'CANCEL' || input.action === 'FAIL') {
    if (stl.status === 'CONFIRMED' || stl.status === 'COMPLETED' || stl.status === 'PARTIALLY_SETTLED') {
      throw new CoreApiError('CONFLICT', 409, `Confirmed settlement "${settlementId}" cannot be cancelled; use a refund.`);
    }
    const nextStatus = input.action === 'CANCEL' ? 'CANCELLED' : 'FAILED';
    const updated: TransactionSettlementRecord = {
      ...stl,
      status: nextStatus,
      ...(input.action === 'CANCEL'
        ? { cancelledAtIso: nowIso, cancellationReason: input.reason ?? 'Cancelled by actor' }
        : { failureReason: input.reason ?? 'Settlement failed' }),
      updatedAtIso: nowIso,
    };
    tx.set(`transactionSettlements/${settlementId}`, updated);
    appendFinancialHistoryEvent(tx, finIndex, {
      eventType: input.action === 'CANCEL' ? 'SETTLEMENT_CANCELLED' : 'SETTLEMENT_FAILED',
      actorUid,
      summary: `Settlement "${settlementId}" marked as "${nextStatus}".`,
      metadata: { settlementId, status: nextStatus },
      nowIso,
    });
    saveFinancialIndex(tx, finIndex);
    return updated;
  }

  if (input.action === 'COMPLETE') {
    if (stl.status !== 'CONFIRMED') {
      throw new CoreApiError('CONFLICT', 409, 'Only CONFIRMED settlements can be marked COMPLETED.');
    }
    const updated: TransactionSettlementRecord = {
      ...stl,
      status: 'COMPLETED',
      completedAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    tx.set(`transactionSettlements/${settlementId}`, updated);
    saveFinancialIndex(tx, finIndex);
    return updated;
  }

  // input.action === 'CONFIRM'
  if (!isAdmin && !isTrustedProviderWebhook) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Settlement confirmation requires a trusted server-side payment integration or administrator verification.',
    );
  }
  if (stl.status === 'CANCELLED' || stl.status === 'FAILED') {
    throw new CoreApiError('CONFLICT', 409, `Cannot confirm a ${stl.status} settlement without a recovery settlement.`);
  }
  if (stl.status === 'CONFIRMED' || stl.status === 'COMPLETED') {
    throw new CoreApiError('CONFLICT', 409, `Settlement "${settlementId}" has already been confirmed.`);
  }

  const effectivePaymentRefId = input.paymentRefId ?? stl.paymentRefId;
  if (!effectivePaymentRefId) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Settlement confirmation requires a verified paymentRefId.');
  }
  const pRefSnap = await tx.get<PaymentStatusReferenceRecord>(`transactionPaymentRefs/${effectivePaymentRefId}`);
  if (!pRefSnap.exists || !pRefSnap.data || pRefSnap.data.transactionId !== transactionId) {
    throw new CoreApiError('NOT_FOUND', 404, `Payment reference "${effectivePaymentRefId}" was not found.`);
  }
  const pRef = pRefSnap.data;
  if (pRef.status !== 'CONFIRMED') {
    throw new CoreApiError('CONFLICT', 409, `Payment reference "${effectivePaymentRefId}" is not in CONFIRMED status.`);
  }
  assertMatchingCurrency(stl.currency, pRef.currency, 'confirmSettlement.paymentRef');

  // Ensure payment reference hasn't already been used by another confirmed settlement
  for (const otherStlId of finIndex.settlementIds) {
    if (otherStlId === settlementId) continue;
    const oSnap = await tx.get<TransactionSettlementRecord>(`transactionSettlements/${otherStlId}`);
    if (
      oSnap.exists &&
      oSnap.data &&
      oSnap.data.paymentRefId === effectivePaymentRefId &&
      (oSnap.data.status === 'CONFIRMED' || oSnap.data.status === 'COMPLETED' || oSnap.data.status === 'PARTIALLY_SETTLED')
    ) {
      throw new CoreApiError('CONFLICT', 409, `Payment reference "${effectivePaymentRefId}" is already bound to settlement "${otherStlId}".`);
    }
  }

  const confirmTotal = input.confirmedAmount ?? stl.totalAmount;
  if (confirmTotal > stl.totalAmount || confirmTotal > pRef.amount) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Confirmed settlement amount (${confirmTotal}) cannot exceed settlement total (${stl.totalAmount}) or confirmed payment amount (${pRef.amount}).`,
    );
  }

  let remainingToAllocate = confirmTotal;
  const newPostingGroups: string[] = [...stl.ledgerPostingGroupIds];

  for (const alloc of stl.allocations) {
    if (remainingToAllocate <= 0) break;
    const obSnap = await tx.get<FinancialObligationRecord>(`transactionObligations/${alloc.obligationId}`);
    if (!obSnap.exists || !obSnap.data) {
      throw new CoreApiError('NOT_FOUND', 404, `Obligation "${alloc.obligationId}" missing during settlement.`);
    }
    const ob = obSnap.data;
    if (ob.status === 'DISPUTED') {
      throw new CoreApiError('CONFLICT', 409, `Obligation "${ob.obligationId}" is disputed.`);
    }
    const outstanding = computeObligationOutstandingBalance(ob);
    const applyAmt = Math.min(remainingToAllocate, alloc.allocatedAmount, outstanding);
    if (applyAmt <= 0) continue;

    remainingToAllocate = safeSubtractMonetary(remainingToAllocate, applyAmt, 'settlement.remaining');
    const nextSettled = safeAddMonetary(ob.settledAmount, applyAmt, 'obligation.settledAmount');
    const nextObStatus = nextSettled - ob.refundedAmount >= ob.amount ? 'SETTLED' : 'PARTIALLY_SETTLED';

    const updatedOb: FinancialObligationRecord = {
      ...ob,
      settledAmount: nextSettled,
      status: nextObStatus,
      settlementIds: ob.settlementIds.includes(settlementId) ? ob.settlementIds : [...ob.settlementIds, settlementId],
      updatedAtIso: nowIso,
    };
    tx.set(`transactionObligations/${ob.obligationId}`, updatedOb);

    // If obligation is linked to a rental security deposit, update refundable deposit balance
    if (ob.category === 'SECURITY_DEPOSIT' && ob.scheduleId) {
      const schSnap = await tx.get<RentalSchedulePlanRecord>(`transactionRentalSchedules/${ob.scheduleId}`);
      if (schSnap.exists && schSnap.data) {
        tx.set(`transactionRentalSchedules/${ob.scheduleId}`, {
          ...schSnap.data,
          securityDepositRefundableBalance: safeAddMonetary(
            schSnap.data.securityDepositRefundableBalance,
            applyAmt,
            'rentalSchedule.depositBalance',
          ),
          updatedAtIso: nowIso,
        });
      }
    }

    // If obligation is linked to a broker commission, update commission status
    if (ob.commissionAgreementId && nextObStatus === 'SETTLED') {
      const comSnap = await tx.get<CommissionAgreementRecord>(`transactionCommissions/${ob.commissionAgreementId}`);
      if (comSnap.exists && comSnap.data) {
        tx.set(`transactionCommissions/${ob.commissionAgreementId}`, {
          ...comSnap.data,
          status: 'SETTLED',
          updatedAtIso: nowIso,
        });
      }
    }

    const pgId = `lpg_stl_${settlementId}_${ob.obligationId}`;
    const [dr, cr] = buildBalancedDoubleEntryPair({
      postingGroupId: pgId,
      debitEntryId: `le_dr_${pgId}`,
      creditEntryId: `le_cr_${pgId}`,
      transactionId,
      entryType: ob.category === 'BROKER_COMMISSION' ? 'COMMISSION_SETTLEMENT' : 'SETTLEMENT_POSTING',
      debitAccount: 'SETTLEMENT_CLEARING',
      creditAccount: 'PARTY_RECEIVABLE',
      amount: applyAmt,
      currency: stl.currency,
      financialCategory: ob.category,
      responsiblePartyUid: stl.payerUid,
      beneficiaryUid: stl.payeeUid,
      relatedObligationId: ob.obligationId,
      relatedSettlementId: settlementId,
      actorUid,
      createdAtIso: nowIso,
      idempotencyReference: `stl_conf_${settlementId}_${ob.obligationId}`,
    });
    tx.set(`transactionLedgerEntries/${dr.entryId}`, dr);
    tx.set(`transactionLedgerEntries/${cr.entryId}`, cr);
    finIndex.ledgerEntryIds.push(dr.entryId, cr.entryId);
    finIndex.postingGroupIds.push(pgId);
    newPostingGroups.push(pgId);
  }

  const nextStlStatus = confirmTotal >= stl.totalAmount ? 'CONFIRMED' : 'PARTIALLY_SETTLED';
  const updatedStl: TransactionSettlementRecord = {
    ...stl,
    paymentRefId: effectivePaymentRefId,
    confirmedAmount: confirmTotal,
    status: nextStlStatus,
    ledgerPostingGroupIds: newPostingGroups,
    confirmedAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  tx.set(`transactionSettlements/${settlementId}`, updatedStl);

  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'SETTLEMENT_CONFIRMED',
    actorUid,
    summary: `Settlement "${settlementId}" confirmed for ${confirmTotal} ${stl.currency}.`,
    metadata: { settlementId, confirmedAmount: confirmTotal, status: nextStlStatus },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return updatedStl;
}

export async function executeCreateAndConfirmRefund(params: {
  tx: TransactionContextLike;
  transactionId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateRefundInput;
  nowIso: string;
}): Promise<TransactionRefundRecord> {
  const { tx, transactionId, actorUid, isAdmin, input, nowIso } = params;
  const { finIndex } = await loadTransactionAndVerifyFinancialParticipant(tx, transactionId, actorUid, isAdmin);

  const stlSnap = await tx.get<TransactionSettlementRecord>(`transactionSettlements/${input.settlementId}`);
  if (!stlSnap.exists || !stlSnap.data || stlSnap.data.transactionId !== transactionId) {
    throw new CoreApiError('NOT_FOUND', 404, `Settlement "${input.settlementId}" was not found in this transaction.`);
  }
  const stl = stlSnap.data;
  assertMatchingCurrency(stl.currency, input.currency, 'createRefund');

  const obSnap = await tx.get<FinancialObligationRecord>(`transactionObligations/${input.obligationId}`);
  if (!obSnap.exists || !obSnap.data || obSnap.data.transactionId !== transactionId) {
    throw new CoreApiError('NOT_FOUND', 404, `Obligation "${input.obligationId}" was not found in this transaction.`);
  }

  const existingRefunds: TransactionRefundRecord[] = [];
  for (const rid of finIndex.refundIds) {
    const rSnap = await tx.get<TransactionRefundRecord>(`transactionRefunds/${rid}`);
    if (rSnap.exists && rSnap.data) existingRefunds.push(rSnap.data);
  }

  const refundable = computeSettlementRefundableBalance(stl, existingRefunds);
  if (input.amount > refundable) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Refund amount (${input.amount}) exceeds eligible refundable balance (${refundable}) for settlement "${stl.settlementId}".`,
    );
  }

  const refundId = input.refundId ?? `rfd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  if (finIndex.refundIds.includes(refundId)) {
    throw new CoreApiError('CONFLICT', 409, `Refund "${refundId}" already exists.`);
  }

  const refund: TransactionRefundRecord = {
    refundId,
    transactionId,
    settlementId: stl.settlementId,
    obligationId: input.obligationId,
    ...(stl.paymentRefId ? { paymentRefId: stl.paymentRefId } : {}),
    amount: input.amount,
    currency: input.currency,
    payerUid: stl.payeeUid,
    payeeUid: stl.payerUid,
    reason: input.reason,
    status: 'REQUESTED',
    requestedByUid: actorUid,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`transactionRefunds/${refundId}`, refund);
  finIndex.refundIds.push(refundId);
  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'REFUND_REQUESTED',
    actorUid,
    summary: `Refund "${refundId}" requested for ${input.amount} ${input.currency}.`,
    metadata: { refundId, settlementId: stl.settlementId, amount: input.amount },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return refund;
}

export async function executeRefundDecision(params: {
  tx: TransactionContextLike;
  transactionId: string;
  refundId: string;
  actorUid: string;
  isAdmin: boolean;
  isTrustedProviderWebhook: boolean;
  input: RefundDecisionInput;
  nowIso: string;
}): Promise<TransactionRefundRecord> {
  const { tx, transactionId, refundId, actorUid, isAdmin, isTrustedProviderWebhook, input, nowIso } = params;
  const { finIndex } = await loadTransactionAndVerifyFinancialParticipant(
    tx,
    transactionId,
    actorUid,
    isAdmin || isTrustedProviderWebhook,
  );

  if (!isAdmin && !isTrustedProviderWebhook) {
    throw new CoreApiError('FORBIDDEN', 403, 'Refund authorization and confirmation require admin or trusted provider privileges.');
  }

  const refSnap = await tx.get<TransactionRefundRecord>(`transactionRefunds/${refundId}`);
  if (!refSnap.exists || !refSnap.data || refSnap.data.transactionId !== transactionId) {
    throw new CoreApiError('NOT_FOUND', 404, `Refund "${refundId}" was not found.`);
  }
  const ref = refSnap.data;

  if (input.action === 'AUTHORIZE') {
    if (ref.status !== 'REQUESTED') {
      throw new CoreApiError('CONFLICT', 409, `Refund in status "${ref.status}" cannot be authorized.`);
    }
    const updated: TransactionRefundRecord = {
      ...ref,
      status: 'AUTHORIZED',
      authorizedByUid: actorUid,
      updatedAtIso: nowIso,
    };
    tx.set(`transactionRefunds/${refundId}`, updated);
    saveFinancialIndex(tx, finIndex);
    return updated;
  }

  if (input.action === 'REJECT') {
    if (ref.status !== 'REQUESTED' && ref.status !== 'AUTHORIZED') {
      throw new CoreApiError('CONFLICT', 409, `Refund in status "${ref.status}" cannot be rejected.`);
    }
    const updated: TransactionRefundRecord = { ...ref, status: 'REJECTED', updatedAtIso: nowIso };
    tx.set(`transactionRefunds/${refundId}`, updated);
    saveFinancialIndex(tx, finIndex);
    return updated;
  }

  const stlSnap = await tx.get<TransactionSettlementRecord>(`transactionSettlements/${ref.settlementId}`);
  const obSnap = await tx.get<FinancialObligationRecord>(`transactionObligations/${ref.obligationId}`);
  if (!stlSnap.exists || !stlSnap.data || !obSnap.exists || !obSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, 'Linked settlement or obligation missing for refund.');
  }
  const stl = stlSnap.data;
  const ob = obSnap.data;

  if (input.action === 'CONFIRM') {
    if (ref.status !== 'REQUESTED' && ref.status !== 'AUTHORIZED') {
      throw new CoreApiError('CONFLICT', 409, `Refund "${refundId}" is already in status "${ref.status}".`);
    }
    if (!input.externalRefundRef) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'externalRefundRef is required to confirm a refund.');
    }

    const pgId = `lpg_rfd_${refundId}`;
    const [dr, cr] = buildBalancedDoubleEntryPair({
      postingGroupId: pgId,
      debitEntryId: `le_dr_${pgId}`,
      creditEntryId: `le_cr_${pgId}`,
      transactionId,
      entryType: 'REFUND_POSTING',
      debitAccount: 'PARTY_RECEIVABLE',
      creditAccount: 'REFUND_CLEARING',
      amount: ref.amount,
      currency: ref.currency,
      financialCategory: 'REFUND_OBLIGATION',
      responsiblePartyUid: ref.payerUid,
      beneficiaryUid: ref.payeeUid,
      relatedObligationId: ref.obligationId,
      relatedSettlementId: ref.settlementId,
      relatedRefundId: refundId,
      actorUid,
      createdAtIso: nowIso,
      idempotencyReference: `rfd_conf_${refundId}`,
    });
    tx.set(`transactionLedgerEntries/${dr.entryId}`, dr);
    tx.set(`transactionLedgerEntries/${cr.entryId}`, cr);
    finIndex.ledgerEntryIds.push(dr.entryId, cr.entryId);
    finIndex.postingGroupIds.push(pgId);

    const nextObRefunded = safeAddMonetary(ob.refundedAmount, ref.amount, 'ob.refundedAmount');
    const netSettled = safeSubtractMonetary(ob.settledAmount, nextObRefunded, 'ob.netSettledAfterRefund');
    tx.set(`transactionObligations/${ob.obligationId}`, {
      ...ob,
      refundedAmount: nextObRefunded,
      status: netSettled === 0 ? 'PENDING' : netSettled < ob.amount ? 'PARTIALLY_SETTLED' : 'SETTLED',
      updatedAtIso: nowIso,
    });

    const nextStlRefunded = safeAddMonetary(stl.refundedAmount, ref.amount, 'stl.refundedAmount');
    tx.set(`transactionSettlements/${stl.settlementId}`, {
      ...stl,
      refundedAmount: nextStlRefunded,
      updatedAtIso: nowIso,
    });

    if (ref.paymentRefId) {
      const pSnap = await tx.get<PaymentStatusReferenceRecord>(`transactionPaymentRefs/${ref.paymentRefId}`);
      if (pSnap.exists && pSnap.data) {
        const nextPRefunded = safeAddMonetary(pSnap.data.refundedAmount, ref.amount, 'paymentRef.refundedAmount');
        tx.set(`transactionPaymentRefs/${ref.paymentRefId}`, {
          ...pSnap.data,
          refundedAmount: nextPRefunded,
          status: nextPRefunded >= pSnap.data.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          refundIds: pSnap.data.refundIds.includes(refundId) ? pSnap.data.refundIds : [...pSnap.data.refundIds, refundId],
          updatedAtIso: nowIso,
        });
      }
    }

    const updated: TransactionRefundRecord = {
      ...ref,
      status: 'CONFIRMED',
      externalRefundRef: input.externalRefundRef,
      ledgerPostingGroupId: pgId,
      confirmedByUid: actorUid,
      confirmedAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    tx.set(`transactionRefunds/${refundId}`, updated);
    appendFinancialHistoryEvent(tx, finIndex, {
      eventType: 'REFUND_CONFIRMED',
      actorUid,
      summary: `Refund "${refundId}" confirmed (${ref.amount} ${ref.currency}).`,
      metadata: { refundId, amount: ref.amount, externalRefundRef: input.externalRefundRef },
      nowIso,
    });
    saveFinancialIndex(tx, finIndex);
    return updated;
  }

  // input.action === 'REVERSE'
  if (ref.status !== 'CONFIRMED') {
    throw new CoreApiError('CONFLICT', 409, 'Only CONFIRMED refunds can be reversed.');
  }
  const revPgId = `lpg_rfd_rev_${refundId}`;
  const [dr, cr] = buildBalancedDoubleEntryPair({
    postingGroupId: revPgId,
    debitEntryId: `le_dr_${revPgId}`,
    creditEntryId: `le_cr_${revPgId}`,
    transactionId,
    entryType: 'REVERSAL_POSTING',
    debitAccount: 'REFUND_CLEARING',
    creditAccount: 'PARTY_RECEIVABLE',
    amount: ref.amount,
    currency: ref.currency,
    financialCategory: 'REFUND_OBLIGATION',
    responsiblePartyUid: ref.payerUid,
    beneficiaryUid: ref.payeeUid,
    relatedObligationId: ref.obligationId,
    relatedSettlementId: ref.settlementId,
    relatedRefundId: refundId,
    actorUid,
    createdAtIso: nowIso,
    idempotencyReference: `rfd_rev_${refundId}`,
  });
  tx.set(`transactionLedgerEntries/${dr.entryId}`, dr);
  tx.set(`transactionLedgerEntries/${cr.entryId}`, cr);
  finIndex.ledgerEntryIds.push(dr.entryId, cr.entryId);
  finIndex.postingGroupIds.push(revPgId);

  const nextObRefunded = safeSubtractMonetary(ob.refundedAmount, ref.amount, 'ob.reverseRefund');
  const netSettled = safeSubtractMonetary(ob.settledAmount, nextObRefunded, 'ob.netAfterReverse');
  tx.set(`transactionObligations/${ob.obligationId}`, {
    ...ob,
    refundedAmount: nextObRefunded,
    status: netSettled >= ob.amount ? 'SETTLED' : netSettled > 0 ? 'PARTIALLY_SETTLED' : 'PENDING',
    updatedAtIso: nowIso,
  });

  tx.set(`transactionSettlements/${stl.settlementId}`, {
    ...stl,
    refundedAmount: safeSubtractMonetary(stl.refundedAmount, ref.amount, 'stl.reverseRefund'),
    updatedAtIso: nowIso,
  });

  const updated: TransactionRefundRecord = {
    ...ref,
    status: 'REVERSED',
    reversalPostingGroupId: revPgId,
    reversedAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  tx.set(`transactionRefunds/${refundId}`, updated);
  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'REFUND_REVERSED',
    actorUid,
    summary: `Refund "${refundId}" reversed.`,
    metadata: { refundId, reversalPostingGroupId: revPgId },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return updated;
}

export async function executeCreateFinancialDispute(params: {
  tx: TransactionContextLike;
  transactionId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateFinancialDisputeInput;
  nowIso: string;
}): Promise<FinancialDisputeRecord> {
  const { tx, transactionId, actorUid, isAdmin, input, nowIso } = params;
  const { txDoc, finIndex } = await loadTransactionAndVerifyFinancialParticipant(tx, transactionId, actorUid, isAdmin);
  assertMatchingCurrency(txDoc.monetary.currency, input.currency, 'createFinancialDispute');

  const obIds = input.disputedObligationIds ?? [];
  const stlIds = input.disputedSettlementIds ?? [];
  if (obIds.length === 0 && stlIds.length === 0) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Financial dispute must reference at least one disputedObligationId or disputedSettlementId.',
    );
  }

  const financialDisputeId = input.financialDisputeId ?? `fnd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

  // Restrict only the specifically referenced obligations and settlements (never freeze unrelated obligations/transactions)
  for (const oid of obIds) {
    const obSnap = await tx.get<FinancialObligationRecord>(`transactionObligations/${oid}`);
    if (!obSnap.exists || !obSnap.data || obSnap.data.transactionId !== transactionId) {
      throw new CoreApiError('NOT_FOUND', 404, `Disputed obligation "${oid}" does not belong to this transaction.`);
    }
    const ob = obSnap.data;
    tx.set(`transactionObligations/${oid}`, {
      ...ob,
      statusBeforeDispute: ob.status === 'DISPUTED' ? ob.statusBeforeDispute : ob.status,
      status: 'DISPUTED',
      activeFinancialDisputeId: financialDisputeId,
      updatedAtIso: nowIso,
    });
  }

  for (const sid of stlIds) {
    const stlSnap = await tx.get<TransactionSettlementRecord>(`transactionSettlements/${sid}`);
    if (!stlSnap.exists || !stlSnap.data || stlSnap.data.transactionId !== transactionId) {
      throw new CoreApiError('NOT_FOUND', 404, `Disputed settlement "${sid}" does not belong to this transaction.`);
    }
    const stl = stlSnap.data;
    tx.set(`transactionSettlements/${sid}`, {
      ...stl,
      statusBeforeDispute: stl.status === 'DISPUTED' ? stl.statusBeforeDispute : stl.status,
      status: 'DISPUTED',
      activeFinancialDisputeId: financialDisputeId,
      updatedAtIso: nowIso,
    });
  }

  const dispute: FinancialDisputeRecord = {
    financialDisputeId,
    transactionId,
    ...(input.linkedTransactionDisputeId ? { linkedTransactionDisputeId: input.linkedTransactionDisputeId } : {}),
    disputedObligationIds: obIds,
    disputedSettlementIds: stlIds,
    disputedAmount: input.disputedAmount,
    currency: input.currency,
    reason: input.reason,
    status: 'OPEN',
    initiatedByUid: actorUid,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`transactionFinancialDisputes/${financialDisputeId}`, dispute);
  finIndex.financialDisputeIds.push(financialDisputeId);
  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'FINANCIAL_DISPUTE_OPENED',
    actorUid,
    summary: `Financial dispute "${financialDisputeId}" opened for ${input.disputedAmount} ${input.currency}.`,
    metadata: { financialDisputeId, disputedAmount: input.disputedAmount },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return dispute;
}

export async function executeResolveFinancialDispute(params: {
  tx: TransactionContextLike;
  transactionId: string;
  financialDisputeId: string;
  adminUid: string;
  input: ResolveFinancialDisputeInput;
  nowIso: string;
}): Promise<FinancialDisputeRecord> {
  const { tx, transactionId, financialDisputeId, adminUid, input, nowIso } = params;
  const { finIndex } = await loadTransactionAndVerifyFinancialParticipant(tx, transactionId, adminUid, true);

  const dSnap = await tx.get<FinancialDisputeRecord>(`transactionFinancialDisputes/${financialDisputeId}`);
  if (!dSnap.exists || !dSnap.data || dSnap.data.transactionId !== transactionId) {
    throw new CoreApiError('NOT_FOUND', 404, `Financial dispute "${financialDisputeId}" was not found.`);
  }
  const dispute = dSnap.data;

  if (
    (input.targetStatus === 'RESOLVED' || input.targetStatus === 'DISMISSED') &&
    input.restoreObligationsAndSettlements !== false
  ) {
    for (const oid of dispute.disputedObligationIds) {
      const obSnap = await tx.get<FinancialObligationRecord>(`transactionObligations/${oid}`);
      if (obSnap.exists && obSnap.data && obSnap.data.activeFinancialDisputeId === financialDisputeId) {
        tx.set(`transactionObligations/${oid}`, {
          ...obSnap.data,
          status: obSnap.data.statusBeforeDispute ?? 'PENDING',
          activeFinancialDisputeId: undefined,
          updatedAtIso: nowIso,
        });
      }
    }
    for (const sid of dispute.disputedSettlementIds) {
      const stlSnap = await tx.get<TransactionSettlementRecord>(`transactionSettlements/${sid}`);
      if (stlSnap.exists && stlSnap.data && stlSnap.data.activeFinancialDisputeId === financialDisputeId) {
        tx.set(`transactionSettlements/${sid}`, {
          ...stlSnap.data,
          status: stlSnap.data.statusBeforeDispute ?? 'CREATED',
          activeFinancialDisputeId: undefined,
          updatedAtIso: nowIso,
        });
      }
    }
  }

  const updated: FinancialDisputeRecord = {
    ...dispute,
    status: input.targetStatus,
    resolutionReference: input.resolutionReference,
    resolutionSummary: input.resolutionSummary,
    resolvedByAdminUid: adminUid,
    ...(input.targetStatus === 'RESOLVED' || input.targetStatus === 'DISMISSED' ? { resolvedAtIso: nowIso } : {}),
    updatedAtIso: nowIso,
  };

  tx.set(`transactionFinancialDisputes/${financialDisputeId}`, updated);
  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'FINANCIAL_DISPUTE_RESOLVED',
    actorUid: adminUid,
    summary: `Financial dispute "${financialDisputeId}" updated to "${input.targetStatus}".`,
    metadata: { financialDisputeId, status: input.targetStatus },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return updated;
}
