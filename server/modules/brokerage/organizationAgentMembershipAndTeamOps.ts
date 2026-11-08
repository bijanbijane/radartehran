import { TransactionContextLike, CoreApiError } from '../core';
import {
  BrokerageOrganizationRecord,
  BrokerageIndexRecord,
  AgentProfileRecord,
  BrokerageMembershipRecord,
  BrokerageTeamRecord,
} from './types';
import {
  CreateBrokerageOrganizationInput,
  UpdateBrokerageOrganizationInput,
  UpsertAgentProfileInput,
  InviteBrokerageMemberInput,
  TransitionMembershipInput,
  CreateTeamInput,
  TransferTeamMemberInput,
} from './validation';

export async function getDocData<T>(
  tx: TransactionContextLike,
  docPath: string,
): Promise<T | null> {
  const snap = await tx.get<T>(docPath);
  if (!snap || !snap.exists || !snap.data) return null;
  return snap.data;
}

export async function getOrCreateBrokerageIndex(
  tx: TransactionContextLike,
  brokerageId: string,
  nowIso: string,
): Promise<BrokerageIndexRecord> {
  const existing = await getDocData<BrokerageIndexRecord>(tx, `brokerageIndexes/${brokerageId}`);
  if (existing) return existing;
  return {
    brokerageId,
    membershipIds: [],
    teamIds: [],
    clientIds: [],
    leadIds: [],
    followUpTaskIds: [],
    representationIds: [],
    acquisitionIds: [],
    participationIds: [],
    agreementIds: [],
    commissionIds: [],
    referralIds: [],
    communicationIds: [],
    viewingIds: [],
    updatedAtIso: nowIso,
  };
}

export async function assertBrokerageAdminAccess(
  tx: TransactionContextLike,
  brokerageId: string,
  actorUid: string,
  isPlatformAdmin: boolean,
): Promise<{ brokerage: BrokerageOrganizationRecord; index: BrokerageIndexRecord }> {
  const brokerage = await getDocData<BrokerageOrganizationRecord>(
    tx,
    `brokerageOrganizations/${brokerageId}`,
  );
  if (!brokerage) {
    throw new CoreApiError('NOT_FOUND', 404, `Brokerage organization '${brokerageId}' not found.`);
  }
  const index = await getOrCreateBrokerageIndex(tx, brokerageId, brokerage.updatedAtIso);
  if (isPlatformAdmin || brokerage.ownerUid === actorUid || brokerage.adminUids.includes(actorUid)) {
    return { brokerage, index };
  }
  for (const mId of index.membershipIds) {
    const m = await getDocData<BrokerageMembershipRecord>(tx, `brokerageMemberships/${mId}`);
    if (
      m &&
      m.userUid === actorUid &&
      m.status === 'ACTIVE' &&
      (m.role === 'BROKERAGE_OWNER' || m.role === 'BROKERAGE_ADMIN' || m.role === 'BRANCH_MANAGER')
    ) {
      return { brokerage, index };
    }
  }
  throw new CoreApiError(
    'FORBIDDEN',
    403,
    'Actor is not authorized as an administrator of this brokerage.',
  );
}

export async function assertBrokerageMemberAccess(
  tx: TransactionContextLike,
  brokerageId: string,
  actorUid: string,
  isPlatformAdmin: boolean,
): Promise<{
  brokerage: BrokerageOrganizationRecord;
  index: BrokerageIndexRecord;
  membership: BrokerageMembershipRecord | null;
  isAdminOrManager: boolean;
}> {
  const brokerage = await getDocData<BrokerageOrganizationRecord>(
    tx,
    `brokerageOrganizations/${brokerageId}`,
  );
  if (!brokerage) {
    throw new CoreApiError('NOT_FOUND', 404, `Brokerage organization '${brokerageId}' not found.`);
  }
  const index = await getOrCreateBrokerageIndex(tx, brokerageId, brokerage.updatedAtIso);
  const isOwnerOrAdmin =
    isPlatformAdmin || brokerage.ownerUid === actorUid || brokerage.adminUids.includes(actorUid);

  let foundMembership: BrokerageMembershipRecord | null = null;
  for (const mId of index.membershipIds) {
    const m = await getDocData<BrokerageMembershipRecord>(tx, `brokerageMemberships/${mId}`);
    if (m && m.userUid === actorUid && m.status === 'ACTIVE') {
      foundMembership = m;
      break;
    }
  }

  if (!isOwnerOrAdmin && !foundMembership) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Actor does not belong to this brokerage organization.',
    );
  }

  const isAdminOrManager =
    isOwnerOrAdmin ||
    (foundMembership !== null &&
      (foundMembership.role === 'BROKERAGE_OWNER' ||
        foundMembership.role === 'BROKERAGE_ADMIN' ||
        foundMembership.role === 'BRANCH_MANAGER'));

  return { brokerage, index, membership: foundMembership, isAdminOrManager };
}

export async function executeCreateBrokerageOrganization(
  tx: TransactionContextLike,
  input: CreateBrokerageOrganizationInput,
  actorUid: string,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<BrokerageOrganizationRecord> {
  const brokerageId = idGen('brk');
  const adminUids = Array.from(new Set([actorUid, ...(input.adminUids ?? [])]));
  const hasEvidence = (input.verificationEvidenceIds ?? []).length > 0;

  const brokerage: BrokerageOrganizationRecord = {
    brokerageId,
    legalName: input.legalName,
    displayName: input.displayName,
    status: 'ACTIVE',
    ownerUid: actorUid,
    adminUids,
    officeIds: Array.from(new Set(input.officeIds ?? [])),
    memberUids: [actorUid],
    activeAgentUids: [],
    verificationStatus: hasEvidence ? 'PENDING_REVIEW' : 'UNVERIFIED',
    verificationEvidenceIds: input.verificationEvidenceIds ?? [],
    businessContactPhone: input.businessContactPhone,
    businessContactEmail: input.businessContactEmail,
    cityId: input.cityId,
    roundRobinCursor: 0,
    version: 1,
    createdByUid: actorUid,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const index = await getOrCreateBrokerageIndex(tx, brokerageId, nowIso);
  tx.set(`brokerageOrganizations/${brokerageId}`, brokerage);
  tx.set(`brokerageIndexes/${brokerageId}`, index);
  return brokerage;
}

export async function executeUpdateBrokerageOrganization(
  tx: TransactionContextLike,
  input: UpdateBrokerageOrganizationInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<BrokerageOrganizationRecord> {
  const { brokerage } = await assertBrokerageAdminAccess(tx, input.brokerageId, actorUid, isPlatformAdmin);

  if (input.verificationStatus === 'VERIFIED' && !isPlatformAdmin) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Only platform administrators can mark a brokerage organization as VERIFIED.',
    );
  }

  const updated: BrokerageOrganizationRecord = {
    ...brokerage,
    displayName: input.displayName ?? brokerage.displayName,
    status: input.status ?? brokerage.status,
    adminUids: input.adminUids ? Array.from(new Set([brokerage.ownerUid, ...input.adminUids])) : brokerage.adminUids,
    officeIds: input.officeIds ? Array.from(new Set(input.officeIds)) : brokerage.officeIds,
    verificationStatus: input.verificationStatus ?? brokerage.verificationStatus,
    verificationEvidenceIds: input.verificationEvidenceIds ?? brokerage.verificationEvidenceIds,
    version: brokerage.version + 1,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageOrganizations/${brokerage.brokerageId}`, updated);
  return updated;
}

export async function executeUpsertAgentProfile(
  tx: TransactionContextLike,
  input: UpsertAgentProfileInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<AgentProfileRecord> {
  const agentId = `agt_${input.userUid}`;
  const existing = await getDocData<AgentProfileRecord>(tx, `brokerageAgents/${agentId}`);

  if (input.userUid !== actorUid && !isPlatformAdmin) {
    if (!input.brokerageId) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Only the agent user or an authorized brokerage/platform admin can update an agent profile.',
      );
    }
    await assertBrokerageAdminAccess(tx, input.brokerageId, actorUid, isPlatformAdmin);
  }

  const agent: AgentProfileRecord = {
    agentId,
    userUid: input.userUid,
    brokerageId: existing?.brokerageId ?? input.brokerageId,
    displayName: input.displayName,
    bioSummary: input.bioSummary ?? existing?.bioSummary,
    yearsOfExperience: input.yearsOfExperience,
    serviceNeighborhoodIds: Array.from(new Set(input.serviceNeighborhoodIds)),
    propertyCategories: Array.from(new Set(input.propertyCategories)),
    transactionCategories: Array.from(new Set(input.transactionCategories)),
    verificationReferenceId: input.verificationReferenceId ?? existing?.verificationReferenceId,
    licenseReferenceId: input.licenseReferenceId ?? existing?.licenseReferenceId,
    status: input.status ?? existing?.status ?? 'ACTIVE',
    membershipStatus: existing?.membershipStatus,
    activeLeadCount: existing?.activeLeadCount ?? 0,
    isAvailableForLeads: input.isAvailableForLeads ?? existing?.isAvailableForLeads ?? true,
    createdAtIso: existing?.createdAtIso ?? nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageAgents/${agentId}`, agent);
  return agent;
}

export async function executeInviteBrokerageMember(
  tx: TransactionContextLike,
  input: InviteBrokerageMemberInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<BrokerageMembershipRecord> {
  const { brokerage, index } = await assertBrokerageAdminAccess(tx, input.brokerageId, actorUid, isPlatformAdmin);

  const agent = await getDocData<AgentProfileRecord>(tx, `brokerageAgents/${input.agentId}`);
  if (!agent || agent.userUid !== input.userUid) {
    throw new CoreApiError(
      'NOT_FOUND',
      404,
      `Agent profile '${input.agentId}' for user '${input.userUid}' not found.`,
    );
  }

  for (const mId of index.membershipIds) {
    const existingM = await getDocData<BrokerageMembershipRecord>(tx, `brokerageMemberships/${mId}`);
    if (existingM && existingM.userUid === input.userUid && existingM.status !== 'TERMINATED') {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `User '${input.userUid}' already has an active or pending membership in brokerage '${input.brokerageId}'.`,
      );
    }
  }

  const membershipId = idGen('mbr');
  const membership: BrokerageMembershipRecord = {
    membershipId,
    brokerageId: brokerage.brokerageId,
    agentId: input.agentId,
    userUid: input.userUid,
    role: input.role,
    status: 'INVITED',
    teamId: input.teamId,
    permissions: input.permissions ?? [],
    invitedByUid: actorUid,
    history: [
      {
        toStatus: 'INVITED',
        role: input.role,
        actorUid,
        timestampIso: nowIso,
      },
    ],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const updatedIndex: BrokerageIndexRecord = {
    ...index,
    membershipIds: [...index.membershipIds, membershipId],
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageMemberships/${membershipId}`, membership);
  tx.set(`brokerageIndexes/${brokerage.brokerageId}`, updatedIndex);
  return membership;
}

export async function executeTransitionMembership(
  tx: TransactionContextLike,
  input: TransitionMembershipInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<{ membership: BrokerageMembershipRecord; transferredMembership?: BrokerageMembershipRecord }> {
  const membership = await getDocData<BrokerageMembershipRecord>(
    tx,
    `brokerageMemberships/${input.membershipId}`,
  );
  if (!membership) {
    throw new CoreApiError('NOT_FOUND', 404, `Membership '${input.membershipId}' not found.`);
  }

  const brokerage = await getDocData<BrokerageOrganizationRecord>(
    tx,
    `brokerageOrganizations/${membership.brokerageId}`,
  );
  if (!brokerage) {
    throw new CoreApiError('NOT_FOUND', 404, `Brokerage '${membership.brokerageId}' not found.`);
  }

  const isBrokerageAdmin =
    isPlatformAdmin || brokerage.ownerUid === actorUid || brokerage.adminUids.includes(actorUid);

  if (!isBrokerageAdmin) {
    if (membership.userUid !== actorUid) {
      throw new CoreApiError('FORBIDDEN', 403, 'Actor is not authorized to modify this membership.');
    }
    if (input.role && input.role !== membership.role) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Agents cannot elevate or change their own brokerage role.',
      );
    }
    if (input.status === 'ACTIVE' && membership.status !== 'INVITED') {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Only brokerage administrators can approve suspended or pending memberships.',
      );
    }
  }

  const nextRole = input.role ?? membership.role;
  const updatedMembership: BrokerageMembershipRecord = {
    ...membership,
    status: input.status,
    role: nextRole,
    permissions: input.permissions ?? membership.permissions,
    approvedByUid: input.status === 'ACTIVE' && isBrokerageAdmin ? actorUid : membership.approvedByUid,
    history: [
      ...membership.history,
      {
        fromStatus: membership.status,
        toStatus: input.status,
        role: nextRole,
        actorUid,
        reason: input.reason,
        timestampIso: nowIso,
      },
    ],
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageMemberships/${membership.membershipId}`, updatedMembership);

  const agent = await getDocData<AgentProfileRecord>(tx, `brokerageAgents/${membership.agentId}`);
  if (agent) {
    const nextBrokerageId =
      input.status === 'TERMINATED' ? input.transferToBrokerageId : membership.brokerageId;
    tx.set(`brokerageAgents/${agent.agentId}`, {
      ...agent,
      brokerageId: nextBrokerageId,
      membershipStatus: input.status,
      updatedAtIso: nowIso,
    });
  }

  const nextMemberUids = new Set(brokerage.memberUids);
  const nextActiveAgents = new Set(brokerage.activeAgentUids);
  if (input.status === 'ACTIVE') {
    nextMemberUids.add(membership.userUid);
    nextActiveAgents.add(membership.userUid);
  } else if (input.status === 'SUSPENDED' || input.status === 'TERMINATED') {
    nextActiveAgents.delete(membership.userUid);
    if (input.status === 'TERMINATED') {
      nextMemberUids.delete(membership.userUid);
    }
  }

  tx.set(`brokerageOrganizations/${brokerage.brokerageId}`, {
    ...brokerage,
    memberUids: Array.from(nextMemberUids),
    activeAgentUids: Array.from(nextActiveAgents),
    updatedAtIso: nowIso,
  });

  let transferredMembership: BrokerageMembershipRecord | undefined;
  if (input.status === 'TERMINATED' && input.transferToBrokerageId) {
    transferredMembership = await executeInviteBrokerageMember(
      tx,
      {
        brokerageId: input.transferToBrokerageId,
        agentId: membership.agentId,
        userUid: membership.userUid,
        role: 'AGENT',
      },
      actorUid,
      isPlatformAdmin,
      nowIso,
      idGen,
    );
  }

  return { membership: updatedMembership, transferredMembership };
}

export async function executeCreateTeam(
  tx: TransactionContextLike,
  input: CreateTeamInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
  idGen: (prefix: string) => string,
): Promise<BrokerageTeamRecord> {
  const { index } = await assertBrokerageAdminAccess(tx, input.brokerageId, actorUid, isPlatformAdmin);
  const teamId = idGen('team');
  const memberUids = Array.from(new Set([input.leaderUid, ...(input.memberUids ?? [])]));

  const team: BrokerageTeamRecord = {
    teamId,
    brokerageId: input.brokerageId,
    name: input.name,
    leaderUid: input.leaderUid,
    memberUids,
    serviceNeighborhoodIds: Array.from(new Set(input.serviceNeighborhoodIds ?? [])),
    permissions: input.permissions ?? [],
    roundRobinCursor: 0,
    assignmentHistory: memberUids.map((uid) => ({
      userUid: uid,
      action: 'ADDED' as const,
      actorUid,
      timestampIso: nowIso,
    })),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`brokerageTeams/${teamId}`, team);
  tx.set(`brokerageIndexes/${input.brokerageId}`, {
    ...index,
    teamIds: [...index.teamIds, teamId],
    updatedAtIso: nowIso,
  });

  return team;
}

export async function executeTransferTeamMember(
  tx: TransactionContextLike,
  input: TransferTeamMemberInput,
  actorUid: string,
  isPlatformAdmin: boolean,
  nowIso: string,
): Promise<{ fromTeam?: BrokerageTeamRecord; toTeam: BrokerageTeamRecord }> {
  await assertBrokerageAdminAccess(tx, input.brokerageId, actorUid, isPlatformAdmin);

  const toTeam = await getDocData<BrokerageTeamRecord>(tx, `brokerageTeams/${input.toTeamId}`);
  if (!toTeam || toTeam.brokerageId !== input.brokerageId) {
    throw new CoreApiError(
      'NOT_FOUND',
      404,
      `Target team '${input.toTeamId}' not found in brokerage '${input.brokerageId}'.`,
    );
  }

  let updatedFromTeam: BrokerageTeamRecord | undefined;
  if (input.fromTeamId) {
    const fromTeam = await getDocData<BrokerageTeamRecord>(tx, `brokerageTeams/${input.fromTeamId}`);
    if (!fromTeam || fromTeam.brokerageId !== input.brokerageId) {
      throw new CoreApiError(
        'NOT_FOUND',
        404,
        `Source team '${input.fromTeamId}' not found in brokerage '${input.brokerageId}'.`,
      );
    }
    updatedFromTeam = {
      ...fromTeam,
      memberUids: fromTeam.memberUids.filter((u) => u !== input.userUid),
      assignmentHistory: [
        ...fromTeam.assignmentHistory,
        { userUid: input.userUid, action: 'TRANSFERRED_OUT', actorUid, timestampIso: nowIso },
      ],
      updatedAtIso: nowIso,
    };
    tx.set(`brokerageTeams/${fromTeam.teamId}`, updatedFromTeam);
  }

  const updatedToTeam: BrokerageTeamRecord = {
    ...toTeam,
    memberUids: Array.from(new Set([...toTeam.memberUids, input.userUid])),
    assignmentHistory: [
      ...toTeam.assignmentHistory,
      { userUid: input.userUid, action: 'TRANSFERRED_IN', actorUid, timestampIso: nowIso },
    ],
    updatedAtIso: nowIso,
  };
  tx.set(`brokerageTeams/${toTeam.teamId}`, updatedToTeam);

  return { fromTeam: updatedFromTeam, toTeam: updatedToTeam };
}
