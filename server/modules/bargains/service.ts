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
import {
  assertExpectedRevision,
  isBargainExpired,
  toOwnerBargainView,
  toPublicBargainProjection,
  validateBargainStateTransition,
} from './stateMachineAndProjection';
import {
  validateCreateBargainInput,
  validateModerateBargainInput,
  validateUpdateBargainInput,
  validateWithdrawBargainInput,
} from './validation';
import type {
  BargainModerationRecord,
  BargainOwnershipRecord,
  BargainsModuleDependencies,
  OwnerBargainView,
  PublicBargainProjection,
  StoredBargainDocument,
} from './types';

async function loadBargainAndVerifyOwnershipInvariant(
  tx: TransactionContextLike,
  bargainId: string,
): Promise<{ bargain: StoredBargainDocument; ownership: BargainOwnershipRecord; moderation?: BargainModerationRecord }> {
  const [bargainSnap, ownerSnap, modSnap] = await Promise.all([
    tx.get<StoredBargainDocument>(`bargains/${bargainId}`),
    tx.get<BargainOwnershipRecord>(`bargainOwners/${bargainId}`),
    tx.get<BargainModerationRecord>(`bargainModeration/${bargainId}`),
  ]);
  if (!bargainSnap.exists || !bargainSnap.data) throw new CoreApiError('NOT_FOUND', 404, 'Bargain listing not found.');
  if (!ownerSnap.exists || !ownerSnap.data || ownerSnap.data.bargainId !== bargainId) {
    throw new CoreApiError('PERSISTENCE_FAILED', 503, 'Ownership invariant violation: bargain is missing a valid ownership record.');
  }
  return { bargain: bargainSnap.data, ownership: ownerSnap.data, moderation: modSnap.data };
}

export function createBargainsService(deps: BargainsModuleDependencies) {
  const idempotencyStore = deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());
  const defaultExpirationMs = (deps.defaultExpirationDays ?? 30) * 24 * 60 * 60 * 1000;

  async function emitAudit(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    correlationId: string;
    action: string;
    bargainId: string;
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
        targetCollection: 'bargains',
        targetResourceId: params.bargainId,
        outcome: params.outcome,
        reasonCode: params.reasonCode,
        metadata: params.metadata,
        nowIso: new Date(nowFn()).toISOString(),
      }),
    );
  }

  function validateBargainDocId(rawId: unknown): string {
    const res = requireSafeFirestoreId()(rawId, 'bargainId');
    if (!res.ok || !res.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid bargainId.', res.issues);
    return res.value;
  }

  async function requireOwnerAuthorization(principal: AuthenticatedPrincipal, ownerUid: string, allowAdminOverride: boolean): Promise<void> {
    const authz = await authorizePrincipal(
      principal,
      { minimumRole: 'verified_user', resourceOwnerUid: ownerUid, allowAdminOverrideForOwnership: allowAdminOverride },
      deps.adminStore,
      deps.primaryAdminEmails,
    );
    if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');
  }

  return {
    async createBargain(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ replayed: boolean; statusCode: number; bargain: OwnerBargainView }> {
      const authz = await authorizePrincipal(
        params.principal,
        { minimumRole: 'verified_user' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');

      const validation = validateCreateBargainInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid bargain creation payload.', validation.issues);
      }
      const input = validation.value;

      try {
        const outcome = await executeIdempotentMutation<OwnerBargainView>({
          store: idempotencyStore,
          actorUid: params.principal.uid,
          operation: 'bargains.create',
          idempotencyKey: params.idempotencyKey,
          requestPayload: input,
          nowEpochMs: nowFn(),
          mutationFn: async () => {
            const nowMs = nowFn();
            const nowIso = new Date(nowMs).toISOString();
            const bargainId = input.bargainId ?? `bg_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
            const expiresAtIso = input.expiresAtIso ?? new Date(nowMs + defaultExpirationMs).toISOString();

            const createdView = await runDurableTransaction(
              deps.txRunner,
              { operationName: 'bargains.create', maxAttempts: 3 },
              async (tx) => {
                const [existingBargain, existingOwner] = await Promise.all([
                  tx.get<StoredBargainDocument>(`bargains/${bargainId}`),
                  tx.get<BargainOwnershipRecord>(`bargainOwners/${bargainId}`),
                ]);
                if (existingBargain.exists || existingOwner.exists) {
                  throw new CoreApiError('CONFLICT', 409, `Bargain "${bargainId}" already exists.`);
                }
                const { bargainId: _ignore, ...restInput } = input;
                const doc: StoredBargainDocument = {
                  ...restInput,
                  id: bargainId,
                  status: 'pending',
                  revision: 1,
                  createdAtIso: nowIso,
                  updatedAtIso: nowIso,
                  expiresAtIso,
                };
                const ownership: BargainOwnershipRecord = { bargainId, userId: params.principal.uid, createdAtIso: nowIso };
                const moderation: BargainModerationRecord = { bargainId, status: 'pending', revision: 1 };

                tx.set(`bargains/${bargainId}`, doc as unknown as Record<string, unknown>);
                tx.set(`bargainOwners/${bargainId}`, ownership as unknown as Record<string, unknown>);
                tx.set(`bargainModeration/${bargainId}`, moderation as unknown as Record<string, unknown>);
                return toOwnerBargainView(doc, ownership, moderation);
              },
            );

            await emitAudit({
              principal: params.principal,
              correlationId: params.correlationId,
              action: 'bargains.create',
              bargainId: createdView.id,
              outcome: 'SUCCESS',
              metadata: { hoodId: createdView.hoodId, revision: createdView.revision },
            });
            return { statusCode: 201, body: createdView };
          },
        });
        return { replayed: outcome.replayed, statusCode: outcome.statusCode, bargain: outcome.body };
      } catch (err) {
        if (err instanceof CoreApiError) throw err;
        throw new CoreApiError('PERSISTENCE_FAILED', 503, err instanceof Error ? err.message : 'Creation failed.');
      }
    },

    async getOwnerBargain(params: {
      principal: AuthenticatedPrincipal;
      bargainId: string;
      correlationId: string;
    }): Promise<OwnerBargainView> {
      const bargainId = validateBargainDocId(params.bargainId);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'bargains.get_owner_view', maxAttempts: 2 },
        async (tx) => {
          const { bargain, ownership, moderation } = await loadBargainAndVerifyOwnershipInvariant(tx, bargainId);
          await requireOwnerAuthorization(params.principal, ownership.userId, true);
          return toOwnerBargainView(bargain, ownership, moderation);
        },
      );
    },

    async updateOwnerBargain(params: {
      principal: AuthenticatedPrincipal;
      bargainId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<OwnerBargainView> {
      const bargainId = validateBargainDocId(params.bargainId);
      const validation = validateUpdateBargainInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid bargain update payload.', validation.issues);
      }
      const { expectedRevision, ...patchFields } = validation.value;

      const updatedView = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'bargains.update_owner', maxAttempts: 3 },
        async (tx) => {
          const { bargain, ownership, moderation } = await loadBargainAndVerifyOwnershipInvariant(tx, bargainId);
          await requireOwnerAuthorization(params.principal, ownership.userId, false);
          assertExpectedRevision(bargain.revision, expectedRevision, 'bargains.update');

          const effectiveStatus = isBargainExpired(bargain, nowFn()) ? 'expired' : bargain.status;
          const transition = validateBargainStateTransition(effectiveStatus, 'pending', 'owner');
          if (!transition.allowed) {
            throw new CoreApiError('CONFLICT', 409, transition.reason ?? 'Cannot update bargain in current state.');
          }

          const nowIso = new Date(nowFn()).toISOString();
          const nextRevision = bargain.revision + 1;
          const updatedDoc: StoredBargainDocument = {
            ...bargain,
            ...patchFields,
            status: 'pending',
            revision: nextRevision,
            updatedAtIso: nowIso,
          };
          delete updatedDoc.approvedAtIso;
          delete updatedDoc.approvedBy;

          const updatedMod: BargainModerationRecord = {
            ...(moderation ?? { bargainId }),
            bargainId,
            status: 'pending',
            revision: nextRevision,
            lastTransitionFrom: bargain.status,
          };
          delete updatedMod.rejectionReason;

          tx.set(`bargains/${bargainId}`, updatedDoc as unknown as Record<string, unknown>);
          tx.set(`bargainModeration/${bargainId}`, updatedMod as unknown as Record<string, unknown>);
          return toOwnerBargainView(updatedDoc, ownership, updatedMod);
        },
      );

      await emitAudit({
        principal: params.principal,
        correlationId: params.correlationId,
        action: 'bargains.update_owner',
        bargainId,
        outcome: 'SUCCESS',
        metadata: { revision: updatedView.revision, status: updatedView.status },
      });
      return updatedView;
    },

    async withdrawBargain(params: {
      principal: AuthenticatedPrincipal;
      bargainId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<OwnerBargainView> {
      const bargainId = validateBargainDocId(params.bargainId);
      const validation = validateWithdrawBargainInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid bargain withdrawal payload.', validation.issues);
      }
      const input = validation.value;

      const withdrawnView = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'bargains.withdraw', maxAttempts: 3 },
        async (tx) => {
          const { bargain, ownership, moderation } = await loadBargainAndVerifyOwnershipInvariant(tx, bargainId);
          await requireOwnerAuthorization(params.principal, ownership.userId, false);
          assertExpectedRevision(bargain.revision, input.expectedRevision, 'bargains.withdraw');

          const transition = validateBargainStateTransition(bargain.status, 'withdrawn', 'owner');
          if (!transition.allowed) {
            throw new CoreApiError('CONFLICT', 409, transition.reason ?? 'Cannot withdraw bargain.');
          }

          const nowIso = new Date(nowFn()).toISOString();
          const nextRevision = bargain.revision + 1;
          const updatedDoc: StoredBargainDocument = {
            ...bargain,
            status: 'withdrawn',
            revision: nextRevision,
            updatedAtIso: nowIso,
          };
          const updatedMod: BargainModerationRecord = {
            ...(moderation ?? { bargainId }),
            bargainId,
            status: 'withdrawn',
            revision: nextRevision,
            withdrawnAtIso: nowIso,
            lastTransitionFrom: bargain.status,
          };

          tx.set(`bargains/${bargainId}`, updatedDoc as unknown as Record<string, unknown>);
          tx.set(`bargainModeration/${bargainId}`, updatedMod as unknown as Record<string, unknown>);
          return toOwnerBargainView(updatedDoc, ownership, updatedMod);
        },
      );

      await emitAudit({
        principal: params.principal,
        correlationId: params.correlationId,
        action: 'bargains.withdraw',
        bargainId,
        outcome: 'SUCCESS',
        metadata: { revision: withdrawnView.revision },
      });
      return withdrawnView;
    },

    async expireBargainIfDue(params: {
      bargainId: string;
      correlationId: string;
    }): Promise<{ expired: boolean; status: string; revision: number }> {
      const bargainId = validateBargainDocId(params.bargainId);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'bargains.expire_if_due', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<StoredBargainDocument>(`bargains/${bargainId}`);
          if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Bargain listing not found.');
          const current = snap.data;
          if (current.status === 'expired') return { expired: true, status: 'expired', revision: current.revision };
          if (!isBargainExpired(current, nowFn())) return { expired: false, status: current.status, revision: current.revision };
          const transition = validateBargainStateTransition(current.status, 'expired', 'system_expiry');
          if (!transition.allowed) return { expired: false, status: current.status, revision: current.revision };

          const nowIso = new Date(nowFn()).toISOString();
          const nextRevision = current.revision + 1;
          tx.update(`bargains/${bargainId}`, { status: 'expired', revision: nextRevision, updatedAtIso: nowIso });
          tx.set(
            `bargainModeration/${bargainId}`,
            { bargainId, status: 'expired', revision: nextRevision, expiredAtIso: nowIso, lastTransitionFrom: current.status },
            { merge: true },
          );
          return { expired: true, status: 'expired', revision: nextRevision };
        },
      );
    },

    async moderateBargain(params: {
      principal: AuthenticatedPrincipal;
      bargainId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{
      bargainId: string;
      previousStatus: string;
      moderationStatus: 'approved' | 'rejected';
      revision: number;
      moderatedAtIso: string;
    }> {
      const bargainId = validateBargainDocId(params.bargainId);
      const adminDecision = await verifyAdminOrDelegatedPrincipal(params.principal, deps.adminStore, {
        primaryAdminEmails: deps.primaryAdminEmails,
        disallowStaticToken: true,
      });
      if (!adminDecision.allowed) {
        await emitAudit({
          principal: params.principal,
          correlationId: params.correlationId,
          action: 'bargains.moderate',
          bargainId,
          outcome: 'DENIED',
          reasonCode: adminDecision.failureCode,
        });
        throw new CoreApiError('FORBIDDEN', adminDecision.status, adminDecision.reason ?? 'Administrator privileges required.');
      }

      const validation = validateModerateBargainInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid moderation payload.', validation.issues);
      }
      const input = validation.value;

      const moderationResult = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'bargains.moderate', maxAttempts: 3 },
        async (tx) => {
          const { bargain } = await loadBargainAndVerifyOwnershipInvariant(tx, bargainId);
          assertExpectedRevision(bargain.revision, input.expectedRevision, 'bargains.moderate');

          const effectiveStoredStatus = isBargainExpired(bargain, nowFn()) ? 'expired' : bargain.status;
          const transition = validateBargainStateTransition(effectiveStoredStatus, input.targetStatus, 'admin');
          if (!transition.allowed) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              transition.reason ?? `Invalid moderation transition from "${effectiveStoredStatus}" to "${input.targetStatus}".`,
            );
          }

          const nowIso = new Date(nowFn()).toISOString();
          const nextRevision = bargain.revision + 1;
          const updatedDoc: StoredBargainDocument = {
            ...bargain,
            status: input.targetStatus,
            revision: nextRevision,
            updatedAtIso: nowIso,
            ...(input.targetStatus === 'approved' ? { approvedAtIso: nowIso, approvedBy: params.principal.uid } : {}),
          };
          if (input.targetStatus === 'rejected') {
            delete updatedDoc.approvedAtIso;
            delete updatedDoc.approvedBy;
          }

          const modRecord: BargainModerationRecord = {
            bargainId,
            status: input.targetStatus,
            revision: nextRevision,
            moderatedByUid: params.principal.uid,
            moderatedByRole: adminDecision.effectiveRole,
            moderatedAtIso: nowIso,
            lastTransitionFrom: effectiveStoredStatus,
            ...(input.targetStatus === 'rejected' && input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
          };

          tx.set(`bargains/${bargainId}`, updatedDoc as unknown as Record<string, unknown>);
          tx.set(`bargainModeration/${bargainId}`, modRecord as unknown as Record<string, unknown>);

          return {
            bargainId,
            previousStatus: effectiveStoredStatus,
            moderationStatus: input.targetStatus,
            revision: nextRevision,
            moderatedAtIso: nowIso,
          };
        },
      );

      await emitAudit({
        principal: { ...params.principal, role: adminDecision.effectiveRole },
        correlationId: params.correlationId,
        action: `bargains.moderate.${input.targetStatus}`,
        bargainId,
        outcome: 'SUCCESS',
        metadata: {
          previousStatus: moderationResult.previousStatus,
          newStatus: moderationResult.moderationStatus,
          revision: moderationResult.revision,
        },
      });
      return moderationResult;
    },

    async getPublicBargainById(bargainId: string): Promise<PublicBargainProjection> {
      const validId = validateBargainDocId(bargainId);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'bargains.get_public', maxAttempts: 2 },
        async (tx) => {
          const snap = await tx.get<StoredBargainDocument>(`bargains/${validId}`);
          const projection = toPublicBargainProjection(snap.data, nowFn());
          if (!snap.exists || !projection) {
            throw new CoreApiError('NOT_FOUND', 404, 'Public approved bargain listing was not found.');
          }
          return projection;
        },
      );
    },

    async listPublicBargainsByHood(hoodId: number, limit = 20): Promise<PublicBargainProjection[]> {
      if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'hoodId must be an integer between 1 and 999.');
      }
      if (!deps.queryReader) return [];
      const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
      const docs = await deps.queryReader.listBargainsByHood({ hoodId, limit: safeLimit });
      const nowMs = nowFn();
      return docs.map((d) => toPublicBargainProjection(d, nowMs)).filter((p): p is PublicBargainProjection => p !== null);
    },
  };
}
