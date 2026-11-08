import crypto from 'crypto';
import { CoreApiError } from '../core';
import {
  buildEntityDataProfile,
  createDefaultDataContracts,
  createDefaultDataQualityRules,
  evaluateCrossModuleConsistency,
  evaluateMasterRecordQuality,
  resolveEntityAgainstCatalog,
} from './resolutionAndQualityEngine';
import type {
  CorrectionProposalRecord,
  CrossModuleConsistencyReport,
  DataContractSchemaSpec,
  DataGovernanceDashboardSummary,
  DataGovernanceDependencies,
  DataGovernanceObservabilityMetrics,
  DataProfileReport,
  DataQualityRule,
  DataQualityScoreReport,
  DuplicateCandidateGroup,
  DuplicateMergeRecord,
  EntityResolutionResult,
  MasterDataRecord,
  MasterEntityType,
  PropagationJobRecord,
  SourceProvenanceMetadata,
} from './types';

export function createDataGovernanceService(deps: DataGovernanceDependencies = {}) {
  const nowFn = deps.now ?? (() => new Date());

  const masterStore = new Map<string, MasterDataRecord>();
  const duplicateGroups = new Map<string, DuplicateCandidateGroup>();
  const mergeHistory = new Map<string, DuplicateMergeRecord>();
  const correctionProposals = new Map<string, CorrectionProposalRecord>();
  const propagationJobs = new Map<string, PropagationJobRecord>();
  const qualityRules = new Map<string, DataQualityRule>();
  const dataContracts = new Map<string, DataContractSchemaSpec>();
  const activeEntityLocks = new Set<string>();

  for (const r of createDefaultDataQualityRules(nowFn().toISOString())) {
    qualityRules.set(r.ruleId, r);
  }
  for (const c of createDefaultDataContracts(nowFn().toISOString())) {
    dataContracts.set(c.contractId, c);
  }

  const metrics: DataGovernanceObservabilityMetrics = {
    validationsExecutedCount: 0,
    duplicateDetectionsCount: 0,
    entityMergesCount: 0,
    correctionApprovalsCount: 0,
    propagationFailuresCount: 0,
    schemaCompatibilityFailuresCount: 0,
  };

  function resolveEntity(params: {
    entityType: MasterEntityType;
    candidateCanonicalId?: string;
    externalSourceKey?: { sourceKey: string; externalId: string };
    attributes: Record<string, unknown>;
  }): EntityResolutionResult {
    return resolveEntityAgainstCatalog({
      ...params,
      existingRecords: Array.from(masterStore.values()),
    });
  }

  function registerOrUpdateMasterRecord(params: {
    actorUid: string;
    isAdmin?: boolean;
    canonicalId?: string;
    entityType: MasterEntityType;
    alternateIds?: string[];
    sourceSpecificIds?: Record<string, string>;
    parentCanonicalId?: string;
    relatedCanonicalIds?: Record<string, string>;
    attributes: Record<string, unknown>;
    protectedFields?: string[];
    provenance: Omit<SourceProvenanceMetadata, 'transformationHistory'> & {
      transformationHistory?: SourceProvenanceMetadata['transformationHistory'];
    };
    reason?: string;
    bypassLockCheck?: boolean;
  }): { record: MasterDataRecord; created: boolean; duplicateCandidateGroupId?: string } {
    const nowIso = nowFn().toISOString();

    // Check if canonicalId or exact external source key already exists
    let existing: MasterDataRecord | undefined = params.canonicalId
      ? masterStore.get(params.canonicalId)
      : undefined;

    if (!existing && params.sourceSpecificIds) {
      for (const [sKey, extId] of Object.entries(params.sourceSpecificIds)) {
        const res = resolveEntity({
          entityType: params.entityType,
          externalSourceKey: { sourceKey: sKey, externalId: extId },
          attributes: params.attributes,
        });
        if (res.classification === 'EXACT_MATCH' && res.matchedCanonicalId) {
          existing = masterStore.get(res.matchedCanonicalId);
          break;
        }
      }
    }

    if (existing) {
      if (!params.bypassLockCheck && activeEntityLocks.has(existing.canonicalId)) {
        throw new CoreApiError('CONFLICT', 409, `Concurrent modification in progress for '${existing.canonicalId}'.`);
      }
      // Protected field enforcement: non-admin cannot directly mutate protected fields
      for (const pf of existing.protectedFields) {
        if (
          params.attributes[pf] !== undefined &&
          JSON.stringify(params.attributes[pf]) !== JSON.stringify(existing.attributes[pf]) &&
          !params.isAdmin
        ) {
          throw new CoreApiError(
            'FORBIDDEN',
            403,
            `Field '${pf}' is a protected master-data attribute and requires an approved correction workflow or admin privilege.`,
          );
        }
      }

      const nextVersion = existing.version + 1;
      const updatedAttributes = {
        ...structuredClone(existing.attributes),
        ...structuredClone(params.attributes),
      };

      const updated: MasterDataRecord = {
        ...structuredClone(existing),
        alternateIds: Array.from(new Set([...existing.alternateIds, ...(params.alternateIds ?? [])])),
        sourceSpecificIds: {
          ...existing.sourceSpecificIds,
          ...(params.sourceSpecificIds ?? {}),
        },
        parentCanonicalId: params.parentCanonicalId ?? existing.parentCanonicalId,
        relatedCanonicalIds: {
          ...existing.relatedCanonicalIds,
          ...(params.relatedCanonicalIds ?? {}),
        },
        attributes: updatedAttributes,
        protectedFields: Array.from(new Set([...existing.protectedFields, ...(params.protectedFields ?? [])])),
        provenance: {
          ...existing.provenance, // Preserve original sourceId and sourceRecordRef immutably
          transformationHistory: [
            ...existing.provenance.transformationHistory,
            {
              step: 'MASTER_RECORD_UPDATE',
              appliedAtIso: nowIso,
              details: params.reason ?? `Updated to v${nextVersion} by ${params.actorUid}`,
            },
          ],
        },
        version: nextVersion,
        updatedAtIso: nowIso,
        versionHistory: [
          ...existing.versionHistory,
          {
            version: nextVersion,
            updatedByUid: params.actorUid,
            updatedAtIso: nowIso,
            reason: params.reason ?? 'Authorized record update',
            attributesSnapshot: structuredClone(updatedAttributes),
          },
        ],
      };

      masterStore.set(updated.canonicalId, updated);
      return { record: structuredClone(updated), created: false };
    }

    // Check similarity before creating a new canonical record so potential duplicates are grouped for review
    const resolution = resolveEntity({
      entityType: params.entityType,
      attributes: params.attributes,
    });

    const canonicalId = params.canonicalId ?? `mdm_${params.entityType}_${crypto.randomBytes(5).toString('hex')}`;
    const defaultProtected =
      params.protectedFields ??
      (params.entityType === 'property' ? ['deedType', 'propertyCategory', 'sqm'] : ['cityId']);

    const createdRecord: MasterDataRecord = {
      canonicalId,
      entityType: params.entityType,
      alternateIds: params.alternateIds ?? [],
      sourceSpecificIds: params.sourceSpecificIds ?? {},
      parentCanonicalId: params.parentCanonicalId,
      relatedCanonicalIds: params.relatedCanonicalIds ?? {},
      status: 'ACTIVE',
      verificationStatus: params.provenance.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING_REVIEW',
      attributes: structuredClone(params.attributes),
      protectedFields: defaultProtected,
      provenance: {
        ...params.provenance,
        transformationHistory: params.provenance.transformationHistory ?? [
          {
            step: 'INITIAL_REGISTRATION',
            appliedAtIso: nowIso,
            details: `Registered canonical ${params.entityType} record`,
          },
        ],
      },
      version: 1,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      versionHistory: [
        {
          version: 1,
          updatedByUid: params.actorUid,
          updatedAtIso: nowIso,
          reason: params.reason ?? 'Initial canonical creation',
          attributesSnapshot: structuredClone(params.attributes),
        },
      ],
    };

    masterStore.set(canonicalId, createdRecord);

    let duplicateCandidateGroupId: string | undefined;
    if (
      (resolution.classification === 'HIGH_CONFIDENCE_CANDIDATE' ||
        resolution.classification === 'POSSIBLE_MATCH') &&
      resolution.matchedCanonicalId
    ) {
      metrics.duplicateDetectionsCount += 1;
      const groupId = `dup_grp_${crypto.randomBytes(5).toString('hex')}`;
      duplicateGroups.set(groupId, {
        groupId,
        entityType: params.entityType,
        candidateCanonicalIds: [resolution.matchedCanonicalId, canonicalId],
        recommendedPrimaryId: resolution.matchedCanonicalId,
        similarityScore: resolution.similarityScore,
        status: 'PENDING_REVIEW',
        detectedAtIso: nowIso,
      });
      duplicateCandidateGroupId = groupId;
    }

    return {
      record: structuredClone(createdRecord),
      created: true,
      duplicateCandidateGroupId,
    };
  }

  function mergeDuplicateEntities(params: {
    actorUid: string;
    isAdmin: boolean;
    groupId?: string;
    survivingCanonicalId: string;
    retiredCanonicalIds: string[];
    reason: string;
  }): DuplicateMergeRecord {
    if (!params.isAdmin) {
      throw new CoreApiError('FORBIDDEN', 403, 'Authorized administrative privilege is required to merge master entities.');
    }
    const survivor = masterStore.get(params.survivingCanonicalId);
    if (!survivor || survivor.status !== 'ACTIVE') {
      throw new CoreApiError('NOT_FOUND', 404, `Surviving canonical record '${params.survivingCanonicalId}' not found or inactive.`);
    }

    const preMergeSnapshots: Record<string, MasterDataRecord> = {
      [survivor.canonicalId]: structuredClone(survivor),
    };

    const retiredSet = new Set(params.retiredCanonicalIds);
    for (const retId of retiredSet) {
      if (retId === survivor.canonicalId) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'survivingCanonicalId cannot be in retiredCanonicalIds.');
      }
      const retRec = masterStore.get(retId);
      if (!retRec) {
        throw new CoreApiError('NOT_FOUND', 404, `Retired canonical record '${retId}' not found.`);
      }
      preMergeSnapshots[retId] = structuredClone(retRec);
    }

    const nowIso = nowFn().toISOString();
    const updatedSurvivor = structuredClone(survivor);

    for (const retId of retiredSet) {
      const retRec = structuredClone(masterStore.get(retId)!);
      updatedSurvivor.alternateIds = Array.from(
        new Set([...updatedSurvivor.alternateIds, retRec.canonicalId, ...retRec.alternateIds]),
      );
      updatedSurvivor.sourceSpecificIds = {
        ...retRec.sourceSpecificIds,
        ...updatedSurvivor.sourceSpecificIds,
      };
      // Mark retired record as MERGED_ALIAS without deleting historical data
      retRec.status = 'MERGED_ALIAS';
      retRec.mergedIntoCanonicalId = updatedSurvivor.canonicalId;
      retRec.updatedAtIso = nowIso;
      masterStore.set(retId, retRec);
    }

    updatedSurvivor.version += 1;
    updatedSurvivor.updatedAtIso = nowIso;
    updatedSurvivor.provenance.transformationHistory.push({
      step: 'DUPLICATE_MERGE_SURVIVOR',
      appliedAtIso: nowIso,
      details: `Merged ${params.retiredCanonicalIds.join(', ')} into ${updatedSurvivor.canonicalId}`,
    });
    masterStore.set(updatedSurvivor.canonicalId, updatedSurvivor);

    // Migrate dependent references across all master records
    let migratedDependentRefsCount = 0;
    for (const rec of masterStore.values()) {
      let modified = false;
      if (rec.parentCanonicalId && retiredSet.has(rec.parentCanonicalId)) {
        rec.parentCanonicalId = updatedSurvivor.canonicalId;
        modified = true;
      }
      for (const [relKey, relVal] of Object.entries(rec.relatedCanonicalIds)) {
        if (retiredSet.has(relVal)) {
          rec.relatedCanonicalIds[relKey] = updatedSurvivor.canonicalId;
          modified = true;
        }
      }
      if (modified) {
        migratedDependentRefsCount += 1;
        masterStore.set(rec.canonicalId, rec);
      }
    }

    if (params.groupId && duplicateGroups.has(params.groupId)) {
      const grp = duplicateGroups.get(params.groupId)!;
      grp.status = 'MERGED';
      duplicateGroups.set(params.groupId, grp);
    }

    const mergeRecord: DuplicateMergeRecord = {
      mergeId: `mrg_${crypto.randomBytes(6).toString('hex')}`,
      groupId: params.groupId,
      entityType: updatedSurvivor.entityType,
      survivingCanonicalId: updatedSurvivor.canonicalId,
      retiredCanonicalIds: [...params.retiredCanonicalIds],
      migratedDependentRefsCount,
      preMergeSnapshots,
      approvedByUid: params.actorUid,
      mergedAtIso: nowIso,
      reason: params.reason,
      reversed: false,
    };

    mergeHistory.set(mergeRecord.mergeId, mergeRecord);
    metrics.entityMergesCount += 1;
    return structuredClone(mergeRecord);
  }

  function reverseEntityMerge(params: {
    actorUid: string;
    isAdmin: boolean;
    mergeId: string;
    reason: string;
  }): DuplicateMergeRecord {
    if (!params.isAdmin) {
      throw new CoreApiError('FORBIDDEN', 403, 'Admin privilege is required to reverse an entity merge.');
    }
    const mrg = mergeHistory.get(params.mergeId);
    if (!mrg) {
      throw new CoreApiError('NOT_FOUND', 404, `Merge record '${params.mergeId}' not found.`);
    }
    if (mrg.reversed) {
      throw new CoreApiError('CONFLICT', 409, `Merge '${params.mergeId}' has already been reversed.`);
    }

    // Restore pre-merge snapshots
    for (const [id, snap] of Object.entries(mrg.preMergeSnapshots)) {
      masterStore.set(id, structuredClone(snap));
    }
    mrg.reversed = true;
    mrg.reversedByUid = params.actorUid;
    mrg.reversedAtIso = nowFn().toISOString();
    mergeHistory.set(mrg.mergeId, mrg);

    if (mrg.groupId && duplicateGroups.has(mrg.groupId)) {
      const grp = duplicateGroups.get(mrg.groupId)!;
      grp.status = 'REVERSED';
      duplicateGroups.set(mrg.groupId, grp);
    }
    return structuredClone(mrg);
  }

  function evaluateDataQuality(canonicalId: string): DataQualityScoreReport {
    const rec = masterStore.get(canonicalId);
    if (!rec) {
      throw new CoreApiError('NOT_FOUND', 404, `Master record '${canonicalId}' not found.`);
    }
    metrics.validationsExecutedCount += 1;
    const isPartOfDuplicateGroup = Array.from(duplicateGroups.values()).some(
      (g) => g.status === 'PENDING_REVIEW' && g.candidateCanonicalIds.includes(canonicalId),
    );
    return evaluateMasterRecordQuality({
      record: rec,
      allRecordsMap: masterStore,
      activeRules: Array.from(qualityRules.values()).filter((r) => r.active),
      isPartOfDuplicateGroup,
      nowIso: nowFn().toISOString(),
    });
  }

  function checkCrossModuleConsistency(
    checks: Parameters<typeof evaluateCrossModuleConsistency>[0]['checks'],
  ): CrossModuleConsistencyReport {
    metrics.validationsExecutedCount += 1;
    return evaluateCrossModuleConsistency({
      allRecordsMap: masterStore,
      checks,
      nowIso: nowFn().toISOString(),
    });
  }

  function submitCorrectionProposal(params: {
    actorUid: string;
    canonicalId: string;
    proposedChanges: Record<string, unknown>;
    reason: string;
    evidenceRefs: string[];
  }): CorrectionProposalRecord {
    const rec = masterStore.get(params.canonicalId);
    if (!rec) {
      throw new CoreApiError('NOT_FOUND', 404, `Master record '${params.canonicalId}' not found.`);
    }
    if (params.reason.trim().length < 3) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Correction reason is required.');
    }

    const beforeValues: Record<string, unknown> = {};
    for (const k of Object.keys(params.proposedChanges)) {
      beforeValues[k] = structuredClone(rec.attributes[k]);
    }

    const proposal: CorrectionProposalRecord = {
      proposalId: `corr_${crypto.randomBytes(6).toString('hex')}`,
      canonicalId: rec.canonicalId,
      entityType: rec.entityType,
      proposedChanges: structuredClone(params.proposedChanges),
      beforeValues,
      reason: params.reason.trim(),
      evidenceRefs: [...params.evidenceRefs],
      proposedByUid: params.actorUid,
      proposedAtIso: nowFn().toISOString(),
      status: 'PENDING_REVIEW',
    };
    correctionProposals.set(proposal.proposalId, proposal);
    return structuredClone(proposal);
  }

  function propagateMasterDataChange(params: {
    idempotencyKey: string;
    sourceCanonicalId: string;
    changeType: PropagationJobRecord['changeType'];
  }): PropagationJobRecord {
    for (const existing of propagationJobs.values()) {
      if (existing.idempotencyKey === params.idempotencyKey) {
        return structuredClone(existing);
      }
    }

    const src = masterStore.get(params.sourceCanonicalId);
    const affectedDependentIds: string[] = [];
    const recalculationTriggeredForHoodIds = new Set<number>();

    if (src && typeof src.attributes.hoodId === 'number') {
      recalculationTriggeredForHoodIds.add(src.attributes.hoodId);
    }

    for (const r of masterStore.values()) {
      if (
        r.parentCanonicalId === params.sourceCanonicalId ||
        Object.values(r.relatedCanonicalIds).includes(params.sourceCanonicalId)
      ) {
        affectedDependentIds.push(r.canonicalId);
        if (typeof r.attributes.hoodId === 'number') {
          recalculationTriggeredForHoodIds.add(r.attributes.hoodId);
        }
      }
    }

    const nowIso = nowFn().toISOString();
    const job: PropagationJobRecord = {
      jobId: `prop_job_${crypto.randomBytes(6).toString('hex')}`,
      idempotencyKey: params.idempotencyKey,
      sourceCanonicalId: params.sourceCanonicalId,
      changeType: params.changeType,
      affectedDependentIds,
      recalculationTriggeredForHoodIds: Array.from(recalculationTriggeredForHoodIds),
      status: 'COMPLETED',
      createdAtIso: nowIso,
      completedAtIso: nowIso,
    };
    propagationJobs.set(job.jobId, job);
    return structuredClone(job);
  }

  function reviewCorrectionProposal(params: {
    actorUid: string;
    isAdmin: boolean;
    proposalId: string;
    decision: 'APPROVE' | 'REJECT';
    reviewNotes: string;
  }): CorrectionProposalRecord {
    if (!params.isAdmin) {
      throw new CoreApiError('FORBIDDEN', 403, 'Admin authorization is required to review master-data corrections.');
    }
    const prop = correctionProposals.get(params.proposalId);
    if (!prop) {
      throw new CoreApiError('NOT_FOUND', 404, `Correction proposal '${params.proposalId}' not found.`);
    }
    if (prop.status !== 'PENDING_REVIEW') {
      throw new CoreApiError('CONFLICT', 409, `Proposal '${params.proposalId}' is already in state '${prop.status}'.`);
    }

    if (activeEntityLocks.has(prop.canonicalId)) {
      throw new CoreApiError('CONFLICT', 409, `Concurrent correction in progress for '${prop.canonicalId}'.`);
    }
    activeEntityLocks.add(prop.canonicalId);

    try {
      const nowIso = nowFn().toISOString();
      prop.reviewedByUid = params.actorUid;
      prop.reviewedAtIso = nowIso;
      prop.reviewNotes = params.reviewNotes;

      if (params.decision === 'REJECT') {
        prop.status = 'REJECTED';
        correctionProposals.set(prop.proposalId, prop);
        return structuredClone(prop);
      }

      registerOrUpdateMasterRecord({
        actorUid: params.actorUid,
        isAdmin: true,
        canonicalId: prop.canonicalId,
        entityType: prop.entityType,
        attributes: prop.proposedChanges,
        provenance: masterStore.get(prop.canonicalId)!.provenance,
        reason: `Correction proposal ${prop.proposalId} approved: ${prop.reason}`,
        bypassLockCheck: true,
      });

      const propJob = propagateMasterDataChange({
        idempotencyKey: `prop_for_${prop.proposalId}`,
        sourceCanonicalId: prop.canonicalId,
        changeType: 'ATTRIBUTE_CORRECTION',
      });

      prop.status = 'APPROVED_APPLIED';
      prop.propagationJobId = propJob.jobId;
      correctionProposals.set(prop.proposalId, prop);
      metrics.correctionApprovalsCount += 1;
      return structuredClone(prop);
    } finally {
      activeEntityLocks.delete(prop.canonicalId);
    }
  }

  function rollbackCorrectionProposal(params: {
    actorUid: string;
    isAdmin: boolean;
    proposalId: string;
    reason: string;
  }): CorrectionProposalRecord {
    if (!params.isAdmin) {
      throw new CoreApiError('FORBIDDEN', 403, 'Admin authorization required to roll back a correction.');
    }
    const prop = correctionProposals.get(params.proposalId);
    if (!prop || prop.status !== 'APPROVED_APPLIED') {
      throw new CoreApiError('CONFLICT', 409, 'Only APPROVED_APPLIED corrections can be rolled back.');
    }
    if (prop.irreversibleDownstreamEffect) {
      throw new CoreApiError('CONFLICT', 409, 'Correction has irreversible downstream effects and cannot be rolled back.');
    }

    registerOrUpdateMasterRecord({
      actorUid: params.actorUid,
      isAdmin: true,
      canonicalId: prop.canonicalId,
      entityType: prop.entityType,
      attributes: prop.beforeValues,
      provenance: masterStore.get(prop.canonicalId)!.provenance,
      reason: `Rollback of correction ${prop.proposalId}: ${params.reason}`,
    });

    prop.status = 'ROLLED_BACK';
    correctionProposals.set(prop.proposalId, prop);
    return structuredClone(prop);
  }

  function getDataProfile(params: {
    entityType: MasterEntityType;
    cityId?: string;
  }): DataProfileReport {
    const dupIds = new Set<string>();
    for (const g of duplicateGroups.values()) {
      if (g.status === 'PENDING_REVIEW') {
        for (const id of g.candidateCanonicalIds) dupIds.add(id);
      }
    }
    return buildEntityDataProfile({
      entityType: params.entityType,
      cityId: params.cityId,
      records: Array.from(masterStore.values()),
      duplicateIds: dupIds,
      nowIso: nowFn().toISOString(),
    });
  }

  function validateDataContractCompatibility(params: {
    contractId: string;
    proposedRequiredFields: string[];
    payloadSample?: Record<string, unknown>;
  }): {
    compatible: boolean;
    breakingRemovedRequiredFields: string[];
    missingPayloadFields: string[];
  } {
    const contract = dataContracts.get(params.contractId);
    if (!contract) {
      throw new CoreApiError('NOT_FOUND', 404, `Data contract '${params.contractId}' not found.`);
    }
    const breakingRemovedRequiredFields = contract.requiredFields.filter(
      (f) => !params.proposedRequiredFields.includes(f),
    );
    const missingPayloadFields = params.payloadSample
      ? contract.requiredFields.filter((f) => params.payloadSample![f] === undefined)
      : [];

    const compatible = breakingRemovedRequiredFields.length === 0 && missingPayloadFields.length === 0;
    if (!compatible) {
      metrics.schemaCompatibilityFailuresCount += 1;
    }
    return {
      compatible,
      breakingRemovedRequiredFields,
      missingPayloadFields,
    };
  }

  function getGovernanceDashboardSummary(): DataGovernanceDashboardSummary {
    const records = Array.from(masterStore.values());
    const qualityByEntityType: Record<string, { count: number; avgScore: number }> = {};
    const qualityBySource: Record<string, number> = {};
    let healthyCount = 0;
    let staleCount = 0;
    const nowIso = nowFn().toISOString();

    for (const r of records) {
      const q = evaluateDataQuality(r.canonicalId);
      if (q.overallScore >= 75 && q.blockingPassed) healthyCount++;
      const entry = qualityByEntityType[r.entityType] ?? { count: 0, avgScore: 0 };
      const totalScore = entry.avgScore * entry.count + q.overallScore;
      entry.count += 1;
      entry.avgScore = Math.round(totalScore / entry.count);
      qualityByEntityType[r.entityType] = entry;

      const src = r.provenance.sourceCategory;
      qualityBySource[src] = (qualityBySource[src] ?? 0) + 1;

      const ageDays = (Date.parse(nowIso) - Date.parse(r.updatedAtIso)) / (1000 * 60 * 60 * 24);
      if (ageDays > 90) staleCount++;
    }

    return {
      totalMasterRecords: records.length,
      overallHealthyRatioPct:
        records.length > 0 ? Number(((healthyCount / records.length) * 100).toFixed(1)) : 100,
      qualityByEntityType,
      qualityBySource,
      activeDuplicateGroupsCount: Array.from(duplicateGroups.values()).filter(
        (g) => g.status === 'PENDING_REVIEW',
      ).length,
      pendingCorrectionProposalsCount: Array.from(correctionProposals.values()).filter(
        (p) => p.status === 'PENDING_REVIEW',
      ).length,
      staleRecordsCount: staleCount,
      propagationJobsCompletedCount: propagationJobs.size,
      generatedAtIso: nowIso,
    };
  }

  function listMasterRecordsPaginated(params: {
    entityType?: MasterEntityType;
    page?: number;
    pageSize?: number;
  }): { total: number; page: number; pageSize: number; items: MasterDataRecord[] } {
    const filtered = Array.from(masterStore.values()).filter(
      (r) => !params.entityType || r.entityType === params.entityType,
    );
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20));
    const start = (page - 1) * pageSize;
    return {
      total: filtered.length,
      page,
      pageSize,
      items: structuredClone(filtered.slice(start, start + pageSize)),
    };
  }

  return {
    resolveEntity,
    registerOrUpdateMasterRecord,
    getMasterRecord: (canonicalId: string) => {
      const r = masterStore.get(canonicalId);
      return r ? structuredClone(r) : null;
    },
    listMasterRecordsPaginated,
    listDuplicateCandidateGroups: () => structuredClone(Array.from(duplicateGroups.values())),
    mergeDuplicateEntities,
    reverseEntityMerge,
    evaluateDataQuality,
    checkCrossModuleConsistency,
    submitCorrectionProposal,
    reviewCorrectionProposal,
    rollbackCorrectionProposal,
    propagateMasterDataChange,
    getDataProfile,
    validateDataContractCompatibility,
    listDataContracts: () => structuredClone(Array.from(dataContracts.values())),
    getGovernanceDashboardSummary,
    getObservabilityMetrics: (): DataGovernanceObservabilityMetrics => structuredClone(metrics),
  };
}

export type DataGovernanceService = ReturnType<typeof createDataGovernanceService>;
