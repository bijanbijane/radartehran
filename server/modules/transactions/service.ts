import crypto from 'crypto';
import {
  authorizePrincipal,
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
  createStructuredAuditEvent,
  executeIdempotentMutation,
  requireSafeFirestoreId,
  runDurableTransaction,
  verifyAdminOrDelegatedPrincipal,
  type AuthenticatedPrincipal,
  type TransactionContextLike,
} from '../core';
import { createClosingContractAndMilestoneOps } from './closingContractAndMilestoneOps';
import { createOfferAndNegotiationOps } from './offerAndNegotiationOps';
import { createParticipantAndAdminOps } from './participantAndAdminOps';
import {
  assertExpectedTransactionVersion,
  assertTransactionNotSuspended,
  buildDefaultMilestones,
  ROLE_DEFAULT_PERMISSIONS,
  toAdminTransactionView,
  toParticipantTransactionView,
  validateTransactionStateTransition,
  verifyParticipantPermission,
} from './stateMachineAndAuthz';
import {
  validateCreateTransactionInput,
  validateTransitionTransactionInput,
} from './validation';
import type {
  AdminTransactionView,
  NegotiationEntryRecord,
  ParticipantTransactionView,
  StoredTransactionDocument,
  TransactionAnalyticsSnapshot,
  TransactionContractReferenceRecord,
  TransactionHistoryEventRecord,
  TransactionMilestoneRecord,
  TransactionOfferRecord,
  TransactionParticipantRecord,
  TransactionsModuleDependencies,
  TransactionStatus,
  TransactionType,
} from './types';

export function createTransactionsService(deps: TransactionsModuleDependencies) {
  const idempotencyStore = deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());
  const defaultTxTtlMs = 45 * 24 * 60 * 60 * 1000;
  const defaultInviteTtlMs = 7 * 24 * 60 * 60 * 1000;

  function validateDocId(rawId: unknown, fieldName = 'transactionId'): string {
    const res = requireSafeFirestoreId()(rawId, fieldName);
    if (!res.ok || !res.value) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid ${fieldName}.`, res.issues);
    }
    return res.value;
  }

  async function emitAudit(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    correlationId: string;
    action: string;
    transactionId: string;
    outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
    reasonCode?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!deps.auditSink) return;
    await deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: params.principal,
        correlationId: params.correlationId,
        action: params.action,
        targetCollection: 'transactions',
        targetResourceId: params.transactionId,
        outcome: params.outcome,
        reasonCode: params.reasonCode,
        metadata: params.metadata,
        nowIso: new Date(nowFn()).toISOString(),
      }),
    );
  }

  async function emitNotification(
    transactionId: string,
    eventType: string,
    recipientUids: string[],
    actorUid: string,
    summary: string,
    nowIso: string,
  ): Promise<void> {
    if (!deps.notificationEmitter || recipientUids.length === 0) return;
    try {
      await deps.notificationEmitter({
        eventId: `ntf_${crypto.randomUUID().slice(0, 14)}`,
        eventType,
        transactionId,
        recipientUids,
        actorUid,
        summary,
        occurredAtIso: nowIso,
      });
    } catch {
      // Non-critical notification failure must never abort a committed transaction
    }
  }

  function emitTelemetry(
    txDoc: StoredTransactionDocument,
    eventName: string,
    numericMetrics: Record<string, number>,
    nowMs: number,
  ): void {
    if (!deps.telemetryEmitter) return;
    try {
      deps.telemetryEmitter({
        eventName,
        transactionId: txDoc.id,
        transactionType: txDoc.transactionType,
        cityId: txDoc.cityId,
        hoodId: txDoc.hoodId,
        status: txDoc.status,
        numericMetrics,
        occurredAtMs: nowMs,
      });
    } catch {
      // Non-blocking telemetry
    }
  }

  function appendHistoryInTx(
    tx: TransactionContextLike,
    txDoc: StoredTransactionDocument,
    params: {
      eventType: TransactionHistoryEventRecord['eventType'];
      actorUid: string;
      actorRole: string;
      fromStatus?: TransactionStatus;
      toStatus?: TransactionStatus;
      summary: string;
      metadata?: Record<string, unknown>;
      nowIso: string;
    },
  ): number {
    const nextSeq = txDoc.historyCount + 1;
    const seqPadded = String(nextSeq).padStart(6, '0');
    const eventId = `hst_${txDoc.id}_${seqPadded}`;
    const record: TransactionHistoryEventRecord = {
      eventId,
      transactionId: txDoc.id,
      sequenceNumber: nextSeq,
      eventType: params.eventType,
      actorUid: params.actorUid,
      actorRole: params.actorRole,
      ...(params.fromStatus ? { fromStatus: params.fromStatus } : {}),
      ...(params.toStatus ? { toStatus: params.toStatus } : {}),
      summary: params.summary,
      metadata: params.metadata ?? {},
      timestampIso: params.nowIso,
    };
    tx.set(`transactionHistory/${eventId}`, record as unknown as Record<string, unknown>);
    return nextSeq;
  }

  async function loadTransactionAndParticipants(
    tx: TransactionContextLike,
    rawTransactionId: string,
  ): Promise<{
    txDoc: StoredTransactionDocument;
    participants: TransactionParticipantRecord[];
  }> {
    const transactionId = validateDocId(rawTransactionId, 'transactionId');
    const txSnap = await tx.get<StoredTransactionDocument>(`transactions/${transactionId}`);
    if (!txSnap.exists || !txSnap.data) {
      throw new CoreApiError('NOT_FOUND', 404, `Transaction "${transactionId}" not found.`);
    }
    const txDoc = txSnap.data;
    const allKnownUids = Array.from(new Set([...txDoc.activeParticipantUids, ...txDoc.invitedParticipantUids]));
    const snaps = await Promise.all(
      allKnownUids.map((uid) => tx.get<TransactionParticipantRecord>(`transactionParticipants/prt_${transactionId}_${uid}`)),
    );
    const participants: TransactionParticipantRecord[] = [];
    for (const s of snaps) {
      if (s.exists && s.data) participants.push(s.data);
    }
    return { txDoc, participants };
  }

  const sharedHelpers = {
    loadTransactionAndParticipants,
    appendHistoryInTx,
    emitNotification,
    emitTelemetry,
    emitAudit,
  };

  const offerOps = createOfferAndNegotiationOps(deps, sharedHelpers);
  const closingOps = createClosingContractAndMilestoneOps(deps, sharedHelpers);
  const participantAdminOps = createParticipantAndAdminOps(deps, sharedHelpers);

  return {
    ...offerOps,
    ...closingOps,
    ...participantAdminOps,

    async createTransaction(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ replayed: boolean; statusCode: number; transaction: ParticipantTransactionView }> {
      const authz = await authorizePrincipal(
        params.principal,
        { minimumRole: 'verified_user' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) {
        throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');
      }

      const nowMs = nowFn();
      const validation = validateCreateTransactionInput(params.rawBody, nowMs);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid transaction creation payload.', validation.issues);
      }
      const input = validation.value;

      if (deps.propertyVerifier) {
        const propCheck = await deps.propertyVerifier(input.propertyId);
        if (!propCheck.exists) {
          throw new CoreApiError('NOT_FOUND', 404, `Referenced property "${input.propertyId}" does not exist.`);
        }
      }

      const outcome = await executeIdempotentMutation<ParticipantTransactionView>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'transactions.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: input,
        nowEpochMs: nowMs,
        mutationFn: async () => {
          const mutNowMs = nowFn();
          const nowIso = new Date(mutNowMs).toISOString();
          const txId = input.transactionId ?? `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
          const expiresAtIso = input.expiresAtIso ?? new Date(mutNowMs + defaultTxTtlMs).toISOString();

          const createdView = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'transactions.create', maxAttempts: 3 },
            async (tx) => {
              const existingSnap = await tx.get<StoredTransactionDocument>(`transactions/${txId}`);
              if (existingSnap.exists) {
                throw new CoreApiError('CONFLICT', 409, `Transaction "${txId}" already exists.`);
              }

              const initiatorPart: TransactionParticipantRecord = {
                participantId: `prt_${txId}_${params.principal.uid}`,
                transactionId: txId,
                userId: params.principal.uid,
                role: input.initiatorRole,
                status: 'ACTIVE',
                invitedByUid: params.principal.uid,
                invitedAtIso: nowIso,
                invitationExpiresAtIso: expiresAtIso,
                respondedAtIso: nowIso,
                permissions: [...ROLE_DEFAULT_PERMISSIONS[input.initiatorRole]],
                updatedAtIso: nowIso,
              };

              const participants: TransactionParticipantRecord[] = [initiatorPart];
              const invitedUids: string[] = [];

              if (input.brokerUid && input.brokerUid !== params.principal.uid) {
                invitedUids.push(input.brokerUid);
                participants.push({
                  participantId: `prt_${txId}_${input.brokerUid}`,
                  transactionId: txId,
                  userId: input.brokerUid,
                  role: 'BROKER',
                  status: 'INVITED',
                  invitedByUid: params.principal.uid,
                  invitedAtIso: nowIso,
                  invitationExpiresAtIso: new Date(mutNowMs + defaultInviteTtlMs).toISOString(),
                  permissions: [...ROLE_DEFAULT_PERMISSIONS.BROKER],
                  updatedAtIso: nowIso,
                });
              }

              const baseDoc: StoredTransactionDocument = {
                id: txId,
                transactionType: input.transactionType,
                propertyId: input.propertyId,
                cityId: input.cityId,
                hoodId: input.hoodId,
                initiatorUid: params.principal.uid,
                status: 'DRAFT',
                version: 1,
                monetary: {
                  askingAmount: input.askingAmount,
                  ...(input.depositAmount !== undefined ? { depositAmount: input.depositAmount } : {}),
                  ...(input.monthlyRentAmount !== undefined ? { monthlyRentAmount: input.monthlyRentAmount } : {}),
                  currency: input.currency,
                },
                activeParticipantUids: [params.principal.uid],
                invitedParticipantUids: invitedUids,
                ...(input.brokerUid ? { brokerUid: input.brokerUid } : {}),
                negotiationStatus: 'NOT_STARTED',
                suspendedByAdmin: false,
                historyCount: 0,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
                expiresAtIso,
              };

              const historyCount = appendHistoryInTx(tx, baseDoc, {
                eventType: 'TRANSACTION_CREATED',
                actorUid: params.principal.uid,
                actorRole: input.initiatorRole,
                toStatus: 'DRAFT',
                summary: `Transaction ${txId} (${input.transactionType}) created for property ${input.propertyId}.`,
                metadata: { propertyId: input.propertyId, askingAmount: input.askingAmount, currency: input.currency },
                nowIso,
              });

              const finalDoc: StoredTransactionDocument = {
                ...baseDoc,
                historyCount,
              };

              tx.set(`transactions/${txId}`, finalDoc as unknown as Record<string, unknown>);
              for (const p of participants) {
                tx.set(`transactionParticipants/${p.participantId}`, p as unknown as Record<string, unknown>);
              }

              const defaultMilestones = buildDefaultMilestones(txId, input.transactionType, params.principal.uid, nowIso);
              for (const ms of defaultMilestones) {
                tx.set(
                  `transactionMilestones/${txId}_${ms.milestoneId}`,
                  ms as unknown as Record<string, unknown>,
                );
              }

              return { finalDoc, view: toParticipantTransactionView(finalDoc, participants, params.principal.uid) };
            },
          );

          await emitAudit({
            principal: params.principal,
            correlationId: params.correlationId,
            action: 'transactions.create',
            transactionId: createdView.finalDoc.id,
            outcome: 'SUCCESS',
            metadata: { transactionType: createdView.finalDoc.transactionType, propertyId: createdView.finalDoc.propertyId },
          });
          emitTelemetry(createdView.finalDoc, 'transaction_created', { askingAmount: input.askingAmount }, mutNowMs);

          return { statusCode: 201, body: createdView.view };
        },
      });

      return { replayed: outcome.replayed, statusCode: outcome.statusCode, transaction: outcome.body };
    },

    async getTransaction(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      correlationId: string;
    }): Promise<ParticipantTransactionView | AdminTransactionView> {
      const adminDecision = await verifyAdminOrDelegatedPrincipal(params.principal, deps.adminStore, {
        primaryAdminEmails: deps.primaryAdminEmails,
      });

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.get', maxAttempts: 2 },
        async (tx) => {
          const { txDoc, participants } = await loadTransactionAndParticipants(tx, params.transactionId);
          if (adminDecision.allowed) {
            return toAdminTransactionView(txDoc, participants, params.principal.uid);
          }
          return toParticipantTransactionView(txDoc, participants, params.principal.uid, false);
        },
      );
    },

    async transitionStatus(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<ParticipantTransactionView> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateTransitionTransactionInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid state transition payload.', validation.issues);
      }
      const input = validation.value;

      const view = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.transition_status', maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, false);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.transition_status');

          const reqPerm = input.targetStatus === 'CANCELLED' ? 'transaction:cancel' : 'transaction:read';
          const actorPart = verifyParticipantPermission(participants, params.principal.uid, reqPerm);

          if (input.targetStatus === 'OPEN' && txDoc.initiatorUid !== params.principal.uid) {
            throw new CoreApiError('FORBIDDEN', 403, 'Only the transaction initiator can publish a DRAFT transaction to OPEN.');
          }

          const check = validateTransactionStateTransition({
            txDoc,
            targetStatus: input.targetStatus,
            actorRole: actorPart.role,
            viaWorkflowEngine: false,
          });
          if (!check.allowed) {
            throw new CoreApiError('CONFLICT', 409, check.reason ?? 'Invalid transaction state transition.');
          }

          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = appendHistoryInTx(tx, txDoc, {
            eventType: input.targetStatus === 'CANCELLED' ? 'TRANSACTION_CANCELLED' : 'STATUS_TRANSITIONED',
            actorUid: params.principal.uid,
            actorRole: actorPart.role,
            fromStatus: txDoc.status,
            toStatus: input.targetStatus,
            summary: input.reason ?? `Transaction transitioned from ${txDoc.status} to ${input.targetStatus}.`,
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            status: input.targetStatus,
            version: nextVersion,
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
            ...(input.targetStatus === 'CANCELLED'
              ? {
                  cancelledAtIso: nowIso,
                  cancelledByUid: params.principal.uid,
                  cancellationReason: input.reason ?? 'Cancelled by participant.',
                }
              : {}),
          };

          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);
          return { updatedTx, view: toParticipantTransactionView(updatedTx, participants, params.principal.uid, false) };
        },
      );

      if (input.targetStatus === 'CANCELLED') {
        emitTelemetry(view.updatedTx, 'transaction_cancelled', { cancelled: 1 }, nowMs);
      }

      return view.view;
    },

    async getTransactionSubresourceList(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      resource: 'offers' | 'negotiations' | 'milestones' | 'contracts' | 'history';
    }): Promise<
      | TransactionOfferRecord[]
      | NegotiationEntryRecord[]
      | TransactionMilestoneRecord[]
      | TransactionContractReferenceRecord[]
      | TransactionHistoryEventRecord[]
    > {
      const adminDecision = await verifyAdminOrDelegatedPrincipal(params.principal, deps.adminStore, {
        primaryAdminEmails: deps.primaryAdminEmails,
      });

      const txDoc = await runDurableTransaction(
        deps.txRunner,
        { operationName: `transactions.list_${params.resource}`, maxAttempts: 2 },
        async (tx) => {
          const { txDoc: doc, participants } = await loadTransactionAndParticipants(tx, params.transactionId);
          if (!adminDecision.allowed) {
            verifyParticipantPermission(participants, params.principal.uid, 'transaction:read');
          }
          if (params.resource === 'history' && !deps.queryAdapter) {
            const events: TransactionHistoryEventRecord[] = [];
            for (let i = 1; i <= doc.historyCount; i++) {
              const seqPadded = String(i).padStart(6, '0');
              const snap = await tx.get<TransactionHistoryEventRecord>(`transactionHistory/hst_${doc.id}_${seqPadded}`);
              if (snap.exists && snap.data) events.push(snap.data);
            }
            return { doc, inlineHistory: events };
          }
          return { doc, inlineHistory: null };
        },
      );

      if (params.resource === 'history' && txDoc.inlineHistory) {
        return txDoc.inlineHistory;
      }
      if (!deps.queryAdapter) return [];
      if (params.resource === 'offers') return deps.queryAdapter.listOffersByTransaction(txDoc.doc.id);
      if (params.resource === 'negotiations') return deps.queryAdapter.listNegotiationByTransaction(txDoc.doc.id);
      if (params.resource === 'milestones') return deps.queryAdapter.listMilestonesByTransaction(txDoc.doc.id);
      if (params.resource === 'contracts') return deps.queryAdapter.listContractsByTransaction(txDoc.doc.id);
      return deps.queryAdapter.listHistoryByTransaction(txDoc.doc.id);
    },

    async listParticipantTransactions(params: {
      principal: AuthenticatedPrincipal;
      status?: TransactionStatus;
      transactionType?: TransactionType;
      limit: number;
    }): Promise<StoredTransactionDocument[]> {
      if (!deps.queryAdapter) return [];
      return deps.queryAdapter.listByParticipantUid({
        userId: params.principal.uid,
        status: params.status,
        transactionType: params.transactionType,
        limit: Math.max(1, Math.min(50, params.limit)),
      });
    },

    async getAnalyticsSnapshot(params: {
      principal: AuthenticatedPrincipal;
    }): Promise<TransactionAnalyticsSnapshot> {
      const adminDecision = await verifyAdminOrDelegatedPrincipal(params.principal, deps.adminStore, {
        primaryAdminEmails: deps.primaryAdminEmails,
      });
      if (!adminDecision.allowed) {
        throw new CoreApiError('FORBIDDEN', adminDecision.status, adminDecision.reason ?? 'Administrator privileges required.');
      }

      const docs = deps.queryAdapter ? await deps.queryAdapter.listAllForAdmin({ limit: 500 }) : [];
      const totalCreated = docs.length;
      const saleCount = docs.filter((d) => d.transactionType === 'SALE').length;
      const rentalCount = docs.filter((d) => d.transactionType === 'RENTAL').length;
      const completedCount = docs.filter((d) => d.status === 'COMPLETED').length;
      const cancelledCount = docs.filter((d) => d.status === 'CANCELLED').length;
      const disputedCount = docs.filter((d) => d.status === 'DISPUTED' || Boolean(d.activeDisputeId)).length;
      const acceptedCount = docs.filter((d) => Boolean(d.acceptedOfferId)).length;

      return {
        totalCreated,
        saleCount,
        rentalCount,
        completedCount,
        cancelledCount,
        disputedCount,
        totalOffersSubmitted: Math.max(acceptedCount, totalCreated),
        totalOffersAccepted: acceptedCount,
        offerConversionRate: totalCreated > 0 ? Number((acceptedCount / totalCreated).toFixed(4)) : 0,
        completionRate: totalCreated > 0 ? Number((completedCount / totalCreated).toFixed(4)) : 0,
        cancellationRate: totalCreated > 0 ? Number((cancelledCount / totalCreated).toFixed(4)) : 0,
        disputeRate: totalCreated > 0 ? Number((disputedCount / totalCreated).toFixed(4)) : 0,
        milestoneCompletionRate: totalCreated > 0 ? Number(((completedCount + acceptedCount) / (totalCreated * 2)).toFixed(4)) : 0,
      };
    },
  };
}
