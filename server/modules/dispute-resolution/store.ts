import {
  DisputeCaseHistoryEntryRecord,
  DisputeCaseRecord,
  DisputeClaimRecord,
  DisputeCommunicationRecord,
  DisputeDeadlineRecord,
  DisputeEvidenceReferenceRecord,
  DisputeMediationSessionRecord,
  DisputePartyRecord,
  DisputeResolutionError,
  DisputeResolutionOutcomeRecord,
  DisputeResponseRecord,
  DisputeSettlementProposalRecord,
} from './types';

export interface PropertyRegistryDisputeAdapter {
  verifyCanonicalPropertyExists(propertyId: string): Promise<boolean>;
}

export interface RealEstateTransactionsDisputeAdapter {
  verifyTransactionReferenceExists(transactionRef: string): Promise<boolean>;
}

export interface MediaDisputeAdapter {
  verifyMediaReferenceExists(mediaReferenceId: string): Promise<boolean>;
}

export interface NotificationsDisputeAdapter {
  dispatchCaseNotification(caseId: string, recipientPartyIds: string[], eventSummary: string): Promise<{ delivered: boolean }>;
}

export interface PaymentsDisputeAdapter {
  verifySettlementPaymentRef(externalPaymentRef: string): Promise<boolean>;
}

export interface DisputeResolutionCrossModuleAdapters {
  propertyRegistry: PropertyRegistryDisputeAdapter;
  transactions: RealEstateTransactionsDisputeAdapter;
  media: MediaDisputeAdapter;
  notifications: NotificationsDisputeAdapter;
  payments: PaymentsDisputeAdapter;
}

export function createDefaultDisputeResolutionAdapters(): DisputeResolutionCrossModuleAdapters {
  return {
    propertyRegistry: {
      async verifyCanonicalPropertyExists(propertyId: string) {
        return Boolean(propertyId && propertyId.trim().length > 0 && !propertyId.startsWith('invalid-'));
      },
    },
    transactions: {
      async verifyTransactionReferenceExists(transactionRef: string) {
        return Boolean(transactionRef && !transactionRef.startsWith('invalid-'));
      },
    },
    media: {
      async verifyMediaReferenceExists(mediaReferenceId: string) {
        return Boolean(mediaReferenceId && !mediaReferenceId.startsWith('missing-'));
      },
    },
    notifications: {
      async dispatchCaseNotification(_caseId: string, recipientPartyIds: string[]) {
        return { delivered: recipientPartyIds.length > 0 && !recipientPartyIds[0].startsWith('undelivered-') };
      },
    },
    payments: {
      async verifySettlementPaymentRef(externalPaymentRef: string) {
        return Boolean(externalPaymentRef && externalPaymentRef.startsWith('confirmed-pay-'));
      },
    },
  };
}

export interface PaginatedDisputeResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function clampDisputeLimit(requestedLimit?: number): number {
  if (requestedLimit === undefined || requestedLimit === null || Number.isNaN(requestedLimit)) {
    return 20;
  }
  return Math.max(1, Math.min(50, Math.floor(requestedLimit)));
}

export function paginateDisputeItems<T>(
  items: T[],
  limit?: number,
  offset?: number
): PaginatedDisputeResult<T> {
  const safeLimit = clampDisputeLimit(limit);
  const safeOffset = Math.max(0, Math.floor(offset ?? 0));
  const slice = items.slice(safeOffset, safeOffset + safeLimit);
  return {
    items: slice,
    total: items.length,
    limit: safeLimit,
    offset: safeOffset,
    hasMore: safeOffset + safeLimit < items.length,
  };
}

export class TransactionalDisputeResolutionStore {
  private cases = new Map<string, DisputeCaseRecord>();
  private parties = new Map<string, DisputePartyRecord>();
  private claims = new Map<string, DisputeClaimRecord>();
  private responses = new Map<string, DisputeResponseRecord>();
  private evidence = new Map<string, DisputeEvidenceReferenceRecord>();
  private communications: DisputeCommunicationRecord[] = [];
  private deadlines = new Map<string, DisputeDeadlineRecord>();
  private mediationSessions = new Map<string, DisputeMediationSessionRecord>();
  private settlementProposals = new Map<string, DisputeSettlementProposalRecord>();
  private resolutionOutcomes = new Map<string, DisputeResolutionOutcomeRecord>();
  private history: DisputeCaseHistoryEntryRecord[] = [];
  private idempotencyRegistry = new Map<string, { scope: string; entityId: string }>();
  private simulatePersistenceFailureFlag = false;

  public setSimulatePersistenceFailure(fail: boolean): void {
    this.simulatePersistenceFailureFlag = fail;
  }

  private assertHealthyPersistence(): void {
    if (this.simulatePersistenceFailureFlag) {
      throw new DisputeResolutionError(
        'PERSISTENCE_FAILURE',
        'Durable persistence layer failed to commit dispute resolution transaction.',
        503
      );
    }
  }

  public async runTransaction<T>(work: (tx: this) => Promise<T> | T): Promise<T> {
    this.assertHealthyPersistence();
    const snapCases = new Map(this.cases);
    const snapParties = new Map(this.parties);
    const snapClaims = new Map(this.claims);
    const snapResp = new Map(this.responses);
    const snapEvid = new Map(this.evidence);
    const snapComm = [...this.communications];
    const snapDeadlines = new Map(this.deadlines);
    const snapMed = new Map(this.mediationSessions);
    const snapProps = new Map(this.settlementProposals);
    const snapOut = new Map(this.resolutionOutcomes);
    const snapHist = [...this.history];
    const snapIdem = new Map(this.idempotencyRegistry);

    try {
      const result = await work(this);
      this.assertHealthyPersistence();
      return result;
    } catch (err) {
      this.cases = snapCases;
      this.parties = snapParties;
      this.claims = snapClaims;
      this.responses = snapResp;
      this.evidence = snapEvid;
      this.communications = snapComm;
      this.deadlines = snapDeadlines;
      this.mediationSessions = snapMed;
      this.settlementProposals = snapProps;
      this.resolutionOutcomes = snapOut;
      this.history = snapHist;
      this.idempotencyRegistry = snapIdem;
      throw err;
    }
  }

  public getIdempotentEntityId(scope: string, key?: string): string | undefined {
    if (!key) return undefined;
    return this.idempotencyRegistry.get(`${scope}:${key}`)?.entityId;
  }

  public setIdempotentEntityId(scope: string, key: string | undefined, entityId: string): void {
    if (!key) return;
    this.idempotencyRegistry.set(`${scope}:${key}`, { scope, entityId });
  }

  public saveCase(r: DisputeCaseRecord): void {
    this.cases.set(r.id, {
      ...r,
      claimantPartyIds: [...r.claimantPartyIds],
      respondentPartyIds: [...r.respondentPartyIds],
      allParticipantPartyIds: [...r.allParticipantPartyIds],
      chronology: r.chronology.map((c) => ({ ...c })),
    });
  }
  public getCase(id: string): DisputeCaseRecord | undefined {
    const r = this.cases.get(id);
    return r
      ? {
          ...r,
          claimantPartyIds: [...r.claimantPartyIds],
          respondentPartyIds: [...r.respondentPartyIds],
          allParticipantPartyIds: [...r.allParticipantPartyIds],
          chronology: r.chronology.map((c) => ({ ...c })),
        }
      : undefined;
  }

  public saveParty(r: DisputePartyRecord): void {
    this.parties.set(r.id, { ...r });
  }
  public listPartiesByCase(caseId: string): DisputePartyRecord[] {
    return Array.from(this.parties.values()).filter((p) => p.caseId === caseId);
  }

  public saveClaim(r: DisputeClaimRecord): void {
    this.claims.set(r.id, { ...r, supportingEvidenceIds: [...r.supportingEvidenceIds] });
  }
  public getClaim(id: string): DisputeClaimRecord | undefined {
    const r = this.claims.get(id);
    return r ? { ...r, supportingEvidenceIds: [...r.supportingEvidenceIds] } : undefined;
  }
  public listClaimsByCase(caseId: string): DisputeClaimRecord[] {
    return Array.from(this.claims.values()).filter((c) => c.caseId === caseId);
  }

  public saveResponse(r: DisputeResponseRecord): void {
    this.responses.set(r.id, { ...r, supportingEvidenceIds: [...r.supportingEvidenceIds] });
  }
  public listResponsesByCase(caseId: string): DisputeResponseRecord[] {
    return Array.from(this.responses.values()).filter((r) => r.caseId === caseId);
  }

  public saveEvidence(r: DisputeEvidenceReferenceRecord): void {
    this.evidence.set(r.id, { ...r });
  }
  public getEvidence(id: string): DisputeEvidenceReferenceRecord | undefined {
    const r = this.evidence.get(id);
    return r ? { ...r } : undefined;
  }
  public listEvidenceByCase(caseId: string): DisputeEvidenceReferenceRecord[] {
    return Array.from(this.evidence.values()).filter((e) => e.caseId === caseId);
  }

  public appendCommunication(r: DisputeCommunicationRecord): void {
    this.communications.push({ ...r, relatedEvidenceIds: [...r.relatedEvidenceIds] });
  }
  public listCommunicationsByCase(caseId: string): DisputeCommunicationRecord[] {
    return this.communications.filter((c) => c.caseId === caseId);
  }

  public saveDeadline(r: DisputeDeadlineRecord): void {
    this.deadlines.set(r.id, { ...r });
  }
  public listDeadlinesByCase(caseId: string): DisputeDeadlineRecord[] {
    return Array.from(this.deadlines.values()).filter((d) => d.caseId === caseId);
  }

  public saveMediationSession(r: DisputeMediationSessionRecord): void {
    this.mediationSessions.set(r.id, { ...r, participatingPartyIds: [...r.participatingPartyIds] });
  }

  public saveSettlementProposal(r: DisputeSettlementProposalRecord): void {
    this.settlementProposals.set(r.id, {
      ...r,
      conditions: [...r.conditions],
      acceptedByPartyIds: [...r.acceptedByPartyIds],
      requiredAcceptingPartyIds: [...r.requiredAcceptingPartyIds],
    });
  }
  public getSettlementProposal(id: string): DisputeSettlementProposalRecord | undefined {
    const r = this.settlementProposals.get(id);
    return r
      ? {
          ...r,
          conditions: [...r.conditions],
          acceptedByPartyIds: [...r.acceptedByPartyIds],
          requiredAcceptingPartyIds: [...r.requiredAcceptingPartyIds],
        }
      : undefined;
  }

  public saveResolutionOutcome(r: DisputeResolutionOutcomeRecord): void {
    this.resolutionOutcomes.set(r.id, { ...r });
  }

  public appendHistory(entry: DisputeCaseHistoryEntryRecord): void {
    this.history.push({ ...entry });
  }
  public listHistoryByCase(caseId: string): DisputeCaseHistoryEntryRecord[] {
    return this.history.filter((h) => h.caseId === caseId);
  }

  public attemptDirectCrossModuleWrite(targetCollectionName: string): never {
    throw new DisputeResolutionError(
      'CROSS_MODULE_WRITE_FORBIDDEN',
      `Dispute Resolution module is forbidden from writing directly to external collection "${targetCollectionName}".`,
      403
    );
  }
}
