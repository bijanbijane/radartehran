/**
 * @file server/modules/brokerage/validation.ts
 * @description Input Validation and Invariant Guards for the Brokerage Module.
 */

import type {
  AgencyOrganizationType,
  AgencyOperatingStatus,
  InternalAgencyRole,
  RepresentationType,
  CommissionType,
  CommissionCalculationBasis,
  CommissionPayer,
  CredentialType,
  ScopeOfAuthority,
  CommissionAllocationRules,
} from './types';

export class BrokerageValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'BrokerageValidationError';
  }
}

export function sanitizeText(val: unknown, maxLen = 250): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

export function validateSafeId(id: unknown, fieldName = 'id'): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{2,64}$/.test(id.trim())) {
    throw new BrokerageValidationError('INVALID_ID', `Invalid identifier for ${fieldName}.`, fieldName);
  }
  return id.trim();
}

export function validateEmail(email: unknown, fieldName = 'email'): string {
  const sanitized = sanitizeText(email, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized)) {
    throw new BrokerageValidationError('INVALID_EMAIL', `Invalid email address format for ${fieldName}.`, fieldName);
  }
  return sanitized;
}

export function validatePhone(phone: unknown, fieldName = 'phone'): string {
  const sanitized = sanitizeText(phone, 32);
  if (!/^[+0-9\s-]{7,25}$/.test(sanitized)) {
    throw new BrokerageValidationError('INVALID_PHONE', `Invalid phone number format for ${fieldName}.`, fieldName);
  }
  return sanitized;
}

const VALID_ORG_TYPES: Set<AgencyOrganizationType> = new Set([
  'independent_brokerage',
  'real_estate_office',
  'multi_branch_agency',
  'consulting_company',
  'property_management_agency',
]);

export function validateOrgType(type: unknown): AgencyOrganizationType {
  if (typeof type !== 'string' || !VALID_ORG_TYPES.has(type as AgencyOrganizationType)) {
    throw new BrokerageValidationError('INVALID_ORG_TYPE', 'Invalid agency organization type.', 'organizationType');
  }
  return type as AgencyOrganizationType;
}

const VALID_ROLES: Set<InternalAgencyRole> = new Set([
  'agency_owner',
  'agency_director',
  'general_manager',
  'branch_manager',
  'senior_consultant',
  'real_estate_consultant',
  'listing_coordinator',
  'operations_employee',
  'administrative_employee',
]);

export function validateInternalRole(role: unknown): InternalAgencyRole {
  if (typeof role !== 'string' || !VALID_ROLES.has(role as InternalAgencyRole)) {
    throw new BrokerageValidationError('INVALID_ROLE', 'Invalid internal agency role.', 'role');
  }
  return role as InternalAgencyRole;
}

const VALID_REPRESENTATION_TYPES: Set<RepresentationType> = new Set([
  'sale_representation',
  'rental_representation',
  'commercial_representation',
  'land_representation',
  'property_management_authority',
  'exclusive_sale_representation',
  'exclusive_rental_representation',
]);

export function validateRepresentationType(type: unknown): RepresentationType {
  if (typeof type !== 'string' || !VALID_REPRESENTATION_TYPES.has(type as RepresentationType)) {
    throw new BrokerageValidationError('INVALID_REPRESENTATION_TYPE', 'Invalid representation type.', 'representationType');
  }
  return type as RepresentationType;
}

const VALID_COMMISSION_TYPES: Set<CommissionType> = new Set([
  'fixed_amount',
  'percentage_of_transaction_value',
  'agency_agent_revenue_share',
  'referral_agreement',
  'tiered_split',
]);

export function validateCommissionType(type: unknown): CommissionType {
  if (typeof type !== 'string' || !VALID_COMMISSION_TYPES.has(type as CommissionType)) {
    throw new BrokerageValidationError('INVALID_COMMISSION_TYPE', 'Invalid commission type.', 'commissionType');
  }
  return type as CommissionType;
}

const VALID_BASES: Set<CommissionCalculationBasis> = new Set([
  'confirmed_transaction_value',
  'fixed_fee',
  'first_month_rent',
  'total_lease_value',
]);

export function validateCalculationBasis(basis: unknown): CommissionCalculationBasis {
  if (typeof basis !== 'string' || !VALID_BASES.has(basis as CommissionCalculationBasis)) {
    throw new BrokerageValidationError('INVALID_CALCULATION_BASIS', 'Invalid commission calculation basis.', 'calculationBasis');
  }
  return basis as CommissionCalculationBasis;
}

export function validateCommissionAllocation(rules: CommissionAllocationRules): CommissionAllocationRules {
  if (!rules || typeof rules !== 'object') {
    throw new BrokerageValidationError('INVALID_ALLOCATION', 'Allocation rules must be provided.', 'allocationRules');
  }
  const agency = Number(rules.agencySharePercentage);
  const agent = Number(rules.agentSharePercentage);
  const referral = Number(rules.referralSharePercentage || 0);

  if (Number.isNaN(agency) || agency < 0 || agency > 100) {
    throw new BrokerageValidationError('INVALID_ALLOCATION', 'Agency share percentage must be between 0 and 100.', 'agencySharePercentage');
  }
  if (Number.isNaN(agent) || agent < 0 || agent > 100) {
    throw new BrokerageValidationError('INVALID_ALLOCATION', 'Agent share percentage must be between 0 and 100.', 'agentSharePercentage');
  }
  if (Number.isNaN(referral) || referral < 0 || referral > 100) {
    throw new BrokerageValidationError('INVALID_ALLOCATION', 'Referral share percentage must be between 0 and 100.', 'referralSharePercentage');
  }
  if (agency + agent + referral > 100.01) {
    throw new BrokerageValidationError('INVALID_ALLOCATION', 'Total allocation share cannot exceed 100%.', 'allocationRules');
  }

  return {
    agencySharePercentage: agency,
    agentSharePercentage: agent,
    referralSharePercentage: referral,
    brokerageBonusPercentage: Number(rules.brokerageBonusPercentage || 0),
  };
}

export function validateDateRange(startIso: unknown, endIso: unknown): { start: string; end: string } {
  if (typeof startIso !== 'string' || Number.isNaN(Date.parse(startIso))) {
    throw new BrokerageValidationError('INVALID_DATE', 'Invalid start date format (ISO required).', 'startDateIso');
  }
  if (typeof endIso !== 'string' || Number.isNaN(Date.parse(endIso))) {
    throw new BrokerageValidationError('INVALID_DATE', 'Invalid end/expiration date format (ISO required).', 'expirationDateIso');
  }
  if (Date.parse(endIso) <= Date.parse(startIso)) {
    throw new BrokerageValidationError('INVALID_DATE_RANGE', 'Expiration date must be strictly after start date.', 'expirationDateIso');
  }
  return { start: startIso, end: endIso };
}

import { CoreApiError } from '../core';
import type {
  AgentProfileStatus,
  BrokerageClientCategory,
  BrokerageLeadCategory,
  BrokerageLeadSource,
  BrokerageLeadStatus,
  BrokerageMembershipStatus,
  BrokerageOrganizationStatus,
  BrokerageRole,
  BrokerageVerificationStatus,
  LeadDistributionStrategy,
  LeadFollowUpPriority,
  LeadFollowUpTaskStatus,
} from './types';

export function asPlainObject(raw: unknown, label = 'payload'): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${label} must be a non-null JSON object.`);
  }
  return raw as Record<string, unknown>;
}

function resolveField(target: unknown, field: string): unknown {
  if (target && typeof target === 'object' && !Array.isArray(target)) {
    return (target as Record<string, unknown>)[field];
  }
  return target;
}

export function reqStr(target: unknown, field: string, minOrMax = 200, maxOpt?: number): string {
  const val = resolveField(target, field);
  const minLen = maxOpt !== undefined ? minOrMax : 1;
  const maxLen = maxOpt !== undefined ? maxOpt : minOrMax;
  if (typeof val !== 'string' || val.trim().length < minLen) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' is required (min ${minLen} chars).`);
  }
  const t = val.trim();
  if (t.length > maxLen) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' exceeds ${maxLen} characters.`);
  }
  return t;
}

export function optStr(target: unknown, field: string, minOrMax = 200, maxOpt?: number): string | undefined {
  const val = resolveField(target, field);
  if (val === undefined || val === null || val === '') return undefined;
  return reqStr(val, field, minOrMax, maxOpt);
}

export function optStrArray(target: unknown, field: string, maxItems = 50, maxItemLen = 128): string[] | undefined {
  const val = resolveField(target, field);
  if (val === undefined || val === null) return undefined;
  if (!Array.isArray(val) || val.length > maxItems) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' must be an array of at most ${maxItems} strings.`);
  }
  return val.map((item, idx) => reqStr(item, `${field}[${idx}]`, 1, maxItemLen));
}

export function assertIsoTimestamp(val: unknown, field = 'timestamp'): string {
  if (typeof val !== 'string' || Number.isNaN(Date.parse(val))) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' must be a valid ISO-8601 timestamp.`);
  }
  return val;
}

export function reqIso(target: unknown, field: string): string {
  const s = reqStr(target, field, 1, 64);
  return assertIsoTimestamp(s, field);
}

export function optIso(target: unknown, field: string): string | undefined {
  const val = resolveField(target, field);
  if (val === undefined || val === null) return undefined;
  return reqIso(val, field);
}

export function reqInt(target: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const val = resolveField(target, field);
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' must be an integer between ${min} and ${max}.`);
  }
  return n;
}

export function optInt(target: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const val = resolveField(target, field);
  if (val === undefined || val === null) return undefined;
  return reqInt(val, field, min, max);
}

export function reqEnum<T extends string>(target: unknown, field: string, allowed: readonly T[]): T {
  const s = reqStr(target, field, 1, 80);
  if (!allowed.includes(s as T)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' must be one of: ${allowed.join(', ')}.`);
  }
  return s as T;
}

export function optEnum<T extends string>(
  target: unknown,
  field: string,
  allowed: readonly T[]
): T | undefined {
  const val = resolveField(target, field);
  if (val === undefined || val === null) return undefined;
  return reqEnum(val, field, allowed);
}

export interface CreateBrokerageOrganizationInput {
  legalName: string;
  displayName: string;
  businessContactPhone: string;
  businessContactEmail?: string;
  cityId: string;
  adminUids?: string[];
  officeIds?: string[];
  verificationEvidenceIds?: string[];
}

export interface UpdateBrokerageOrganizationInput {
  brokerageId: string;
  displayName?: string;
  status?: BrokerageOrganizationStatus;
  adminUids?: string[];
  officeIds?: string[];
  verificationStatus?: BrokerageVerificationStatus;
  verificationEvidenceIds?: string[];
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
  status?: AgentProfileStatus;
  isAvailableForLeads?: boolean;
}

export interface InviteBrokerageMemberInput {
  brokerageId: string;
  agentId: string;
  userUid: string;
  role: BrokerageRole;
  teamId?: string;
  permissions?: string[];
}

export interface TransitionMembershipInput {
  membershipId: string;
  status: BrokerageMembershipStatus;
  role?: BrokerageRole;
  permissions?: string[];
  reason?: string;
  transferToBrokerageId?: string;
}

export interface CreateTeamInput {
  brokerageId: string;
  name: string;
  leaderUid: string;
  memberUids?: string[];
  serviceNeighborhoodIds?: string[];
  permissions?: string[];
}

export interface TransferTeamMemberInput {
  brokerageId: string;
  userUid: string;
  fromTeamId?: string;
  toTeamId: string;
}

export interface CreateClientInput {
  brokerageId: string;
  clientUserUid?: string;
  displayName: string;
  categories: BrokerageClientCategory[];
  assignedAgentUid: string;
  teamId?: string;
  preferredNeighborhoodIds?: string[];
  preferredPropertyCategories?: string[];
  communicationChannelPreference?: string;
  ownedPropertyIds?: string[];
}

export interface CreateLeadInput {
  brokerageId: string;
  source: BrokerageLeadSource;
  category: BrokerageLeadCategory;
  propertyCategory?: string;
  neighborhoodId?: string;
  interestedPropertyId?: string;
  clientId?: string;
  priority?: LeadFollowUpPriority;
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

export interface UpdateLeadStatusInput {
  leadId: string;
  status: BrokerageLeadStatus;
  conversionTransactionId?: string;
  conversionClientId?: string;
}

export interface CreateFollowUpTaskInput {
  brokerageId: string;
  leadId: string;
  assignedAgentUid: string;
  title: string;
  priority?: LeadFollowUpPriority;
  dueAtIso: string;
}

export interface UpdateFollowUpTaskInput {
  taskId: string;
  status: LeadFollowUpTaskStatus;
  incrementContactAttempt?: boolean;
  outcome?: string;
  nextActionReference?: string;
}

export function validateCreateBrokerageInput(raw: unknown): CreateBrokerageOrganizationInput {
  const obj = asPlainObject(raw, 'CreateBrokerageOrganizationInput');
  const displayName = reqStr(obj.displayName, 'displayName', 120);
  return {
    legalName: optStr(obj.legalName, 'legalName', 160) ?? displayName,
    displayName,
    businessContactPhone: optStr(obj.businessContactPhone, 'businessContactPhone', 32) ?? '+982100000000',
    businessContactEmail: optStr(obj.businessContactEmail, 'businessContactEmail', 120),
    cityId: reqStr(obj.cityId, 'cityId', 40),
    adminUids: optStrArray(obj.adminUids, 'adminUids', 20),
    officeIds: optStrArray(obj.officeIds, 'officeIds', 20),
    verificationEvidenceIds: optStrArray(obj.verificationEvidenceIds, 'verificationEvidenceIds', 20),
  };
}

export function validateUpdateBrokerageInput(raw: unknown): UpdateBrokerageOrganizationInput {
  const obj = asPlainObject(raw, 'UpdateBrokerageOrganizationInput');
  return {
    brokerageId: reqStr(obj.brokerageId, 'brokerageId', 80),
    displayName: optStr(obj.displayName, 'displayName', 120),
    status: optEnum(obj.status, 'status', ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const),
    adminUids: optStrArray(obj.adminUids, 'adminUids', 20),
    officeIds: optStrArray(obj.officeIds, 'officeIds', 20),
    verificationStatus: optEnum(obj.verificationStatus, 'verificationStatus', [
      'UNVERIFIED',
      'PENDING_REVIEW',
      'VERIFIED',
      'REJECTED',
    ] as const),
    verificationEvidenceIds: optStrArray(obj.verificationEvidenceIds, 'verificationEvidenceIds', 20),
  };
}

export function validateUpsertAgentProfileInput(raw: unknown): UpsertAgentProfileInput {
  const obj = asPlainObject(raw, 'UpsertAgentProfileInput');
  const years = Number(obj.yearsOfExperience);
  if (!Number.isInteger(years) || years < 0 || years > 80) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'yearsOfExperience must be an integer between 0 and 80.');
  }
  return {
    userUid: reqStr(obj.userUid, 'userUid', 80),
    brokerageId: optStr(obj.brokerageId, 'brokerageId', 80),
    displayName: reqStr(obj.displayName, 'displayName', 120),
    bioSummary: optStr(obj.bioSummary, 'bioSummary', 1000),
    yearsOfExperience: years,
    serviceNeighborhoodIds: optStrArray(obj.serviceNeighborhoodIds, 'serviceNeighborhoodIds', 50) ?? [],
    propertyCategories: optStrArray(obj.propertyCategories, 'propertyCategories', 20) ?? [],
    transactionCategories: optStrArray(obj.transactionCategories, 'transactionCategories', 20) ?? [],
    verificationReferenceId: optStr(obj.verificationReferenceId, 'verificationReferenceId', 80),
    licenseReferenceId: optStr(obj.licenseReferenceId, 'licenseReferenceId', 80),
    status: optEnum(obj.status, 'status', ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const),
    isAvailableForLeads: typeof obj.isAvailableForLeads === 'boolean' ? obj.isAvailableForLeads : undefined,
  };
}

const ROLES: readonly BrokerageRole[] = [
  'BROKERAGE_OWNER',
  'BROKERAGE_ADMIN',
  'BRANCH_MANAGER',
  'TEAM_LEAD',
  'SENIOR_AGENT',
  'AGENT',
  'COORDINATOR',
];

export function validateInviteMemberInput(raw: unknown): InviteBrokerageMemberInput {
  const obj = asPlainObject(raw, 'InviteBrokerageMemberInput');
  return {
    brokerageId: reqStr(obj.brokerageId, 'brokerageId', 80),
    agentId: reqStr(obj.agentId, 'agentId', 80),
    userUid: reqStr(obj.userUid, 'userUid', 80),
    role: reqEnum(obj.role, 'role', ROLES),
    teamId: optStr(obj.teamId, 'teamId', 80),
    permissions: optStrArray(obj.permissions, 'permissions', 30),
  };
}

export function validateTransitionMembershipInput(raw: unknown): TransitionMembershipInput {
  const obj = asPlainObject(raw, 'TransitionMembershipInput');
  return {
    membershipId: reqStr(obj.membershipId, 'membershipId', 80),
    status: reqEnum(obj.status, 'status', [
      'INVITED',
      'PENDING_APPROVAL',
      'ACTIVE',
      'SUSPENDED',
      'TERMINATED',
    ] as const),
    role: optEnum(obj.role, 'role', ROLES),
    permissions: optStrArray(obj.permissions, 'permissions', 30),
    reason: optStr(obj.reason, 'reason', 500),
    transferToBrokerageId: optStr(obj.transferToBrokerageId, 'transferToBrokerageId', 80),
  };
}

export function validateCreateTeamInput(raw: unknown): CreateTeamInput {
  const obj = asPlainObject(raw, 'CreateTeamInput');
  return {
    brokerageId: reqStr(obj.brokerageId, 'brokerageId', 80),
    name: reqStr(obj.name, 'name', 120),
    leaderUid: reqStr(obj.leaderUid, 'leaderUid', 80),
    memberUids: optStrArray(obj.memberUids, 'memberUids', 50),
    serviceNeighborhoodIds: optStrArray(obj.serviceNeighborhoodIds, 'serviceNeighborhoodIds', 50),
    permissions: optStrArray(obj.permissions, 'permissions', 30),
  };
}

export function validateTransferTeamMemberInput(raw: unknown): TransferTeamMemberInput {
  const obj = asPlainObject(raw, 'TransferTeamMemberInput');
  return {
    brokerageId: reqStr(obj.brokerageId, 'brokerageId', 80),
    userUid: reqStr(obj.userUid, 'userUid', 80),
    fromTeamId: optStr(obj.fromTeamId, 'fromTeamId', 80),
    toTeamId: reqStr(obj.toTeamId, 'toTeamId', 80),
  };
}

export function validateCreateClientInput(raw: unknown): CreateClientInput {
  const obj = asPlainObject(raw, 'CreateClientInput');
  const cats = optStrArray(obj.categories, 'categories', 10) ?? [];
  if (cats.length === 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'categories must contain at least one client category.');
  }
  return {
    brokerageId: reqStr(obj.brokerageId, 'brokerageId', 80),
    clientUserUid: optStr(obj.clientUserUid, 'clientUserUid', 80),
    displayName: reqStr(obj.displayName, 'displayName', 120),
    categories: cats.map((c) =>
      reqEnum(c, 'categories[]', ['BUYER', 'SELLER', 'TENANT', 'LANDLORD', 'INVESTOR'] as const)
    ),
    assignedAgentUid: reqStr(obj.assignedAgentUid, 'assignedAgentUid', 80),
    teamId: optStr(obj.teamId, 'teamId', 80),
    preferredNeighborhoodIds: optStrArray(obj.preferredNeighborhoodIds, 'preferredNeighborhoodIds', 30),
    preferredPropertyCategories: optStrArray(obj.preferredPropertyCategories, 'preferredPropertyCategories', 20),
    communicationChannelPreference: optStr(obj.communicationChannelPreference, 'communicationChannelPreference', 40),
    ownedPropertyIds: optStrArray(obj.ownedPropertyIds, 'ownedPropertyIds', 30),
  };
}

export function validateCreateLeadInput(raw: unknown): CreateLeadInput {
  const obj = asPlainObject(raw, 'CreateLeadInput');
  return {
    brokerageId: reqStr(obj.brokerageId, 'brokerageId', 80),
    source: reqEnum(obj.source, 'source', [
      'WEBSITE',
      'PROPERTY_LISTING_INQUIRY',
      'DIRECT_PORTAL',
      'BARGAIN_LISTING',
      'REFERRAL',
      'WALK_IN',
      'PHONE_CALL',
      'CAMPAIGN',
    ] as const),
    category: reqEnum(obj.category, 'category', [
      'BUYER',
      'SELLER',
      'TENANT',
      'LANDLORD',
      'INVESTOR',
      'BUY_INQUIRY',
      'SELL_INQUIRY',
      'RENT_INQUIRY',
      'LEASE_INQUIRY',
      'VALUATION_INQUIRY',
    ] as const),
    propertyCategory: optStr(obj.propertyCategory, 'propertyCategory', 60),
    neighborhoodId: optStr(obj.neighborhoodId, 'neighborhoodId', 60),
    interestedPropertyId: optStr(obj.interestedPropertyId, 'interestedPropertyId', 80),
    clientId: optStr(obj.clientId, 'clientId', 80),
    priority: optEnum(obj.priority, 'priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const),
  };
}

export function validateDistributeLeadInput(raw: unknown): DistributeLeadInput {
  const obj = asPlainObject(raw, 'DistributeLeadInput');
  return {
    leadId: reqStr(obj.leadId, 'leadId', 80),
    strategy: reqEnum(obj.strategy, 'strategy', [
      'MANUAL',
      'ROUND_ROBIN',
      'WORKLOAD_AWARE',
      'SERVICE_AREA_MATCH',
      'PROPERTY_CATEGORY_MATCH',
    ] as const),
    targetAgentUid: optStr(obj.targetAgentUid, 'targetAgentUid', 80),
    targetTeamId: optStr(obj.targetTeamId, 'targetTeamId', 80),
    allowReassign: typeof obj.allowReassign === 'boolean' ? obj.allowReassign : undefined,
    assignmentExpiresAtIso: optIso(obj.assignmentExpiresAtIso, 'assignmentExpiresAtIso'),
    reason: optStr(obj.reason, 'reason', 300),
  };
}

export function validateUpdateLeadStatusInput(raw: unknown): UpdateLeadStatusInput {
  const obj = asPlainObject(raw, 'UpdateLeadStatusInput');
  return {
    leadId: reqStr(obj.leadId, 'leadId', 80),
    status: reqEnum(obj.status, 'status', [
      'NEW',
      'UNASSIGNED',
      'ASSIGNED',
      'CONTACTED',
      'QUALIFIED',
      'VIEWING_SCHEDULED',
      'NEGOTIATION',
      'CONVERTED',
      'LOST',
      'ARCHIVED',
    ] as const),
    conversionTransactionId: optStr(obj.conversionTransactionId, 'conversionTransactionId', 80),
    conversionClientId: optStr(obj.conversionClientId, 'conversionClientId', 80),
  };
}

export function validateCreateFollowUpTaskInput(raw: unknown): CreateFollowUpTaskInput {
  const obj = asPlainObject(raw, 'CreateFollowUpTaskInput');
  return {
    brokerageId: reqStr(obj.brokerageId, 'brokerageId', 80),
    leadId: reqStr(obj.leadId, 'leadId', 80),
    assignedAgentUid: reqStr(obj.assignedAgentUid, 'assignedAgentUid', 80),
    title: reqStr(obj.title, 'title', 200),
    priority: optEnum(obj.priority, 'priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const),
    dueAtIso: reqIso(obj.dueAtIso, 'dueAtIso'),
  };
}

export function validateUpdateFollowUpTaskInput(raw: unknown): UpdateFollowUpTaskInput {
  const obj = asPlainObject(raw, 'UpdateFollowUpTaskInput');
  return {
    taskId: reqStr(obj.taskId, 'taskId', 80),
    status: reqEnum(obj.status, 'status', [
      'PENDING',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'OVERDUE',
    ] as const),
    incrementContactAttempt:
      typeof obj.incrementContactAttempt === 'boolean' ? obj.incrementContactAttempt : undefined,
    outcome: optStr(obj.outcome, 'outcome', 500),
    nextActionReference: optStr(obj.nextActionReference, 'nextActionReference', 200),
  };
}

export {
  validateUpsertAgentProfileInput as validateUpsertAgentInput,
  validateCreateFollowUpTaskInput as validateCreateFollowUpInput,
  validateUpdateFollowUpTaskInput as validateUpdateFollowUpInput,
};
