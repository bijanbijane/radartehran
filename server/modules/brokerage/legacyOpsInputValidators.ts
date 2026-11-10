/**
 * @file server/modules/brokerage/legacyOpsInputValidators.ts
 * @description Input validators for brokerage organizations, agents, memberships, teams, clients, leads, and follow-ups.
 */

import {
  asPlainObject,
  reqStr,
  optStr,
  reqEnum,
  optEnum,
  reqInt,
  optStrArray,
  type BrokerageRoleType,
  type LeadDistributionStrategy,
} from './legacyOpsTypesAndValidation';

export interface CreateBrokerageOrganizationInput {
  legalName?: string;
  displayName: string;
  cityId: string;
  adminUids?: string[];
  officeIds?: string[];
  verificationEvidenceIds?: string[];
  businessContactPhone?: string;
  businessContactEmail?: string;
}

export function validateCreateBrokerageInput(raw: unknown): CreateBrokerageOrganizationInput {
  const obj = asPlainObject(raw);
  return {
    legalName: optStr(obj, 'legalName', 2, 200),
    displayName: reqStr(obj, 'displayName', 2, 160),
    cityId: reqStr(obj, 'cityId', 2, 64),
    adminUids: optStrArray(obj, 'adminUids', 20),
    officeIds: optStrArray(obj, 'officeIds', 20),
    verificationEvidenceIds: optStrArray(obj, 'verificationEvidenceIds', 20),
    businessContactPhone: optStr(obj, 'businessContactPhone', 5, 32),
    businessContactEmail: optStr(obj, 'businessContactEmail', 5, 160),
  };
}

export interface UpdateBrokerageOrganizationInput {
  brokerageId: string;
  displayName?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  adminUids?: string[];
  officeIds?: string[];
  verificationStatus?: 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
  verificationEvidenceIds?: string[];
}

export function validateUpdateBrokerageInput(raw: unknown): UpdateBrokerageOrganizationInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    displayName: optStr(obj, 'displayName', 2, 160),
    status: optEnum(obj, 'status', ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const),
    adminUids: optStrArray(obj, 'adminUids', 20),
    officeIds: optStrArray(obj, 'officeIds', 20),
    verificationStatus: optEnum(
      obj,
      'verificationStatus',
      ['UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED'] as const,
    ),
    verificationEvidenceIds: optStrArray(obj, 'verificationEvidenceIds', 20),
  };
}

export interface UpsertAgentProfileInput {
  userUid: string;
  brokerageId?: string;
  displayName: string;
  bioSummary?: string;
  yearsOfExperience: number;
  serviceNeighborhoodIds: string[];
  propertyCategories: string[];
  transactionCategories: string[];
  verificationReferenceId?: string;
  licenseReferenceId?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  isAvailableForLeads?: boolean;
}

export function validateUpsertAgentInput(raw: unknown): UpsertAgentProfileInput {
  const obj = asPlainObject(raw);
  return {
    userUid: reqStr(obj, 'userUid', 2, 128),
    brokerageId: optStr(obj, 'brokerageId', 3, 128),
    displayName: reqStr(obj, 'displayName', 2, 160),
    bioSummary: optStr(obj, 'bioSummary', 2, 1000),
    yearsOfExperience: reqInt(obj, 'yearsOfExperience', 0, 80),
    serviceNeighborhoodIds: optStrArray(obj, 'serviceNeighborhoodIds', 50) ?? [],
    propertyCategories: optStrArray(obj, 'propertyCategories', 20) ?? [],
    transactionCategories: optStrArray(obj, 'transactionCategories', 20) ?? [],
    verificationReferenceId: optStr(obj, 'verificationReferenceId', 2, 128),
    licenseReferenceId: optStr(obj, 'licenseReferenceId', 2, 128),
    status: optEnum(obj, 'status', ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const),
    isAvailableForLeads: typeof obj.isAvailableForLeads === 'boolean' ? obj.isAvailableForLeads : undefined,
  };
}

export interface InviteBrokerageMemberInput {
  brokerageId: string;
  agentId: string;
  userUid: string;
  role: BrokerageRoleType;
  teamId?: string;
  permissions?: string[];
}

export function validateInviteMemberInput(raw: unknown): InviteBrokerageMemberInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    agentId: reqStr(obj, 'agentId', 3, 128),
    userUid: reqStr(obj, 'userUid', 2, 128),
    role: reqEnum(
      obj,
      'role',
      ['BROKERAGE_OWNER', 'BROKERAGE_ADMIN', 'BRANCH_MANAGER', 'SENIOR_AGENT', 'AGENT'] as const,
    ),
    teamId: optStr(obj, 'teamId', 3, 128),
    permissions: optStrArray(obj, 'permissions', 30),
  };
}

export interface TransitionMembershipInput {
  membershipId: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  role?: BrokerageRoleType;
  permissions?: string[];
  reason?: string;
  transferToBrokerageId?: string;
}

export function validateTransitionMembershipInput(raw: unknown): TransitionMembershipInput {
  const obj = asPlainObject(raw);
  return {
    membershipId: reqStr(obj, 'membershipId', 3, 128),
    status: reqEnum(obj, 'status', ['INVITED', 'ACTIVE', 'SUSPENDED', 'TERMINATED'] as const),
    role: optEnum(
      obj,
      'role',
      ['BROKERAGE_OWNER', 'BROKERAGE_ADMIN', 'BRANCH_MANAGER', 'SENIOR_AGENT', 'AGENT'] as const,
    ),
    permissions: optStrArray(obj, 'permissions', 30),
    reason: optStr(obj, 'reason', 2, 500),
    transferToBrokerageId: optStr(obj, 'transferToBrokerageId', 3, 128),
  };
}

export interface CreateTeamInput {
  brokerageId: string;
  name: string;
  leaderUid: string;
  memberUids?: string[];
  serviceNeighborhoodIds?: string[];
  permissions?: string[];
}

export function validateCreateTeamInput(raw: unknown): CreateTeamInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    name: reqStr(obj, 'name', 2, 160),
    leaderUid: reqStr(obj, 'leaderUid', 2, 128),
    memberUids: optStrArray(obj, 'memberUids', 50),
    serviceNeighborhoodIds: optStrArray(obj, 'serviceNeighborhoodIds', 50),
    permissions: optStrArray(obj, 'permissions', 30),
  };
}

export interface TransferTeamMemberInput {
  brokerageId: string;
  fromTeamId?: string;
  toTeamId: string;
  userUid: string;
}

export function validateTransferTeamMemberInput(raw: unknown): TransferTeamMemberInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    fromTeamId: optStr(obj, 'fromTeamId', 3, 128),
    toTeamId: reqStr(obj, 'toTeamId', 3, 128),
    userUid: reqStr(obj, 'userUid', 2, 128),
  };
}

export interface CreateClientInput {
  brokerageId: string;
  clientUserUid?: string;
  displayName: string;
  categories: string[];
  assignedAgentUid: string;
  teamId?: string;
  preferredNeighborhoodIds?: string[];
  preferredPropertyCategories?: string[];
  communicationChannelPreference?: string;
  ownedPropertyIds?: string[];
}

export function validateCreateClientInput(raw: unknown): CreateClientInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    clientUserUid: optStr(obj, 'clientUserUid', 2, 128),
    displayName: reqStr(obj, 'displayName', 2, 160),
    categories: optStrArray(obj, 'categories', 10) ?? ['BUYER'],
    assignedAgentUid: reqStr(obj, 'assignedAgentUid', 2, 128),
    teamId: optStr(obj, 'teamId', 3, 128),
    preferredNeighborhoodIds: optStrArray(obj, 'preferredNeighborhoodIds', 30),
    preferredPropertyCategories: optStrArray(obj, 'preferredPropertyCategories', 20),
    communicationChannelPreference: optStr(obj, 'communicationChannelPreference', 2, 64),
    ownedPropertyIds: optStrArray(obj, 'ownedPropertyIds', 30),
  };
}

export interface CreateLeadInput {
  brokerageId: string;
  source: string;
  category: string;
  propertyCategory?: string;
  neighborhoodId?: string;
  interestedPropertyId?: string;
  clientId?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export function validateCreateLeadInput(raw: unknown): CreateLeadInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    source: reqStr(obj, 'source', 2, 64),
    category: reqStr(obj, 'category', 2, 64),
    propertyCategory: optStr(obj, 'propertyCategory', 2, 64),
    neighborhoodId: optStr(obj, 'neighborhoodId', 2, 64),
    interestedPropertyId: optStr(obj, 'interestedPropertyId', 2, 128),
    clientId: optStr(obj, 'clientId', 3, 128),
    priority: optEnum(obj, 'priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const),
  };
}

export interface DistributeLeadInput {
  leadId: string;
  strategy: LeadDistributionStrategy;
  targetAgentUid?: string;
  targetTeamId?: string;
  allowReassign?: boolean;
  assignmentExpiresAtIso?: string;
  reason?: string;
}

export function validateDistributeLeadInput(raw: unknown): DistributeLeadInput {
  const obj = asPlainObject(raw);
  return {
    leadId: reqStr(obj, 'leadId', 3, 128),
    strategy: reqEnum(
      obj,
      'strategy',
      ['MANUAL', 'ROUND_ROBIN', 'WORKLOAD_AWARE', 'SERVICE_AREA_MATCH', 'PROPERTY_CATEGORY_MATCH'] as const,
    ),
    targetAgentUid: optStr(obj, 'targetAgentUid', 2, 128),
    targetTeamId: optStr(obj, 'targetTeamId', 3, 128),
    allowReassign: Boolean(obj.allowReassign),
    assignmentExpiresAtIso: optStr(obj, 'assignmentExpiresAtIso', 10, 64),
    reason: optStr(obj, 'reason', 2, 400),
  };
}

export interface UpdateLeadStatusInput {
  leadId: string;
  status: 'NEW' | 'UNASSIGNED' | 'ASSIGNED' | 'CONTACTED' | 'QUALIFIED' | 'NEGOTIATION' | 'CONVERTED' | 'CLOSED_LOST';
  conversionTransactionId?: string;
  conversionClientId?: string;
}

export function validateUpdateLeadStatusInput(raw: unknown): UpdateLeadStatusInput {
  const obj = asPlainObject(raw);
  return {
    leadId: reqStr(obj, 'leadId', 3, 128),
    status: reqEnum(
      obj,
      'status',
      ['NEW', 'UNASSIGNED', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'NEGOTIATION', 'CONVERTED', 'CLOSED_LOST'] as const,
    ),
    conversionTransactionId: optStr(obj, 'conversionTransactionId', 3, 128),
    conversionClientId: optStr(obj, 'conversionClientId', 3, 128),
  };
}

export interface CreateFollowUpTaskInput {
  brokerageId: string;
  leadId: string;
  assignedAgentUid: string;
  title: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueAtIso: string;
}

export function validateCreateFollowUpInput(raw: unknown): CreateFollowUpTaskInput {
  const obj = asPlainObject(raw);
  return {
    brokerageId: reqStr(obj, 'brokerageId', 3, 128),
    leadId: reqStr(obj, 'leadId', 3, 128),
    assignedAgentUid: reqStr(obj, 'assignedAgentUid', 2, 128),
    title: reqStr(obj, 'title', 2, 200),
    priority: optEnum(obj, 'priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const),
    dueAtIso: reqStr(obj, 'dueAtIso', 10, 64),
  };
}

export interface UpdateFollowUpTaskInput {
  taskId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  incrementContactAttempt?: boolean;
  outcome?: string;
  nextActionReference?: string;
}

export function validateUpdateFollowUpInput(raw: unknown): UpdateFollowUpTaskInput {
  const obj = asPlainObject(raw);
  return {
    taskId: reqStr(obj, 'taskId', 3, 128),
    status: reqEnum(obj, 'status', ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const),
    incrementContactAttempt: Boolean(obj.incrementContactAttempt),
    outcome: optStr(obj, 'outcome', 2, 500),
    nextActionReference: optStr(obj, 'nextActionReference', 2, 200),
  };
}
