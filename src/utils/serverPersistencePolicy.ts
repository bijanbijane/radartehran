/**
 * RT-INFRA-006 — Persistence ownership & production container policy (no new storage backend).
 * OP-DEC-001: formatMillionTomanAsIntlCurrency — see areaUnit.ts for UI currency parity.
 */
import type { ObjectStorageProviderId } from './objectStorage';
import type { ResolvedObjectStorageConfig } from './objectStorageUpload';
import { normalizeStorageProvider } from './objectStorageUpload';
import { verifyDurableMetadataRepositoryAvailable } from './serverObjectStorageMetadataRegistry';

export type PersistenceDataClass =
  | 'DURABLE_BUSINESS_DATA'
  | 'USER_UPLOADED_OBJECT'
  | 'OPERATIONAL_CONFIGURATION'
  | 'REBUILDABLE_CACHE'
  | 'TEMPORARY_FILE'
  | 'UNRESOLVED';

/** Documented filesystem locations (see RT-INFRA-006 report). */
export const PERSISTENCE_PATH_CLASSIFICATION: Readonly<
  Record<string, { class: PersistenceDataClass; notes: string }>
> = {
  '.object-storage-bucket/': {
    class: 'USER_UPLOADED_OBJECT',
    notes: 'Local object bytes + index.json; ephemeral in containers unless remote sync succeeds.',
  },
  '.object-storage-bucket/index.json': {
    class: 'REBUILDABLE_CACHE',
    notes: 'Dev/test metadata cache only; production authority is Firestore media_object_metadata_v2.',
  },
  'Firestore:media_object_metadata_v2': {
    class: 'DURABLE_BUSINESS_DATA',
    notes:
      'Shared registry: stored_object_record_v1 (listing API) and media_metadata_native_v1 (media module); bytes on R2/S3.',
  },
  '.runtime-config.json': {
    class: 'OPERATIONAL_CONFIGURATION',
    notes: 'Non-secret admin overrides; production must use env injection (disk load opt-in).',
  },
  '.cache-data.json': {
    class: 'REBUILDABLE_CACHE',
    notes: 'Market pulse, AQI cache, macro rates, in-memory audit ring buffer snapshot.',
  },
  '.cache/repositories/': {
    class: 'UNRESOLVED',
    notes: 'Dev/test local JSON cache; production uses R2 snapshots + Firestore registry (RT-INFRA-008).',
  },
  '.osm-boundaries-cache.json': {
    class: 'REBUILDABLE_CACHE',
    notes: 'OSM boundary fetch cache.',
  },
};

const REMOTE_OBJECT_STORAGE_PROVIDERS = new Set<ObjectStorageProviderId>([
  'arvancloud',
  'liara',
  'minio',
  's3_compatible',
  'r2',
]);

export function isProductionApiRuntime(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === 'production';
}

export function isLocalOnlyObjectStorageProvider(provider: ObjectStorageProviderId): boolean {
  return provider === 'local_bucket';
}

export function isRemoteCapableObjectStorageProvider(provider: ObjectStorageProviderId): boolean {
  return REMOTE_OBJECT_STORAGE_PROVIDERS.has(provider);
}

export function shouldLoadRuntimeConfigFromDisk(env: Record<string, string | undefined> = process.env): boolean {
  if (!isProductionApiRuntime(env)) return true;
  return env.RADAR_ALLOW_RUNTIME_CONFIG_DISK === '1' || env.RADAR_ALLOW_RUNTIME_CONFIG_DISK === 'true';
}

export function requiresRemoteObjectStorage(
  cfg: ResolvedObjectStorageConfig,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!isProductionApiRuntime(env)) return false;
  if (isLocalOnlyObjectStorageProvider(cfg.provider)) return true;
  return isRemoteCapableObjectStorageProvider(cfg.provider);
}

export function assertProductionObjectStorageConfigured(
  cfg: ResolvedObjectStorageConfig,
  env: Record<string, string | undefined> = process.env,
): { ok: true } | { ok: false; code: string; message: string } {
  if (!isProductionApiRuntime(env)) return { ok: true };
  if (isLocalOnlyObjectStorageProvider(cfg.provider)) {
    return {
      ok: false,
      code: 'LOCAL_OBJECT_STORAGE_FORBIDDEN_IN_PRODUCTION',
      message: 'Object storage provider local_bucket is not permitted in production API runtime.',
    };
  }
  if (!isRemoteCapableObjectStorageProvider(cfg.provider)) {
    return {
      ok: false,
      code: 'OBJECT_STORAGE_PROVIDER_UNSUPPORTED',
      message: 'Configured object storage provider does not support remote S3-compatible persistence.',
    };
  }
  if (!cfg.s3CredentialsConfigured) {
    return {
      ok: false,
      code: 'OBJECT_STORAGE_NOT_CONFIGURED',
      message: 'Production object storage requires S3-compatible credentials (OBJECT_STORAGE_* or R2_* env vars).',
    };
  }
  if (!cfg.bucket || !cfg.endpoint) {
    return {
      ok: false,
      code: 'OBJECT_STORAGE_ENDPOINT_NOT_CONFIGURED',
      message: 'OBJECT_STORAGE_BUCKET and OBJECT_STORAGE_ENDPOINT must be set for production.',
    };
  }
  return { ok: true };
}

export async function validateApiPersistenceOnBootstrap(
  cfg: ResolvedObjectStorageConfig,
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: boolean; issues: Array<{ code: string; severity: 'error' | 'warn'; message: string }> }> {
  const issues: Array<{ code: string; severity: 'error' | 'warn'; message: string }> = [];
  if (isProductionApiRuntime(env) && !shouldLoadRuntimeConfigFromDisk(env)) {
    issues.push({
      code: 'RUNTIME_CONFIG_DISK_DISABLED',
      severity: 'warn',
      message: 'Production uses process.env for runtime configuration; .runtime-config.json disk overrides are disabled.',
    });
  }
  const storageCheck = assertProductionObjectStorageConfigured(cfg, env);
  if (!storageCheck.ok) {
    issues.push({ code: storageCheck.code, severity: 'error', message: storageCheck.message });
  }
  if (env.RADAR_STRICT_PERSISTENCE === '1' && isProductionApiRuntime(env)) {
    const { verifyObjectStorageDurableMetadataRepository } = await import(
      '../../server/modules/shared/persistence/resolveObjectStorageMetadataRepository'
    );
    const metadataCheck = await verifyObjectStorageDurableMetadataRepository(env);
    if (!metadataCheck.ok) {
      issues.push({ code: metadataCheck.code, severity: 'error', message: metadataCheck.message });
    }
    if (env.RADAR_OBJECT_METADATA_LOCAL_INDEX === '1') {
      issues.push({
        code: 'LOCAL_METADATA_INDEX_FORBIDDEN',
        severity: 'error',
        message: 'RADAR_OBJECT_METADATA_LOCAL_INDEX=1 is prohibited when RADAR_STRICT_PERSISTENCE=1.',
      });
    }
    const { verifyDurableRepositorySnapshotStore } = await import('../../server/modules/shared/repositoryPersistencePolicy');
    const repoStore = await verifyDurableRepositorySnapshotStore(env);
    if (!repoStore.ok) {
      issues.push({ code: repoStore.code, severity: 'error', message: repoStore.message });
    }
    if (env.RADAR_REPOSITORY_LOCAL_JSON === '1') {
      issues.push({
        code: 'LOCAL_REPOSITORY_JSON_FORBIDDEN',
        severity: 'error',
        message: 'RADAR_REPOSITORY_LOCAL_JSON=1 is prohibited when RADAR_STRICT_PERSISTENCE=1.',
      });
    }
    const { verifyMediaDurableMetadataRepository } = await import(
      '../../server/modules/media/durableMediaMetadataRepository'
    );
    const mediaMeta = await verifyMediaDurableMetadataRepository(env);
    if (!mediaMeta.ok) {
      issues.push({ code: mediaMeta.code, severity: 'error', message: mediaMeta.message });
    }
    if (env.RADAR_MEDIA_METADATA_LOCAL_ONLY === '1') {
      issues.push({
        code: 'LOCAL_MEDIA_METADATA_FORBIDDEN',
        severity: 'error',
        message: 'RADAR_MEDIA_METADATA_LOCAL_ONLY=1 is prohibited when RADAR_STRICT_PERSISTENCE=1.',
      });
    }
  }
  return { ok: issues.every((i) => i.severity !== 'error'), issues };
}

export function normalizeStorageProviderFromEnv(
  raw: string | undefined,
  env: Record<string, string | undefined> = process.env,
): ObjectStorageProviderId {
  return normalizeStorageProvider(raw ?? (env.OBJECT_STORAGE_PROVIDER || 'arvan'));
}