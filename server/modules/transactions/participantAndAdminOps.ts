import crypto from 'crypto';
import {
  CoreApiError,
  runDurableTransaction,
  verifyAdminOrDelegatedPrincipal,
  type AuthenticatedPrincipal,
} from '../core';
import type { OfferOpsHelpers } from './offerAndNegotiationOps';
import {
  ALLOWED_ROLES_BY_TX_TYPE,
  assertExpectedTransactionVersion,
  assertTransactionNotSuspended,
  ROLE_DEFAULT_PERMISSIONS,
  toAdminTransactionView,
  verifyParticipantPermission,
} from './stateMachineAndAuthz';
import {
  validateAdminInterventionInput,
  validateInitiateDisputeInput,
  validateInviteParticipantInput,
  validateModifyParticipantInput,
  validateRespondInvitationInput,
} from './validation';
import type {
  AdminTransactionView,
  StoredTransactionDocument,
  TransactionDisputeRecord,
  TransactionParticipantRecord,
  TransactionsModuleDependencies,
} from './types';

export interface ParticipantAdminHelpers extends OfferOpsHelpers {
  emitAudit: (params: {
    principal: AuthenticatedPrincipal | null | undefined;
    correlationId: string;
    action: string;
    transactionId: string;
    outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
    reasonCode?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

export function createParticipantAndAdminOps(
  deps: TransactionsModuleDependencies,
  helpers: ParticipantAdminHelpers,
) {
  const nowFn = deps.nowFn ?? (() => Date.now());
  const defaultInviteTtlMs = 7 * 24 * 60 * 60 * 1000;

  return {
    async inviteParticipant(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ participant: TransactionParticipantRecord; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.invite_participant', maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, false);

          const validation = validateInviteParticipantInput(params.rawBody, txDoc.transactionType, nowMs);
          if (!validation.ok || !validation.value) {
            throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid participant invitation payload.', validation.issues);
          }
          const input = validation.value;
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.invite_participant');

          const actorPart = verifyParticipantPermission(participants, params.principal.uid, 'participant:invite');

          if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(txDoc.status)) {
            throw new CoreApiError('CONFLICT', 409, `Cannot invite participants in "${txDoc.status}" state.`);
          }

          const existing = participants.find((p) => p.userId === input.targetUserId);
          if (existing && (existing.status === 'ACTIVE' || existing.status === 'INVITED')) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `User "${input.targetUserId}" is already an active or invited participant in this transaction.`,
            );
          }

          const participantId = `prt_${params.transactionId}_${input.targetUserId}`;
          const record: TransactionParticipantRecord = {
            participantId,
            transactionId: params.transactionId,
            userId: input.targetUserId,
            role: input.role,
            status: 'INVITED',
            invitedByUid: params.principal.uid,
            invitedAtIso: nowIso,
            invitationExpiresAtIso: input.invitationExpiresAtIso ?? new Date(nowMs + defaultInviteTtlMs).toISOString(),
            ...(input.representsPartyUid ? { representsPartyUid: input.representsPartyUid } : {}),
            permissions: [...ROLE_DEFAULT_PERMISSIONS[input.role]],
            updatedAtIso: nowIso,
          };

          const nextInvitedUids = Array.from(new Set([...txDoc.invitedParticipantUids, input.targetUserId]));
          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: 'PARTICIPANT_INVITED',
            actorUid: params.principal.uid,
            actorRole: actorPart.role,
            summary: `User ${input.targetUserId} invited as ${input.role}.`,
            metadata: { targetUserId: input.targetUserId, role: input.role },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            version: nextVersion,
            invitedParticipantUids: nextInvitedUids,
            ...(input.role === 'BROKER' ? { brokerUid: input.targetUserId } : {}),
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
          };

          tx.set(`transactionParticipants/${participantId}`, record as unknown as Record<string, unknown>);
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);
          return { participant: record, updatedTx };
        },
      );

      await helpers.emitNotification(
        params.transactionId,
        'transaction.participant_invited',
        [result.participant.userId],
        params.principal.uid,
        `You have been invited as ${result.participant.role} to transaction ${params.transactionId}.`,
        nowIso,
      );

      return { participant: result.participant, transactionVersion: result.updatedTx.version };
    },

    async respondToInvitation(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ participant: TransactionParticipantRecord; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateRespondInvitationInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid invitation response payload.', validation.issues);
      }
      const input = validation.value;

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.respond_invitation', maxAttempts: 3 },
        async (tx) => {
          const { txDoc } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, false);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.respond_invitation');

          const participantId = `prt_${params.transactionId}_${params.principal.uid}`;
          const pSnap = await tx.get<TransactionParticipantRecord>(`transactionParticipants/${participantId}`);
          if (!pSnap.exists || !pSnap.data) {
            throw new CoreApiError('FORBIDDEN', 403, 'No invitation found for this principal on the transaction.');
          }
          const part = pSnap.data;
          if (part.status !== 'INVITED') {
            throw new CoreApiError('CONFLICT', 409, `Invitation is already in status "${part.status}".`);
          }

          if (Date.parse(part.invitationExpiresAtIso) <= nowMs) {
            tx.set(`transactionParticipants/${participantId}`, {
              ...part,
              status: 'EXPIRED',
              updatedAtIso: nowIso,
            } as unknown as Record<string, unknown>);
            throw new CoreApiError('CONFLICT', 409, 'Participant invitation has expired.');
          }

          const newStatus = input.decision === 'ACCEPT' ? 'ACTIVE' : 'DECLINED';
          const updatedPart: TransactionParticipantRecord = {
            ...part,
            status: newStatus,
            respondedAtIso: nowIso,
            updatedAtIso: nowIso,
          };

          const nextActiveUids =
            newStatus === 'ACTIVE'
              ? Array.from(new Set([...txDoc.activeParticipantUids, params.principal.uid]))
              : txDoc.activeParticipantUids;
          const nextInvitedUids = txDoc.invitedParticipantUids.filter((u) => u !== params.principal.uid);
          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: newStatus === 'ACTIVE' ? 'PARTICIPANT_ACCEPTED' : 'PARTICIPANT_DECLINED',
            actorUid: params.principal.uid,
            actorRole: part.role,
            summary: `Participant ${params.principal.uid} (${part.role}) ${input.decision.toLowerCase()}ed invitation.`,
            metadata: { role: part.role, status: newStatus },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            version: nextVersion,
            activeParticipantUids: nextActiveUids,
            invitedParticipantUids: nextInvitedUids,
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
          };

          tx.set(`transactionParticipants/${participantId}`, updatedPart as unknown as Record<string, unknown>);
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);
          return { participant: updatedPart, updatedTx };
        },
      );

      return { participant: result.participant, transactionVersion: result.updatedTx.version };
    },

    async modifyOrRevokeParticipant(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      targetUserId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ participant: TransactionParticipantRecord; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateModifyParticipantInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid participant modification payload.', validation.issues);
      }
      const input = validation.value;

      const adminDecision = await verifyAdminOrDelegatedPrincipal(params.principal, deps.adminStore, {
        primaryAdminEmails: deps.primaryAdminEmails,
      });

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.modify_participant', maxAttempts: 3 },
        async (tx) => {
          const { txDoc } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, adminDecision.allowed);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.modify_participant');

          if (txDoc.initiatorUid !== params.principal.uid && !adminDecision.allowed) {
            throw new CoreApiError('FORBIDDEN', 403, 'Only the transaction initiator or an administrator may modify or revoke participants.');
          }
          if (params.targetUserId === txDoc.initiatorUid && input.revokeAccess) {
            throw new CoreApiError('CONFLICT', 409, 'Transaction initiator cannot be revoked from their own transaction.');
          }

          const participantId = `prt_${params.transactionId}_${params.targetUserId}`;
          const pSnap = await tx.get<TransactionParticipantRecord>(`transactionParticipants/${participantId}`);
          if (!pSnap.exists || !pSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Participant "${params.targetUserId}" not found.`);
          }
          const part = pSnap.data;

          if (input.newRole && !ALLOWED_ROLES_BY_TX_TYPE[txDoc.transactionType].includes(input.newRole)) {
            throw new CoreApiError(
              'VALIDATION_FAILED',
              400,
              `Role "${input.newRole}" is incompatible with "${txDoc.transactionType}" transaction.`,
            );
          }

          const updatedPart: TransactionParticipantRecord = {
            ...part,
            ...(input.newRole
              ? { role: input.newRole, permissions: [...ROLE_DEFAULT_PERMISSIONS[input.newRole]] }
              : {}),
            ...(input.revokeAccess
              ? {
                  status: 'REVOKED',
                  permissions: [],
                  revokedAtIso: nowIso,
                  revokedByUid: params.principal.uid,
                  revocationReason: input.reason ?? 'Access revoked.',
                }
              : {}),
            updatedAtIso: nowIso,
          };

          const nextActiveUids = input.revokeAccess
            ? txDoc.activeParticipantUids.filter((u) => u !== params.targetUserId)
            : txDoc.activeParticipantUids;
          const nextInvitedUids = input.revokeAccess
            ? txDoc.invitedParticipantUids.filter((u) => u !== params.targetUserId)
            : txDoc.invitedParticipantUids;
          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: input.revokeAccess ? 'PARTICIPANT_REVOKED' : 'PARTICIPANT_ROLE_MODIFIED',
            actorUid: params.principal.uid,
            actorRole: adminDecision.allowed ? 'ADMIN' : 'INITIATOR',
            summary: input.revokeAccess
              ? `Participant ${params.targetUserId} access revoked.`
              : `Participant ${params.targetUserId} role updated to ${updatedPart.role}.`,
            metadata: { targetUserId: params.targetUserId, role: updatedPart.role, revoked: Boolean(input.revokeAccess) },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            version: nextVersion,
            activeParticipantUids: nextActiveUids,
            invitedParticipantUids: nextInvitedUids,
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
          };

          tx.set(`transactionParticipants/${participantId}`, updatedPart as unknown as Record<string, unknown>);
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);
          return { participant: updatedPart, updatedTx };
        },
      );

      return { participant: result.participant, transactionVersion: result.updatedTx.version };
    },

    async initiateDispute(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ dispute: TransactionDisputeRecord; transactionStatus: StoredTransactionDocument['status']; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateInitiateDisputeInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid dispute initiation payload.', validation.issues);
      }
      const input = validation.value;

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.initiate_dispute', maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.initiate_dispute');

          const actorPart = verifyParticipantPermission(participants, params.principal.uid, 'dispute:initiate');
          if (txDoc.status === 'DISPUTED') {
            throw new CoreApiError('CONFLICT', 409, 'Transaction already has an active dispute.');
          }
          if (txDoc.status === 'CANCELLED' || txDoc.status === 'EXPIRED' || txDoc.status === 'DRAFT') {
            throw new CoreApiError('CONFLICT', 409, `Cannot initiate a dispute from "${txDoc.status}" state.`);
          }

          const disputeId = `dsp_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
          const dispute: TransactionDisputeRecord = {
            disputeId,
            transactionId: params.transactionId,
            initiatedByUid: params.principal.uid,
            reasonCategory: input.reasonCategory,
            description: input.description,
            status: 'OPEN',
            previousTransactionStatus: txDoc.status,
            createdAtIso: nowIso,
          };

          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: 'DISPUTE_INITIATED',
            actorUid: params.principal.uid,
            actorRole: actorPart.role,
            fromStatus: txDoc.status,
            toStatus: 'DISPUTED',
            summary: `Dispute ${disputeId} (${input.reasonCategory}) initiated.`,
            metadata: { disputeId, reasonCategory: input.reasonCategory },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            status: 'DISPUTED',
            version: nextVersion,
            activeDisputeId: disputeId,
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
          };

          tx.set(`transactionDisputes/${params.transactionId}_${disputeId}`, dispute as unknown as Record<string, unknown>);
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);
          return { dispute, updatedTx };
        },
      );

      await helpers.emitNotification(
        params.transactionId,
        'transaction.dispute_initiated',
        result.updatedTx.activeParticipantUids.filter((u) => u !== params.principal.uid),
        params.principal.uid,
        `Dispute ${result.dispute.disputeId} opened on transaction ${params.transactionId}.`,
        nowIso,
      );
      helpers.emitTelemetry(result.updatedTx, 'transaction_dispute_initiated', { disputed: 1 }, nowMs);

      return {
        dispute: result.dispute,
        transactionStatus: result.updatedTx.status,
        transactionVersion: result.updatedTx.version,
      };
    },

    async executeAdminIntervention(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<AdminTransactionView> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const adminDecision = await verifyAdminOrDelegatedPrincipal(params.principal, deps.adminStore, {
        primaryAdminEmails: deps.primaryAdminEmails,
        disallowStaticToken: true,
      });
      if (!adminDecision.allowed) {
        await helpers.emitAudit({
          principal: params.principal,
          correlationId: params.correlationId,
          action: 'transactions.admin_intervention',
          transactionId: params.transactionId,
          outcome: 'DENIED',
          reasonCode: adminDecision.failureCode,
        });
        throw new CoreApiError('FORBIDDEN', adminDecision.status, adminDecision.reason ?? 'Administrator privileges required.');
      }

      const validation = validateAdminInterventionInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid administrative intervention payload.', validation.issues);
      }
      const input = validation.value;

      const view = await runDurableTransaction(
        deps.txRunner,
        { operationName: `transactions.admin_${input.action.toLowerCase()}`, maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.admin_intervention');

          let nextStatus = txDoc.status;
          let suspended = txDoc.suspendedByAdmin;
          let suspensionReason = txDoc.suspensionReason;
          let activeDisputeId = txDoc.activeDisputeId;
          let eventType: 'ADMIN_INTERVENTION' | 'DISPUTE_RESOLVED' = 'ADMIN_INTERVENTION';

          if (input.action === 'SUSPEND') {
            suspended = true;
            suspensionReason = input.reason;
          } else if (input.action === 'RESTORE') {
            suspended = false;
            suspensionReason = undefined;
            if (input.targetStatusAfterRestore) {
              nextStatus = input.targetStatusAfterRestore;
            }
          } else if (input.action === 'RESOLVE_DISPUTE') {
            if (txDoc.activeDisputeId) {
              const dPath = `transactionDisputes/${params.transactionId}_${txDoc.activeDisputeId}`;
              const dSnap = await tx.get<TransactionDisputeRecord>(dPath);
              if (dSnap.exists && dSnap.data) {
                nextStatus = input.targetStatusAfterRestore ?? dSnap.data.previousTransactionStatus;
                tx.set(dPath, {
                  ...dSnap.data,
                  status: 'RESOLVED',
                  resolvedAtIso: nowIso,
                  resolvedByAdminUid: params.principal.uid,
                  resolutionSummary: input.reason,
                } as unknown as Record<string, unknown>);
              }
              activeDisputeId = undefined;
            } else if (input.targetStatusAfterRestore) {
              nextStatus = input.targetStatusAfterRestore;
            }
            suspended = false;
            eventType = 'DISPUTE_RESOLVED';
          } else if (input.action === 'FORCE_CANCEL') {
            nextStatus = 'CANCELLED';
            suspended = false;
          }

          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType,
            actorUid: params.principal.uid,
            actorRole: adminDecision.effectiveRole,
            fromStatus: txDoc.status,
            toStatus: nextStatus,
            summary: `Administrative intervention (${input.action}): ${input.reason}`,
            metadata: { action: input.action, reason: input.reason },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            status: nextStatus,
            version: nextVersion,
            suspendedByAdmin: suspended,
            suspensionReason,
            activeDisputeId,
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
            ...(nextStatus === 'CANCELLED'
              ? { cancelledAtIso: nowIso, cancelledByUid: params.principal.uid, cancellationReason: input.reason }
              : {}),
          };

          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);
          return toAdminTransactionView(updatedTx, participants, params.principal.uid);
        },
      );

      await helpers.emitAudit({
        principal: { ...params.principal, role: adminDecision.effectiveRole },
        correlationId: params.correlationId,
        action: `transactions.admin.${input.action.toLowerCase()}`,
        transactionId: params.transactionId,
        outcome: 'SUCCESS',
        metadata: { status: view.status, version: view.version },
      });

      return view;
    },
  };
}
