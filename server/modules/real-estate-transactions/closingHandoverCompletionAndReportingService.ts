import {
  PaginatedTransactionResult,
  paginateTransactionItems,
  RealEstateTransactionCrossModuleAdapters,
  TransactionalRealEstateTransactionStore,
} from './store';
import { assertTransactionAccess } from './transactionParticipantOfferAndNegotiationService';
import {
  CompletedTransactionRecord,
  PriceDistinctionClassification,
  PropertyHandoverRecord,
  RealEstateTransactionError,
  RealEstateTransactionRecord,
  TransactionActorContext,
  TransactionClosingRecord,
  TransactionHistoryEntryRecord,
  TransactionMilestoneRecord,
  TransactionOfferRecord,
  TransactionTerminationRecord,
} from './types';

function makeTxId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ClosingHandoverCompletionAndReportingService {
  constructor(
    private readonly store: TransactionalRealEstateTransactionStore,
    private readonly adapters: RealEstateTransactionCrossModuleAdapters
  ) {}

  public async createClosingWorkflow(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      expectedClosingDateIso: string;
      requiredConditionIds: string[];
      responsiblePartyIds: string[];
    }
  ): Promise<TransactionClosingRecord> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);
    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const closing: TransactionClosingRecord = {
        id: makeTxId('txclose'),
        transactionId: txRecord.id,
        expectedClosingDateIso: input.expectedClosingDateIso,
        requiredConditionIds: input.requiredConditionIds,
        status: 'PREPARING',
        responsiblePartyIds: input.responsiblePartyIds,
        directlyProcessesPayments: false,
        directlyTransfersOwnership: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveClosing(closing);
      tx.saveTransaction({
        ...txRecord,
        status: 'CLOSING_PENDING',
        version: txRecord.version + 1,
        updatedAt: now,
      });
      return closing;
    });
  }

  public async recordClosingConfirmation(
    actor: TransactionActorContext,
    input: {
      closingId: string;
      finalContractReferenceId: string;
      finalPaymentConfirmationRef: string;
      ownershipTransferConfirmationRef?: string;
      actualClosingDateIso: string;
    }
  ): Promise<TransactionClosingRecord> {
    const closing = this.store.getClosing(input.closingId);
    if (!closing) {
      throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', `Closing "${input.closingId}" not found.`, 404);
    }
    const txRecord = assertTransactionAccess(this.store, actor, closing.transactionId);

    // Verify all required conditions are SATISFIED or WAIVED
    for (const condId of closing.requiredConditionIds) {
      const cond = this.store.getCondition(condId);
      if (!cond || (cond.status !== 'SATISFIED' && cond.status !== 'WAIVED')) {
        throw new RealEstateTransactionError(
          'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION',
          `Cannot complete closing while required condition "${condId}" is in status "${cond?.status ?? 'MISSING'}".`
        );
      }
    }

    // A failed payment confirmation must not advance the transaction to a payment-complete or closed state
    const paymentOk = await this.adapters.payments.verifySettlementOrDepositConfirmed(
      input.finalPaymentConfirmationRef
    );
    if (!paymentOk) {
      throw new RealEstateTransactionError(
        'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION',
        `Payments adapter could not confirm final payment "${input.finalPaymentConfirmationRef}".`
      );
    }

    // For sale transactions, a failed ownership transfer confirmation must not mark closing completed
    const isSale = txRecord.transactionType === 'PROPERTY_SALE' || txRecord.transactionType === 'PROPERTY_PURCHASE';
    if (isSale) {
      if (!input.ownershipTransferConfirmationRef) {
        throw new RealEstateTransactionError(
          'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION',
          'Sale closing requires an ownershipTransferConfirmationRef verified by Property Ownership & Rights.'
        );
      }
      const transferOk = await this.adapters.propertyOwnership.verifyOwnershipTransferConfirmed(
        txRecord.propertyId,
        input.ownershipTransferConfirmationRef
      );
      if (!transferOk) {
        throw new RealEstateTransactionError(
          'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION',
          `Property Ownership & Rights could not confirm transfer "${input.ownershipTransferConfirmationRef}".`
        );
      }
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const updatedClosing: TransactionClosingRecord = {
        ...closing,
        finalContractReferenceId: input.finalContractReferenceId,
        finalPaymentConfirmationRef: input.finalPaymentConfirmationRef,
        ownershipTransferConfirmationRef: input.ownershipTransferConfirmationRef,
        actualClosingDateIso: input.actualClosingDateIso,
        status: 'COMPLETED',
        updatedAt: now,
      };
      tx.saveClosing(updatedClosing);
      tx.saveTransaction({
        ...txRecord,
        status: 'HANDOVER_PENDING',
        version: txRecord.version + 1,
        updatedAt: now,
      });
      return updatedClosing;
    });
  }

  public async createHandoverRecord(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      handoverDateIso: string;
      participantPartyIds: string[];
      conditionReportReferenceId?: string;
      keyHandoverReference?: string;
      meterReadingReferences?: string[];
      outstandingMaintenanceItems?: string[];
    }
  ): Promise<PropertyHandoverRecord> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);
    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const handover: PropertyHandoverRecord = {
        id: makeTxId('txhand'),
        transactionId: txRecord.id,
        propertyId: txRecord.propertyId,
        handoverDateIso: input.handoverDateIso,
        participantPartyIds: input.participantPartyIds,
        conditionReportReferenceId: input.conditionReportReferenceId,
        keyHandoverReference: input.keyHandoverReference,
        meterReadingReferences: input.meterReadingReferences ?? [],
        outstandingMaintenanceItems: input.outstandingMaintenanceItems ?? [],
        status: 'SCHEDULED',
        provesLegalPossessionTransferAlone: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveHandover(handover);
      return handover;
    });
  }

  public async recordHandoverCompletion(
    actor: TransactionActorContext,
    input: { handoverId: string; keyHandoverReference: string }
  ): Promise<PropertyHandoverRecord> {
    const handover = this.store.getHandover(input.handoverId);
    if (!handover) {
      throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', `Handover "${input.handoverId}" not found.`, 404);
    }
    assertTransactionAccess(this.store, actor, handover.transactionId);

    return this.store.runTransaction((tx) => {
      const updated: PropertyHandoverRecord = {
        ...handover,
        keyHandoverReference: input.keyHandoverReference,
        status: 'COMPLETED',
        updatedAt: new Date().toISOString(),
      };
      tx.saveHandover(updated);
      return updated;
    });
  }

  public async cancelTransaction(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      reasonCategory: string;
      explanation: string;
      supportingEvidenceIds?: string[];
    }
  ): Promise<{ termination: TransactionTerminationRecord; transaction: RealEstateTransactionRecord }> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);
    if (txRecord.status === 'COMPLETED') {
      throw new RealEstateTransactionError(
        'COMPLETED_TRANSACTION_IMMUTABLE',
        'A COMPLETED transaction cannot be cancelled; record a post-completion challenge instead.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const termination: TransactionTerminationRecord = {
        id: makeTxId('txterm_rec'),
        transactionId: txRecord.id,
        distinctionType: 'CANCELLED_BEFORE_AGREEMENT',
        reasonCategory: input.reasonCategory,
        explanation: input.explanation,
        initiatingPartyId: actor.partyId,
        effectiveDateIso: now,
        supportingEvidenceIds: input.supportingEvidenceIds ?? [],
        autoCalculatesLegalPenalties: false,
        autoRefundsDeposits: false,
        assumesAllObligationsReleased: false,
        recordedAtIso: now,
      };
      const updatedTx: RealEstateTransactionRecord = {
        ...txRecord,
        status: 'CANCELLED',
        version: txRecord.version + 1,
        updatedAt: now,
      };
      tx.saveTermination(termination);
      tx.saveTransaction(updatedTx);
      return { termination, transaction: updatedTx };
    });
  }

  public async terminateTransaction(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      relatedContractId: string;
      reasonCategory: string;
      explanation: string;
      supportingEvidenceIds: string[];
    }
  ): Promise<{ termination: TransactionTerminationRecord; transaction: RealEstateTransactionRecord }> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);
    if (txRecord.status === 'COMPLETED') {
      throw new RealEstateTransactionError(
        'COMPLETED_TRANSACTION_IMMUTABLE',
        'A COMPLETED transaction cannot be overwritten via termination.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const termination: TransactionTerminationRecord = {
        id: makeTxId('txterm_rec'),
        transactionId: txRecord.id,
        distinctionType: 'CONTRACT_TERMINATED',
        reasonCategory: input.reasonCategory,
        explanation: input.explanation,
        initiatingPartyId: actor.partyId,
        effectiveDateIso: now,
        relatedOfferOrContractId: input.relatedContractId,
        supportingEvidenceIds: input.supportingEvidenceIds,
        autoCalculatesLegalPenalties: false,
        autoRefundsDeposits: false,
        assumesAllObligationsReleased: false,
        recordedAtIso: now,
      };
      const updatedTx: RealEstateTransactionRecord = {
        ...txRecord,
        status: 'TERMINATED',
        version: txRecord.version + 1,
        updatedAt: now,
      };
      tx.saveTermination(termination);
      tx.saveTransaction(updatedTx);
      return { termination, transaction: updatedTx };
    });
  }

  public async recordCompletedTransaction(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      closingId: string;
      finalAgreedAmountRials: number;
      priceClassification: PriceDistinctionClassification;
      rentalTermsBreakdown?: CompletedTransactionRecord['rentalTermsBreakdown'];
      completionEvidenceRefs: string[];
    }
  ): Promise<CompletedTransactionRecord> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);

    // Prevent silent overwriting of completed transactions
    if (txRecord.status === 'COMPLETED' || this.store.getCompletedRecordByTransaction(txRecord.id)) {
      throw new RealEstateTransactionError(
        'COMPLETED_TRANSACTION_IMMUTABLE',
        `Transaction "${txRecord.id}" is already COMPLETED and cannot be silently overwritten.`
      );
    }

    // Do not treat an asking price or accepted offer as a verified completed transaction price
    if (
      input.priceClassification === 'ASKING_PRICE' ||
      input.priceClassification === 'ACCEPTED_OFFER_AMOUNT'
    ) {
      throw new RealEstateTransactionError(
        'ASKING_PRICE_OR_OFFER_NOT_VERIFIED_COMPLETED_PRICE',
        `Cannot record a completed transaction using "${input.priceClassification}" as the final transaction price.`
      );
    }

    // A transaction must not become COMPLETED merely because a user presses a completion button
    const closing = this.store.getClosing(input.closingId);
    if (!closing || closing.transactionId !== txRecord.id || closing.status !== 'COMPLETED') {
      throw new RealEstateTransactionError(
        'CLOSING_REQUIRES_PAYMENT_AND_OWNERSHIP_CONFIRMATION',
        'Cannot complete a transaction without a COMPLETED closing workflow record.'
      );
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const completed: CompletedTransactionRecord = {
        id: makeTxId('txcomp'),
        transactionId: txRecord.id,
        propertyId: txRecord.propertyId,
        transactionType: txRecord.transactionType,
        completionDateIso: now,
        finalAgreedAmountRials: input.finalAgreedAmountRials,
        priceClassification: input.priceClassification,
        listingAskingPriceRials: txRecord.listingAskingPriceRials,
        rentalTermsBreakdown: input.rentalTermsBreakdown,
        currency: 'IRR',
        finalContractReferenceId: closing.finalContractReferenceId!,
        participantPartyIds: [...txRecord.participantIds],
        completionEvidenceRefs: input.completionEvidenceRefs,
        verificationStatus:
          input.priceClassification === 'VERIFIED_COMPLETED_TRANSACTION_AMOUNT'
            ? 'VERIFIED_COMPLETED'
            : 'REPORTED_UNVERIFIED',
        publiclyPublishableWithoutConsent: false,
        version: 1,
        recordedAtIso: now,
      };
      tx.saveCompletedRecord(completed);
      tx.saveTransaction({
        ...txRecord,
        status: 'COMPLETED',
        originClassification:
          completed.verificationStatus === 'VERIFIED_COMPLETED'
            ? 'VERIFIED_COMPLETED_TRANSACTION'
            : txRecord.originClassification,
        version: txRecord.version + 1,
        updatedAt: now,
      });
      tx.appendHistory({
        id: makeTxId('txhist'),
        transactionId: txRecord.id,
        propertyId: txRecord.propertyId,
        entityType: 'COMPLETED_TRANSACTION',
        actionSummary: `Completed transaction (${completed.finalAgreedAmountRials} IRR, ${completed.priceClassification}).`,
        actorUserId: actor.userId,
        provenanceReference: closing.id,
        recordedAtIso: now,
      });
      return completed;
    });
  }

  public retrieveTransactionHistory(
    actor: TransactionActorContext,
    transactionId: string,
    limit?: number,
    offset?: number
  ): PaginatedTransactionResult<TransactionHistoryEntryRecord> {
    assertTransactionAccess(this.store, actor, transactionId);
    return paginateTransactionItems(this.store.listHistoryByTransaction(transactionId), limit, offset);
  }

  public retrieveParticipantTransactions(
    actor: TransactionActorContext,
    limit?: number,
    offset?: number
  ): PaginatedTransactionResult<RealEstateTransactionRecord> {
    if (actor.role === 'UNRELATED_USER') {
      throw new RealEstateTransactionError('UNAUTHORIZED_TRANSACTION_ACCESS', 'Unrelated user denied.', 403);
    }
    const items = this.store
      .listAllTransactions()
      .filter((t) => t.participantIds.includes(actor.partyId) || actor.role === 'PLATFORM_VERIFIER_OR_ADMIN');
    return paginateTransactionItems(items, limit, offset);
  }

  public retrievePendingOffers(
    actor: TransactionActorContext,
    transactionId: string,
    limit?: number,
    offset?: number
  ): PaginatedTransactionResult<TransactionOfferRecord> {
    assertTransactionAccess(this.store, actor, transactionId);
    const items = this.store
      .listOffersByTransaction(transactionId)
      .filter((o) => o.status === 'SUBMITTED' || o.status === 'RECEIVED' || o.status === 'UNDER_REVIEW');
    return paginateTransactionItems(items, limit, offset);
  }

  public retrieveUpcomingMilestones(
    actor: TransactionActorContext,
    transactionId: string,
    limit?: number,
    offset?: number
  ): PaginatedTransactionResult<TransactionMilestoneRecord> {
    assertTransactionAccess(this.store, actor, transactionId);
    const items = this.store
      .listMilestonesByTransaction(transactionId)
      .filter((m) => m.epistemicStatus === 'PLANNED_MILESTONE');
    return paginateTransactionItems(items, limit, offset);
  }
}
