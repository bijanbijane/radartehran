/**
 * @file server/modules/real-estate-transactions/firestoreStore.ts
 * @description RT-TRANSACTION-CRITICAL-030 — Durable Firestore Repository & Transactional
 * Facade for Real Estate Transactions across all 14 canonical Firestore collections.
 */
import type { RealEstateTransactionCrossModuleAdapters } from './store';
import type {
  RealEstateTransactionRecord,
  TransactionHistoryEntryRecord,
  TransactionOfferRecord,
  TransactionParticipantRecord,
} from './types';
import type { DurableFirestoreEngine, FirestoreTransactionHandle } from './productionCrossModuleAdapters';
import { DurableOfferAndParticipantService } from './durableOfferAndParticipantService';
import { DurableClosingAndContractService } from './durableClosingAndContractService';

export const REAL_ESTATE_TRANSACTION_COLLECTIONS = {
  transactions: 'real_estate_transactions',
  participants: 'real_estate_transaction_participants',
  offers: 'real_estate_transaction_offers',
  negotiations: 'real_estate_transaction_negotiations',
  terms: 'real_estate_transaction_terms',
  conditions: 'real_estate_transaction_conditions',
  milestones: 'real_estate_transaction_milestones',
  contracts: 'real_estate_transaction_contracts',
  closings: 'real_estate_transaction_closings',
  handovers: 'real_estate_transaction_handovers',
  terminations: 'real_estate_transaction_terminations',
  completedRecords: 'real_estate_transaction_completed_records',
  history: 'real_estate_transaction_history',
  idempotency: 'real_estate_transaction_idempotency',
} as const;

export interface DurableTransactionPaymentRef extends Record<string, unknown> {
  id: string;
  transactionId: string;
  paymentRef: string;
  verifiedByPaymentsEngine: boolean;
  recordedByUserId: string;
  recordedAtIso: string;
}

export class FirestoreRealEstateTransactionStore {
  public readonly backendKind = 'firestore_durable' as const;

  constructor(private readonly engine: DurableFirestoreEngine) {}

  public getEngine(): DurableFirestoreEngine {
    return this.engine;
  }

  public async getTransaction(transactionId: string): Promise<RealEstateTransactionRecord | null> {
    return this.engine.getDoc<RealEstateTransactionRecord & Record<string, unknown>>(
      REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions,
      transactionId,
    );
  }

  public async listParticipants(transactionId: string): Promise<TransactionParticipantRecord[]> {
    const page = await this.engine.queryDocs<TransactionParticipantRecord & Record<string, unknown>>(
      REAL_ESTATE_TRANSACTION_COLLECTIONS.participants,
      [{ field: 'transactionId', op: '==', value: transactionId }],
      { limit: 50 },
    );
    return page.items;
  }

  public async listOffers(transactionId: string): Promise<TransactionOfferRecord[]> {
    const page = await this.engine.queryDocs<TransactionOfferRecord & Record<string, unknown>>(
      REAL_ESTATE_TRANSACTION_COLLECTIONS.offers,
      [{ field: 'transactionId', op: '==', value: transactionId }],
      { limit: 50 },
    );
    return page.items;
  }

  public async listHistory(
    transactionId: string,
    options?: { limit?: number; cursor?: string | null },
  ): Promise<{ items: TransactionHistoryEntryRecord[]; nextCursor: string | null; hasMore: boolean }> {
    return this.engine.queryDocs<TransactionHistoryEntryRecord & Record<string, unknown>>(
      REAL_ESTATE_TRANSACTION_COLLECTIONS.history,
      [{ field: 'transactionId', op: '==', value: transactionId }],
      { orderByField: 'recordedAtIso', orderDirection: 'desc', limit: options?.limit ?? 20, cursorDocId: options?.cursor ?? null },
    );
  }

  public async listTransactionsByProperty(
    propertyId: string,
    options?: { limit?: number; cursor?: string | null },
  ): Promise<{ items: RealEstateTransactionRecord[]; nextCursor: string | null; hasMore: boolean }> {
    return this.engine.queryDocs<RealEstateTransactionRecord & Record<string, unknown>>(
      REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions,
      [{ field: 'propertyId', op: '==', value: propertyId }],
      { orderByField: 'createdAt', orderDirection: 'desc', limit: options?.limit ?? 20, cursorDocId: options?.cursor ?? null },
    );
  }

  public async runTransaction<R>(fn: (tx: FirestoreTransactionHandle) => Promise<R>): Promise<R> {
    return this.engine.runTransaction(fn);
  }
}

export class DurableRealEstateTransactionService {
  private readonly offerAndParticipant: DurableOfferAndParticipantService;
  private readonly closingAndContract: DurableClosingAndContractService;

  constructor(
    public readonly store: FirestoreRealEstateTransactionStore,
    public readonly adapters: RealEstateTransactionCrossModuleAdapters,
  ) {
    this.offerAndParticipant = new DurableOfferAndParticipantService(store, adapters);
    this.closingAndContract = new DurableClosingAndContractService(store, adapters);
  }

  public createTransactionCase: DurableOfferAndParticipantService['createTransactionCase'] = (actor, input) =>
    this.offerAndParticipant.createTransactionCase(actor, input);

  public getTransactionCaseById: DurableOfferAndParticipantService['getTransactionCaseById'] = (actor, transactionId) =>
    this.offerAndParticipant.getTransactionCaseById(actor, transactionId);

  public inviteParticipant: DurableOfferAndParticipantService['inviteParticipant'] = (actor, input) =>
    this.offerAndParticipant.inviteParticipant(actor, input);

  public respondToParticipantInvitation: DurableOfferAndParticipantService['respondToParticipantInvitation'] = (actor, input) =>
    this.offerAndParticipant.respondToParticipantInvitation(actor, input);

  public submitOfferOrCounteroffer: DurableOfferAndParticipantService['submitOfferOrCounteroffer'] = (actor, input) =>
    this.offerAndParticipant.submitOfferOrCounteroffer(actor, input);

  public decideOnOffer: DurableOfferAndParticipantService['decideOnOffer'] = (actor, input) =>
    this.offerAndParticipant.decideOnOffer(actor, input);

  public upsertContractMetadata: DurableClosingAndContractService['upsertContractMetadata'] = (actor, input) =>
    this.closingAndContract.upsertContractMetadata(actor, input);

  public transitionContractWorkflowState: DurableClosingAndContractService['transitionContractWorkflowState'] = (actor, input) =>
    this.closingAndContract.transitionContractWorkflowState(actor, input);

  public upsertClosingMilestone: DurableClosingAndContractService['upsertClosingMilestone'] = (actor, input) =>
    this.closingAndContract.upsertClosingMilestone(actor, input);

  public recordVerifiedPaymentReference: DurableClosingAndContractService['recordVerifiedPaymentReference'] = (actor, input) =>
    this.closingAndContract.recordVerifiedPaymentReference(actor, input);

  public completeTransactionCase: DurableClosingAndContractService['completeTransactionCase'] = (actor, input) =>
    this.closingAndContract.completeTransactionCase(actor, input);

  public recordCancellationTerminationOrDispute: DurableClosingAndContractService['recordCancellationTerminationOrDispute'] = (actor, input) =>
    this.closingAndContract.recordCancellationTerminationOrDispute(actor, input);
}
