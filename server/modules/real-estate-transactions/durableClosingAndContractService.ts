/**
 * @file server/modules/real-estate-transactions/durableClosingAndContractService.ts
 * @description RT-TRANSACTION-CRITICAL-030 — Transactional contract metadata, closing milestones,
 * canonical payment verification, prerequisite-gated transaction completion, and cancellation/dispute
 * recording backed by FirestoreRealEstateTransactionStore.
 */
import type { RealEstateTransactionCrossModuleAdapters } from './store';
import type {
  CompletedTransactionRecord,
  RealEstateTransactionRecord,
  TransactionActorContext,
  TransactionContractReferenceRecord,
  TransactionMilestoneRecord,
  TransactionOfferRecord,
  TransactionParticipantRecord,
  TransactionTerminationRecord,
} from './types';
import { RealEstateTransactionError } from './types';
import {
  REAL_ESTATE_TRANSACTION_COLLECTIONS,
  type DurableTransactionPaymentRef,
  type FirestoreRealEstateTransactionStore,
} from './firestoreStore';
import {
  assertExpectedTxRevision,
  assertTxParticipantOrAdmin,
  makeTxId,
} from './durableOfferAndParticipantService';

export class DurableClosingAndContractService {
  constructor(
    private readonly store: FirestoreRealEstateTransactionStore,
    private readonly adapters: RealEstateTransactionCrossModuleAdapters,
  ) {}

  public async upsertContractMetadata(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      contractType: TransactionContractReferenceRecord['contractType'];
      mediaDocumentId: string;
      contractingPartyIds: string[];
    },
  ): Promise<TransactionContractReferenceRecord> {
    const docExists = await this.adapters.media.verifyDocumentExists(input.mediaDocumentId);
    if (!docExists) {
      throw new RealEstateTransactionError('INVALID_MEDIA_REFERENCE', 'سند قراردادی در Media Metadata Store یافت نشد یا فعال نیست.', 400);
    }
    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const [txRec, participants] = await Promise.all([
        tx.get<RealEstateTransactionRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, input.transactionId),
        tx.query<TransactionParticipantRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
      ]);
      if (!txRec) throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'معامله یافت نشد.', 404);
      assertTxParticipantOrAdmin(txRec, participants, actor);

      const contractId = makeTxId('txctr');
      const contract: TransactionContractReferenceRecord = {
        id: contractId,
        transactionId: txRec.id,
        contractType: input.contractType,
        mediaDocumentId: input.mediaDocumentId,
        contractingPartyIds: [...input.contractingPartyIds],
        executionStatus: 'PREPARED',
        version: 1,
        isExternallyOfficialized: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.contracts, contractId, contract as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, txRec.id, {
        ...txRec,
        status: 'CONTRACT_EXECUTION_PENDING',
        version: txRec.version + 1,
        updatedAt: nowIso,
      } as unknown as Record<string, unknown>);
      return contract;
    });
  }

  public async transitionContractWorkflowState(
    actor: TransactionActorContext,
    input: { transactionId: string; contractId: string; executionStatus: TransactionContractReferenceRecord['executionStatus'] },
  ): Promise<TransactionContractReferenceRecord> {
    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const [txRec, contract, participants] = await Promise.all([
        tx.get<RealEstateTransactionRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, input.transactionId),
        tx.get<TransactionContractReferenceRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.contracts, input.contractId),
        tx.query<TransactionParticipantRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
      ]);
      if (!txRec || !contract || contract.transactionId !== input.transactionId) {
        throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'قرارداد یافت نشد.', 404);
      }
      assertTxParticipantOrAdmin(txRec, participants, actor);
      const updated: TransactionContractReferenceRecord = {
        ...contract,
        executionStatus: input.executionStatus,
        version: contract.version + 1,
        updatedAt: nowIso,
      };
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.contracts, contract.id, updated as unknown as Record<string, unknown>);
      return updated;
    });
  }

  public async upsertClosingMilestone(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      titleFa: string;
      epistemicStatus: TransactionMilestoneRecord['epistemicStatus'];
      evidenceReferences?: string[];
    },
  ): Promise<TransactionMilestoneRecord> {
    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const [txRec, participants] = await Promise.all([
        tx.get<RealEstateTransactionRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, input.transactionId),
        tx.query<TransactionParticipantRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
      ]);
      if (!txRec) throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'معامله یافت نشد.', 404);
      assertTxParticipantOrAdmin(txRec, participants, actor);
      const id = makeTxId('txmile');
      const milestone: TransactionMilestoneRecord = {
        id,
        transactionId: txRec.id,
        milestoneType: 'CLOSING_STEP',
        titleFa: input.titleFa,
        epistemicStatus: input.epistemicStatus,
        responsiblePartyId: actor.partyId,
        evidenceReferences: [...(input.evidenceReferences ?? [])],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.milestones, id, milestone as unknown as Record<string, unknown>);
      return milestone;
    });
  }

  public async recordVerifiedPaymentReference(
    actor: TransactionActorContext,
    input: { transactionId: string; paymentRef: string },
  ): Promise<DurableTransactionPaymentRef> {
    const confirmed = await this.adapters.payments.verifySettlementOrDepositConfirmed(input.paymentRef);
    if (!confirmed) {
      throw new RealEstateTransactionError(
        'UNVERIFIED_PAYMENT_REFERENCE',
        'وضعیت پرداخت از موتور پرداخت رسمی تایید نشد (جعل یا پرداخت ناتمام رد شد).',
        409,
      );
    }
    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const [txRec, participants] = await Promise.all([
        tx.get<RealEstateTransactionRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, input.transactionId),
        tx.query<TransactionParticipantRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
      ]);
      if (!txRec) throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'معامله یافت نشد.', 404);
      assertTxParticipantOrAdmin(txRec, participants, actor);
      const refDoc: DurableTransactionPaymentRef = {
        id: makeTxId('txpay'),
        transactionId: txRec.id,
        paymentRef: input.paymentRef,
        verifiedByPaymentsEngine: true,
        recordedByUserId: actor.userId,
        recordedAtIso: nowIso,
      };
      const histId = makeTxId('txhist');
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.closings, refDoc.id, refDoc);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.history, histId, {
        id: histId,
        transactionId: txRec.id,
        propertyId: txRec.propertyId,
        entityType: 'CLOSING',
        actionSummary: `Verified payment ref ${input.paymentRef} via Payments Canonical Engine.`,
        actorUserId: actor.userId,
        recordedAtIso: nowIso,
      });
      return refDoc;
    });
  }

  public async completeTransactionCase(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      finalPaymentRef: string;
      ownershipTransferRef?: string;
      expectedRevision?: number;
    },
  ): Promise<{ transaction: RealEstateTransactionRecord; completedRecord: CompletedTransactionRecord }> {
    const txPre = await this.store.getTransaction(input.transactionId);
    if (!txPre) throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'معامله یافت نشد.', 404);

    const payOk = await this.adapters.payments.verifySettlementOrDepositConfirmed(input.finalPaymentRef);
    if (!payOk) {
      throw new RealEstateTransactionError(
        'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION',
        'تکمیل معامله بدون تایید قطعی پرداخت از Payments Canonical Engine مجاز نیست.',
        409,
      );
    }
    const isSale = txPre.transactionType === 'PROPERTY_SALE' || txPre.transactionType === 'PROPERTY_PURCHASE';
    if (isSale) {
      if (!input.ownershipTransferRef) {
        throw new RealEstateTransactionError(
          'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION',
          'تکمیل معامله خرید/فروش نیازمند مرجع رسمی انتقال مالکیت است.',
          409,
        );
      }
      const transferOk = await this.adapters.propertyOwnership.verifyOwnershipTransferConfirmed(
        txPre.propertyId,
        input.ownershipTransferRef,
      );
      if (!transferOk) {
        throw new RealEstateTransactionError(
          'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION',
          'انتقال مالکیت توسط Property Ownership تایید نشده است.',
          409,
        );
      }
    }

    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const [txRec, participants, offers, contracts] = await Promise.all([
        tx.get<RealEstateTransactionRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, input.transactionId),
        tx.query<TransactionParticipantRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
        tx.query<TransactionOfferRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.offers, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
        tx.query<TransactionContractReferenceRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.contracts, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
      ]);
      if (!txRec) throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'معامله یافت نشد.', 404);
      assertTxParticipantOrAdmin(txRec, participants, actor);
      assertExpectedTxRevision(txRec.version, input.expectedRevision);

      const acceptedOffer = offers.find((o) => o.status === 'ACCEPTED');
      if (!acceptedOffer) {
        throw new RealEstateTransactionError('COMPLETION_PREREQUISITES_UNMET', 'تکمیل معامله بدون پیشنهاد پذیرفته‌شده مجاز نیست.', 409);
      }
      const executedContract = contracts.find((c) => c.executionStatus === 'FULLY_EXECUTED' || c.executionStatus === 'SIGNED_BY_ALL_PARTIES');
      if (!executedContract) {
        throw new RealEstateTransactionError('COMPLETION_PREREQUISITES_UNMET', 'تکمیل معامله بدون قرارداد اجراشده مجاز نیست.', 409);
      }

      const updatedTx: RealEstateTransactionRecord = {
        ...txRec,
        status: 'COMPLETED',
        version: txRec.version + 1,
        updatedAt: nowIso,
      };
      const completedRecord: CompletedTransactionRecord = {
        id: makeTxId('txcomp'),
        transactionId: txRec.id,
        propertyId: txRec.propertyId,
        transactionType: txRec.transactionType,
        finalAgreedPriceRials: acceptedOffer.proposedPriceRials,
        currency: 'IRR',
        priceDistinctionClassification: 'VERIFIED_COMPLETED_PRICE',
        contractReferenceId: executedContract.id,
        paymentConfirmationRef: input.finalPaymentRef,
        ownershipTransferConfirmationRef: input.ownershipTransferRef,
        completedAtIso: nowIso,
        sourceProvenance: txRec.sourceProvenance,
      };
      const histId = makeTxId('txhist');
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, txRec.id, updatedTx as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.completedRecords, completedRecord.id, completedRecord as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.history, histId, {
        id: histId,
        transactionId: txRec.id,
        propertyId: txRec.propertyId,
        entityType: 'COMPLETED_RECORD',
        actionSummary: `Transaction completed with verified payment ${input.finalPaymentRef}.`,
        actorUserId: actor.userId,
        recordedAtIso: nowIso,
      });
      return { transaction: updatedTx, completedRecord };
    });
  }

  public async recordCancellationTerminationOrDispute(
    actor: TransactionActorContext,
    input: { transactionId: string; mode: 'CANCELLED' | 'TERMINATED' | 'DISPUTED'; reasonFa: string },
  ): Promise<{ transaction: RealEstateTransactionRecord; termination: TransactionTerminationRecord }> {
    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const [txRec, participants] = await Promise.all([
        tx.get<RealEstateTransactionRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, input.transactionId),
        tx.query<TransactionParticipantRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
      ]);
      if (!txRec) throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'معامله یافت نشد.', 404);
      assertTxParticipantOrAdmin(txRec, participants, actor);
      if (txRec.status === 'COMPLETED') {
        throw new RealEstateTransactionError('INVALID_TRANSITION', 'معامله تکمیل‌شده قابل لغو مستقیم نیست.', 409);
      }
      const updatedTx: RealEstateTransactionRecord = {
        ...txRec,
        status: input.mode,
        version: txRec.version + 1,
        updatedAt: nowIso,
      };
      const termination: TransactionTerminationRecord = {
        id: makeTxId('txterm'),
        transactionId: txRec.id,
        outcome: input.mode === 'CANCELLED' ? 'CANCELLED_MUTUAL' : input.mode === 'DISPUTED' ? 'DISPUTED_FREEZE' : 'TERMINATED_BREACH',
        initiatedByPartyId: actor.partyId,
        reasonFa: input.reasonFa,
        recordedAtIso: nowIso,
      };
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, txRec.id, updatedTx as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.terminations, termination.id, termination as unknown as Record<string, unknown>);
      return { transaction: updatedTx, termination };
    });
  }
}
