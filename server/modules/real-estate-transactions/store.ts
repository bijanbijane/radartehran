import {
  CompletedTransactionRecord,
  DealTermRecord,
  NegotiationEntryRecord,
  PropertyHandoverRecord,
  RealEstateTransactionError,
  RealEstateTransactionRecord,
  TransactionClosingRecord,
  TransactionConditionRecord,
  TransactionContractReferenceRecord,
  TransactionHistoryEntryRecord,
  TransactionMilestoneRecord,
  TransactionOfferRecord,
  TransactionParticipantRecord,
  TransactionTerminationRecord,
} from './types';

export interface PropertyRegistryTransactionAdapter {
  verifyCanonicalPropertyExists(propertyId: string): Promise<boolean>;
}

export interface PropertyOwnershipTransactionAdapter {
  verifySellerOrLandlordAuthority(propertyId: string, partyId: string, evidenceRef?: string): Promise<boolean>;
  verifyOwnershipTransferConfirmed(propertyId: string, transferRef: string): Promise<boolean>;
}

export interface BrokerageOperationsTransactionAdapter {
  verifyBrokerMandateAuthority(propertyId: string, brokerageOrAgentPartyId: string, mandateRef?: string): Promise<boolean>;
}

export interface PaymentsTransactionAdapter {
  verifySettlementOrDepositConfirmed(paymentRef: string): Promise<boolean>;
}

export interface MediaTransactionAdapter {
  verifyDocumentExists(mediaDocumentId: string): Promise<boolean>;
}

export interface NotificationsTransactionAdapter {
  notifyTransactionEvent(eventType: string, recipientPartyIds: string[]): Promise<{ delivered: boolean }>;
}

export interface RealEstateTransactionCrossModuleAdapters {
  propertyRegistry: PropertyRegistryTransactionAdapter;
  propertyOwnership: PropertyOwnershipTransactionAdapter;
  brokerageOperations: BrokerageOperationsTransactionAdapter;
  payments: PaymentsTransactionAdapter;
  media: MediaTransactionAdapter;
  notifications: NotificationsTransactionAdapter;
}

export function createDefaultTransactionAdapters(): RealEstateTransactionCrossModuleAdapters {
  return {
    propertyRegistry: {
      async verifyCanonicalPropertyExists(propertyId: string) {
        return Boolean(propertyId && propertyId.trim().length > 0 && !propertyId.startsWith('invalid-'));
      },
    },
    propertyOwnership: {
      async verifySellerOrLandlordAuthority(_propertyId: string, _partyId: string, evidenceRef?: string) {
        return Boolean(evidenceRef && !evidenceRef.startsWith('unverified-'));
      },
      async verifyOwnershipTransferConfirmed(_propertyId: string, transferRef: string) {
        return Boolean(transferRef && transferRef.startsWith('confirmed-transfer-'));
      },
    },
    brokerageOperations: {
      async verifyBrokerMandateAuthority(_propertyId: string, _partyId: string, mandateRef?: string) {
        return Boolean(mandateRef && !mandateRef.startsWith('invalid-'));
      },
    },
    payments: {
      async verifySettlementOrDepositConfirmed(paymentRef: string) {
        return Boolean(paymentRef && paymentRef.startsWith('confirmed-pay-'));
      },
    },
    media: {
      async verifyDocumentExists(mediaDocumentId: string) {
        return Boolean(mediaDocumentId && !mediaDocumentId.startsWith('missing-'));
      },
    },
    notifications: {
      async notifyTransactionEvent(_eventType: string, recipientPartyIds: string[]) {
        return { delivered: recipientPartyIds.length > 0 };
      },
    },
  };
}

export interface PaginatedTransactionResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function clampTransactionLimit(requestedLimit?: number): number {
  if (requestedLimit === undefined || requestedLimit === null || Number.isNaN(requestedLimit)) {
    return 20;
  }
  return Math.max(1, Math.min(50, Math.floor(requestedLimit)));
}

export function paginateTransactionItems<T>(
  items: T[],
  limit?: number,
  offset?: number
): PaginatedTransactionResult<T> {
  const safeLimit = clampTransactionLimit(limit);
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

export class TransactionalRealEstateTransactionStore {
  private transactions = new Map<string, RealEstateTransactionRecord>();
  private participants = new Map<string, TransactionParticipantRecord>();
  private offers = new Map<string, TransactionOfferRecord>();
  private negotiations: NegotiationEntryRecord[] = [];
  private dealTerms = new Map<string, DealTermRecord>();
  private conditions = new Map<string, TransactionConditionRecord>();
  private milestones = new Map<string, TransactionMilestoneRecord>();
  private contracts = new Map<string, TransactionContractReferenceRecord>();
  private closings = new Map<string, TransactionClosingRecord>();
  private handovers = new Map<string, PropertyHandoverRecord>();
  private terminations = new Map<string, TransactionTerminationRecord>();
  private completedRecords = new Map<string, CompletedTransactionRecord>();
  private history: TransactionHistoryEntryRecord[] = [];
  private idempotencyRegistry = new Map<string, { scope: string; entityId: string }>();
  private simulatePersistenceFailureFlag = false;

  public setSimulatePersistenceFailure(fail: boolean): void {
    this.simulatePersistenceFailureFlag = fail;
  }

  private assertHealthyPersistence(): void {
    if (this.simulatePersistenceFailureFlag) {
      throw new RealEstateTransactionError(
        'PERSISTENCE_FAILURE',
        'Durable persistence layer failed to commit real estate transaction operation.',
        503
      );
    }
  }

  public async runTransaction<T>(work: (tx: this) => Promise<T> | T): Promise<T> {
    this.assertHealthyPersistence();
    const snapTx = new Map(this.transactions);
    const snapPart = new Map(this.participants);
    const snapOffers = new Map(this.offers);
    const snapNeg = [...this.negotiations];
    const snapTerms = new Map(this.dealTerms);
    const snapCond = new Map(this.conditions);
    const snapMile = new Map(this.milestones);
    const snapContract = new Map(this.contracts);
    const snapClose = new Map(this.closings);
    const snapHand = new Map(this.handovers);
    const snapTerm = new Map(this.terminations);
    const snapComp = new Map(this.completedRecords);
    const snapHist = [...this.history];
    const snapIdem = new Map(this.idempotencyRegistry);

    try {
      const result = await work(this);
      this.assertHealthyPersistence();
      return result;
    } catch (err) {
      this.transactions = snapTx;
      this.participants = snapPart;
      this.offers = snapOffers;
      this.negotiations = snapNeg;
      this.dealTerms = snapTerms;
      this.conditions = snapCond;
      this.milestones = snapMile;
      this.contracts = snapContract;
      this.closings = snapClose;
      this.handovers = snapHand;
      this.terminations = snapTerm;
      this.completedRecords = snapComp;
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

  public saveTransaction(r: RealEstateTransactionRecord): void {
    this.transactions.set(r.id, { ...r, participantIds: [...r.participantIds] });
  }
  public getTransaction(id: string): RealEstateTransactionRecord | undefined {
    const r = this.transactions.get(id);
    return r ? { ...r, participantIds: [...r.participantIds] } : undefined;
  }
  public listAllTransactions(): RealEstateTransactionRecord[] {
    return Array.from(this.transactions.values());
  }

  public saveParticipant(r: TransactionParticipantRecord): void {
    this.participants.set(r.id, { ...r });
  }
  public listParticipantsByTransaction(transactionId: string): TransactionParticipantRecord[] {
    return Array.from(this.participants.values()).filter((p) => p.transactionId === transactionId);
  }

  public saveOffer(r: TransactionOfferRecord): void {
    this.offers.set(r.id, { ...r, recipientPartyIds: [...r.recipientPartyIds], conditions: [...r.conditions] });
  }
  public getOffer(id: string): TransactionOfferRecord | undefined {
    const r = this.offers.get(id);
    return r ? { ...r, recipientPartyIds: [...r.recipientPartyIds], conditions: [...r.conditions] } : undefined;
  }
  public listOffersByTransaction(transactionId: string): TransactionOfferRecord[] {
    return Array.from(this.offers.values()).filter((o) => o.transactionId === transactionId);
  }

  public appendNegotiation(r: NegotiationEntryRecord): void {
    this.negotiations.push({ ...r });
  }
  public listNegotiationsByTransaction(transactionId: string): NegotiationEntryRecord[] {
    return this.negotiations.filter((n) => n.transactionId === transactionId);
  }

  public saveDealTerm(r: DealTermRecord): void {
    this.dealTerms.set(r.id, { ...r });
  }
  public listDealTermsByTransaction(transactionId: string): DealTermRecord[] {
    return Array.from(this.dealTerms.values()).filter((t) => t.transactionId === transactionId);
  }

  public saveCondition(r: TransactionConditionRecord): void {
    this.conditions.set(r.id, { ...r });
  }
  public getCondition(id: string): TransactionConditionRecord | undefined {
    const r = this.conditions.get(id);
    return r ? { ...r } : undefined;
  }

  public saveMilestone(r: TransactionMilestoneRecord): void {
    this.milestones.set(r.id, { ...r, evidenceReferences: [...r.evidenceReferences] });
  }
  public getMilestone(id: string): TransactionMilestoneRecord | undefined {
    const r = this.milestones.get(id);
    return r ? { ...r, evidenceReferences: [...r.evidenceReferences] } : undefined;
  }
  public listMilestonesByTransaction(transactionId: string): TransactionMilestoneRecord[] {
    return Array.from(this.milestones.values()).filter((m) => m.transactionId === transactionId);
  }

  public saveContract(r: TransactionContractReferenceRecord): void {
    this.contracts.set(r.id, { ...r, contractingPartyIds: [...r.contractingPartyIds] });
  }
  public getContract(id: string): TransactionContractReferenceRecord | undefined {
    const r = this.contracts.get(id);
    return r ? { ...r, contractingPartyIds: [...r.contractingPartyIds] } : undefined;
  }

  public saveClosing(r: TransactionClosingRecord): void {
    this.closings.set(r.id, { ...r });
  }
  public getClosing(id: string): TransactionClosingRecord | undefined {
    const r = this.closings.get(id);
    return r ? { ...r } : undefined;
  }

  public saveHandover(r: PropertyHandoverRecord): void {
    this.handovers.set(r.id, { ...r });
  }
  public getHandover(id: string): PropertyHandoverRecord | undefined {
    const r = this.handovers.get(id);
    return r ? { ...r } : undefined;
  }

  public saveTermination(r: TransactionTerminationRecord): void {
    this.terminations.set(r.id, { ...r });
  }

  public saveCompletedRecord(r: CompletedTransactionRecord): void {
    this.completedRecords.set(r.id, { ...r });
  }
  public getCompletedRecordByTransaction(transactionId: string): CompletedTransactionRecord | undefined {
    return Array.from(this.completedRecords.values()).find((c) => c.transactionId === transactionId);
  }

  public appendHistory(entry: TransactionHistoryEntryRecord): void {
    this.history.push({ ...entry });
  }
  public listHistoryByTransaction(transactionId: string): TransactionHistoryEntryRecord[] {
    return this.history.filter((h) => h.transactionId === transactionId);
  }

  public attemptDirectCrossModuleWrite(targetCollectionName: string): never {
    throw new RealEstateTransactionError(
      'CROSS_MODULE_WRITE_FORBIDDEN',
      `Real Estate Transactions module is forbidden from writing directly to external collection "${targetCollectionName}".`,
      403
    );
  }
}
