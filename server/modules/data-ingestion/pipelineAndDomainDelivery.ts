/**
 * Employee 17 — External Data Ingestion Pipeline, Quarantine Review, Lineage & Domain Delivery Service
 * (`server/modules/data-ingestion/pipelineAndDomainDelivery.ts`)
 *
 * Exclusive ownership: `server/modules/data-ingestion/`
 */

import crypto from 'crypto';
import {
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
  normalizeFirestoreTimestamp,
  runDurableTransaction,
  verifyAdminOrDelegatedPrincipal,
  type AuthenticatedPrincipal,
} from '../core';
import {
  ConnectorExecutionError,
  createStandardExternalConnector,
  redactSecrets,
  redactSecretsFromObject,
  validateSafeExternalUrl,
  type HttpFetchAdapter,
} from './connectorsAndSecurity';
import {
  evaluateDatasetBatchQualityAndNormalize,
  type ExistingRecordIndexEntry,
} from './schemaQualityAndNormalization';
import type {
  DatasetValidationSummary,
  DataLineageRecord,
  DownstreamDeliveryPayloadItem,
  DownstreamDeliveryReceipt,
  Employee17DataIngestionDependencies,
  Employee17ImportType,
  Employee17JobState,
  ExternalDatasetCatalogEntry,
  ExternalDataSourceRecord,
  IngestionDomainEvent,
  IngestionDomainEventType,
  IngestionErrorClassification,
  IngestionJobRecord,
  JobStateTransitionEntry,
  QuarantineReviewRecord,
  QuarantineReviewState,
  RawImportSnapshotMetadata,
  SyncCheckpointRecord,
} from './ingestionContracts';

function appendState(
  history: readonly JobStateTransitionEntry[],
  fromState: Employee17JobState | null,
  toState: Employee17JobState,
  timestampIso: string,
  note?: string,
): JobStateTransitionEntry[] {
  return [...history, { fromState, toState, timestampIso, ...(note ? { note } : {}) }];
}

export function createExternalDataIngestionEngine(
  deps: Employee17DataIngestionDependencies & { fetchAdapter?: HttpFetchAdapter },
) {
  const idempotencyStore = deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());
  const defaultConnector = createStandardExternalConnector({
    fetchAdapter: deps.fetchAdapter,
    secretManager: deps.secretManager,
    nowFn,
  });

  async function requireAdmin(principal: AuthenticatedPrincipal) {
    const decision = await verifyAdminOrDelegatedPrincipal(principal, deps.adminStore, {
      primaryAdminEmails: deps.primaryAdminEmails,
      disallowStaticToken: true,
    });
    if (!decision.allowed) {
      throw new CoreApiError('FORBIDDEN', decision.status, decision.reason ?? 'Admin privileges required.');
    }
  }

  async function emitEvent(
    eventType: IngestionDomainEventType,
    correlationId: string,
    sourceId: string,
    extra: { datasetId?: string; jobId?: string; metadata?: Record<string, unknown> } = {},
  ) {
    if (!deps.eventPublisher) return;
    const event: IngestionDomainEvent = {
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType,
      eventVersion: '1.0',
      timestampIso: new Date(nowFn()).toISOString(),
      correlationId,
      sourceId,
      ...(extra.datasetId ? { datasetId: extra.datasetId } : {}),
      ...(extra.jobId ? { jobId: extra.jobId } : {}),
      metadata: redactSecretsFromObject(extra.metadata ?? {}),
    };
    await deps.eventPublisher.publishEvent(event);
  }

  async function deliverToOwningDomain(params: {
    jobId: string;
    sourceId: string;
    dataset: ExternalDatasetCatalogEntry;
    dataVersion: string;
    items: readonly DownstreamDeliveryPayloadItem[];
    correlationId: string;
  }): Promise<DownstreamDeliveryReceipt | null> {
    const { jobId, sourceId, dataset, dataVersion, items, correlationId } = params;
    if (dataset.targetDomain === 'staging_only' || items.length === 0) return null;

    await emitEvent('DatasetDeliveryRequested', correlationId, sourceId, {
      datasetId: dataset.datasetId,
      jobId,
      metadata: { targetDomain: dataset.targetDomain, recordCount: items.length },
    });

    try {
      let receipt: DownstreamDeliveryReceipt | null = null;
      if (dataset.targetDomain === 'geography' && deps.geographyDelivery) {
        receipt = await deps.geographyDelivery.deliverValidatedGeographicRecords({
          jobId, sourceId, datasetId: dataset.datasetId, dataVersion, records: items,
        });
      } else if (dataset.targetDomain === 'crowd_data' && deps.crowdDataDelivery) {
        receipt = await deps.crowdDataDelivery.deliverExternalMarketObservations({
          jobId, sourceId, datasetId: dataset.datasetId, dataVersion, records: items,
        });
      } else if (dataset.targetDomain === 'valuation' && deps.valuationDelivery) {
        receipt = await deps.valuationDelivery.deliverAggregateMarketIndicators({
          jobId, sourceId, datasetId: dataset.datasetId, dataVersion, records: items,
        });
      } else {
        return null;
      }

      await emitEvent('DatasetDeliveryCompleted', correlationId, sourceId, {
        datasetId: dataset.datasetId,
        jobId,
        metadata: {
          targetDomain: dataset.targetDomain,
          acceptedCount: receipt.acceptedCount,
          rejectedCount: receipt.rejectedCount,
          deliveryAttemptId: receipt.deliveryAttemptId,
        },
      });
      return receipt;
    } catch (err) {
      const msg = redactSecrets(err instanceof Error ? err.message : 'Downstream delivery failed');
      await emitEvent('DatasetDeliveryFailed', correlationId, sourceId, {
        datasetId: dataset.datasetId,
        jobId,
        metadata: { targetDomain: dataset.targetDomain, reason: msg },
      });
      throw new ConnectorExecutionError({
        classification: 'DOWNSTREAM_DELIVERY_FAILURE',
        message: `Destination module (${dataset.targetDomain}) rejected delivery: ${msg}`,
        statusCode: 502,
        retryable: true,
      });
    }
  }

  return {
    /** 1. Register an external data source in the Source Registry. */
    async registerSource(params: {
      principal: AuthenticatedPrincipal;
      correlationId: string;
      input: Omit<
        ExternalDataSourceRecord,
        | 'sourceOwnerUid'
        | 'sourceOwnerEmail'
        | 'reliabilityClassification'
        | 'historicalImportSuccessCount'
        | 'historicalImportFailureCount'
        | 'revision'
        | 'createdAt'
        | 'updatedAt'
      > & { reliabilityClassification?: ExternalDataSourceRecord['reliabilityClassification'] };
    }): Promise<ExternalDataSourceRecord> {
      await requireAdmin(params.principal);
      const { input, correlationId } = params;

      if (!/^[a-zA-Z0-9_-]{3,80}$/.test(input.sourceId)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid sourceId format.');
      }
      if (!input.sourceName || input.sourceName.trim().length < 3 || !input.sourceOrganization || input.sourceOrganization.trim().length < 2) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'sourceName and sourceOrganization are required.');
      }
      if (input.legalAndTechnicalBasisApproved !== true || !input.dataLicenseOrUsageTerms || input.dataLicenseOrUsageTerms.trim().length < 3) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Approved legal/technical basis and explicit data license terms are mandatory.');
      }
      if (!input.verificationBasis || input.verificationBasis.trim().length < 5) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Explicit verificationBasis is required; source authority is never assumed from name or URL.');
      }
      if (input.officialWebsiteOrApiRef) {
        const urlCheck = validateSafeExternalUrl(input.officialWebsiteOrApiRef, input.allowedHosts);
        if (!urlCheck.ok) {
          throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid officialWebsiteOrApiRef: ${urlCheck.reason}`);
        }
      }
      if (input.authenticationRequirements.authType !== 'none' && !input.authenticationRequirements.credentialSecretRef) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'credentialSecretRef is required when authType is not "none".');
      }

      const nowTs = normalizeFirestoreTimestamp(nowFn())!;
      const record = await runDurableTransaction(deps.txRunner, { operationName: 'e17.register_source', maxAttempts: 3 }, async (tx) => {
        const path = `e17IngestionSources/${input.sourceId}`;
        const existing = await tx.get<ExternalDataSourceRecord>(path);
        if (existing.exists) {
          throw new CoreApiError('CONFLICT', 409, `Source "${input.sourceId}" is already registered.`);
        }
        const doc: ExternalDataSourceRecord = {
          ...input,
          sourceOwnerUid: params.principal.uid,
          sourceOwnerEmail: params.principal.email,
          reliabilityClassification: input.reliabilityClassification ?? 'unverified_newly_registered',
          historicalImportSuccessCount: 0,
          historicalImportFailureCount: 0,
          revision: 1,
          createdAt: nowTs,
          updatedAt: nowTs,
        };
        tx.set(path, doc as unknown as Record<string, unknown>);
        return doc;
      });

      await emitEvent('DataSourceRegistered', correlationId, record.sourceId, {
        metadata: { sourceCategory: record.sourceCategory, verificationStatus: record.verificationStatus },
      });
      return record;
    },

    /** 2. Update an existing source configuration. */
    async updateSourceConfig(params: {
      principal: AuthenticatedPrincipal;
      sourceId: string;
      updates: Partial<
        Pick<
          ExternalDataSourceRecord,
          | 'activeStatus'
          | 'verificationStatus'
          | 'verificationBasis'
          | 'reliabilityClassification'
          | 'allowedHosts'
          | 'rateLimitMaxRequestsPerMinute'
          | 'timeoutMs'
          | 'knownCoverageGaps'
        >
      >;
    }): Promise<ExternalDataSourceRecord> {
      await requireAdmin(params.principal);
      const nowTs = normalizeFirestoreTimestamp(nowFn())!;
      return runDurableTransaction(deps.txRunner, { operationName: 'e17.update_source', maxAttempts: 3 }, async (tx) => {
        const path = `e17IngestionSources/${params.sourceId}`;
        const snap = await tx.get<ExternalDataSourceRecord>(path);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, `Source "${params.sourceId}" not found.`);
        const updated: ExternalDataSourceRecord = {
          ...snap.data,
          ...params.updates,
          revision: snap.data.revision + 1,
          updatedAt: nowTs,
        };
        tx.set(path, updated as unknown as Record<string, unknown>);
        return updated;
      });
    },

    /** 3. Register a dataset in the Dataset Catalog. */
    async registerDataset(params: {
      principal: AuthenticatedPrincipal;
      correlationId: string;
      input: Omit<ExternalDatasetCatalogEntry, 'revision' | 'createdAt' | 'updatedAt'>;
    }): Promise<ExternalDatasetCatalogEntry> {
      await requireAdmin(params.principal);
      const { input, correlationId } = params;
      if (!/^[a-zA-Z0-9_-]{3,80}$/.test(input.datasetId)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid datasetId format.');
      }

      const nowTs = normalizeFirestoreTimestamp(nowFn())!;
      const dataset = await runDurableTransaction(deps.txRunner, { operationName: 'e17.register_dataset', maxAttempts: 3 }, async (tx) => {
        const srcPath = `e17IngestionSources/${input.sourceId}`;
        const srcSnap = await tx.get<ExternalDataSourceRecord>(srcPath);
        if (!srcSnap.exists || !srcSnap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Parent source "${input.sourceId}" not found.`);
        }
        const dsPath = `e17DatasetCatalog/${input.datasetId}`;
        const existing = await tx.get<ExternalDatasetCatalogEntry>(dsPath);
        if (existing.exists) {
          throw new CoreApiError('CONFLICT', 409, `Dataset "${input.datasetId}" already exists.`);
        }
        const doc: ExternalDatasetCatalogEntry = {
          ...input,
          revision: 1,
          createdAt: nowTs,
          updatedAt: nowTs,
        };
        tx.set(dsPath, doc as unknown as Record<string, unknown>);
        const updatedDatasetIds = Array.from(new Set([...srcSnap.data.availableDatasetIds, input.datasetId]));
        tx.update(srcPath, { availableDatasetIds: updatedDatasetIds, revision: srcSnap.data.revision + 1, updatedAt: nowTs });
        return doc;
      });

      await emitEvent('DatasetRegistered', correlationId, dataset.sourceId, {
        datasetId: dataset.datasetId,
        metadata: { datasetCategory: dataset.datasetCategory, schemaVersion: dataset.schemaVersion },
      });
      return dataset;
    },

    /** 4. Inspect source status and reliability/freshness metadata without exposing secrets. */
    async inspectSourceStatus(params: {
      principal: AuthenticatedPrincipal;
      sourceId: string;
    }) {
      await requireAdmin(params.principal);
      return runDurableTransaction(deps.txRunner, { operationName: 'e17.inspect_source', maxAttempts: 2 }, async (tx) => {
        const snap = await tx.get<ExternalDataSourceRecord>(`e17IngestionSources/${params.sourceId}`);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, `Source "${params.sourceId}" not found.`);
        const src = snap.data;
        const totalRuns = src.historicalImportSuccessCount + src.historicalImportFailureCount;
        const historicalSuccessRate = totalRuns > 0 ? Math.round((src.historicalImportSuccessCount / totalRuns) * 10000) / 10000 : null;
        return {
          source: {
            ...src,
            authenticationRequirements: {
              authType: src.authenticationRequirements.authType,
              headerName: src.authenticationRequirements.headerName,
              credentialConfigured: Boolean(src.authenticationRequirements.credentialSecretRef),
            },
          },
          reliabilityAndFreshness: {
            verificationStatus: src.verificationStatus,
            verificationBasis: src.verificationBasis,
            reliabilityClassification: src.reliabilityClassification,
            historicalImportSuccessRate: historicalSuccessRate,
            historicalImportSuccessCount: src.historicalImportSuccessCount,
            historicalImportFailureCount: src.historicalImportFailureCount,
            averageDataDelayMs: src.averageDataDelayMs ?? null,
            lastSuccessfulSyncIso: src.lastSuccessfulSyncIso ?? null,
            lastFailedSyncIso: src.lastFailedSyncIso ?? null,
            lastDataPublicationTimestampIso: src.lastDataPublicationTimestampIso ?? null,
            lastSchemaChangeIso: src.lastSchemaChangeIso ?? null,
            knownCoverageGaps: src.knownCoverageGaps,
          },
        };
      });
    },

    /** 5 & 8. Start an import job (or dry-run import) with full lifecycle, raw snapshot preservation, validation, quarantine, lineage, and delivery. */
    async startImport(params: {
      principal: AuthenticatedPrincipal;
      correlationId: string;
      sourceId: string;
      datasetId: string;
      importType: Employee17ImportType;
      dataVersion: string;
      requestedSchemaVersion?: string;
      endpointUrl?: string;
      rawFileContent?: string;
      manualRecords?: readonly Record<string, unknown>[];
      isDryRun?: boolean;
      maxRetries?: number;
    }): Promise<{
      job: IngestionJobRecord;
      validationSummary?: DatasetValidationSummary;
      snapshot?: RawImportSnapshotMetadata;
      deliveryReceipt?: DownstreamDeliveryReceipt | null;
    }> {
      await requireAdmin(params.principal);
      const isDryRun = params.isDryRun === true || params.importType === 'dry_run_import';
      const nowEpochMs = nowFn();
      const nowTs = normalizeFirestoreTimestamp(nowEpochMs)!;
      const jobId = `e17job_${params.sourceId}_${params.datasetId}_${crypto.randomBytes(4).toString('hex')}`;

      // 1. Validate source & dataset, check duplicate active job lock, and create job record
      const { source, dataset, existingCheckpoint } = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'e17.create_job', maxAttempts: 3 },
        async (tx) => {
          const srcSnap = await tx.get<ExternalDataSourceRecord>(`e17IngestionSources/${params.sourceId}`);
          if (!srcSnap.exists || !srcSnap.data) throw new CoreApiError('NOT_FOUND', 404, `Source "${params.sourceId}" not found.`);
          const src = srcSnap.data;
          if (src.activeStatus !== 'active' || !src.legalAndTechnicalBasisApproved || src.verificationStatus === 'revoked') {
            throw new CoreApiError('FORBIDDEN', 403, `Source "${params.sourceId}" is inactive, unapproved, or revoked.`);
          }

          const dsSnap = await tx.get<ExternalDatasetCatalogEntry>(`e17DatasetCatalog/${params.datasetId}`);
          if (!dsSnap.exists || !dsSnap.data || dsSnap.data.sourceId !== params.sourceId) {
            throw new CoreApiError('NOT_FOUND', 404, `Dataset "${params.datasetId}" not found for source "${params.sourceId}".`);
          }
          const ds = dsSnap.data;
          if (ds.datasetStatus !== 'active') {
            throw new CoreApiError('FORBIDDEN', 403, `Dataset "${params.datasetId}" is not active.`);
          }

          const activeLockPath = `e17ActiveJobLocks/${params.sourceId}__${params.datasetId}`;
          const lockSnap = await tx.get<{ activeJobId: string }>(activeLockPath);
          if (lockSnap.exists && lockSnap.data?.activeJobId) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `Duplicate concurrent import prevented: active job "${lockSnap.data.activeJobId}" is already running for dataset "${params.datasetId}".`,
            );
          }

          const cpSnap = await tx.get<SyncCheckpointRecord>(`e17SyncCheckpoints/${params.sourceId}__${params.datasetId}`);
          const history = appendState([], null, 'Created', nowTs.iso, 'Job initialized');
          const queuedHistory = appendState(history, 'Created', 'Queued', nowTs.iso);

          const initialJob: IngestionJobRecord = {
            jobId,
            sourceId: src.sourceId,
            datasetId: ds.datasetId,
            importType: params.importType,
            startTimestampIso: nowTs.iso,
            currentState: 'Queued',
            stateHistory: queuedHistory,
            recordsRetrieved: 0,
            recordsValidated: 0,
            recordsRejected: 0,
            recordsQuarantined: 0,
            recordsDuplicateSkipped: 0,
            recordsDelivered: 0,
            retryCount: 0,
            maxRetries: params.maxRetries ?? 3,
            retryable: false,
            errorClassification: 'NONE',
            dataVersion: params.dataVersion,
            schemaVersion: params.requestedSchemaVersion ?? ds.schemaVersion,
            transformationVersion: ds.schemaContract.transformationVersion,
            checkpointReference: cpSnap.data?.checkpointId,
            isDryRun,
            initiatedByUid: params.principal.uid,
            revision: 1,
            createdAt: nowTs,
            updatedAt: nowTs,
          };

          tx.set(`e17IngestionJobs/${jobId}`, initialJob as unknown as Record<string, unknown>);
          tx.set(activeLockPath, { activeJobId: jobId, lockedAtIso: nowTs.iso });
          return { source: src, dataset: ds, existingCheckpoint: cpSnap.data };
        },
      );

      await emitEvent('IngestionJobCreated', params.correlationId, source.sourceId, {
        datasetId: dataset.datasetId,
        jobId,
        metadata: { importType: params.importType, isDryRun },
      });

      const activeLockPath = `e17ActiveJobLocks/${source.sourceId}__${dataset.datasetId}`;

      try {
        await emitEvent('IngestionJobStarted', params.correlationId, source.sourceId, {
          datasetId: dataset.datasetId,
          jobId,
        });

        // 2. Acquire data through connector (Fetching stage)
        const connector =
          deps.customConnectors?.find((c) => c.supportedSourceTypes.includes(source.sourceType)) ?? defaultConnector;

        const fetchRes = await connector.acquireData({
          source,
          dataset,
          endpointUrl: params.endpointUrl,
          rawFileContent: params.rawFileContent,
          manualRecords: params.manualRecords,
          checkpointCursor: existingCheckpoint?.cursorToken,
          timeoutMs: source.timeoutMs || 10_000,
        });

        // 3. Preserve Raw Snapshot (Section 9)
        const snapshotId = `snap_${jobId}`;
        let storageReference = `unconfigured_object_storage://${source.sourceId}/${dataset.datasetId}/${snapshotId}`;
        let integrityStatus: RawImportSnapshotMetadata['integrityStatus'] = 'verified_sha256';

        if (deps.snapshotStorage && !isDryRun) {
          const stored = await deps.snapshotStorage.storeRawSnapshotBytes({
            snapshotId,
            sourceId: source.sourceId,
            datasetId: dataset.datasetId,
            jobId,
            format: dataset.dataFormat,
            rawPayloadText: fetchRes.rawPayloadText,
            expectedSha256: fetchRes.contentChecksumSha256,
          });
          storageReference = stored.storageReference;
          integrityStatus = stored.verifiedSha256 === fetchRes.contentChecksumSha256 ? 'verified_sha256' : 'checksum_mismatch';
          if (integrityStatus === 'checksum_mismatch') {
            throw new ConnectorExecutionError({
              classification: 'STORAGE_OR_PERSISTENCE_FAILURE',
              message: 'Raw snapshot SHA-256 checksum mismatch after storage write.',
              statusCode: 500,
              retryable: true,
            });
          }
        }

        const snapshotMeta: RawImportSnapshotMetadata = {
          snapshotId,
          sourceId: source.sourceId,
          datasetId: dataset.datasetId,
          jobId,
          retrievalTimestampIso: fetchRes.retrievedAtIso,
          sourceReportedVersion: fetchRes.sourceReportedVersion ?? params.dataVersion,
          sourcePublishedAtIso: fetchRes.sourcePublishedAtIso,
          originalFormat: dataset.dataFormat,
          recordCount: fetchRes.parsedRecords.length,
          contentChecksumSha256: fetchRes.contentChecksumSha256,
          byteLength: fetchRes.rawByteLength,
          storageReference,
          dataLicense: source.dataLicenseOrUsageTerms,
          integrityStatus,
          createdAt: normalizeFirestoreTimestamp(nowFn())!,
        };

        // 4. Load existing natural key index for source-aware deduplication
        const existingIndexMap = new Map<string, ExistingRecordIndexEntry[]>();
        await runDurableTransaction(deps.txRunner, { operationName: 'e17.load_dedup', maxAttempts: 2 }, async (tx) => {
          const idxSnap = await tx.get<{ entries: Record<string, ExistingRecordIndexEntry[]> }>('e17GlobalDedupIndex/registry');
          if (idxSnap.exists && idxSnap.data?.entries) {
            for (const [nk, list] of Object.entries(idxSnap.data.entries)) {
              existingIndexMap.set(nk, list);
            }
          }
        });

        // 5. Validate, normalize, and evaluate quality (Validating & Transforming stages)
        const reportId = `val_${jobId}`;
        const requestedSchemaVersion = params.requestedSchemaVersion ?? dataset.schemaVersion;
        const { outcomes, summary } = evaluateDatasetBatchQualityAndNormalize({
          reportId,
          jobId,
          sourceId: source.sourceId,
          datasetId: dataset.datasetId,
          dataVersion: params.dataVersion,
          requestedSchemaVersion,
          contract: dataset.schemaContract,
          qualityRules: dataset.qualityRules,
          freshnessMaxAgeHours: dataset.freshnessMaxAgeHours,
          rawRecords: fetchRes.parsedRecords,
          malformedRowErrors: fetchRes.malformedRowErrors,
          existingRecordsByNaturalKey: existingIndexMap,
          geographyValidator: deps.geographyValidator,
          nowEpochMs: nowFn(),
        });

        if (summary.schemaEvolution.schemaChanged) {
          await emitEvent('DatasetSchemaChanged', params.correlationId, source.sourceId, {
            datasetId: dataset.datasetId,
            jobId,
            metadata: { schemaEvolution: summary.schemaEvolution },
          });
        }

        await emitEvent('DatasetValidated', params.correlationId, source.sourceId, {
          datasetId: dataset.datasetId,
          jobId,
          metadata: {
            validRecords: summary.validRecords,
            invalidRecords: summary.invalidRecords,
            duplicateRecords: summary.duplicateRecords,
          },
        });

        const quarantinedOutcomes = outcomes.filter((o) => o.quarantined);
        if (quarantinedOutcomes.length > 0) {
          await emitEvent('RecordsQuarantined', params.correlationId, source.sourceId, {
            datasetId: dataset.datasetId,
            jobId,
            metadata: { quarantinedCount: quarantinedOutcomes.length },
          });
        }

        // Prepare valid items for downstream delivery
        const validOutcomes = outcomes.filter((o) => o.validForDelivery);
        const deliveryItems: DownstreamDeliveryPayloadItem[] = validOutcomes.map((o) => ({
          lineageId: `lin_${jobId}_${o.rowIndex}`,
          sourceRecordId: o.sourceRecordId,
          naturalKey: o.naturalKey,
          normalizedRecord: o.normalizedRecord,
          rawPayloadHashSha256: o.rawPayloadHashSha256,
          sourceId: source.sourceId,
          datasetId: dataset.datasetId,
          dataVersion: params.dataVersion,
          schemaVersion: dataset.schemaVersion,
          transformationVersion: dataset.schemaContract.transformationVersion,
          publishedBySourceAtIso: fetchRes.sourcePublishedAtIso,
          retrievedAtIso: fetchRes.retrievedAtIso,
          validatedAtIso: summary.validatedAtIso,
        }));

        // 6. Deliver to destination module if not dry-run and not gated by manual approval
        let deliveryReceipt: DownstreamDeliveryReceipt | null = null;
        if (!isDryRun && !dataset.requiresManualApprovalGate && deliveryItems.length > 0) {
          deliveryReceipt = await deliverToOwningDomain({
            jobId,
            sourceId: source.sourceId,
            dataset,
            dataVersion: params.dataVersion,
            items: deliveryItems,
            correlationId: params.correlationId,
          });
        }

        // 7. Determine terminal or staged job state (Never mark Completed merely on HTTP 200!)
        const deliveredCount = deliveryReceipt ? deliveryReceipt.acceptedCount : 0;
        let finalState: Employee17JobState;
        if (isDryRun) {
          finalState = summary.invalidRecords > 0 && summary.validRecords > 0
            ? 'Partially_Completed'
            : summary.validRecords === 0 && summary.invalidRecords > 0
              ? 'Failed'
              : 'Completed';
        } else if (dataset.requiresManualApprovalGate && summary.validRecords > 0) {
          finalState = 'Awaiting_Approval';
        } else if (summary.validRecords === 0 && summary.invalidRecords > 0) {
          finalState = 'Failed';
        } else if (summary.invalidRecords > 0 || (deliveryReceipt && deliveryReceipt.rejectedCount > 0)) {
          finalState = 'Partially_Completed';
        } else {
          finalState = 'Completed';
        }

        // 8. Persist all artifacts, quarantine records, lineage, checkpoints, and source metrics atomically
        const doneTs = normalizeFirestoreTimestamp(nowFn())!;
        const completedJob = await runDurableTransaction(
          deps.txRunner,
          { operationName: 'e17.finalize_job', maxAttempts: 3 },
          async (tx) => {
            const jobSnap = await tx.get<IngestionJobRecord>(`e17IngestionJobs/${jobId}`);
            const currentJob = jobSnap.data!;
            let h = appendState(currentJob.stateHistory, currentJob.currentState, 'Running', doneTs.iso);
            h = appendState(h, 'Running', 'Fetching', doneTs.iso);
            h = appendState(h, 'Fetching', 'Validating', doneTs.iso);
            h = appendState(h, 'Validating', 'Transforming', doneTs.iso);
            h = appendState(h, 'Transforming', finalState, doneTs.iso);

            if (!isDryRun) {
              tx.set(`e17RawSnapshots/${snapshotId}`, snapshotMeta as unknown as Record<string, unknown>);
              tx.set(`e17ValidationReports/${reportId}`, summary as unknown as Record<string, unknown>);

              for (const q of quarantinedOutcomes) {
                const qDoc: QuarantineReviewRecord = {
                  quarantineId: `${jobId}_q_${q.rowIndex}`,
                  jobId,
                  sourceId: source.sourceId,
                  datasetId: dataset.datasetId,
                  rawSnapshotId: snapshotId,
                  rowIndex: q.rowIndex,
                  sourceRecordId: q.sourceRecordId,
                  reasonCode: q.quarantineReason ?? 'INVALID_SCHEMA_RECORD',
                  validationErrors: q.validationIssues,
                  rawSourceRecord: q.rawSourceRecord,
                  candidateNormalizedRecord: q.normalizedRecord,
                  reviewStatus: 'Pending_Review',
                  createdAt: doneTs,
                  updatedAt: doneTs,
                };
                tx.set(`e17Quarantine/${qDoc.quarantineId}`, qDoc as unknown as Record<string, unknown>);
              }

              // Persist staged valid records, lineage, and update global dedup index
              const dedupDoc: Record<string, ExistingRecordIndexEntry[]> = {};
              for (const [k, v] of existingIndexMap.entries()) dedupDoc[k] = [...v];

              for (const v of validOutcomes) {
                const lineageId = `lin_${jobId}_${v.rowIndex}`;
                const priorSources = (dedupDoc[v.naturalKey] ?? []).map((e) => e.sourceId);
                const contributingSources = Array.from(new Set([...priorSources, source.sourceId]));
                const lineage: DataLineageRecord = {
                  lineageId,
                  sourceId: source.sourceId,
                  datasetId: dataset.datasetId,
                  jobId,
                  sourceRecordId: v.sourceRecordId,
                  naturalKey: v.naturalKey,
                  rawSnapshotId: snapshotId,
                  rawPayloadHashSha256: v.rawPayloadHashSha256,
                  normalizedRecordFingerprint: v.recordFingerprint,
                  schemaVersion: dataset.schemaVersion,
                  transformationVersion: dataset.schemaContract.transformationVersion,
                  validationReportId: reportId,
                  destinationModule: dataset.targetDomain,
                  deliveryAttemptId: deliveryReceipt?.deliveryAttemptId,
                  deliveryAccepted: Boolean(deliveryReceipt && deliveryReceipt.acceptedCount > 0),
                  contributingSources,
                  lineageComplete: Boolean(snapshotId && reportId),
                  createdAtIso: doneTs.iso,
                };
                tx.set(`e17Lineage/${lineageId}`, lineage as unknown as Record<string, unknown>);
                tx.set(`e17StagedRecords/${jobId}_row_${v.rowIndex}`, {
                  jobId,
                  rowIndex: v.rowIndex,
                  lineageId,
                  sourceRecordId: v.sourceRecordId,
                  naturalKey: v.naturalKey,
                  normalizedRecord: v.normalizedRecord,
                  rawSourceRecord: v.rawSourceRecord,
                  rawPayloadHashSha256: v.rawPayloadHashSha256,
                  delivered: lineage.deliveryAccepted,
                });

                const list = dedupDoc[v.naturalKey] ?? [];
                const filtered = list.filter((e) => !(e.sourceId === source.sourceId && e.datasetId === dataset.datasetId));
                filtered.push({
                  sourceId: source.sourceId,
                  datasetId: dataset.datasetId,
                  naturalKey: v.naturalKey,
                  recordFingerprint: v.recordFingerprint,
                  dataVersion: params.dataVersion,
                });
                dedupDoc[v.naturalKey] = filtered;
              }
              tx.set('e17GlobalDedupIndex/registry', { entries: dedupDoc });

              // Advance sync checkpoint ONLY if Completed or Partially_Completed with valid records
              if ((finalState === 'Completed' || finalState === 'Partially_Completed') && summary.validRecords > 0) {
                const cpId = `${source.sourceId}__${dataset.datasetId}`;
                const cpRecord: SyncCheckpointRecord = {
                  checkpointId: cpId,
                  sourceId: source.sourceId,
                  datasetId: dataset.datasetId,
                  lastSuccessfulJobId: jobId,
                  lastSourceVersion: params.dataVersion,
                  cursorToken: fetchRes.nextCheckpointCursor ?? existingCheckpoint?.cursorToken,
                  lastProcessedTimestampIso: doneTs.iso,
                  recordsSyncedCumulative: (existingCheckpoint?.recordsSyncedCumulative ?? 0) + summary.validRecords,
                  updatedAt: doneTs,
                };
                tx.set(`e17SyncCheckpoints/${cpId}`, cpRecord as unknown as Record<string, unknown>);
              }

              // Update source & dataset telemetry
              const delayMs = fetchRes.sourcePublishedAtIso
                ? Math.max(0, Date.parse(fetchRes.retrievedAtIso) - Date.parse(fetchRes.sourcePublishedAtIso))
                : undefined;
              tx.update(`e17IngestionSources/${source.sourceId}`, {
                ...(finalState === 'Failed'
                  ? {
                      lastFailedSyncIso: doneTs.iso,
                      historicalImportFailureCount: source.historicalImportFailureCount + 1,
                    }
                  : {
                      lastSuccessfulSyncIso: doneTs.iso,
                      historicalImportSuccessCount: source.historicalImportSuccessCount + 1,
                    }),
                ...(fetchRes.sourcePublishedAtIso ? { lastDataPublicationTimestampIso: fetchRes.sourcePublishedAtIso } : {}),
                ...(delayMs !== undefined && Number.isFinite(delayMs) ? { averageDataDelayMs: delayMs } : {}),
                ...(summary.schemaEvolution.schemaChanged ? { lastSchemaChangeIso: doneTs.iso } : {}),
                updatedAt: doneTs,
              });

              tx.update(`e17DatasetCatalog/${dataset.datasetId}`, {
                ...(finalState !== 'Failed' ? { lastSuccessfulImportIso: doneTs.iso } : {}),
                lastValidationSummary: summary,
                updatedAt: doneTs,
              });
            }

            const updatedJob: IngestionJobRecord = {
              ...currentJob,
              currentState: finalState,
              stateHistory: h,
              completionTimestampIso: finalState === 'Awaiting_Approval' ? undefined : doneTs.iso,
              recordsRetrieved: summary.totalRecords,
              recordsValidated: summary.validRecords,
              recordsRejected: summary.invalidRecords,
              recordsQuarantined: quarantinedOutcomes.length,
              recordsDuplicateSkipped: summary.duplicateRecords,
              recordsDelivered: deliveredCount,
              errorClassification: finalState === 'Failed' ? 'SCHEMA_INCOMPATIBLE' : 'NONE',
              errorMessage: finalState === 'Failed' ? 'All retrieved records failed schema/quality validation.' : undefined,
              retryable: false,
              rawSnapshotId: snapshotId,
              validationReportId: reportId,
              checkpointReference: `${source.sourceId}__${dataset.datasetId}`,
              revision: currentJob.revision + 1,
              updatedAt: doneTs,
            };

            tx.set(`e17IngestionJobs/${jobId}`, updatedJob as unknown as Record<string, unknown>);
            tx.delete(activeLockPath);
            return updatedJob;
          },
        );

        if (completedJob.currentState === 'Completed') {
          await emitEvent('IngestionJobCompleted', params.correlationId, source.sourceId, {
            datasetId: dataset.datasetId,
            jobId,
            metadata: { recordsDelivered: completedJob.recordsDelivered },
          });
          if (!isDryRun) {
            await emitEvent('SourceCheckpointAdvanced', params.correlationId, source.sourceId, {
              datasetId: dataset.datasetId,
              jobId,
              metadata: { dataVersion: params.dataVersion },
            });
          }
        } else if (completedJob.currentState === 'Partially_Completed') {
          await emitEvent('IngestionJobPartiallyCompleted', params.correlationId, source.sourceId, {
            datasetId: dataset.datasetId,
            jobId,
            metadata: {
              recordsValidated: completedJob.recordsValidated,
              recordsQuarantined: completedJob.recordsQuarantined,
            },
          });
        } else if (completedJob.currentState === 'Failed') {
          await emitEvent('IngestionJobFailed', params.correlationId, source.sourceId, {
            datasetId: dataset.datasetId,
            jobId,
            metadata: { errorClassification: completedJob.errorClassification },
          });
        }

        return { job: completedJob, validationSummary: summary, snapshot: snapshotMeta, deliveryReceipt };
      } catch (err) {
        const failTs = normalizeFirestoreTimestamp(nowFn())!;
        const classification: IngestionErrorClassification =
          err instanceof ConnectorExecutionError ? err.classification : 'STORAGE_OR_PERSISTENCE_FAILURE';
        const retryable = err instanceof ConnectorExecutionError ? err.retryable : false;
        const safeErrorMsg = redactSecrets(err instanceof Error ? err.message : 'Import execution failed');

        const failedJob = await runDurableTransaction(
          deps.txRunner,
          { operationName: 'e17.fail_job', maxAttempts: 3 },
          async (tx) => {
            const jobSnap = await tx.get<IngestionJobRecord>(`e17IngestionJobs/${jobId}`);
            const currentJob = jobSnap.data!;
            const nextRetryDelayMs = retryable
              ? (err instanceof ConnectorExecutionError && err.retryAfterMs
                  ? err.retryAfterMs
                  : Math.min(60_000, 1000 * Math.pow(2, currentJob.retryCount)))
              : undefined;
            const updated: IngestionJobRecord = {
              ...currentJob,
              currentState: 'Failed',
              stateHistory: appendState(currentJob.stateHistory, currentJob.currentState, 'Failed', failTs.iso, safeErrorMsg),
              completionTimestampIso: failTs.iso,
              errorClassification: classification,
              errorMessage: safeErrorMsg,
              retryable,
              nextRetryDelayMs,
              revision: currentJob.revision + 1,
              updatedAt: failTs,
            };
            tx.set(`e17IngestionJobs/${jobId}`, updated as unknown as Record<string, unknown>);
            tx.delete(activeLockPath);
            tx.update(`e17IngestionSources/${source.sourceId}`, {
              lastFailedSyncIso: failTs.iso,
              historicalImportFailureCount: source.historicalImportFailureCount + 1,
              updatedAt: failTs,
            });
            return updated;
          },
        );

        await emitEvent('IngestionJobFailed', params.correlationId, source.sourceId, {
          datasetId: dataset.datasetId,
          jobId,
          metadata: { errorClassification: classification, errorMessage: safeErrorMsg, retryable },
        });

        return { job: failedJob };
      }
    },

    /** 6. Cancel an import job safely. */
    async cancelImport(params: {
      principal: AuthenticatedPrincipal;
      jobId: string;
      reason: string;
    }): Promise<IngestionJobRecord> {
      await requireAdmin(params.principal);
      const nowTs = normalizeFirestoreTimestamp(nowFn())!;
      return runDurableTransaction(deps.txRunner, { operationName: 'e17.cancel_job', maxAttempts: 3 }, async (tx) => {
        const path = `e17IngestionJobs/${params.jobId}`;
        const snap = await tx.get<IngestionJobRecord>(path);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, `Job "${params.jobId}" not found.`);
        const job = snap.data;
        if (job.currentState === 'Completed' || job.currentState === 'Cancelled') {
          throw new CoreApiError('CONFLICT', 409, `Cannot cancel job in state "${job.currentState}".`);
        }
        const cancelled: IngestionJobRecord = {
          ...job,
          currentState: 'Cancelled',
          stateHistory: appendState(job.stateHistory, job.currentState, 'Cancelled', nowTs.iso, params.reason),
          completionTimestampIso: nowTs.iso,
          errorClassification: 'CANCELLED_BY_ADMIN',
          errorMessage: params.reason,
          retryable: false,
          revision: job.revision + 1,
          updatedAt: nowTs,
        };
        tx.set(path, cancelled as unknown as Record<string, unknown>);
        tx.delete(`e17ActiveJobLocks/${job.sourceId}__${job.datasetId}`);
        return cancelled;
      });
    },

    /** 7. Retry a failed retryable import job with bounded retry count. */
    async retryFailedImport(params: {
      principal: AuthenticatedPrincipal;
      correlationId: string;
      jobId: string;
      endpointUrl?: string;
      rawFileContent?: string;
    }) {
      await requireAdmin(params.principal);
      const existing = await runDurableTransaction(deps.txRunner, { operationName: 'e17.check_retry', maxAttempts: 2 }, async (tx) => {
        const snap = await tx.get<IngestionJobRecord>(`e17IngestionJobs/${params.jobId}`);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, `Job "${params.jobId}" not found.`);
        const job = snap.data;
        if (job.currentState !== 'Failed') {
          throw new CoreApiError('CONFLICT', 409, `Only Failed jobs can be retried (current: "${job.currentState}").`);
        }
        if (!job.retryable) {
          throw new CoreApiError(
            'CONFLICT',
            409,
            `Permanent failure (${job.errorClassification}) is not eligible for automatic retry.`,
          );
        }
        if (job.retryCount >= job.maxRetries) {
          throw new CoreApiError('CONFLICT', 409, `Maximum retry limit (${job.maxRetries}) reached for job "${params.jobId}".`);
        }
        tx.update(`e17IngestionJobs/${params.jobId}`, { retryCount: job.retryCount + 1 });
        return job;
      });

      return this.startImport({
        principal: params.principal,
        correlationId: params.correlationId,
        sourceId: existing.sourceId,
        datasetId: existing.datasetId,
        importType: 'retryable_import',
        dataVersion: existing.dataVersion,
        requestedSchemaVersion: existing.schemaVersion,
        endpointUrl: params.endpointUrl,
        rawFileContent: params.rawFileContent,
        maxRetries: existing.maxRetries,
      });
    },

    /** 8. Reprocess an existing stored raw snapshot with integrity verification. */
    async reprocessSnapshot(params: {
      principal: AuthenticatedPrincipal;
      correlationId: string;
      snapshotId: string;
    }) {
      await requireAdmin(params.principal);
      if (!deps.snapshotStorage) {
        throw new CoreApiError('PERSISTENCE_FAILED', 503, 'RawSnapshotStorageAdapter is required for snapshot reprocessing.');
      }
      const snapMeta = await runDurableTransaction(deps.txRunner, { operationName: 'e17.read_snap', maxAttempts: 2 }, async (tx) => {
        const s = await tx.get<RawImportSnapshotMetadata>(`e17RawSnapshots/${params.snapshotId}`);
        if (!s.exists || !s.data) throw new CoreApiError('NOT_FOUND', 404, `Snapshot "${params.snapshotId}" not found.`);
        return s.data;
      });

      const rawBytes = await deps.snapshotStorage.readRawSnapshotBytes(snapMeta.storageReference);
      if (!rawBytes || rawBytes.actualSha256 !== snapMeta.contentChecksumSha256) {
        throw new CoreApiError('CONFLICT', 409, 'Snapshot checksum verification failed; refusing to reprocess corrupted snapshot.');
      }

      return this.startImport({
        principal: params.principal,
        correlationId: params.correlationId,
        sourceId: snapMeta.sourceId,
        datasetId: snapMeta.datasetId,
        importType: 'snapshot_reprocessing',
        dataVersion: snapMeta.sourceReportedVersion ?? 'reprocessed',
        rawFileContent: rawBytes.rawPayloadText,
      });
    },

    /** 9. Review and resolve a quarantined record (`Pending_Review -> Approved | Rejected | Needs_Correction | Reprocessed | Archived`). */
    async reviewQuarantinedRecord(params: {
      principal: AuthenticatedPrincipal;
      quarantineId: string;
      decision: QuarantineReviewState;
      resolutionNote: string;
      correctedRecord?: Record<string, unknown>;
    }): Promise<QuarantineReviewRecord> {
      await requireAdmin(params.principal);
      const nowTs = normalizeFirestoreTimestamp(nowFn())!;
      return runDurableTransaction(deps.txRunner, { operationName: 'e17.review_quarantine', maxAttempts: 3 }, async (tx) => {
        const path = `e17Quarantine/${params.quarantineId}`;
        const snap = await tx.get<QuarantineReviewRecord>(path);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, `Quarantine record "${params.quarantineId}" not found.`);
        const updated: QuarantineReviewRecord = {
          ...snap.data,
          reviewStatus: params.decision,
          reviewerUid: params.principal.uid,
          reviewedAtIso: nowTs.iso,
          resolutionNote: params.resolutionNote,
          ...(params.correctedRecord ? { candidateNormalizedRecord: params.correctedRecord } : {}),
          updatedAt: nowTs,
        };
        tx.set(path, updated as unknown as Record<string, unknown>);
        return updated;
      });
    },

    /** 10. Inspect job, validation report, lineage, or synchronization checkpoint. */
    async inspectGovernanceArtifacts(params: {
      principal: AuthenticatedPrincipal;
      jobId?: string;
      reportId?: string;
      lineageId?: string;
      checkpointId?: string;
    }) {
      await requireAdmin(params.principal);
      return runDurableTransaction(deps.txRunner, { operationName: 'e17.inspect_artifacts', maxAttempts: 2 }, async (tx) => {
        const job = params.jobId ? (await tx.get<IngestionJobRecord>(`e17IngestionJobs/${params.jobId}`)).data ?? null : null;
        const report = params.reportId ? (await tx.get<DatasetValidationSummary>(`e17ValidationReports/${params.reportId}`)).data ?? null : null;
        const lineage = params.lineageId ? (await tx.get<DataLineageRecord>(`e17Lineage/${params.lineageId}`)).data ?? null : null;
        const checkpoint = params.checkpointId ? (await tx.get<SyncCheckpointRecord>(`e17SyncCheckpoints/${params.checkpointId}`)).data ?? null : null;
        return { job, report, lineage, checkpoint };
      });
    },
  };
}
