/**
 * @file server/modules/property-registry/services/propertyRegistryLineageAndMergeService.ts
 * @description Duplicate candidate detection, human identity review workflow, reversible merges,
 * entity splits, demolition/replacement lineage, and historical point-in-time reconstruction
 * for the Canonical Property Registry.
 */

import { randomUUID } from 'node:crypto';
import {
  CoreApiError,
  executeIdempotentMutation,
  sanitizeTextInput,
  type AuthenticatedPrincipal,
} from '../../core';
import type {
  AttributeChangeHistoryRecord,
  CanonicalPropertyEntity,
  DataQualityFindingRecord,
  DuplicateCandidateMatchRecord,
  EntityRelationshipRecord,
  ExternalIdentifierMappingRecord,
  IdentityLineageRecord,
} from '../domain/types';
import {
  evaluateEntitySimilaritySignals,
  reconstructEntityAttributesAtDate,
} from '../resolution/relationshipsAndResolutionEngine';
import {
  assertRegistryWriteAuthorized,
  PROPERTY_REGISTRY_COLLECTIONS,
  recordRegistryAuditEvent,
  refreshEntityQualityDimensionsInTx,
  requireValidId,
  runRegistryDurableTx,
  type PropertyRegistryServiceDependencies,
} from './propertyRegistryContext';
import { createPropertyRegistryCoreOperations } from './propertyRegistryCoreService';
import { createPropertyRegistryGraphAndIdentifiersOperations } from './propertyRegistryGraphAndIdentifiersService';

export function createPropertyRegistryLineageAndMergeOperations(
  deps: PropertyRegistryServiceDependencies,
) {
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * 11. Generate duplicate candidates for a canonical entity (never auto-merges)
     */
    async generateDuplicateCandidates(input: {
      principal: AuthenticatedPrincipal;
      canonicalEntityId: string;
    }): Promise<DuplicateCandidateMatchRecord[]> {
      assertRegistryWriteAuthorized(input.principal, 'CREATE_OR_UPDATE_ENTITY');
      const canonicalEntityId = requireValidId(input.canonicalEntityId, 'canonicalEntityId');
      const nowIso = now().toISOString();

      return runRegistryDurableTx(
        deps.txRunner,
        'property_registry.generateDuplicateCandidates',
        async (tx) => {
          const primary = await tx.get<CanonicalPropertyEntity>(
            PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
            canonicalEntityId,
          );
          if (!primary) {
            throw new CoreApiError(
              'NOT_FOUND',
              404,
              `CANONICAL_ENTITY_NOT_FOUND: Entity '${canonicalEntityId}' not found.`,
            );
          }

          const allEntities = await tx.query<CanonicalPropertyEntity>(
            PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
          );
          const allExtIds = await tx.query<ExternalIdentifierMappingRecord>(
            PROPERTY_REGISTRY_COLLECTIONS.EXTERNAL_IDENTIFIERS,
          );

          const primaryOfficialIds = allExtIds.filter(
            (id) =>
              id.canonicalEntityId === primary.canonicalId &&
              id.status === 'ACTIVE' &&
              id.verificationStatus === 'OFFICIAL_VERIFIED',
          );

          const results: DuplicateCandidateMatchRecord[] = [];
          const peers = allEntities.filter(
            (e) =>
              e.canonicalId !== primary.canonicalId &&
              e.entityKind === primary.entityKind &&
              e.geographicRef.cityId === primary.geographicRef.cityId &&
              e.registrationStatus !== 'MERGED_REDIRECT' &&
              e.registrationStatus !== 'SPLIT_RETIRED',
          );

          for (const peer of peers) {
            const peerOfficialIds = allExtIds.filter(
              (id) =>
                id.canonicalEntityId === peer.canonicalId &&
                id.status === 'ACTIVE' &&
                id.verificationStatus === 'OFFICIAL_VERIFIED',
            );

            const sharedVerified: string[] = [];
            let conflictingOfficial = false;

            if (
              primary.entityKind === 'PARCEL' &&
              peer.entityKind === 'PARCEL' &&
              primary.officialParcelIdentifier &&
              peer.officialParcelIdentifier
            ) {
              if (primary.officialParcelIdentifier === peer.officialParcelIdentifier) {
                if (
                  primary.officialParcelIdentifierVerified &&
                  peer.officialParcelIdentifierVerified
                ) {
                  sharedVerified.push(`CADASTRAL:${primary.officialParcelIdentifier}`);
                }
              } else if (
                primary.officialParcelIdentifierVerified &&
                peer.officialParcelIdentifierVerified &&
                primary.addressRef.normalizedAddressText === peer.addressRef.normalizedAddressText
              ) {
                conflictingOfficial = true;
              }
            }

            for (const pId of primaryOfficialIds) {
              for (const cId of peerOfficialIds) {
                if (
                  pId.issuingSourceNamespace === cId.issuingSourceNamespace &&
                  pId.jurisdictionScope === cId.jurisdictionScope &&
                  pId.identifierType === cId.identifierType
                ) {
                  if (pId.identifierValue === cId.identifierValue) {
                    sharedVerified.push(`${pId.identifierType}:${pId.identifierValue}`);
                  } else if (
                    primary.addressRef.normalizedAddressText ===
                    peer.addressRef.normalizedAddressText
                  ) {
                    conflictingOfficial = true;
                  }
                }
              }
            }

            const evaluation = evaluateEntitySimilaritySignals({
              primary,
              candidate: peer,
              sharedVerifiedOfficialIdentifiers: sharedVerified,
              conflictingOfficialIdentifiers: conflictingOfficial,
            });

            if (evaluation.matchClassification !== 'CONFIRMED_DISTINCT_ENTITIES') {
              const sortedPair = [primary.canonicalId, peer.canonicalId].sort();
              const candidateId = `dupcand_${sortedPair[0]}_${sortedPair[1]}`;
              const record: DuplicateCandidateMatchRecord = {
                candidateId,
                entityKind: primary.entityKind,
                primaryEntityId: primary.canonicalId,
                candidateEntityId: peer.canonicalId,
                matchClassification: evaluation.matchClassification,
                evidenceScore: evaluation.evidenceScore,
                comparisonSignals: evaluation.signals,
                autoMergePermitted: false,
                reviewStatus:
                  evaluation.matchClassification === 'UNRESOLVED_IDENTITY_CONFLICT'
                    ? 'CONFLICT_ESCALATED'
                    : 'PENDING_HUMAN_REVIEW',
                reviewedByUid: null,
                reviewedAtIso: null,
                reviewNotes: null,
                createdAtIso: nowIso,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_REGISTRY_COLLECTIONS.DUPLICATE_CANDIDATES, candidateId, record);
              results.push(record);
            }
          }

          if (results.length > 0) {
            const findingId = `dq_dup_${primary.canonicalId}`;
            const finding: DataQualityFindingRecord = {
              findingId,
              canonicalEntityId: primary.canonicalId,
              findingType: 'DUPLICATE_CANDIDATE_RECORDS',
              severity: 'MEDIUM',
              evidenceDescription: `${results.length} potential duplicate candidate(s) require human identity review.`,
              status: 'OPEN',
              detectedAtIso: nowIso,
              resolvedByUid: null,
              resolvedAtIso: null,
              resolutionNotes: null,
            };
            tx.set(PROPERTY_REGISTRY_COLLECTIONS.QUALITY_FINDINGS, findingId, finding);
            await refreshEntityQualityDimensionsInTx(tx, primary, nowIso);
          }

          return results;
        },
      );
    },

    /**
     * 12 & 13. Submit / Approve or Reject identity match (requires reviewer/admin authorization)
     */
    async decideIdentityMatch(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      candidateId: string;
      decision: 'APPROVED_FOR_MERGE' | 'REJECTED_CONFIRMED_DISTINCT' | 'CONFLICT_ESCALATED';
      reviewNotes: string;
    }): Promise<DuplicateCandidateMatchRecord> {
      const principal = assertRegistryWriteAuthorized(input.principal, 'REVIEW_MATCH');
      const candidateId = requireValidId(input.candidateId, 'candidateId');
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.decideIdentityMatch',
        actorUid: principal.uid,
        requestPayload: {
          candidateId,
          decision: input.decision,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.decideIdentityMatch',
            async (tx) => {
              const cand = await tx.get<DuplicateCandidateMatchRecord>(
                PROPERTY_REGISTRY_COLLECTIONS.DUPLICATE_CANDIDATES,
                candidateId,
              );
              if (!cand) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `DUPLICATE_CANDIDATE_NOT_FOUND: Duplicate candidate '${candidateId}' not found.`,
                );
              }

              const updated: DuplicateCandidateMatchRecord = {
                ...cand,
                matchClassification:
                  input.decision === 'APPROVED_FOR_MERGE'
                    ? 'CONFIRMED_SAME_ENTITY'
                    : input.decision === 'REJECTED_CONFIRMED_DISTINCT'
                      ? 'CONFIRMED_DISTINCT_ENTITIES'
                      : 'UNRESOLVED_IDENTITY_CONFLICT',
                reviewStatus: input.decision,
                reviewedByUid: principal.uid,
                reviewedAtIso: nowIso,
                reviewNotes: sanitizeTextInput(input.reviewNotes).slice(0, 400),
                updatedAtIso: nowIso,
              };

              tx.set(PROPERTY_REGISTRY_COLLECTIONS.DUPLICATE_CANDIDATES, candidateId, updated);
              return { statusCode: 200, body: updated };
            },
          ),
      });

      return res.body;
    },

    /**
     * 14. Merge canonical entities (requires APPROVED_FOR_MERGE review, preserves retired ID & reversible lineage)
     */
    async mergeCanonicalEntities(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      approvedCandidateId: string;
      survivingEntityId: string;
      retiringEntityId: string;
      reason: string;
      supportingEvidenceRefs: string[];
      effectiveDateIso?: string;
    }): Promise<{
      survivingEntity: CanonicalPropertyEntity;
      retiredEntity: CanonicalPropertyEntity;
      lineageRecord: IdentityLineageRecord;
    }> {
      const principal = assertRegistryWriteAuthorized(
        input.principal,
        'CONSEQUENTIAL_MERGE_OR_SPLIT',
      );
      const approvedCandidateId = requireValidId(
        input.approvedCandidateId,
        'approvedCandidateId',
      );
      const survivingEntityId = requireValidId(input.survivingEntityId, 'survivingEntityId');
      const retiringEntityId = requireValidId(input.retiringEntityId, 'retiringEntityId');

      if (survivingEntityId === retiringEntityId) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'INVALID_MERGE_TARGETS: survivingEntityId and retiringEntityId must be distinct.',
        );
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.mergeCanonicalEntities',
        actorUid: principal.uid,
        requestPayload: {
          approvedCandidateId,
          survivingEntityId,
          retiringEntityId,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.mergeCanonicalEntities',
            async (tx) => {
              const candidate = await tx.get<DuplicateCandidateMatchRecord>(
                PROPERTY_REGISTRY_COLLECTIONS.DUPLICATE_CANDIDATES,
                approvedCandidateId,
              );
              if (!candidate || candidate.reviewStatus !== 'APPROVED_FOR_MERGE') {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  'MERGE_REQUIRES_APPROVED_HUMAN_REVIEW: Consequential entity merges require a DuplicateCandidateMatchRecord in APPROVED_FOR_MERGE status.',
                );
              }

              const pairMatches =
                (candidate.primaryEntityId === survivingEntityId &&
                  candidate.candidateEntityId === retiringEntityId) ||
                (candidate.primaryEntityId === retiringEntityId &&
                  candidate.candidateEntityId === survivingEntityId);
              if (!pairMatches) {
                throw new CoreApiError(
                  'VALIDATION_FAILED',
                  400,
                  'CANDIDATE_ENTITY_MISMATCH: Approved candidate record does not match the specified surviving and retiring entities.',
                );
              }

              const surviving = await tx.get<CanonicalPropertyEntity>(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                survivingEntityId,
              );
              const retiring = await tx.get<CanonicalPropertyEntity>(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                retiringEntityId,
              );
              if (!surviving || !retiring) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  'MERGE_ENTITY_NOT_FOUND: Both surviving and retiring entities must exist.',
                );
              }
              if (surviving.entityKind !== retiring.entityKind) {
                throw new CoreApiError(
                  'VALIDATION_FAILED',
                  400,
                  'MERGE_KIND_MISMATCH: Cannot merge entities of different kinds.',
                );
              }

              const allRels = await tx.query<EntityRelationshipRecord>(
                PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS,
              );
              const reassignedRelationshipIds: string[] = [];
              for (const rel of allRels) {
                if (rel.status !== 'ACTIVE') continue;
                if (rel.sourceEntityId === retiringEntityId) {
                  const updatedRel: EntityRelationshipRecord = {
                    ...rel,
                    sourceEntityId: survivingEntityId,
                    updatedAtIso: nowIso,
                  };
                  tx.set(
                    PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS,
                    rel.relationshipId,
                    updatedRel,
                  );
                  reassignedRelationshipIds.push(rel.relationshipId);
                } else if (rel.targetEntityId === retiringEntityId) {
                  const updatedRel: EntityRelationshipRecord = {
                    ...rel,
                    targetEntityId: survivingEntityId,
                    updatedAtIso: nowIso,
                  };
                  tx.set(
                    PROPERTY_REGISTRY_COLLECTIONS.RELATIONSHIPS,
                    rel.relationshipId,
                    updatedRel,
                  );
                  reassignedRelationshipIds.push(rel.relationshipId);
                }
              }

              const allExtIds = await tx.query<ExternalIdentifierMappingRecord>(
                PROPERTY_REGISTRY_COLLECTIONS.EXTERNAL_IDENTIFIERS,
              );
              const reassignedIdentifierMappingIds: string[] = [];
              for (const extId of allExtIds) {
                if (extId.status === 'ACTIVE' && extId.canonicalEntityId === retiringEntityId) {
                  const updatedExt: ExternalIdentifierMappingRecord = {
                    ...extId,
                    canonicalEntityId: survivingEntityId,
                    lastObservedAtIso: nowIso,
                  };
                  tx.set(
                    PROPERTY_REGISTRY_COLLECTIONS.EXTERNAL_IDENTIFIERS,
                    extId.mappingId,
                    updatedExt,
                  );
                  reassignedIdentifierMappingIds.push(extId.mappingId);
                }
              }

              const updatedRetired: CanonicalPropertyEntity = {
                ...retiring,
                registrationStatus: 'MERGED_REDIRECT',
                retiredOrRedirectedToIds: [survivingEntityId],
                recordVersion: retiring.recordVersion + 1,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_REGISTRY_COLLECTIONS.ENTITIES, retiringEntityId, updatedRetired);

              const combinedSources = [
                ...surviving.sourceReferences,
                ...retiring.sourceReferences,
              ];
              const combinedOriginalAddresses = [
                ...surviving.addressRef.sourceOriginalAddresses,
                ...retiring.addressRef.sourceOriginalAddresses,
              ];

              const updatedSurvivingRaw: CanonicalPropertyEntity = {
                ...surviving,
                sourceReferences: combinedSources,
                addressRef: {
                  ...surviving.addressRef,
                  sourceOriginalAddresses: combinedOriginalAddresses,
                },
                recordVersion: surviving.recordVersion + 1,
                updatedAtIso: nowIso,
              };

              const updatedSurviving = await refreshEntityQualityDimensionsInTx(
                tx,
                updatedSurvivingRaw,
                nowIso,
              );

              tx.set(
                PROPERTY_REGISTRY_COLLECTIONS.DUPLICATE_CANDIDATES,
                approvedCandidateId,
                {
                  ...candidate,
                  reviewStatus: 'MERGED_COMPLETED',
                  updatedAtIso: nowIso,
                },
              );

              const lineageId = `lin_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const lineageRecord: IdentityLineageRecord = {
                lineageId,
                lineageType: 'MERGED_INTO',
                previousEntityIds: [retiringEntityId],
                resultingEntityIds: [survivingEntityId],
                reason: sanitizeTextInput(input.reason).slice(0, 300),
                supportingEvidenceRefs: input.supportingEvidenceRefs.map((r) =>
                  requireValidId(r, 'supportingEvidenceRef'),
                ),
                authorizedActorUid: principal.uid,
                authorizedActorRole: principal.role,
                effectiveDateIso: input.effectiveDateIso ?? nowIso,
                recordedAtIso: nowIso,
                reviewStatus: 'APPROVED_EXECUTED',
                reversibleSnapshotRef: {
                  previousEntityVersions: {
                    [survivingEntityId]: surviving.recordVersion,
                    [retiringEntityId]: retiring.recordVersion,
                  },
                  reassignedRelationshipIds,
                  reassignedIdentifierMappingIds,
                },
              };
              tx.set(PROPERTY_REGISTRY_COLLECTIONS.IDENTITY_LINEAGE, lineageId, lineageRecord);

              return {
                statusCode: 200,
                body: {
                  survivingEntity: updatedSurviving,
                  retiredEntity: updatedRetired,
                  lineageRecord,
                },
              };
            },
          ),
      });

      await recordRegistryAuditEvent(deps, {
        principal,
        action: 'property_registry.mergeCanonicalEntities',
        targetCollection: PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
        targetResourceId: survivingEntityId,
        outcome: 'SUCCESS',
        metadata: { retiringEntityId, lineageId: res.body.lineageRecord.lineageId },
      });

      return res.body;
    },

    /**
     * 15. Split canonical entity (e.g. parcel subdivision or unit reconfiguration)
     */
    async splitCanonicalEntity(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      sourceEntityId: string;
      resultingChildIds: string[];
      reason: string;
      supportingEvidenceRefs: string[];
      effectiveDateIso?: string;
    }): Promise<{
      retiredSourceEntity: CanonicalPropertyEntity;
      resultingEntities: CanonicalPropertyEntity[];
      lineageRecord: IdentityLineageRecord;
    }> {
      const principal = assertRegistryWriteAuthorized(
        input.principal,
        'CONSEQUENTIAL_MERGE_OR_SPLIT',
      );
      const sourceEntityId = requireValidId(input.sourceEntityId, 'sourceEntityId');
      if (!Array.isArray(input.resultingChildIds) || input.resultingChildIds.length < 2) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'SPLIT_REQUIRES_MULTIPLE_RESULTING_ENTITIES: Splitting an entity requires at least 2 resulting canonical entity IDs.',
        );
      }
      const resultingChildIds = input.resultingChildIds.map((id) =>
        requireValidId(id, 'resultingChildId'),
      );
      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.splitCanonicalEntity',
        actorUid: principal.uid,
        requestPayload: {
          sourceEntityId,
          resultingChildIds,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.splitCanonicalEntity',
            async (tx) => {
              const sourceEntity = await tx.get<CanonicalPropertyEntity>(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                sourceEntityId,
              );
              if (!sourceEntity) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `SOURCE_ENTITY_NOT_FOUND: Source entity '${sourceEntityId}' not found.`,
                );
              }

              const resultingEntities: CanonicalPropertyEntity[] = [];
              for (const childId of resultingChildIds) {
                const child = await tx.get<CanonicalPropertyEntity>(
                  PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                  childId,
                );
                if (!child || child.entityKind !== sourceEntity.entityKind) {
                  throw new CoreApiError(
                    'VALIDATION_FAILED',
                    400,
                    `INVALID_SPLIT_CHILD_ENTITY: Resulting entity '${childId}' must exist and match kind '${sourceEntity.entityKind}'.`,
                  );
                }
                resultingEntities.push(child);
              }

              const retiredSourceEntity: CanonicalPropertyEntity = {
                ...sourceEntity,
                registrationStatus: 'SPLIT_RETIRED',
                retiredOrRedirectedToIds: resultingChildIds,
                recordVersion: sourceEntity.recordVersion + 1,
                updatedAtIso: nowIso,
              };
              tx.set(PROPERTY_REGISTRY_COLLECTIONS.ENTITIES, sourceEntityId, retiredSourceEntity);

              const lineageId = `lin_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const lineageRecord: IdentityLineageRecord = {
                lineageId,
                lineageType: 'SPLIT_FROM',
                previousEntityIds: [sourceEntityId],
                resultingEntityIds: resultingChildIds,
                reason: sanitizeTextInput(input.reason).slice(0, 300),
                supportingEvidenceRefs: input.supportingEvidenceRefs.map((r) =>
                  requireValidId(r, 'supportingEvidenceRef'),
                ),
                authorizedActorUid: principal.uid,
                authorizedActorRole: principal.role,
                effectiveDateIso: input.effectiveDateIso ?? nowIso,
                recordedAtIso: nowIso,
                reviewStatus: 'APPROVED_EXECUTED',
                reversibleSnapshotRef: {
                  previousEntityVersions: { [sourceEntityId]: sourceEntity.recordVersion },
                  reassignedRelationshipIds: [],
                  reassignedIdentifierMappingIds: [],
                },
              };
              tx.set(PROPERTY_REGISTRY_COLLECTIONS.IDENTITY_LINEAGE, lineageId, lineageRecord);

              return {
                statusCode: 200,
                body: {
                  retiredSourceEntity,
                  resultingEntities,
                  lineageRecord,
                },
              };
            },
          ),
      });

      return res.body;
    },

    /**
     * 16. Record property demolition or replacement (never assumes replacement is the same physical asset)
     */
    async recordPropertyDemolitionOrReplacement(input: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      demolishedEntityId: string;
      replacementEntityId?: string | null;
      reason: string;
      supportingEvidenceRefs: string[];
      effectiveDateIso: string;
    }): Promise<{
      demolishedEntity: CanonicalPropertyEntity;
      replacementEntity: CanonicalPropertyEntity | null;
      lineageRecord: IdentityLineageRecord;
    }> {
      const principal = assertRegistryWriteAuthorized(
        input.principal,
        'CONSEQUENTIAL_MERGE_OR_SPLIT',
      );
      const demolishedEntityId = requireValidId(input.demolishedEntityId, 'demolishedEntityId');
      const replacementEntityId = input.replacementEntityId
        ? requireValidId(input.replacementEntityId, 'replacementEntityId')
        : null;

      if (replacementEntityId && replacementEntityId === demolishedEntityId) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'REPLACEMENT_MUST_BE_DISTINCT_CANONICAL_ENTITY: A replacement building is a distinct physical asset and must have its own canonical ID.',
        );
      }

      const nowDate = now();
      const nowIso = nowDate.toISOString();

      const res = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        idempotencyKey: input.idempotencyKey,
        operation: 'property_registry.recordPropertyDemolitionOrReplacement',
        actorUid: principal.uid,
        requestPayload: {
          demolishedEntityId,
          replacementEntityId,
          effectiveDateIso: input.effectiveDateIso,
        },
        nowEpochMs: nowDate.getTime(),
        mutationFn: async () =>
          runRegistryDurableTx(
            deps.txRunner,
            'property_registry.recordPropertyDemolitionOrReplacement',
            async (tx) => {
              const demolished = await tx.get<CanonicalPropertyEntity>(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                demolishedEntityId,
              );
              if (!demolished) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `DEMOLISHED_ENTITY_NOT_FOUND: Entity '${demolishedEntityId}' not found.`,
                );
              }

              let replacement: CanonicalPropertyEntity | null = null;
              if (replacementEntityId) {
                replacement = await tx.get<CanonicalPropertyEntity>(
                  PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                  replacementEntityId,
                );
                if (!replacement) {
                  throw new CoreApiError(
                    'NOT_FOUND',
                    404,
                    `REPLACEMENT_ENTITY_NOT_FOUND: Replacement entity '${replacementEntityId}' not found.`,
                  );
                }
              }

              const updatedDemolished: CanonicalPropertyEntity =
                demolished.entityKind === 'BUILDING'
                  ? {
                      ...demolished,
                      constructionStatus: 'DEMOLISHED',
                      registrationStatus: replacementEntityId
                        ? 'REPLACED_ARCHIVED'
                        : 'DEMOLISHED_ARCHIVED',
                      retiredOrRedirectedToIds: replacementEntityId ? [replacementEntityId] : [],
                      recordVersion: demolished.recordVersion + 1,
                      updatedAtIso: nowIso,
                    }
                  : {
                      ...demolished,
                      registrationStatus: replacementEntityId
                        ? 'REPLACED_ARCHIVED'
                        : 'DEMOLISHED_ARCHIVED',
                      retiredOrRedirectedToIds: replacementEntityId ? [replacementEntityId] : [],
                      recordVersion: demolished.recordVersion + 1,
                      updatedAtIso: nowIso,
                    };

              tx.set(
                PROPERTY_REGISTRY_COLLECTIONS.ENTITIES,
                demolishedEntityId,
                updatedDemolished,
              );

              const lineageId = `lin_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const lineageRecord: IdentityLineageRecord = {
                lineageId,
                lineageType: replacementEntityId ? 'REPLACED_BY' : 'DEMOLISHED',
                previousEntityIds: [demolishedEntityId],
                resultingEntityIds: replacementEntityId ? [replacementEntityId] : [],
                reason: sanitizeTextInput(input.reason).slice(0, 300),
                supportingEvidenceRefs: input.supportingEvidenceRefs.map((r) =>
                  requireValidId(r, 'supportingEvidenceRef'),
                ),
                authorizedActorUid: principal.uid,
                authorizedActorRole: principal.role,
                effectiveDateIso: input.effectiveDateIso,
                recordedAtIso: nowIso,
                reviewStatus: 'APPROVED_EXECUTED',
                reversibleSnapshotRef: {
                  previousEntityVersions: { [demolishedEntityId]: demolished.recordVersion },
                  reassignedRelationshipIds: [],
                  reassignedIdentifierMappingIds: [],
                },
              };
              tx.set(PROPERTY_REGISTRY_COLLECTIONS.IDENTITY_LINEAGE, lineageId, lineageRecord);

              return {
                statusCode: 200,
                body: {
                  demolishedEntity: updatedDemolished,
                  replacementEntity: replacement,
                  lineageRecord,
                },
              };
            },
          ),
      });

      return res.body;
    },

    /**
     * 17. Retrieve identity lineage
     */
    async getIdentityLineage(input: {
      canonicalEntityId: string;
    }): Promise<{
      canonicalEntityId: string;
      upstreamLineage: IdentityLineageRecord[];
      downstreamLineage: IdentityLineageRecord[];
    }> {
      const canonicalEntityId = requireValidId(input.canonicalEntityId, 'canonicalEntityId');
      return runRegistryDurableTx(
        deps.txRunner,
        'property_registry.getIdentityLineage',
        async (tx) => {
          const allLineage = await tx.query<IdentityLineageRecord>(
            PROPERTY_REGISTRY_COLLECTIONS.IDENTITY_LINEAGE,
          );
          const upstreamLineage = allLineage.filter((l) =>
            l.resultingEntityIds.includes(canonicalEntityId),
          );
          const downstreamLineage = allLineage.filter((l) =>
            l.previousEntityIds.includes(canonicalEntityId),
          );
          return {
            canonicalEntityId,
            upstreamLineage,
            downstreamLineage,
          };
        },
      );
    },

    /**
     * 18. Retrieve historical entity state as of a requested date (EFFECTIVE_DATE or RECORDED_DATE)
     */
    async getHistoricalEntityState(input: {
      canonicalEntityId: string;
      asOfDateIso: string;
      temporalDimension: 'EFFECTIVE_DATE' | 'RECORDED_DATE';
    }): Promise<{
      canonicalEntityId: string;
      asOfDateIso: string;
      temporalDimension: 'EFFECTIVE_DATE' | 'RECORDED_DATE';
      reconstructedAttributes: Record<string, unknown>;
      appliedChangesCount: number;
      fullAttributeHistory: AttributeChangeHistoryRecord[];
    }> {
      const canonicalEntityId = requireValidId(input.canonicalEntityId, 'canonicalEntityId');
      return runRegistryDurableTx(
        deps.txRunner,
        'property_registry.getHistoricalEntityState',
        async (tx) => {
          const initialDoc = await tx.get<{
            canonicalId: string;
            snapshot: Record<string, unknown>;
          }>(PROPERTY_REGISTRY_COLLECTIONS.INITIAL_SNAPSHOTS, canonicalEntityId);

          if (!initialDoc) {
            throw new CoreApiError(
              'NOT_FOUND',
              404,
              `CANONICAL_ENTITY_NOT_FOUND: Entity '${canonicalEntityId}' not found.`,
            );
          }

          const allHistory = await tx.query<AttributeChangeHistoryRecord>(
            PROPERTY_REGISTRY_COLLECTIONS.ATTRIBUTE_HISTORY,
          );
          const entityHistory = allHistory.filter(
            (h) => h.canonicalEntityId === canonicalEntityId,
          );

          const reconstructed = reconstructEntityAttributesAtDate({
            initialSnapshot: initialDoc.snapshot,
            changeHistory: entityHistory,
            asOfDateIso: input.asOfDateIso,
            temporalDimension: input.temporalDimension,
          });

          return {
            canonicalEntityId,
            asOfDateIso: input.asOfDateIso,
            temporalDimension: input.temporalDimension,
            reconstructedAttributes: reconstructed.reconstructedAttributes,
            appliedChangesCount: reconstructed.appliedChangesCount,
            fullAttributeHistory: entityHistory,
          };
        },
      );
    },
  };
}

/**
 * Unified factory combining all 20 Canonical Property Registry service operations.
 */
export function createPropertyRegistryService(deps: PropertyRegistryServiceDependencies) {
  return {
    ...createPropertyRegistryCoreOperations(deps),
    ...createPropertyRegistryGraphAndIdentifiersOperations(deps),
    ...createPropertyRegistryLineageAndMergeOperations(deps),
  };
}
