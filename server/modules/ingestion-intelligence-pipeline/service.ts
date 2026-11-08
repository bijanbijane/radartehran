/**
 * EMPLOYEE 70 — REAL ESTATE DATA INGESTION, EXTERNAL SOURCES & INTELLIGENCE PIPELINE SERVICE
 */

import crypto from 'crypto';
import {
  CoreApiError,
  createStructuredAuditEvent,
  runDurableTransaction,
  type AuthenticatedPrincipal,
  type TransactionContextLike,
} from '../core';
import {
  assertSafeExternalUrl,
  normalizeExternalRecord,
  parseStructuredFormatRecords,
  resolveEntityAgainstKnownCanonicals,
  validateNormalizedRecordQuality,
} from './connectors';
import type {
  DataQualityValidationResult,
  DataSourceRegistryRecord,
  EntityResolutionCandidateRecord,
  ExecuteIngestionBatchInput,
  IngestionBatchRecord,
  IngestionPipelineDependencies,
  IngestionPipelineStage,
  KnownCanonicalEntityRef,
  NormalizedIngestionRecord,
  RawExternalRecordInput,
  RawStagingRecord,
  SourceProvenanceRecord,
  SynchronizationCheckpointRecord,
  ValuationEvidenceObservationRecord,
} from './types';

function writeDoc(tx: TransactionContextLike, docPath: string, data: unknown): void {
  tx.set(docPath, data as Record<string, unknown>);
}

export class IngestionIntelligencePipelineService {
  private readonly sources = new Map<string, DataSourceRegistryRecord>();
  private readonly batches = new Map<string, IngestionBatchRecord>();
  private readonly batchIdempotencyIndex = new Map<string, string>();
  private readonly rawStaging = new Map<string, RawStagingRecord>();
  private readonly normalizedRecords = new Map<string, NormalizedIngestionRecord>();
  private readonly validations = new Map<string, DataQualityValidationResult>();
  private readonly resolutions = new Map<string, EntityResolutionCandidateRecord>();
  private readonly provenances = new Map<string, SourceProvenanceRecord>();
  private readonly valuationObservations = new Map<string, ValuationEvidenceObservationRecord>();
  private readonly checkpoints = new Map<string, SynchronizationCheckpointRecord>();
  private readonly canonicalEntities: KnownCanonicalEntityRef[];
  private readonly propagatedEventIds = new Set<string>();

  constructor(private readonly deps: IngestionPipelineDependencies) {
    this.canonicalEntities = [...(deps.knownCanonicalEntities ?? [])];
  }

  private assertIngestionAdmin(actor: AuthenticatedPrincipal): void {
    const allowedRoles = new Set(['primary_admin', 'delegated_admin', 'server_secret_admin']);
    if (!allowedRoles.has(actor.role)) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Administrative privileges are required for ingestion pipeline operations.',
      );
    }
  }

  public async registerDataSource(
    actor: AuthenticatedPrincipal,
    input: Omit<DataSourceRegistryRecord, 'createdAt' | 'updatedAt' | 'createdByUserId'>,
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<DataSourceRegistryRecord> {
    this.assertIngestionAdmin(actor);

    if (!input.sourceId || !input.name || !input.licensingReference) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'sourceId, name, and licensingReference are required to register a data source.',
      );
    }

    if (!input.permissionVerified) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'UNLICENSED_OR_UNAUTHORIZED_DATA_SOURCE: Data sources without verified legal/licensing permission cannot be registered or activated.',
      );
    }

    if (input.secretEnvKeyRef && (input.secretEnvKeyRef.includes('=') || input.secretEnvKeyRef.length > 80)) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'SECRET_STORAGE_VIOLATION: secretEnvKeyRef must only reference an environment variable name, never raw credentials.',
      );
    }

    const now = new Date().toISOString();
    const record: DataSourceRegistryRecord = {
      ...input,
      trustScore: Math.max(0, Math.min(100, input.trustScore)),
      maxPayloadBytes: input.maxPayloadBytes > 0 ? input.maxPayloadBytes : 2_000_000,
      maxRecordsPerBatch: input.maxRecordsPerBatch > 0 ? input.maxRecordsPerBatch : 1000,
      createdAt: now,
      updatedAt: now,
      createdByUserId: actor.uid,
    };

    await runDurableTransaction(
      this.deps.txRunner,
      { operationName: 'ingestion.registerDataSource' },
      async (tx) => {
        writeDoc(tx, `ingestion_sources/${record.sourceId}`, record);
      },
    );

    this.sources.set(record.sourceId, record);

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: actor,
        correlationId,
        action: 'INGESTION_SOURCE_REGISTERED',
        targetCollection: 'ingestion_sources',
        targetResourceId: record.sourceId,
        outcome: 'SUCCESS',
        metadata: {
          category: record.category,
          reliabilityClassification: record.reliabilityClassification,
          status: record.status,
        },
      }),
    );

    return record;
  }

  public async setDataSourceStatus(
    actor: AuthenticatedPrincipal,
    sourceId: string,
    status: DataSourceRegistryRecord['status'],
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<DataSourceRegistryRecord> {
    this.assertIngestionAdmin(actor);
    const existing = this.sources.get(sourceId);
    if (!existing) {
      throw new CoreApiError('NOT_FOUND', 404, `Data source ${sourceId} not found.`);
    }

    const updated: DataSourceRegistryRecord = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.sources.set(sourceId, updated);

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: actor,
        correlationId,
        action: 'INGESTION_SOURCE_STATUS_CHANGED',
        targetCollection: 'ingestion_sources',
        targetResourceId: sourceId,
        outcome: 'SUCCESS',
        metadata: { previousStatus: existing.status, newStatus: status },
      }),
    );

    return updated;
  }

  public async executeIngestionPipelineBatch(
    actor: AuthenticatedPrincipal,
    input: ExecuteIngestionBatchInput,
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<{
    batch: IngestionBatchRecord;
    stagingRecords: RawStagingRecord[];
    normalizedRecords: NormalizedIngestionRecord[];
    validations: DataQualityValidationResult[];
    resolutions: EntityResolutionCandidateRecord[];
    provenances: SourceProvenanceRecord[];
    valuationObservations: ValuationEvidenceObservationRecord[];
  }> {
    this.assertIngestionAdmin(actor);

    const source = this.sources.get(input.sourceId);
    if (!source) {
      throw new CoreApiError('NOT_FOUND', 404, `Registered data source ${input.sourceId} not found.`);
    }

    if (source.status !== 'ACTIVE' || !source.permissionVerified) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `DATA_SOURCE_NOT_ACTIVE: Data source ${source.sourceId} is ${source.status} and cannot execute ingestion.`,
      );
    }

    const idemKey = `${source.sourceId}::${input.idempotencyKey}`;
    const existingBatchId = this.batchIdempotencyIndex.get(idemKey);
    if (existingBatchId) {
      const existingBatch = this.batches.get(existingBatchId)!;
      return this.collectBatchArtifacts(existingBatch);
    }

    if (input.fetchUrl) {
      assertSafeExternalUrl(input.fetchUrl, source.allowedDomains);
    }

    const completedStages: IngestionPipelineStage[] = ['SOURCE_ACQUISITION'];

    let rawRecords: RawExternalRecordInput[] = [];
    if (input.rawPayloadText !== undefined) {
      rawRecords = parseStructuredFormatRecords(
        input.rawFormat || source.connectorFormat,
        input.rawPayloadText,
        source.maxPayloadBytes,
        source.maxRecordsPerBatch,
      );
    } else if (Array.isArray(input.records)) {
      const serialized = JSON.stringify(input.records);
      parseStructuredFormatRecords(
        'JSON',
        serialized,
        source.maxPayloadBytes,
        source.maxRecordsPerBatch,
      );
      rawRecords = input.records;
    } else {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Either rawPayloadText or records must be provided for ingestion.',
      );
    }

    completedStages.push('RAW_PAYLOAD_VALIDATION');

    const nowIso = new Date().toISOString();
    const batchId = `batch_${crypto.randomUUID()}`;
    const stagingRecords: RawStagingRecord[] = [];
    const normalizedRecords: NormalizedIngestionRecord[] = [];
    const validations: DataQualityValidationResult[] = [];
    const resolutions: EntityResolutionCandidateRecord[] = [];
    const provenances: SourceProvenanceRecord[] = [];

    const seenExternalKeysInBatch = new Set<string>();

    for (const rawRec of rawRecords) {
      const serializedRec = JSON.stringify(rawRec);
      const checksumSha256 = crypto.createHash('sha256').update(serializedRec).digest('hex');
      const stagingId = `stg_${crypto.randomUUID()}`;

      const staging: RawStagingRecord = {
        stagingId,
        batchId,
        sourceId: source.sourceId,
        sourceVersion: source.schemaVersion,
        externalRecordId: String(rawRec.externalRecordId || ''),
        checksumSha256,
        objectStorageRef: `r2://ingestion-staging/${source.sourceId}/${batchId}/${stagingId}.json`,
        payloadSizeBytes: Buffer.byteLength(serializedRec, 'utf8'),
        sanitizedSummaryPayload: {
          externalRecordId: rawRec.externalRecordId,
          city: rawRec.city,
          district: rawRec.district,
          propertyCategory: rawRec.propertyCategory,
          transactionMode: rawRec.transactionMode,
        },
        ingestionTimestamp: nowIso,
      };
      stagingRecords.push(staging);

      const norm = normalizeExternalRecord(rawRec, stagingId, batchId, source, nowIso);
      normalizedRecords.push(norm);

      const resolution = resolveEntityAgainstKnownCanonicals(
        norm,
        this.canonicalEntities,
        seenExternalKeysInBatch,
        nowIso,
      );
      resolutions.push(resolution);

      const validation = validateNormalizedRecordQuality(norm);
      validations.push(validation);

      const provenance: SourceProvenanceRecord = {
        provenanceId: `prov_${crypto.randomUUID()}`,
        normalizedRecordId: norm.normalizedRecordId,
        batchId,
        sourceId: source.sourceId,
        sourceVersion: source.schemaVersion,
        externalRecordId: norm.externalRecordId,
        ingestionTimestamp: nowIso,
        transformationVersion: 'emp70-v1.0',
        confidenceScore: Math.round(((source.trustScore / 100) * (validation.qualityScore / 100)) * 100) / 100,
        provenanceClassification: source.defaultProvenanceClassification,
        verificationState: validation.passed ? 'AUTOMATED_VALIDATED' : 'UNVERIFIED',
      };
      provenances.push(provenance);
    }

    completedStages.push(
      'RAW_STAGING_PERSISTENCE',
      'SCHEMA_MAPPING',
      'FIELD_NORMALIZATION',
      'LANGUAGE_TEXT_CLEANING',
      'UNIT_CURRENCY_NORMALIZATION',
      'GEOSPATIAL_NORMALIZATION',
      'ENTITY_RESOLUTION_CANDIDATE_MATCHING',
      'DUPLICATE_DETECTION',
      'DATA_QUALITY_VALIDATION',
      'PROVENANCE_LINEAGE_RECORDING',
      'ENRICHMENT_DERIVED_ATTRIBUTES',
      'APPROVAL_QUARANTINE_DECISION',
    );

    const quarantinedCount = validations.filter((v) => v.quarantined).length;
    const validCount = validations.filter((v) => v.passed).length;
    const duplicateSkippedCount = resolutions.filter((r) => r.decision === 'DUPLICATE_SKIPPED').length;
    const ambiguousReviewCount = resolutions.filter(
      (r) => r.decision === 'AMBIGUOUS_CANDIDATE_REQUIRES_REVIEW',
    ).length;

    const requiresManualGate =
      source.requiresManualApprovalBeforePublish ||
      source.reliabilityClassification === 'UNVERIFIED_EXTERNAL' ||
      source.category === 'MANUAL_UPLOAD_DATASET';

    const approvalState: IngestionBatchRecord['approvalState'] = requiresManualGate
      ? 'PENDING_APPROVAL'
      : 'NOT_REQUIRED';

    let batchStatus: IngestionBatchRecord['status'] = 'COMPLETED';
    if (requiresManualGate) {
      batchStatus = 'AWAITING_APPROVAL';
    } else if (quarantinedCount > 0 && validCount === 0) {
      batchStatus = 'QUARANTINED';
    } else if (quarantinedCount > 0) {
      batchStatus = 'PARTIALLY_COMPLETED';
    }

    const batch: IngestionBatchRecord = {
      batchId,
      sourceId: source.sourceId,
      idempotencyKey: input.idempotencyKey,
      status: batchStatus,
      completedStages,
      totalReceivedCount: rawRecords.length,
      stagedCount: stagingRecords.length,
      normalizedCount: normalizedRecords.length,
      validCount,
      quarantinedCount,
      duplicateSkippedCount,
      ambiguousReviewCount,
      propagatedCanonicalCount: 0,
      startedAt: nowIso,
      completedAt: requiresManualGate ? undefined : nowIso,
      triggeredByUserId: actor.uid,
      approvalState,
    };

    await runDurableTransaction(
      this.deps.txRunner,
      { operationName: 'ingestion.executePipelineBatch' },
      async (tx) => {
        writeDoc(tx, `ingestion_batches/${batch.batchId}`, batch);
        for (const s of stagingRecords) writeDoc(tx, `ingestion_staging/${s.stagingId}`, s);
        for (const n of normalizedRecords) writeDoc(tx, `ingestion_normalized/${n.normalizedRecordId}`, n);
        for (const v of validations) writeDoc(tx, `ingestion_validations/${v.validationId}`, v);
        for (const r of resolutions) writeDoc(tx, `ingestion_resolutions/${r.resolutionId}`, r);
        for (const p of provenances) writeDoc(tx, `ingestion_provenances/${p.provenanceId}`, p);
      },
    );

    this.batches.set(batch.batchId, batch);
    this.batchIdempotencyIndex.set(idemKey, batch.batchId);
    for (const s of stagingRecords) this.rawStaging.set(s.stagingId, s);
    for (const n of normalizedRecords) this.normalizedRecords.set(n.normalizedRecordId, n);
    for (const v of validations) this.validations.set(v.normalizedRecordId, v);
    for (const r of resolutions) this.resolutions.set(r.normalizedRecordId, r);
    for (const p of provenances) this.provenances.set(p.normalizedRecordId, p);

    if (!requiresManualGate && input.autoPropagateIfApproved !== false) {
      await this.propagateEligibleBatchRecords(batch);
    }

    if (input.cursorToken) {
      const checkpoint: SynchronizationCheckpointRecord = {
        checkpointId: `chk_${source.sourceId}`,
        sourceId: source.sourceId,
        cursorToken: input.cursorToken,
        lastProcessedExternalTimestamp: nowIso,
        lastBatchId: batch.batchId,
        processedRecordCount: rawRecords.length,
        status: 'HEALTHY',
        updatedAt: nowIso,
      };
      this.checkpoints.set(source.sourceId, checkpoint);
    }

    this.sources.set(source.sourceId, {
      ...source,
      lastSuccessfulSyncAt: nowIso,
      updatedAt: nowIso,
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: actor,
        correlationId,
        action: 'INGESTION_BATCH_EXECUTED',
        targetCollection: 'ingestion_batches',
        targetResourceId: batch.batchId,
        outcome: 'SUCCESS',
        metadata: {
          sourceId: source.sourceId,
          status: batch.status,
          validCount,
          quarantinedCount,
          ambiguousReviewCount,
          propagatedCanonicalCount: batch.propagatedCanonicalCount,
        },
      }),
    );

    return this.collectBatchArtifacts(batch);
  }

  private async propagateEligibleBatchRecords(batch: IngestionBatchRecord): Promise<void> {
    const norms = Array.from(this.normalizedRecords.values()).filter((n) => n.batchId === batch.batchId);
    let propagatedCount = 0;

    for (const norm of norms) {
      const val = this.validations.get(norm.normalizedRecordId);
      const res = this.resolutions.get(norm.normalizedRecordId);
      const prov = this.provenances.get(norm.normalizedRecordId);
      if (!val || !val.passed || val.quarantined) continue;
      if (!res || res.decision === 'DUPLICATE_SKIPPED' || res.decision === 'AMBIGUOUS_CANDIDATE_REQUIRES_REVIEW') {
        continue;
      }
      if (!prov) continue;

      const loopKey = `prop::${batch.batchId}::${norm.normalizedRecordId}`;
      if (this.propagatedEventIds.has(loopKey)) continue;
      this.propagatedEventIds.add(loopKey);

      const canonicalId = res.matchedCanonicalPropertyId || `prop_${norm.normalizedRecordId}`;
      prov.canonicalTargetId = canonicalId;
      prov.canonicalTargetDomain = 'PROPERTY_REGISTRY';

      if (res.decision === 'NEW_ENTITY' && norm.areaSqm !== undefined) {
        this.canonicalEntities.push({
          canonicalPropertyId: canonicalId,
          nationalPropertyCode: norm.nationalPropertyCode,
          postalCode: norm.postalCode,
          cityName: norm.cityName,
          districtCode: norm.districtCode,
          neighborhoodName: norm.neighborhoodName,
          normalizedAddressFa: norm.normalizedAddressFa || '',
          areaSqm: norm.areaSqm,
          latitude: norm.latitude,
          longitude: norm.longitude,
        });
      }

      if (norm.priceRials !== undefined && norm.areaSqm !== undefined && norm.areaSqm > 0) {
        const obs: ValuationEvidenceObservationRecord = {
          observationId: `vobs_${crypto.randomUUID()}`,
          normalizedRecordId: norm.normalizedRecordId,
          sourceId: norm.sourceId,
          cityName: norm.cityName,
          districtCode: norm.districtCode,
          neighborhoodName: norm.neighborhoodName,
          areaSqm: norm.areaSqm,
          totalPriceRials: norm.priceRials,
          pricePerSqmRials: Math.round(norm.priceRials / norm.areaSqm),
          evidenceCategory: norm.isVerifiedTransactionPrice
            ? 'VERIFIED_TRANSACTION_OBSERVATION'
            : 'ASKING_PRICE_OBSERVATION',
          provenanceClassification: prov.provenanceClassification,
          confidenceScore: prov.confidenceScore,
          observedAt: norm.normalizedAt,
        };
        this.valuationObservations.set(obs.observationId, obs);
        if (this.deps.onValuationEvidencePropagated) {
          await this.deps.onValuationEvidencePropagated(obs);
        }
      }

      if (this.deps.onCanonicalPropertyPropagated) {
        await this.deps.onCanonicalPropertyPropagated(norm, prov);
      }
      if (this.deps.onSearchIndexRefreshRequested) {
        await this.deps.onSearchIndexRefreshRequested(norm);
      }
      if (this.deps.onAlertTriggerRequested) {
        await this.deps.onAlertTriggerRequested(norm);
      }

      propagatedCount++;
    }

    if (!batch.completedStages.includes('CANONICAL_DOMAIN_PROPAGATION')) {
      batch.completedStages.push('CANONICAL_DOMAIN_PROPAGATION', 'SEARCH_ANALYTICS_VALUATION_UPDATE');
    }
    batch.propagatedCanonicalCount += propagatedCount;
    batch.completedAt = new Date().toISOString();
    this.batches.set(batch.batchId, batch);
  }

  public async approveOrRollbackBatch(
    actor: AuthenticatedPrincipal,
    batchId: string,
    decision: 'APPROVE' | 'REJECT' | 'ROLLBACK',
    reason?: string,
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<IngestionBatchRecord> {
    this.assertIngestionAdmin(actor);
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new CoreApiError('NOT_FOUND', 404, `Batch ${batchId} not found.`);
    }

    const now = new Date().toISOString();
    if (decision === 'APPROVE') {
      batch.approvalState = 'APPROVED';
      batch.approvedByUserId = actor.uid;
      batch.approvedAt = now;
      batch.status = batch.quarantinedCount > 0 ? 'PARTIALLY_COMPLETED' : 'COMPLETED';
      await this.propagateEligibleBatchRecords(batch);
    } else if (decision === 'REJECT') {
      batch.approvalState = 'REJECTED';
      batch.status = 'QUARANTINED';
      batch.failureReason = reason || 'Rejected by ingestion administrator.';
    } else if (decision === 'ROLLBACK') {
      batch.approvalState = 'ROLLED_BACK';
      batch.status = 'ROLLED_BACK';
      batch.propagatedCanonicalCount = 0;
      batch.failureReason = reason || 'Batch rolled back by administrator.';
      for (const [obsId, obs] of this.valuationObservations.entries()) {
        const norm = this.normalizedRecords.get(obs.normalizedRecordId);
        if (norm && norm.batchId === batchId) {
          this.valuationObservations.delete(obsId);
        }
      }
    }

    this.batches.set(batchId, batch);

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: actor,
        correlationId,
        action: `INGESTION_BATCH_${decision}`,
        targetCollection: 'ingestion_batches',
        targetResourceId: batchId,
        outcome: 'SUCCESS',
        metadata: { decision, reason, status: batch.status },
      }),
    );

    return batch;
  }

  public async reviewAmbiguousEntityCandidate(
    actor: AuthenticatedPrincipal,
    normalizedRecordId: string,
    decision: 'APPROVE_MERGE' | 'KEEP_SEPARATE',
    targetCanonicalPropertyId?: string,
    correlationId = `corr_${crypto.randomUUID()}`,
  ): Promise<EntityResolutionCandidateRecord> {
    this.assertIngestionAdmin(actor);
    const res = this.resolutions.get(normalizedRecordId);
    if (!res) {
      throw new CoreApiError('NOT_FOUND', 404, `Entity resolution record for ${normalizedRecordId} not found.`);
    }

    const now = new Date().toISOString();
    if (decision === 'APPROVE_MERGE') {
      res.decision = 'EXACT_CANONICAL_MATCH';
      res.matchedCanonicalPropertyId = targetCanonicalPropertyId || res.candidatePropertyIds[0];
      res.reviewStatus = 'HUMAN_APPROVED_MERGE';
    } else {
      res.decision = 'NEW_ENTITY';
      res.matchedCanonicalPropertyId = undefined;
      res.reviewStatus = 'HUMAN_REJECTED_SEPARATE';
    }
    res.reviewedByUserId = actor.uid;
    res.reviewedAt = now;
    this.resolutions.set(normalizedRecordId, res);

    const prov = this.provenances.get(normalizedRecordId);
    if (prov) {
      prov.verificationState = 'MANUALLY_VERIFIED';
      prov.provenanceClassification = 'MANUALLY_VERIFIED';
      this.provenances.set(normalizedRecordId, prov);
    }

    const batch = this.batches.get(res.batchId);
    if (batch && batch.approvalState !== 'PENDING_APPROVAL' && batch.status !== 'ROLLED_BACK') {
      await this.propagateEligibleBatchRecords(batch);
    }

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: actor,
        correlationId,
        action: 'INGESTION_ENTITY_CANDIDATE_REVIEWED',
        targetCollection: 'ingestion_resolutions',
        targetResourceId: res.resolutionId,
        outcome: 'SUCCESS',
        metadata: { normalizedRecordId, decision, matchedCanonicalPropertyId: res.matchedCanonicalPropertyId },
      }),
    );

    return res;
  }

  public getCheckpoint(sourceId: string): SynchronizationCheckpointRecord | undefined {
    return this.checkpoints.get(sourceId);
  }

  public getValuationObservations(filter?: {
    evidenceCategory?: 'ASKING_PRICE_OBSERVATION' | 'VERIFIED_TRANSACTION_OBSERVATION';
  }): ValuationEvidenceObservationRecord[] {
    const all = Array.from(this.valuationObservations.values());
    if (!filter?.evidenceCategory) return all;
    return all.filter((o) => o.evidenceCategory === filter.evidenceCategory);
  }

  public getOperationalMetrics(actor: AuthenticatedPrincipal) {
    this.assertIngestionAdmin(actor);
    const allBatches = Array.from(this.batches.values());
    return {
      registeredSourcesCount: this.sources.size,
      activeSourcesCount: Array.from(this.sources.values()).filter((s) => s.status === 'ACTIVE').length,
      totalBatchesExecuted: allBatches.length,
      totalReceivedRecords: allBatches.reduce((s, b) => s + b.totalReceivedCount, 0),
      totalValidRecords: allBatches.reduce((s, b) => s + b.validCount, 0),
      totalQuarantinedRecords: allBatches.reduce((s, b) => s + b.quarantinedCount, 0),
      totalDuplicatesSkipped: allBatches.reduce((s, b) => s + b.duplicateSkippedCount, 0),
      totalAmbiguousPendingReview: Array.from(this.resolutions.values()).filter(
        (r) => r.reviewStatus === 'PENDING_HUMAN_REVIEW',
      ).length,
      totalPropagatedCanonicals: allBatches.reduce((s, b) => s + b.propagatedCanonicalCount, 0),
      askingPriceObservationsCount: this.getValuationObservations({
        evidenceCategory: 'ASKING_PRICE_OBSERVATION',
      }).length,
      verifiedTransactionObservationsCount: this.getValuationObservations({
        evidenceCategory: 'VERIFIED_TRANSACTION_OBSERVATION',
      }).length,
    };
  }

  private collectBatchArtifacts(batch: IngestionBatchRecord) {
    const batchId = batch.batchId;
    return {
      batch,
      stagingRecords: Array.from(this.rawStaging.values()).filter((s) => s.batchId === batchId),
      normalizedRecords: Array.from(this.normalizedRecords.values()).filter((n) => n.batchId === batchId),
      validations: Array.from(this.validations.values()).filter((v) => v.batchId === batchId),
      resolutions: Array.from(this.resolutions.values()).filter((r) => r.batchId === batchId),
      provenances: Array.from(this.provenances.values()).filter((p) => p.batchId === batchId),
      valuationObservations: Array.from(this.valuationObservations.values()).filter((o) => {
        const norm = this.normalizedRecords.get(o.normalizedRecordId);
        return norm?.batchId === batchId;
      }),
    };
  }
}
