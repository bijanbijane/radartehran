/**
 * RT-INFRA-010 — Shared Firestore collection `media_object_metadata_v2` hosts two schema projections.
 *
 * - `stored_object_record_v1` — object-storage listing API (`StoredObjectRecord`)
 * - `media_metadata_native_v1` — media module API (`MediaMetadataRecord`)
 *
 * Same collection; doc id is object id. Schemas must not overwrite each other (enforced on write).
 */
import type { StoredObjectRecord } from '../../../src/utils/serverObjectStorageHelpers';
import {
  STORED_OBJECT_METADATA_SCHEMA,
  type StoredObjectMetadataDocument,
} from '../../../src/utils/serverObjectStorageMetadataRegistry';
import { MEDIA_METADATA_NATIVE_SCHEMA, parseMediaMetadataDocument } from './firestoreMetadataAuthority';
import type { MediaMetadataRecord } from './types';

export type MediaRegistryDocKind =
  | typeof STORED_OBJECT_METADATA_SCHEMA
  | typeof MEDIA_METADATA_NATIVE_SCHEMA
  | 'legacy_untyped'
  | 'unknown';

export function classifyMediaObjectMetadataDocument(data: Record<string, unknown> | undefined): MediaRegistryDocKind {
  if (!data) return 'unknown';
  if (data.schemaVersion === STORED_OBJECT_METADATA_SCHEMA) return STORED_OBJECT_METADATA_SCHEMA;
  if (data.schemaVersion === MEDIA_METADATA_NATIVE_SCHEMA) return MEDIA_METADATA_NATIVE_SCHEMA;
  if (parseMediaMetadataDocument(data)) return 'legacy_untyped';
  return 'unknown';
}

/**
 * Read-only projection when only object-storage metadata exists for a listing media object id.
 * Does not mutate registry; used for reconciliation reporting only.
 */
export function projectStoredObjectAsMediaReadModel(stored: StoredObjectRecord): Partial<MediaMetadataRecord> & {
  objectId: string;
  projectedFrom: typeof STORED_OBJECT_METADATA_SCHEMA;
} {
  return {
    objectId: stored.id,
    projectedFrom: STORED_OBJECT_METADATA_SCHEMA,
    ownerUid: stored.ownerUid ?? 'unknown',
    sizeBytes: stored.sizeBytes ?? 0,
    sha256: stored.sha256 ?? '',
    mimeType: stored.mimeType ?? 'application/octet-stream',
    mediaType: stored.mimeType?.startsWith('video/') ? 'video' : 'image',
    state: stored.deletionState === 'pending_delete' ? 'PENDING_DELETE' : 'ACTIVE',
  };
}

export function storedObjectEnvelope(record: StoredObjectRecord): StoredObjectMetadataDocument {
  return {
    schemaVersion: STORED_OBJECT_METADATA_SCHEMA,
    record,
    updatedAtIso: new Date().toISOString(),
  };
}