/**
 * RT-INFRA-011 — Database-independent metadata repository contracts (no Firestore SDK types).
 *
 * Target durable store per Firestore removal workstream: Cloudflare D1 (`media_objects`, migration 0003).
 * Transitional adapter: legacy Firestore documents (no new collections).
 */
import type { StoredObjectRecord } from '../../../../src/utils/serverObjectStorageHelpers';

export type MetadataRepositoryBackendId = 'memory' | 'firestore_legacy' | 'd1';

export interface MetadataPageResult<T> {
  items: T[];
  nextCursor: string | null;
  pageSize: number;
  partial: boolean;
}

export interface RepositoryHealthResult {
  ok: boolean;
  backend: MetadataRepositoryBackendId;
  code?: string;
  message?: string;
}

export interface ObjectStorageMetadataRepository {
  verifyAvailable(): Promise<RepositoryHealthResult>;
  getById(objectId: string): Promise<StoredObjectRecord | null>;
  upsert(record: StoredObjectRecord): Promise<void>;
  deleteById(objectId: string): Promise<void>;
  listPage(options?: { cursor?: string; limit?: number }): Promise<MetadataPageResult<StoredObjectRecord>>;
}

export interface MediaMetadataRevisionRecord {
  readonly objectId: string;
  readonly revision: number;
  readonly ownerUid: string;
  readonly sha256: string;
  readonly state: string;
  readonly updatedAtIso: string;
}

/** Remote durable projection for MediaMetadataRecord envelopes (grants + cleanup use sibling methods on adapter). */
export interface MediaMetadataRepository {
  verifyAvailable(): Promise<RepositoryHealthResult>;
  getById(objectId: string): Promise<Record<string, unknown> | null>;
  upsertNativeRecord(record: Record<string, unknown>): Promise<void>;
  deleteById(objectId: string): Promise<void>;
  listPage(options?: { cursor?: string; limit?: number }): Promise<MetadataPageResult<MediaMetadataRevisionRecord>>;
  warmFirstPage?(limit: number): Promise<MetadataPageResult<MediaMetadataRevisionRecord>>;
}