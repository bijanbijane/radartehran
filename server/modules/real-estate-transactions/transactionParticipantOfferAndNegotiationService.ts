import { RealEstateTransactionCrossModuleAdapters, TransactionalRealEstateTransactionStore } from './store';
import {
  NegotiationEntryRecord,
  NegotiationVisibilityScope,
  RealEstateTransactionError,
  RealEstateTransactionRecord,
  RealEstateTransactionType,
  TransactionActorContext,
  TransactionOfferRecord,
  TransactionOfferType,
  TransactionOriginClassification,
  TransactionParticipantRecord,
  TransactionParticipantRole,
} from './types';

function makeTxId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function assertTransactionAccess(
  store: TransactionalRealEstateTransactionStore,
  actor: TransactionActorContext,
  transactionId: string
): RealEstateTransactionRecord {
  const txRecord = store.getTransaction(transactionId);
  if (!txRecord) {
    throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', `Transaction "${transactionId}" not found.`, 404);
  }
  if (actor.role === 'UNRELATED_USER') {
    throw new RealEstateTransactionError(
      'UNAUTHORIZED_TRANSACTION_ACCESS',
      `Actor "${actor.userId}" is not authorized to access private transaction "${transactionId}".`,
      403
    );
  }
  if (actor.role === 'PLATFORM_VERIFIER_OR_ADMIN' || txRecord.initiatorPartyId === actor.partyId) {
    return txRecord;
  }
  const participants = store.listParticipantsByTransaction(transactionId);
  if (participants.some((p) => p.partyId === actor.partyId)) {
    return txRecord;
  }
  throw new RealEstateTransactionError(
    'UNAUTHORIZED_TRANSACTION_ACCESS',
    `Party "${actor.partyId}" is not a registered participant on transaction "${transactionId}".`,
    403
  );
}

const SALE_INCOMPATIBLE_ROLES: TransactionParticipantRole[] = ['LANDLORD', 'TENANT'];
const RENTAL_INCOMPATIBLE_ROLES: TransactionParticipantRole[] = ['BUYER', 'SELLER', 'CO_BUYER', 'CO_SELLER'];

export class TransactionParticipantOfferAndNegotiationService {
  constructor(
    private readonly store: TransactionalRealEstateTransactionStore,
    private readonly adapters: RealEstateTransactionCrossModuleAdapters
  ) {}

  public async createTransaction(
    actor: TransactionActorContext,
    input: {
      transactionType: RealEstateTransactionType;
      propertyId: string;
      listingReferenceId?: string;
      listingAskingPriceRials?: number;
      jurisdictionCitySlug: string;
      originClassification?: TransactionOriginClassification;
      sourceProvenance: string;
      isSyntheticTestFixture?: boolean;
      idempotencyKey?: string;
    }
  ): Promise<RealEstateTransactionRecord> {
    if (actor.role === 'UNRELATED_USER') {
      throw new RealEstateTransactionError('UNAUTHORIZED_TRANSACTION_ACCESS', 'Unrelated user cannot create transactions.', 403);
    }
    if (!(await this.adapters.propertyRegistry.verifyCanonicalPropertyExists(input.propertyId))) {
      throw new RealEstateTransactionError('INVALID_PROPERTY_REFERENCE', `Property "${input.propertyId}" does not exist.`);
    }

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('transaction', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getTransaction(existingId);
        if (existing) return existing;
      }
      const now = new Date().toISOString();
      const record: RealEstateTransactionRecord = {
        id: makeTxId('retx'),
        transactionType: input.transactionType,
        propertyId: input.propertyId,
        listingReferenceId: input.listingReferenceId,
        listingAskingPriceRials: input.listingAskingPriceRials,
        jurisdictionCitySlug: input.jurisdictionCitySlug,
        initiatorPartyId: actor.partyId,
        participantIds: [actor.partyId],
        status: 'INITIATED',
        originClassification: input.originClassification ?? 'PLATFORM_CREATED_TRANSACTION',
        sourceProvenance: input.sourceProvenance,
        workflowCompletionEqualsLegalCompletion: false,
        isSyntheticTestFixture: Boolean(input.isSyntheticTestFixture),
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveTransaction(record);
      tx.setIdempotentEntityId('transaction', input.idempotencyKey, record.id);
      tx.appendHistory({
        id: makeTxId('txhist'),
        transactionId: record.id,
        propertyId: record.propertyId,
        entityType: 'TRANSACTION',
        actionSummary: `Created transaction (${record.transactionType}) in status ${record.status}.`,
        actorUserId: actor.userId,
        provenanceReference: input.sourceProvenance,
        recordedAtIso: now,
      });
      return record;
    });
  }

  public retrieveTransaction(actor: TransactionActorContext, transactionId: string): RealEstateTransactionRecord {
    return assertTransactionAccess(this.store, actor, transactionId);
  }

  public async registerTransactionParticipant(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      partyId: string;
      role: TransactionParticipantRole;
      effectiveStartIso: string;
      authorizationScope: string;
      supportingEvidenceReference?: string;
    }
  ): Promise<TransactionParticipantRecord> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);

    const isSale = txRecord.transactionType === 'PROPERTY_SALE' || txRecord.transactionType === 'PROPERTY_PURCHASE';
    const isRental =
      txRecord.transactionType === 'RESIDENTIAL_RENTAL' ||
      txRecord.transactionType === 'COMMERCIAL_RENTAL' ||
      txRecord.transactionType === 'LEASE_RENEWAL';

    if (isSale && SALE_INCOMPATIBLE_ROLES.includes(input.role)) {
      throw new RealEstateTransactionError(
        'INCOMPATIBLE_PARTICIPANT_ROLE',
        `Role "${input.role}" is incompatible with sale transaction type "${txRecord.transactionType}".`
      );
    }
    if (isRental && RENTAL_INCOMPATIBLE_ROLES.includes(input.role)) {
      throw new RealEstateTransactionError(
        'INCOMPATIBLE_PARTICIPANT_ROLE',
        `Role "${input.role}" is incompatible with rental transaction type "${txRecord.transactionType}".`
      );
    }

    // Do not infer that a person has authority to sell or rent a property merely because they created a transaction
    let authorityVerified = false;
    if (input.role === 'SELLER' || input.role === 'LANDLORD' || input.role === 'PROPERTY_OWNER') {
      authorityVerified = await this.adapters.propertyOwnership.verifySellerOrLandlordAuthority(
        txRecord.propertyId,
        input.partyId,
        input.supportingEvidenceReference
      );
      if (!authorityVerified) {
        throw new RealEstateTransactionError(
          'UNVERIFIED_SELLER_OR_LANDLORD_AUTHORITY',
          `Party "${input.partyId}" lacks verified ownership or representation authority to act as "${input.role}".`
        );
      }
    } else if (
      input.role === 'BROKERAGE_ORGANIZATION' ||
      input.role === 'LISTING_AGENT' ||
      input.role === 'SELLER_AGENT' ||
      input.role === 'BUYER_AGENT'
    ) {
      authorityVerified = await this.adapters.brokerageOperations.verifyBrokerMandateAuthority(
        txRecord.propertyId,
        input.partyId,
        input.supportingEvidenceReference
      );
    } else {
      authorityVerified = Boolean(input.supportingEvidenceReference);
    }

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const participant: TransactionParticipantRecord = {
        id: makeTxId('txpart'),
        transactionId: txRecord.id,
        propertyId: txRecord.propertyId,
        partyId: input.partyId,
        role: input.role,
        effectiveStartIso: input.effectiveStartIso,
        authorizationScope: input.authorizationScope,
        authorityVerifiedByRegistryOrMandate: authorityVerified,
        supportingEvidenceReference: input.supportingEvidenceReference,
        infersAuthorityFromTransactionCreationAlone: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveParticipant(participant);
      const updatedParticipants = Array.from(new Set([...txRecord.participantIds, input.partyId]));
      tx.saveTransaction({
        ...txRecord,
        participantIds: updatedParticipants,
        version: txRecord.version + 1,
        updatedAt: now,
      });
      return participant;
    });
  }

  public async submitOffer(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      recipientPartyIds: string[];
      offerType: TransactionOfferType;
      proposedAmountRials: number;
      monthlyRentRials?: number;
      securityDepositRials?: number;
      proposedEffectiveDateIso: string;
      expirationDateIso: string;
      conditions?: string[];
      supportingDocumentIds?: string[];
      idempotencyKey?: string;
    }
  ): Promise<TransactionOfferRecord> {
    const txRecord = assertTransactionAccess(this.store, actor, input.transactionId);

    return this.store.runTransaction((tx) => {
      const existingId = tx.getIdempotentEntityId('offer', input.idempotencyKey);
      if (existingId) {
        const existing = tx.getOffer(existingId);
        if (existing) return existing;
      }
      const now = new Date().toISOString();
      const offer: TransactionOfferRecord = {
        id: makeTxId('txoffer'),
        transactionId: txRecord.id,
        propertyId: txRecord.propertyId,
        creatorPartyId: actor.partyId,
        recipientPartyIds: input.recipientPartyIds,
        offerType: input.offerType,
        proposedAmountRials: input.proposedAmountRials,
        monthlyRentRials: input.monthlyRentRials,
        securityDepositRials: input.securityDepositRials,
        currency: 'IRR',
        proposedEffectiveDateIso: input.proposedEffectiveDateIso,
        expirationDateIso: input.expirationDateIso,
        conditions: input.conditions ?? [],
        supportingDocumentIds: input.supportingDocumentIds ?? [],
        status: 'SUBMITTED',
        isLegallyExecutedContractByAcceptanceAlone: false,
        isCompletedSalePrice: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveOffer(offer);
      tx.saveTransaction({
        ...txRecord,
        status: txRecord.status === 'INITIATED' ? 'OFFER_PENDING' : txRecord.status,
        version: txRecord.version + 1,
        updatedAt: now,
      });
      tx.setIdempotentEntityId('offer', input.idempotencyKey, offer.id);
      tx.appendHistory({
        id: makeTxId('txhist'),
        transactionId: txRecord.id,
        propertyId: txRecord.propertyId,
        entityType: 'OFFER',
        actionSummary: `Submitted ${offer.offerType} (${offer.proposedAmountRials} IRR) by ${actor.partyId}.`,
        actorUserId: actor.userId,
        provenanceReference: offer.id,
        recordedAtIso: now,
      });
      return offer;
    });
  }

  public async submitCounteroffer(
    actor: TransactionActorContext,
    input: {
      priorOfferId: string;
      proposedAmountRials: number;
      monthlyRentRials?: number;
      securityDepositRials?: number;
      proposedEffectiveDateIso: string;
      expirationDateIso: string;
      conditions?: string[];
    }
  ): Promise<{ supersededOffer: TransactionOfferRecord; counteroffer: TransactionOfferRecord }> {
    const priorOffer = this.store.getOffer(input.priorOfferId);
    if (!priorOffer) {
      throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', `Offer "${input.priorOfferId}" not found.`, 404);
    }
    const txRecord = assertTransactionAccess(this.store, actor, priorOffer.transactionId);

    return this.store.runTransaction((tx) => {
      const now = new Date().toISOString();
      const counterId = makeTxId('txoffer');
      const supersededOffer: TransactionOfferRecord = {
        ...priorOffer,
        status: 'SUPERSEDED',
        supersededByOfferId: counterId,
        updatedAt: now,
      };
      const counteroffer: TransactionOfferRecord = {
        id: counterId,
        transactionId: priorOffer.transactionId,
        propertyId: priorOffer.propertyId,
        creatorPartyId: actor.partyId,
        recipientPartyIds: [priorOffer.creatorPartyId],
        offerType: 'COUNTEROFFER',
        proposedAmountRials: input.proposedAmountRials,
        monthlyRentRials: input.monthlyRentRials ?? priorOffer.monthlyRentRials,
        securityDepositRials: input.securityDepositRials ?? priorOffer.securityDepositRials,
        currency: 'IRR',
        proposedEffectiveDateIso: input.proposedEffectiveDateIso,
        expirationDateIso: input.expirationDateIso,
        conditions: input.conditions ?? priorOffer.conditions,
        supportingDocumentIds: [],
        status: 'SUBMITTED',
        parentOfferId: priorOffer.id,
        isLegallyExecutedContractByAcceptanceAlone: false,
        isCompletedSalePrice: false,
        version: priorOffer.version + 1,
        createdAt: now,
        updatedAt: now,
      };
      tx.saveOffer(supersededOffer);
      tx.saveOffer(counteroffer);
      tx.saveTransaction({
        ...txRecord,
        status: 'NEGOTIATION',
        version: txRecord.version + 1,
        updatedAt: now,
      });
      return { supersededOffer, counteroffer };
    });
  }

  public async acceptOffer(
    actor: TransactionActorContext,
    input: { offerId: string; asOfIso?: string }
  ): Promise<{ acceptedOffer: TransactionOfferRecord; transaction: RealEstateTransactionRecord }> {
    const offer = this.store.getOffer(input.offerId);
    if (!offer) {
      throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', `Offer "${input.offerId}" not found.`, 404);
    }
    const txRecord = assertTransactionAccess(this.store, actor, offer.transactionId);

    if (!offer.recipientPartyIds.includes(actor.partyId) && actor.role !== 'PLATFORM_VERIFIER_OR_ADMIN') {
      throw new RealEstateTransactionError(
        'UNAUTHORIZED_OFFER_ACCEPTANCE',
        `Party "${actor.partyId}" is not an authorized recipient of offer "${offer.id}".`,
        403
      );
    }

    const nowIso = input.asOfIso ?? new Date().toISOString();
    if (
      offer.status === 'SUPERSEDED' ||
      offer.status === 'EXPIRED' ||
      offer.status === 'WITHDRAWN' ||
      new Date(offer.expirationDateIso).getTime() < new Date(nowIso).getTime()
    ) {
      throw new RealEstateTransactionError(
        'EXPIRED_OR_SUPERSEDED_OFFER_CANNOT_BE_ACCEPTED',
        `Offer "${offer.id}" is ${offer.status} or expired and cannot be accepted.`
      );
    }

    // Two competing offers must not both be accepted when the transaction rules prohibit it
    if (txRecord.acceptedOfferId && txRecord.acceptedOfferId !== offer.id) {
      throw new RealEstateTransactionError(
        'CONCURRENT_OFFER_ACCEPTANCE_CONFLICT',
        `Transaction "${txRecord.id}" already has an accepted offer "${txRecord.acceptedOfferId}".`,
        409
      );
    }

    return this.store.runTransaction((tx) => {
      const acceptedOffer: TransactionOfferRecord = {
        ...offer,
        status: 'ACCEPTED',
        acceptedByPartyId: actor.partyId,
        acceptedAtIso: nowIso,
        updatedAt: nowIso,
      };
      const updatedTx: RealEstateTransactionRecord = {
        ...txRecord,
        acceptedOfferId: acceptedOffer.id,
        status: 'OFFER_ACCEPTED',
        version: txRecord.version + 1,
        updatedAt: nowIso,
      };
      tx.saveOffer(acceptedOffer);
      tx.saveTransaction(updatedTx);
      tx.appendHistory({
        id: makeTxId('txhist'),
        transactionId: txRecord.id,
        propertyId: txRecord.propertyId,
        entityType: 'OFFER',
        actionSummary: `Accepted offer ${acceptedOffer.id} (${acceptedOffer.proposedAmountRials} IRR) by ${actor.partyId}; not yet an executed contract.`,
        actorUserId: actor.userId,
        provenanceReference: acceptedOffer.id,
        recordedAtIso: nowIso,
      });
      return { acceptedOffer, transaction: updatedTx };
    });
  }

  public async registerNegotiationEntry(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      relatedOfferId?: string;
      relatedOfferVersion?: number;
      visibilityScope: NegotiationVisibilityScope;
      negotiationCategory: NegotiationEntryRecord['negotiationCategory'];
      structuredProposalSummary: string;
      supportingDocumentId?: string;
    }
  ): Promise<NegotiationEntryRecord> {
    assertTransactionAccess(this.store, actor, input.transactionId);
    return this.store.runTransaction((tx) => {
      const entry: NegotiationEntryRecord = {
        id: makeTxId('txneg'),
        transactionId: input.transactionId,
        relatedOfferId: input.relatedOfferId,
        relatedOfferVersion: input.relatedOfferVersion,
        authorPartyId: actor.partyId,
        authorBrokerageId: actor.brokerageId,
        visibilityScope: input.visibilityScope,
        negotiationCategory: input.negotiationCategory,
        structuredProposalSummary: input.structuredProposalSummary,
        supportingDocumentId: input.supportingDocumentId,
        recordedAtIso: new Date().toISOString(),
      };
      tx.appendNegotiation(entry);
      return entry;
    });
  }

  public retrieveNegotiationEntries(
    actor: TransactionActorContext,
    transactionId: string
  ): NegotiationEntryRecord[] {
    assertTransactionAccess(this.store, actor, transactionId);
    const all = this.store.listNegotiationsByTransaction(transactionId);
    return all.filter((entry) => {
      if (entry.visibilityScope === 'SHARED_PARTICIPANTS') return true;
      if (entry.visibilityScope === 'PRIVATE_PARTICIPANT_NOTE') {
        return entry.authorPartyId === actor.partyId;
      }
      if (entry.visibilityScope === 'INTERNAL_BROKERAGE_NOTE') {
        return Boolean(actor.brokerageId && entry.authorBrokerageId === actor.brokerageId);
      }
      return false;
    });
  }
}
