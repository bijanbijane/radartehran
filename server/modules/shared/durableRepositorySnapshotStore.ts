/**
 * RT-INFRA-008 — Remote JSON repository snapshots (R2/S3 bytes + Firestore registry).
 */
import crypto from 'node:crypto';
import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  downloadFromRemoteS3Compatible,
  resolveObjectStorageRuntimeConfig,
  uploadToRemoteS3Compatible,
} from '../../../src/utils/objectStorageUpload';
import {
  classifyRepositoryFile,
  DURABLE_REPOSITORY_REGISTRY_COLLECTION,
  isDurableRepositoryProductionMode,
} from './repositoryPersistencePolicy';

const REGISTRY_SCHEMA = 'repository_snapshot_v1';

export interface RepositorySnapshotRegistryDoc {
  schemaVersion: typeof REGISTRY_SCHEMA;
  fileName: string;
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  revision: number;
  classification: string;
  updatedAtIso: string;
}

export interface RepositorySnapshotBackendPort {
  verify(): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  load(fileName: string): Promise<string | null>;
  persist(fileName: string, jsonUtf8: string): Promise<void>;
}

type MemoryEntry = {
  jsonUtf8: string;
  revision: number;
  sha256: string;
  objectKey: string;
  sizeBytes: number;
};

let testBackendPort: RepositorySnapshotBackendPort | null = null;
const memoryFallback = new Map<string, MemoryEntry>();
const testPortRevisionByFile = new Map<string, number>();

export function setRepositorySnapshotBackendForTests(port: RepositorySnapshotBackendPort | null): void {
  testBackendPort = port;
  testPortRevisionByFile.clear();
  if (!port) memoryFallback.clear();
}

function safeRepositoryDocId(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildObjectKey(fileName: string, revision: number, contentSha256?: string): string {
  const base = `platform/repository-snapshots/v1/${safeRepositoryDocId(fileName)}/rev-${revision}`;
  if (contentSha256 && contentSha256.length >= 16) {
    return `${base}-${contentSha256.slice(0, 16)}.json`;
  }
  return `${base}.json`;
}

function createProductionBackend(): RepositorySnapshotBackendPort {
  return {
    async verify() {
      try {
        const db = getFirebaseAdminFirestoreForServer(process.env);
        await db.collection(DURABLE_REPOSITORY_REGISTRY_COLLECTION).limit(1).get();
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false,
          code: 'REPOSITORY_SNAPSHOT_STORE_UNAVAILABLE',
          message: error instanceof Error ? error.message : 'Repository snapshot store unavailable.',
        };
      }
    },

    async load(fileName: string) {
      const db = getFirebaseAdminFirestoreForServer(process.env);
      const doc = await db.collection(DURABLE_REPOSITORY_REGISTRY_COLLECTION).doc(safeRepositoryDocId(fileName)).get();
      if (!doc.exists) return null;
      const data = doc.data() as RepositorySnapshotRegistryDoc;
      const cfg = resolveObjectStorageRuntimeConfig(process.env);
      const buffer = await downloadFromRemoteS3Compatible(data.objectKey, cfg);
      if (!buffer || buffer.length === 0) return null;
      const sha = crypto.createHash('sha256').update(buffer).digest('hex');
      if (sha !== data.sha256) {
        throw new Error('REPOSITORY_SNAPSHOT_CHECKSUM_MISMATCH');
      }
      return buffer.toString('utf-8');
    },

    async persist(fileName: string, jsonUtf8: string) {
      const cfg = resolveObjectStorageRuntimeConfig(process.env);
      const db = getFirebaseAdminFirestoreForServer(process.env);
      const docId = safeRepositoryDocId(fileName);
      const docRef = db.collection(DURABLE_REPOSITORY_REGISTRY_COLLECTION).doc(docId);
      const sha256 = crypto.createHash('sha256').update(jsonUtf8, 'utf-8').digest('hex');
      const sizeBytes = Buffer.byteLength(jsonUtf8, 'utf-8');

      const snap = await docRef.get();
      const baseRevision = snap.exists ? Number((snap.data() as RepositorySnapshotRegistryDoc).revision) || 0 : 0;
      const nextRevision = baseRevision + 1;
      const objectKey = buildObjectKey(fileName, nextRevision, sha256);
      const uploaded = await uploadToRemoteS3Compatible(
        objectKey,
        Buffer.from(jsonUtf8, 'utf-8'),
        'application/json; charset=utf-8',
        cfg,
      );
      if (!uploaded) {
        throw new Error('REPOSITORY_SNAPSHOT_REMOTE_UPLOAD_FAILED');
      }

      await db.runTransaction(async (tx) => {
        const current = await tx.get(docRef);
        const currentRevision = current.exists
          ? Number((current.data() as RepositorySnapshotRegistryDoc).revision) || 0
          : 0;
        if (currentRevision !== baseRevision) {
          throw new Error('REPOSITORY_SNAPSHOT_REVISION_CONFLICT');
        }
        const payload: RepositorySnapshotRegistryDoc = {
          schemaVersion: REGISTRY_SCHEMA,
          fileName,
          objectKey,
          sha256,
          sizeBytes,
          revision: nextRevision,
          classification: classifyRepositoryFile(fileName),
          updatedAtIso: new Date().toISOString(),
        };
        tx.set(docRef, payload, { merge: false });
      });
    },
  };
}

function createMemoryBackend(): RepositorySnapshotBackendPort {
  return {
    async verify() {
      return { ok: true as const };
    },
    async load(fileName) {
      return memoryFallback.get(fileName)?.jsonUtf8 ?? null;
    },
    async persist(fileName, jsonUtf8) {
      const prev = memoryFallback.get(fileName)?.revision ?? 0;
      const sha256 = crypto.createHash('sha256').update(jsonUtf8, 'utf-8').digest('hex');
      const next = prev + 1;
      memoryFallback.set(fileName, {
        jsonUtf8,
        revision: next,
        sha256,
        objectKey: buildObjectKey(fileName, next, sha256),
        sizeBytes: Buffer.byteLength(jsonUtf8, 'utf-8'),
      });
    },
  };
}

function getBackend(): RepositorySnapshotBackendPort {
  if (testBackendPort) return testBackendPort;
  if (isDurableRepositoryProductionMode()) return createProductionBackend();
  return createMemoryBackend();
}

export async function verifyRepositorySnapshotBackend(
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (!isDurableRepositoryProductionMode(env)) return { ok: true };
  return getBackend().verify();
}

export async function loadRepositorySnapshot(fileName: string): Promise<string | null> {
  if (!isDurableRepositoryProductionMode() && !testBackendPort) return null;
  return getBackend().load(fileName);
}

export async function getRepositorySnapshotRegistryMeta(
  fileName: string,
): Promise<RepositorySnapshotRegistryDoc | null> {
  if (testBackendPort) {
    const entry = memoryFallback.get(fileName);
    if (entry) {
      return {
        schemaVersion: REGISTRY_SCHEMA,
        fileName,
        objectKey: entry.objectKey,
        sha256: entry.sha256,
        sizeBytes: entry.sizeBytes,
        revision: entry.revision,
        classification: classifyRepositoryFile(fileName),
        updatedAtIso: new Date().toISOString(),
      };
    }
    const loaded = await testBackendPort.load(fileName);
    if (!loaded) return null;
    const sha256 = crypto.createHash('sha256').update(loaded, 'utf-8').digest('hex');
    const revision = testPortRevisionByFile.get(fileName) ?? 1;
    return {
      schemaVersion: REGISTRY_SCHEMA,
      fileName,
      objectKey: buildObjectKey(fileName, revision, sha256),
      sha256,
      sizeBytes: Buffer.byteLength(loaded, 'utf-8'),
      revision,
      classification: classifyRepositoryFile(fileName),
      updatedAtIso: new Date().toISOString(),
    };
  }
  if (!isDurableRepositoryProductionMode()) return null;
  try {
    const db = getFirebaseAdminFirestoreForServer(process.env);
    const snap = await db
      .collection(DURABLE_REPOSITORY_REGISTRY_COLLECTION)
      .doc(safeRepositoryDocId(fileName))
      .get();
    if (!snap.exists) return null;
    return snap.data() as RepositorySnapshotRegistryDoc;
  } catch {
    return null;
  }
}

export async function persistRepositorySnapshot(fileName: string, payload: unknown): Promise<void> {
  if (!isDurableRepositoryProductionMode() && !testBackendPort) return;
  const jsonUtf8 = JSON.stringify(payload);
  await getBackend().persist(fileName, jsonUtf8);
}

export interface RepositorySnapshotPersistOutcome {
  ok: boolean;
  code?: string;
  message?: string;
  sha256: string;
  revision?: number;
  objectKey?: string;
  verifiedRemoteSha256?: string;
  registryVerified: boolean;
  partialR2ObjectKey?: string;
  idempotentSkip: boolean;
}

/**
 * Controlled snapshot persist: revision CAS, post-upload checksum verify, no silent registry overwrite.
 */
export async function persistRepositorySnapshotControlled(
  fileName: string,
  jsonUtf8: string,
  options?: { requireAbsentRegistry?: boolean },
): Promise<RepositorySnapshotPersistOutcome> {
  if (!isRepositoryRemotePersistenceActive()) {
    return {
      ok: false,
      code: 'REMOTE_PERSISTENCE_INACTIVE',
      message: 'Remote repository persistence is not active.',
      sha256: crypto.createHash('sha256').update(jsonUtf8, 'utf-8').digest('hex'),
      registryVerified: false,
      idempotentSkip: false,
    };
  }

  const sha256 = crypto.createHash('sha256').update(jsonUtf8, 'utf-8').digest('hex');
  const existingMeta = await getRepositorySnapshotRegistryMeta(fileName);
  if (existingMeta?.sha256 === sha256) {
    return {
      ok: true,
      sha256,
      revision: existingMeta.revision,
      objectKey: existingMeta.objectKey,
      verifiedRemoteSha256: sha256,
      registryVerified: true,
      idempotentSkip: true,
    };
  }

  if (existingMeta && existingMeta.sha256 !== sha256) {
    return {
      ok: false,
      code: 'REGISTRY_CONFLICT_NEWER_OR_DIFFERENT',
      message: 'Firestore registry already points at a different snapshot; refusing silent overwrite.',
      sha256,
      revision: existingMeta.revision,
      registryVerified: false,
      idempotentSkip: false,
    };
  }

  if (options?.requireAbsentRegistry && existingMeta) {
    return {
      ok: false,
      code: 'REGISTRY_ALREADY_PRESENT',
      message: 'Registry entry exists; migration requires operator reconciliation.',
      sha256,
      revision: existingMeta.revision,
      registryVerified: false,
      idempotentSkip: false,
    };
  }

  if (testBackendPort) {
    const nextRevision = (testPortRevisionByFile.get(fileName) ?? 0) + 1;
    await testBackendPort.persist(fileName, jsonUtf8);
    testPortRevisionByFile.set(fileName, nextRevision);
    const loaded = await testBackendPort.load(fileName);
    const verifiedRemoteSha256 = loaded
      ? crypto.createHash('sha256').update(loaded, 'utf-8').digest('hex')
      : undefined;
    const registryVerified = verifiedRemoteSha256 === sha256;
    const objectKey = buildObjectKey(fileName, nextRevision, sha256);
    return {
      ok: registryVerified,
      sha256,
      revision: nextRevision,
      objectKey,
      verifiedRemoteSha256,
      registryVerified,
      idempotentSkip: false,
      code: registryVerified ? undefined : 'TEST_BACKEND_VERIFY_FAILED',
    };
  }

  const cfg = resolveObjectStorageRuntimeConfig(process.env);
  const baseRevision = existingMeta?.revision ?? 0;
  const nextRevision = baseRevision + 1;
  const objectKey = buildObjectKey(fileName, nextRevision, sha256);
  const uploaded = await uploadToRemoteS3Compatible(
    objectKey,
    Buffer.from(jsonUtf8, 'utf-8'),
    'application/json; charset=utf-8',
    cfg,
  );
  if (!uploaded) {
    return {
      ok: false,
      code: 'R2_UPLOAD_FAILED',
      message: 'R2/S3 upload failed before registry write.',
      sha256,
      partialR2ObjectKey: objectKey,
      registryVerified: false,
      idempotentSkip: false,
    };
  }

  const remoteBuffer = await downloadFromRemoteS3Compatible(objectKey, cfg);
  const verifiedRemoteSha256 = remoteBuffer
    ? crypto.createHash('sha256').update(remoteBuffer).digest('hex')
    : undefined;
  if (!verifiedRemoteSha256 || verifiedRemoteSha256 !== sha256) {
    return {
      ok: false,
      code: 'R2_UPLOAD_CHECKSUM_MISMATCH',
      message: 'Uploaded object failed post-upload checksum verification.',
      sha256,
      partialR2ObjectKey: objectKey,
      verifiedRemoteSha256,
      registryVerified: false,
      idempotentSkip: false,
    };
  }

  try {
    const db = getFirebaseAdminFirestoreForServer(process.env);
    const docRef = db.collection(DURABLE_REPOSITORY_REGISTRY_COLLECTION).doc(safeRepositoryDocId(fileName));
    await db.runTransaction(async (tx) => {
      const current = await tx.get(docRef);
      const currentRevision = current.exists
        ? Number((current.data() as RepositorySnapshotRegistryDoc).revision) || 0
        : 0;
      if (currentRevision !== baseRevision) {
        throw new Error('REPOSITORY_SNAPSHOT_REVISION_CONFLICT');
      }
      const payload: RepositorySnapshotRegistryDoc = {
        schemaVersion: REGISTRY_SCHEMA,
        fileName,
        objectKey,
        sha256,
        sizeBytes: Buffer.byteLength(jsonUtf8, 'utf-8'),
        revision: nextRevision,
        classification: classifyRepositoryFile(fileName),
        updatedAtIso: new Date().toISOString(),
      };
      tx.set(docRef, payload, { merge: false });
    });
  } catch (error) {
    return {
      ok: false,
      code: 'FIRESTORE_REGISTRY_WRITE_FAILED',
      message: error instanceof Error ? error.message : 'Firestore registry write failed.',
      sha256,
      partialR2ObjectKey: objectKey,
      verifiedRemoteSha256,
      registryVerified: false,
      idempotentSkip: false,
    };
  }

  const verifiedMeta = await getRepositorySnapshotRegistryMeta(fileName);
  const registryVerified = Boolean(
    verifiedMeta &&
      verifiedMeta.sha256 === sha256 &&
      verifiedMeta.revision === nextRevision &&
      verifiedMeta.objectKey === objectKey,
  );

  return {
    ok: registryVerified,
    code: registryVerified ? undefined : 'REGISTRY_VERIFICATION_FAILED',
    sha256,
    revision: verifiedMeta?.revision,
    objectKey: verifiedMeta?.objectKey,
    verifiedRemoteSha256,
    registryVerified,
    idempotentSkip: false,
  };
}

export function isRepositoryRemotePersistenceActive(): boolean {
  return isDurableRepositoryProductionMode() || testBackendPort !== null;
}