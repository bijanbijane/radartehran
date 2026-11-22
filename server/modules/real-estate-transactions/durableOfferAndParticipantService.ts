/**
 * @file server/modules/real-estate-transactions/durableOfferAndParticipantService.ts
 * @description RT-TRANSACTION-CRITICAL-030 — Transactional case creation, participant
 * registration/response, offer/counteroffer submission, and single-winner atomic offer
 * decision operations backed by FirestoreRealEstateTransactionStore.
 */
import crypto from 'node:crypto';
import type { RealEstateTransactionCrossModuleAdapters } from './store';
import type {
  RealEstateTransactionRecord,
  RealEstateTransactionType,
  TransactionActorContext,
  TransactionHistoryEntryRecord,
  TransactionOfferRecord,
  TransactionParticipantRecord,
  TransactionParticipantRole,
} from './types';
import { RealEstateTransactionError } from './types';
import {
  REAL_ESTATE_TRANSACTION_COLLECTIONS,
  type FirestoreRealEstateTransactionStore,
} from './firestoreStore';

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function makeTxId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

export function buildTxIdemDocId(scope: string, actorId: string, key: string): string {
  return `retidem_${sha256Hex(`${scope}\0${actorId}\0${key}`).slice(0, 40)}`;
}

export function assertExpectedTxRevision(actual: number, expected?: number): void {
  if (typeof expected === 'number' && actual !== expected) {
    throw new RealEstateTransactionError(
      'CONCURRENT_MODIFICATION_CONFLICT',
      `Transaction revision mismatch: expected ${expected}, actual ${actual}.`,
      409,
    );
  }
}

export function assertTxParticipantOrAdmin(
  txRecord: RealEstateTransactionRecord,
  participants: TransactionParticipantRecord[],
  actor: TransactionActorContext,
): void {
  if (actor.role === 'UNRELATED_USER') {
    throw new RealEstateTransactionError('UNAUTHORIZED_TRANSACTION_ACCESS', 'دسترسی به معامله خصوصی مجاز نیست.', 403);
  }
  if (actor.role === 'PLATFORM_VERIFIER_OR_ADMIN') return;
  if (txRecord.initiatorPartyId === actor.partyId || txRecord.participantIds.includes(actor.partyId)) return;
  if (participants.some((p) => p.partyId === actor.partyId)) return;
  throw new RealEstateTransactionError(
    'UNAUTHORIZED_TRANSACTION_ACCESS',
    `طرف «${actor.partyId}» عضو مجاز معامله «${txRecord.id}» نیست.`,
    403,
  );
}

export class DurableOfferAndParticipantService {
  constructor(
    private readonly store: FirestoreRealEstateTransactionStore,
    private readonly adapters: RealEstateTransactionCrossModuleAdapters,
  ) {}

  public async createTransactionCase(
    actor: TransactionActorContext,
    input: {
      transactionType: RealEstateTransactionType;
      propertyId: string;
      jurisdictionCitySlug: string;
      sourceProvenance: string;
      listingReferenceId?: string;
      listingAskingPriceRials?: number;
      idempotencyKey: string;
    },
  ): Promise<{ transaction: RealEstateTransactionRecord; replayed: boolean }> {
    if (actor.role === 'UNRELATED_USER') {
      throw new RealEstateTransactionError('UNAUTHORIZED_TRANSACTION_ACCESS', 'کاربر غیرمجاز نمی‌تواند معامله ایجاد کند.', 403);
    }
    if (!input.idempotencyKey || input.idempotencyKey.trim().length < 6) {
      throw new RealEstateTransactionError('INVALID_INPUT', 'کلید یکتای درخواست (Idempotency-Key) الزامی است.', 400);
    }
    const propertyExists = await this.adapters.propertyRegistry.verifyCanonicalPropertyExists(input.propertyId);
    if (!propertyExists) {
      throw new RealEstateTransactionError(
        'INVALID_PROPERTY_REFERENCE',
        `ملک canonical «${input.propertyId}» در Property Registry تایید نشد.`,
        400,
      );
    }

    const idemId = buildTxIdemDocId('create_tx', actor.userId, input.idempotencyKey.trim());
    const payloadHash = sha256Hex(JSON.stringify([input.transactionType, input.propertyId, input.jurisdictionCitySlug]));
    const nowIso = new Date().toISOString();

    return this.store.runTransaction(async (tx) => {
      const existingIdem = await tx.get<Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.idempotency, idemId);
      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          throw new RealEstateTransactionError('IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD', 409);
        }
        const existingTx = await tx.get<RealEstateTransactionRecord & Record<string, unknown>>(
          REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions,
          String(existingIdem.entityId),
        );
        if (existingTx) return { transaction: existingTx, replayed: true };
      }

      const txId = makeTxId('retx');
      const record: RealEstateTransactionRecord = {
        id: txId,
        transactionType: input.transactionType,
        propertyId: input.propertyId,
        listingReferenceId: input.listingReferenceId,
        listingAskingPriceRials: input.listingAskingPriceRials,
        jurisdictionCitySlug: input.jurisdictionCitySlug,
        initiatorPartyId: actor.partyId,
        participantIds: [actor.partyId],
        status: 'INITIATED',
        originClassification: 'PLATFORM_CREATED_TRANSACTION',
        sourceProvenance: input.sourceProvenance,
        workflowCompletionEqualsLegalCompletion: false,
        isSyntheticTestFixture: false,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const hist: TransactionHistoryEntryRecord = {
        id: makeTxId('txhist'),
        transactionId: txId,
        propertyId: input.propertyId,
        entityType: 'TRANSACTION',
        actionSummary: `Created transaction (${input.transactionType}) in status INITIATED.`,
        actorUserId: actor.userId,
        provenanceReference: input.sourceProvenance,
        recordedAtIso: nowIso,
      };
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, txId, record as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.history, hist.id, hist as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.idempotency, idemId, {
        id: idemId,
        scope: 'create_tx',
        payloadHash,
        entityId: txId,
        createdAtIso: nowIso,
      });
      return { transaction: record, replayed: false };
    });
  }

  public async getTransactionCaseById(
    actor: TransactionActorContext,
    transactionId: string,
  ): Promise<{ transaction: RealEstateTransactionRecord; participants: TransactionParticipantRecord[]; offers: TransactionOfferRecord[] }> {
    const txRecord = await this.store.getTransaction(transactionId);
    if (!txRecord) {
      throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', `Transaction "${transactionId}" not found.`, 404);
    }
    const participants = await this.store.listParticipants(transactionId);
    assertTxParticipantOrAdmin(txRecord, participants, actor);
    const offers = await this.store.listOffers(transactionId);
    return { transaction: txRecord, participants, offers };
  }

  public async inviteParticipant(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      partyId: string;
      role: TransactionParticipantRole;
      authorizationScope: string;
      supportingEvidenceReference?: string;
      expectedRevision?: number;
      idempotencyKey: string;
    },
  ): Promise<TransactionParticipantRecord> {
    const txPre = await this.store.getTransaction(input.transactionId);
    if (!txPre) throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'معامله یافت نشد.', 404);

    let authorityVerified = false;
    if (input.role === 'SELLER' || input.role === 'LANDLORD' || input.role === 'PROPERTY_OWNER' || input.role === 'AUTHORIZED_REPRESENTATIVE') {
      authorityVerified = await this.adapters.propertyOwnership.verifySellerOrLandlordAuthority(
        txPre.propertyId,
        input.partyId,
        input.supportingEvidenceReference,
      );
      if (!authorityVerified) {
        throw new RealEstateTransactionError(
          'UNVERIFIED_SELLER_OR_LANDLORD_AUTHORITY',
          'اختیار مالکیت یا نمایندگی از منبع رسمی Property Ownership تایید نشد.',
          403,
        );
      }
    } else if (['BROKERAGE_ORGANIZATION', 'LISTING_AGENT', 'SELLER_AGENT', 'BUYER_AGENT'].includes(input.role)) {
      authorityVerified = await this.adapters.brokerageOperations.verifyBrokerMandateAuthority(
        txPre.propertyId,
        input.partyId,
        input.supportingEvidenceReference,
      );
      if (!authorityVerified) {
        throw new RealEstateTransactionError(
          'UNVERIFIED_BROKER_MANDATE',
          'قرارداد نمایندگی (Mandate) معتبر در Brokerage Operations یافت نشد.',
          403,
        );
      }
    } else {
      authorityVerified = true;
    }

    const idemId = buildTxIdemDocId('invite_part', actor.userId, input.idempotencyKey.trim());
    const payloadHash = sha256Hex(JSON.stringify([input.transactionId, input.partyId, input.role]));
    const nowIso = new Date().toISOString();

    const saved = await this.store.runTransaction(async (tx) => {
      const [txRec, existingIdem, participants] = await Promise.all([
        tx.get<RealEstateTransactionRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, input.transactionId),
        tx.get<Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.idempotency, idemId),
        tx.query<TransactionParticipantRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
      ]);
      if (!txRec) throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'معامله یافت نشد.', 404);
      assertTxParticipantOrAdmin(txRec, participants, actor);
      assertExpectedTxRevision(txRec.version, input.expectedRevision);

      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          throw new RealEstateTransactionError('IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD', 409);
        }
        const existingPart = participants.find((p) => p.id === existingIdem.entityId);
        if (existingPart) return existingPart;
      }

      const partId = makeTxId('txpart');
      const participant: TransactionParticipantRecord = {
        id: partId,
        transactionId: txRec.id,
        propertyId: txRec.propertyId,
        partyId: input.partyId,
        role: input.role,
        effectiveStartIso: nowIso,
        authorizationScope: input.authorizationScope,
        authorityVerifiedByRegistryOrMandate: authorityVerified,
        supportingEvidenceReference: input.supportingEvidenceReference,
        infersAuthorityFromTransactionCreationAlone: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const nextPartIds = txRec.participantIds.includes(input.partyId)
        ? txRec.participantIds
        : [...txRec.participantIds, input.partyId];

      const histId = makeTxId('txhist');
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, partId, { ...participant, invitationStatus: 'INVITED' } as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, txRec.id, {
        ...txRec,
        participantIds: nextPartIds,
        version: txRec.version + 1,
        updatedAt: nowIso,
      } as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.history, histId, {
        id: histId,
        transactionId: txRec.id,
        propertyId: txRec.propertyId,
        entityType: 'PARTICIPANT',
        actionSummary: `Registered verified participant ${input.partyId} as ${input.role}.`,
        actorUserId: actor.userId,
        recordedAtIso: nowIso,
      });
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.idempotency, idemId, {
        id: idemId,
        scope: 'invite_part',
        payloadHash,
        entityId: partId,
        createdAtIso: nowIso,
      });
      return participant;
    });

    await this.adapters.notifications.notifyTransactionEvent('PARTICIPANT_INVITED', [input.partyId]);
    return saved;
  }

  public async respondToParticipantInvitation(
    actor: TransactionActorContext,
    input: { transactionId: string; participantId: string; response: 'ACCEPTED' | 'DECLINED' },
  ): Promise<Record<string, unknown>> {
    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const [txRec, part] = await Promise.all([
        tx.get<RealEstateTransactionRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, input.transactionId),
        tx.get<TransactionParticipantRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, input.participantId),
      ]);
      if (!txRec || !part || part.transactionId !== input.transactionId) {
        throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'دعوت مشارکت‌کننده یافت نشد.', 404);
      }
      if (part.partyId !== actor.partyId && actor.role !== 'PLATFORM_VERIFIER_OR_ADMIN') {
        throw new RealEstateTransactionError('UNAUTHORIZED_TRANSACTION_ACCESS', 'فقط فرد دعوت‌شده می‌تواند به دعوت پاسخ دهد.', 403);
      }
      const updated = { ...part, invitationStatus: input.response, updatedAt: nowIso };
      const histId = makeTxId('txhist');
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, part.id, updated);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.history, histId, {
        id: histId,
        transactionId: txRec.id,
        propertyId: txRec.propertyId,
        entityType: 'PARTICIPANT',
        actionSummary: `Participant ${part.partyId} responded ${input.response}.`,
        actorUserId: actor.userId,
        recordedAtIso: nowIso,
      });
      return updated;
    });
  }

  public async submitOfferOrCounteroffer(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      offerType: TransactionOfferRecord['offerType'];
      proposedPriceRials: number;
      recipientPartyIds: string[];
      conditions?: string[];
      supersedesOfferId?: string;
      idempotencyKey: string;
    },
  ): Promise<{ offer: TransactionOfferRecord; replayed: boolean }> {
    if (!Number.isFinite(input.proposedPriceRials) || input.proposedPriceRials <= 0) {
      throw new RealEstateTransactionError('INVALID_INPUT', 'مبلغ پیشنهادی باید عدد مثبت باشد.', 400);
    }
    const idemId = buildTxIdemDocId('submit_offer', actor.userId, input.idempotencyKey.trim());
    const payloadHash = sha256Hex(JSON.stringify([input.transactionId, input.offerType, input.proposedPriceRials, input.recipientPartyIds]));
    const nowIso = new Date().toISOString();

    return this.store.runTransaction(async (tx) => {
      const [txRec, existingIdem, participants, existingOffers] = await Promise.all([
        tx.get<RealEstateTransactionRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, input.transactionId),
        tx.get<Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.idempotency, idemId),
        tx.query<TransactionParticipantRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
        tx.query<TransactionOfferRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.offers, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
      ]);
      if (!txRec) throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'معامله یافت نشد.', 404);
      assertTxParticipantOrAdmin(txRec, participants, actor);

      if (existingIdem) {
        if (existingIdem.payloadHash !== payloadHash) {
          throw new RealEstateTransactionError('IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD', 409);
        }
        const found = existingOffers.find((o) => o.id === existingIdem.entityId);
        if (found) return { offer: found, replayed: true };
      }

      if (existingOffers.some((o) => o.status === 'ACCEPTED')) {
        throw new RealEstateTransactionError('OFFER_ALREADY_ACCEPTED', 'پیش‌تر پیشنهادی برای این معامله پذیرفته شده است.', 409);
      }

      const duplicateActive = existingOffers.find(
        (o) =>
          o.creatorPartyId === actor.partyId &&
          o.proposedAmountRials === input.proposedPriceRials &&
          (o.status === 'SUBMITTED' || o.status === 'UNDER_REVIEW'),
      );
      if (duplicateActive) {
        throw new RealEstateTransactionError('DUPLICATE_ACTIVE_OFFER', 'پیشنهاد فعال تکراری با همین مبلغ قبلاً ثبت شده است.', 409);
      }

      const offerId = makeTxId('txoff');
      const offer: TransactionOfferRecord = {
        id: offerId,
        transactionId: txRec.id,
        propertyId: txRec.propertyId,
        offerType: input.offerType,
        creatorPartyId: actor.partyId,
        recipientPartyIds: [...input.recipientPartyIds],
        proposedAmountRials: Math.round(input.proposedPriceRials),
        currency: 'IRR',
        proposedEffectiveDateIso: nowIso,
        expirationDateIso: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        conditions: [...(input.conditions ?? [])],
        supportingDocumentIds: [],
        parentOfferId: input.supersedesOfferId,
        status: 'SUBMITTED',
        isLegallyExecutedContractByAcceptanceAlone: false,
        isCompletedSalePrice: false,
        version: existingOffers.length + 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const histId = makeTxId('txhist');
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.offers, offerId, offer as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, txRec.id, { ...txRec, status: 'NEGOTIATION', version: txRec.version + 1, updatedAt: nowIso } as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.history, histId, {
        id: histId, transactionId: txRec.id, propertyId: txRec.propertyId, entityType: 'OFFER',
        actionSummary: `Submitted offer ${offerId} (${offer.proposedAmountRials} IRR).`, actorUserId: actor.userId, recordedAtIso: nowIso,
      });
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.idempotency, idemId, {
        id: idemId,
        scope: 'submit_offer',
        payloadHash,
        entityId: offerId,
        createdAtIso: nowIso,
      });
      return { offer, replayed: false };
    });
  }

  public async decideOnOffer(
    actor: TransactionActorContext,
    input: {
      transactionId: string;
      offerId: string;
      decision: 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
      expectedRevision?: number;
    },
  ): Promise<{ offer: TransactionOfferRecord; transaction: RealEstateTransactionRecord }> {
    const nowIso = new Date().toISOString();
    return this.store.runTransaction(async (tx) => {
      const [txRec, offer, participants, allOffers] = await Promise.all([
        tx.get<RealEstateTransactionRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, input.transactionId),
        tx.get<TransactionOfferRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.offers, input.offerId),
        tx.query<TransactionParticipantRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.participants, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
        tx.query<TransactionOfferRecord & Record<string, unknown>>(REAL_ESTATE_TRANSACTION_COLLECTIONS.offers, [
          { field: 'transactionId', op: '==', value: input.transactionId },
        ]),
      ]);
      if (!txRec || !offer || offer.transactionId !== input.transactionId) {
        throw new RealEstateTransactionError('RESOURCE_NOT_FOUND', 'پیشنهاد یا معامله یافت نشد.', 404);
      }
      assertTxParticipantOrAdmin(txRec, participants, actor);
      assertExpectedTxRevision(txRec.version, input.expectedRevision);

      if (offer.status !== 'SUBMITTED' && offer.status !== 'UNDER_REVIEW') {
        throw new RealEstateTransactionError('INVALID_OFFER_TRANSITION', `پیشنهاد در وضعیت ${offer.status} قابل تصمیم‌گیری نیست.`, 409);
      }
      if (input.decision === 'ACCEPTED') {
        if (offer.creatorPartyId === actor.partyId) {
          throw new RealEstateTransactionError('SELF_ACCEPTANCE_FORBIDDEN', 'ارائه‌دهنده پیشنهاد مجاز به پذیرش پیشنهاد خود نیست.', 403);
        }
        const alreadyAccepted = allOffers.find((o) => o.status === 'ACCEPTED');
        if (alreadyAccepted) {
          throw new RealEstateTransactionError(
            'CONCURRENT_OFFER_ACCEPTANCE_CONFLICT',
            `پیشنهاد رقیب «${alreadyAccepted.id}» قبلاً به‌صورت اتمیک پذیرفته شده است.`,
            409,
          );
        }
      }

      const updatedOffer: TransactionOfferRecord = { ...offer, status: input.decision, updatedAt: nowIso };
      const updatedTx: RealEstateTransactionRecord = {
        ...txRec,
        status: input.decision === 'ACCEPTED' ? 'OFFER_ACCEPTED' : txRec.status,
        version: txRec.version + 1,
        updatedAt: nowIso,
      };
      const histId = makeTxId('txhist');
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.offers, offer.id, updatedOffer as unknown as Record<string, unknown>);
      if (input.decision === 'ACCEPTED') {
        for (const rival of allOffers) {
          if (rival.id !== offer.id && (rival.status === 'SUBMITTED' || rival.status === 'UNDER_REVIEW')) {
            tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.offers, rival.id, {
              ...rival,
              status: 'SUPERSEDED',
              updatedAt: nowIso,
            } as unknown as Record<string, unknown>);
          }
        }
      }
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.transactions, txRec.id, updatedTx as unknown as Record<string, unknown>);
      tx.set(REAL_ESTATE_TRANSACTION_COLLECTIONS.history, histId, {
        id: histId,
        transactionId: txRec.id,
        propertyId: txRec.propertyId,
        entityType: 'OFFER',
        actionSummary: `Offer ${offer.id} marked ${input.decision}.`,
        actorUserId: actor.userId,
        recordedAtIso: nowIso,
      });
      return { offer: updatedOffer, transaction: updatedTx };
    });
  }
}
