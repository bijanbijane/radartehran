/**
 * RT-INFRA-010 — Non-destructive media / object-storage orphan reconciliation (report only).
 */
import type { StoredObjectRecord } from '../../../src/utils/serverObjectStorageHelpers';
import { STORED_OBJECT_METADATA_SCHEMA } from '../../../src/utils/serverObjectStorageMetadataRegistry';
import {
  classifyMediaObjectMetadataDocument,
  projectStoredObjectAsMediaReadModel,
} from './mediaObjectRegistryConvergence';
import type { MediaMetadataPersistenceStore } from './metadataStore';
import type { MediaByteStorageProvider, MediaMetadataRecord } from './types';

export interface MediaRegistryReconciliationIssue {
  code:
    | 'R2_BYTES_WITHOUT_FIRESTORE_METADATA'
    | 'FIRESTORE_METADATA_MISSING_R2_BYTES'
    | 'PENDING_DELETE_INCOMPLETE'
    | 'DUPLICATE_SCHEMA_ON_SAME_DOC'
    | 'STORED_OBJECT_WITHOUT_MEDIA_NATIVE'
    | 'MEDIA_NATIVE_WITHOUT_BYTES'
    | 'SCHEMA_UNKNOWN_IN_REGISTRY';
  objectId?: string;
  internalObjectKey?: string;
  detail: string;
  eligibleForAutomaticCleanup: false;
}

export interface MediaMetadataReconciliationReport {
  generatedAtIso: string;
  mediaNativeRecordCount: number;
  storedObjectRecordCount: number;
  byteStorageKeyCount: number;
  issues: MediaRegistryReconciliationIssue[];
}

export async function buildMediaMetadataReconciliationReport(
  metadataStore: MediaMetadataPersistenceStore,
  byteStorage: MediaByteStorageProvider,
  options?: {
    storedObjectRecords?: StoredObjectRecord[];
    firestoreDocClassifiers?: Array<{ objectId: string; data: Record<string, unknown> }>;
  },
): Promise<MediaMetadataReconciliationReport> {
  const mediaRecords = await metadataStore.listAllMetadataRecords();
  const mediaById = new Map(mediaRecords.map((m) => [m.objectId, m]));
  const storedById = new Map((options?.storedObjectRecords ?? []).map((r) => [r.id, r]));
  const byteKeys = new Set(await byteStorage.listStoredObjectKeys());

  const issues: MediaRegistryReconciliationIssue[] = [];
  const keysAccounted = new Set<string>();

  for (const meta of mediaRecords) {
    if (meta.state === 'DELETED') continue;
    keysAccounted.add(meta.internalObjectKey);
    if (meta.state === 'PENDING_DELETE') {
      issues.push({
        code: 'PENDING_DELETE_INCOMPLETE',
        objectId: meta.objectId,
        internalObjectKey: meta.internalObjectKey,
        detail: `Media object ${meta.objectId} is PENDING_DELETE (retry-safe cleanup may be required).`,
        eligibleForAutomaticCleanup: false,
      });
    }
    if (!byteKeys.has(meta.internalObjectKey)) {
      issues.push({
        code: 'MEDIA_NATIVE_WITHOUT_BYTES',
        objectId: meta.objectId,
        internalObjectKey: meta.internalObjectKey,
        detail: `Firestore media metadata references missing byte storage key.`,
        eligibleForAutomaticCleanup: false,
      });
    }
  }

  for (const stored of storedById.values()) {
    if (!mediaById.has(stored.id)) {
      const projection = projectStoredObjectAsMediaReadModel(stored);
      issues.push({
        code: 'STORED_OBJECT_WITHOUT_MEDIA_NATIVE',
        objectId: stored.id,
        internalObjectKey: stored.localFileName,
        detail: `Object-storage record ${stored.id} has no media_metadata_native_v1 projection (expected when only listing API used). projectedState=${projection.state}`,
        eligibleForAutomaticCleanup: false,
      });
    }
    if (stored.localFileName && !byteKeys.has(stored.localFileName)) {
      issues.push({
        code: 'FIRESTORE_METADATA_MISSING_R2_BYTES',
        objectId: stored.id,
        internalObjectKey: stored.localFileName,
        detail: `StoredObjectRecord references missing remote/local key ${stored.localFileName}.`,
        eligibleForAutomaticCleanup: false,
      });
    }
  }

  for (const key of byteKeys) {
    if (!keysAccounted.has(key)) {
      const linkedMeta = mediaRecords.find((m) => m.internalObjectKey === key && m.state !== 'DELETED');
      const linkedStored = [...storedById.values()].find((s) => s.localFileName === key);
      if (!linkedMeta && !linkedStored) {
        issues.push({
          code: 'R2_BYTES_WITHOUT_FIRESTORE_METADATA',
          internalObjectKey: key,
          detail: `Byte storage key has no media or stored-object metadata reference.`,
          eligibleForAutomaticCleanup: false,
        });
      }
    }
  }

  for (const row of options?.firestoreDocClassifiers ?? []) {
    const kind = classifyMediaObjectMetadataDocument(row.data);
    if (kind === 'unknown') {
      issues.push({
        code: 'SCHEMA_UNKNOWN_IN_REGISTRY',
        objectId: row.objectId,
        detail: `Document ${row.objectId} in media_object_metadata_v2 has unrecognized schema.`,
        eligibleForAutomaticCleanup: false,
      });
    }
    if (
      kind === STORED_OBJECT_METADATA_SCHEMA &&
      mediaById.has(row.objectId) &&
      !storedById.has(row.objectId)
    ) {
      issues.push({
        code: 'DUPLICATE_SCHEMA_ON_SAME_DOC',
        objectId: row.objectId,
        detail: `In-memory media metadata exists while Firestore doc ${row.objectId} is stored_object_record_v1 (convergence review recommended).`,
        eligibleForAutomaticCleanup: false,
      });
    }
  }

  return {
    generatedAtIso: new Date().toISOString(),
    mediaNativeRecordCount: mediaRecords.filter((m) => m.state !== 'DELETED').length,
    storedObjectRecordCount: storedById.size,
    byteStorageKeyCount: byteKeys.size,
    issues,
  };
}

export function mergeReconciliationMediaHydration(
  memoryRecords: MediaMetadataRecord[],
  hydrated: MediaMetadataRecord[],
): MediaMetadataRecord[] {
  const byId = new Map<string, MediaMetadataRecord>();
  for (const r of memoryRecords) byId.set(r.objectId, r);
  for (const r of hydrated) {
    const cur = byId.get(r.objectId);
    if (!cur || cur.revision < r.revision) byId.set(r.objectId, r);
  }
  return [...byId.values()];
}