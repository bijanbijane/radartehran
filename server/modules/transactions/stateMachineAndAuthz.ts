import { CoreApiError } from '../core';
import type {
  AdminTransactionView,
  MilestoneType,
  ParticipantRole,
  ParticipantTransactionView,
  StoredTransactionDocument,
  TransactionMilestoneRecord,
  TransactionParticipantRecord,
  TransactionStatus,
  TransactionType,
} from './types';

export const ALLOWED_ROLES_BY_TX_TYPE: Readonly<Record<TransactionType, readonly ParticipantRole[]>> = {
  SALE: ['BUYER', 'SELLER', 'BROKER', 'AUTHORIZED_REPRESENTATIVE'],
  RENTAL: ['LANDLORD', 'TENANT', 'BROKER', 'PROPERTY_MANAGER', 'AUTHORIZED_REPRESENTATIVE'],
};

export const ROLE_DEFAULT_PERMISSIONS: Readonly<Record<ParticipantRole, readonly string[]>> = {
  SELLER: [
    'transaction:read',
    'participant:invite',
    'offer:submit',
    'offer:decide',
    'negotiation:participate',
    'contract:manage',
    'milestone:update',
    'closing:confirm',
    'transaction:cancel',
    'dispute:initiate',
  ],
  BUYER: [
    'transaction:read',
    'participant:invite',
    'offer:submit',
    'offer:decide',
    'negotiation:participate',
    'contract:manage',
    'milestone:update',
    'closing:confirm',
    'transaction:cancel',
    'dispute:initiate',
  ],
  LANDLORD: [
    'transaction:read',
    'participant:invite',
    'offer:submit',
    'offer:decide',
    'negotiation:participate',
    'contract:manage',
    'milestone:update',
    'closing:confirm',
    'transaction:cancel',
    'dispute:initiate',
  ],
  TENANT: [
    'transaction:read',
    'participant:invite',
    'offer:submit',
    'offer:decide',
    'negotiation:participate',
    'contract:manage',
    'milestone:update',
    'closing:confirm',
    'transaction:cancel',
    'dispute:initiate',
  ],
  BROKER: [
    'transaction:read',
    'participant:invite',
    'negotiation:participate',
    'contract:manage',
    'milestone:update',
    'closing:confirm',
  ],
  PROPERTY_MANAGER: [
    'transaction:read',
    'participant:invite',
    'negotiation:participate',
    'milestone:update',
    'closing:confirm',
  ],
  AUTHORIZED_REPRESENTATIVE: [
    'transaction:read',
    'offer:submit',
    'offer:decide',
    'negotiation:participate',
    'contract:manage',
    'milestone:update',
    'closing:confirm',
    'dispute:initiate',
  ],
};

export const DEFAULT_MILESTONES_BY_TX_TYPE: Readonly<
  Record<TransactionType, ReadonlyArray<{ type: MilestoneType; required: boolean }>>
> = {
  SALE: [
    { type: 'OFFER_ACCEPTED', required: true },
    { type: 'DOCUMENTS_REQUESTED', required: false },
    { type: 'DOCUMENTS_VERIFIED', required: true },
    { type: 'CONTRACT_PREPARED', required: true },
    { type: 'CONTRACT_SIGNED', required: true },
    { type: 'DEPOSIT_CONFIRMED', required: true },
    { type: 'INSPECTION_COMPLETED', required: false },
    { type: 'CLOSING_SCHEDULED', required: false },
    { type: 'SETTLEMENT_CONFIRMED', required: true },
    { type: 'PROPERTY_HANDOVER', required: true },
    { type: 'TRANSACTION_COMPLETED', required: true },
  ],
  RENTAL: [
    { type: 'OFFER_ACCEPTED', required: true },
    { type: 'DOCUMENTS_VERIFIED', required: true },
    { type: 'CONTRACT_PREPARED', required: true },
    { type: 'CONTRACT_SIGNED', required: true },
    { type: 'DEPOSIT_CONFIRMED', required: true },
    { type: 'PROPERTY_HANDOVER', required: true },
    { type: 'TRANSACTION_COMPLETED', required: true },
  ],
};

export function buildDefaultMilestones(
  transactionId: string,
  transactionType: TransactionType,
  initiatorUid: string,
  nowIso: string,
): TransactionMilestoneRecord[] {
  const templates = DEFAULT_MILESTONES_BY_TX_TYPE[transactionType];
  return templates.map((tpl, idx) => ({
    milestoneId: `ms_${transactionId}_${tpl.type.toLowerCase()}`,
    transactionId,
    milestoneType: tpl.type,
    required: tpl.required,
    status: 'PENDING',
    responsibleUid: initiatorUid,
    auditReferenceId: `aud_ms_init_${idx + 1}`,
    updatedAtIso: nowIso,
  }));
}

export const ALLOWED_STATE_TRANSITIONS: Readonly<Record<TransactionStatus, readonly TransactionStatus[]>> = {
  DRAFT: ['OPEN', 'CANCELLED', 'EXPIRED'],
  OPEN: ['OFFER_PENDING', 'NEGOTIATION', 'CANCELLED', 'EXPIRED', 'DISPUTED'],
  OFFER_PENDING: ['NEGOTIATION', 'AGREEMENT_PENDING', 'OPEN', 'CANCELLED', 'EXPIRED', 'DISPUTED'],
  NEGOTIATION: ['OFFER_PENDING', 'AGREEMENT_PENDING', 'OPEN', 'CANCELLED', 'EXPIRED', 'DISPUTED'],
  AGREEMENT_PENDING: ['CONTRACT_PENDING', 'NEGOTIATION', 'CANCELLED', 'EXPIRED', 'DISPUTED'],
  CONTRACT_PENDING: ['CONTRACT_SIGNED', 'AGREEMENT_PENDING', 'CANCELLED', 'EXPIRED', 'DISPUTED'],
  CONTRACT_SIGNED: ['CLOSING', 'CANCELLED', 'DISPUTED'],
  CLOSING: ['COMPLETED', 'CANCELLED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: [],
  EXPIRED: [],
  DISPUTED: ['OPEN', 'NEGOTIATION', 'AGREEMENT_PENDING', 'CONTRACT_PENDING', 'CONTRACT_SIGNED', 'CLOSING', 'CANCELLED'],
};

const WORKFLOW_GATED_STATES: ReadonlySet<TransactionStatus> = new Set([
  'AGREEMENT_PENDING',
  'CONTRACT_SIGNED',
  'COMPLETED',
]);

export function assertExpectedTransactionVersion(
  actualVersion: number,
  expectedVersion: number,
  operation: string,
): void {
  if (actualVersion !== expectedVersion) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Version conflict in ${operation}: expected version ${expectedVersion}, actual is ${actualVersion}.`,
    );
  }
}

export function assertTransactionNotSuspended(
  txDoc: StoredTransactionDocument,
  isAdmin: boolean,
): void {
  if (txDoc.suspendedByAdmin && !isAdmin) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      `Transaction "${txDoc.id}" is currently suspended by administrative control.`,
    );
  }
}

export function validateTransactionStateTransition(params: {
  txDoc: StoredTransactionDocument;
  targetStatus: TransactionStatus;
  actorRole: ParticipantRole | 'ADMIN' | 'SYSTEM';
  viaWorkflowEngine?: boolean;
  contractExecuted?: boolean;
  closingVerified?: boolean;
}): { allowed: boolean; reason?: string } {
  const { txDoc, targetStatus, actorRole, viaWorkflowEngine = false } = params;
  const currentStatus = txDoc.status;

  if (currentStatus === targetStatus) {
    return { allowed: false, reason: `Transaction is already in state "${currentStatus}".` };
  }

  if (txDoc.suspendedByAdmin && actorRole !== 'ADMIN') {
    return { allowed: false, reason: 'Transaction operations are suspended by an administrator.' };
  }

  if (currentStatus === 'CANCELLED' || currentStatus === 'EXPIRED') {
    return { allowed: false, reason: `Terminal transaction state "${currentStatus}" cannot be reopened or transitioned.` };
  }

  if (currentStatus === 'DISPUTED' && actorRole !== 'ADMIN') {
    return { allowed: false, reason: 'Only an authorized administrator can transition a transaction out of DISPUTED state.' };
  }

  const allowedTargets = ALLOWED_STATE_TRANSITIONS[currentStatus] ?? [];
  if (!allowedTargets.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Transition from "${currentStatus}" to "${targetStatus}" is not permitted by the transaction state machine.`,
    };
  }

  if (!viaWorkflowEngine && WORKFLOW_GATED_STATES.has(targetStatus) && actorRole !== 'ADMIN') {
    return {
      allowed: false,
      reason: `State "${targetStatus}" cannot be set directly; it requires completing the designated domain workflow.`,
    };
  }

  if (targetStatus === 'AGREEMENT_PENDING' && !txDoc.acceptedOfferId) {
    return { allowed: false, reason: 'Cannot transition to AGREEMENT_PENDING without an accepted offer.' };
  }

  if (targetStatus === 'CONTRACT_PENDING' && !txDoc.acceptedOfferId) {
    return { allowed: false, reason: 'Cannot transition to CONTRACT_PENDING without an accepted offer.' };
  }

  if (targetStatus === 'CONTRACT_SIGNED' && (!txDoc.activeContractId || !params.contractExecuted)) {
    return { allowed: false, reason: 'Cannot transition to CONTRACT_SIGNED without an executed contract reference.' };
  }

  if (targetStatus === 'CLOSING' && currentStatus !== 'CONTRACT_SIGNED' && currentStatus !== 'DISPUTED') {
    return { allowed: false, reason: 'Closing requires a signed contract.' };
  }

  if (targetStatus === 'COMPLETED' && !params.closingVerified) {
    return {
      allowed: false,
      reason: 'Cannot transition to COMPLETED until closing checklist, required milestones, and party confirmations are verified.',
    };
  }

  return { allowed: true };
}

export function isPrincipalPartyCounterpart(
  txType: TransactionType,
  offerAuthorRole: ParticipantRole,
  deciderRole: ParticipantRole,
): boolean {
  if (txType === 'SALE') {
    if (offerAuthorRole === 'BUYER') return deciderRole === 'SELLER' || deciderRole === 'AUTHORIZED_REPRESENTATIVE';
    if (offerAuthorRole === 'SELLER') return deciderRole === 'BUYER' || deciderRole === 'AUTHORIZED_REPRESENTATIVE';
    return deciderRole === 'BUYER' || deciderRole === 'SELLER';
  }
  if (offerAuthorRole === 'TENANT') return deciderRole === 'LANDLORD' || deciderRole === 'AUTHORIZED_REPRESENTATIVE';
  if (offerAuthorRole === 'LANDLORD') return deciderRole === 'TENANT' || deciderRole === 'AUTHORIZED_REPRESENTATIVE';
  return deciderRole === 'LANDLORD' || deciderRole === 'TENANT';
}

export function verifyParticipantPermission(
  participants: readonly TransactionParticipantRecord[],
  actorUid: string,
  requiredPermission: string,
): TransactionParticipantRecord {
  const record = participants.find((p) => p.userId === actorUid);
  if (!record || record.status !== 'ACTIVE') {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      'Access denied: principal is not an active participant in this transaction.',
    );
  }
  if (!record.permissions.includes(requiredPermission)) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      `Participant role "${record.role}" does not hold required permission "${requiredPermission}".`,
    );
  }
  return record;
}

export function toParticipantTransactionView(
  txDoc: StoredTransactionDocument,
  participants: readonly TransactionParticipantRecord[],
  viewerUid: string,
  isAdmin = false,
): ParticipantTransactionView {
  const viewerRecord = participants.find((p) => p.userId === viewerUid && p.status === 'ACTIVE');
  if (!viewerRecord && !isAdmin) {
    throw new CoreApiError('FORBIDDEN', 403, 'Principal is not authorized to view this transaction.');
  }

  return {
    id: txDoc.id,
    transactionType: txDoc.transactionType,
    propertyId: txDoc.propertyId,
    cityId: txDoc.cityId,
    hoodId: txDoc.hoodId,
    initiatorUid: txDoc.initiatorUid,
    status: txDoc.status,
    version: txDoc.version,
    monetary: { ...txDoc.monetary },
    viewerRole: viewerRecord ? viewerRecord.role : 'ADMIN',
    participants: participants
      .filter((p) => p.status === 'ACTIVE' || p.status === 'INVITED' || isAdmin)
      .map((p) => ({
        participantId: p.participantId,
        userId: p.userId,
        role: p.role,
        status: p.status,
        permissions: [...p.permissions],
      })),
    ...(txDoc.brokerUid ? { brokerUid: txDoc.brokerUid } : {}),
    ...(txDoc.acceptedOfferId ? { acceptedOfferId: txDoc.acceptedOfferId } : {}),
    ...(txDoc.activeContractId ? { activeContractId: txDoc.activeContractId } : {}),
    ...(txDoc.activeDisputeId ? { activeDisputeId: txDoc.activeDisputeId } : {}),
    negotiationStatus: txDoc.negotiationStatus,
    ...(txDoc.negotiationDeadlineIso ? { negotiationDeadlineIso: txDoc.negotiationDeadlineIso } : {}),
    suspendedByAdmin: txDoc.suspendedByAdmin,
    createdAtIso: txDoc.createdAtIso,
    updatedAtIso: txDoc.updatedAtIso,
    expiresAtIso: txDoc.expiresAtIso,
    ...(txDoc.completedAtIso ? { completedAtIso: txDoc.completedAtIso } : {}),
    ...(txDoc.cancelledAtIso ? { cancelledAtIso: txDoc.cancelledAtIso } : {}),
    ...(txDoc.cancellationReason ? { cancellationReason: txDoc.cancellationReason } : {}),
  };
}

export function toAdminTransactionView(
  txDoc: StoredTransactionDocument,
  participants: readonly TransactionParticipantRecord[],
  viewerUid: string,
): AdminTransactionView {
  const base = toParticipantTransactionView(txDoc, participants, viewerUid, true);
  return {
    ...base,
    invitedParticipantUids: [...txDoc.invitedParticipantUids],
    ...(txDoc.suspensionReason ? { suspensionReason: txDoc.suspensionReason } : {}),
    ...(txDoc.cancelledByUid ? { cancelledByUid: txDoc.cancelledByUid } : {}),
    historyCount: txDoc.historyCount,
  };
}
