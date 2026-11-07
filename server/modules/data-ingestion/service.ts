import crypto from 'crypto';
import {
  authorizePrincipal,
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
  createStructuredAuditEvent,
  executeIdempotentMutation,
  normalizeFirestoreTimestamp,
  requireSafeFirestoreId,
  runDurableTransaction,
  verifyAdminOrDelegatedPrincipal,
  type AuthenticatedPrincipal,
} from '../core';
import {
  computeCanonicalHashSha256,
  normalizeAndValidateIngestionRow,
  parseStructuredFileInput,
  validateCreateJobInput,
  validateIngestBatchInput,
  validateModerateJobInput,
  validateRegisterSourceInput,
} from './normalizationAndValidation';
import type {
  DataIngestionModuleDependencies,
  IngestionReconciliationReport,
  RecordProvenanceEnvelope,
  StoredIngestionJob,
  StoredIngestionSource,
  StoredQuarantinedRecord,
  StoredStagedRecord,
} from './types';

function buildReconciliationReport(job: StoredIngestionJob, nowIso: string): IngestionReconciliationReport {
  const accounted = job.validStagedCount + job.duplicateSkippedCount + job.quarantinedInvalidCount;
  return {
    jobId: job.id,
    sourceId: job.sourceId,
    sourceName: job.sourceName,
    authorityOrPublisher: job.authorityOrPublisher,
    dataCategory: job.dataCategory,
    sourceVersion: job.sourceVersion,
    ...(job.previousSourceVersion ? { previousSourceVersion: job.previousSourceVersion } : {}),
    versionChangeDetected: job.versionChangeDetected,
    schemaVersion: job.schemaVersion,
    importMethod: job.importMethod,
    retrievalOrSubmissionDateIso: job.retrievalOrSubmissionDateIso,
    jobStatus: job.status,
    totalExpectedRows: job.totalExpectedRows,
    processedCount: job.processedCount,
    validStagedCount: job.validStagedCount,
    duplicateSkippedCount: job.duplicateSkippedCount,
    quarantinedInvalidCount: job.quarantinedInvalidCount,
    publishedRecordCount: job.publishedRecordCount,
    reconciledBalanced: job.processedCount === accounted,
    unprocessedRemainingCount: Math.max(0, job.totalExpectedRows - job.processedCount),
    generatedAtIso: nowIso,
  };
}

export function createDataIngestionService(deps: DataIngestionModuleDependencies) {
  const idempotencyStore = deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());

  async function requireAdminPrincipal(principal: AuthenticatedPrincipal, action: string, targetId: string, correlationId: string) {
    const decision = await verifyAdminOrDelegatedPrincipal(principal, deps.adminStore, {
      primaryAdminEmails: deps.primaryAdminEmails,
      disallowStaticToken: true,
    });
    if (!decision.allowed) {
      if (deps.auditSink) {
        await deps.auditSink.writeAuditEvent(
          createStructuredAuditEvent({
            principal, correlationId, action, targetCollection: 'ingestionJobs',
            targetResourceId: targetId, outcome: 'DENIED', reasonCode: decision.failureCode,
            nowIso: new Date(nowFn()).toISOString(),
          }),
        );
      }
      throw new CoreApiError('FORBIDDEN', decision.status, decision.reason ?? 'Admin privileges required.');
    }
    return decision;
  }

  function validateSafeId(rawId: unknown, fieldName: string): string {
    const res = requireSafeFirestoreId()(rawId, fieldName);
    if (!res.ok || !res.value) throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid ${fieldName}.`, res.issues);
    return res.value;
  }

  return {
    async registerDataSource(params: {
      principal: AuthenticatedPrincipal; idempotencyKey: string; rawBody: unknown; correlationId: string;
    }): Promise<{ replayed: boolean; statusCode: number; source: StoredIngestionSource }> {
      await requireAdminPrincipal(params.principal, 'ingestion.register_source', 'registry', params.correlationId);
      const validation = validateRegisterSourceInput(params.rawBody);
      if (!validation.ok || !validation.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid data source registration payload.', validation.issues);
      const input = validation.value;

      try {
        const outcome = await executeIdempotentMutation<StoredIngestionSource>({
          store: idempotencyStore, actorUid: params.principal.uid, operation: 'ingestion.register_source',
          idempotencyKey: params.idempotencyKey, requestPayload: input, nowEpochMs: nowFn(),
          mutationFn: async () => {
            const nowTs = normalizeFirestoreTimestamp(nowFn())!;
            const source = await runDurableTransaction(deps.txRunner, { operationName: 'ingestion.register_source', maxAttempts: 3 }, async (tx) => {
              const path = `ingestionSources/${input.sourceId}`;
              const existing = await tx.get<StoredIngestionSource>(path);
              if (existing.exists && existing.data) throw new CoreApiError('CONFLICT', 409, `Source "${input.sourceId}" is already registered.`);
              const doc: StoredIngestionSource = {
                id: input.sourceId, sourceName: input.sourceName, authorityOrPublisher: input.authorityOrPublisher,
                dataCategory: input.dataCategory, supportedSchemaVersion: input.supportedSchemaVersion,
                licenseOrUsageTerms: input.licenseOrUsageTerms, legalAndTechnicalBasisApproved: input.legalAndTechnicalBasisApproved,
                ownerUid: params.principal.uid, ownerEmail: params.principal.email, status: 'active',
                revision: 1, createdAt: nowTs, updatedAt: nowTs,
              };
              tx.set(path, doc as unknown as Record<string, unknown>);
              return doc;
            });
            return { statusCode: 201, body: source };
          },
        });
        return { replayed: outcome.replayed, statusCode: outcome.statusCode, source: outcome.body };
      } catch (err) {
        if (err instanceof CoreApiError) throw err;
        throw new CoreApiError('PERSISTENCE_FAILED', 503, err instanceof Error ? err.message : 'Source registration failed.');
      }
    },

    async createImportJob(params: {
      principal: AuthenticatedPrincipal; idempotencyKey: string; rawBody: unknown; correlationId: string;
    }): Promise<{ replayed: boolean; statusCode: number; job: StoredIngestionJob }> {
      await requireAdminPrincipal(params.principal, 'ingestion.create_job', 'jobs', params.correlationId);
      const validation = validateCreateJobInput(params.rawBody);
      if (!validation.ok || !validation.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid import job definition.', validation.issues);
      const input = validation.value;

      try {
        const outcome = await executeIdempotentMutation<StoredIngestionJob>({
          store: idempotencyStore, actorUid: params.principal.uid, operation: 'ingestion.create_job',
          idempotencyKey: params.idempotencyKey, requestPayload: input, nowEpochMs: nowFn(),
          mutationFn: async () => {
            const nowTs = normalizeFirestoreTimestamp(nowFn())!;
            const jobId = `job_${input.sourceId}_${crypto.randomBytes(4).toString('hex')}`;
            const created = await runDurableTransaction(deps.txRunner, { operationName: 'ingestion.create_job', maxAttempts: 3 }, async (tx) => {
              const sourcePath = `ingestionSources/${input.sourceId}`;
              const sourceSnap = await tx.get<StoredIngestionSource>(sourcePath);
              if (!sourceSnap.exists || !sourceSnap.data) throw new CoreApiError('NOT_FOUND', 404, `Registered source "${input.sourceId}" not found.`);
              const source = sourceSnap.data;
              if (source.status !== 'active' || !source.legalAndTechnicalBasisApproved) {
                throw new CoreApiError('FORBIDDEN', 403, `Source "${input.sourceId}" is not active or lacks approved legal basis.`);
              }
              if (source.supportedSchemaVersion !== input.schemaVersion) {
                throw new CoreApiError('VALIDATION_FAILED', 400, `Schema version mismatch: source supports "${source.supportedSchemaVersion}", job requested "${input.schemaVersion}".`);
              }

              const previousSourceVersion = source.latestSourceVersion;
              const versionChangeDetected = previousSourceVersion !== undefined && previousSourceVersion !== input.sourceVersion;

              const job: StoredIngestionJob = {
                id: jobId, sourceId: source.id, sourceName: source.sourceName, authorityOrPublisher: source.authorityOrPublisher,
                dataCategory: source.dataCategory, sourceVersion: input.sourceVersion,
                ...(previousSourceVersion ? { previousSourceVersion } : {}), versionChangeDetected,
                schemaVersion: input.schemaVersion, licenseOrUsageTerms: source.licenseOrUsageTerms,
                importMethod: input.importMethod, retrievalOrSubmissionDateIso: input.retrievalOrSubmissionDateIso,
                submittedByUid: params.principal.uid, status: 'created', totalExpectedRows: input.totalExpectedRows,
                cursorOffset: 0, processedCount: 0, validStagedCount: 0, duplicateSkippedCount: 0,
                quarantinedInvalidCount: 0, publishedRecordCount: 0, revision: 1, createdAt: nowTs, updatedAt: nowTs,
              };

              tx.set(`ingestionJobs/${jobId}`, job as unknown as Record<string, unknown>);
              tx.update(sourcePath, { latestSourceVersion: input.sourceVersion, latestJobId: jobId, revision: source.revision + 1, updatedAt: nowTs });
              tx.set(`ingestionReconciliationReports/${jobId}`, buildReconciliationReport(job, nowTs.iso) as unknown as Record<string, unknown>);
              return job;
            });
            return { statusCode: 201, body: created };
          },
        });
        return { replayed: outcome.replayed, statusCode: outcome.statusCode, job: outcome.body };
      } catch (err) {
        if (err instanceof CoreApiError) throw err;
        throw new CoreApiError('PERSISTENCE_FAILED', 503, err instanceof Error ? err.message : 'Job creation failed.');
      }
    },

    async ingestRecordsBatch(params: {
      principal: AuthenticatedPrincipal; jobId: string; rawBody: unknown; correlationId: string;
    }): Promise<{ job: StoredIngestionJob; report: IngestionReconciliationReport }> {
      const jobId = validateSafeId(params.jobId, 'jobId');
      await requireAdminPrincipal(params.principal, 'ingestion.ingest_batch', jobId, params.correlationId);

      const validation = validateIngestBatchInput(params.rawBody);
      if (!validation.ok || !validation.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid batch ingestion payload.', validation.issues);
      const input = validation.value;

      return runDurableTransaction(deps.txRunner, { operationName: 'ingestion.ingest_batch', maxAttempts: 3 }, async (tx) => {
        const jobPath = `ingestionJobs/${jobId}`;
        const jobSnap = await tx.get<StoredIngestionJob>(jobPath);
        if (!jobSnap.exists || !jobSnap.data) throw new CoreApiError('NOT_FOUND', 404, `Ingestion job "${jobId}" not found.`);
        const job = jobSnap.data;

        if (job.status !== 'created' && job.status !== 'ingesting' && job.status !== 'interrupted' && job.status !== 'staged_pending_review') {
          throw new CoreApiError('CONFLICT', 409, `Cannot ingest into job in status "${job.status}".`);
        }

        const nowTs = normalizeFirestoreTimestamp(nowFn())!;
        const baseRowIndex = input.startRowIndex ?? 0;

        let cursorOffset = job.cursorOffset;
        let processedCount = job.processedCount;
        let validStagedCount = job.validStagedCount;
        let duplicateSkippedCount = job.duplicateSkippedCount;
        let quarantinedInvalidCount = job.quarantinedInvalidCount;
        let rowsProcessedInThisCall = 0;
        let interruptedMidBatch = false;

        for (let i = 0; i < input.rows.length; i++) {
          const rowIndex = baseRowIndex + i;
          if (rowIndex < cursorOffset) continue;

          if (input.simulateInterruptionAfterRowCount !== undefined && rowsProcessedInThisCall >= input.simulateInterruptionAfterRowCount) {
            interruptedMidBatch = true;
            break;
          }

          const rawRow = input.rows[i];
          const rawPayloadHashSha256 = computeCanonicalHashSha256(rawRow);
          const evalResult = normalizeAndValidateIngestionRow({ dataCategory: job.dataCategory, schemaVersion: job.schemaVersion, rawRow });

          const provenance: RecordProvenanceEnvelope = {
            sourceId: job.sourceId, sourceName: job.sourceName, authorityOrPublisher: job.authorityOrPublisher,
            dataCategory: job.dataCategory, sourceVersion: job.sourceVersion, schemaVersion: job.schemaVersion,
            licenseOrUsageTerms: job.licenseOrUsageTerms, jobId: job.id, importMethod: job.importMethod,
            retrievalOrSubmissionDateIso: job.retrievalOrSubmissionDateIso, rowIndex, rawPayloadHashSha256,
            recordFingerprint: evalResult.recordFingerprint, ingestedByUid: params.principal.uid, ingestedAtIso: nowTs.iso,
          };

          if (!evalResult.valid) {
            const quarantineDoc: StoredQuarantinedRecord = {
              id: `${job.id}_row_${rowIndex}`, jobId: job.id, sourceId: job.sourceId, dataCategory: job.dataCategory,
              rowIndex, quarantineReason: evalResult.quarantineReason, validationIssues: evalResult.issues,
              rawSourceRecord: rawRow, provenance, createdAt: nowTs,
            };
            tx.set(`ingestionQuarantine/${quarantineDoc.id}`, quarantineDoc as unknown as Record<string, unknown>);
            quarantinedInvalidCount += 1;
          } else {
            const dedupKey = `${job.id}_fp_${evalResult.recordFingerprint}`;
            const naturalDedupKey = `${job.id}_nk_${Buffer.from(evalResult.naturalKey).toString('hex')}`;
            const [fpSnap, nkSnap] = await Promise.all([
              tx.get<Record<string, unknown>>(`ingestionDedupIndex/${dedupKey}`),
              tx.get<Record<string, unknown>>(`ingestionDedupIndex/${naturalDedupKey}`),
            ]);

            if (fpSnap.exists || nkSnap.exists) {
              duplicateSkippedCount += 1;
            } else {
              const stagedDoc: StoredStagedRecord = {
                id: `${job.id}_row_${rowIndex}`, jobId: job.id, sourceId: job.sourceId, dataCategory: job.dataCategory,
                rowIndex, naturalKey: evalResult.naturalKey, recordFingerprint: evalResult.recordFingerprint,
                rawSourceRecord: rawRow, normalizedRecord: evalResult.normalizedRecord, provenance, published: false, createdAt: nowTs,
              };
              tx.set(`ingestionStaging/${stagedDoc.id}`, stagedDoc as unknown as Record<string, unknown>);
              tx.set(`ingestionDedupIndex/${dedupKey}`, { jobId: job.id, rowIndex, naturalKey: evalResult.naturalKey });
              tx.set(`ingestionDedupIndex/${naturalDedupKey}`, { jobId: job.id, rowIndex, fingerprint: evalResult.recordFingerprint });
              validStagedCount += 1;
            }
          }

          processedCount += 1;
          cursorOffset = rowIndex + 1;
          rowsProcessedInThisCall += 1;
        }

        const nextStatus: StoredIngestionJob['status'] = interruptedMidBatch
          ? 'interrupted'
          : processedCount >= job.totalExpectedRows ? 'staged_pending_review' : 'ingesting';

        const updatedJob: StoredIngestionJob = {
          ...job, status: nextStatus, cursorOffset, processedCount, validStagedCount,
          duplicateSkippedCount, quarantinedInvalidCount, revision: job.revision + 1, updatedAt: nowTs,
          ...(interruptedMidBatch ? { failureReason: 'Job interrupted mid-batch; resumable from cursorOffset.' } : {}),
        };

        const report = buildReconciliationReport(updatedJob, nowTs.iso);
        tx.set(jobPath, updatedJob as unknown as Record<string, unknown>);
        tx.set(`ingestionReconciliationReports/${jobId}`, report as unknown as Record<string, unknown>);
        return { job: updatedJob, report };
      });
    },

    async ingestStructuredFile(params: {
      principal: AuthenticatedPrincipal; jobId: string; rawBody: unknown; correlationId: string;
    }): Promise<{ job: StoredIngestionJob; report: IngestionReconciliationReport }> {
      const parsed = parseStructuredFileInput(params.rawBody);
      if (!parsed.ok || !parsed.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Malformed structured file payload.', parsed.issues);
      return this.ingestRecordsBatch({ principal: params.principal, jobId: params.jobId, rawBody: parsed.value, correlationId: params.correlationId });
    },

    async moderateImportJob(params: {
      principal: AuthenticatedPrincipal; jobId: string; rawBody: unknown; correlationId: string;
    }): Promise<{ job: StoredIngestionJob; report: IngestionReconciliationReport }> {
      const jobId = validateSafeId(params.jobId, 'jobId');
      await requireAdminPrincipal(params.principal, 'ingestion.moderate_job', jobId, params.correlationId);

      const validation = validateModerateJobInput(params.rawBody);
      if (!validation.ok || !validation.value) throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid moderation input.', validation.issues);
      const input = validation.value;

      return runDurableTransaction(deps.txRunner, { operationName: 'ingestion.moderate_job', maxAttempts: 3 }, async (tx) => {
        const jobPath = `ingestionJobs/${jobId}`;
        const jobSnap = await tx.get<StoredIngestionJob>(jobPath);
        if (!jobSnap.exists || !jobSnap.data) throw new CoreApiError('NOT_FOUND', 404, `Ingestion job "${jobId}" not found.`);
        const job = jobSnap.data;

        if (input.expectedRevision !== undefined && job.revision !== input.expectedRevision) {
          throw new CoreApiError('CONFLICT', 409, `Stale revision: stored ${job.revision}, expected ${input.expectedRevision}.`);
        }
        if (job.status !== 'staged_pending_review') {
          throw new CoreApiError('CONFLICT', 409, `Only jobs in "staged_pending_review" can be moderated (current: "${job.status}").`);
        }
        if (input.decision === 'approve' && job.validStagedCount === 0) {
          throw new CoreApiError('CONFLICT', 409, 'Cannot approve an import job with zero valid staged records.');
        }

        const nowTs = normalizeFirestoreTimestamp(nowFn())!;
        const updatedJob: StoredIngestionJob = {
          ...job, status: input.decision === 'approve' ? 'approved_for_publication' : 'rejected',
          revision: job.revision + 1, updatedAt: nowTs,
          ...(input.decision === 'approve' ? { approvedByUid: params.principal.uid, approvedAt: nowTs } : {}),
          ...(input.decision === 'reject' ? { rejectionReason: input.rejectionReason } : {}),
        };

        const report = buildReconciliationReport(updatedJob, nowTs.iso);
        tx.set(jobPath, updatedJob as unknown as Record<string, unknown>);
        tx.set(`ingestionReconciliationReports/${jobId}`, report as unknown as Record<string, unknown>);
        return { job: updatedJob, report };
      });
    },

    async publishApprovedJob(params: {
      principal: AuthenticatedPrincipal; jobId: string; idempotencyKey: string; correlationId: string;
    }): Promise<{ replayed: boolean; job: StoredIngestionJob; report: IngestionReconciliationReport }> {
      const jobId = validateSafeId(params.jobId, 'jobId');
      await requireAdminPrincipal(params.principal, 'ingestion.publish_job', jobId, params.correlationId);

      if (!deps.destinationPublisher || typeof deps.destinationPublisher.publishApprovedRecords !== 'function') {
        throw new CoreApiError('PERSISTENCE_FAILED', 503, 'Destination domain publisher adapter is not configured (fail-closed).');
      }

      const outcome = await executeIdempotentMutation<{ job: StoredIngestionJob; report: IngestionReconciliationReport }>({
        store: idempotencyStore, actorUid: params.principal.uid, operation: 'ingestion.publish_job',
        idempotencyKey: params.idempotencyKey, requestPayload: { jobId }, nowEpochMs: nowFn(),
        mutationFn: async () => {
          const result = await runDurableTransaction(deps.txRunner, { operationName: 'ingestion.publish_job', maxAttempts: 3 }, async (tx) => {
            const jobPath = `ingestionJobs/${jobId}`;
            const jobSnap = await tx.get<StoredIngestionJob>(jobPath);
            if (!jobSnap.exists || !jobSnap.data) throw new CoreApiError('NOT_FOUND', 404, `Ingestion job "${jobId}" not found.`);
            const job = jobSnap.data;

            if (job.status !== 'approved_for_publication') {
              throw new CoreApiError('CONFLICT', 409, `Unapproved or unvalidated job cannot be published (current status: "${job.status}").`);
            }

            const nowTs = normalizeFirestoreTimestamp(nowFn())!;
            const stagedToPublish: Array<{
              rowIndex: number; naturalKey: string; normalizedRecord: Record<string, unknown>; provenance: RecordProvenanceEnvelope;
            }> = [];

            for (let rowIdx = 0; rowIdx < job.cursorOffset; rowIdx++) {
              const stagedPath = `ingestionStaging/${job.id}_row_${rowIdx}`;
              const stagedSnap = await tx.get<StoredStagedRecord>(stagedPath);
              if (stagedSnap.exists && stagedSnap.data) {
                const s = stagedSnap.data;
                const enrichedProvenance: RecordProvenanceEnvelope = {
                  ...s.provenance, approvedByUid: job.approvedByUid, approvedAtIso: job.approvedAt?.iso,
                };
                stagedToPublish.push({ rowIndex: s.rowIndex, naturalKey: s.naturalKey, normalizedRecord: s.normalizedRecord, provenance: enrichedProvenance });
                tx.update(stagedPath, { published: true, publishedAtIso: nowTs.iso, provenance: enrichedProvenance });
              }
            }

            const pubResult = await deps.destinationPublisher!.publishApprovedRecords({
              jobId: job.id, sourceId: job.sourceId, dataCategory: job.dataCategory,
              sourceVersion: job.sourceVersion, schemaVersion: job.schemaVersion, records: stagedToPublish,
            });

            const updatedJob: StoredIngestionJob = {
              ...job, status: 'published', publishedRecordCount: pubResult.acceptedCount,
              publishedAt: nowTs, revision: job.revision + 1, updatedAt: nowTs,
            };
            const report = buildReconciliationReport(updatedJob, nowTs.iso);
            tx.set(jobPath, updatedJob as unknown as Record<string, unknown>);
            tx.set(`ingestionReconciliationReports/${jobId}`, report as unknown as Record<string, unknown>);
            return { job: updatedJob, report };
          });
          return { statusCode: 200, body: result };
        },
      });
      return { replayed: outcome.replayed, job: outcome.body.job, report: outcome.body.report };
    },

    async getReconciliationReport(params: {
      principal: AuthenticatedPrincipal; jobId: string; correlationId: string;
    }): Promise<IngestionReconciliationReport> {
      const jobId = validateSafeId(params.jobId, 'jobId');
      const authz = await authorizePrincipal(params.principal, { minimumRole: 'delegated_admin' }, deps.adminStore, deps.primaryAdminEmails);
      if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');

      return runDurableTransaction(deps.txRunner, { operationName: 'ingestion.get_reconciliation', maxAttempts: 2 }, async (tx) => {
        const snap = await tx.get<IngestionReconciliationReport>(`ingestionReconciliationReports/${jobId}`);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, `Reconciliation report for job "${jobId}" not found.`);
        return snap.data;
      });
    },
  };
}
