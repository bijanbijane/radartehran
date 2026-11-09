/**
 * @file server/modules/property-registry/services/propertyRegistryGraphAndIdentifiersService.ts
 * @description External identifier namespace management, structural relationship graph management,
 * bounded entity search, and data quality findings operations for the Canonical Property Registry.
 */

import { randomUUID } from 'node:crypto';
import {
  CoreApiError,
  decodePaginationCursor,
  encodePaginationCursor,
  executeIdempotentMutation,
  normalizePaginationParams,
  sanitizeTextInput,
  type AuthenticatedPrincipal,
} from '../../core';
import type {
  CanonicalPropertyEntity,
  DataQualityFindingRecord,
  DataQualityFindingType,
  EntityRelationshipRecord,
  EntityRelationshipType,
  ExternalIdentifierMappingRecord,
  ExternalIdentifierType,
  PropertyEntityKind,
} from '../domain/types';
import {
  redactEntityForPublicAccess,
  validateRelationshipConsistencyAndPreventCycles,
} from '../resolution/relationshipsAndResolutionEngine';
import {
  assertRegistryWriteAuthorized,
  canAccessUnredactedPropertyDetails,
  isPrincipalAdminOrReviewer,
  PROPERTY_REGISTRY_COLLECTIONS,
  refreshEntityQualityDimensionsInTx,
  requireValidId,
  runRegistryDurableTx,
  sanitizeSourceProvenance,
  type PropertyRegistryServiceDependencies,
} from './propertyRegistryContext';

export function createPropertyRegistryGraphAndIdentifiersOperations(
  deps: PropertyRegistryServiceDependencies,
) {
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * 6. Register external identifier (strictly scoped by issuingSourceNamespace + jurisdictionScope + identifierType)
     */
    async registerExternalIdentifier(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      canonicalEntityId: string;
      identifierType: ExternalIdentifierType;
      identifierValue: string;
      issuingSourceNamespace: string;
      jurisdictionScope: string;
      clientClaimedOfficialVerified?: boolean;
      sourceProvenance: {
        sourceRecordId: string;
        sourceSystemNamespace: string;
        reliabilityTier?:
          | 'AUTHORITATIVE_OFFICIAL'
          | 'VERIFIED_PARTNER'
          | 'PLATFORM_INTERNAL'
          | 'USER_SUBMITTED'
          | 'UNVERIFIED_EXTERNAL';
        notes?: string;
      };
    }): Promise<ExternalIdentifierMappingRecord> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'CREATE_OR_UPDATE_ENTITY');
      const canonicalEntityId = requireValidId(input.canonicalEntityId, 'canonicalEntityId');
      const issuingSourceNamespace = requireValidId(
        input.issuingSourceNamespace,
        'issuingSourceNamespace',
      );
      const jurisdictionScope = requireValidId(input.jurisdictionScope, 'jurisdictionScope');
      const identifierValue = sanitizeTextInput(input.identifierValue).trim().slice(0, 120);

      if (!identifierValue || identifierValue.length < 2) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_EXTERNAL_IDENTIFIER_VALUE: External identifier value must be at least 2 characters.',
        );
      }

      if (
        input.identifierType === 'POSTAL_TEN_DIGIT_CODE' &&
        !/^\d{10}$/.test(identifierValue)
      ) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_IDENTIFIER_FORMAT: POSTAL_TEN_DIGIT_CODE must be an exact 10-digit numeric string.',
        );
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();
      const sourceRef = sanitizeSourceProvenance(input.sourceProvenance, principal, nowIso);
      const isAdmin = isPrincipalAdminOrReviewer(principal);
      const namespaceKey = `${issuingSourceNamespace.toLowerCase()}::${jurisdictionScope.toLowerCase()}::${input.identifierType}::${identifierValue.toLowerCase()}`;

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.registerExternalIdentifier',
        actorUid: principal.uid,
        requestPayload: {
          canonicalEntityId,
          namespaceKey,
          sourceRecordId: sourceRef.sourceRecordId,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.registerExternalIdentifier',
            async (tx) => {
              const entity = await tx.get<CanonicalPropertyEntity>(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                canonicalEntityId,
              );
              if (!entity) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `CANONICAL_ENTITY_NOT_FOUND: Entity '${canonicalEntityId}' not found.`,
                );
              }

              const allMappings = await tx.query<ExternalIdentifierMappingRecord>(
                PROPERTY_REGISTRY_COLLECTIONS.EXTERNAL_IDENTIFIERS,
              );
              const existingSameNamespace = allMappings.find(
                (m) => m.status === 'ACTIVE' && m.namespaceKey === namespaceKey,
              );

              if (existingSameNamespace) {
                if (existingSameNamespace.canonicalEntityId !== canonicalEntityId) {
                  throw new CoreApiError(
                    'CONFLICT',
                    409,
                    `EXTERNAL_IDENTIFIER_NAMESPACE_COLLISION: Identifier '${identifierValue}' in namespace '${issuingSourceNamespace}/${jurisdictionScope}/${input.identifierType}' is already bound to canonical entity '${existingSameNamespace.canonicalEntityId}'.`,
                  );
                }

                const refreshed: ExternalIdentifierMappingRecord = {
                  ...existingSameNamespace,
                  lastObservedAtIso: nowIso,
                };
                tx.set(
                  PROPERTY_REGISTRY_COLLECTIONS.EXTERNAL_IDENTIFIERS,
                  refreshed.mappingId,
                  refreshed,
                );
                return { statusCode: 200, body: refreshed };
              }

              const officialVerified =
                isAdmin &&
                Boolean(input.clientClaimedOfficialVerified) &&
                sourceRef.reliabilityTier === 'AUTHORITATIVE_OFFICIAL';

              const mappingId = `extid_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const mapping: ExternalIdentifierMappingRecord = {
                mappingId,
                namespaceKey,
                identifierType: input.identifierType,
                identifierValue,
                issuingSourceNamespace,
                jurisdictionScope,
                canonicalEntityId,
                canonicalEntityKind: entity.entityKind,
                firstObservedAtIso: nowIso,
                lastObservedAtIso: nowIso,
                verificationStatus: officialVerified
                  ? 'OFFICIAL_VERIFIED'
                  : 'SINGLE_SOURCE_REPORTED',
                provenanceRef: sourceRef,
                confidenceClassification: officialVerified ? 'HIGH' : 'MEDIUM',
                status: 'ACTIVE',
              };

              tx.set(PROPERTY_REGISTRY_COLLECTIONS.EXTERNAL_IDENTIFIERS, mappingId, mapping);
              await refreshEntityQualityDimensionsInTx(tx, entity, nowIso);
              return { statusCode: 201, body: mapping };
            },
          ),
      });

      return res.body;
    },

    /**
     * 7. Resolve external identifier to canonical entity (isolated by namespace + jurisdiction + identifierType)
     */
    async resolveExternalIdentifier(input: {
      principal?: AuthenticatedPrincipal | null;
      issuingSourceNamespace: string;
      jurisdictionScope: string;
      identifierType: ExternalIdentifierType;
      identifierValue: string;
    }): Promise<{
      mapping: ExternalIdentifierMappingRecord;
      resolvedEntity: CanonicalPropertyEntity;
      wasRedirectedFromMergedEntity: boolean;
    } | null> {
      const issuingSourceNamespace = requireValidId(
        input.issuingSourceNamespace,
        'issuingSourceNamespace',
      );
      const jurisdictionScope = requireValidId(input.jurisdictionScope, 'jurisdictionScope');
      const identifierValue = sanitizeTextInput(input.identifierValue).trim().slice(0, 120);
      const namespaceKey = `${issuingSourceNamespace.toLowerCase()}::${jurisdictionScope.toLowerCase()}::${input.identifierType}::${identifierValue.toLowerCase()}`;

      return runRegistryDurableTx(
        deps.txRunner,
        'property_registry.resolveExternalIdentifier',
        async (tx) => {
          const allMappings = await tx.query<ExternalIdentifierMappingRecord>(
            PROPERTY_REGISTRY_COLLECTIONS.EXTERNAL_IDENTIFIERS,
          );
          const mapping = allMappings.find(
            (m) => m.status === 'ACTIVE' && m.namespaceKey === namespaceKey,
          );
          if (!mapping) return null;

          let entity = await tx.get<CanonicalPropertyEntity>(
            PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
            mapping.canonicalEntityId,
          );
          if (!entity) return null;

          let wasRedirected = false;
          if (
            entity.registrationStatus === 'MERGED_REDIRECT' &&
            entity.retiredOrRedirectedToIds.length === 1
          ) {
            const target = await tx.get<CanonicalPropertyEntity>(
              PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
              entity.retiredOrRedirectedToIds[0],
            );
            if (target) {
              entity = target;
              wasRedirected = true;
            }
          }

          const allowFull = canAccessUnredactedPropertyDetails(input.principal, entity);
          return {
            mapping,
            resolvedEntity: allowFull ? entity : redactEntityForPublicAccess(entity),
            wasRedirectedFromMergedEntity: wasRedirected,
          };
        },
      );
    },

    /**
     * 8. Add or remove an entity relationship
     */
    async addEntityRelationship(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      sourceEntityId: string;
      targetEntityId: string;
      relationshipType: EntityRelationshipType;
      validFromIso?: string | null;
      sourceProvenance: {
        sourceRecordId: string;
        sourceSystemNamespace: string;
        reliabilityTier?:
          | 'AUTHORITATIVE_OFFICIAL'
          | 'VERIFIED_PARTNER'
          | 'PLATFORM_INTERNAL'
          | 'USER_SUBMITTED'
          | 'UNVERIFIED_EXTERNAL';
        notes?: string;
      };
    }): Promise<EntityRelationshipRecord> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'CREATE_OR_UPDATE_ENTITY');
      const sourceEntityId = requireValidId(input.sourceEntityId, 'sourceEntityId');
      const targetEntityId = requireValidId(input.targetEntityId, 'targetEntityId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();
      const sourceRef = sanitizeSourceProvenance(input.sourceProvenance, principal, nowIso);

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.addEntityRelationship',
        actorUid: principal.uid,
        requestPayload: {
          sourceEntityId,
          targetEntityId,
          relationshipType: input.relationshipType,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.addEntityRelationship',
            async (tx) => {
              const sourceEntity = await tx.get<CanonicalPropertyEntity>(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                sourceEntityId,
              );
              const targetEntity = await tx.get<CanonicalPropertyEntity>(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                targetEntityId,
              );
              if (!sourceEntity) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `SOURCE_ENTITY_NOT_FOUND: Source entity '${sourceEntityId}' does not exist.`,
                );
              }
              if (!targetEntity) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `TARGET_ENTITY_NOT_FOUND: Target entity '${targetEntityId}' does not exist.`,
                );
              }

              const allRels = await tx.query<EntityRelationshipRecord>(
                PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS,
              );
              const activeRels = allRels.filter((r) => r.status === 'ACTIVE');

              const existingDuplicate = activeRels.find(
                (r) =>
                  r.sourceEntityId === sourceEntityId &&
                  r.targetEntityId === targetEntityId &&
                  r.relationshipType === input.relationshipType,
              );
              if (existingDuplicate) {
                return { statusCode: 200, body: existingDuplicate };
              }

              validateRelationshipConsistencyAndPreventCycles({
                sourceEntity,
                targetEntity,
                relationshipType: input.relationshipType,
                existingActiveRelationships: activeRels,
              });

              const relationshipId = `rel_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const record: EntityRelationshipRecord = {
                relationshipId,
                sourceEntityId,
                sourceEntityKind: sourceEntity.entityKind,
                targetEntityId,
                targetEntityKind: targetEntity.entityKind,
                relationshipType: input.relationshipType,
                status: 'ACTIVE',
                validFromIso: input.validFromIso ?? nowIso,
                validToIso: null,
                provenanceReferences: [sourceRef],
                verificationStatus:
                  sourceRef.reliabilityTier === 'AUTHORITATIVE_OFFICIAL'
                    ? 'OFFICIAL_VERIFIED'
                    : 'SINGLE_SOURCE_REPORTED',
                createdByUid: principal.uid,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };

              tx.set(PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS, relationshipId, record);

              if (
                input.relationshipType === 'PARCEL_CONTAINS_BUILDING' &&
                targetEntity.entityKind === 'BUILDING'
              ) {
                const nextParcels = Array.from(
                  new Set([...targetEntity.associatedParcelIds, sourceEntityId]),
                );
                await refreshEntityQualityDimensionsInTx(
                  tx,
                  {
                    ...targetEntity,
                    associatedParcelIds: nextParcels,
                    updatedAtIso: nowIso,
                  },
                  nowIso,
                );
              } else if (
                input.relationshipType === 'BUILDING_CONTAINS_UNIT' &&
                targetEntity.entityKind === 'UNIT'
              ) {
                await refreshEntityQualityDimensionsInTx(
                  tx,
                  {
                    ...targetEntity,
                    parentBuildingId: sourceEntityId,
                    updatedAtIso: nowIso,
                  },
                  nowIso,
                );
              }

              await refreshEntityQualityDimensionsInTx(tx, sourceEntity, nowIso);
              return { statusCode: 201, body: record };
            },
          ),
      });

      return res.body;
    },

    async removeEntityRelationship(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      relationshipId: string;
      validToIso?: string;
    }): Promise<EntityRelationshipRecord> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'CREATE_OR_UPDATE_ENTITY');
      const relationshipId = requireValidId(input.relationshipId, 'relationshipId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.removeEntityRelationship',
        actorUid: principal.uid,
        requestPayload: { relationshipId, validToIso: input.validToIso ?? null },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.removeEntityRelationship',
            async (tx) => {
              const rel = await tx.get<EntityRelationshipRecord>(
                PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS,
                relationshipId,
              );
              if (!rel) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `RELATIONSHIP_NOT_FOUND: Relationship '${relationshipId}' not found.`,
                );
              }
              const updated: EntityRelationshipRecord = {
                ...rel,
                status: 'REMOVED_HISTORICAL',
                validToIso: input.validToIso ?? nowIso,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS, relationshipId, updated);
              return { statusCode: 200, body: updated };
            },
          ),
      });

      return res.body;
    },

    /**
     * 9. Retrieve entity relationship graph
     */
    async getEntityRelationshipGraph(input: {
      principal?: AuthenticatedPrincipal | null;
      canonicalEntityId: string;
      includeHistoricalRelationships?: boolean;
    }): Promise<{
      rootEntity: CanonicalPropertyEntity;
      outgoingRelationships: EntityRelationshipRecord[];
      incomingRelationships: EntityRelationshipRecord[];
      relatedEntities: CanonicalPropertyEntity[];
    }> {
      const canonicalEntityId = requireValidId(input.canonicalEntityId, 'canonicalEntityId');
      return runRegistryDurableTx(
        deps.txRunner,
        'property_registry.getEntityRelationshipGraph',
        async (tx) => {
          const root = await tx.get<CanonicalPropertyEntity>(
            PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
            canonicalEntityId,
          );
          if (!root) {
            throw new CoreApiError(
              'NOT_FOUND',
              404,
              `CANONICAL_ENTITY_NOT_FOUND: Entity '${canonicalEntityId}' not found.`,
            );
          }

          const allRels = await tx.query<EntityRelationshipRecord>(
            PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS,
          );
          const filteredRels = allRels.filter((r) =>
            input.includeHistoricalRelationships ? true : r.status === 'ACTIVE',
          );

          const outgoing = filteredRels.filter((r) => r.sourceEntityId === canonicalEntityId);
          const incoming = filteredRels.filter((r) => r.targetEntityId === canonicalEntityId);

          const relatedIds = new Set<string>();
          for (const r of outgoing) relatedIds.add(r.targetEntityId);
          for (const r of incoming) relatedIds.add(r.sourceEntityId);

          const relatedEntities: CanonicalPropertyEntity[] = [];
          for (const relEntityId of relatedIds) {
            const ent = await tx.get<CanonicalPropertyEntity>(
              PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
              relEntityId,
            );
            if (ent) {
              const allowFull = canAccessUnredactedPropertyDetails(input.principal, ent);
              relatedEntities.push(allowFull ? ent : redactEntityForPublicAccess(ent));
            }
          }

          const allowRootFull = canAccessUnredactedPropertyDetails(input.principal, root);
          return {
            rootEntity: allowRootFull ? root : redactEntityForPublicAccess(root),
            outgoingRelationships: outgoing,
            incomingRelationships: incoming,
            relatedEntities,
          };
        },
      );
    },

    /**
     * 10. Search canonical entities with bounded cursor pagination
     */
    async searchCanonicalEntities(input: {
      principal?: AuthenticatedPrincipal | null;
      cityId?: string;
      neighborhoodCompositeId?: string;
      entityKind?: PropertyEntityKind;
      parentBuildingId?: string;
      associatedParcelId?: string;
      limit?: number;
      cursor?: string;
    }): Promise<{
      items: CanonicalPropertyEntity[];
      nextCursor: string | null;
    }> {
      const pagination = normalizePaginationParams(
        {
          limit: input.limit,
          cursor: input.cursor,
        },
        {
          defaultLimit: 20,
          maxLimit: 50,
        },
      );

      const decodedCursor = pagination.cursor
        ? decodePaginationCursor(pagination.cursor)
        : null;

      return runRegistryDurableTx(
        deps.txRunner,
        'property_registry.searchCanonicalEntities',
        async (tx) => {
          const allEntities = await tx.query<CanonicalPropertyEntity>(
            PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
          );

          const matching = allEntities
            .filter((ent) => {
              if (input.cityId && ent.geographicRef.cityId !== input.cityId) return false;
              if (
                input.neighborhoodCompositeId &&
                ent.geographicRef.neighborhoodCompositeId !== input.neighborhoodCompositeId
              ) {
                return false;
              }
              if (input.entityKind && ent.entityKind !== input.entityKind) return false;
              if (input.parentBuildingId) {
                if (ent.entityKind !== 'UNIT' || ent.parentBuildingId !== input.parentBuildingId) {
                  return false;
                }
              }
              if (input.associatedParcelId) {
                const hasParcel =
                  (ent.entityKind === 'BUILDING' &&
                    ent.associatedParcelIds.includes(input.associatedParcelId)) ||
                  (ent.entityKind === 'UNIT' &&
                    ent.associatedParcelId === input.associatedParcelId) ||
                  (ent.entityKind === 'OTHER_ASSET' &&
                    ent.associatedParcelIds.includes(input.associatedParcelId));
                if (!hasParcel) return false;
              }
              return true;
            })
            .sort((a, b) => {
              if (b.createdAtIso !== a.createdAtIso) {
                return b.createdAtIso.localeCompare(a.createdAtIso);
              }
              return b.canonicalId.localeCompare(a.canonicalId);
            });

          const afterCursor = decodedCursor
            ? matching.filter(
                (item) =>
                  item.createdAtIso < String(decodedCursor.sortValue) ||
                  (item.createdAtIso === String(decodedCursor.sortValue) &&
                    item.canonicalId < decodedCursor.docId),
              )
            : matching;

          const slice = afterCursor.slice(0, pagination.limit);
          const hasMore = afterCursor.length > pagination.limit;
          const lastItem = slice[slice.length - 1];

          const redactedOrFull = slice.map((ent) =>
            canAccessUnredactedPropertyDetails(input.principal, ent)
              ? ent
              : redactEntityForPublicAccess(ent),
          );

          return {
            items: redactedOrFull,
            nextCursor:
              hasMore && lastItem
                ? encodePaginationCursor({
                    sortValue: lastItem.createdAtIso,
                    docId: lastItem.canonicalId,
                    direction: pagination.direction,
                  })
                : null,
          };
        },
      );
    },

    /**
     * 19. Record data quality finding
     */
    async recordDataQualityFinding(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      canonicalEntityId: string;
      findingType: DataQualityFindingType;
      severity: DataQualityFindingRecord['severity'];
      evidenceDescription: string;
      conflictingValues?: { sourceA: unknown; sourceB: unknown };
    }): Promise<DataQualityFindingRecord> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'CREATE_OR_UPDATE_ENTITY');
      const canonicalEntityId = requireValidId(input.canonicalEntityId, 'canonicalEntityId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.recordDataQualityFinding',
        actorUid: principal.uid,
        requestPayload: {
          canonicalEntityId,
          findingType: input.findingType,
          severity: input.severity,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.recordDataQualityFinding',
            async (tx) => {
              const entity = await tx.get<CanonicalPropertyEntity>(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                canonicalEntityId,
              );
              if (!entity) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `CANONICAL_ENTITY_NOT_FOUND: Entity '${canonicalEntityId}' not found.`,
                );
              }

              const findingId = `dq_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const finding: DataQualityFindingRecord = {
                findingId,
                canonicalEntityId,
                findingType: input.findingType,
                severity: input.severity,
                evidenceDescription: sanitizeTextInput(input.evidenceDescription).slice(0, 400),
                conflictingValues: input.conflictingValues,
                status: 'OPEN',
                detectedAtIso: nowIso,
                resolvedByUid: null,
                resolvedAtIso: null,
                resolutionNotes: null,
              };

              tx.set(PROPERTY_REGISTRY_COLLECTIONS.QUALITY_FINDINGS, findingId, finding);
              await refreshEntityQualityDimensionsInTx(tx, entity, nowIso);
              return { statusCode: 201, body: finding };
            },
          ),
      });

      return res.body;
    },

    /**
     * 20. Resolve data quality finding
     */
    async resolveDataQualityFinding(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      findingId: string;
      resolutionStatus: 'RESOLVED' | 'ACCEPTED_UNCERTAINTY';
      resolutionNotes: string;
    }): Promise<DataQualityFindingRecord> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'REVIEW_MATCH');
      const findingId = requireValidId(input.findingId, 'findingId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.resolveDataQualityFinding',
        actorUid: principal.uid,
        requestPayload: {
          findingId,
          resolutionStatus: input.resolutionStatus,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.resolveDataQualityFinding',
            async (tx) => {
              const finding = await tx.get<DataQualityFindingRecord>(
                PROPERTY_REGISTRY_COLLECTIONS.QUALITY_FINDINGS,
                findingId,
              );
              if (!finding) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `FINDING_NOT_FOUND: Finding '${findingId}' not found.`,
                );
              }

              const updatedFinding: DataQualityFindingRecord = {
                ...finding,
                status: input.resolutionStatus,
                resolvedByUid: principal.uid,
                resolvedAtIso: nowIso,
                resolutionNotes: sanitizeTextInput(input.resolutionNotes).slice(0, 400),
              };
              tx.set(PROPERTY_REGISTRY_COLLECTIONS.QUALITY_FINDINGS, findingId, updatedFinding);

              const entity = await tx.get<CanonicalPropertyEntity>(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                finding.canonicalEntityId,
              );
              if (entity) {
                await refreshEntityQualityDimensionsInTx(tx, entity, nowIso);
              }

              return { statusCode: 200, body: updatedFinding };
            },
          ),
      });

      return res.body;
    },
  };
}
