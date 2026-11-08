import { TransactionContextLike, CoreApiError } from '../core';
import {
  BrokerageClientRecord,
  BrokerageLeadRecord,
  LeadFollowUpTaskRecord,
  AgentProfileRecord,
  BrokerageTeamRecord,
} from './types';
import {
  CreateClientInput,
  CreateLeadInput,
  DistributeLeadInput,
  UpdateLeadStatusInput,
  CreateFollowUpTaskInput,
  UpdateFollowUpTaskInput,
} from './validation';
import {
  getDocData,
  assertBrokerageMemberAccess,
  assertBrokerageAdminAccess,
} from './organizationAgentMembershipAndTeamOps';

export async function executeCreateClient(
  tx: TransactionContextLike,
  input: CreateClientInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<BrokerageClientRecord> {
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
      'Agents can only create client profiles assigned to themselves unless authorized as admin/manager.',
    );
  }

  const clientId = idGen('cli');
  const client: BrokerageClientRecord = {
    clientId,
    brokerageId: input.brokerageId,
    clientUserUid: input.clientUserUid,
    displayName: input.displayName,
    categories: Array.from(new Set(input.categories)),
    relationshipStatus: 'ACTIVE',
    assignedAgentUid: input.assignedAgentUid,
    teamId: input.teamId,
    preferredNeighborhoodIds: Array.from(new Set(input.preferredNeighborhoodIds ?? [])),
    preferredPropertyCategories: Array.from(new Set(input.preferredPropertyCategories ?? [])),
    communicationChannelPreference: input.communicationChannelPreference ?? 'PHONE',
    ownedPropertyIds: Array.from(new Set(input.ownedPropertyIds ?? [])),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageClients/${clientId}`, client);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    clientIds: [...index.clientIds, clientId],
    updatedAtIso: nowIso,
  });

  return client;
}

export async function executeGetClientWithAccessCheck(
  tx: TransactionContextLike,
  clientId: string,
  actorUid: string,
  isPlatformAdmin: boolean,
): Promise<BrokerageClientRecord> {
  const client = await getDocData<BrokerageClientRecord>(tx, `brokerageClients/${clientId}`);
  if (!client) {
    throw new CoreApiError('NOT_FOUND', 404, `Client '${clientId}' not found.`);
  }

  const { isAdminOrManager } = await assertBrokerageMemberAccess(
    tx,
    client.brokerageId,
    actorUid,
    isPlatformAdmin,
  );

  if (isAdminOrManager || client.assignedAgentUid === actorUid) {
    return client;
  }

  if (client.teamId) {
    const team = await getDocData<BrokerageTeamRecord>(tx, `brokerageTeams/${client.teamId}`);
    if (team && team.leaderUid === actorUid) {
      return client;
    }
  }

  throw new CoreApiError(
    'FORBIDDEN',
    403,
    'Access denied to another agent or team private client record.',
  );
}

export async function executeCreateLead(
  tx: TransactionContextLike,
  input: CreateLeadInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<BrokerageLeadRecord> {
  const { index } = await assertBrokerageMemberAccess(tx, input.brokerageId, actorUid, isPlatformAdmin);

  const leadId = idGen('lead');
  const lead: BrokerageLeadRecord = {
    leadId,
    brokerageId: input.brokerageId,
    source: input.source,
    category: input.category,
    propertyCategory: input.propertyCategory,
    neighborhoodId: input.neighborhoodId,
    interestedPropertyId: input.interestedPropertyId,
    clientId: input.clientId,
    status: 'NEW',
    priority: input.priority ?? 'MEDIUM',
    assignmentHistory: [],
    createdAtIso: nowIso,
    lastActivityAtIso: nowIso,
  };

  tx.set(`brokerageLeads/${leadId}`, lead);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    leadIds: [...index.leadIds, leadId],
    updatedAtIso: nowIso,
  });

  return lead;
}

export async function executeDistributeLead(
  tx: TransactionContextLike,
  input: DistributeLeadInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<BrokerageLeadRecord> {
  const lead = await getDocData<BrokerageLeadRecord>(tx, `brokerageLeads/${input.leadId}`);
  if (!lead) {
    throw new CoreApiError('NOT_FOUND', 404, `Lead '${input.leadId}' not found.`);
  }

  const { brokerage } = await assertBrokerageAdminAccess(tx, lead.brokerageId, actorUid, isPlatformAdmin);

  if (lead.assignedAgentUid && !input.allowReassign) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Lead '${lead.leadId}' is already assigned to '${lead.assignedAgentUid}'. Set allowReassign=true to reassign.`,
    );
  }

  let candidateUids: string[] = [...brokerage.activeAgentUids].sort();
  if (input.targetTeamId) {
    const team = await getDocData<BrokerageTeamRecord>(tx, `brokerageTeams/${input.targetTeamId}`);
    if (!team || team.brokerageId !== brokerage.brokerageId) {
      throw new CoreApiError(
        'NOT_FOUND',
        404,
        `Team '${input.targetTeamId}' not found in brokerage '${brokerage.brokerageId}'.`,
      );
    }
    candidateUids = team.memberUids.filter((u) => brokerage.activeAgentUids.includes(u)).sort();
  }

  const eligibleAgents: AgentProfileRecord[] = [];
  for (const uid of candidateUids) {
    const agt = await getDocData<AgentProfileRecord>(tx, `brokerageAgents/agt_${uid}`);
    if (agt && agt.status === 'ACTIVE' && agt.membershipStatus === 'ACTIVE' && agt.isAvailableForLeads) {
      eligibleAgents.push(agt);
    }
  }

  let selectedAgent: AgentProfileRecord | undefined;

  if (input.strategy === 'MANUAL') {
    if (!input.targetAgentUid) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'targetAgentUid is required for MANUAL lead distribution.',
      );
    }
    const targetAgt = await getDocData<AgentProfileRecord>(
      tx,
      `brokerageAgents/agt_${input.targetAgentUid}`,
    );
    if (
      !targetAgt ||
      targetAgt.status !== 'ACTIVE' ||
      targetAgt.membershipStatus !== 'ACTIVE' ||
      !brokerage.activeAgentUids.includes(input.targetAgentUid)
    ) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `Target agent '${input.targetAgentUid}' is not an active member of brokerage '${brokerage.brokerageId}'.`,
      );
    }
    selectedAgent = targetAgt;
  } else if (input.strategy === 'ROUND_ROBIN') {
    if (eligibleAgents.length === 0) {
      throw new CoreApiError('CONFLICT', 409, 'No active available agents found for round-robin distribution.');
    }
    const idx = brokerage.roundRobinCursor % eligibleAgents.length;
    selectedAgent = eligibleAgents[idx];
    tx.set(`brokerageOrganizations/${brokerage.brokerageId}`, {
      ...brokerage,
      roundRobinCursor: brokerage.roundRobinCursor + 1,
      updatedAtIso: nowIso,
    });
  } else if (input.strategy === 'WORKLOAD_AWARE') {
    if (eligibleAgents.length === 0) {
      throw new CoreApiError('CONFLICT', 409, 'No active available agents found for workload-aware distribution.');
    }
    eligibleAgents.sort((a, b) => a.activeLeadCount - b.activeLeadCount || a.userUid.localeCompare(b.userUid));
    selectedAgent = eligibleAgents[0];
  } else if (input.strategy === 'SERVICE_AREA_MATCH') {
    const areaMatched = lead.neighborhoodId
      ? eligibleAgents.filter((a) => a.serviceNeighborhoodIds.includes(lead.neighborhoodId!))
      : eligibleAgents;
    const pool = areaMatched.length > 0 ? areaMatched : eligibleAgents;
    if (pool.length === 0) {
      throw new CoreApiError('CONFLICT', 409, 'No eligible agents found for service-area lead distribution.');
    }
    pool.sort((a, b) => a.activeLeadCount - b.activeLeadCount || a.userUid.localeCompare(b.userUid));
    selectedAgent = pool[0];
  } else if (input.strategy === 'PROPERTY_CATEGORY_MATCH') {
    const catMatched = lead.propertyCategory
      ? eligibleAgents.filter((a) => a.propertyCategories.includes(lead.propertyCategory!))
      : eligibleAgents;
    const pool = catMatched.length > 0 ? catMatched : eligibleAgents;
    if (pool.length === 0) {
      throw new CoreApiError('CONFLICT', 409, 'No eligible agents found for property-category lead distribution.');
    }
    pool.sort((a, b) => a.activeLeadCount - b.activeLeadCount || a.userUid.localeCompare(b.userUid));
    selectedAgent = pool[0];
  }

  if (!selectedAgent) {
    throw new CoreApiError('CONFLICT', 409, 'Could not select an eligible agent for lead assignment.');
  }

  if (lead.assignedAgentUid && lead.assignedAgentUid !== selectedAgent.userUid) {
    const prevAgent = await getDocData<AgentProfileRecord>(
      tx,
      `brokerageAgents/agt_${lead.assignedAgentUid}`,
    );
    if (prevAgent) {
      tx.set(`brokerageAgents/${prevAgent.agentId}`, {
        ...prevAgent,
        activeLeadCount: Math.max(0, prevAgent.activeLeadCount - 1),
        updatedAtIso: nowIso,
      });
    }
  }

  if (lead.assignedAgentUid !== selectedAgent.userUid) {
    tx.set(`brokerageAgents/${selectedAgent.agentId}`, {
      ...selectedAgent,
      activeLeadCount: selectedAgent.activeLeadCount + 1,
      updatedAtIso: nowIso,
    });
  }

  const updatedLead: BrokerageLeadRecord = {
    ...lead,
    assignedAgentUid: selectedAgent.userUid,
    assignedTeamId: input.targetTeamId ?? lead.assignedTeamId,
    status: lead.status === 'NEW' || lead.status === 'UNASSIGNED' ? 'ASSIGNED' : lead.status,
    assignmentExpiresAtIso: input.assignmentExpiresAtIso ?? lead.assignmentExpiresAtIso,
    assignmentHistory: [
      ...lead.assignmentHistory,
      {
        fromAgentUid: lead.assignedAgentUid,
        toAgentUid: selectedAgent.userUid,
        teamId: input.targetTeamId,
        strategy: input.strategy,
        actorUid,
        reason: input.reason,
        timestampIso: nowIso,
      },
    ],
    lastActivityAtIso: nowIso,
  };

  tx.set(`brokerageLeads/${lead.leadId}`, updatedLead);
  return updatedLead;
}

export async function executeUpdateLeadStatus(
  tx: TransactionContextLike,
  input: UpdateLeadStatusInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<BrokerageLeadRecord> {
  const lead = await getDocData<BrokerageLeadRecord>(tx, `brokerageLeads/${input.leadId}`);
  if (!lead) {
    throw new CoreApiError('NOT_FOUND', 404, `Lead '${input.leadId}' not found.`);
  }

  const { isAdminOrManager } = await assertBrokerageMemberAccess(tx, lead.brokerageId, actorUid, isPlatformAdmin);
  if (!isAdminOrManager && lead.assignedAgentUid !== actorUid) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Only the assigned agent or brokerage administrator can update this lead.',
    );
  }

  if (lead.status === 'CONVERTED' && input.status === 'CONVERTED') {
    throw new CoreApiError('CONFLICT', 409, `Lead '${lead.leadId}' has already been converted.`);
  }

  const updatedLead: BrokerageLeadRecord = {
    ...lead,
    status: input.status,
    conversionTransactionId: input.conversionTransactionId ?? lead.conversionTransactionId,
    conversionClientId: input.conversionClientId ?? lead.conversionClientId,
    firstContactedAtIso:
      input.status === 'CONTACTED' && !lead.firstContactedAtIso ? nowIso : lead.firstContactedAtIso,
    convertedAtIso: input.status === 'CONVERTED' ? nowIso : lead.convertedAtIso,
    lastActivityAtIso: nowIso,
  };

  tx.set(`brokerageLeads/${lead.leadId}`, updatedLead);
  return updatedLead;
}

export async function executeCreateFollowUpTask(
  tx: TransactionContextLike,
  input: CreateFollowUpTaskInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<LeadFollowUpTaskRecord> {
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
      'Agents can only schedule follow-up tasks for themselves unless authorized as admin/manager.',
    );
  }

  for (const tId of index.followUpTaskIds) {
    const existingTask = await getDocData<LeadFollowUpTaskRecord>(tx, `brokerageFollowUps/${tId}`);
    if (
      existingTask &&
      existingTask.leadId === input.leadId &&
      existingTask.title === input.title &&
      existingTask.dueAtIso === input.dueAtIso &&
      existingTask.status === 'PENDING'
    ) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        'A pending follow-up task with the same title and due date already exists for this lead.',
      );
    }
  }

  const taskId = idGen('flw');
  const task: LeadFollowUpTaskRecord = {
    taskId,
    brokerageId: input.brokerageId,
    leadId: input.leadId,
    assignedAgentUid: input.assignedAgentUid,
    title: input.title,
    priority: input.priority ?? 'MEDIUM',
    status: 'PENDING',
    dueAtIso: input.dueAtIso,
    contactAttemptsCount: 0,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageFollowUps/${taskId}`, task);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    followUpTaskIds: [...index.followUpTaskIds, taskId],
    updatedAtIso: nowIso,
  });

  return task;
}

export async function executeUpdateFollowUpTask(
  tx: TransactionContextLike,
  input: UpdateFollowUpTaskInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<LeadFollowUpTaskRecord> {
  const task = await getDocData<LeadFollowUpTaskRecord>(tx, `brokerageFollowUps/${input.taskId}`);
  if (!task) {
    throw new CoreApiError('NOT_FOUND', 404, `Follow-up task '${input.taskId}' not found.`);
  }

  const { isAdminOrManager } = await assertBrokerageMemberAccess(tx, task.brokerageId, actorUid, isPlatformAdmin);
  if (!isAdminOrManager && task.assignedAgentUid !== actorUid) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Only the assigned agent or brokerage admin can update this follow-up task.',
    );
  }

  const updatedTask: LeadFollowUpTaskRecord = {
    ...task,
    status: input.status,
    contactAttemptsCount: input.incrementContactAttempt
      ? task.contactAttemptsCount + 1
      : task.contactAttemptsCount,
    outcome: input.outcome ?? task.outcome,
    nextActionReference: input.nextActionReference ?? task.nextActionReference,
    completedAtIso: input.status === 'COMPLETED' ? nowIso : task.completedAtIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageFollowUps/${task.taskId}`, updatedTask);
  return updatedTask;
}
