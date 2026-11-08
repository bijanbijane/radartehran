import crypto from 'crypto';
import {
  CoreApiError,
  runDurableTransaction,
  type AuthenticatedPrincipal,
  type TransactionContextLike,
} from '../core';
import {
  assertExpectedTransactionVersion,
  assertTransactionNotSuspended,
  isPrincipalPartyCounterpart,
  validateTransactionStateTransition,
  verifyParticipantPermission,
} from './stateMachineAndAuthz';
import {
  validateDecideOfferInput,
  validateNegotiationEntryInput,
  validateSubmitOfferInput,
} from './validation';
import type {
  NegotiationEntryRecord,
  StoredTransactionDocument,
  TransactionHistoryEventRecord,
  TransactionMilestoneRecord,
  TransactionOfferRecord,
  TransactionParticipantRecord,
  TransactionsModuleDependencies,
} from './types';

export interface OfferOpsHelpers {
  loadTransactionAndParticipants: (
    tx: TransactionContextLike,
    transactionId: string,
  ) => Promise<{
    txDoc: StoredTransactionDocument;
    participants: TransactionParticipantRecord[];
  }>;
  appendHistoryInTx: (
    tx: TransactionContextLike,
    txDoc: StoredTransactionDocument,
    params: {
      eventType: TransactionHistoryEventRecord['eventType'];
      actorUid: string;
      actorRole: string;
      fromStatus?: StoredTransactionDocument['status'];
      toStatus?: StoredTransactionDocument['status'];
      summary: string;
      metadata?: Record<string, unknown>;
      nowIso: string;
    },
  ) => number;
  emitNotification: (
    transactionId: string,
    eventType: string,
    recipientUids: string[],
    actorUid: string,
    summary: string,
    nowIso: string,
  ) => Promise<void>;
  emitTelemetry: (
    txDoc: StoredTransactionDocument,
    eventName: string,
    metrics: Record<string, number>,
    nowMs: number,
  ) => void;
}

export function createOfferAndNegotiationOps(
  deps: TransactionsModuleDependencies,
  helpers: OfferOpsHelpers,
) {
  const nowFn = deps.nowFn ?? (() => Date.now());

  return {
    async submitOffer(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ offer: TransactionOfferRecord; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateSubmitOfferInput(params.rawBody, nowMs);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid offer payload.', validation.issues);
      }
      const input = validation.value;

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.submit_offer', maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, false);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.submit_offer');

          const actorPart = verifyParticipantPermission(participants, params.principal.uid, 'offer:submit');

          if (txDoc.acceptedOfferId) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              'An offer has already been accepted for this transaction; new offers cannot silently replace an accepted offer.',
            );
          }

          if (!['OPEN', 'OFFER_PENDING', 'NEGOTIATION'].includes(txDoc.status)) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `Cannot submit an offer when transaction is in "${txDoc.status}" state.`,
            );
          }

          if (input.currency !== txDoc.monetary.currency) {
            throw new CoreApiError(
              'VALIDATION_FAILED',
              400,
              `Offer currency "${input.currency}" must match transaction currency "${txDoc.monetary.currency}".`,
            );
          }

          let revision = 1;
          if (input.parentOfferId) {
            const parentSnap = await tx.get<TransactionOfferRecord>(
              `transactionOffers/${params.transactionId}_${input.parentOfferId}`,
            );
            if (!parentSnap.exists || !parentSnap.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Parent offer "${input.parentOfferId}" was not found.`);
            }
            const parentOffer = parentSnap.data;
            if (parentOffer.status !== 'SUBMITTED') {
              throw new CoreApiError(
                'CONFLICT',
                409,
                `Cannot counter parent offer "${input.parentOfferId}" in status "${parentOffer.status}".`,
              );
            }
            if (parentOffer.authorUid === params.principal.uid) {
              throw new CoreApiError('CONFLICT', 409, 'Participant cannot counter their own offer.');
            }
            revision = parentOffer.revision + 1;
            const updatedParent: TransactionOfferRecord = {
              ...parentOffer,
              status: 'COUNTERED',
              updatedAtIso: nowIso,
              decidedByUid: params.principal.uid,
              decidedAtIso: nowIso,
            };
            tx.set(
              `transactionOffers/${params.transactionId}_${parentOffer.offerId}`,
              updatedParent as unknown as Record<string, unknown>,
            );
          }

          const offerId = `off_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
          const offer: TransactionOfferRecord = {
            offerId,
            transactionId: params.transactionId,
            authorUid: params.principal.uid,
            authorRole: actorPart.role,
            amount: input.amount,
            ...(input.depositAmount !== undefined ? { depositAmount: input.depositAmount } : {}),
            ...(input.monthlyRentAmount !== undefined ? { monthlyRentAmount: input.monthlyRentAmount } : {}),
            currency: input.currency,
            conditions: input.conditions,
            ...(input.expiresAtIso ? { expiresAtIso: input.expiresAtIso } : {}),
            status: 'SUBMITTED',
            ...(input.parentOfferId ? { parentOfferId: input.parentOfferId } : {}),
            revision,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          };

          const nextStatus = input.parentOfferId
            ? 'NEGOTIATION'
            : txDoc.status === 'OPEN'
              ? 'OFFER_PENDING'
              : txDoc.status;
          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: input.parentOfferId ? 'COUNTEROFFER_SUBMITTED' : 'OFFER_SUBMITTED',
            actorUid: params.principal.uid,
            actorRole: actorPart.role,
            fromStatus: txDoc.status,
            toStatus: nextStatus,
            summary: input.parentOfferId
              ? `Counteroffer ${offerId} submitted against ${input.parentOfferId}.`
              : `Offer ${offerId} submitted.`,
            metadata: { offerId, amount: offer.amount, currency: offer.currency, revision },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            status: nextStatus,
            version: nextVersion,
            negotiationStatus: input.parentOfferId ? 'OPEN' : txDoc.negotiationStatus,
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
          };

          tx.set(
            `transactionOffers/${params.transactionId}_${offerId}`,
            offer as unknown as Record<string, unknown>,
          );
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);

          return { offer, updatedTx };
        },
      );

      await helpers.emitNotification(
        params.transactionId,
        input.parentOfferId ? 'transaction.counteroffer_submitted' : 'transaction.offer_submitted',
        result.updatedTx.activeParticipantUids.filter((u) => u !== params.principal.uid),
        params.principal.uid,
        `New offer ${result.offer.offerId} submitted on transaction ${params.transactionId}.`,
        nowIso,
      );
      helpers.emitTelemetry(result.updatedTx, 'transaction_offer_submitted', { amount: result.offer.amount }, nowMs);

      return { offer: result.offer, transactionVersion: result.updatedTx.version };
    },

    async decideOffer(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      offerId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ offer: TransactionOfferRecord; transactionStatus: StoredTransactionDocument['status']; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateDecideOfferInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid offer decision payload.', validation.issues);
      }
      const input = validation.value;

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.decide_offer', maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, false);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.decide_offer');

          const offerDocPath = `transactionOffers/${params.transactionId}_${params.offerId}`;
          const offerSnap = await tx.get<TransactionOfferRecord>(offerDocPath);
          if (!offerSnap.exists || !offerSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Offer "${params.offerId}" was not found.`);
          }
          const offer = offerSnap.data;

          const isExpired = offer.expiresAtIso ? Date.parse(offer.expiresAtIso) <= nowMs : false;
          if (isExpired && offer.status === 'SUBMITTED') {
            const expiredOffer: TransactionOfferRecord = {
              ...offer,
              status: 'EXPIRED',
              updatedAtIso: nowIso,
            };
            tx.set(offerDocPath, expiredOffer as unknown as Record<string, unknown>);
            throw new CoreApiError('CONFLICT', 409, `Offer "${params.offerId}" has expired.`);
          }

          if (offer.status !== 'SUBMITTED') {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `Offer "${params.offerId}" is in status "${offer.status}" and cannot be modified.`,
            );
          }

          if (input.decision === 'WITHDRAW') {
            if (offer.authorUid !== params.principal.uid) {
              throw new CoreApiError('FORBIDDEN', 403, 'Only the offer author can withdraw their offer.');
            }
            const actorPart = verifyParticipantPermission(participants, params.principal.uid, 'offer:submit');
            const withdrawn: TransactionOfferRecord = {
              ...offer,
              status: 'WITHDRAWN',
              updatedAtIso: nowIso,
              decidedByUid: params.principal.uid,
              decidedAtIso: nowIso,
              ...(input.note ? { decisionNote: input.note } : {}),
            };
            const nextVersion = txDoc.version + 1;
            const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
              eventType: 'OFFER_WITHDRAWN',
              actorUid: params.principal.uid,
              actorRole: actorPart.role,
              summary: `Offer ${offer.offerId} withdrawn by author.`,
              metadata: { offerId: offer.offerId },
              nowIso,
            });
            const updatedTx: StoredTransactionDocument = {
              ...txDoc,
              version: nextVersion,
              historyCount: nextHistoryCount,
              updatedAtIso: nowIso,
            };
            tx.set(offerDocPath, withdrawn as unknown as Record<string, unknown>);
            tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);
            return { offer: withdrawn, updatedTx };
          }

          const actorPart = verifyParticipantPermission(participants, params.principal.uid, 'offer:decide');
          if (offer.authorUid === params.principal.uid) {
            throw new CoreApiError('FORBIDDEN', 403, 'Offer author cannot accept or reject their own offer.');
          }
          if (!isPrincipalPartyCounterpart(txDoc.transactionType, offer.authorRole, actorPart.role)) {
            throw new CoreApiError(
              'FORBIDDEN',
              403,
              `Role "${actorPart.role}" is not an authorized counterpart to decide an offer from "${offer.authorRole}".`,
            );
          }

          if (input.decision === 'REJECT') {
            const rejected: TransactionOfferRecord = {
              ...offer,
              status: 'REJECTED',
              updatedAtIso: nowIso,
              decidedByUid: params.principal.uid,
              decidedAtIso: nowIso,
              ...(input.note ? { decisionNote: input.note } : {}),
            };
            const nextVersion = txDoc.version + 1;
            const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
              eventType: 'OFFER_REJECTED',
              actorUid: params.principal.uid,
              actorRole: actorPart.role,
              summary: `Offer ${offer.offerId} rejected.`,
              metadata: { offerId: offer.offerId },
              nowIso,
            });
            const updatedTx: StoredTransactionDocument = {
              ...txDoc,
              version: nextVersion,
              historyCount: nextHistoryCount,
              updatedAtIso: nowIso,
            };
            tx.set(offerDocPath, rejected as unknown as Record<string, unknown>);
            tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);
            return { offer: rejected, updatedTx };
          }

          // ACCEPT branch: enforce single accepted offer invariant
          if (txDoc.acceptedOfferId) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `Transaction already has an accepted offer ("${txDoc.acceptedOfferId}"). Concurrent acceptance prevented.`,
            );
          }

          const candidateTxForTransition: StoredTransactionDocument = {
            ...txDoc,
            acceptedOfferId: offer.offerId,
          };
          const transitionCheck = validateTransactionStateTransition({
            txDoc: candidateTxForTransition,
            targetStatus: 'AGREEMENT_PENDING',
            actorRole: actorPart.role,
            viaWorkflowEngine: true,
          });
          if (!transitionCheck.allowed) {
            throw new CoreApiError('CONFLICT', 409, transitionCheck.reason ?? 'Cannot transition to AGREEMENT_PENDING.');
          }

          const accepted: TransactionOfferRecord = {
            ...offer,
            status: 'ACCEPTED',
            updatedAtIso: nowIso,
            decidedByUid: params.principal.uid,
            decidedAtIso: nowIso,
            ...(input.note ? { decisionNote: input.note } : {}),
          };

          const msPath = `transactionMilestones/${params.transactionId}_ms_${params.transactionId}_offer_accepted`;
          const msSnap = await tx.get<TransactionMilestoneRecord>(msPath);
          if (msSnap.exists && msSnap.data) {
            tx.set(msPath, {
              ...msSnap.data,
              status: 'COMPLETED',
              completedAtIso: nowIso,
              completedByUid: params.principal.uid,
              updatedAtIso: nowIso,
            } as unknown as Record<string, unknown>);
          }

          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: 'OFFER_ACCEPTED',
            actorUid: params.principal.uid,
            actorRole: actorPart.role,
            fromStatus: txDoc.status,
            toStatus: 'AGREEMENT_PENDING',
            summary: `Offer ${offer.offerId} accepted; transaction advanced to AGREEMENT_PENDING.`,
            metadata: { offerId: offer.offerId, agreedAmount: offer.amount },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            status: 'AGREEMENT_PENDING',
            version: nextVersion,
            acceptedOfferId: offer.offerId,
            monetary: {
              ...txDoc.monetary,
              agreedAmount: offer.amount,
              ...(offer.depositAmount !== undefined ? { depositAmount: offer.depositAmount } : {}),
              ...(offer.monthlyRentAmount !== undefined ? { monthlyRentAmount: offer.monthlyRentAmount } : {}),
            },
            negotiationStatus: 'CLOSED',
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
          };

          tx.set(offerDocPath, accepted as unknown as Record<string, unknown>);
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);

          return { offer: accepted, updatedTx };
        },
      );

      await helpers.emitNotification(
        params.transactionId,
        `transaction.offer_${input.decision.toLowerCase()}`,
        result.updatedTx.activeParticipantUids.filter((u) => u !== params.principal.uid),
        params.principal.uid,
        `Offer ${result.offer.offerId} ${input.decision.toLowerCase()} on transaction ${params.transactionId}.`,
        nowIso,
      );
      if (input.decision === 'ACCEPT') {
        helpers.emitTelemetry(result.updatedTx, 'transaction_offer_accepted', { agreedAmount: result.offer.amount }, nowMs);
      }

      return {
        offer: result.offer,
        transactionStatus: result.updatedTx.status,
        transactionVersion: result.updatedTx.version,
      };
    },

    async postNegotiationEntry(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ entry: NegotiationEntryRecord; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateNegotiationEntryInput(params.rawBody, nowMs);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid negotiation entry payload.', validation.issues);
      }
      const input = validation.value;

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.negotiation_entry', maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, false);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.negotiation_entry');

          const actorPart = verifyParticipantPermission(participants, params.principal.uid, 'negotiation:participate');

          if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(txDoc.status)) {
            throw new CoreApiError('CONFLICT', 409, `Cannot post negotiation event in "${txDoc.status}" state.`);
          }
          if (txDoc.negotiationStatus === 'CLOSED' && input.entryType !== 'INITIATED') {
            throw new CoreApiError('CONFLICT', 409, 'Negotiation is already closed.');
          }

          const entryId = `neg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
          const entry: NegotiationEntryRecord = {
            entryId,
            transactionId: params.transactionId,
            authorUid: params.principal.uid,
            authorRole: actorPart.role,
            entryType: input.entryType,
            message: input.message,
            ...(input.referencedOfferId ? { referencedOfferId: input.referencedOfferId } : {}),
            ...(input.deadlineIso ? { deadlineIso: input.deadlineIso } : {}),
            createdAtIso: nowIso,
          };

          const nextNegStatus = input.entryType === 'CLOSED' ? 'CLOSED' : 'OPEN';
          const nextTxStatus =
            (txDoc.status === 'OPEN' || txDoc.status === 'OFFER_PENDING') && nextNegStatus === 'OPEN'
              ? 'NEGOTIATION'
              : txDoc.status;
          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: 'NEGOTIATION_EVENT',
            actorUid: params.principal.uid,
            actorRole: actorPart.role,
            fromStatus: txDoc.status,
            toStatus: nextTxStatus,
            summary: `Negotiation event (${input.entryType}) recorded.`,
            metadata: { entryId, entryType: input.entryType },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            status: nextTxStatus,
            version: nextVersion,
            negotiationStatus: nextNegStatus,
            ...(input.deadlineIso ? { negotiationDeadlineIso: input.deadlineIso } : {}),
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
          };

          tx.set(
            `transactionNegotiations/${params.transactionId}_${entryId}`,
            entry as unknown as Record<string, unknown>,
          );
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);

          return { entry, updatedTx };
        },
      );

      await helpers.emitNotification(
        params.transactionId,
        'transaction.negotiation_updated',
        result.updatedTx.activeParticipantUids.filter((u) => u !== params.principal.uid),
        params.principal.uid,
        `Negotiation update (${result.entry.entryType}) in transaction ${params.transactionId}.`,
        nowIso,
      );

      return { entry: result.entry, transactionVersion: result.updatedTx.version };
    },
  };
}
