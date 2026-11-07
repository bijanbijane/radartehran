/**
 * @fileoverview Orphan-File Detection & Durable Resumable Cleanup Engine
 * (`server/modules/media/orphanAndCleanupEngine.ts`).
 *
 * Implements:
 * 7. Orphan-file detection interfaces (`detectOrphanMediaObjects`)
 * 9. Durable cleanup jobs (`createDurableCleanupJob`, `executeCleanupJobBatch`, `retryFailedCleanupJobItems`)
 * 10. Retryable and idempotent media operations across interrupted cleanup runs.
 */

import { assertMediaAdminActor, type MediaMetadataPersistenceStore } from './metadataStore';
import {
  type ActiveEntityReferenceSnapshot,
  type DurableCleanupJobItemState,
  type DurableCleanupJobStatus,
  type DurableMediaCleanupJob,
  type MediaActorContext,
  type MediaByteStorageProvider,
  MediaDomainError,
  type OrphanDetectionReport,
  type OrphanMediaClassification,
  type OrphanMediaInspectionItem,
} from './types';

export const DEFAULT_UNATTACHED_GRACE_WINDOW_MS = 2 * 60 * 60 * 1000;

export class MediaOrphanAndCleanupEngine {
  private readonly metadataStore: MediaMetadataPersistenceStore;
  private readonly byteStorage: MediaByteStorageProvider;

  constructor(
    metadataStore: MediaMetadataPersistenceStore,
    byteStorage: MediaByteStorageProvider
  ) {
    this.metadataStore = metadataStore;
    this.byteStorage = byteStorage;
  }

  /**
   * Scans both Firestore metadata records and raw byte-storage keys to detect:
   * - Stale Bargain/Sponsor associations where the parent entity was deleted
   * - Expired unattached uploads beyond the grace window
   * - Interrupted `PENDING_DELETE` records
   * - Dangling storage bytes without metadata (or left behind after metadata deletion)
   * - Active metadata records whose underlying storage bytes are missing
   */
  public async detectOrphanMediaObjects(
    actorInput: MediaActorContext | null | undefined,
    references: ActiveEntityReferenceSnapshot,
    options?: { unattachedGraceWindowMs?: number; nowMs?: number }
  ): Promise<OrphanDetectionReport> {
    assertMediaAdminActor(actorInput);
    const nowMs = options?.nowMs ?? Date.now();
    const graceWindowMs = options?.unattachedGraceWindowMs ?? DEFAULT_UNATTACHED_GRACE_WINDOW_MS;

    const allMetadata = await this.metadataStore.listAllMetadataRecords();
    const storedKeys = new Set(await this.byteStorage.listStoredObjectKeys());
    const accountedStorageKeys = new Set<string>();

    const counts: Record<OrphanMediaClassification, number> = {
      REFERENCED_ACTIVE: 0,
      UNATTACHED_WITHIN_GRACE_WINDOW: 0,
      ORPHAN_UNATTACHED_EXPIRED: 0,
      ORPHAN_STALE_TARGET_DELETED: 0,
      DANGLING_STORAGE_BYTES_WITHOUT_METADATA: 0,
      MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA: 0,
      PENDING_DELETE_INTERRUPTED: 0,
    };

    const items: OrphanMediaInspectionItem[] = [];

    for (const meta of allMetadata) {
      if (meta.state === 'DELETED') {
        continue;
      }
      accountedStorageKeys.add(meta.internalObjectKey);
      const hasBytes = storedKeys.has(meta.internalObjectKey);

      if (meta.state === 'PENDING_DELETE') {
        counts.PENDING_DELETE_INTERRUPTED++;
        items.push({
          objectId: meta.objectId,
          internalObjectKey: meta.internalObjectKey,
          classification: 'PENDING_DELETE_INTERRUPTED',
          state: meta.state,
          eligibleForCleanup: true,
        });
        continue;
      }

      if (!hasBytes) {
        counts.MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA++;
        items.push({
          objectId: meta.objectId,
          internalObjectKey: meta.internalObjectKey,
          classification: 'MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA',
          state: meta.state,
          eligibleForCleanup: false,
        });
        continue;
      }

      if (meta.association.targetType === 'BARGAIN' && meta.association.targetId) {
        const bargainActive =
          references.activeBargainIds.has(meta.association.targetId) ||
          references.referencedMediaObjectIds.has(meta.objectId);
        const classification: OrphanMediaClassification = bargainActive
          ? 'REFERENCED_ACTIVE'
          : 'ORPHAN_STALE_TARGET_DELETED';
        counts[classification]++;
        items.push({
          objectId: meta.objectId,
          internalObjectKey: meta.internalObjectKey,
          classification,
          state: meta.state,
          eligibleForCleanup: !bargainActive,
        });
        continue;
      }

      if (meta.association.targetType === 'SPONSOR' && meta.association.targetId) {
        const sponsorActive =
          references.activeSponsorIds.has(meta.association.targetId) ||
          references.referencedMediaObjectIds.has(meta.objectId);
        const classification: OrphanMediaClassification = sponsorActive
          ? 'REFERENCED_ACTIVE'
          : 'ORPHAN_STALE_TARGET_DELETED';
        counts[classification]++;
        items.push({
          objectId: meta.objectId,
          internalObjectKey: meta.internalObjectKey,
          classification,
          state: meta.state,
          eligibleForCleanup: !sponsorActive,
        });
        continue;
      }

      // Unattached media object
      const createdMs = Date.parse(meta.createdAtIso);
      const isWithinGrace = Number.isFinite(createdMs) && nowMs - createdMs <= graceWindowMs;
      const classification: OrphanMediaClassification = isWithinGrace
        ? 'UNATTACHED_WITHIN_GRACE_WINDOW'
        : 'ORPHAN_UNATTACHED_EXPIRED';
      counts[classification]++;
      items.push({
        objectId: meta.objectId,
        internalObjectKey: meta.internalObjectKey,
        classification,
        state: meta.state,
        eligibleForCleanup: !isWithinGrace,
      });
    }

    // Check for dangling raw storage keys with no active/pending metadata
    for (const rawKey of storedKeys) {
      if (accountedStorageKeys.has(rawKey)) continue;
      counts.DANGLING_STORAGE_BYTES_WITHOUT_METADATA++;
      items.push({
        objectId: null,
        internalObjectKey: rawKey,
        classification: 'DANGLING_STORAGE_BYTES_WITHOUT_METADATA',
        state: 'NO_METADATA',
        eligibleForCleanup: true,
      });
    }

    return {
      evaluatedAtIso: new Date(nowMs).toISOString(),
      totalMetadataScanned: allMetadata.length,
      totalStorageKeysScanned: storedKeys.size,
      counts,
      items,
    };
  }

  /**
   * Creates a durable, checkpointed cleanup job from an orphan detection report.
   */
  public async createDurableCleanupJob(
    actorInput: MediaActorContext | null | undefined,
    report: OrphanDetectionReport,
    nowMs = Date.now()
  ): Promise<DurableMediaCleanupJob> {
    const admin = assertMediaAdminActor(actorInput);
    const nowIso = new Date(nowMs).toISOString();
    const eligibleItems: DurableCleanupJobItemState[] = report.items
      .filter((item) => item.eligibleForCleanup)
      .map((item) => ({
        objectId: item.objectId,
        internalObjectKey: item.internalObjectKey,
        classification: item.classification,
        outcome: 'PENDING',
        attempts: 0,
      }));

    const job: DurableMediaCleanupJob = {
      jobId: `mcleanup_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      createdByUid: admin.uid,
      status: eligibleItems.length === 0 ? 'COMPLETED' : 'PENDING',
      cursorIndex: 0,
      items: eligibleItems,
      deletedCount: 0,
      failedCount: 0,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      completedAtIso: eligibleItems.length === 0 ? nowIso : undefined,
      revision: 1,
    };

    return this.metadataStore.saveCleanupJob(job);
  }

  /**
   * Executes up to `maxBatchSize` items of a durable cleanup job, persisting checkpoints
   * after each step so interrupted jobs can be resumed idempotently.
   */
  public async executeCleanupJobBatch(
    actorInput: MediaActorContext | null | undefined,
    jobId: string,
    maxBatchSize = 10,
    nowMs = Date.now()
  ): Promise<DurableMediaCleanupJob> {
    assertMediaAdminActor(actorInput);
    let job = await this.metadataStore.getCleanupJob(jobId);
    if (!job) {
      throw new MediaDomainError('OBJECT_NOT_FOUND', `Cleanup job '${jobId}' not found.`, 404);
    }
    if (job.status === 'COMPLETED') {
      return job;
    }

    const nowIso = new Date(nowMs).toISOString();
    const items = job.items.map((item) => ({ ...item }));
    let processedInBatch = 0;

    for (let idx = 0; idx < items.length && processedInBatch < maxBatchSize; idx++) {
      const item = items[idx];
      if (item.outcome === 'DELETED' || item.outcome === 'SKIPPED_ACTIVE') {
        continue;
      }

      processedInBatch++;
      item.attempts += 1;

      try {
        if (item.objectId) {
          const meta = await this.metadataStore.getMetadataRecord(item.objectId);
          if (meta && meta.state !== 'DELETED' && meta.state !== 'PENDING_DELETE') {
            await this.metadataStore.updateMetadataAtomically(item.objectId, undefined, (curr) => ({
              ...curr,
              state: 'PENDING_DELETE',
              deletionAttemptCount: curr.deletionAttemptCount + 1,
              updatedAtIso: nowIso,
              revision: curr.revision + 1,
            }));
          }
        }

        await this.byteStorage.deleteObjectBytes(item.internalObjectKey);

        if (item.objectId) {
          const meta = await this.metadataStore.getMetadataRecord(item.objectId);
          if (meta && meta.state !== 'DELETED') {
            await this.metadataStore.updateMetadataAtomically(item.objectId, undefined, (curr) => ({
              ...curr,
              state: 'DELETED',
              byteStorageVerified: false,
              lastDeleteError: undefined,
              deletedAtIso: nowIso,
              updatedAtIso: nowIso,
              revision: curr.revision + 1,
            }));
          }
        }

        item.outcome = 'DELETED';
        item.lastError = undefined;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        item.outcome = 'FAILED_RETRYABLE';
        item.lastError = errMsg;
      }

      const deletedCount = items.filter((i) => i.outcome === 'DELETED').length;
      const failedCount = items.filter((i) => i.outcome === 'FAILED_RETRYABLE').length;
      const pendingCount = items.filter((i) => i.outcome === 'PENDING').length;

      const nextStatus: DurableCleanupJobStatus =
        pendingCount > 0
          ? 'IN_PROGRESS'
          : failedCount > 0
            ? 'PARTIAL_RETRYABLE'
            : 'COMPLETED';

      job = await this.metadataStore.saveCleanupJob({
        ...job,
        status: nextStatus,
        cursorIndex: idx + 1,
        items,
        deletedCount,
        failedCount,
        updatedAtIso: nowIso,
        completedAtIso: nextStatus === 'COMPLETED' ? nowIso : undefined,
        revision: job.revision + 1,
      });
    }

    return job;
  }
}
