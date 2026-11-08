import { randomUUID } from 'node:crypto';
import { CoreApiError, type TransactionContextLike } from '../core';
import {
  executeCreateAndConfirmRefund,
  executeCreateObligation,
  executePostLedgerPair,
  safeAddMonetary,
  safeSubtractMonetary,
  type FinancialObligationRecord,
} from '../transactions';
import {
  appendTenancyHistoryEvent,
  assertLandlordOrManagerAccess,
  loadOrInitPropertyTenancyIndex,
  savePropertyTenancyIndex,
} from './propertyApplicationAndLeaseOps';
import type {
  LeaseAgreementRecord,
  LeaseAmendmentRecord,
  LeaseRenewalProposalRecord,
  RentalPropertyConfigRecord,
  RentAdjustmentRecord,
  TenancyDepositRecord,
} from './types';
import type {
  CreateLeaseAmendmentInput,
  DepositOperationInput,
  ProposeRenewalInput,
  ProposeRentAdjustmentInput,
  RespondRenewalInput,
} from './validation';

export async function executeDepositOperation(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  actorUid: string;
  isAdmin: boolean;
  input: DepositOperationInput;
  nowIso: string;
}): Promise<TenancyDepositRecord> {
  const { tx, propertyId, leaseId, actorUid, isAdmin, input, nowIso } = params;
  const propSnap = await tx.get<RentalPropertyConfigRecord>(`tenancyProperties/${propertyId}`);
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  if (!propSnap.exists || !propSnap.data || !leaseSnap.exists || !leaseSnap.data || leaseSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Lease "${leaseId}" was not found.`);
  }
  const prop = propSnap.data;
  const lease = leaseSnap.data;
  if (!lease.depositRecordId) {
    throw new CoreApiError('NOT_FOUND', 404, `Deposit record for lease "${leaseId}" has not been initialized.`);
  }
  const depSnap = await tx.get<TenancyDepositRecord>(`tenancyDeposits/${lease.depositRecordId}`);
  if (!depSnap.exists || !depSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Deposit record "${lease.depositRecordId}" was not found.`);
  }
  const dep = depSnap.data;
  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);

  const obSnap = await tx.get<FinancialObligationRecord>(`transactionObligations/${dep.depositObligationId}`);
  const confirmedDepositAmount = obSnap.exists && obSnap.data ? obSnap.data.settledAmount : dep.confirmedDepositAmount;

  if (input.operation === 'SYNC_FROM_LEDGER') {
    const netAvailable = safeSubtractMonetary(
      confirmedDepositAmount,
      safeAddMonetary(dep.deductedAmount, dep.refundedAmount),
      'deposit.sync',
    );
    const synced: TenancyDepositRecord = {
      ...dep,
      confirmedDepositAmount,
      refundableBalance: netAvailable,
      status:
        confirmedDepositAmount === 0
          ? 'AWAITING_PAYMENT'
          : dep.deductedAmount > 0
            ? 'PARTIALLY_DEDUCTED'
            : 'HELD_CONFIRMED',
      updatedAtIso: nowIso,
    };
    tx.set(`tenancyDeposits/${dep.depositId}`, synced);
    savePropertyTenancyIndex(tx, pIndex);
    return synced;
  }

  if (input.operation === 'RECORD_DEDUCTION') {
    assertLandlordOrManagerAccess(prop, actorUid, isAdmin);
    if (!input.deductionAmount || !input.deductionReason || !input.authorizationReference) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'deductionAmount, deductionReason, and authorizationReference are required for deposit deductions.',
      );
    }

    const currentRefundable = safeSubtractMonetary(
      confirmedDepositAmount,
      safeAddMonetary(dep.deductedAmount, dep.refundedAmount),
      'deposit.currentRefundable',
    );
    if (input.deductionAmount > currentRefundable) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Deduction amount (${input.deductionAmount}) exceeds available confirmed deposit balance (${currentRefundable}).`,
      );
    }

    const deductionId = `ded_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    // Post balanced double-entry deduction in Employee 54 financial ledger
    await executePostLedgerPair({
      tx,
      transactionId: lease.transactionId,
      actorUid,
      isAdmin: true,
      input: {
        postingGroupId: `lpg_dep_ded_${deductionId}`,
        entryType: 'ADJUSTMENT_POSTING',
        debitAccount: 'DEPOSIT_CUSTODY_REF',
        creditAccount: 'PARTY_PAYABLE',
        amount: input.deductionAmount,
        currency: dep.currency,
        financialCategory: 'SECURITY_DEPOSIT',
        responsiblePartyUid: dep.tenantUid,
        beneficiaryUid: dep.landlordUid,
        relatedObligationId: dep.depositObligationId,
        note: `Authorized deposit deduction (${input.authorizationReference}): ${input.deductionReason}`,
      },
      idempotencyReference: `dep_ded_${deductionId}`,
      nowIso,
    });

    const nextDeducted = safeAddMonetary(dep.deductedAmount, input.deductionAmount, 'deposit.deductedAmount');
    const nextRefundable = safeSubtractMonetary(
      confirmedDepositAmount,
      safeAddMonetary(nextDeducted, dep.refundedAmount),
      'deposit.nextRefundable',
    );

    const updated: TenancyDepositRecord = {
      ...dep,
      confirmedDepositAmount,
      deductedAmount: nextDeducted,
      refundableBalance: nextRefundable,
      status: 'PARTIALLY_DEDUCTED',
      deductions: [
        ...dep.deductions,
        {
          deductionId,
          amount: input.deductionAmount,
          reason: input.deductionReason,
          authorizationReference: input.authorizationReference,
          ...(input.inspectionReferenceId ? { inspectionReferenceId: input.inspectionReferenceId } : {}),
          recordedByUid: actorUid,
          recordedAtIso: nowIso,
        },
      ],
      updatedAtIso: nowIso,
    };

    tx.set(`tenancyDeposits/${dep.depositId}`, updated);
    appendTenancyHistoryEvent(tx, pIndex, {
      leaseId,
      eventType: 'DEPOSIT_DEDUCTION_RECORDED',
      actorUid,
      summary: `Authorized deposit deduction "${deductionId}" (${input.deductionAmount} ${dep.currency}) recorded.`,
      metadata: { deductionId, amount: input.deductionAmount },
      nowIso,
    });
    savePropertyTenancyIndex(tx, pIndex);
    return updated;
  }

  // input.operation === 'INITIATE_REFUND'
  assertLandlordOrManagerAccess(prop, actorUid, isAdmin);
  if (!input.refundSettlementId) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'refundSettlementId is required to initiate a deposit refund.');
  }
  const currentRefundable = safeSubtractMonetary(
    confirmedDepositAmount,
    safeAddMonetary(dep.deductedAmount, dep.refundedAmount),
    'deposit.refundableForInit',
  );
  const refundAmt = input.refundAmount ?? currentRefundable;
  if (refundAmt <= 0 || refundAmt > currentRefundable) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Refund amount (${refundAmt}) exceeds refundable deposit balance (${currentRefundable}).`,
    );
  }

  const refundRecord = await executeCreateAndConfirmRefund({
    tx,
    transactionId: lease.transactionId,
    actorUid,
    isAdmin: true,
    input: {
      settlementId: input.refundSettlementId,
      obligationId: dep.depositObligationId,
      amount: refundAmt,
      currency: dep.currency,
      reason: `Security deposit refund for lease ${leaseId}`,
    },
    nowIso,
  });

  const updated: TenancyDepositRecord = {
    ...dep,
    confirmedDepositAmount,
    refundableBalance: currentRefundable,
    refundId: refundRecord.refundId,
    status: 'REFUND_INITIATED',
    updatedAtIso: nowIso,
  };
  tx.set(`tenancyDeposits/${dep.depositId}`, updated);
  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: 'DEPOSIT_REFUND_INITIATED',
    actorUid,
    summary: `Deposit refund "${refundRecord.refundId}" initiated for ${refundAmt} ${dep.currency}.`,
    metadata: { refundId: refundRecord.refundId, amount: refundAmt },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return updated;
}

export async function executeProposeLeaseRenewal(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  actorUid: string;
  isAdmin: boolean;
  input: ProposeRenewalInput;
  nowIso: string;
}): Promise<LeaseRenewalProposalRecord> {
  const { tx, propertyId, leaseId, actorUid, isAdmin, input, nowIso } = params;
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  if (!leaseSnap.exists || !leaseSnap.data || leaseSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Lease "${leaseId}" was not found.`);
  }
  const lease = leaseSnap.data;

  if (lease.status !== 'ACTIVE' && lease.status !== 'EXPIRING') {
    throw new CoreApiError('CONFLICT', 409, `Lease "${leaseId}" in status "${lease.status}" is not eligible for renewal.`);
  }
  if (lease.renewedByLeaseId) {
    throw new CoreApiError('CONFLICT', 409, `Lease "${leaseId}" has already been renewed by "${lease.renewedByLeaseId}".`);
  }
  if (Date.parse(input.newLeaseStartDateIso) < Date.parse(lease.leaseEndDateIso)) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Renewal start date must be on or after the original lease end date to prevent overlapping tenancy.',
    );
  }

  const isLandlord = actorUid === lease.landlordUid || actorUid === lease.propertyManagerUid || isAdmin;
  const isTenant = actorUid === lease.tenantUid;
  if (!isLandlord && !isTenant) {
    throw new CoreApiError('FORBIDDEN', 403, 'Only lease parties can propose a renewal.');
  }

  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  const renewalId = input.renewalId ?? `rnw_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const renewal: LeaseRenewalProposalRecord = {
    renewalId,
    originalLeaseId: leaseId,
    propertyId,
    transactionId: lease.transactionId,
    proposedByUid: actorUid,
    newLeaseStartDateIso: input.newLeaseStartDateIso,
    newLeaseEndDateIso: input.newLeaseEndDateIso,
    proposedPeriodicRentAmount: input.proposedPeriodicRentAmount,
    proposedDepositAmount: input.proposedDepositAmount,
    currency: lease.currency,
    installmentCount: input.installmentCount,
    proposedConditions: input.proposedConditions,
    status: 'PROPOSED',
    ...(isLandlord ? { landlordDecision: 'ACCEPTED' } : { tenantDecision: 'ACCEPTED' }),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`tenancyRenewals/${renewalId}`, renewal);
  pIndex.renewalIds.push(renewalId);
  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: 'RENEWAL_PROPOSED',
    actorUid,
    summary: `Lease renewal "${renewalId}" proposed for lease "${leaseId}".`,
    metadata: { renewalId, proposedPeriodicRentAmount: input.proposedPeriodicRentAmount },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return renewal;
}

export async function executeRespondLeaseRenewal(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  renewalId: string;
  actorUid: string;
  isAdmin: boolean;
  input: RespondRenewalInput;
  nowIso: string;
}): Promise<{ renewal: LeaseRenewalProposalRecord; successorLease?: LeaseAgreementRecord }> {
  const { tx, propertyId, leaseId, renewalId, actorUid, isAdmin, input, nowIso } = params;
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  const rnwSnap = await tx.get<LeaseRenewalProposalRecord>(`tenancyRenewals/${renewalId}`);
  if (!leaseSnap.exists || !leaseSnap.data || !rnwSnap.exists || !rnwSnap.data || rnwSnap.data.originalLeaseId !== leaseId) {
    throw new CoreApiError('NOT_FOUND', 404, `Renewal "${renewalId}" was not found.`);
  }
  const origLease = leaseSnap.data;
  const rnw = rnwSnap.data;
  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);

  const isLandlord = actorUid === origLease.landlordUid || actorUid === origLease.propertyManagerUid || isAdmin;
  const isTenant = actorUid === origLease.tenantUid || isAdmin;
  if (!isLandlord && !isTenant) {
    throw new CoreApiError('FORBIDDEN', 403, 'Not authorized to respond to this renewal proposal.');
  }

  if (input.decision === 'REJECT') {
    const rejected: LeaseRenewalProposalRecord = {
      ...rnw,
      status: 'REJECTED',
      ...(isLandlord ? { landlordDecision: 'REJECTED' } : { tenantDecision: 'REJECTED' }),
      updatedAtIso: nowIso,
    };
    tx.set(`tenancyRenewals/${renewalId}`, rejected);
    savePropertyTenancyIndex(tx, pIndex);
    return { renewal: rejected };
  }

  if (input.decision === 'COUNTER') {
    const countered: LeaseRenewalProposalRecord = {
      ...rnw,
      status: 'COUNTERPROPOSED',
      ...(input.counterPeriodicRentAmount ? { proposedPeriodicRentAmount: input.counterPeriodicRentAmount } : {}),
      ...(input.counterDepositAmount !== undefined ? { proposedDepositAmount: input.counterDepositAmount } : {}),
      landlordDecision: isLandlord ? 'ACCEPTED' : undefined,
      tenantDecision: isTenant ? 'ACCEPTED' : undefined,
      updatedAtIso: nowIso,
    };
    tx.set(`tenancyRenewals/${renewalId}`, countered);
    savePropertyTenancyIndex(tx, pIndex);
    return { renewal: countered };
  }

  // input.decision === 'ACCEPT'
  const landlordDecision = isLandlord ? 'ACCEPTED' : rnw.landlordDecision;
  const tenantDecision = isTenant ? 'ACCEPTED' : rnw.tenantDecision;

  if (landlordDecision === 'ACCEPTED' && tenantDecision === 'ACCEPTED') {
    const successorLeaseId = `lse_rnw_${renewalId}`;
    const successorLease: LeaseAgreementRecord = {
      leaseId: successorLeaseId,
      propertyId,
      transactionId: origLease.transactionId,
      previousLeaseId: origLease.leaseId,
      landlordUid: origLease.landlordUid,
      tenantUid: origLease.tenantUid,
      ...(origLease.propertyManagerUid ? { propertyManagerUid: origLease.propertyManagerUid } : {}),
      ...(origLease.brokerUid ? { brokerUid: origLease.brokerUid } : {}),
      leaseStartDateIso: rnw.newLeaseStartDateIso,
      leaseEndDateIso: rnw.newLeaseEndDateIso,
      periodicRentAmount: rnw.proposedPeriodicRentAmount,
      depositAmount: rnw.proposedDepositAmount,
      currency: origLease.currency,
      paymentFrequency: origLease.paymentFrequency,
      ...(origLease.customIntervalDays ? { customIntervalDays: origLease.customIntervalDays } : {}),
      installmentCount: rnw.installmentCount,
      gracePeriodDays: origLease.gracePeriodDays,
      contractualConditions: rnw.proposedConditions,
      ...(origLease.permittedRentAdjustmentClauseRef
        ? { permittedRentAdjustmentClauseRef: origLease.permittedRentAdjustmentClauseRef }
        : {}),
      contractDocumentId: input.newContractDocumentId ?? `cnt_${successorLeaseId}`,
      status: 'APPROVED',
      approvedByLandlord: true,
      approvedByTenant: true,
      signedByLandlord: true,
      signedByTenant: true,
      amendmentIds: [],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    tx.set(`tenancyLeases/${successorLeaseId}`, successorLease);
    pIndex.leaseIds.push(successorLeaseId);

    // Link original lease to successor without overwriting original lease terms
    tx.set(`tenancyLeases/${origLease.leaseId}`, {
      ...origLease,
      renewedByLeaseId: successorLeaseId,
      updatedAtIso: nowIso,
    });

    const completedRnw: LeaseRenewalProposalRecord = {
      ...rnw,
      status: 'RENEWED_LEASE_CREATED',
      landlordDecision: 'ACCEPTED',
      tenantDecision: 'ACCEPTED',
      successorLeaseId,
      updatedAtIso: nowIso,
    };
    tx.set(`tenancyRenewals/${renewalId}`, completedRnw);

    appendTenancyHistoryEvent(tx, pIndex, {
      leaseId: origLease.leaseId,
      eventType: 'LEASE_RENEWED',
      actorUid,
      summary: `Original lease "${origLease.leaseId}" renewed via successor lease "${successorLeaseId}".`,
      metadata: { originalLeaseId: origLease.leaseId, successorLeaseId },
      nowIso,
    });
    savePropertyTenancyIndex(tx, pIndex);
    return { renewal: completedRnw, successorLease };
  }

  const partialRnw: LeaseRenewalProposalRecord = {
    ...rnw,
    landlordDecision,
    tenantDecision,
    updatedAtIso: nowIso,
  };
  tx.set(`tenancyRenewals/${renewalId}`, partialRnw);
  savePropertyTenancyIndex(tx, pIndex);
  return { renewal: partialRnw };
}

export async function executeProposeAndApproveRentAdjustment(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  actorUid: string;
  isAdmin: boolean;
  input: ProposeRentAdjustmentInput;
  approveImmediately?: boolean;
  nowIso: string;
}): Promise<RentAdjustmentRecord> {
  const { tx, propertyId, leaseId, actorUid, isAdmin, input, approveImmediately = false, nowIso } = params;
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  if (!leaseSnap.exists || !leaseSnap.data || leaseSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Lease "${leaseId}" was not found.`);
  }
  const lease = leaseSnap.data;
  if (!lease.permittedRentAdjustmentClauseRef && !isAdmin) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      'Rent adjustment is not permitted because the lease does not configure a permittedRentAdjustmentClauseRef.',
    );
  }
  if (
    lease.permittedRentAdjustmentClauseRef &&
    lease.permittedRentAdjustmentClauseRef !== input.contractualClauseReference &&
    !isAdmin
  ) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `contractualClauseReference "${input.contractualClauseReference}" does not match configured lease clause "${lease.permittedRentAdjustmentClauseRef}".`,
    );
  }

  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  const adjustmentId = input.adjustmentId ?? `rad_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const record: RentAdjustmentRecord = {
    adjustmentId,
    leaseId,
    transactionId: lease.transactionId,
    contractualClauseReference: input.contractualClauseReference,
    previousRentAmount: lease.periodicRentAmount,
    newRentAmount: input.newRentAmount,
    currency: lease.currency,
    effectiveDateIso: input.effectiveDateIso,
    reason: input.reason,
    proposedByUid: actorUid,
    approvedByLandlord: actorUid === lease.landlordUid || isAdmin,
    approvedByTenant: actorUid === lease.tenantUid || approveImmediately || isAdmin,
    status: approveImmediately || isAdmin ? 'APPLIED' : 'PROPOSED',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  if (record.status === 'APPLIED') {
    await executeCreateObligation({
      tx,
      transactionId: lease.transactionId,
      actorUid,
      isAdmin: true,
      input: {
        obligationId: `obl_adj_${adjustmentId}`,
        category: 'RENTAL_PAYMENT',
        title: `Adjusted Rent Obligation (${input.contractualClauseReference})`,
        amount: input.newRentAmount,
        currency: lease.currency,
        payerUid: lease.tenantUid,
        payeeUid: lease.landlordUid,
        dueDateIso: input.effectiveDateIso,
        contractReferenceId: lease.contractDocumentId,
      },
      nowIso,
    });
  }

  tx.set(`tenancyRentAdjustments/${adjustmentId}`, record);
  pIndex.adjustmentIds.push(adjustmentId);
  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: 'RENT_ADJUSTMENT_RECORDED',
    actorUid,
    summary: `Rent adjustment "${adjustmentId}" (${lease.periodicRentAmount} -> ${input.newRentAmount} ${lease.currency}) recorded.`,
    metadata: { adjustmentId, previousRentAmount: lease.periodicRentAmount, newRentAmount: input.newRentAmount },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return record;
}

export async function executeCreateAndApproveLeaseAmendment(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateLeaseAmendmentInput;
  counterpartyConfirmed?: boolean;
  nowIso: string;
}): Promise<LeaseAmendmentRecord> {
  const { tx, propertyId, leaseId, actorUid, isAdmin, input, counterpartyConfirmed = false, nowIso } = params;
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  if (!leaseSnap.exists || !leaseSnap.data || leaseSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Lease "${leaseId}" was not found.`);
  }
  const lease = leaseSnap.data;
  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  const amendmentId = input.amendmentId ?? `amd_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const isLandlord = actorUid === lease.landlordUid || actorUid === lease.propertyManagerUid || isAdmin;
  const isTenant = actorUid === lease.tenantUid || isAdmin;
  if (!isLandlord && !isTenant) {
    throw new CoreApiError('FORBIDDEN', 403, 'Only lease participants can propose or approve an amendment.');
  }

  const approvedByLandlord = isLandlord || counterpartyConfirmed;
  const approvedByTenant = isTenant || counterpartyConfirmed;
  const status = approvedByLandlord && approvedByTenant ? 'APPROVED' : 'PROPOSED';

  const amendment: LeaseAmendmentRecord = {
    amendmentId,
    leaseId,
    transactionId: lease.transactionId,
    reason: input.reason,
    changedFields: input.changedFields,
    effectiveDateIso: input.effectiveDateIso,
    ...(input.amendmentDocumentId ? { amendmentDocumentId: input.amendmentDocumentId } : {}),
    approvedByLandlord,
    approvedByTenant,
    status,
    createdByUid: actorUid,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`tenancyAmendments/${amendmentId}`, amendment);
  // Reference amendment on lease without overwriting original contractDocumentId or original signed terms
  tx.set(`tenancyLeases/${leaseId}`, {
    ...lease,
    amendmentIds: [...lease.amendmentIds, amendmentId],
    updatedAtIso: nowIso,
  });
  pIndex.amendmentIds.push(amendmentId);
  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: 'LEASE_AMENDMENT_RECORDED',
    actorUid,
    summary: `Lease amendment "${amendmentId}" recorded with status "${status}".`,
    metadata: { amendmentId, status },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return amendment;
}
