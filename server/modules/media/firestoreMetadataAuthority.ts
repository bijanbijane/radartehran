/**
 * RT-INFRA-010/011 — Legacy Firestore adapter for Media metadata (transitional; no new collections).
 * Durable target: D1 `media_objects` (Firestore removal workstream).
 */
import { FieldPath } from 'firebase-admin/firestore';
import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  MEDIA_CLEANUP_JOBS_COLLECTION,
  MEDIA_METADATA_COLLECTION,
  MEDIA_UPLOAD_GRANTS_COLLECTION,
  assertMetadataContainsNoRawBytes,
} from './metadataStore';
import type { DurableMediaCleanupJob, MediaMetadataRecord, MediaUploadGrant } from './types';
import { STORED_OBJECT_METADATA_SCHEMA } from '../../../src/utils/serverObjectStorageMetadataRegistry';
import { isProductionMediaMetadataAuthority } from './durableMediaMetadataRepository';

export { isProductionMediaMetadataAuthority } from './durableMediaMetadataRepository';

export const MEDIA_METADATA_NATIVE_SCHEMA = 'media_metadata_native_v1';

export interface MediaMetadataFirestoreEnvelope {
  schemaVersion: typeof MEDIA_METADATA_NATIVE_SCHEMA;
  record: MediaMetadataRecord;
  updatedAtIso: string;
}

export function isMediaMetadataRecordPayload(payload: unknown): payload is MediaMetadataRecord {
  if (!payload || typeof payload !== 'object') return false;
  const rec = payload as MediaMetadataRecord;
  return typeof rec.objectId === 'string' && typeof rec.revision === 'number';
}

export async function fetchMediaMetadataRecordFromFirestore(objectId: string): Promise<MediaMetadataRecord | null> {
  const db = getFirebaseAdminFirestoreForServer(process.env);
  const snap = await db.collection(MEDIA_METADATA_COLLECTION).doc(objectId).get();
  if (!snap.exists) return null;
  return parseMediaMetadataDocument(snap.data() as Record<string, unknown>);
}

export function parseMediaMetadataDocument(data: Record<string, unknown> | undefined): MediaMetadataRecord | null {
  if (!data) return null;
  if (data.schemaVersion === MEDIA_METADATA_NATIVE_SCHEMA && isMediaMetadataRecordPayload(data.record)) {
    return data.record;
  }
  if (data.schemaVersion === STORED_OBJECT_METADATA_SCHEMA) {
    return null;
  }
  if (isMediaMetadataRecordPayload(data)) {
    return data;
  }
  return null;
}

export async function verifyMediaFirestoreMetadataAuthority(
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (!isProductionMediaMetadataAuthority(env)) return { ok: true };
  if (!(env.FIREBASE_PROJECT_ID || '').trim()) {
    return {
      ok: false,
      code: 'FIRESTORE_PROJECT_NOT_CONFIGURED',
      message: 'FIREBASE_PROJECT_ID is required for durable media metadata.',
    };
  }
  try {
    const db = getFirebaseAdminFirestoreForServer(env);
    await db.collection(MEDIA_METADATA_COLLECTION).limit(1).get();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: 'MEDIA_METADATA_FIRESTORE_UNAVAILABLE',
      message: error instanceof Error ? error.message : 'Media metadata Firestore unavailable.',
    };
  }
}

export async function persistMediaMetadataRecordToFirestore(record: MediaMetadataRecord): Promise<void> {
  assertMetadataContainsNoRawBytes(record);
  const db = getFirebaseAdminFirestoreForServer(process.env);
  const ref = db.collection(MEDIA_METADATA_COLLECTION).doc(record.objectId);
  const snap = await ref.get();
  if (snap.exists) {
    const existing = snap.data() as Record<string, unknown>;
    if (existing.schemaVersion === STORED_OBJECT_METADATA_SCHEMA) {
      throw new Error('MEDIA_OBJECT_STORAGE_SCHEMA_CONFLICT');
    }
    const current = parseMediaMetadataDocument(existing);
    if (current && current.revision >= record.revision && current.sha256 !== record.sha256) {
      throw new Error('MEDIA_METADATA_REVISION_CONFLICT');
    }
  }
  const envelope: MediaMetadataFirestoreEnvelope = {
    schemaVersion: MEDIA_METADATA_NATIVE_SCHEMA,
    record,
    updatedAtIso: new Date().toISOString(),
  };
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (cur.exists) {
      const parsed = parseMediaMetadataDocument(cur.data() as Record<string, unknown>);
      if (parsed && parsed.revision > record.revision) {
        throw new Error('MEDIA_METADATA_REVISION_CONFLICT');
      }
      if ((cur.data() as Record<string, unknown>).schemaVersion === STORED_OBJECT_METADATA_SCHEMA) {
        throw new Error('MEDIA_OBJECT_STORAGE_SCHEMA_CONFLICT');
      }
    }
    tx.set(ref, JSON.parse(JSON.stringify(envelope)), { merge: false });
  });
}

export async function persistMediaUploadGrantToFirestore(grant: MediaUploadGrant): Promise<void> {
  assertMetadataContainsNoRawBytes(grant);
  const db = getFirebaseAdminFirestoreForServer(process.env);
  await db.collection(MEDIA_UPLOAD_GRANTS_COLLECTION).doc(grant.grantId).set(JSON.parse(JSON.stringify(grant)), {
    merge: false,
  });
}

export async function persistMediaCleanupJobToFirestore(job: DurableMediaCleanupJob): Promise<void> {
  assertMetadataContainsNoRawBytes(job);
  const db = getFirebaseAdminFirestoreForServer(process.env);
  await db.collection(MEDIA_CLEANUP_JOBS_COLLECTION).doc(job.jobId).set(JSON.parse(JSON.stringify(job)), {
    merge: false,
  });
}

export async function deleteMediaMetadataRecordFromFirestore(objectId: string): Promise<void> {
  const db = getFirebaseAdminFirestoreForServer(process.env);
  await db.collection(MEDIA_METADATA_COLLECTION).doc(objectId).delete();
}

export async function listMediaMetadataPageFromFirestore(options?: {
  cursor?: string;
  limit?: number;
}): Promise<import('../shared/persistence/objectMetadataPorts').MetadataPageResult<
  import('../shared/persistence/objectMetadataPorts').MediaMetadataRevisionRecord
>> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const db = getFirebaseAdminFirestoreForServer(process.env);
  let query = db
    .collection(MEDIA_METADATA_COLLECTION)
    .orderBy(FieldPath.documentId())
    .limit(limit + 1);
  if (options?.cursor) {
    const cursorSnap = await db.collection(MEDIA_METADATA_COLLECTION).doc(options.cursor).get();
    if (cursorSnap.exists) query = query.startAfter(cursorSnap);
  }
  const snap = await query.get();
  const docs = snap.docs.slice(0, limit);
  const items: import('../shared/persistence/objectMetadataPorts').MediaMetadataRevisionRecord[] = [];
  for (const doc of docs) {
    const rec = parseMediaMetadataDocument(doc.data() as Record<string, unknown>);
    if (!rec) continue;
    items.push({
      objectId: rec.objectId,
      revision: rec.revision,
      ownerUid: rec.ownerUid,
      sha256: rec.sha256,
      state: rec.state,
      updatedAtIso: rec.updatedAtIso,
    });
  }
  const partial = snap.docs.length > limit;
  const nextCursor = partial && items.length > 0 ? items[items.length - 1]!.objectId : null;
  return { items, nextCursor, pageSize: limit, partial };
}

export async function hydrateMediaMapsFromFirestore(
  maps: {
    metadataMap: Map<string, MediaMetadataRecord>;
    grantsMap: Map<string, MediaUploadGrant>;
    cleanupJobsMap: Map<string, DurableMediaCleanupJob>;
  },
  bounds?: { metadataLimit?: number; grantsLimit?: number; cleanupLimit?: number },
): Promise<void> {
  const metadataLimit = bounds?.metadataLimit ?? 100;
  const grantsLimit = bounds?.grantsLimit ?? 50;
  const cleanupLimit = bounds?.cleanupLimit ?? 25;
  const db = getFirebaseAdminFirestoreForServer(process.env);
  const [metaSnap, grantSnap, jobSnap] = await Promise.all([
    db.collection(MEDIA_METADATA_COLLECTION).where('schemaVersion', '==', MEDIA_METADATA_NATIVE_SCHEMA).limit(metadataLimit).get(),
    db.collection(MEDIA_UPLOAD_GRANTS_COLLECTION).limit(grantsLimit).get(),
    db.collection(MEDIA_CLEANUP_JOBS_COLLECTION).limit(cleanupLimit).get(),
  ]);
  for (const doc of metaSnap.docs) {
    const rec = parseMediaMetadataDocument(doc.data() as Record<string, unknown>);
    if (rec) maps.metadataMap.set(rec.objectId, rec);
  }
  for (const doc of grantSnap.docs) {
    maps.grantsMap.set(doc.id, doc.data() as MediaUploadGrant);
  }
  for (const doc of jobSnap.docs) {
    maps.cleanupJobsMap.set(doc.id, doc.data() as DurableMediaCleanupJob);
  }
}