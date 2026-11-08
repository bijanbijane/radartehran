import { TransactionContextLike, CoreApiError } from '../core';
import {
  BrokerageAgreementRecord,
  BrokerageCommissionRecord,
  BrokerageReferralRecord,
} from './types';
import {
  CreateBrokerageAgreementInput,
  AmendBrokerageAgreementInput,
  CalculateAndAllocateCommissionInput,
  CreateReferralInput,
  UpdateReferralStatusInput,
} from './validationCommercialAndViewing';
import {
  getDocData,
  assertBrokerageMemberAccess,
  assertBrokerageAdminAccess,
} from './organizationAgentMembershipAndTeamOps';
import {
  executeCreateCommission,
  executeReverseLedgerPostingGroup,
  safeAddMonetary,
} from '../transactions';

export async function executeCreateBrokerageAgreement(
  tx: TransactionContextLike,
  input: CreateBrokerageAgreementInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<BrokerageAgreementRecord> {
  const { index, isAdminOrManager } = await assertBrokerageMemberAccess(
    tx,
    input.brokerageId,
    actorUid,
    isPlatformAdmin,
  );

  if (!isAdminOrManager && input.agentUid !== actorUid) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Agents can only create agreements for themselves unless authorized as admin/manager.',
    );
  }

  const requestedStatus = input.status ?? 'DRAFT';
  if (
    requestedStatus === 'EXECUTED' &&
    (!input.executionDocumentIds || input.executionDocumentIds.length === 0)
  ) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Cannot mark a brokerage agreement as EXECUTED without verified executionDocumentIds.',
    );
  }

  const agreementId = idGen('agr');
  const agreement: BrokerageAgreementRecord = {
    agreementId,
    brokerageId: input.brokerageId,
    clientId: input.clientId,
    agentUid: input.agentUid,
    propertyId: input.propertyId,
    transactionId: input.transactionId,
    agreementType: input.agreementType,
    effectiveDateIso: input.effectiveDateIso,
    expirationDateIso: input.expirationDateIso,
    serviceScope: input.serviceScope,
    commissionStructure: input.commissionStructure,
    commissionRateBasisPoints: input.commissionRateBasisPoints,
    fixedCommissionAmount: input.fixedCommissionAmount,
    currency: input.currency,
    status: requestedStatus,
    contractDocumentIds: input.contractDocumentIds ?? [],
    executionDocumentIds: input.executionDocumentIds ?? [],
    versionNumber: 1,
    amendments: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageAgreements/${agreementId}`, agreement);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    agreementIds: [...index.agreementIds, agreementId],
    updatedAtIso: nowIso,
  });

  return agreement;
}

export async function executeAmendBrokerageAgreement(
  tx: TransactionContextLike,
  input: AmendBrokerageAgreementInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<BrokerageAgreementRecord> {
  const agreement = await getDocData<BrokerageAgreementRecord>(
    tx,
    `brokerageAgreements/${input.agreementId}`,
  );
  if (!agreement) {
    throw new CoreApiError('NOT_FOUND', 404, `Brokerage agreement '${input.agreementId}' not found.`);
  }

  await assertBrokerageAdminAccess(tx, agreement.brokerageId, actorUid, isPlatformAdmin);

  const nextExecutionDocs = input.executionDocumentIds ?? agreement.executionDocumentIds;
  const nextStatus = input.status ?? 'AMENDED';
  if (nextStatus === 'EXECUTED' && nextExecutionDocs.length === 0) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Cannot mark a brokerage agreement as EXECUTED without verified executionDocumentIds.',
    );
  }

  const updated: BrokerageAgreementRecord = {
    ...agreement,
    serviceScope: input.serviceScope ?? agreement.serviceScope,
    commissionRateBasisPoints: input.commissionRateBasisPoints ?? agreement.commissionRateBasisPoints,
    fixedCommissionAmount: input.fixedCommissionAmount ?? agreement.fixedCommissionAmount,
    executionDocumentIds: nextExecutionDocs,
    status: nextStatus,
    versionNumber: agreement.versionNumber + 1,
    amendments: [
      ...agreement.amendments,
      {
        versionNumber: agreement.versionNumber,
        previousServiceScope: agreement.serviceScope,
        previousCommissionRateBasisPoints: agreement.commissionRateBasisPoints,
        previousFixedCommissionAmount: agreement.fixedCommissionAmount,
        reason: input.reason,
        actorUid,
        amendedAtIso: nowIso,
      },
    ],
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageAgreements/${agreement.agreementId}`, updated);
  return updated;
}

export async function executeCalculateAndAllocateCommission(
  tx: TransactionContextLike,
  input: CalculateAndAllocateCommissionInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<BrokerageCommissionRecord> {
  const { brokerage, index } = await assertBrokerageAdminAccess(
    tx,
    input.brokerageId,
    actorUid,
    isPlatformAdmin,
  );

  const agreement = await getDocData<BrokerageAgreementRecord>(
    tx,
    `brokerageAgreements/${input.agreementId}`,
  );
  if (!agreement || agreement.brokerageId !== input.brokerageId) {
    throw new CoreApiError(
      'NOT_FOUND',
      404,
      `Brokerage agreement '${input.agreementId}' not found in brokerage '${input.brokerageId}'.`,
    );
  }

  if (
    agreement.status !== 'APPROVED' &&
    agreement.status !== 'EXECUTED' &&
    agreement.status !== 'AMENDED'
  ) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Cannot calculate commission from agreement in status '${agreement.status}'.`,
    );
  }

  for (const cId of index.commissionIds) {
    const existingComm = await getDocData<BrokerageCommissionRecord>(
      tx,
      `brokerageCommissions/${cId}`,
    );
    if (
      existingComm &&
      existingComm.transactionId === input.transactionId &&
      existingComm.agreementId === input.agreementId &&
      existingComm.status !== 'REVERSED'
    ) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `An active commission record already exists for transaction '${input.transactionId}' and agreement '${input.agreementId}'.`,
      );
    }
  }

  let totalCommissionAmount = 0;
  if (agreement.commissionStructure === 'FIXED_AMOUNT') {
    if (!agreement.fixedCommissionAmount) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Agreement specifies FIXED_AMOUNT but fixedCommissionAmount is missing.',
      );
    }
    totalCommissionAmount = agreement.fixedCommissionAmount;
  } else {
    if (!agreement.commissionRateBasisPoints) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Agreement requires commissionRateBasisPoints to calculate commission from contractualBaseAmount.',
      );
    }
    totalCommissionAmount = Number(
      (BigInt(input.contractualBaseAmount) * BigInt(agreement.commissionRateBasisPoints)) / 10000n,
    );
  }

  if (totalCommissionAmount <= 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Calculated commission amount must be positive.');
  }

  let allocatedSum = 0;
  for (const share of input.allocations) {
    if (!Number.isSafeInteger(share.allocatedAmount) || share.allocatedAmount < 0) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Each commission allocation share must be a non-negative integer.',
      );
    }
    allocatedSum = safeAddMonetary(allocatedSum, share.allocatedAmount);
  }

  if (allocatedSum > totalCommissionAmount) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Total allocated commission (${allocatedSum}) exceeds authorized distributable amount (${totalCommissionAmount}).`,
    );
  }

  const brokerageCommissionId = idGen('bcom');

  const ledgerResult = await executeCreateCommission({
    tx,
    transactionId: input.transactionId,
    actorUid,
    isAdmin: true,
    input: {
      commissionId: `com_${brokerageCommissionId}`,
      brokerUid: brokerage.ownerUid,
      payerUid: input.payerUid,
      calculationMode: agreement.commissionStructure === 'FIXED_AMOUNT' ? 'FIXED_AMOUNT' : 'BASIS_POINTS',
      baseTransactionAmount: input.contractualBaseAmount,
      basisPoints: agreement.commissionRateBasisPoints,
      fixedAmount: agreement.fixedCommissionAmount,
      currency: agreement.currency,
      dueDateIso: input.dueDateIso,
      contractReferenceId: agreement.agreementId,
    },
    nowIso,
  });

  const commissionRecord: BrokerageCommissionRecord = {
    brokerageCommissionId,
    brokerageId: input.brokerageId,
    transactionId: input.transactionId,
    agreementId: input.agreementId,
    payerUid: input.payerUid,
    currency: agreement.currency,
    structureType: agreement.commissionStructure,
    contractualBaseAmount: input.contractualBaseAmount,
    totalCommissionAmount,
    allocations: input.allocations,
    ledgerCommissionId: ledgerResult.commission.commissionId,
    ledgerObligationId: ledgerResult.obligation.obligationId,
    ledgerPostingGroupId: `lpg_com_${ledgerResult.commission.commissionId}`,
    status: 'POSTED_TO_LEDGER',
    adjustments: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageCommissions/${brokerageCommissionId}`, commissionRecord);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    commissionIds: [...index.commissionIds, brokerageCommissionId],
    updatedAtIso: nowIso,
  });

  return commissionRecord;
}

export async function executeReverseBrokerageCommission(
  tx: TransactionContextLike,
  brokerageCommissionId: string,
  reason: string,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<BrokerageCommissionRecord> {
  const comm = await getDocData<BrokerageCommissionRecord>(
    tx,
    `brokerageCommissions/${brokerageCommissionId}`,
  );
  if (!comm) {
    throw new CoreApiError(
      'NOT_FOUND',
      404,
      `Brokerage commission '${brokerageCommissionId}' not found.`,
    );
  }

  await assertBrokerageAdminAccess(tx, comm.brokerageId, actorUid, isPlatformAdmin);

  if (comm.status === 'REVERSED') {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Brokerage commission '${brokerageCommissionId}' is already reversed.`,
    );
  }

  if (comm.ledgerPostingGroupId) {
    await executeReverseLedgerPostingGroup({
      tx,
      transactionId: comm.transactionId,
      actorUid,
      isAdmin: true,
      input: {
        postingGroupId: comm.ledgerPostingGroupId,
        reason,
      },
      nowIso,
    });
  }

  const updated: BrokerageCommissionRecord = {
    ...comm,
    status: 'REVERSED',
    adjustments: [
      ...comm.adjustments,
      {
        previousTotalAmount: comm.totalCommissionAmount,
        newTotalAmount: 0,
        reason,
        authorizedByUid: actorUid,
        timestampIso: nowIso,
      },
    ],
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageCommissions/${comm.brokerageCommissionId}`, updated);
  return updated;
}

export async function executeCreateReferral(
  tx: TransactionContextLike,
  input: CreateReferralInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<BrokerageReferralRecord> {
  const { index } = await assertBrokerageMemberAccess(
    tx,
    input.referringBrokerageId,
    actorUid,
    isPlatformAdmin,
  );

  const referralId = idGen('ref');
  const referral: BrokerageReferralRecord = {
    referralId,
    referringBrokerageId: input.referringBrokerageId,
    receivingBrokerageId: input.receivingBrokerageId,
    referringAgentUid: input.referringAgentUid,
    receivingAgentUid: input.receivingAgentUid,
    leadId: input.leadId,
    clientId: input.clientId,
    referralTermsSummary: input.referralTermsSummary,
    referralBasisPoints: input.referralBasisPoints,
    fixedReferralAmount: input.fixedReferralAmount,
    currency: input.currency,
    status: 'CREATED',
    expiresAtIso: input.expiresAtIso,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageReferrals/${referralId}`, referral);
  tx.set(`brokerageIndexes/${input.referringBrokerageId}`, {
    ...index,
    referralIds: [...index.referralIds, referralId],
    updatedAtIso: nowIso,
  });

  return referral;
}

export async function executeUpdateReferralStatus(
  tx: TransactionContextLike,
  input: UpdateReferralStatusInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<BrokerageReferralRecord> {
  const referral = await getDocData<BrokerageReferralRecord>(
    tx,
    `brokerageReferrals/${input.referralId}`,
  );
  if (!referral) {
    throw new CoreApiError('NOT_FOUND', 404, `Referral '${input.referralId}' not found.`);
  }

  if (
    !isPlatformAdmin &&
    actorUid !== referral.receivingAgentUid &&
    actorUid !== referral.referringAgentUid
  ) {
    await assertBrokerageAdminAccess(tx, referral.receivingBrokerageId, actorUid, isPlatformAdmin);
  }

  const updated: BrokerageReferralRecord = {
    ...referral,
    status: input.status,
    convertedTransactionId: input.convertedTransactionId ?? referral.convertedTransactionId,
    brokerageCommissionId: input.brokerageCommissionId ?? referral.brokerageCommissionId,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageReferrals/${referral.referralId}`, updated);
  return updated;
}
