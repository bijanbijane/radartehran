import crypto from 'crypto';
import {
  authorizePrincipal,
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
  createStructuredAuditEvent,
  decodePaginationCursor,
  encodePaginationCursor,
  executeIdempotentMutation,
  normalizeFirestoreTimestamp,
  requireSafeFirestoreId,
  runDurableTransaction,
  verifyAdminOrDelegatedPrincipal,
  type AuthenticatedPrincipal,
} from '../core';
import {
  createDefaultNeighborhoodDirectoryAdapter,
  resolveBuyerAlertPolicy,
  validateCreateBuyerAlertInput,
  validateUpdateBuyerAlertInput,
  validateWithdrawBuyerAlertInput,
} from './policyAndValidation';
import type {
  AdminCrmBuyerAlertView,
  BuyerAlertsModuleDependencies,
  OwnerBuyerAlertView,
  StoredBuyerAlertDocument,
  SupportedCityId,
} from './types';

export function toOwnerBuyerAlertView(doc: StoredBuyerAlertDocument): OwnerBuyerAlertView {
  return {
    id: doc.id,
    ownerUid: doc.ownerUid,
    cityId: doc.cityId,
    hoodId: doc.hoodId,
    hoodName: doc.hoodName,
    fullName: doc.fullName,
    contactChannels: doc.contactChannels.map((c) => ({ ...c })),
    dealType: doc.dealType,
    maxBudgetText: doc.maxBudgetText,
    status: doc.status,
    revision: doc.revision,
    consentVersion: doc.consentEvidence.consentVersion,
    consentAtIso: doc.consentEvidence.consentAt.iso,
    createdAtIso: doc.createdAt.iso,
    updatedAtIso: doc.updatedAt.iso,
    expiresAtIso: doc.expiresAt.iso,
    ...(doc.withdrawnAt ? { withdrawnAtIso: doc.withdrawnAt.iso } : {}),
  };
}

export function toAdminCrmBuyerAlertView(doc: StoredBuyerAlertDocument): AdminCrmBuyerAlertView {
  return {
    ...toOwnerBuyerAlertView(doc),
    logicalScopeKey: doc.logicalScopeKey,
    ...(doc.primaryPhone ? { primaryPhone: doc.primaryPhone } : {}),
    explicitUserAction: doc.consentEvidence.explicitUserAction,
    acknowledgedRetentionDays: doc.consentEvidence.acknowledgedRetentionDays,
  };
}

export function isBuyerAlertExpired(doc: StoredBuyerAlertDocument, nowEpochMs: number): boolean {
  return doc.status === 'expired' || nowEpochMs >= doc.expiresAt.epochMs;
}

export function createBuyerAlertsService(deps: BuyerAlertsModuleDependencies) {
  const policy = resolveBuyerAlertPolicy(deps.businessPolicy);
  const directory = deps.neighborhoodDirectory ?? createDefaultNeighborhoodDirectoryAdapter();
  const idempotencyStore = deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());
  const cursorSecret = deps.cursorSecret ?? 'radartehran-buyer-alerts-cursor-v1';

  async function emitAudit(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    correlationId: string;
    action: string;
    alertId: string;
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
        targetCollection: 'buyerAlerts',
        targetResourceId: params.alertId,
        outcome: params.outcome,
        reasonCode: params.reasonCode,
        metadata: params.metadata,
        nowIso: new Date(nowFn()).toISOString(),
      }),
    );
  }

  function validateAlertDocId(rawId: unknown): string {
    const res = requireSafeFirestoreId()(rawId, 'alertId');
    if (!res.ok || !res.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid buyer alert ID.', res.issues);
    return res.value;
  }

  async function requireOwnerAccess(principal: AuthenticatedPrincipal, ownerUid: string): Promise<void> {
    const authz = await authorizePrincipal(
      principal,
      { minimumRole: 'verified_user', resourceOwnerUid: ownerUid, allowAdminOverrideForOwnership: false },
      deps.adminStore,
      deps.primaryAdminEmails,
    );
    if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');
  }

  function parseDecodedCursor(rawCursor?: string | null): { sortEpochMs: number; docId: string } | null {
    if (!rawCursor) return null;
    const c = decodePaginationCursor(rawCursor, cursorSecret);
    if (!c || typeof c.sortValue !== 'number') throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid pagination cursor.');
    return { sortEpochMs: c.sortValue, docId: c.docId };
  }

  function buildPagedSlice<T>(
    docs: StoredBuyerAlertDocument[],
    safeLimit: number,
    mapper: (d: StoredBuyerAlertDocument) => T,
  ): { items: T[]; hasMore: boolean; nextCursor: string | null } {
    const hasMore = docs.length > safeLimit;
    const slice = hasMore ? docs.slice(0, safeLimit) : docs;
    const lastDoc = slice[slice.length - 1];
    const nextCursor =
      hasMore && lastDoc
        ? encodePaginationCursor({ sortValue: lastDoc.createdAt.epochMs, docId: lastDoc.id, direction: 'desc' }, cursorSecret)
        : null;
    return { items: slice.map(mapper), hasMore, nextCursor };
  }

  return {
    async createBuyerAlert(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ replayed: boolean; statusCode: number; alert: OwnerBuyerAlertView }> {
      const authz = await authorizePrincipal(
        params.principal,
        { minimumRole: 'verified_user' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');

      const validation = validateCreateBuyerAlertInput(params.rawBody, policy);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid buyer alert submission.', validation.issues);
      }
      const input = validation.value;

      const resolvedHood = directory.resolveCityNeighborhood(input.cityId, input.hoodId);
      if (!resolvedHood) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Neighborhood ${input.hoodId} does not belong to city "${input.cityId}".`,
          [{ field: 'hoodId', code: 'INVALID_FORMAT', message: 'City/neighborhood mismatch.' }],
        );
      }

      try {
        const outcome = await executeIdempotentMutation<OwnerBuyerAlertView>({
          store: idempotencyStore,
          actorUid: params.principal.uid,
          operation: 'buyer_alerts.create',
          idempotencyKey: params.idempotencyKey,
          requestPayload: input,
          nowEpochMs: nowFn(),
          mutationFn: async () => {
            const nowMs = nowFn();
            const createdTs = normalizeFirestoreTimestamp(nowMs)!;
            const retentionDays =
              input.requestedRetentionDays ??
              input.consentEvidence.acknowledgedRetentionDays ??
              policy.retentionDays.defaultDays;
            const expiresTs = normalizeFirestoreTimestamp(nowMs + retentionDays * 24 * 60 * 60 * 1000)!;

            const logicalScopeKey = `${params.principal.uid}_${input.cityId}_hood_${input.hoodId}`;
            const alertId =
              policy.multiplicityMode === 'single_per_city_hood'
                ? logicalScopeKey
                : `${logicalScopeKey}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

            const createdView = await runDurableTransaction(
              deps.txRunner,
              { operationName: 'buyer_alerts.create', maxAttempts: 3 },
              async (tx) => {
                const docPath = `buyerAlerts/${alertId}`;
                const existingSnap = await tx.get<StoredBuyerAlertDocument>(docPath);
                if (existingSnap.exists && existingSnap.data) {
                  const prev = existingSnap.data;
                  const prevActive =
                    (prev.status === 'active' || prev.status === 'contacted') && !isBuyerAlertExpired(prev, nowMs);
                  if (prevActive) {
                    throw new CoreApiError(
                      'CONFLICT',
                      409,
                      `An active buyer alert already exists for ${input.cityId} neighborhood #${input.hoodId}.`,
                    );
                  }
                }

                const primaryMobile = input.contactChannels.find((c) => c.channel === 'ir_mobile')?.value;
                const storedDoc: StoredBuyerAlertDocument = {
                  id: alertId,
                  logicalScopeKey,
                  ownerUid: params.principal.uid,
                  userId: params.principal.uid,
                  cityId: input.cityId,
                  hoodId: resolvedHood.hoodId,
                  hoodName: resolvedHood.hoodName,
                  fullName: input.fullName,
                  ...(primaryMobile ? { primaryPhone: primaryMobile } : {}),
                  contactChannels: input.contactChannels,
                  dealType: input.dealType,
                  maxBudgetText: input.maxBudgetText,
                  status: 'active',
                  revision: 1,
                  consentEvidence: {
                    consentVersion: input.consentEvidence.consentVersion,
                    explicitUserAction: input.consentEvidence.explicitUserAction,
                    acknowledgedRetentionDays: retentionDays,
                    consentAt: createdTs,
                    ...(input.consentEvidence.clientAcceptedAtIso
                      ? { clientAcceptedAtIso: input.consentEvidence.clientAcceptedAtIso }
                      : {}),
                  },
                  createdAt: createdTs,
                  updatedAt: createdTs,
                  expiresAt: expiresTs,
                };

                tx.set(docPath, storedDoc as unknown as Record<string, unknown>);
                return toOwnerBuyerAlertView(storedDoc);
              },
            );

            await emitAudit({
              principal: params.principal,
              correlationId: params.correlationId,
              action: 'buyer_alerts.create',
              alertId: createdView.id,
              outcome: 'SUCCESS',
              metadata: {
                cityId: createdView.cityId,
                hoodId: createdView.hoodId,
                consentVersion: createdView.consentVersion,
              },
            });
            return { statusCode: 201, body: createdView };
          },
        });
        return { replayed: outcome.replayed, statusCode: outcome.statusCode, alert: outcome.body };
      } catch (err) {
        if (err instanceof CoreApiError) throw err;
        throw new CoreApiError(
          'PERSISTENCE_FAILED',
          503,
          err instanceof Error ? err.message : 'Buyer alert persistence failed.',
        );
      }
    },

    async getOwnerBuyerAlert(params: {
      principal: AuthenticatedPrincipal;
      alertId: string;
      correlationId: string;
    }): Promise<OwnerBuyerAlertView> {
      const alertId = validateAlertDocId(params.alertId);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'buyer_alerts.get_owner', maxAttempts: 2 },
        async (tx) => {
          const snap = await tx.get<StoredBuyerAlertDocument>(`buyerAlerts/${alertId}`);
          if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Buyer alert not found.');
          await requireOwnerAccess(params.principal, snap.data.ownerUid);
          return toOwnerBuyerAlertView(snap.data);
        },
      );
    },

    async updateOwnerBuyerAlert(params: {
      principal: AuthenticatedPrincipal;
      alertId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<OwnerBuyerAlertView> {
      const alertId = validateAlertDocId(params.alertId);
      const validation = validateUpdateBuyerAlertInput(params.rawBody, policy);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid buyer alert update payload.', validation.issues);
      }
      const input = validation.value;

      const updatedView = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'buyer_alerts.update_owner', maxAttempts: 3 },
        async (tx) => {
          const docPath = `buyerAlerts/${alertId}`;
          const snap = await tx.get<StoredBuyerAlertDocument>(docPath);
          if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Buyer alert not found.');
          const current = snap.data;

          await requireOwnerAccess(params.principal, current.ownerUid);
          if (current.revision !== input.expectedRevision) {
            throw new CoreApiError('CONFLICT', 409, `Stale revision: stored is ${current.revision}, expected ${input.expectedRevision}.`);
          }
          if (current.status === 'withdrawn' || isBuyerAlertExpired(current, nowFn())) {
            throw new CoreApiError('CONFLICT', 409, 'Withdrawn or expired buyer alerts cannot be updated.');
          }

          const updatedTs = normalizeFirestoreTimestamp(nowFn())!;
          const nextChannels = input.contactChannels ?? current.contactChannels;
          const primaryMobile = nextChannels.find((c) => c.channel === 'ir_mobile')?.value;

          const updatedDoc: StoredBuyerAlertDocument = {
            ...current,
            ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
            ...(input.dealType !== undefined ? { dealType: input.dealType } : {}),
            ...(input.maxBudgetText !== undefined ? { maxBudgetText: input.maxBudgetText } : {}),
            contactChannels: nextChannels,
            ...(primaryMobile ? { primaryPhone: primaryMobile } : {}),
            createdAt: current.createdAt,
            updatedAt: updatedTs,
            revision: current.revision + 1,
          };

          tx.set(docPath, updatedDoc as unknown as Record<string, unknown>);
          return toOwnerBuyerAlertView(updatedDoc);
        },
      );

      await emitAudit({
        principal: params.principal,
        correlationId: params.correlationId,
        action: 'buyer_alerts.update_owner',
        alertId,
        outcome: 'SUCCESS',
        metadata: { revision: updatedView.revision },
      });
      return updatedView;
    },

    async withdrawBuyerAlert(params: {
      principal: AuthenticatedPrincipal;
      alertId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<OwnerBuyerAlertView> {
      const alertId = validateAlertDocId(params.alertId);
      const validation = validateWithdrawBuyerAlertInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid withdrawal payload.', validation.issues);
      }
      const input = validation.value;

      const withdrawnView = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'buyer_alerts.withdraw', maxAttempts: 3 },
        async (tx) => {
          const docPath = `buyerAlerts/${alertId}`;
          const snap = await tx.get<StoredBuyerAlertDocument>(docPath);
          if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Buyer alert not found.');
          const current = snap.data;

          await requireOwnerAccess(params.principal, current.ownerUid);
          if (current.revision !== input.expectedRevision) {
            throw new CoreApiError('CONFLICT', 409, `Stale revision: stored is ${current.revision}, expected ${input.expectedRevision}.`);
          }
          if (current.status === 'withdrawn') throw new CoreApiError('CONFLICT', 409, 'Buyer alert is already withdrawn.');

          const nowTs = normalizeFirestoreTimestamp(nowFn())!;
          const updatedDoc: StoredBuyerAlertDocument = {
            ...current,
            status: 'withdrawn',
            revision: current.revision + 1,
            updatedAt: nowTs,
            withdrawnAt: nowTs,
            ...(input.reason ? { withdrawalReason: input.reason } : {}),
          };

          tx.set(docPath, updatedDoc as unknown as Record<string, unknown>);
          return toOwnerBuyerAlertView(updatedDoc);
        },
      );

      await emitAudit({
        principal: params.principal,
        correlationId: params.correlationId,
        action: 'buyer_alerts.withdraw',
        alertId,
        outcome: 'SUCCESS',
        metadata: { revision: withdrawnView.revision },
      });
      return withdrawnView;
    },

    async expireBuyerAlertIfDue(params: { alertId: string; correlationId: string }): Promise<{ expired: boolean; status: string; revision: number }> {
      const alertId = validateAlertDocId(params.alertId);
      return runDurableTransaction(deps.txRunner, { operationName: 'buyer_alerts.expire_if_due', maxAttempts: 3 }, async (tx) => {
        const docPath = `buyerAlerts/${alertId}`;
        const snap = await tx.get<StoredBuyerAlertDocument>(docPath);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Buyer alert not found.');
        const current = snap.data;
        if (current.status === 'expired') return { expired: true, status: 'expired', revision: current.revision };
        if (current.status === 'withdrawn' || !isBuyerAlertExpired(current, nowFn())) {
          return { expired: false, status: current.status, revision: current.revision };
        }
        const nowTs = normalizeFirestoreTimestamp(nowFn())!;
        const nextRevision = current.revision + 1;
        tx.update(docPath, { status: 'expired', revision: nextRevision, updatedAt: nowTs });
        return { expired: true, status: 'expired', revision: nextRevision };
      });
    },

    async listOwnerBuyerAlerts(params: {
      principal: AuthenticatedPrincipal;
      limit?: number;
      cursor?: string | null;
    }): Promise<{ items: OwnerBuyerAlertView[]; hasMore: boolean; nextCursor: string | null }> {
      const authz = await authorizePrincipal(
        params.principal,
        { minimumRole: 'verified_user' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');
      if (!deps.queryAdapter) return { items: [], hasMore: false, nextCursor: null };

      const safeLimit = Math.max(1, Math.min(50, Math.trunc(params.limit ?? 20)));
      const fetched = await deps.queryAdapter.listByOwner({
        ownerUid: params.principal.uid,
        limit: safeLimit + 1,
        afterCursor: parseDecodedCursor(params.cursor),
      });
      return buildPagedSlice(fetched, safeLimit, toOwnerBuyerAlertView);
    },

    async listAdminBuyerAlerts(params: {
      principal: AuthenticatedPrincipal;
      cityId?: SupportedCityId;
      hoodId?: number;
      includeInactive?: boolean;
      limit?: number;
      cursor?: string | null;
      correlationId: string;
    }): Promise<{ items: AdminCrmBuyerAlertView[]; hasMore: boolean; nextCursor: string | null }> {
      const adminDecision = await verifyAdminOrDelegatedPrincipal(params.principal, deps.adminStore, {
        primaryAdminEmails: deps.primaryAdminEmails,
        disallowStaticToken: true,
      });
      if (!adminDecision.allowed) {
        await emitAudit({
          principal: params.principal,
          correlationId: params.correlationId,
          action: 'buyer_alerts.admin_list',
          alertId: 'collection',
          outcome: 'DENIED',
          reasonCode: adminDecision.failureCode,
        });
        throw new CoreApiError('FORBIDDEN', adminDecision.status, adminDecision.reason ?? 'Administrator access required.');
      }
      if (!deps.queryAdapter) return { items: [], hasMore: false, nextCursor: null };

      const safeLimit = Math.max(1, Math.min(50, Math.trunc(params.limit ?? 20)));
      const fetched = await deps.queryAdapter.listForAdminCrm({
        cityId: params.cityId,
        hoodId: params.hoodId,
        includeInactive: params.includeInactive,
        limit: safeLimit + 1,
        afterCursor: parseDecodedCursor(params.cursor),
      });

      const nowMs = nowFn();
      const filtered = params.includeInactive
        ? fetched
        : fetched.filter((d) => (d.status === 'active' || d.status === 'contacted') && !isBuyerAlertExpired(d, nowMs));
      const paged = buildPagedSlice(filtered, safeLimit, toAdminCrmBuyerAlertView);

      await emitAudit({
        principal: { ...params.principal, role: adminDecision.effectiveRole },
        correlationId: params.correlationId,
        action: 'buyer_alerts.admin_list',
        alertId: 'collection',
        outcome: 'SUCCESS',
        metadata: { count: paged.items.length, cityId: params.cityId ?? 'all' },
      });
      return paged;
    },
  };
}
