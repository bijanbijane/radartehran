/**
 * RT-INFRA-011 — Resolve Media metadata durable backend (D1 target, Firestore legacy transitional).
 */
import type {
  MediaMetadataRepository,
  MetadataRepositoryBackendId,
  RepositoryHealthResult,
} from '../shared/persistence/objectMetadataPorts';
import {
  hydrateMediaMapsFromFirestore,
  verifyMediaFirestoreMetadataAuthority,
} from './firestoreMetadataAuthority';

const BLOCKED_D1: MediaMetadataRepository = {
  async verifyAvailable(): Promise<RepositoryHealthResult> {
    return {
      ok: false,
      backend: 'd1',
      code: 'MEDIA_METADATA_D1_EXPRESS_ADAPTER_BLOCKED',
      message:
        'D1 is the approved target (worker/db migration 0003) but the Express D1 adapter is not cut over yet. Set RADAR_MEDIA_METADATA_BACKEND=firestore_legacy for transitional production.',
    };
  },
  async getById() {
    throw new Error('MEDIA_METADATA_D1_EXPRESS_ADAPTER_BLOCKED');
  },
  async upsertNativeRecord() {
    throw new Error('MEDIA_METADATA_D1_EXPRESS_ADAPTER_BLOCKED');
  },
  async deleteById() {
    throw new Error('MEDIA_METADATA_D1_EXPRESS_ADAPTER_BLOCKED');
  },
  async listPage() {
    return { items: [], nextCursor: null, pageSize: 0, partial: true };
  },
};

export function resolveMediaMetadataBackendId(
  env: Record<string, string | undefined> = process.env,
): MetadataRepositoryBackendId {
  const raw = (env.RADAR_MEDIA_METADATA_BACKEND || '').trim().toLowerCase();
  if (raw === 'memory' || raw === 'd1' || raw === 'firestore_legacy') return raw;
  if (env.PREVENT_PROD_FIREBASE_IN_TEST === 'true') return 'memory';
  if (env.RADAR_MEDIA_METADATA_LOCAL_ONLY === '1') return 'memory';
  if (env.NODE_ENV === 'production') return 'firestore_legacy';
  return 'memory';
}

export function isProductionDurableMediaMetadataRequired(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const backend = resolveMediaMetadataBackendId(env);
  return env.NODE_ENV === 'production' && backend !== 'memory';
}

/** @deprecated Use resolveMediaMetadataBackendId / isProductionDurableMediaMetadataRequired */
export function isProductionMediaMetadataAuthority(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveMediaMetadataBackendId(env) === 'firestore_legacy';
}

let legacyRepositorySingleton: MediaMetadataRepository | null = null;

export function getMediaMetadataRepository(
  env: Record<string, string | undefined> = process.env,
): MediaMetadataRepository {
  const backend = resolveMediaMetadataBackendId(env);
  if (backend === 'd1') return BLOCKED_D1;
  if (backend === 'memory') {
    return {
      async verifyAvailable() {
        return { ok: true, backend: 'memory' };
      },
      async getById() {
        return null;
      },
      async upsertNativeRecord() {
        /* in-memory metadataStore owns dev writes */
      },
      async deleteById() {},
      async listPage() {
        return { items: [], nextCursor: null, pageSize: 0, partial: false };
      },
    };
  }
  if (!legacyRepositorySingleton) {
    legacyRepositorySingleton = createLegacyFirestoreMediaMetadataRepository();
  }
  return legacyRepositorySingleton;
}

function createLegacyFirestoreMediaMetadataRepository(): MediaMetadataRepository {
  return {
    async verifyAvailable() {
      const check = await verifyMediaFirestoreMetadataAuthority();
      if (check.ok === false) {
        return {
          ok: false,
          backend: 'firestore_legacy',
          code: check.code,
          message: check.message,
        };
      }
      return { ok: true, backend: 'firestore_legacy' };
    },
    async getById(objectId: string) {
      const { fetchMediaMetadataRecordFromFirestore } = await import('./firestoreMetadataAuthority');
      const rec = await fetchMediaMetadataRecordFromFirestore(objectId);
      return rec ? (rec as unknown as Record<string, unknown>) : null;
    },
    async upsertNativeRecord(record: Record<string, unknown>) {
      const { persistMediaMetadataRecordToFirestore, isMediaMetadataRecordPayload } = await import(
        './firestoreMetadataAuthority'
      );
      if (!isMediaMetadataRecordPayload(record)) throw new Error('INVALID_MEDIA_METADATA_RECORD');
      await persistMediaMetadataRecordToFirestore(record);
    },
    async deleteById(objectId: string) {
      const { deleteMediaMetadataRecordFromFirestore } = await import('./firestoreMetadataAuthority');
      await deleteMediaMetadataRecordFromFirestore(objectId);
    },
    async listPage(options) {
      return listLegacyFirestoreMediaMetadataPage(options);
    },
    async warmFirstPage(limit) {
      return listLegacyFirestoreMediaMetadataPage({ limit });
    },
  };
}

export async function verifyMediaDurableMetadataRepository(
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (!isProductionDurableMediaMetadataRequired(env)) return { ok: true };
  const repo = getMediaMetadataRepository(env);
  const health = await repo.verifyAvailable();
  if (!health.ok) {
    return {
      ok: false,
      code: health.code || 'MEDIA_METADATA_REPOSITORY_UNAVAILABLE',
      message: health.message || 'Media metadata repository unavailable.',
    };
  }
  return { ok: true };
}

export async function warmMediaMetadataCacheFirstPage(
  maps: Parameters<typeof hydrateMediaMapsFromFirestore>[0],
  env: Record<string, string | undefined> = process.env,
  limit = 100,
): Promise<{ hydratedCount: number; partial: boolean }> {
  if (!isProductionDurableMediaMetadataRequired(env)) return { hydratedCount: 0, partial: false };
  const backend = resolveMediaMetadataBackendId(env);
  if (backend === 'firestore_legacy') {
    await hydrateMediaMapsFromFirestore(maps, { metadataLimit: limit, grantsLimit: 50, cleanupLimit: 25 });
    const page = await listLegacyFirestoreMediaMetadataPage({ limit });
    return { hydratedCount: maps.metadataMap.size, partial: page.partial || page.nextCursor !== null };
  }
  return { hydratedCount: 0, partial: true };
}

async function listLegacyFirestoreMediaMetadataPage(options?: {
  cursor?: string;
  limit?: number;
}): Promise<import('../shared/persistence/objectMetadataPorts').MetadataPageResult<import('../shared/persistence/objectMetadataPorts').MediaMetadataRevisionRecord>> {
  const { listMediaMetadataPageFromFirestore } = await import('./firestoreMetadataAuthority');
  return listMediaMetadataPageFromFirestore(options);
}