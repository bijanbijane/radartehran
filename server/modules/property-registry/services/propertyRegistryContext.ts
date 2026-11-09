/**
 * @file server/modules/property-registry/services/propertyRegistryContext.ts
 * @description Shared persistence collection constants, dependency interfaces, and authorization/validation
 * helpers for the Canonical Property Registry service layer.
 */

import {
  CoreApiError,
  createStructuredAuditEvent,
  requireSafeFirestoreId,
  type AuditEventSink,
  type AuthenticatedPrincipal,
  type IdempotencyStoreAdapter,
} from '../../core';
import type {
  DataIngestionProvenanceReadAdapter,
  GeographyReadAdapter,
} from '../contracts/externalAdapters';
import type {
  CanonicalPropertyEntity,
  DataQualityFindingRecord,
  EntityRelationshipRecord,
  ExternalIdentifierMappingRecord,
  SourceProvenanceReference,
} from '../domain/types';
import { computeIdentityQualityDimensions } from '../resolution/relationshipsAndResolutionEngine';

export const PROPERTY_REGISTRY_COLLECTIONS = {
  ENTITIES: 'property_registry_entities',
  INITIAL_SNAPSHOTS: 'property_registry_initial_snapshots',
  RELATIONSHIPS: 'property_registry_relationships',
  EXTERNAL_IDENTIFIERS: 'property_registry_external_identifiers',
  DUPLICATE_CANDIDATES: 'property_registry_duplicate_candidates',
  IDENTITY_LINEAGE: 'property_registry_identity_lineage',
  ATTRIBUTE_HISTORY: 'property_registry_attribute_history',
  QUALITY_FINDINGS: 'property_registry_quality_findings',
} as const;

export interface PropertyRegistryStoreTransaction {
  get<T>(collectionName: string, docId: string): Promise<T | null>;
  query<T>(collectionName: string): Promise<T[]>;
  set<T>(collectionName: string, docId: string, data: T): void;
  update(collectionName: string, docId: string, patch: Record<string, unknown>): void;
  delete(collectionName: string, docId: string): void;
}

export interface PropertyRegistryTransactionRunner {
  runTransaction<T>(work: (tx: PropertyRegistryStoreTransaction) => Promise<T>): Promise<T>;
}

export interface PropertyRegistryServiceDependencies {
  txRunner: PropertyRegistryTransactionRunner;
  idempotencyStore: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  geographyAdapter: GeographyReadAdapter;
  ingestionProvenanceAdapter?: DataIngestionProvenanceReadAdapter;
  now?: () => Date;
}

/**
 * Executes a durable transaction with exponential backoff on transient ABORTED contention.
 */
export async function runRegistryDurableTx<T>(
  txRunner: PropertyRegistryTransactionRunner,
  operationName: string,
  work: (tx: PropertyRegistryStoreTransaction) => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await txRunner.runTransaction(work);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransientAbort =
        code === 'ABORTED' || msg.includes('ABORTED') || msg.includes('TRANSIENT_CONCURRENCY');
      if (isTransientAbort && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 5 * attempt));
        continue;
      }
      throw err;
    }
  }
}

export async function recordRegistryAuditEvent(
  deps: PropertyRegistryServiceDependencies,
  params: {
    principal: AuthenticatedPrincipal;
    action: string;
    targetCollection: string;
    targetResourceId: string;
    outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  if (!deps.auditSink) return;
  const event = createStructuredAuditEvent({
    correlationId: `corr_${Date.now()}`,
    principal: params.principal,
    action: params.action,
    targetCollection: params.targetCollection,
    targetResourceId: params.targetResourceId,
    outcome: params.outcome,
    metadata: params.metadata,
  });
  await deps.auditSink.writeAuditEvent(event);
}

export function requireValidId(raw: string, fieldName: string): string {
  const res = requireSafeFirestoreId()(raw, fieldName);
  if (!res.ok || !res.value) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `INVALID_ID_FORMAT: Invalid ${fieldName}: '${raw}'`,
    );
  }
  return res.value;
}

export function isPrincipalAdminOrReviewer(
  principal: AuthenticatedPrincipal | null | undefined,
): boolean {
  if (!principal || !principal.uid) return false;
  if (
    principal.role === 'delegated_admin' ||
    principal.role === 'primary_admin' ||
    principal.role === 'server_secret_admin'
  ) {
    return true;
  }
  const scopes = Array.isArray(principal.claims?.scopes)
    ? (principal.claims.scopes as string[])
    : [];
  return (
    scopes.includes('property_registry:review') || scopes.includes('property_registry:merge')
  );
}

/**
 * Ensures the caller is authenticated and prevents client-supplied privilege escalation.
 */
export function assertRegistryWriteAuthorized(
  principal: AuthenticatedPrincipal | null | undefined,
  operation: 'CREATE_OR_UPDATE_ENTITY' | 'REVIEW_MATCH' | 'CONSEQUENTIAL_MERGE_OR_SPLIT',
): AuthenticatedPrincipal {
  if (!principal || !principal.uid || principal.role === 'guest') {
    throw new CoreApiError(
      'UNAUTHENTICATED',
      401,
      'AUTHENTICATION_REQUIRED: Authenticated principal is required.',
    );
  }

  if (operation === 'CONSEQUENTIAL_MERGE_OR_SPLIT' || operation === 'REVIEW_MATCH') {
    if (!isPrincipalAdminOrReviewer(principal)) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        `REGISTRY_REVIEWER_PERMISSION_REQUIRED: Principal '${principal.uid}' lacks administrative/reviewer permission for '${operation}'.`,
      );
    }
  }

  return principal;
}

export function canAccessUnredactedPropertyDetails(
  principal: AuthenticatedPrincipal | null | undefined,
  entity: CanonicalPropertyEntity,
): boolean {
  if (!principal || !principal.uid) return false;
  if (isPrincipalAdminOrReviewer(principal)) return true;
  if (entity.createdByUid === principal.uid) return true;
  const scopes = Array.isArray(principal.claims?.scopes)
    ? (principal.claims.scopes as string[])
    : [];
  return scopes.includes('property_registry:read_full');
}

export function computePopulatedAttributeRatio(entity: CanonicalPropertyEntity): number {
  let total = 4;
  let populated = 2;
  if (entity.geographicRef.neighborhoodCompositeId) populated += 1;
  if (entity.geographicRef.coordinates) populated += 1;

  if (entity.entityKind === 'PARCEL') {
    total += 3;
    if (entity.parcelAreaSqm !== null) populated += 1;
    if (entity.officialParcelIdentifier !== null) populated += 1;
    if (entity.boundaryReferenceId !== null) populated += 1;
  } else if (entity.entityKind === 'BUILDING') {
    total += 3;
    if (entity.associatedParcelIds.length > 0) populated += 1;
    if (
      entity.constructionYear.exactYearSolarHijri !== null ||
      entity.constructionYear.estimatedPeriodFromSolarHijri !== null
    ) {
      populated += 1;
    }
    if (entity.floorCount.aboveGroundFloors !== null) populated += 1;
  } else if (entity.entityKind === 'UNIT') {
    total += 3;
    if (entity.parentBuildingId !== null) populated += 1;
    if (entity.floorReference !== null) populated += 1;
    if (entity.areaSpec.reportedAreaSqm !== null || entity.areaSpec.verifiedDeedAreaSqm !== null) {
      populated += 1;
    }
  } else if (entity.entityKind === 'OTHER_ASSET') {
    total += 2;
    if (entity.associatedParcelIds.length > 0 || entity.associatedBuildingId !== null) populated += 1;
    if (entity.reportedAreaSqm !== null) populated += 1;
  }

  return Number((populated / total).toFixed(2));
}

export async function refreshEntityQualityDimensionsInTx(
  tx: PropertyRegistryStoreTransaction,
  entity: CanonicalPropertyEntity,
  nowIso: string,
): Promise<CanonicalPropertyEntity> {
  const allFindings = await tx.query<DataQualityFindingRecord>(
    PROPERTY_REGISTRY_COLLECTIONS.QUALITY_FINDINGS,
  );
  const entityFindings = allFindings.filter((f) => f.canonicalEntityId === entity.canonicalId);

  const allRels = await tx.query<EntityRelationshipRecord>(
    PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS,
  );
  const hasStructuralRelationship = allRels.some(
    (r) =>
      r.status === 'ACTIVE' &&
      (r.sourceEntityId === entity.canonicalId || r.targetEntityId === entity.canonicalId),
  );

  const allExtIds = await tx.query<ExternalIdentifierMappingRecord>(
    PROPERTY_REGISTRY_COLLECTIONS.EXTERNAL_IDENTIFIERS,
  );
  const hasVerifiedOfficialIdentifier =
    (entity.entityKind === 'PARCEL' && Boolean(entity.officialParcelIdentifierVerified)) ||
    allExtIds.some(
      (id) =>
        id.canonicalEntityId === entity.canonicalId &&
        id.status === 'ACTIVE' &&
        id.verificationStatus === 'OFFICIAL_VERIFIED',
    );

  const qualityDimensions = computeIdentityQualityDimensions({
    sourceReferences: entity.sourceReferences,
    hasVerifiedOfficialIdentifier,
    populatedAttributeRatio: computePopulatedAttributeRatio(entity),
    hasStructuralRelationship,
    openFindings: entityFindings,
    nowIso,
  });

  const updated: CanonicalPropertyEntity = {
    ...entity,
    qualityDimensions,
  };
  tx.set(PROPERTY_REGISTRY_COLLECTIONS.ENTITIES, updated.canonicalId, updated);
  return updated;
}

export function sanitizeSourceProvenance(
  input: {
    sourceRecordId: string;
    sourceSystemNamespace: string;
    reliabilityTier?: SourceProvenanceReference['reliabilityTier'];
    notes?: string;
  },
  principal: AuthenticatedPrincipal,
  nowIso: string,
): SourceProvenanceReference {
  const sourceRecordId = requireValidId(input.sourceRecordId, 'sourceRecordId');
  const sourceSystemNamespace = requireValidId(
    input.sourceSystemNamespace,
    'sourceSystemNamespace',
  );

  const isAdmin = isPrincipalAdminOrReviewer(principal);
  let reliabilityTier: SourceProvenanceReference['reliabilityTier'] = 'USER_SUBMITTED';
  if (isAdmin && input.reliabilityTier) {
    reliabilityTier = input.reliabilityTier;
  } else if (
    input.reliabilityTier === 'PLATFORM_INTERNAL' ||
    input.reliabilityTier === 'UNVERIFIED_EXTERNAL'
  ) {
    reliabilityTier = input.reliabilityTier;
  }

  return {
    sourceRecordId,
    sourceSystemNamespace,
    reliabilityTier,
    observedAtIso: nowIso,
    recordedByUid: principal.uid,
    notes: input.notes,
  };
}
