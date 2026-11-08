import { TransactionContextLike, CoreApiError } from '../core';
import {
  ClientCommunicationEventRecord,
  PropertyViewingRecord,
  BrokerageLeadRecord,
  LeadFollowUpTaskRecord,
  ListingAcquisitionRecord,
  BrokerageTransactionParticipationRecord,
  BrokerageCommissionRecord,
  BrokerageReferralRecord,
} from './types';
import {
  RecordClientCommunicationInput,
  ScheduleViewingInput,
  UpdateViewingInput,
} from './validationCommercialAndViewing';
import {
  getDocData,
  assertBrokerageMemberAccess,
  assertBrokerageAdminAccess,
} from './organizationAgentMembershipAndTeamOps';
import { executeGetClientWithAccessCheck } from './clientLeadDistributionAndFollowUpOps';
import { safeAddMonetary } from '../transactions';

export async function executeRecordClientCommunication(
  tx: TransactionContextLike,
  input: RecordClientCommunicationInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<ClientCommunicationEventRecord> {
  await executeGetClientWithAccessCheck(tx, input.clientId, actorUid, isPlatformAdmin);
  const { index } = await assertBrokerageMemberAccess(tx, input.brokerageId, actorUid, isPlatformAdmin);

  const communicationId = idGen('com');
  const event: ClientCommunicationEventRecord = {
    communicationId,
    brokerageId: input.brokerageId,
    clientId: input.clientId,
    leadId: input.leadId,
    agentUid: actorUid,
    eventType: input.eventType,
    visibility: input.visibility,
    summary: input.summary,
    createdAtIso: nowIso,
  };

  tx.set(`brokerageCommunications/${communicationId}`, event);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    communicationIds: [...index.communicationIds, communicationId],
    updatedAtIso: nowIso,
  });

  return event;
}

export async function executeListClientCommunications(
  tx: TransactionContextLike,
  brokerageId: string,
  clientId: string,
  actorUid: string,
  isPlatformAdmin: boolean,
  includeInternalPrivate: boolean,
): Promise<ClientCommunicationEventRecord[]> {
  const client = await getDocData<{ clientUserUid?: string; brokerageId: string }>(
    tx,
    `brokerageClients/${clientId}`,
  );
  if (!client || client.brokerageId !== brokerageId) {
    throw new CoreApiError(
      'NOT_FOUND',
      404,
      `Client '${clientId}' not found in brokerage '${brokerageId}'.`,
    );
  }

  let canSeePrivate = false;
  if (client.clientUserUid === actorUid && !isPlatformAdmin) {
    canSeePrivate = false;
  } else {
    await executeGetClientWithAccessCheck(tx, clientId, actorUid, isPlatformAdmin);
    canSeePrivate = includeInternalPrivate;
  }

  const index = await getDocData<{ communicationIds: string[] }>(tx, `brokerageIndexes/${brokerageId}`);
  const results: ClientCommunicationEventRecord[] = [];
  for (const cId of index?.communicationIds ?? []) {
    const ev = await getDocData<ClientCommunicationEventRecord>(tx, `brokerageCommunications/${cId}`);
    if (!ev || ev.clientId !== clientId) continue;
    if (ev.visibility === 'INTERNAL_PRIVATE' && !canSeePrivate) continue;
    results.push(ev);
  }
  return results;
}

export async function executeScheduleViewing(
  tx: TransactionContextLike,
  input: ScheduleViewingInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<PropertyViewingRecord> {
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
      'Agents can only schedule viewings for themselves unless authorized as admin/manager.',
    );
  }

  const reqStartMs = Date.parse(input.startTimeIso);
  const reqEndMs = Date.parse(input.endTimeIso);

  for (const vId of index.viewingIds) {
    const existingV = await getDocData<PropertyViewingRecord>(tx, `brokerageViewings/${vId}`);
    if (
      existingV &&
      existingV.assignedAgentUid === input.assignedAgentUid &&
      existingV.status !== 'CANCELLED' &&
      existingV.status !== 'COMPLETED'
    ) {
      const exStart = Date.parse(existingV.startTimeIso);
      const exEnd = Date.parse(existingV.endTimeIso);
      if (reqStartMs < exEnd && reqEndMs > exStart) {
        throw new CoreApiError(
          'CONFLICT',
          409,
          `Agent '${input.assignedAgentUid}' already has an overlapping viewing appointment (${existingV.viewingId}).`,
        );
      }
    }
  }

  const viewingId = idGen('vwg');
  const viewing: PropertyViewingRecord = {
    viewingId,
    brokerageId: input.brokerageId,
    propertyId: input.propertyId,
    listingId: input.listingId,
    clientId: input.clientId,
    assignedAgentUid: input.assignedAgentUid,
    startTimeIso: input.startTimeIso,
    endTimeIso: input.endTimeIso,
    status: 'REQUESTED',
    history: [
      {
        status: 'REQUESTED',
        startTimeIso: input.startTimeIso,
        endTimeIso: input.endTimeIso,
        actorUid,
        timestampIso: nowIso,
      },
    ],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageViewings/${viewingId}`, viewing);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    viewingIds: [...index.viewingIds, viewingId],
    updatedAtIso: nowIso,
  });

  return viewing;
}

export async function executeUpdateViewing(
  tx: TransactionContextLike,
  input: UpdateViewingInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<PropertyViewingRecord> {
  const viewing = await getDocData<PropertyViewingRecord>(tx, `brokerageViewings/${input.viewingId}`);
  if (!viewing) {
    throw new CoreApiError('NOT_FOUND', 404, `Property viewing '${input.viewingId}' not found.`);
  }

  const { isAdminOrManager } = await assertBrokerageMemberAccess(
    tx,
    viewing.brokerageId,
    actorUid,
    isPlatformAdmin,
  );
  if (!isAdminOrManager && viewing.assignedAgentUid !== actorUid) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Only the assigned agent or brokerage admin can update this viewing.',
    );
  }

  const nextStart = input.startTimeIso ?? viewing.startTimeIso;
  const nextEnd = input.endTimeIso ?? viewing.endTimeIso;

  const updated: PropertyViewingRecord = {
    ...viewing,
    status: input.status,
    startTimeIso: nextStart,
    endTimeIso: nextEnd,
    feedbackSummary: input.feedbackSummary ?? viewing.feedbackSummary,
    clientInterestRating: input.clientInterestRating ?? viewing.clientInterestRating,
    history: [
      ...viewing.history,
      {
        status: input.status,
        startTimeIso: nextStart,
        endTimeIso: nextEnd,
        actorUid,
        note: input.feedbackSummary,
        timestampIso: nowIso,
      },
    ],
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageViewings/${viewing.viewingId}`, updated);
  return updated;
}

export async function executeGetAgentPerformanceMetrics(
  tx: TransactionContextLike,
  brokerageId: string,
  agentUid: string,
  actorUid: string,
  isPlatformAdmin: boolean,
) {
  const { index, isAdminOrManager } = await assertBrokerageMemberAccess(
    tx,
    brokerageId,
    actorUid,
    isPlatformAdmin,
  );

  if (!isAdminOrManager && actorUid !== agentUid) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Agents can only view their own detailed performance metrics unless authorized as admin/manager.',
    );
  }

  let assignedLeads = 0;
  let contactedLeads = 0;
  let qualifiedLeads = 0;
  let convertedLeads = 0;
  let totalConversionDurationMs = 0;

  for (const lId of index.leadIds) {
    const l = await getDocData<BrokerageLeadRecord>(tx, `brokerageLeads/${lId}`);
    if (!l || l.assignedAgentUid !== agentUid) continue;
    assignedLeads++;
    if (
      l.status === 'CONTACTED' ||
      l.status === 'QUALIFIED' ||
      l.status === 'NEGOTIATION' ||
      l.status === 'CONVERTED'
    ) {
      contactedLeads++;
    }
    if (l.status === 'QUALIFIED' || l.status === 'NEGOTIATION' || l.status === 'CONVERTED') {
      qualifiedLeads++;
    }
    if (l.status === 'CONVERTED') {
      convertedLeads++;
      if (l.convertedAtIso) {
        totalConversionDurationMs += Math.max(
          0,
          Date.parse(l.convertedAtIso) - Date.parse(l.createdAtIso),
        );
      }
    }
  }

  let activeListings = 0;
  for (const aId of index.acquisitionIds) {
    const acq = await getDocData<ListingAcquisitionRecord>(
      tx,
      `brokerageListingAcquisitions/${aId}`,
    );
    if (acq && acq.assignedAgentUid === agentUid && acq.status === 'ACTIVE') {
      activeListings++;
    }
  }

  let completedTransactions = 0;
  for (const pId of index.participationIds) {
    const p = await getDocData<BrokerageTransactionParticipationRecord>(
      tx,
      `brokerageTransactionParticipations/${pId}`,
    );
    if (p && p.assignedAgentUid === agentUid && p.status === 'ACTIVE') {
      completedTransactions++;
    }
  }

  let commissionTotalAmount = 0;
  for (const cId of index.commissionIds) {
    const c = await getDocData<BrokerageCommissionRecord>(tx, `brokerageCommissions/${cId}`);
    if (!c || c.status === 'REVERSED') continue;
    for (const alloc of c.allocations) {
      if (alloc.recipientUid === agentUid) {
        commissionTotalAmount = safeAddMonetary(commissionTotalAmount, alloc.allocatedAmount);
      }
    }
  }

  let totalFollowUps = 0;
  let completedFollowUps = 0;
  for (const fId of index.followUpTaskIds) {
    const f = await getDocData<LeadFollowUpTaskRecord>(tx, `brokerageFollowUps/${fId}`);
    if (!f || f.assignedAgentUid !== agentUid) continue;
    totalFollowUps++;
    if (f.status === 'COMPLETED') completedFollowUps++;
  }

  let completedViewings = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  for (const vId of index.viewingIds) {
    const v = await getDocData<PropertyViewingRecord>(tx, `brokerageViewings/${vId}`);
    if (!v || v.assignedAgentUid !== agentUid) continue;
    if (v.status === 'COMPLETED') {
      completedViewings++;
      if (typeof v.clientInterestRating === 'number') {
        ratingSum += v.clientInterestRating;
        ratingCount++;
      }
    }
  }

  return {
    brokerageId,
    agentUid,
    assignedLeads,
    contactedLeads,
    qualifiedLeads,
    convertedLeads,
    averageConversionDurationMs:
      convertedLeads > 0 ? Math.round(totalConversionDurationMs / convertedLeads) : 0,
    activeListings,
    participatingTransactions: completedTransactions,
    commissionTotalAmount,
    followUpCompletionRateBasisPoints:
      totalFollowUps > 0 ? Math.round((completedFollowUps * 10000) / totalFollowUps) : 10000,
    completedViewings,
    averageClientInterestRating: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : 0,
  };
}

export async function executeGetBrokerageOperationalReport(
  tx: TransactionContextLike,
  brokerageId: string,
  actorUid: string,
  isPlatformAdmin: boolean,
) {
  const { brokerage, index } = await assertBrokerageAdminAccess(tx, brokerageId, actorUid, isPlatformAdmin);

  let totalLeads = 0;
  let convertedLeads = 0;
  for (const lId of index.leadIds) {
    const l = await getDocData<BrokerageLeadRecord>(tx, `brokerageLeads/${lId}`);
    if (!l) continue;
    totalLeads++;
    if (l.status === 'CONVERTED') convertedLeads++;
  }

  let activeAcquisitions = 0;
  for (const aId of index.acquisitionIds) {
    const acq = await getDocData<ListingAcquisitionRecord>(
      tx,
      `brokerageListingAcquisitions/${aId}`,
    );
    if (acq && acq.status === 'ACTIVE') activeAcquisitions++;
  }

  let totalCommissionPostedAmount = 0;
  let activeCommissionCount = 0;
  for (const cId of index.commissionIds) {
    const c = await getDocData<BrokerageCommissionRecord>(tx, `brokerageCommissions/${cId}`);
    if (c && c.status !== 'REVERSED') {
      activeCommissionCount++;
      totalCommissionPostedAmount = safeAddMonetary(
        totalCommissionPostedAmount,
        c.totalCommissionAmount,
      );
    }
  }

  let convertedReferrals = 0;
  for (const rId of index.referralIds) {
    const r = await getDocData<BrokerageReferralRecord>(tx, `brokerageReferrals/${rId}`);
    if (r && r.status === 'CONVERTED') convertedReferrals++;
  }

  return {
    brokerageId: brokerage.brokerageId,
    displayName: brokerage.displayName,
    activeAgentCount: brokerage.activeAgentUids.length,
    teamCount: index.teamIds.length,
    clientCount: index.clientIds.length,
    totalLeads,
    convertedLeads,
    leadConversionRateBasisPoints:
      totalLeads > 0 ? Math.round((convertedLeads * 10000) / totalLeads) : 0,
    activeListingAcquisitions: activeAcquisitions,
    transactionParticipationsCount: index.participationIds.length,
    activeCommissionCount,
    totalCommissionPostedAmount,
    totalReferrals: index.referralIds.length,
    convertedReferrals,
  };
}
