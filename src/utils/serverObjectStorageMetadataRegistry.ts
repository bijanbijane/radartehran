/**
 * RT-INFRA-007 — Durable object metadata registry (Firestore Admin, production authority).
 *
 * Future migration (not automated): backfill `media_object_metadata_v2` from legacy
 * `.object-storage-bucket/index.json` and deprecated `mediaObjects` only after verifying
 * remote bytes (R2/S3) for each `remoteS3Synced` record.
 */
import type { StoredObjectRecord } from './serverObjectStorageHelpers';

const METADATA_LIST_LIMIT = 300;
import { getFirebaseAdminFirestoreForServer } from './serverAdminAndTelegramSecurity';
import { isProductionApiRuntime } from './serverPersistencePolicy';

/** Canonical Firestore collection (server Admin only; client rules deny all). */
export const STORED_OBJECT_METADATA_COLLECTION = 'media_object_metadata_v2';
export const STORED_OBJECT_METADATA_SCHEMA = 'stored_object_record_v1';

export interface StoredObjectMetadataDocument {
  schemaVersion: typeof STORED_OBJECT_METADATA_SCHEMA;
  record: StoredObjectRecord;
  updatedAtIso: string;
}

export interface ObjectStorageMetadataRegistryPort {
  verifyRepositoryAvailable(): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  listAllRecords(): Promise<StoredObjectRecord[]>;
  getRecord(objectId: string): Promise<StoredObjectRecord | null>;
  upsertRecord(record: StoredObjectRecord): Promise<void>;
  deleteRecord(objectId: string): Promise<void>;
}

let testRegistryPort: ObjectStorageMetadataRegistryPort | null = null;

export function setObjectStorageMetadataRegistryForTests(
  port: ObjectStorageMetadataRegistryPort | null
): void {
  testRegistryPort = port;
}

export function isDurableObjectMetadataProductionMode(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (testRegistryPort) return true;
  if (env.PREVENT_PROD_FIREBASE_IN_TEST === 'true') return false;
  if (env.RADAR_OBJECT_METADATA_LOCAL_INDEX === '1') return false;
  return isProductionApiRuntime(env);
}

async function isSafeRecord(value: unknown): Promise<boolean> {
  const { isSafeStoredObjectRecord } = await import('./serverObjectStorageHelpers');
  return isSafeStoredObjectRecord(value);
}

async function docToRecord(data: Record<string, unknown> | undefined): Promise<StoredObjectRecord | null> {
  if (!data) return null;
  if (data.schemaVersion === STORED_OBJECT_METADATA_SCHEMA && (await isSafeRecord(data.record))) {
    return data.record as StoredObjectRecord;
  }
  if (await isSafeRecord(data)) return data as StoredObjectRecord;
  return null;
}

function createFirestoreRegistryPort(): ObjectStorageMetadataRegistryPort {
  return {
    async verifyRepositoryAvailable() {
      try {
        const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
        if (!projectId) {
          return {
            ok: false,
            code: 'FIRESTORE_PROJECT_NOT_CONFIGURED',
            message: 'FIREBASE_PROJECT_ID is required for durable object metadata in production.',
          };
        }
        const db = getFirebaseAdminFirestoreForServer(process.env);
        await db.collection(STORED_OBJECT_METADATA_COLLECTION).limit(1).get();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          code: 'DURABLE_METADATA_REPOSITORY_UNAVAILABLE',
          message:
            error instanceof Error
              ? error.message
              : 'Firestore metadata repository is unavailable.',
        };
      }
    },

    async listAllRecords() {
      const db = getFirebaseAdminFirestoreForServer(process.env);
      const snap = await db
        .collection(STORED_OBJECT_METADATA_COLLECTION)
        .where('schemaVersion', '==', STORED_OBJECT_METADATA_SCHEMA)
        .limit(METADATA_LIST_LIMIT)
        .get();
      const records: StoredObjectRecord[] = [];
      const seen = new Set<string>();
      for (const doc of snap.docs) {
        const record = await docToRecord(doc.data() as Record<string, unknown>);
        if (!record || seen.has(record.id.toLowerCase())) continue;
        seen.add(record.id.toLowerCase());
        records.push(record);
      }
      return records;
    },

    async getRecord(objectId: string) {
      const db = getFirebaseAdminFirestoreForServer(process.env);
      const snap = await db.collection(STORED_OBJECT_METADATA_COLLECTION).doc(objectId).get();
      if (!snap.exists) return null;
      return docToRecord(snap.data() as Record<string, unknown>);
    },

    async upsertRecord(record: StoredObjectRecord) {
      if (!(await isSafeRecord(record))) {
        throw new Error('UNSAFE_STORED_OBJECT_RECORD');
      }
      const payload: StoredObjectMetadataDocument = {
        schemaVersion: STORED_OBJECT_METADATA_SCHEMA,
        record,
        updatedAtIso: new Date().toISOString(),
      };
      const db = getFirebaseAdminFirestoreForServer(process.env);
      await db.collection(STORED_OBJECT_METADATA_COLLECTION).doc(record.id).set(payload, { merge: false });
    },

    async deleteRecord(objectId: string) {
      const db = getFirebaseAdminFirestoreForServer(process.env);
      await db.collection(STORED_OBJECT_METADATA_COLLECTION).doc(objectId).delete();
    },
  };
}

function getMetadataRegistryPort(): ObjectStorageMetadataRegistryPort {
  if (testRegistryPort) return testRegistryPort;
  if (isDurableObjectMetadataProductionMode()) return createFirestoreRegistryPort();
  return createNoopLocalRegistryPort();
}

function createNoopLocalRegistryPort(): ObjectStorageMetadataRegistryPort {
  return {
    async verifyRepositoryAvailable() {
      return { ok: true };
    },
    async listAllRecords() {
      return [];
    },
    async getRecord() {
      return null;
    },
    async upsertRecord() {
      /* local index.json owns dev metadata */
    },
    async deleteRecord() {
      /* local index.json owns dev metadata */
    },
  };
}

export async function verifyDurableMetadataRepositoryAvailable(
  env: Record<string, string | undefined> = process.env
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (!isDurableObjectMetadataProductionMode(env)) return { ok: true };
  return getMetadataRegistryPort().verifyRepositoryAvailable();
}

export async function loadStoredObjectRecordsFromDurableRegistry(): Promise<StoredObjectRecord[]> {
  if (!isDurableObjectMetadataProductionMode()) return [];
  return getMetadataRegistryPort().listAllRecords();
}

export async function upsertStoredObjectMetadata(record: StoredObjectRecord): Promise<void> {
  if (!isDurableObjectMetadataProductionMode()) return;
  await getMetadataRegistryPort().upsertRecord(record);
}

export async function deleteStoredObjectMetadata(objectId: string): Promise<void> {
  if (!isDurableObjectMetadataProductionMode()) return;
  await getMetadataRegistryPort().deleteRecord(objectId);
}

export async function getStoredObjectMetadata(objectId: string): Promise<StoredObjectRecord | null> {
  if (!isDurableObjectMetadataProductionMode()) return null;
  return getMetadataRegistryPort().getRecord(objectId);
}

export async function persistAllStoredObjectMetadataToRegistry(
  records: readonly StoredObjectRecord[]
): Promise<void> {
  if (!isDurableObjectMetadataProductionMode()) return;
  const port = getMetadataRegistryPort();
  for (const record of records) {
    if (!(await isSafeRecord(record))) continue;
    await port.upsertRecord(record);
  }
}

export function isAuthoritativeProductionMetadataRecord(
  record: StoredObjectRecord,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!isDurableObjectMetadataProductionMode(env)) return true;
  return record.remoteS3Synced === true;
}