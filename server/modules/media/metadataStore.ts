/**
 * @fileoverview Durable Metadata & Cleanup Job Persistence Store (`server/modules/media/metadataStore.ts`).
 *
 * Enforces:
 * 1. Firestore metadata documents (`MediaMetadataRecord`) NEVER store raw object bytes, Base64 blobs, or credentials.
 * 2. Atomic Compare-And-Swap (`revision` CAS) and per-document lock serialization.
 * 3. Sanitized public projection (`toPublicMediaDescriptor`) hiding unrestricted internal object keys and credentials.
 */

import fs from 'node:fs';
import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  type DurableMediaCleanupJob,
  type MediaActorContext,
  MediaDomainError,
  type MediaMetadataRecord,
  type MediaUploadGrant,
  type PublicMediaObjectDescriptor,
} from './types';

export const MEDIA_METADATA_COLLECTION = 'media_object_metadata_v2';
export const MEDIA_UPLOAD_GRANTS_COLLECTION = 'media_upload_grants_v2';
export const MEDIA_CLEANUP_JOBS_COLLECTION = 'media_cleanup_jobs_v2';

const FORBIDDEN_METADATA_KEYS = new Set([
  'bytes',
  'buffer',
  'rawbytes',
  'database64',
  'base64',
  'accesskey',
  'secretkey',
  'privatekey',
]);

/**
 * Guard ensuring Firestore metadata records are never confused with or polluted by object bytes or secrets.
 */
export function assertMetadataContainsNoRawBytes(candidate: unknown): void {
  if (!candidate || typeof candidate !== 'object') return;
  if (Buffer.isBuffer(candidate) || candidate instanceof Uint8Array) {
    throw new MediaDomainError(
      'METADATA_RAW_BYTES_VIOLATION',
      'Raw binary bytes must never be stored inside Firestore media metadata records.',
      422
    );
  }
  for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
    if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) {
      throw new MediaDomainError(
        'METADATA_RAW_BYTES_VIOLATION',
        `Forbidden binary or secret property '${key}' detected in media metadata record.`,
        422
      );
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      throw new MediaDomainError(
        'METADATA_RAW_BYTES_VIOLATION',
        `Property '${key}' contains binary Buffer/Uint8Array inside metadata record.`,
        422
      );
    }
    if (typeof value === 'string' && value.length > 2048) {
      throw new MediaDomainError(
        'METADATA_RAW_BYTES_VIOLATION',
        `Property '${key}' exceeds metadata field size limit (suspected embedded blob).`,
        422
      );
    }
  }
}

export function assertAuthenticatedMediaActor(
  actor: MediaActorContext | null | undefined
): MediaActorContext {
  if (!actor || typeof actor.uid !== 'string' || actor.uid.trim().length < 2) {
    throw new MediaDomainError(
      'UNAUTHORIZED_ACTOR',
      'Authenticated user identity is required for media operations.',
      401
    );
  }
  return { uid: actor.uid.trim(), isAdmin: actor.isAdmin === true };
}

export function assertMediaAdminActor(actor: MediaActorContext | null | undefined): MediaActorContext {
  const verified = assertAuthenticatedMediaActor(actor);
  if (!verified.isAdmin) {
    throw new MediaDomainError(
      'FORBIDDEN_ADMIN_REQUIRED',
      `Actor '${verified.uid}' lacks administrator privileges for media governance.`,
      403
    );
  }
  return verified;
}

/**
 * Projects an internal `MediaMetadataRecord` to a safe `PublicMediaObjectDescriptor`
 * that never leaks internal storage keys, bucket names, or credentials.
 */
export function toPublicMediaDescriptor(record: MediaMetadataRecord): PublicMediaObjectDescriptor {
  return {
    objectId: record.objectId,
    retrievalUrl: `/api/media/objects/${record.objectId}`,
    mediaType: record.mediaType,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    state: record.state,
    durabilityTier: record.durabilityTier,
    association: {
      targetType: record.association.targetType,
      targetId: record.association.targetId,
    },
    createdAtIso: record.createdAtIso,
  };
}

export interface MediaMetadataPersistenceStore {
  saveUploadGrant(grant: MediaUploadGrant): Promise<MediaUploadGrant>;
  getUploadGrant(grantId: string): Promise<MediaUploadGrant | null>;
  findUploadGrantByIdempotencyKey(ownerUid: string, idempotencyKey: string): Promise<MediaUploadGrant | null>;
  markUploadGrantConsumed(grantId: string): Promise<MediaUploadGrant>;

  saveMetadataRecord(record: MediaMetadataRecord): Promise<MediaMetadataRecord>;
  getMetadataRecord(objectId: string): Promise<MediaMetadataRecord | null>;
  findMetadataByIdempotencyKey(ownerUid: string, idempotencyKey: string): Promise<MediaMetadataRecord | null>;
  updateMetadataAtomically(
    objectId: string,
    expectedRevision: number | undefined,
    mutator: (current: MediaMetadataRecord) => MediaMetadataRecord
  ): Promise<MediaMetadataRecord>;
  listAllMetadataRecords(): Promise<MediaMetadataRecord[]>;
  listOwnerMetadataRecords(ownerUid: string): Promise<MediaMetadataRecord[]>;
  listMetadataPage(options?: {
    cursor?: string;
    limit?: number;
  }): Promise<{
    items: MediaMetadataRecord[];
    nextCursor: string | null;
    pageSize: number;
    partial: boolean;
  }>;

  saveCleanupJob(job: DurableMediaCleanupJob): Promise<DurableMediaCleanupJob>;
  getCleanupJob(jobId: string): Promise<DurableMediaCleanupJob | null>;
  listCleanupJobs(): Promise<DurableMediaCleanupJob[]>;
}

export function createDurableMediaMetadataStore(options?: {
  durableSnapshotPath?: string;
  requireDurableFirestore?: boolean;
}): MediaMetadataPersistenceStore {
  const grantsMap = new Map<string, MediaUploadGrant>();
  const metadataMap = new Map<string, MediaMetadataRecord>();
  const cleanupJobsMap = new Map<string, DurableMediaCleanupJob>();
  const locks = new Map<string, Promise<void>>();

  if (options?.durableSnapshotPath && fs.existsSync(options.durableSnapshotPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(options.durableSnapshotPath, 'utf8')) as {
        grants?: MediaUploadGrant[];
        metadata?: MediaMetadataRecord[];
        cleanupJobs?: DurableMediaCleanupJob[];
      };
      for (const g of parsed.grants ?? []) grantsMap.set(g.grantId, g);
      for (const m of parsed.metadata ?? []) metadataMap.set(m.objectId, m);
      for (const j of parsed.cleanupJobs ?? []) cleanupJobsMap.set(j.jobId, j);
    } catch {
      // Ignore corrupt boot snapshot
    }
  }

  async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(key, prev.then(() => next));
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (locks.get(key) === next) locks.delete(key);
    }
  }

  async function persistSnapshotAndFirestore(collectionName: string, docId: string, payload: unknown): Promise<void> {
    assertMetadataContainsNoRawBytes(payload);
    if (options?.durableSnapshotPath) {
      const tmp = `${options.durableSnapshotPath}.tmp.${process.pid}`;
      const data = JSON.stringify({
        grants: Array.from(grantsMap.values()),
        metadata: Array.from(metadataMap.values()),
        cleanupJobs: Array.from(cleanupJobsMap.values()),
      });
      await fs.promises.writeFile(tmp, data, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmp, options.durableSnapshotPath);
    }
    if (!options?.requireDurableFirestore) {
      const hasAdminEnv = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (!hasAdminEnv) return;
      try {
        const db = getFirebaseAdminFirestoreForServer(process.env);
        await db.collection(collectionName).doc(docId).set(JSON.parse(JSON.stringify(payload)), { merge: false });
      } catch {
        /* dev best-effort */
      }
      return;
    }
    const authority = await import('./firestoreMetadataAuthority');
    if (collectionName === MEDIA_METADATA_COLLECTION && authority.isMediaMetadataRecordPayload(payload)) {
      await authority.persistMediaMetadataRecordToFirestore(payload);
      return;
    }
    if (collectionName === MEDIA_UPLOAD_GRANTS_COLLECTION) {
      await authority.persistMediaUploadGrantToFirestore(payload as MediaUploadGrant);
      return;
    }
    if (collectionName === MEDIA_CLEANUP_JOBS_COLLECTION) {
      await authority.persistMediaCleanupJobToFirestore(payload as DurableMediaCleanupJob);
      return;
    }
    const db = getFirebaseAdminFirestoreForServer(process.env);
    await db.collection(collectionName).doc(docId).set(JSON.parse(JSON.stringify(payload)), { merge: false });
  }

  async function hydrateFromDurableAuthority(): Promise<void> {
    if (!options?.requireDurableFirestore) return;
    const authority = await import('./firestoreMetadataAuthority');
    await authority.hydrateMediaMapsFromFirestore({ metadataMap, grantsMap, cleanupJobsMap });
  }

  const store = {
    hydrateFromDurableAuthority,

    async saveUploadGrant(grant: MediaUploadGrant): Promise<MediaUploadGrant> {
      return withLock(`grant:${grant.grantId}`, async () => {
        const cloned = structuredClone(grant);
        grantsMap.set(grant.grantId, cloned);
        await persistSnapshotAndFirestore(MEDIA_UPLOAD_GRANTS_COLLECTION, grant.grantId, cloned);
        return structuredClone(cloned);
      });
    },

    async getUploadGrant(grantId: string): Promise<MediaUploadGrant | null> {
      const found = grantsMap.get(grantId);
      return found ? structuredClone(found) : null;
    },

    async findUploadGrantByIdempotencyKey(ownerUid: string, idempotencyKey: string): Promise<MediaUploadGrant | null> {
      for (const g of grantsMap.values()) {
        if (g.ownerUid === ownerUid && g.idempotencyKey === idempotencyKey) return structuredClone(g);
      }
      return null;
    },

    async markUploadGrantConsumed(grantId: string): Promise<MediaUploadGrant> {
      return withLock(`grant:${grantId}`, async () => {
        const current = grantsMap.get(grantId);
        if (!current) throw new MediaDomainError('UPLOAD_GRANT_EXPIRED_OR_INVALID', 'Upload grant not found.', 404);
        const updated: MediaUploadGrant = { ...current, consumed: true };
        grantsMap.set(grantId, updated);
        await persistSnapshotAndFirestore(MEDIA_UPLOAD_GRANTS_COLLECTION, grantId, updated);
        return structuredClone(updated);
      });
    },

    async saveMetadataRecord(record: MediaMetadataRecord): Promise<MediaMetadataRecord> {
      return withLock(`meta:${record.objectId}`, async () => {
        assertMetadataContainsNoRawBytes(record);
        const cloned = structuredClone(record);
        metadataMap.set(record.objectId, cloned);
        await persistSnapshotAndFirestore(MEDIA_METADATA_COLLECTION, record.objectId, cloned);
        return structuredClone(cloned);
      });
    },

    async getMetadataRecord(objectId: string): Promise<MediaMetadataRecord | null> {
      let found = metadataMap.get(objectId);
      if (!found && options?.requireDurableFirestore) {
        const authority = await import('./firestoreMetadataAuthority');
        const remote = await authority.fetchMediaMetadataRecordFromFirestore(objectId);
        if (remote) {
          metadataMap.set(objectId, remote);
          found = remote;
        }
      }
      return found ? structuredClone(found) : null;
    },

    async findMetadataByIdempotencyKey(ownerUid: string, idempotencyKey: string): Promise<MediaMetadataRecord | null> {
      for (const m of metadataMap.values()) {
        if (m.ownerUid === ownerUid && m.idempotencyKey === idempotencyKey) return structuredClone(m);
      }
      return null;
    },

    async updateMetadataAtomically(
      objectId: string,
      expectedRevision: number | undefined,
      mutator: (current: MediaMetadataRecord) => MediaMetadataRecord
    ): Promise<MediaMetadataRecord> {
      return withLock(`meta:${objectId}`, async () => {
        const current = metadataMap.get(objectId);
        if (!current) throw new MediaDomainError('OBJECT_NOT_FOUND', `Media object '${objectId}' not found.`, 404);
        if (expectedRevision !== undefined && current.revision !== expectedRevision) {
          throw new MediaDomainError(
            'CONCURRENT_MODIFICATION_CONFLICT',
            `Revision conflict on media object '${objectId}': expected ${expectedRevision}, actual ${current.revision}.`,
            409
          );
        }
        const updated = mutator(structuredClone(current));
        assertMetadataContainsNoRawBytes(updated);
        if (updated.revision !== current.revision + 1) {
          throw new MediaDomainError(
            'CONCURRENT_MODIFICATION_CONFLICT',
            `Metadata update must increment revision from ${current.revision} to ${current.revision + 1}.`,
            409
          );
        }
        const cloned = structuredClone(updated);
        metadataMap.set(objectId, cloned);
        await persistSnapshotAndFirestore(MEDIA_METADATA_COLLECTION, objectId, cloned);
        return structuredClone(cloned);
      });
    },

    async listAllMetadataRecords(): Promise<MediaMetadataRecord[]> {
      return Array.from(metadataMap.values()).map((m) => structuredClone(m));
    },

    async listOwnerMetadataRecords(ownerUid: string): Promise<MediaMetadataRecord[]> {
      return Array.from(metadataMap.values())
        .filter((m) => m.ownerUid === ownerUid)
        .map((m) => structuredClone(m));
    },

    async listMetadataPage(pageOpts?: { cursor?: string; limit?: number }) {
      const pageSize = Math.min(Math.max(pageOpts?.limit ?? 50, 1), 100);
      const sorted = Array.from(metadataMap.values())
        .filter((m) => m.state !== 'DELETED')
        .sort((a, b) => a.objectId.localeCompare(b.objectId));
      const startIdx =
        pageOpts?.cursor && sorted.findIndex((m) => m.objectId === pageOpts.cursor) >= 0
          ? sorted.findIndex((m) => m.objectId === pageOpts.cursor) + 1
          : 0;
      const slice = sorted.slice(startIdx, startIdx + pageSize + 1);
      const items = slice.slice(0, pageSize).map((m) => structuredClone(m));
      const partial = slice.length > pageSize;
      const nextCursor = partial && items.length > 0 ? items[items.length - 1]!.objectId : null;
      if (options?.requireDurableFirestore && pageOpts?.cursor && items.length === 0) {
        const { listMediaMetadataPageFromFirestore, fetchMediaMetadataRecordFromFirestore } = await import(
          './firestoreMetadataAuthority'
        );
        const remote = await listMediaMetadataPageFromFirestore(pageOpts);
        const hydrated: MediaMetadataRecord[] = [];
        for (const row of remote.items) {
          let rec = metadataMap.get(row.objectId);
          if (!rec) {
            rec = (await fetchMediaMetadataRecordFromFirestore(row.objectId)) ?? undefined;
            if (rec) metadataMap.set(rec.objectId, rec);
          }
          if (rec) hydrated.push(structuredClone(rec));
        }
        return {
          items: hydrated,
          nextCursor: remote.nextCursor,
          pageSize: remote.pageSize,
          partial: remote.partial,
        };
      }
      return { items, nextCursor, pageSize, partial };
    },

    async saveCleanupJob(job: DurableMediaCleanupJob): Promise<DurableMediaCleanupJob> {
      return withLock(`job:${job.jobId}`, async () => {
        const cloned = structuredClone(job);
        cleanupJobsMap.set(job.jobId, cloned);
        await persistSnapshotAndFirestore(MEDIA_CLEANUP_JOBS_COLLECTION, job.jobId, cloned);
        return structuredClone(cloned);
      });
    },

    async getCleanupJob(jobId: string): Promise<DurableMediaCleanupJob | null> {
      const found = cleanupJobsMap.get(jobId);
      return found ? structuredClone(found) : null;
    },

    async listCleanupJobs(): Promise<DurableMediaCleanupJob[]> {
      return Array.from(cleanupJobsMap.values()).map((j) => structuredClone(j));
    },
  };

  return store;
}
