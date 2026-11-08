import { randomUUID } from 'node:crypto';
import { CoreApiError, type TransactionContextLike } from '../../core';
import { assertTransactionNotSuspended } from '../stateMachineAndAuthz';
import type {
  StoredTransactionDocument,
  TransactionCurrency,
  TransactionParticipantRecord,
} from '../types';
import {
  assertMatchingCurrency,
  buildBalancedDoubleEntryPair,
  computeCommissionAmount,
  generateDeterministicRentalInstallmentDates,
  validateObligationStatusTransition,
} from './calculationEngine';
import type {
  CommissionAgreementRecord,
  FinancialHistoryEventRecord,
  FinancialHistoryEventType,
  FinancialLedgerEntryRecord,
  FinancialObligationRecord,
  RentalSchedulePlanRecord,
  TransactionFinancialIndexRecord,
} from './types';
import type {
  CreateCommissionInput,
  CreateLedgerPostingInput,
  CreateObligationInput,
  GenerateRentalScheduleInput,
  ReverseLedgerPostingInput,
  UpdateObligationInput,
} from './validation';

export async function loadTransactionAndVerifyFinancialParticipant(
  tx: TransactionContextLike,
  transactionId: string,
  actorUid: string,
  isAdmin: boolean,
): Promise<{
  txDoc: StoredTransactionDocument;
  participants: TransactionParticipantRecord[];
  actorParticipant?: TransactionParticipantRecord;
  finIndex: TransactionFinancialIndexRecord;
}> {
  const txSnap = await tx.get<StoredTransactionDocument>(`transactions/${transactionId}`);
  if (!txSnap.exists || !txSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Transaction "${transactionId}" was not found.`);
  }
  const txDoc = txSnap.data;
  assertTransactionNotSuspended(txDoc, isAdmin);

  const allKnownUids = Array.from(
    new Set([...txDoc.activeParticipantUids, ...txDoc.invitedParticipantUids]),
  );
  const participants: TransactionParticipantRecord[] = [];
  for (const uid of allKnownUids) {
    const pSnap = await tx.get<TransactionParticipantRecord>(
      `transactionParticipants/prt_${transactionId}_${uid}`,
    );
    if (pSnap.exists && pSnap.data) {
      participants.push(pSnap.data);
    }
  }

  const actorParticipant = participants.find((p) => p.userId === actorUid && p.status === 'ACTIVE');
  if (!actorParticipant && !isAdmin) {
    throw new CoreApiError('FORBIDDEN', 403, 'Principal is not an active participant in this transaction.');
  }

  const idxSnap = await tx.get<TransactionFinancialIndexRecord>(`transactionFinancialMeta/${transactionId}`);
  const finIndex: TransactionFinancialIndexRecord =
    idxSnap.exists && idxSnap.data
      ? {
          ...idxSnap.data,
          obligationIds: [...idxSnap.data.obligationIds],
          ledgerEntryIds: [...idxSnap.data.ledgerEntryIds],
          postingGroupIds: [...idxSnap.data.postingGroupIds],
          paymentRefIds: [...idxSnap.data.paymentRefIds],
          settlementIds: [...idxSnap.data.settlementIds],
          refundIds: [...idxSnap.data.refundIds],
          rentalScheduleIds: [...idxSnap.data.rentalScheduleIds],
          commissionIds: [...idxSnap.data.commissionIds],
          financialDisputeIds: [...idxSnap.data.financialDisputeIds],
          reconciliationReportIds: [...idxSnap.data.reconciliationReportIds],
          historyEventIds: [...idxSnap.data.historyEventIds],
        }
      : {
          transactionId,
          currency: txDoc.monetary.currency,
          obligationIds: [],
          ledgerEntryIds: [],
          postingGroupIds: [],
          paymentRefIds: [],
          settlementIds: [],
          refundIds: [],
          rentalScheduleIds: [],
          commissionIds: [],
          financialDisputeIds: [],
          reconciliationReportIds: [],
          historyEventIds: [],
          lastReconciliationStatus: 'RECONCILED',
          historySequence: 0,
          updatedAtIso: new Date().toISOString(),
        };

  return { txDoc, participants, actorParticipant, finIndex };
}

export function appendFinancialHistoryEvent(
  tx: TransactionContextLike,
  finIndex: TransactionFinancialIndexRecord,
  params: {
    eventType: FinancialHistoryEventType;
    actorUid: string;
    summary: string;
    metadata: Record<string, string | number | boolean>;
    nowIso: string;
  },
): FinancialHistoryEventRecord {
  finIndex.historySequence += 1;
  const eventId = `fhe_${finIndex.transactionId}_${finIndex.historySequence}_${randomUUID().slice(0, 6)}`;
  const record: FinancialHistoryEventRecord = {
    eventId,
    transactionId: finIndex.transactionId,
    sequenceNumber: finIndex.historySequence,
    eventType: params.eventType,
    actorUid: params.actorUid,
    summary: params.summary,
    metadata: params.metadata,
    timestampIso: params.nowIso,
  };
  tx.set(`transactionFinancialHistory/${eventId}`, record);
  finIndex.historyEventIds.push(eventId);
  finIndex.updatedAtIso = params.nowIso;
  return record;
}

export function saveFinancialIndex(
  tx: TransactionContextLike,
  finIndex: TransactionFinancialIndexRecord,
): void {
  tx.set(`transactionFinancialMeta/${finIndex.transactionId}`, finIndex);
}

export function assertActiveTransactionPartyUid(
  participants: readonly TransactionParticipantRecord[],
  uid: string,
  fieldLabel: string,
): TransactionParticipantRecord {
  const found = participants.find((p) => p.userId === uid && p.status === 'ACTIVE');
  if (!found) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Referenced ${fieldLabel} "${uid}" is not an active participant in this transaction.`,
    );
  }
  return found;
}

export async function executeCreateObligation(params: {
  tx: TransactionContextLike;
  transactionId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateObligationInput;
  nowIso: string;
}): Promise<FinancialObligationRecord> {
  const { tx, transactionId, actorUid, isAdmin, input, nowIso } = params;
  const { txDoc, participants, finIndex } = await loadTransactionAndVerifyFinancialParticipant(
    tx,
    transactionId,
    actorUid,
    isAdmin,
  );

  assertMatchingCurrency(txDoc.monetary.currency, input.currency, 'createObligation');
  assertActiveTransactionPartyUid(participants, input.payerUid, 'payerUid');
  assertActiveTransactionPartyUid(participants, input.payeeUid, 'payeeUid');

  const obligationId = input.obligationId ?? `obl_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  if (finIndex.obligationIds.includes(obligationId)) {
    throw new CoreApiError('CONFLICT', 409, `Obligation "${obligationId}" already exists.`);
  }

  const status = input.initialStatus ?? 'PENDING';
  const obligation: FinancialObligationRecord = {
    obligationId,
    transactionId,
    category: input.category,
    title: input.title,
    amount: input.amount,
    settledAmount: 0,
    refundedAmount: 0,
    currency: input.currency,
    payerUid: input.payerUid,
    payeeUid: input.payeeUid,
    dueDateIso: input.dueDateIso,
    status,
    ...(input.contractReferenceId ? { contractReferenceId: input.contractReferenceId } : {}),
    settlementIds: [],
    createdByUid: actorUid,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`transactionObligations/${obligationId}`, obligation);
  finIndex.obligationIds.push(obligationId);

  // Record balanced obligation recognition double-entry posting when status is PENDING
  if (status === 'PENDING') {
    const postingGroupId = `lpg_obl_${obligationId}`;
    const [debitEntry, creditEntry] = buildBalancedDoubleEntryPair({
      postingGroupId,
      debitEntryId: `le_dr_${obligationId}`,
      creditEntryId: `le_cr_${obligationId}`,
      transactionId,
      entryType: 'OBLIGATION_RECOGNITION',
      debitAccount: 'PARTY_RECEIVABLE',
      creditAccount: 'OBLIGATION_CONTROL',
      amount: input.amount,
      currency: input.currency,
      financialCategory: input.category,
      responsiblePartyUid: input.payerUid,
      beneficiaryUid: input.payeeUid,
      relatedObligationId: obligationId,
      actorUid,
      createdAtIso: nowIso,
      idempotencyReference: `obl_init_${obligationId}`,
      metadata: { category: input.category },
    });
    tx.set(`transactionLedgerEntries/${debitEntry.entryId}`, debitEntry);
    tx.set(`transactionLedgerEntries/${creditEntry.entryId}`, creditEntry);
    finIndex.ledgerEntryIds.push(debitEntry.entryId, creditEntry.entryId);
    finIndex.postingGroupIds.push(postingGroupId);
  }

  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'OBLIGATION_CREATED',
    actorUid,
    summary: `Financial obligation "${obligationId}" (${input.category}) created for ${input.amount} ${input.currency}.`,
    metadata: { obligationId, category: input.category, amount: input.amount, status },
    nowIso,
  });

  saveFinancialIndex(tx, finIndex);
  return obligation;
}

export async function executeUpdateObligation(params: {
  tx: TransactionContextLike;
  transactionId: string;
  obligationId: string;
  actorUid: string;
  isAdmin: boolean;
  input: UpdateObligationInput;
  nowIso: string;
}): Promise<FinancialObligationRecord> {
  const { tx, transactionId, obligationId, actorUid, isAdmin, input, nowIso } = params;
  const { finIndex } = await loadTransactionAndVerifyFinancialParticipant(tx, transactionId, actorUid, isAdmin);

  const obSnap = await tx.get<FinancialObligationRecord>(`transactionObligations/${obligationId}`);
  if (!obSnap.exists || !obSnap.data || obSnap.data.transactionId !== transactionId) {
    throw new CoreApiError('NOT_FOUND', 404, `Obligation "${obligationId}" was not found.`);
  }
  const obligation = obSnap.data;

  if (obligation.status === 'SETTLED' && !isAdmin) {
    throw new CoreApiError('CONFLICT', 409, 'Settled obligations cannot be directly modified.');
  }
  if (obligation.status === 'DISPUTED' && !isAdmin) {
    throw new CoreApiError('CONFLICT', 409, 'Cannot modify an obligation while under active financial dispute.');
  }

  let nextStatus = obligation.status;
  if (input.targetStatus && input.targetStatus !== obligation.status) {
    const check = validateObligationStatusTransition({
      obligation,
      targetStatus: input.targetStatus,
      isAdmin,
      viaSettlementOrRefundEngine: false,
    });
    if (!check.allowed) {
      throw new CoreApiError('CONFLICT', 409, check.reason ?? 'Invalid obligation status transition.');
    }
    nextStatus = input.targetStatus;
  }

  const updated: FinancialObligationRecord = {
    ...obligation,
    status: nextStatus,
    ...(input.dueDateIso ? { dueDateIso: input.dueDateIso } : {}),
    ...(input.title ? { title: input.title } : {}),
    updatedAtIso: nowIso,
  };

  tx.set(`transactionObligations/${obligationId}`, updated);
  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'OBLIGATION_UPDATED',
    actorUid,
    summary: `Obligation "${obligationId}" updated to status "${nextStatus}".`,
    metadata: { obligationId, fromStatus: obligation.status, toStatus: nextStatus },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return updated;
}

export async function executePostLedgerPair(params: {
  tx: TransactionContextLike;
  transactionId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateLedgerPostingInput;
  idempotencyReference: string;
  nowIso: string;
}): Promise<{ postingGroupId: string; entries: [FinancialLedgerEntryRecord, FinancialLedgerEntryRecord] }> {
  const { tx, transactionId, actorUid, isAdmin, input, idempotencyReference, nowIso } = params;
  const { txDoc, participants, finIndex } = await loadTransactionAndVerifyFinancialParticipant(
    tx,
    transactionId,
    actorUid,
    isAdmin,
  );

  assertMatchingCurrency(txDoc.monetary.currency, input.currency, 'postLedgerPair');
  assertActiveTransactionPartyUid(participants, input.responsiblePartyUid, 'responsiblePartyUid');
  if (input.beneficiaryUid) {
    assertActiveTransactionPartyUid(participants, input.beneficiaryUid, 'beneficiaryUid');
  }

  if (input.relatedObligationId) {
    const obSnap = await tx.get<FinancialObligationRecord>(`transactionObligations/${input.relatedObligationId}`);
    if (!obSnap.exists || !obSnap.data || obSnap.data.transactionId !== transactionId) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'relatedObligationId does not belong to this transaction.');
    }
  }

  const postingGroupId = input.postingGroupId ?? `lpg_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  if (finIndex.postingGroupIds.includes(postingGroupId)) {
    throw new CoreApiError('CONFLICT', 409, `Ledger posting group "${postingGroupId}" already exists.`);
  }

  // Prevent duplicate idempotencyReference postings within the same transaction
  for (const eid of finIndex.ledgerEntryIds) {
    const eSnap = await tx.get<FinancialLedgerEntryRecord>(`transactionLedgerEntries/${eid}`);
    if (eSnap.exists && eSnap.data && eSnap.data.idempotencyReference === idempotencyReference) {
      throw new CoreApiError('CONFLICT', 409, `Duplicate ledger posting for idempotency reference "${idempotencyReference}".`);
    }
  }

  const pair = buildBalancedDoubleEntryPair({
    postingGroupId,
    debitEntryId: `le_dr_${postingGroupId}`,
    creditEntryId: `le_cr_${postingGroupId}`,
    transactionId,
    entryType: input.entryType,
    debitAccount: input.debitAccount,
    creditAccount: input.creditAccount,
    amount: input.amount,
    currency: input.currency,
    financialCategory: input.financialCategory,
    responsiblePartyUid: input.responsiblePartyUid,
    beneficiaryUid: input.beneficiaryUid,
    relatedObligationId: input.relatedObligationId,
    relatedSettlementId: input.relatedSettlementId,
    actorUid,
    createdAtIso: nowIso,
    idempotencyReference,
    metadata: input.note ? { note: input.note } : {},
  });

  tx.set(`transactionLedgerEntries/${pair[0].entryId}`, pair[0]);
  tx.set(`transactionLedgerEntries/${pair[1].entryId}`, pair[1]);
  finIndex.ledgerEntryIds.push(pair[0].entryId, pair[1].entryId);
  finIndex.postingGroupIds.push(postingGroupId);

  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'LEDGER_POSTED',
    actorUid,
    summary: `Balanced double-entry group "${postingGroupId}" (${input.entryType}) posted for ${input.amount} ${input.currency}.`,
    metadata: { postingGroupId, entryType: input.entryType, amount: input.amount },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return { postingGroupId, entries: pair };
}

export async function executeReverseLedgerPostingGroup(params: {
  tx: TransactionContextLike;
  transactionId: string;
  actorUid: string;
  isAdmin: boolean;
  input: ReverseLedgerPostingInput;
  nowIso: string;
}): Promise<{
  reversedPostingGroupId: string;
  reversalPostingGroupId: string;
  replacementPostingGroupId?: string;
  reversalEntries: [FinancialLedgerEntryRecord, FinancialLedgerEntryRecord];
}> {
  const { tx, transactionId, actorUid, isAdmin, input, nowIso } = params;
  const { finIndex } = await loadTransactionAndVerifyFinancialParticipant(tx, transactionId, actorUid, isAdmin);

  const groupEntries: FinancialLedgerEntryRecord[] = [];
  for (const eid of finIndex.ledgerEntryIds) {
    const eSnap = await tx.get<FinancialLedgerEntryRecord>(`transactionLedgerEntries/${eid}`);
    if (eSnap.exists && eSnap.data && eSnap.data.postingGroupId === input.postingGroupId) {
      groupEntries.push(eSnap.data);
    }
  }

  if (groupEntries.length !== 2) {
    throw new CoreApiError('NOT_FOUND', 404, `Ledger posting group "${input.postingGroupId}" was not found.`);
  }

  const origDebit = groupEntries.find((e) => e.direction === 'DEBIT');
  const origCredit = groupEntries.find((e) => e.direction === 'CREDIT');
  if (!origDebit || !origCredit) {
    throw new CoreApiError('CONFLICT', 409, 'Target ledger group is malformed.');
  }
  if (origDebit.status === 'REVERSED' || origCredit.status === 'REVERSED') {
    throw new CoreApiError('CONFLICT', 409, `Ledger posting group "${input.postingGroupId}" has already been reversed.`);
  }

  const reversalPostingGroupId = `lpg_rev_${input.postingGroupId}`;
  const reversalEntries = buildBalancedDoubleEntryPair({
    postingGroupId: reversalPostingGroupId,
    debitEntryId: `le_dr_${reversalPostingGroupId}`,
    creditEntryId: `le_cr_${reversalPostingGroupId}`,
    transactionId,
    entryType: 'REVERSAL_POSTING',
    debitAccount: origCredit.accountType, // Mirror opposite account directions
    creditAccount: origDebit.accountType,
    amount: origDebit.amount,
    currency: origDebit.currency,
    financialCategory: origDebit.financialCategory,
    responsiblePartyUid: origDebit.responsiblePartyUid,
    beneficiaryUid: origDebit.beneficiaryUid,
    relatedObligationId: origDebit.relatedObligationId,
    relatedSettlementId: origDebit.relatedSettlementId,
    actorUid,
    createdAtIso: nowIso,
    idempotencyReference: `rev_${input.postingGroupId}`,
    reversesDebitEntryId: origCredit.entryId,
    reversesCreditEntryId: origDebit.entryId,
    metadata: { reason: input.reason, reversedGroup: input.postingGroupId },
  });

  // Mark original entries as REVERSED (linking to immutable reversal entries without deleting originals)
  tx.set(`transactionLedgerEntries/${origDebit.entryId}`, {
    ...origDebit,
    status: 'REVERSED',
    reversedByEntryId: reversalEntries[1].entryId,
  });
  tx.set(`transactionLedgerEntries/${origCredit.entryId}`, {
    ...origCredit,
    status: 'REVERSED',
    reversedByEntryId: reversalEntries[0].entryId,
  });

  tx.set(`transactionLedgerEntries/${reversalEntries[0].entryId}`, reversalEntries[0]);
  tx.set(`transactionLedgerEntries/${reversalEntries[1].entryId}`, reversalEntries[1]);
  finIndex.ledgerEntryIds.push(reversalEntries[0].entryId, reversalEntries[1].entryId);
  finIndex.postingGroupIds.push(reversalPostingGroupId);

  let replacementPostingGroupId: string | undefined;
  if (input.replacementAmount !== undefined) {
    replacementPostingGroupId = `lpg_repl_${input.postingGroupId}`;
    const replacementPair = buildBalancedDoubleEntryPair({
      postingGroupId: replacementPostingGroupId,
      debitEntryId: `le_dr_${replacementPostingGroupId}`,
      creditEntryId: `le_cr_${replacementPostingGroupId}`,
      transactionId,
      entryType: 'ADJUSTMENT_POSTING',
      debitAccount: origDebit.accountType,
      creditAccount: origCredit.accountType,
      amount: input.replacementAmount,
      currency: origDebit.currency,
      financialCategory: origDebit.financialCategory,
      responsiblePartyUid: origDebit.responsiblePartyUid,
      beneficiaryUid: origDebit.beneficiaryUid,
      relatedObligationId: origDebit.relatedObligationId,
      relatedSettlementId: origDebit.relatedSettlementId,
      actorUid,
      createdAtIso: nowIso,
      idempotencyReference: `repl_${input.postingGroupId}`,
      metadata: { replacesGroup: input.postingGroupId, reason: input.reason },
    });
    tx.set(`transactionLedgerEntries/${replacementPair[0].entryId}`, replacementPair[0]);
    tx.set(`transactionLedgerEntries/${replacementPair[1].entryId}`, replacementPair[1]);
    finIndex.ledgerEntryIds.push(replacementPair[0].entryId, replacementPair[1].entryId);
    finIndex.postingGroupIds.push(replacementPostingGroupId);
  }

  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'LEDGER_REVERSED',
    actorUid,
    summary: `Ledger group "${input.postingGroupId}" reversed via "${reversalPostingGroupId}".`,
    metadata: {
      reversedGroupId: input.postingGroupId,
      reversalGroupId: reversalPostingGroupId,
      ...(replacementPostingGroupId ? { replacementGroupId: replacementPostingGroupId } : {}),
    },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);

  return {
    reversedPostingGroupId: input.postingGroupId,
    reversalPostingGroupId,
    ...(replacementPostingGroupId ? { replacementPostingGroupId } : {}),
    reversalEntries,
  };
}

export async function executeGenerateRentalSchedule(params: {
  tx: TransactionContextLike;
  transactionId: string;
  actorUid: string;
  isAdmin: boolean;
  input: GenerateRentalScheduleInput;
  nowIso: string;
}): Promise<{ schedule: RentalSchedulePlanRecord; obligations: FinancialObligationRecord[] }> {
  const { tx, transactionId, actorUid, isAdmin, input, nowIso } = params;
  const { txDoc, participants, finIndex } = await loadTransactionAndVerifyFinancialParticipant(
    tx,
    transactionId,
    actorUid,
    isAdmin,
  );

  if (txDoc.transactionType !== 'RENTAL') {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Rental schedules can only be generated for RENTAL transactions.');
  }
  assertMatchingCurrency(txDoc.monetary.currency, input.currency, 'generateRentalSchedule');
  assertActiveTransactionPartyUid(participants, input.tenantUid, 'tenantUid');
  assertActiveTransactionPartyUid(participants, input.landlordUid, 'landlordUid');

  // Prevent duplicate schedule generation for the same contractReferenceId
  for (const sid of finIndex.rentalScheduleIds) {
    const sSnap = await tx.get<RentalSchedulePlanRecord>(`transactionRentalSchedules/${sid}`);
    if (sSnap.exists && sSnap.data && sSnap.data.contractReferenceId === input.contractReferenceId) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `A rental schedule already exists for contract reference "${input.contractReferenceId}".`,
      );
    }
  }

  const scheduleId = input.scheduleId ?? `rsc_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const dueDates = generateDeterministicRentalInstallmentDates({
    startDateIso: input.startDateIso,
    frequency: input.frequency,
    customIntervalDays: input.customIntervalDays,
    installmentCount: input.installmentCount,
  });

  const generatedObligations: FinancialObligationRecord[] = [];
  const generatedObligationIds: string[] = [];

  const secDepositObligationId = `obl_dep_${scheduleId}`;
  if (input.securityDepositAmount > 0) {
    const depOb: FinancialObligationRecord = {
      obligationId: secDepositObligationId,
      transactionId,
      category: 'SECURITY_DEPOSIT',
      title: 'Security Deposit (Rahn)',
      amount: input.securityDepositAmount,
      settledAmount: 0,
      refundedAmount: 0,
      currency: input.currency,
      payerUid: input.tenantUid,
      payeeUid: input.landlordUid,
      dueDateIso: input.startDateIso,
      status: 'PENDING',
      contractReferenceId: input.contractReferenceId,
      scheduleId,
      settlementIds: [],
      createdByUid: actorUid,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    tx.set(`transactionObligations/${secDepositObligationId}`, depOb);
    finIndex.obligationIds.push(secDepositObligationId);
    generatedObligations.push(depOb);
    generatedObligationIds.push(secDepositObligationId);

    const depGroup = `lpg_obl_${secDepositObligationId}`;
    const [dr, cr] = buildBalancedDoubleEntryPair({
      postingGroupId: depGroup,
      debitEntryId: `le_dr_${secDepositObligationId}`,
      creditEntryId: `le_cr_${secDepositObligationId}`,
      transactionId,
      entryType: 'OBLIGATION_RECOGNITION',
      debitAccount: 'PARTY_RECEIVABLE',
      creditAccount: 'DEPOSIT_CUSTODY_REF',
      amount: input.securityDepositAmount,
      currency: input.currency,
      financialCategory: 'SECURITY_DEPOSIT',
      responsiblePartyUid: input.tenantUid,
      beneficiaryUid: input.landlordUid,
      relatedObligationId: secDepositObligationId,
      actorUid,
      createdAtIso: nowIso,
      idempotencyReference: `obl_init_${secDepositObligationId}`,
    });
    tx.set(`transactionLedgerEntries/${dr.entryId}`, dr);
    tx.set(`transactionLedgerEntries/${cr.entryId}`, cr);
    finIndex.ledgerEntryIds.push(dr.entryId, cr.entryId);
    finIndex.postingGroupIds.push(depGroup);
  }

  for (let idx = 0; idx < dueDates.length; idx++) {
    const instObligationId = `obl_rent_${scheduleId}_${idx + 1}`;
    const rentOb: FinancialObligationRecord = {
      obligationId: instObligationId,
      transactionId,
      category: 'RENTAL_PAYMENT',
      title: `Rental Installment #${idx + 1}`,
      amount: input.periodicRentAmount,
      settledAmount: 0,
      refundedAmount: 0,
      currency: input.currency,
      payerUid: input.tenantUid,
      payeeUid: input.landlordUid,
      dueDateIso: dueDates[idx],
      status: 'PENDING',
      contractReferenceId: input.contractReferenceId,
      scheduleId,
      installmentIndex: idx + 1,
      settlementIds: [],
      createdByUid: actorUid,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    tx.set(`transactionObligations/${instObligationId}`, rentOb);
    finIndex.obligationIds.push(instObligationId);
    generatedObligations.push(rentOb);
    generatedObligationIds.push(instObligationId);

    const rentGroup = `lpg_obl_${instObligationId}`;
    const [dr, cr] = buildBalancedDoubleEntryPair({
      postingGroupId: rentGroup,
      debitEntryId: `le_dr_${instObligationId}`,
      creditEntryId: `le_cr_${instObligationId}`,
      transactionId,
      entryType: 'OBLIGATION_RECOGNITION',
      debitAccount: 'PARTY_RECEIVABLE',
      creditAccount: 'OBLIGATION_CONTROL',
      amount: input.periodicRentAmount,
      currency: input.currency,
      financialCategory: 'RENTAL_PAYMENT',
      responsiblePartyUid: input.tenantUid,
      beneficiaryUid: input.landlordUid,
      relatedObligationId: instObligationId,
      actorUid,
      createdAtIso: nowIso,
      idempotencyReference: `obl_init_${instObligationId}`,
    });
    tx.set(`transactionLedgerEntries/${dr.entryId}`, dr);
    tx.set(`transactionLedgerEntries/${cr.entryId}`, cr);
    finIndex.ledgerEntryIds.push(dr.entryId, cr.entryId);
    finIndex.postingGroupIds.push(rentGroup);
  }

  const schedule: RentalSchedulePlanRecord = {
    scheduleId,
    transactionId,
    contractReferenceId: input.contractReferenceId,
    tenantUid: input.tenantUid,
    landlordUid: input.landlordUid,
    currency: input.currency,
    securityDepositAmount: input.securityDepositAmount,
    securityDepositObligationId: secDepositObligationId,
    securityDepositRefundableBalance: 0,
    periodicRentAmount: input.periodicRentAmount,
    frequency: input.frequency,
    ...(input.customIntervalDays ? { customIntervalDays: input.customIntervalDays } : {}),
    installmentCount: input.installmentCount,
    startDateIso: input.startDateIso,
    generatedObligationIds,
    createdByUid: actorUid,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`transactionRentalSchedules/${scheduleId}`, schedule);
  finIndex.rentalScheduleIds.push(scheduleId);

  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'RENTAL_SCHEDULE_GENERATED',
    actorUid,
    summary: `Rental schedule "${scheduleId}" generated with ${input.installmentCount} installments.`,
    metadata: { scheduleId, installmentCount: input.installmentCount, frequency: input.frequency },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return { schedule, obligations: generatedObligations };
}

export async function executeCreateCommission(params: {
  tx: TransactionContextLike;
  transactionId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateCommissionInput;
  nowIso: string;
}): Promise<{ commission: CommissionAgreementRecord; obligation: FinancialObligationRecord }> {
  const { tx, transactionId, actorUid, isAdmin, input, nowIso } = params;
  const { txDoc, participants, finIndex } = await loadTransactionAndVerifyFinancialParticipant(
    tx,
    transactionId,
    actorUid,
    isAdmin,
  );

  assertMatchingCurrency(txDoc.monetary.currency, input.currency, 'createCommission');
  const brokerPart = assertActiveTransactionPartyUid(participants, input.brokerUid, 'brokerUid');
  if (brokerPart.role !== 'BROKER' && !isAdmin) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Commission beneficiary must hold the BROKER role.');
  }
  assertActiveTransactionPartyUid(participants, input.payerUid, 'payerUid');

  const calculatedAmount = computeCommissionAmount({
    calculationMode: input.calculationMode,
    baseTransactionAmount: input.baseTransactionAmount,
    basisPoints: input.basisPoints,
    fixedAmount: input.fixedAmount,
  });

  const commissionId = input.commissionId ?? `com_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const obligationId = `obl_${commissionId}`;

  const obligation: FinancialObligationRecord = {
    obligationId,
    transactionId,
    category: 'BROKER_COMMISSION',
    title: `Broker Commission (${input.calculationMode})`,
    amount: calculatedAmount,
    settledAmount: 0,
    refundedAmount: 0,
    currency: input.currency,
    payerUid: input.payerUid,
    payeeUid: input.brokerUid,
    dueDateIso: input.dueDateIso,
    status: 'PENDING',
    contractReferenceId: input.contractReferenceId,
    commissionAgreementId: commissionId,
    settlementIds: [],
    createdByUid: actorUid,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const commission: CommissionAgreementRecord = {
    commissionId,
    transactionId,
    obligationId,
    brokerUid: input.brokerUid,
    payerUid: input.payerUid,
    calculationMode: input.calculationMode,
    baseTransactionAmount: input.baseTransactionAmount,
    ...(input.basisPoints !== undefined ? { basisPoints: input.basisPoints } : {}),
    ...(input.fixedAmount !== undefined ? { fixedAmount: input.fixedAmount } : {}),
    calculatedCommissionAmount: calculatedAmount,
    currency: input.currency,
    contractReferenceId: input.contractReferenceId,
    status: 'PENDING',
    createdByUid: actorUid,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const groupId = `lpg_com_${commissionId}`;
  const [dr, cr] = buildBalancedDoubleEntryPair({
    postingGroupId: groupId,
    debitEntryId: `le_dr_${commissionId}`,
    creditEntryId: `le_cr_${commissionId}`,
    transactionId,
    entryType: 'COMMISSION_RECOGNITION',
    debitAccount: 'PARTY_RECEIVABLE',
    creditAccount: 'COMMISSION_PAYABLE',
    amount: calculatedAmount,
    currency: input.currency,
    financialCategory: 'BROKER_COMMISSION',
    responsiblePartyUid: input.payerUid,
    beneficiaryUid: input.brokerUid,
    relatedObligationId: obligationId,
    actorUid,
    createdAtIso: nowIso,
    idempotencyReference: `com_init_${commissionId}`,
  });

  tx.set(`transactionObligations/${obligationId}`, obligation);
  tx.set(`transactionCommissions/${commissionId}`, commission);
  tx.set(`transactionLedgerEntries/${dr.entryId}`, dr);
  tx.set(`transactionLedgerEntries/${cr.entryId}`, cr);

  finIndex.obligationIds.push(obligationId);
  finIndex.commissionIds.push(commissionId);
  finIndex.ledgerEntryIds.push(dr.entryId, cr.entryId);
  finIndex.postingGroupIds.push(groupId);

  appendFinancialHistoryEvent(tx, finIndex, {
    eventType: 'COMMISSION_RECORDED',
    actorUid,
    summary: `Commission "${commissionId}" recorded for ${calculatedAmount} ${input.currency}.`,
    metadata: { commissionId, obligationId, amount: calculatedAmount },
    nowIso,
  });
  saveFinancialIndex(tx, finIndex);
  return { commission, obligation };
}
