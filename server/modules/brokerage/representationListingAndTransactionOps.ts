import { TransactionContextLike, CoreApiError } from '../core';
import {
  PropertyRepresentationRecord,
  ListingAcquisitionRecord,
  BrokerageTransactionParticipationRecord,
} from './types';
import {
  CreatePropertyRepresentationInput,
  CreateListingAcquisitionInput,
  UpdateListingAcquisitionInput,
  RegisterTransactionParticipationInput,
  ReplaceTransactionAgentInput,
} from './validationCommercialAndViewing';
import {
  getDocData,
  assertBrokerageMemberAccess,
  assertBrokerageAdminAccess,
} from './organizationAgentMembershipAndTeamOps';
import { StoredTransactionDocument } from '../transactions';

export async function executeCreatePropertyRepresentation(
  tx: TransactionContextLike,
  input: CreatePropertyRepresentationInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<PropertyRepresentationRecord> {
  const { index, isAdminOrManager } = await assertBrokerageMemberAccess(
    tx,
    input.brokerageId,
    actorUid,
    isPlatformAdmin,
  );

  if (!isAdminOrManager && input.responsibleAgentUid !== actorUid) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Agents can only register property representation for themselves unless authorized as admin/manager.',
    );
  }

  if (input.propertyId) {
    const prop = await getDocData<Record<string, unknown>>(tx, `properties/${input.propertyId}`);
    if (
      prop &&
      (input.representationType === 'SELLER_REPRESENTATION' ||
        input.representationType === 'LANDLORD_REPRESENTATION') &&
      typeof prop.ownerUid === 'string' &&
      prop.ownerUid !== input.principalUserUid
    ) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'principalUserUid does not match the verified property owner for seller/landlord representation.',
      );
    }

    for (const rId of index.representationIds) {
      const existingRep = await getDocData<PropertyRepresentationRecord>(
        tx,
        `brokerageRepresentations/${rId}`,
      );
      if (
        existingRep &&
        existingRep.propertyId === input.propertyId &&
        existingRep.representationType === input.representationType &&
        existingRep.status === 'ACTIVE' &&
        (existingRep.exclusivity === 'EXCLUSIVE' || input.exclusivity === 'EXCLUSIVE')
      ) {
        throw new CoreApiError(
          'CONFLICT',
          409,
          `An active exclusive representation already exists for property '${input.propertyId}' and type '${input.representationType}'.`,
        );
      }
    }
  }

  const representationId = idGen('rep');
  const representation: PropertyRepresentationRecord = {
    representationId,
    brokerageId: input.brokerageId,
    responsibleAgentUid: input.responsibleAgentUid,
    representationType: input.representationType,
    exclusivity: input.exclusivity,
    propertyId: input.propertyId,
    listingId: input.listingId,
    clientId: input.clientId,
    principalUserUid: input.principalUserUid,
    contractReferenceId: input.contractReferenceId,
    startDateIso: input.startDateIso,
    expirationDateIso: input.expirationDateIso,
    status: 'ACTIVE',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageRepresentations/${representationId}`, representation);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    representationIds: [...index.representationIds, representationId],
    updatedAtIso: nowIso,
  });

  return representation;
}

export async function executeCreateListingAcquisition(
  tx: TransactionContextLike,
  input: CreateListingAcquisitionInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<ListingAcquisitionRecord> {
  const { index, isAdminOrManager } = await assertBrokerageMemberAccess(
    tx,
    input.brokerageId,
    actorUid,
    isPlatformAdmin,
  );

  const rep = await getDocData<PropertyRepresentationRecord>(
    tx,
    `brokerageRepresentations/${input.representationId}`,
  );
  if (!rep || rep.brokerageId !== input.brokerageId || rep.status !== 'ACTIVE') {
    throw new CoreApiError(
      'CONFLICT',
      409,
      'Listing acquisition requires an active property representation in the same brokerage.',
    );
  }

  if (
    rep.representationType !== 'SELLER_REPRESENTATION' &&
    rep.representationType !== 'LANDLORD_REPRESENTATION'
  ) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Listing acquisition requires SELLER_REPRESENTATION or LANDLORD_REPRESENTATION.',
    );
  }

  if (!isAdminOrManager && input.assignedAgentUid !== actorUid) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Agents can only create listing acquisitions assigned to themselves unless authorized as admin/manager.',
    );
  }

  const acquisitionId = idGen('acq');
  const acquisition: ListingAcquisitionRecord = {
    acquisitionId,
    brokerageId: input.brokerageId,
    propertyId: input.propertyId,
    listingId: input.listingId,
    representationId: input.representationId,
    assignedAgentUid: input.assignedAgentUid,
    ownerAuthorizationReferenceId: input.ownerAuthorizationReferenceId,
    documentationIds: input.documentationIds ?? [],
    status: 'PENDING_APPROVAL',
    expirationDateIso: input.expirationDateIso,
    history: [
      {
        status: 'PENDING_APPROVAL',
        assignedAgentUid: input.assignedAgentUid,
        actorUid,
        timestampIso: nowIso,
      },
    ],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageListingAcquisitions/${acquisitionId}`, acquisition);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    acquisitionIds: [...index.acquisitionIds, acquisitionId],
    updatedAtIso: nowIso,
  });

  return acquisition;
}

export async function executeUpdateListingAcquisition(
  tx: TransactionContextLike,
  input: UpdateListingAcquisitionInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<ListingAcquisitionRecord> {
  const acquisition = await getDocData<ListingAcquisitionRecord>(
    tx,
    `brokerageListingAcquisitions/${input.acquisitionId}`,
  );
  if (!acquisition) {
    throw new CoreApiError('NOT_FOUND', 404, `Listing acquisition '${input.acquisitionId}' not found.`);
  }

  const { isAdminOrManager } = await assertBrokerageMemberAccess(
    tx,
    acquisition.brokerageId,
    actorUid,
    isPlatformAdmin,
  );

  if (
    !isAdminOrManager &&
    (input.status === 'APPROVED' ||
      input.status === 'ACTIVE' ||
      (input.assignedAgentUid && input.assignedAgentUid !== acquisition.assignedAgentUid))
  ) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Only brokerage administrators or managers can approve, activate, or transfer a listing acquisition.',
    );
  }

  const nextStatus = input.status ?? acquisition.status;
  const nextAgentUid = input.assignedAgentUid ?? acquisition.assignedAgentUid;

  const updated: ListingAcquisitionRecord = {
    ...acquisition,
    status: nextStatus,
    assignedAgentUid: nextAgentUid,
    approvedByUid:
      nextStatus === 'APPROVED' || nextStatus === 'ACTIVE'
        ? actorUid
        : acquisition.approvedByUid,
    history: [
      ...acquisition.history,
      {
        status: nextStatus,
        assignedAgentUid: nextAgentUid,
        actorUid,
        note: input.note,
        timestampIso: nowIso,
      },
    ],
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageListingAcquisitions/${acquisition.acquisitionId}`, updated);
  return updated;
}

export async function executeRegisterTransactionParticipation(
  tx: TransactionContextLike,
  input: RegisterTransactionParticipationInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<BrokerageTransactionParticipationRecord> {
  const { index, isAdminOrManager } = await assertBrokerageMemberAccess(
    tx,
    input.brokerageId,
    actorUid,
    isPlatformAdmin,
  );

  if (!isAdminOrManager && input.assignedAgentUid !== actorUid) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Agents cannot assign other agents to transactions without brokerage admin authorization.',
    );
  }

  const txDoc = await getDocData<StoredTransactionDocument>(tx, `transactions/${input.transactionId}`);
  if (!txDoc) {
    throw new CoreApiError('NOT_FOUND', 404, `Transaction '${input.transactionId}' not found.`);
  }

  if (txDoc.status === 'COMPLETED' || txDoc.status === 'CANCELLED' || txDoc.status === 'EXPIRED') {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Cannot register brokerage participation on transaction in terminal status '${txDoc.status}'.`,
    );
  }

  const participationId = idGen('txp');
  const participation: BrokerageTransactionParticipationRecord = {
    participationId,
    brokerageId: input.brokerageId,
    transactionId: input.transactionId,
    representationId: input.representationId,
    side: input.side,
    assignedAgentUid: input.assignedAgentUid,
    teamId: input.teamId,
    status: 'ACTIVE',
    history: [
      {
        action: 'REGISTERED',
        agentUid: input.assignedAgentUid,
        actorUid,
        timestampIso: nowIso,
      },
    ],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  if (!txDoc.activeParticipantUids.includes(input.assignedAgentUid)) {
    tx.set(`transactions/${input.transactionId}`, {
      ...txDoc,
      activeParticipantUids: [...txDoc.activeParticipantUids, input.assignedAgentUid],
      updatedAtIso: nowIso,
    });
  }

  tx.set(`brokerageTransactionParticipations/${participationId}`, participation);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    participationIds: [...index.participationIds, participationId],
    updatedAtIso: nowIso,
  });

  return participation;
}

export async function executeReplaceTransactionAgent(
  tx: TransactionContextLike,
  input: ReplaceTransactionAgentInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<BrokerageTransactionParticipationRecord> {
  const participation = await getDocData<BrokerageTransactionParticipationRecord>(
    tx,
    `brokerageTransactionParticipations/${input.participationId}`,
  );
  if (!participation) {
    throw new CoreApiError(
      'NOT_FOUND',
      404,
      `Transaction participation '${input.participationId}' not found.`,
    );
  }

  const { brokerage } = await assertBrokerageAdminAccess(
    tx,
    participation.brokerageId,
    actorUid,
    isPlatformAdmin,
  );

  if (!brokerage.activeAgentUids.includes(input.newAgentUid)) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Replacement agent '${input.newAgentUid}' is not an active member of brokerage '${brokerage.brokerageId}'.`,
    );
  }

  const updated: BrokerageTransactionParticipationRecord = {
    ...participation,
    assignedAgentUid: input.newAgentUid,
    history: [
      ...participation.history,
      {
        action: `REPLACED_AGENT:${input.reason}`,
        agentUid: input.newAgentUid,
        actorUid,
        timestampIso: nowIso,
      },
    ],
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageTransactionParticipations/${participation.participationId}`, updated);
  return updated;
}
