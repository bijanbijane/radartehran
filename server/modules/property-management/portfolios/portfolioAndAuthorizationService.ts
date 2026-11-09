import crypto from 'crypto';
import {
  CoreApiError,
  executeIdempotentMutation,
  runDurableTransaction,
  type AuthenticatedPrincipal,
  type IdempotencyStoreAdapter,
} from '../../core';
import type { PropertyManagementModuleDependencies } from '../contracts/externalAdapters';
import type {
  ManagedPortfolioRecord,
  ManagementAuthorizationRecord,
} from '../domain/models';
import {
  appendToCollectionIndex,
  canActorViewPortfolio,
  isAuthorizationCurrentlyEffective,
  loadIndexedRecords,
  nowTimestamp,
  recordManagementActivity,
  requireAuthenticatedVerifiedUser,
  verifyActorAuthorityForProperty,
  verifyMediaIdsIfSupplied,
} from '../repositories/durableStoreHelpers';
import {
  assertPlainObjectWithNoUntrustedIdentity,
  PORTFOLIO_TYPES,
  requireAuthorityScopes,
  requireCleanString,
  requireEnum,
  requireIdArray,
  requireIsoDateString,
  requireOptionalId,
  requireValidId,
} from '../schemas/validation';

export function createPortfolioAndAuthorizationService(
  deps: PropertyManagementModuleDependencies,
  idempotencyStore: IdempotencyStoreAdapter,
) {
  const nowMs = () => (deps.nowFn ? deps.nowFn() : Date.now());

  return {
    async createPortfolio(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ portfolio: ManagedPortfolioRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);
      const name = requireCleanString(body.name, 'name', 2, 140);
      const portfolioType = requireEnum(body.portfolioType, 'portfolioType', PORTFOLIO_TYPES);
      const managementOrganizationId = requireOptionalId(
        body.managementOrganizationId,
        'managementOrganizationId',
      );
      const requestedId = requireOptionalId(body.portfolioId, 'portfolioId');

      const outcome = await executeIdempotentMutation<ManagedPortfolioRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.portfolio.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: body,
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const ts = nowTimestamp(deps);
          const portfolioId = requestedId ?? `port_${crypto.randomBytes(6).toString('hex')}`;

          const created = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.portfolio.create', maxAttempts: 3 },
            async (tx) => {
              const existing = await tx.get<ManagedPortfolioRecord>(`pmPortfolios/${portfolioId}`);
              if (existing.exists) {
                throw new CoreApiError('CONFLICT', 409, `Portfolio "${portfolioId}" already exists.`);
              }
              // Section 6: Creating a portfolio never automatically grants management authority over properties.
              const doc: ManagedPortfolioRecord = {
                id: portfolioId,
                name,
                portfolioType,
                ownerUid: params.principal.uid,
                ...(managementOrganizationId ? { managementOrganizationId } : {}),
                authorizedManagerUids: [],
                propertyRefs: [],
                membershipHistory: [],
                operatingStatus: 'ACTIVE',
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };
              tx.set(`pmPortfolios/${portfolioId}`, doc as unknown as Record<string, unknown>);
              await appendToCollectionIndex(
                tx,
                `pmOwnerPortfoliosIndex/${params.principal.uid}`,
                portfolioId,
              );
              return doc;
            },
          );
          return { statusCode: 201, body: created };
        },
      });

      return { portfolio: outcome.body, replayed: outcome.replayed };
    },

    async getPortfolio(params: {
      principal: AuthenticatedPrincipal;
      portfolioId: string;
    }): Promise<ManagedPortfolioRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const portfolioId = requireValidId(params.portfolioId, 'portfolioId');

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.portfolio.get', maxAttempts: 2 },
        async (tx) => {
          const snap = await tx.get<ManagedPortfolioRecord>(`pmPortfolios/${portfolioId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Portfolio "${portfolioId}" not found.`);
          }
          const allowed = await canActorViewPortfolio(
            tx,
            snap.data,
            params.principal,
            nowMs(),
          );
          if (!allowed) {
            throw new CoreApiError(
              'FORBIDDEN',
              403,
              'Cross-owner portfolio access is forbidden.',
            );
          }
          return snap.data;
        },
      );
    },

    async addManagedPropertyToPortfolio(params: {
      principal: AuthenticatedPrincipal;
      portfolioId: string;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ portfolio: ManagedPortfolioRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const portfolioId = requireValidId(params.portfolioId, 'portfolioId');
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);
      const propertyRefId = requireValidId(body.propertyRefId, 'propertyRefId');
      const arrangementNote =
        body.arrangementNote !== undefined
          ? requireCleanString(body.arrangementNote, 'arrangementNote', 1, 240)
          : undefined;

      const outcome = await executeIdempotentMutation<ManagedPortfolioRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.portfolio.add_property',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { portfolioId, ...body },
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const updated = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.portfolio.add_property', maxAttempts: 3 },
            async (tx) => {
              const snap = await tx.get<ManagedPortfolioRecord>(`pmPortfolios/${portfolioId}`);
              if (!snap.exists || !snap.data) {
                throw new CoreApiError('NOT_FOUND', 404, `Portfolio "${portfolioId}" not found.`);
              }
              const portfolio = snap.data;
              const canAccessPortfolio = await canActorViewPortfolio(
                tx,
                portfolio,
                params.principal,
                nowMs(),
              );
              if (!canAccessPortfolio) {
                throw new CoreApiError('FORBIDDEN', 403, 'Actor is not authorized on this portfolio.');
              }

              // Validate actor has verified ownership or active FULL_PROPERTY_MANAGEMENT authority on the property
              const authCtx = await verifyActorAuthorityForProperty({
                tx,
                deps,
                principal: params.principal,
                propertyRefId,
                requiredScope: 'FULL_PROPERTY_MANAGEMENT',
                portfolioId,
                nowEpochMs: nowMs(),
              });

              if (deps.geography) {
                const geoCheck = await deps.geography.validateGeographicReference(
                  authCtx.propertySnapshot.geographicRef.cityId,
                  authCtx.propertySnapshot.geographicRef.hoodId,
                );
                if (!geoCheck.valid) {
                  throw new CoreApiError(
                    'VALIDATION_FAILED',
                    400,
                    'Property geographic reference failed Geography module validation.',
                  );
                }
              }

              if (portfolio.propertyRefs.some((p) => p.propertyRefId === propertyRefId)) {
                return portfolio;
              }

              const ts = nowTimestamp(deps);
              const nextPortfolio: ManagedPortfolioRecord = {
                ...portfolio,
                propertyRefs: [
                  ...portfolio.propertyRefs,
                  {
                    propertyRefId,
                    ...(authCtx.propertySnapshot.buildingRefId
                      ? { buildingRefId: authCtx.propertySnapshot.buildingRefId }
                      : {}),
                    ...(authCtx.propertySnapshot.unitRefId
                      ? { unitRefId: authCtx.propertySnapshot.unitRefId }
                      : {}),
                    category: authCtx.propertySnapshot.category,
                    addedByUid: params.principal.uid,
                    addedAt: ts,
                    ...(arrangementNote ? { arrangementNote } : {}),
                  },
                ],
                membershipHistory: [
                  ...portfolio.membershipHistory,
                  {
                    propertyRefId,
                    ...(authCtx.propertySnapshot.buildingRefId
                      ? { buildingRefId: authCtx.propertySnapshot.buildingRefId }
                      : {}),
                    ...(authCtx.propertySnapshot.unitRefId
                      ? { unitRefId: authCtx.propertySnapshot.unitRefId }
                      : {}),
                    action: 'ADDED',
                    actorUid: params.principal.uid,
                    occurredAt: ts,
                    ...(arrangementNote ? { reason: arrangementNote } : {}),
                  },
                ],
                revision: portfolio.revision + 1,
                updatedAt: ts,
              };

              tx.set(`pmPortfolios/${portfolioId}`, nextPortfolio as unknown as Record<string, unknown>);
              await recordManagementActivity({
                tx,
                deps,
                principal: params.principal,
                actorRole: authCtx.actorRole,
                portfolioId,
                propertyRefId,
                entityType: 'PORTFOLIO',
                entityId: portfolioId,
                action: 'portfolio.property_added',
                summary: `Property ${propertyRefId} added to portfolio ${portfolioId}.`,
                correlationId: params.correlationId,
                nowTs: ts,
              });
              return nextPortfolio;
            },
          );
          return { statusCode: 200, body: updated };
        },
      });

      return { portfolio: outcome.body, replayed: outcome.replayed };
    },

    async removeManagedPropertyFromPortfolio(params: {
      principal: AuthenticatedPrincipal;
      portfolioId: string;
      propertyRefId: string;
      reason?: string;
      correlationId: string;
    }): Promise<ManagedPortfolioRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const portfolioId = requireValidId(params.portfolioId, 'portfolioId');
      const propertyRefId = requireValidId(params.propertyRefId, 'propertyRefId');
      const reason = params.reason ? requireCleanString(params.reason, 'reason', 2, 240) : 'Removed from portfolio';

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.portfolio.remove_property', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<ManagedPortfolioRecord>(`pmPortfolios/${portfolioId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Portfolio "${portfolioId}" not found.`);
          }
          const portfolio = snap.data;
          if (portfolio.ownerUid !== params.principal.uid) {
            throw new CoreApiError('FORBIDDEN', 403, 'Only portfolio owner may remove managed property references.');
          }
          const existingRef = portfolio.propertyRefs.find((p) => p.propertyRefId === propertyRefId);
          if (!existingRef) {
            throw new CoreApiError('NOT_FOUND', 404, `Property "${propertyRefId}" is not in portfolio "${portfolioId}".`);
          }

          const ts = nowTimestamp(deps);
          const nextPortfolio: ManagedPortfolioRecord = {
            ...portfolio,
            propertyRefs: portfolio.propertyRefs.filter((p) => p.propertyRefId !== propertyRefId),
            membershipHistory: [
              ...portfolio.membershipHistory,
              {
                propertyRefId,
                ...(existingRef.buildingRefId ? { buildingRefId: existingRef.buildingRefId } : {}),
                ...(existingRef.unitRefId ? { unitRefId: existingRef.unitRefId } : {}),
                action: 'REMOVED',
                actorUid: params.principal.uid,
                occurredAt: ts,
                reason,
              },
            ],
            revision: portfolio.revision + 1,
            updatedAt: ts,
          };
          tx.set(`pmPortfolios/${portfolioId}`, nextPortfolio as unknown as Record<string, unknown>);
          await recordManagementActivity({
            tx,
            deps,
            principal: params.principal,
            actorRole: 'OWNER',
            portfolioId,
            propertyRefId,
            entityType: 'PORTFOLIO',
            entityId: portfolioId,
            action: 'portfolio.property_removed',
            summary: `Property ${propertyRefId} removed from portfolio ${portfolioId} (canonical property preserved).`,
            correlationId: params.correlationId,
            nowTs: ts,
          });
          return nextPortfolio;
        },
      );
    },

    async grantManagementAuthorization(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ authorization: ManagementAuthorizationRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);
      const propertyRefId = requireValidId(body.propertyRefId, 'propertyRefId');
      const portfolioId = requireOptionalId(body.portfolioId, 'portfolioId');
      const authorizedManagerUid = requireValidId(body.authorizedManagerUid, 'authorizedManagerUid');
      const authorizedOrganizationId = requireOptionalId(
        body.authorizedOrganizationId,
        'authorizedOrganizationId',
      );
      const scopes = requireAuthorityScopes(body.scopes, 'scopes');
      const startDateIso = requireIsoDateString(body.startDateIso, 'startDateIso');
      const expirationDateIso = requireIsoDateString(body.expirationDateIso, 'expirationDateIso');
      const supportingEvidenceMediaIds = requireIdArray(
        body.supportingEvidenceMediaIds,
        'supportingEvidenceMediaIds',
      );
      const autoConfirm = body.autoConfirm === true;

      if (Date.parse(expirationDateIso) <= Date.parse(startDateIso)) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'expirationDateIso must be strictly after startDateIso.',
        );
      }

      await verifyMediaIdsIfSupplied(deps, supportingEvidenceMediaIds, params.principal.uid);

      const outcome = await executeIdempotentMutation<ManagementAuthorizationRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.authorization.grant',
        idempotencyKey: params.idempotencyKey,
        requestPayload: body,
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const propSnap = await deps.propertyRegistry.getPropertyOrUnitSnapshot(propertyRefId);
          if (!propSnap) {
            throw new CoreApiError('NOT_FOUND', 404, `Property "${propertyRefId}" not found in Property Registry.`);
          }
          // Only a verified canonical property owner may grant management authorization
          if (!propSnap.verifiedOwnerUids.includes(params.principal.uid)) {
            throw new CoreApiError(
              'FORBIDDEN',
              403,
              'Only a verified property owner in Property Registry may grant management authorization.',
            );
          }

          const ts = nowTimestamp(deps);
          const authId = `pmauth_${crypto.randomBytes(6).toString('hex')}`;
          const initialState = autoConfirm ? 'ACTIVE' : 'PENDING';
          const initialConfirmation = autoConfirm ? 'CONFIRMED' : 'PENDING_CONFIRMATION';

          const record = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.authorization.grant', maxAttempts: 3 },
            async (tx) => {
              const authDoc: ManagementAuthorizationRecord = {
                id: authId,
                ...(portfolioId ? { portfolioId } : {}),
                propertyRefId,
                ...(propSnap.buildingRefId ? { buildingRefId: propSnap.buildingRefId } : {}),
                ...(propSnap.unitRefId ? { unitRefId: propSnap.unitRefId } : {}),
                authorizingOwnerUid: params.principal.uid,
                authorizedManagerUid,
                ...(authorizedOrganizationId ? { authorizedOrganizationId } : {}),
                scopes,
                startDateIso,
                expirationDateIso,
                supportingEvidenceMediaIds,
                confirmationStatus: initialConfirmation,
                revocationStatus: 'NOT_REVOKED',
                state: initialState,
                history: [
                  {
                    fromState: 'NONE',
                    toState: initialState,
                    actorUid: params.principal.uid,
                    occurredAt: ts,
                    reason: 'Granted by verified property owner',
                  },
                ],
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              tx.set(`pmAuthorizations/${authId}`, authDoc as unknown as Record<string, unknown>);
              await appendToCollectionIndex(tx, `pmPropertyAuthorizationsIndex/${propertyRefId}`, authId);

              if (portfolioId) {
                await appendToCollectionIndex(tx, `pmPortfolioAuthorizationsIndex/${portfolioId}`, authId);
                const portSnap = await tx.get<ManagedPortfolioRecord>(`pmPortfolios/${portfolioId}`);
                if (portSnap.exists && portSnap.data && portSnap.data.ownerUid === params.principal.uid && autoConfirm) {
                  const mgrs = Array.from(new Set([...portSnap.data.authorizedManagerUids, authorizedManagerUid]));
                  tx.set(`pmPortfolios/${portfolioId}`, {
                    ...portSnap.data,
                    authorizedManagerUids: mgrs,
                    revision: portSnap.data.revision + 1,
                    updatedAt: ts,
                  });
                }
              }

              await recordManagementActivity({
                tx,
                deps,
                principal: params.principal,
                actorRole: 'OWNER',
                portfolioId,
                propertyRefId,
                entityType: 'AUTHORIZATION',
                entityId: authId,
                action: 'authorization.granted',
                summary: `Management authorization ${authId} granted to ${authorizedManagerUid}.`,
                correlationId: params.correlationId,
                nowTs: ts,
              });
              return authDoc;
            },
          );

          return { statusCode: 201, body: record };
        },
      });

      return { authorization: outcome.body, replayed: outcome.replayed };
    },

    async confirmManagementAuthorization(params: {
      principal: AuthenticatedPrincipal;
      authorizationId: string;
      correlationId: string;
    }): Promise<ManagementAuthorizationRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const authorizationId = requireValidId(params.authorizationId, 'authorizationId');

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.authorization.confirm', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<ManagementAuthorizationRecord>(`pmAuthorizations/${authorizationId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Authorization "${authorizationId}" not found.`);
          }
          const auth = snap.data;
          if (auth.authorizedManagerUid !== params.principal.uid && auth.authorizingOwnerUid !== params.principal.uid) {
            throw new CoreApiError('FORBIDDEN', 403, 'Only the authorized manager or authorizing owner may confirm.');
          }
          if (auth.revocationStatus === 'REVOKED' || auth.state === 'REVOKED') {
            throw new CoreApiError('CONFLICT', 409, 'Revoked authorization cannot be confirmed.');
          }
          if (Date.parse(auth.expirationDateIso) <= nowMs()) {
            throw new CoreApiError('CONFLICT', 409, 'Authorization has already expired.');
          }

          const ts = nowTimestamp(deps);
          const updated: ManagementAuthorizationRecord = {
            ...auth,
            confirmationStatus: 'CONFIRMED',
            state: 'ACTIVE',
            history: [
              ...auth.history,
              {
                fromState: auth.state,
                toState: 'ACTIVE',
                actorUid: params.principal.uid,
                occurredAt: ts,
                reason: 'Confirmed by authorized participant',
              },
            ],
            revision: auth.revision + 1,
            updatedAt: ts,
          };
          tx.set(`pmAuthorizations/${authorizationId}`, updated as unknown as Record<string, unknown>);

          if (auth.portfolioId) {
            const portSnap = await tx.get<ManagedPortfolioRecord>(`pmPortfolios/${auth.portfolioId}`);
            if (portSnap.exists && portSnap.data) {
              const mgrs = Array.from(new Set([...portSnap.data.authorizedManagerUids, auth.authorizedManagerUid]));
              tx.set(`pmPortfolios/${auth.portfolioId}`, {
                ...portSnap.data,
                authorizedManagerUids: mgrs,
                revision: portSnap.data.revision + 1,
                updatedAt: ts,
              });
            }
          }
          return updated;
        },
      );
    },

    async revokeOrSuspendManagementAuthorization(params: {
      principal: AuthenticatedPrincipal;
      authorizationId: string;
      targetState: 'REVOKED' | 'SUSPENDED';
      reason: string;
      correlationId: string;
    }): Promise<ManagementAuthorizationRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const authorizationId = requireValidId(params.authorizationId, 'authorizationId');
      const reason = requireCleanString(params.reason, 'reason', 3, 280);

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.authorization.revoke', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<ManagementAuthorizationRecord>(`pmAuthorizations/${authorizationId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Authorization "${authorizationId}" not found.`);
          }
          const auth = snap.data;
          if (auth.authorizingOwnerUid !== params.principal.uid) {
            throw new CoreApiError('FORBIDDEN', 403, 'Only the authorizing property owner may revoke or suspend authority.');
          }

          const ts = nowTimestamp(deps);
          const updated: ManagementAuthorizationRecord = {
            ...auth,
            state: params.targetState,
            revocationStatus: params.targetState === 'REVOKED' ? 'REVOKED' : auth.revocationStatus,
            ...(params.targetState === 'REVOKED'
              ? { revokedAt: ts, revokedByUid: params.principal.uid, revocationReason: reason }
              : {}),
            history: [
              ...auth.history,
              {
                fromState: auth.state,
                toState: params.targetState,
                actorUid: params.principal.uid,
                occurredAt: ts,
                reason,
              },
            ],
            revision: auth.revision + 1,
            updatedAt: ts,
          };
          tx.set(`pmAuthorizations/${authorizationId}`, updated as unknown as Record<string, unknown>);

          await recordManagementActivity({
            tx,
            deps,
            principal: params.principal,
            actorRole: 'OWNER',
            portfolioId: auth.portfolioId,
            propertyRefId: auth.propertyRefId ?? 'portfolio',
            entityType: 'AUTHORIZATION',
            entityId: authorizationId,
            action: `authorization.${params.targetState.toLowerCase()}`,
            summary: `Authorization ${authorizationId} ${params.targetState}: ${reason}`,
            correlationId: params.correlationId,
            nowTs: ts,
          });
          return updated;
        },
      );
    },

    async getAuthorizationsForProperty(params: {
      principal: AuthenticatedPrincipal;
      propertyRefId: string;
    }): Promise<ManagementAuthorizationRecord[]> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const propertyRefId = requireValidId(params.propertyRefId, 'propertyRefId');
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.authorization.list', maxAttempts: 2 },
        async (tx) => {
          const all = await loadIndexedRecords<ManagementAuthorizationRecord>(
            tx,
            `pmPropertyAuthorizationsIndex/${propertyRefId}`,
            'pmAuthorizations',
          );
          const currentNow = nowMs();
          return all
            .filter(
              (a) =>
                a.authorizingOwnerUid === params.principal.uid ||
                a.authorizedManagerUid === params.principal.uid,
            )
            .map((a) => {
              if (a.state === 'ACTIVE' && !isAuthorizationCurrentlyEffective(a, currentNow)) {
                return { ...a, state: 'EXPIRED' as const };
              }
              return a;
            });
        },
      );
    },
  };
}
