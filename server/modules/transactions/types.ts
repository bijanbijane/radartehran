import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core';

export type TransactionType = 'SALE' | 'RENTAL';

export const ALL_TRANSACTION_TYPES: readonly TransactionType[] = ['SALE', 'RENTAL'] as const;

export type TransactionStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'OFFER_PENDING'
  | 'NEGOTIATION'
  | 'AGREEMENT_PENDING'
  | 'CONTRACT_PENDING'
  | 'CONTRACT_SIGNED'
  | 'CLOSING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED';

export const ALL_TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  'DRAFT',
  'OPEN',
  'OFFER_PENDING',
  'NEGOTIATION',
  'AGREEMENT_PENDING',
  'CONTRACT_PENDING',
  'CONTRACT_SIGNED',
  'CLOSING',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
] as const;

export type ParticipantRole =
  | 'BUYER'
  | 'SELLER'
  | 'LANDLORD'
  | 'TENANT'
  | 'BROKER'
  | 'PROPERTY_MANAGER'
  | 'AUTHORIZED_REPRESENTATIVE';

export const ALL_PARTICIPANT_ROLES: readonly ParticipantRole[] = [
  'BUYER',
  'SELLER',
  'LANDLORD',
  'TENANT',
  'BROKER',
  'PROPERTY_MANAGER',
  'AUTHORIZED_REPRESENTATIVE',
] as const;

export type ParticipantStatus =
  | 'INVITED'
  | 'ACTIVE'
  | 'DECLINED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'REMOVED';

export type OfferStatus =
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'COUNTERED'
  | 'WITHDRAWN'
  | 'EXPIRED';

export type TransactionCurrency = 'IRR' | 'IRT';

export const ALL_TRANSACTION_CURRENCIES: readonly TransactionCurrency[] = ['IRR', 'IRT'] as const;

export type MilestoneType =
  | 'OFFER_ACCEPTED'
  | 'DOCUMENTS_REQUESTED'
  | 'DOCUMENTS_VERIFIED'
  | 'CONTRACT_PREPARED'
  | 'CONTRACT_SIGNED'
  | 'DEPOSIT_CONFIRMED'
  | 'INSPECTION_COMPLETED'
  | 'CLOSING_SCHEDULED'
  | 'SETTLEMENT_CONFIRMED'
  | 'PROPERTY_HANDOVER'
  | 'TRANSACTION_COMPLETED';

export const ALL_MILESTONE_TYPES: readonly MilestoneType[] = [
  'OFFER_ACCEPTED',
  'DOCUMENTS_REQUESTED',
  'DOCUMENTS_VERIFIED',
  'CONTRACT_PREPARED',
  'CONTRACT_SIGNED',
  'DEPOSIT_CONFIRMED',
  'INSPECTION_COMPLETED',
  'CLOSING_SCHEDULED',
  'SETTLEMENT_CONFIRMED',
  'PROPERTY_HANDOVER',
  'TRANSACTION_COMPLETED',
] as const;

export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'WAIVED' | 'BLOCKED';

export type ContractStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'READY_FOR_EXECUTION'
  | 'PARTIALLY_SIGNED'
  | 'EXECUTED'
  | 'SUPERSEDED'
  | 'EXPIRED'
  | 'REVOKED';

export type ClosingSettlementStatus =
  | 'UNINITIATED'
  | 'REFERENCE_RECORDED'
  | 'CONFIRMED_BY_PARTIES'
  | 'DISPUTED';

export interface TransactionMonetaryTerms {
  askingAmount: number;
  agreedAmount?: number;
  depositAmount?: number;
  monthlyRentAmount?: number;
  currency: TransactionCurrency;
}

export interface TransactionParticipantRecord {
  participantId: string;
  transactionId: string;
  userId: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  invitedByUid: string;
  invitedAtIso: string;
  invitationExpiresAtIso: string;
  respondedAtIso?: string;
  revokedAtIso?: string;
  revokedByUid?: string;
  revocationReason?: string;
  representsPartyUid?: string;
  permissions: readonly string[];
  updatedAtIso: string;
}

export interface TransactionOfferRecord {
  offerId: string;
  transactionId: string;
  authorUid: string;
  authorRole: ParticipantRole;
  amount: number;
  depositAmount?: number;
  monthlyRentAmount?: number;
  currency: TransactionCurrency;
  conditions: string;
  expiresAtIso?: string;
  status: OfferStatus;
  parentOfferId?: string;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
  decidedByUid?: string;
  decidedAtIso?: string;
  decisionNote?: string;
}

export interface NegotiationEntryRecord {
  entryId: string;
  transactionId: string;
  authorUid: string;
  authorRole: ParticipantRole;
  entryType: 'INITIATED' | 'MESSAGE' | 'TERMS_PROPOSAL' | 'DEADLINE_SET' | 'CLOSED';
  message: string;
  referencedOfferId?: string;
  deadlineIso?: string;
  createdAtIso: string;
}

export interface TransactionMilestoneRecord {
  milestoneId: string;
  transactionId: string;
  milestoneType: MilestoneType;
  required: boolean;
  status: MilestoneStatus;
  responsibleUid: string;
  dueDateIso?: string;
  completedAtIso?: string;
  completedByUid?: string;
  metadata?: Record<string, string | number | boolean>;
  auditReferenceId: string;
  updatedAtIso: string;
}

export interface ContractSignatureStatusRef {
  partyUid: string;
  role: ParticipantRole;
  executionStatus: 'PENDING' | 'ACKNOWLEDGED' | 'EXTERNAL_REGISTRY_RECORDED' | 'DECLINED';
  externalRegistryRef?: string;
  recordedAtIso: string;
}

export interface TransactionContractReferenceRecord {
  contractId: string;
  transactionId: string;
  version: number;
  title: string;
  mediaObjectId: string;
  sha256Checksum: string;
  officialTrackingCode?: string;
  status: ContractStatus;
  uploadedByUid: string;
  signatures: ContractSignatureStatusRef[];
  supersedesContractId?: string;
  expiresAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ClosingExceptionEntry {
  exceptionId: string;
  reportedByUid: string;
  code: string;
  description: string;
  resolved: boolean;
  reportedAtIso: string;
  resolvedAtIso?: string;
  resolvedByUid?: string;
}

export interface TransactionClosingStateRecord {
  transactionId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  initiatedByUid: string;
  initiatedAtIso: string;
  checklistItems: {
    contractExecutedVerified: boolean;
    requiredMilestonesVerified: boolean;
    settlementReferenceVerified: boolean;
    handoverConfirmed: boolean;
  };
  confirmedByUids: string[];
  settlementStatus: ClosingSettlementStatus;
  settlementReferenceId?: string;
  exceptions: ClosingExceptionEntry[];
  completedAtIso?: string;
  completedByUid?: string;
  cancelledAtIso?: string;
  cancelledByUid?: string;
  cancellationReason?: string;
  updatedAtIso: string;
}

export interface TransactionDisputeRecord {
  disputeId: string;
  transactionId: string;
  initiatedByUid: string;
  reasonCategory: 'BREACH_OF_TERMS' | 'DOCUMENT_DISCREPANCY' | 'SETTLEMENT_DELAY' | 'MISREPRESENTATION' | 'OTHER';
  description: string;
  status: 'OPEN' | 'UNDER_ADMIN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  previousTransactionStatus: TransactionStatus;
  createdAtIso: string;
  resolvedAtIso?: string;
  resolvedByAdminUid?: string;
  resolutionSummary?: string;
}

export type TransactionHistoryEventType =
  | 'TRANSACTION_CREATED'
  | 'STATUS_TRANSITIONED'
  | 'PARTICIPANT_INVITED'
  | 'PARTICIPANT_ACCEPTED'
  | 'PARTICIPANT_DECLINED'
  | 'PARTICIPANT_ROLE_MODIFIED'
  | 'PARTICIPANT_REVOKED'
  | 'OFFER_SUBMITTED'
  | 'COUNTEROFFER_SUBMITTED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_REJECTED'
  | 'OFFER_WITHDRAWN'
  | 'OFFER_EXPIRED'
  | 'NEGOTIATION_EVENT'
  | 'CONTRACT_ATTACHED'
  | 'CONTRACT_STATUS_CHANGED'
  | 'MILESTONE_UPDATED'
  | 'CLOSING_INITIATED'
  | 'CLOSING_CONFIRMED'
  | 'CLOSING_EXCEPTION_RECORDED'
  | 'CLOSING_COMPLETED'
  | 'CLOSING_CANCELLED'
  | 'TRANSACTION_CANCELLED'
  | 'DISPUTE_INITIATED'
  | 'DISPUTE_RESOLVED'
  | 'ADMIN_INTERVENTION';

export interface TransactionHistoryEventRecord {
  eventId: string;
  transactionId: string;
  sequenceNumber: number;
  eventType: TransactionHistoryEventType;
  actorUid: string;
  actorRole: string;
  fromStatus?: TransactionStatus;
  toStatus?: TransactionStatus;
  summary: string;
  metadata: Record<string, unknown>;
  timestampIso: string;
}

export interface StoredTransactionDocument {
  id: string;
  transactionType: TransactionType;
  propertyId: string;
  cityId: string;
  hoodId: number;
  initiatorUid: string;
  status: TransactionStatus;
  version: number;
  monetary: TransactionMonetaryTerms;
  activeParticipantUids: string[];
  invitedParticipantUids: string[];
  brokerUid?: string;
  acceptedOfferId?: string;
  activeContractId?: string;
  activeDisputeId?: string;
  negotiationStatus: 'NOT_STARTED' | 'OPEN' | 'CLOSED';
  negotiationDeadlineIso?: string;
  suspendedByAdmin: boolean;
  suspensionReason?: string;
  historyCount: number;
  createdAtIso: string;
  updatedAtIso: string;
  expiresAtIso: string;
  completedAtIso?: string;
  cancelledAtIso?: string;
  cancelledByUid?: string;
  cancellationReason?: string;
}

export interface ParticipantTransactionView {
  id: string;
  transactionType: TransactionType;
  propertyId: string;
  cityId: string;
  hoodId: number;
  initiatorUid: string;
  status: TransactionStatus;
  version: number;
  monetary: TransactionMonetaryTerms;
  viewerRole: ParticipantRole | 'ADMIN';
  participants: Array<{
    participantId: string;
    userId: string;
    role: ParticipantRole;
    status: ParticipantStatus;
    permissions: readonly string[];
  }>;
  brokerUid?: string;
  acceptedOfferId?: string;
  activeContractId?: string;
  activeDisputeId?: string;
  negotiationStatus: 'NOT_STARTED' | 'OPEN' | 'CLOSED';
  negotiationDeadlineIso?: string;
  suspendedByAdmin: boolean;
  createdAtIso: string;
  updatedAtIso: string;
  expiresAtIso: string;
  completedAtIso?: string;
  cancelledAtIso?: string;
  cancellationReason?: string;
}

export interface AdminTransactionView extends ParticipantTransactionView {
  invitedParticipantUids: string[];
  suspensionReason?: string;
  cancelledByUid?: string;
  historyCount: number;
}

export interface TransactionNotificationEvent {
  eventId: string;
  eventType: string;
  transactionId: string;
  recipientUids: string[];
  actorUid: string;
  summary: string;
  occurredAtIso: string;
}

export interface TransactionTelemetryEvent {
  eventName: string;
  transactionId: string;
  transactionType: TransactionType;
  cityId: string;
  hoodId: number;
  status: TransactionStatus;
  numericMetrics: Record<string, number>;
  occurredAtMs: number;
}

export interface TransactionAnalyticsSnapshot {
  totalCreated: number;
  saleCount: number;
  rentalCount: number;
  completedCount: number;
  cancelledCount: number;
  disputedCount: number;
  totalOffersSubmitted: number;
  totalOffersAccepted: number;
  offerConversionRate: number;
  completionRate: number;
  cancellationRate: number;
  disputeRate: number;
  milestoneCompletionRate: number;
}

export interface TransactionsQueryAdapter {
  listByParticipantUid: (params: {
    userId: string;
    status?: TransactionStatus;
    transactionType?: TransactionType;
    limit: number;
    afterCursor?: { sortValue: string | number; docId: string } | null;
  }) => Promise<StoredTransactionDocument[]>;
  listAllForAdmin: (params: {
    status?: TransactionStatus;
    transactionType?: TransactionType;
    suspendedOnly?: boolean;
    limit: number;
    afterCursor?: { sortValue: string | number; docId: string } | null;
  }) => Promise<StoredTransactionDocument[]>;
  listOffersByTransaction: (transactionId: string) => Promise<TransactionOfferRecord[]>;
  listNegotiationByTransaction: (transactionId: string) => Promise<NegotiationEntryRecord[]>;
  listMilestonesByTransaction: (transactionId: string) => Promise<TransactionMilestoneRecord[]>;
  listContractsByTransaction: (transactionId: string) => Promise<TransactionContractReferenceRecord[]>;
  listHistoryByTransaction: (transactionId: string) => Promise<TransactionHistoryEventRecord[]>;
}

export interface TransactionsModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  queryAdapter?: TransactionsQueryAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  propertyVerifier?: (propertyId: string) => Promise<{ exists: boolean; ownerUid?: string; status?: string }>;
  mediaVerifier?: (mediaObjectId: string, actorUid: string) => Promise<{ valid: boolean; sha256?: string; state?: string }>;
  notificationEmitter?: (event: TransactionNotificationEvent) => Promise<void>;
  telemetryEmitter?: (event: TransactionTelemetryEvent) => void;
  nowFn?: () => number;
}
