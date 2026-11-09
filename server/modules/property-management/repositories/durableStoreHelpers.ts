import crypto from 'crypto';
import {
  authorizePrincipal,
  CoreApiError,
  createStructuredAuditEvent,
  decodePaginationCursor,
  encodePaginationCursor,
  normalizeFirestoreTimestamp,
  type AuthenticatedPrincipal,
  type NormalizedTimestamp,
  type PaginationParams,
  type TransactionContextLike,
} from '../../core';
import type {
  ManagementAuthorityScope,
  ManagedPortfolioRecord,
  ManagementAuthorizationRecord,
} from '../domain/models';
import type {
  PropertyManagementActivityRecord,
  PropertyManagementNotificationOutboxEvent,
} from '../domain/LifecycleAndReportingTypes';
import type {
  CanonicalPropertyRegistrySnapshot,
  PropertyManagementModuleDependencies,
  PropertyManagementNotificationEventType,
} from '../contracts/externalAdapters';

export interface VerifiedPropertyAuthorityContext {
  propertySnapshot: CanonicalPropertyRegistrySnapshot;
  actorRole: 'OWNER' | 'AUTHORIZED_MANAGER' | 'ADMIN';
  authorizationId?: string;
}

export async function requireAuthenticatedVerifiedUser(
  principal: AuthenticatedPrincipal | null | undefined,
  deps: PropertyManagementModuleDependencies,
): Promise<AuthenticatedPrincipal> {
  const decision = await authorizePrincipal(
    principal,
    { minimumRole: 'verified_user' },
    deps.adminStore,
    deps.primaryAdminEmails,
  );
  if (!decision.allowed || !principal) {
    throw new CoreApiError(
      decision.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      decision.status,
      decision.reason ?? 'Authenticated verified user required.',
    );
  }
  return principal;
}

export async function appendToCollectionIndex(
  tx: TransactionContextLike,
  indexDocPath: string,
  itemId: string,
): Promise<void> {
  const snap = await tx.get<{ ids?: string[] }>(indexDocPath);
  const existing = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
  if (!existing.includes(itemId)) {
    tx.set(indexDocPath, { ids: [itemId, ...existing] });
  }
}

export async function loadIndexedRecords<T>(
  tx: TransactionContextLike,
  indexDocPath: string,
  collectionPrefix: string,
): Promise<T[]> {
  const indexSnap = await tx.get<{ ids?: string[] }>(indexDocPath);
  const ids = indexSnap.exists && Array.isArray(indexSnap.data?.ids) ? indexSnap.data!.ids : [];
  const results: T[] = [];
  for (const id of ids) {
    const docSnap = await tx.get<T>(`${collectionPrefix}/${id}`);
    if (docSnap.exists && docSnap.data) {
      results.push(docSnap.data);
    }
  }
  return results;
}

export function isAuthorizationCurrentlyEffective(
  auth: ManagementAuthorizationRecord,
  nowEpochMs: number,
): boolean {
  if (auth.revocationStatus === 'REVOKED' || auth.state === 'REVOKED' || auth.state === 'SUSPENDED') {
    return false;
  }
  if (auth.confirmationStatus !== 'CONFIRMED' || auth.state !== 'ACTIVE') {
    return false;
  }
  const startMs = Date.parse(auth.startDateIso);
  const expMs = Date.parse(auth.expirationDateIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) return false;
  return nowEpochMs >= startMs && nowEpochMs < expMs;
}

export async function verifyActorAuthorityForProperty(params: {
  tx: TransactionContextLike;
  deps: PropertyManagementModuleDependencies;
  principal: AuthenticatedPrincipal;
  propertyRefId: string;
  requiredScope: ManagementAuthorityScope;
  portfolioId?: string;
  nowEpochMs: number;
}): Promise<VerifiedPropertyAuthorityContext> {
  await requireAuthenticatedVerifiedUser(params.principal, params.deps);

  const propertySnapshot = await params.deps.propertyRegistry.getPropertyOrUnitSnapshot(
    params.propertyRefId,
  );
  if (!propertySnapshot) {
    throw new CoreApiError(
      'NOT_FOUND',
      404,
      `Canonical property or unit "${params.propertyRefId}" was not found in Property Registry.`,
    );
  }

  // 1. Direct canonical owner check from Property Registry
  if (propertySnapshot.verifiedOwnerUids.includes(params.principal.uid)) {
    return { propertySnapshot, actorRole: 'OWNER' };
  }

  // 2. Explicit Management Authorization check (never inferred from portfolio creation or profile)
  const auths = await loadIndexedRecords<ManagementAuthorizationRecord>(
    params.tx,
    `pmPropertyAuthorizationsIndex/${params.propertyRefId}`,
    'pmAuthorizations',
  );

  let buildingAuths: ManagementAuthorizationRecord[] = [];
  if (propertySnapshot.buildingRefId && propertySnapshot.buildingRefId === params.propertyRefId) {
    buildingAuths = await loadIndexedRecords<ManagementAuthorizationRecord>(
      params.tx,
      `pmBuildingAuthorizationsIndex/${propertySnapshot.buildingRefId}`,
      'pmAuthorizations',
    );
  }

  const candidateAuths = [...auths, ...buildingAuths];
  for (const auth of candidateAuths) {
    if (auth.authorizedManagerUid !== params.principal.uid) continue;
    if (!propertySnapshot.verifiedOwnerUids.includes(auth.authorizingOwnerUid)) continue;
    if (!isAuthorizationCurrentlyEffective(auth, params.nowEpochMs)) continue;

    // Enforce building/unit explicit scope boundary (Section 16)
    const targetMatches =
      auth.propertyRefId === params.propertyRefId ||
      (auth.unitRefId && auth.unitRefId === propertySnapshot.unitRefId) ||
      (auth.buildingRefId &&
        auth.buildingRefId === params.propertyRefId &&
        propertySnapshot.category === 'MULTI_UNIT_BUILDING');

    if (!targetMatches) continue;

    const hasScope =
      auth.scopes.includes('FULL_PROPERTY_MANAGEMENT') ||
      auth.scopes.includes(params.requiredScope);
    if (hasScope) {
      return {
        propertySnapshot,
        actorRole: 'AUTHORIZED_MANAGER',
        authorizationId: auth.id,
      };
    }
  }

  throw new CoreApiError(
    'FORBIDDEN',
    403,
    `Actor "${params.principal.uid}" lacks verified ownership or active "${params.requiredScope}" management authorization for "${params.propertyRefId}".`,
  );
}

export async function canActorViewPortfolio(
  tx: TransactionContextLike,
  portfolio: ManagedPortfolioRecord,
  principal: AuthenticatedPrincipal,
  nowEpochMs: number,
): Promise<boolean> {
  if (portfolio.ownerUid === principal.uid) return true;
  if (!portfolio.authorizedManagerUids.includes(principal.uid)) return false;

  const portfolioAuths = await loadIndexedRecords<ManagementAuthorizationRecord>(
    tx,
    `pmPortfolioAuthorizationsIndex/${portfolio.id}`,
    'pmAuthorizations',
  );
  return portfolioAuths.some(
    (a) =>
      a.authorizedManagerUid === principal.uid &&
      a.authorizingOwnerUid === portfolio.ownerUid &&
      isAuthorizationCurrentlyEffective(a, nowEpochMs),
  );
}

export async function verifyMediaIdsIfSupplied(
  deps: PropertyManagementModuleDependencies,
  mediaIds: string[],
  actorUid: string,
): Promise<void> {
  if (mediaIds.length === 0) return;
  if (!deps.media) {
    // Do not assume Media provider is configured; store validated ID references only.
    return;
  }
  const check = await deps.media.verifyMediaReferences(mediaIds, actorUid);
  if (!check.valid) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      `Unauthorized or invalid media reference IDs: ${check.invalidIds.join(', ')}`,
    );
  }
}

export async function recordManagementActivity(params: {
  tx: TransactionContextLike;
  deps: PropertyManagementModuleDependencies;
  principal: AuthenticatedPrincipal;
  actorRole: string;
  portfolioId?: string;
  propertyRefId: string;
  entityType: PropertyManagementActivityRecord['entityType'];
  entityId: string;
  action: string;
  summary: string;
  correlationId: string;
  nowTs: NormalizedTimestamp;
}): Promise<PropertyManagementActivityRecord> {
  const activityId = `pmact_${crypto.randomBytes(6).toString('hex')}`;
  const entry: PropertyManagementActivityRecord = {
    id: activityId,
    ...(params.portfolioId ? { portfolioId: params.portfolioId } : {}),
    propertyRefId: params.propertyRefId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    actorUid: params.principal.uid,
    actorRole: params.actorRole,
    summary: params.summary,
    correlationId: params.correlationId,
    occurredAt: params.nowTs,
  };
  params.tx.set(`pmActivityHistory/${activityId}`, entry as unknown as Record<string, unknown>);
  await appendToCollectionIndex(
    params.tx,
    `pmPropertyActivityIndex/${params.propertyRefId}`,
    activityId,
  );
  if (params.portfolioId) {
    await appendToCollectionIndex(
      params.tx,
      `pmPortfolioActivityIndex/${params.portfolioId}`,
      activityId,
    );
  }

  if (params.deps.auditSink) {
    await params.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: params.principal,
        correlationId: params.correlationId,
        action: `property_management.${params.action}`,
        targetCollection: params.entityType.toLowerCase(),
        targetResourceId: params.entityId,
        outcome: 'SUCCESS',
        metadata: { propertyRefId: params.propertyRefId, portfolioId: params.portfolioId },
        nowIso: params.nowTs.iso,
      }),
    );
  }
  return entry;
}

export async function emitDomainNotificationEvent(params: {
  tx: TransactionContextLike;
  deps: PropertyManagementModuleDependencies;
  eventType: PropertyManagementNotificationEventType;
  recipientUid: string;
  idempotencyKey: string;
  correlationId: string;
  nowTs: NormalizedTimestamp;
  variables: Record<string, string | number | boolean>;
}): Promise<PropertyManagementNotificationOutboxEvent> {
  const eventId = `pmevt_${crypto.randomBytes(6).toString('hex')}`;
  const outboxEvent: PropertyManagementNotificationOutboxEvent = {
    eventId,
    eventType: params.eventType,
    recipientUid: params.recipientUid,
    idempotencyKey: params.idempotencyKey,
    correlationId: params.correlationId,
    occurredAtIso: params.nowTs.iso,
    sanitizedVariables: params.variables,
  };

  params.tx.set(`pmNotificationOutbox/${eventId}`, outboxEvent as unknown as Record<string, unknown>);
  await appendToCollectionIndex(params.tx, 'pmNotificationOutboxIndex/all', eventId);

  if (params.deps.notifications) {
    await params.deps.notifications.publishNotificationEvent(outboxEvent);
  }
  return outboxEvent;
}

export function paginateRecordsByCreatedAt<T extends { id: string; createdAt: NormalizedTimestamp }>(
  items: T[],
  pagination: PaginationParams,
): { items: T[]; hasMore: boolean; nextCursor: string | null; totalCount: number } {
  const sorted = [...items].sort((a, b) => {
    const diff =
      pagination.direction === 'asc'
        ? a.createdAt.epochMs - b.createdAt.epochMs
        : b.createdAt.epochMs - a.createdAt.epochMs;
    if (diff !== 0) return diff;
    return pagination.direction === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
  });

  let filtered = sorted;
  if (pagination.cursor) {
    const decoded = decodePaginationCursor(pagination.cursor);
    if (!decoded) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid pagination cursor token.');
    }
    const cursorEpoch = Number(decoded.sortValue);
    filtered = sorted.filter((item) => {
      if (pagination.direction === 'asc') {
        return (
          item.createdAt.epochMs > cursorEpoch ||
          (item.createdAt.epochMs === cursorEpoch && item.id > decoded.docId)
        );
      }
      return (
        item.createdAt.epochMs < cursorEpoch ||
        (item.createdAt.epochMs === cursorEpoch && item.id < decoded.docId)
      );
    });
  }

  const slice = filtered.slice(0, pagination.limit);
  const hasMore = filtered.length > pagination.limit;
  const lastItem = slice[slice.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodePaginationCursor({
          sortValue: lastItem.createdAt.epochMs,
          docId: lastItem.id,
          direction: pagination.direction,
        })
      : null;

  return {
    items: slice,
    hasMore,
    nextCursor,
    totalCount: items.length,
  };
}

export function nowTimestamp(deps: PropertyManagementModuleDependencies): NormalizedTimestamp {
  const ms = deps.nowFn ? deps.nowFn() : Date.now();
  return normalizeFirestoreTimestamp(ms)!;
}
