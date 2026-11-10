/**
 * @file server/modules/brokerage/legacyOpsTypesAndValidation.ts
 * @description Types and validation helpers for brokerage operational workflows (Employee 57).
 */

import {
  CoreApiError,
  type AuditLoggerAdapter,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
  type IdempotencyStoreAdapter,
  type TransactionRunnerAdapter,
} from '../core';
import type { TransactionCurrency } from '../transactions';
import type { RepresentationType } from './types';

export interface BrokerageDependencies {
  txRunner: TransactionRunnerAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  auditSink?: AuditLoggerAdapter;
  primaryAdminEmails?: string[];
  notificationEmitter?: (event: Record<string, unknown>) => Promise<void> | void;
  telemetryEmitter?: (event: Record<string, unknown>) => void;
  idGenerator?: (prefix: string) => string;
  nowFn?: () => number;
}

export const ALL_REPRESENTATION_TYPES = [
  'SELLER_REPRESENTATION',
  'BUYER_REPRESENTATION',
  'LANDLORD_REPRESENTATION',
  'TENANT_REPRESENTATION',
  'DUAL_REPRESENTATION',
] as const;

export const ALL_BROKERAGE_AGREEMENT_TYPES = [
  'COMMISSION_AGREEMENT',
  'EXCLUSIVE_REPRESENTATION_AGREEMENT',
  'REFERRAL_FEE_AGREEMENT',
  'ADVISORY_RETAINER_AGREEMENT',
] as const;

export const ALL_COMMISSION_STRUCTURES = [
  'PERCENTAGE_OF_BASE',
  'FIXED_AMOUNT',
  'TIERED_BASIS_POINTS',
] as const;

export type RepresentationExclusivity = 'EXCLUSIVE' | 'NON_EXCLUSIVE';
export type BrokerageAgreementType = (typeof ALL_BROKERAGE_AGREEMENT_TYPES)[number];
export type BrokerageAgreementStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'EXECUTED' | 'AMENDED' | 'TERMINATED';
export type CommissionStructureType = (typeof ALL_COMMISSION_STRUCTURES)[number];
export type ViewingStatus = 'REQUESTED' | 'CONFIRMED' | 'RESCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type ReferralStatus = 'CREATED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';

export type CommissionAllocationShare = {
  recipientType: 'BROKERAGE' | 'AGENT' | 'TEAM_LEAD' | 'REFERRING_BROKERAGE';
  recipientUid: string;
  allocatedAmount: number;
};

export type BrokerageOrganizationRecord = {
  brokerageId: string;
  legalName?: string;
  displayName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  ownerUid: string;
  adminUids: string[];
  officeIds: string[];
  memberUids: string[];
  activeAgentUids: string[];
  verificationStatus: 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
  verificationEvidenceIds: string[];
  businessContactPhone?: string;
  businessContactEmail?: string;
  cityId: string;
  roundRobinCursor: number;
  version: number;
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BrokerageIndexRecord = {
  brokerageId: string;
  membershipIds: string[];
  teamIds: string[];
  clientIds: string[];
  leadIds: string[];
  followUpTaskIds: string[];
  representationIds: string[];
  acquisitionIds: string[];
  participationIds: string[];
  agreementIds: string[];
  commissionIds: string[];
  referralIds: string[];
  communicationIds: string[];
  viewingIds: string[];
  updatedAtIso: string;
};

export type AgentProfileRecord = {
  agentId: string;
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
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  membershipStatus?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  activeLeadCount: number;
  isAvailableForLeads: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BrokerageRoleType = 'BROKERAGE_OWNER' | 'BROKERAGE_ADMIN' | 'BRANCH_MANAGER' | 'SENIOR_AGENT' | 'AGENT';

export type BrokerageMembershipRecord = {
  membershipId: string;
  brokerageId: string;
  agentId: string;
  userUid: string;
  role: BrokerageRoleType;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  teamId?: string;
  permissions: string[];
  invitedByUid: string;
  approvedByUid?: string;
  history: Array<{
    fromStatus?: string;
    toStatus: string;
    role: BrokerageRoleType;
    actorUid: string;
    reason?: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BrokerageTeamRecord = {
  teamId: string;
  brokerageId: string;
  name: string;
  leaderUid: string;
  memberUids: string[];
  serviceNeighborhoodIds: string[];
  permissions: string[];
  roundRobinCursor: number;
  assignmentHistory: Array<{
    userUid: string;
    action: 'ADDED' | 'REMOVED' | 'TRANSFERRED_IN' | 'TRANSFERRED_OUT';
    actorUid: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BrokerageClientRecord = {
  clientId: string;
  brokerageId: string;
  clientUserUid?: string;
  displayName: string;
  categories: string[];
  relationshipStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  assignedAgentUid: string;
  teamId?: string;
  preferredNeighborhoodIds: string[];
  preferredPropertyCategories: string[];
  communicationChannelPreference: string;
  ownedPropertyIds: string[];
  createdAtIso: string;
  updatedAtIso: string;
};

export type LeadDistributionStrategy =
  | 'MANUAL'
  | 'ROUND_ROBIN'
  | 'WORKLOAD_AWARE'
  | 'SERVICE_AREA_MATCH'
  | 'PROPERTY_CATEGORY_MATCH';

export type BrokerageLeadRecord = {
  leadId: string;
  brokerageId: string;
  source: string;
  category: string;
  propertyCategory?: string;
  neighborhoodId?: string;
  interestedPropertyId?: string;
  clientId?: string;
  assignedAgentUid?: string;
  assignedTeamId?: string;
  status: 'NEW' | 'UNASSIGNED' | 'ASSIGNED' | 'CONTACTED' | 'QUALIFIED' | 'NEGOTIATION' | 'CONVERTED' | 'CLOSED_LOST';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assignmentExpiresAtIso?: string;
  conversionTransactionId?: string;
  conversionClientId?: string;
  firstContactedAtIso?: string;
  convertedAtIso?: string;
  assignmentHistory: Array<{
    fromAgentUid?: string;
    toAgentUid: string;
    teamId?: string;
    strategy: LeadDistributionStrategy;
    actorUid: string;
    reason?: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  lastActivityAtIso: string;
};

export type LeadFollowUpTaskRecord = {
  taskId: string;
  brokerageId: string;
  leadId: string;
  assignedAgentUid: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  dueAtIso: string;
  contactAttemptsCount: number;
  outcome?: string;
  nextActionReference?: string;
  completedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PropertyRepresentationRecord = {
  representationId: string;
  brokerageId: string;
  responsibleAgentUid: string;
  representationType: RepresentationType;
  exclusivity: RepresentationExclusivity;
  propertyId?: string;
  listingId?: string;
  clientId: string;
  principalUserUid: string;
  contractReferenceId?: string;
  startDateIso: string;
  expirationDateIso: string;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  createdAtIso: string;
  updatedAtIso: string;
};

export type ListingAcquisitionRecord = {
  acquisitionId: string;
  brokerageId: string;
  propertyId: string;
  listingId?: string;
  representationId: string;
  assignedAgentUid: string;
  ownerAuthorizationReferenceId: string;
  documentationIds: string[];
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  approvedByUid?: string;
  expirationDateIso: string;
  history: Array<{
    status: string;
    assignedAgentUid: string;
    actorUid: string;
    note?: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BrokerageTransactionParticipationRecord = {
  participationId: string;
  brokerageId: string;
  transactionId: string;
  representationId?: string;
  side: RepresentationType;
  assignedAgentUid: string;
  teamId?: string;
  status: 'ACTIVE' | 'REPLACED' | 'WITHDRAWN';
  history: Array<{
    action: string;
    agentUid: string;
    actorUid: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BrokerageAgreementRecord = {
  agreementId: string;
  brokerageId: string;
  clientId: string;
  agentUid: string;
  propertyId?: string;
  transactionId?: string;
  agreementType: BrokerageAgreementType;
  effectiveDateIso: string;
  expirationDateIso: string;
  serviceScope: string;
  commissionStructure: CommissionStructureType;
  commissionRateBasisPoints?: number;
  fixedCommissionAmount?: number;
  currency: TransactionCurrency;
  status: BrokerageAgreementStatus;
  contractDocumentIds: string[];
  executionDocumentIds: string[];
  versionNumber: number;
  amendments: Array<{
    versionNumber: number;
    previousServiceScope: string;
    previousCommissionRateBasisPoints?: number;
    previousFixedCommissionAmount?: number;
    reason: string;
    actorUid: string;
    amendedAtIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BrokerageCommissionRecord = {
  brokerageCommissionId: string;
  brokerageId: string;
  transactionId: string;
  agreementId: string;
  payerUid: string;
  currency: TransactionCurrency;
  structureType: CommissionStructureType;
  contractualBaseAmount: number;
  totalCommissionAmount: number;
  allocations: CommissionAllocationShare[];
  ledgerCommissionId?: string;
  ledgerObligationId?: string;
  ledgerPostingGroupId?: string;
  status: 'POSTED_TO_LEDGER' | 'REVERSED';
  adjustments: Array<{
    previousTotalAmount: number;
    newTotalAmount: number;
    reason: string;
    authorizedByUid: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BrokerageReferralRecord = {
  referralId: string;
  referringBrokerageId: string;
  receivingBrokerageId: string;
  referringAgentUid: string;
  receivingAgentUid: string;
  leadId?: string;
  clientId?: string;
  referralTermsSummary: string;
  referralBasisPoints?: number;
  fixedReferralAmount?: number;
  currency: TransactionCurrency;
  status: ReferralStatus;
  convertedTransactionId?: string;
  brokerageCommissionId?: string;
  expiresAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type ClientCommunicationEventRecord = {
  communicationId: string;
  brokerageId: string;
  clientId: string;
  leadId?: string;
  agentUid: string;
  eventType: 'CONTACT_ATTEMPT' | 'SCHEDULED_MEETING' | 'VIEWING_APPOINTMENT' | 'NEGOTIATION' | 'FOLLOW_UP_OUTCOME' | 'INTERNAL_NOTE';
  visibility: 'CLIENT_VISIBLE' | 'INTERNAL_PRIVATE';
  summary: string;
  createdAtIso: string;
};

export type PropertyViewingRecord = {
  viewingId: string;
  brokerageId: string;
  propertyId: string;
  listingId?: string;
  clientId: string;
  assignedAgentUid: string;
  startTimeIso: string;
  endTimeIso: string;
  status: ViewingStatus;
  feedbackSummary?: string;
  clientInterestRating?: number;
  history: Array<{
    status: ViewingStatus;
    startTimeIso: string;
    endTimeIso: string;
    actorUid: string;
    note?: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
};

export function asPlainObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Input payload must be a JSON object.');
  }
  return raw as Record<string, unknown>;
}

export function reqStr(obj: Record<string, unknown>, field: string, min = 1, max = 500): string {
  const val = obj[field];
  if (typeof val !== 'string' || val.trim().length < min || val.trim().length > max) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' must be a string (${min}-${max} chars).`);
  }
  return val.trim();
}

export function optStr(obj: Record<string, unknown>, field: string, min = 1, max = 500): string | undefined {
  const val = obj[field];
  if (val === undefined || val === null || val === '') return undefined;
  return reqStr(obj, field, min, max);
}

export function reqEnum<T extends string>(obj: Record<string, unknown>, field: string, allowed: readonly T[]): T {
  const val = obj[field];
  if (typeof val !== 'string' || !allowed.includes(val as T)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' must be one of: ${allowed.join(', ')}`);
  }
  return val as T;
}

export function optEnum<T extends string>(obj: Record<string, unknown>, field: string, allowed: readonly T[]): T | undefined {
  const val = obj[field];
  if (val === undefined || val === null) return undefined;
  return reqEnum(obj, field, allowed);
}

export function reqInt(obj: Record<string, unknown>, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const val = obj[field];
  if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < min || val > max) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' must be an integer between ${min} and ${max}.`);
  }
  return val;
}

export function optInt(obj: Record<string, unknown>, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const val = obj[field];
  if (val === undefined || val === null) return undefined;
  return reqInt(obj, field, min, max);
}

export function optStrArray(obj: Record<string, unknown>, field: string, maxItems = 50): string[] | undefined {
  const val = obj[field];
  if (val === undefined || val === null) return undefined;
  if (!Array.isArray(val) || val.length > maxItems || !val.every((x) => typeof x === 'string' && x.trim().length > 0)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' must be an array of non-empty strings.`);
  }
  return val.map((x) => (x as string).trim());
}

export function assertIsoTimestamp(iso: string, field: string): void {
  if (Number.isNaN(Date.parse(iso))) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Field '${field}' must be a valid ISO-8601 timestamp.`);
  }
}
