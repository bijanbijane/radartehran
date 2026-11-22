/**
 * @file server/modules/dispute-resolution/firestoreStore.ts
 * @description RT-DISPUTE-CRITICAL-031 — Canonical Durable Firestore Store & Real
 * Cross-Module Adapters across all 13 canonical Dispute Resolution collections + Outbox.
 * Uses strict READ_PHASE -> WRITE_PHASE transactions via DurableFirestoreEngine.
 */
import type {
  DurableFirestoreEngine,
  FirestoreTransactionHandle,
} from '../real-estate-transactions/productionCrossModuleAdapters';
import type {
  CaseStatus,
  DisputeCategory,
  EvidenceConfidentiality,
  ResolutionOutcomeType,
} from './disputeTypes';

export const DISPUTE_RESOLUTION_COLLECTIONS = {
  cases: 'dispute_cases',
  parties: 'dispute_parties',
  claims: 'dispute_claims',
  responses: 'dispute_responses',
  evidence: 'dispute_evidence',
  communications: 'dispute_communications',
  deadlines: 'dispute_deadlines',
  mediationSessions: 'dispute_mediation_sessions',
  settlementProposals: 'dispute_settlement_proposals',
  settlements: 'dispute_settlements',
  resolutionOutcomes: 'dispute_resolution_outcomes',
  caseHistory: 'dispute_case_history',
  idempotency: 'dispute_idempotency',
  outbox: 'dispute_notification_outbox',
} as const;

export type CanonicalDisputeActorRole =
  | 'CLAIMANT'
  | 'RESPONDENT'
  | 'AUTHORIZED_REPRESENTATIVE'
  | 'MEDIATOR'
  | 'CASE_HANDLER'
  | 'AUTHORIZED_REVIEWER';

export interface CanonicalDisputeLegalBoundary {
  readonly isBindingCourtOrder: false;
  readonly isOfficialElectronicSignature: false;
  readonly isFinalLegalContract: false;
  readonly confirmsPaymentAlone: false;
  readonly transfersOwnershipAlone: false;
  readonly disclaimerFa: string;
}

export const CANONICAL_DISPUTE_LEGAL_BOUNDARY: CanonicalDisputeLegalBoundary = {
  isBindingCourtOrder: false,
  isOfficialElectronicSignature: false,
  isFinalLegalContract: false,
  confirmsPaymentAlone: false,
  transfersOwnershipAlone: false,
  disclaimerFa:
    'این پرونده صرفاً مدیریت داخلی حل اختلاف است و جایگزین حکم دادگاه، امضای الکترونیکی رسمی، تایید پرداخت یا انتقال مالکیت نیست.',
};

export interface CanonicalDisputeCaseRecord extends Record<string, unknown> {
  id: string;
  category: DisputeCategory;
  titleFa: string;
  descriptionFa: string;
  propertyReferenceId?: string;
  transactionReferenceId?: string;
  claimantUid: string;
  respondentUid: string;
  authorizedRepresentativeUids: string[];
  assignedMediatorUid?: string;
  assignedCaseHandlerUid?: string;
  status: CaseStatus;
  revision: number;
  idempotencyKey: string;
  legalBoundary: CanonicalDisputeLegalBoundary;
  createdAtIso: string;
  updatedAtIso: string;
  closedAtIso?: string;
  closureReasonFa?: string;
  activeSettlementId?: string;
  resolutionOutcomeId?: string;
}

export interface CanonicalDisputeHistoryRecord extends Record<string, unknown> {
  id: string;
  caseId: string;
  eventType: string;
  actorUid: string;
  actorRole: CanonicalDisputeActorRole;
  descriptionFa: string;
  fromStatus?: CaseStatus;
  toStatus?: CaseStatus;
  caseRevision: number;
  recordedAtIso: string;
  immutable: true;
}

export interface CanonicalDisputeEvidenceRecord extends Record<string, unknown> {
  id: string;
  caseId: string;
  claimId?: string;
  evidenceType: 'CONTRACT' | 'RECEIPT' | 'INSPECTION_RECORD' | 'PHOTO_VIDEO' | 'MESSAGES' | 'OFFICIAL_DOCUMENT';
  descriptionFa: string;
  sourceMediaId: string;
  submittedByUid: string;
  confidentiality: EvidenceConfidentiality;
  reviewStatus: 'SUBMITTED' | 'UNDER_REVIEW' | 'REVIEWED' | 'REJECTED';
  createdAtIso: string;
}

export interface CanonicalSettlementProposalRecord extends Record<string, unknown> {
  id: string;
  caseId: string;
  proposedByUid: string;
  proposalTermsFa: string;
  proposedFinancialRemedyRials?: number;
  validUntilIso: string;
  status: 'PROPOSED' | 'PARTIALLY_ACCEPTED' | 'MUTUALLY_ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';
  acceptedByUids: string[];
  requiredPartyUids: string[];
  legalBoundary: CanonicalDisputeLegalBoundary;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CanonicalSettlementRecord extends Record<string, unknown> {
  id: string;
  caseId: string;
  proposalId: string;
  agreedTermsFa: string;
  financialSettlementRials?: number;
  partyAcceptances: Array<{
    partyUid: string;
    acceptedAtIso: string;
    internalConsentHash: string;
  }>;
  status: 'BILATERALLY_ACCEPTED';
  legalBoundary: CanonicalDisputeLegalBoundary;
  acceptedAtIso: string;
}

export interface CanonicalResolutionOutcomeRecord extends Record<string, unknown> {
  id: string;
  caseId: string;
  outcomeType: ResolutionOutcomeType;
  explanationFa: string;
  settlementId?: string;
  verifiedPaymentRef?: string;
  recordedByUid: string;
  recordedByRole: CanonicalDisputeActorRole;
  legalBoundary: CanonicalDisputeLegalBoundary;
  recordedAtIso: string;
}

export interface CanonicalDisputeCrossModuleAdapters {
  propertyRegistry: {
    verifyPropertyAndPartyLinkage(
      propertyId: string,
      claimantUid: string,
      respondentUid: string,
    ): Promise<{ valid: boolean; reason?: string }>;
  };
  transactions: {
    verifyTransactionPartyLinkage(
      transactionId: string,
      claimantUid: string,
      respondentUid: string,
    ): Promise<{ valid: boolean; propertyId?: string; reason?: string }>;
  };
  media: {
    verifyMediaExists(mediaId: string): Promise<boolean>;
  };
  payments: {
    verifyPaymentIntentConfirmed(paymentRef: string): Promise<boolean>;
  };
}

export function createCanonicalDisputeAdapters(
  engine: DurableFirestoreEngine,
): CanonicalDisputeCrossModuleAdapters {
  return {
    propertyRegistry: {
      async verifyPropertyAndPartyLinkage(propertyId, claimantUid, respondentUid) {
        if (!propertyId || !propertyId.trim()) {
          return { valid: false, reason: 'PROPERTY_ID_REQUIRED' };
        }
        const prop = await engine.getDoc<Record<string, unknown>>('pr_canonical_properties', propertyId.trim());
        if (!prop || prop.status !== 'ACTIVE') {
          return { valid: false, reason: 'PROPERTY_NOT_FOUND_OR_INACTIVE' };
        }
        const rights = await engine.queryDocs<Record<string, unknown>>(
          'property_ownership_rights',
          [
            { field: 'propertyId', op: '==', value: propertyId.trim() },
            { field: 'status', op: '==', value: 'ACTIVE' },
          ],
          { limit: 25 },
        );
        const linkedUids = new Set(rights.items.map((r) => String(r.partyId || '')));
        // At least one of claimant or respondent must hold a verified right on the property
        if (!linkedUids.has(claimantUid) && !linkedUids.has(respondentUid)) {
          return { valid: false, reason: 'NO_VERIFIED_PROPERTY_PARTY_LINKAGE' };
        }
        return { valid: true };
      },
    },
    transactions: {
      async verifyTransactionPartyLinkage(transactionId, claimantUid, respondentUid) {
        if (!transactionId || !transactionId.trim()) {
          return { valid: false, reason: 'TRANSACTION_ID_REQUIRED' };
        }
        const txDoc = await engine.getDoc<Record<string, unknown>>('real_estate_transactions', transactionId.trim());
        if (!txDoc) {
          return { valid: false, reason: 'TRANSACTION_NOT_FOUND' };
        }
        const partIds = new Set<string>([
          String(txDoc.initiatorPartyId || ''),
          ...(Array.isArray(txDoc.participantIds) ? txDoc.participantIds.map(String) : []),
        ]);
        if (!partIds.has(claimantUid) || !partIds.has(respondentUid)) {
          return { valid: false, reason: 'DISPUTE_PARTIES_NOT_LINKED_TO_TRANSACTION' };
        }
        return { valid: true, propertyId: typeof txDoc.propertyId === 'string' ? txDoc.propertyId : undefined };
      },
    },
    media: {
      async verifyMediaExists(mediaId) {
        if (!mediaId || !mediaId.trim()) return false;
        const meta = await engine.getDoc<Record<string, unknown>>('media_object_metadata_v2', mediaId.trim());
        return Boolean(meta && meta.lifecycleState === 'ACTIVE');
      },
    },
    payments: {
      async verifyPaymentIntentConfirmed(paymentRef) {
        if (!paymentRef || !paymentRef.trim()) return false;
        const intent = await engine.getDoc<Record<string, unknown>>('payment_intents', paymentRef.trim());
        return Boolean(intent && intent.status === 'SUCCEEDED' && intent.ledgerCommitted === true);
      },
    },
  };
}

/**
 * Durable Firestore Repository for Dispute Resolution (13 canonical collections + outbox).
 * Strictly append-only for `dispute_case_history` (no update or delete methods exposed).
 */
export class FirestoreDisputeResolutionStore {
  public readonly backendKind = 'firestore_durable' as const;

  constructor(private readonly engine: DurableFirestoreEngine) {}

  public getEngine(): DurableFirestoreEngine {
    return this.engine;
  }

  public async getCaseById(caseId: string): Promise<CanonicalDisputeCaseRecord | null> {
    return this.engine.getDoc<CanonicalDisputeCaseRecord>(DISPUTE_RESOLUTION_COLLECTIONS.cases, caseId);
  }

  public async listCasesByProperty(
    propertyReferenceId: string,
    options?: { limit?: number; cursor?: string | null },
  ): Promise<{ items: CanonicalDisputeCaseRecord[]; nextCursor: string | null; hasMore: boolean }> {
    return this.engine.queryDocs<CanonicalDisputeCaseRecord>(
      DISPUTE_RESOLUTION_COLLECTIONS.cases,
      [{ field: 'propertyReferenceId', op: '==', value: propertyReferenceId }],
      { orderByField: 'createdAtIso', orderDirection: 'desc', limit: options?.limit ?? 20, cursorDocId: options?.cursor ?? null },
    );
  }

  public async listCasesForUser(userUid: string, status?: CaseStatus): Promise<CanonicalDisputeCaseRecord[]> {
    const [asClaimant, asRespondent, asMediator, asHandler] = await Promise.all([
      this.engine.queryDocs<CanonicalDisputeCaseRecord>(
        DISPUTE_RESOLUTION_COLLECTIONS.cases,
        [{ field: 'claimantUid', op: '==', value: userUid }],
        { limit: 50 },
      ),
      this.engine.queryDocs<CanonicalDisputeCaseRecord>(
        DISPUTE_RESOLUTION_COLLECTIONS.cases,
        [{ field: 'respondentUid', op: '==', value: userUid }],
        { limit: 50 },
      ),
      this.engine.queryDocs<CanonicalDisputeCaseRecord>(
        DISPUTE_RESOLUTION_COLLECTIONS.cases,
        [{ field: 'assignedMediatorUid', op: '==', value: userUid }],
        { limit: 50 },
      ),
      this.engine.queryDocs<CanonicalDisputeCaseRecord>(
        DISPUTE_RESOLUTION_COLLECTIONS.cases,
        [{ field: 'assignedCaseHandlerUid', op: '==', value: userUid }],
        { limit: 50 },
      ),
    ]);
    const merged = new Map<string, CanonicalDisputeCaseRecord>();
    for (const c of [...asClaimant.items, ...asRespondent.items, ...asMediator.items, ...asHandler.items]) {
      if (!status || c.status === status) merged.set(c.id, c);
    }
    return Array.from(merged.values()).sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  public async listClaimsForCase(caseId: string): Promise<Array<Record<string, unknown> & { id: string }>> {
    const page = await this.engine.queryDocs<Record<string, unknown>>(
      DISPUTE_RESOLUTION_COLLECTIONS.claims,
      [{ field: 'caseId', op: '==', value: caseId }],
      { limit: 50 },
    );
    return page.items;
  }

  public async listEvidenceForCase(caseId: string): Promise<CanonicalDisputeEvidenceRecord[]> {
    const page = await this.engine.queryDocs<CanonicalDisputeEvidenceRecord>(
      DISPUTE_RESOLUTION_COLLECTIONS.evidence,
      [{ field: 'caseId', op: '==', value: caseId }],
      { limit: 50 },
    );
    return page.items;
  }

  public async listProposalsForCase(caseId: string): Promise<CanonicalSettlementProposalRecord[]> {
    const page = await this.engine.queryDocs<CanonicalSettlementProposalRecord>(
      DISPUTE_RESOLUTION_COLLECTIONS.settlementProposals,
      [{ field: 'caseId', op: '==', value: caseId }],
      { limit: 50 },
    );
    return page.items;
  }

  public async listSettlementsForCase(caseId: string): Promise<CanonicalSettlementRecord[]> {
    const page = await this.engine.queryDocs<CanonicalSettlementRecord>(
      DISPUTE_RESOLUTION_COLLECTIONS.settlements,
      [{ field: 'caseId', op: '==', value: caseId }],
      { limit: 50 },
    );
    return page.items;
  }

  public async listHistoryForCase(
    caseId: string,
    options?: { limit?: number; cursor?: string | null },
  ): Promise<{ items: CanonicalDisputeHistoryRecord[]; nextCursor: string | null; hasMore: boolean }> {
    return this.engine.queryDocs<CanonicalDisputeHistoryRecord>(
      DISPUTE_RESOLUTION_COLLECTIONS.caseHistory,
      [{ field: 'caseId', op: '==', value: caseId }],
      { orderByField: 'recordedAtIso', orderDirection: 'desc', limit: options?.limit ?? 50, cursorDocId: options?.cursor ?? null },
    );
  }

  public async runTransaction<R>(fn: (tx: FirestoreTransactionHandle) => Promise<R>): Promise<R> {
    return this.engine.runTransaction(fn);
  }
}
