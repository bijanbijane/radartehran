/**
 * RT-INFRA-011 — Database-independent object-storage metadata backend resolution.
 */
import type { MetadataRepositoryBackendId } from './objectMetadataPorts';
import { isDurableObjectMetadataProductionMode } from '../../../../src/utils/serverObjectStorageMetadataRegistry';

export function resolveObjectStorageMetadataBackendId(
  env: Record<string, string | undefined> = process.env,
): MetadataRepositoryBackendId {
  const raw = (env.RADAR_OBJECT_METADATA_BACKEND || '').trim().toLowerCase();
  if (raw === 'memory' || raw === 'd1' || raw === 'firestore_legacy') return raw;
  if (env.RADAR_OBJECT_METADATA_LOCAL_INDEX === '1') return 'memory';
  if (env.NODE_ENV === 'production') return 'firestore_legacy';
  return 'memory';
}

export async function verifyObjectStorageDurableMetadataRepository(
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (!isDurableObjectMetadataProductionMode(env)) return { ok: true };
  const backend = resolveObjectStorageMetadataBackendId(env);
  if (backend === 'd1') {
    return {
      ok: false,
      code: 'OBJECT_METADATA_D1_EXPRESS_ADAPTER_BLOCKED',
      message:
        'D1 is the approved target for media_objects (migration 0003) but Express object-metadata D1 adapter is not cut over.',
    };
  }
  if (backend === 'memory' && env.RADAR_STRICT_PERSISTENCE === '1') {
    return {
      ok: false,
      code: 'OBJECT_METADATA_LOCAL_INDEX_FORBIDDEN',
      message: 'Local index metadata is not permitted under RADAR_STRICT_PERSISTENCE=1.',
    };
  }
  const { verifyDurableMetadataRepositoryAvailable } = await import(
    '../../../../src/utils/serverObjectStorageMetadataRegistry'
  );
  return verifyDurableMetadataRepositoryAvailable(env);
}