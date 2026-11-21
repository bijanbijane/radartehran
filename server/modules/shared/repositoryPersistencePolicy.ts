/**
 * RT-INFRA-008 — JSON repository ownership & production persistence policy.
 */
import { assertProductionObjectStorageConfigured } from '../../../src/utils/serverPersistencePolicy';
import { resolveObjectStorageRuntimeConfig } from '../../../src/utils/objectStorageUpload';

export type RepositoryPersistenceClass =
  | 'AUTHORITATIVE_BUSINESS_DATA'
  | 'DERIVED_SEARCH_INDEX'
  | 'DERIVED_GEOSPATIAL_INDEX'
  | 'REBUILDABLE_CACHE'
  | 'TEMPORARY_STATE'
  | 'UNRESOLVED';

export const REPOSITORY_FILE_CLASSIFICATION: Readonly<
  Record<string, { class: RepositoryPersistenceClass; sourceOfTruth: string }>
> = {
  'search-index-state.json': {
    class: 'DERIVED_SEARCH_INDEX',
    sourceOfTruth: 'ProductionSearchDocumentSource + reindex jobs (Firestore bargains/catalog)',
  },
  'search-workspace-state.json': {
    class: 'AUTHORITATIVE_BUSINESS_DATA',
    sourceOfTruth: 'Per-user workspace snapshot (saved searches, history, preferences)',
  },
  'geospatial-state.json': {
    class: 'AUTHORITATIVE_BUSINESS_DATA',
    sourceOfTruth: 'Admin boundary workflow, POI imports, spatial listing projections',
  },
  'analytics-research-state.json': {
    class: 'REBUILDABLE_CACHE',
    sourceOfTruth: 'Analytics engine inputs + recomputable aggregates',
  },
  'data-governance-state.json': {
    class: 'AUTHORITATIVE_BUSINESS_DATA',
    sourceOfTruth: 'Data governance claims and lineage registry',
  },
  'comms-state.json': {
    class: 'TEMPORARY_STATE',
    sourceOfTruth: 'Ephemeral comms routing snapshot',
  },
  'account-admin-state.json': {
    class: 'AUTHORITATIVE_BUSINESS_DATA',
    sourceOfTruth: 'Account admin operational snapshot',
  },
};

export const DURABLE_REPOSITORY_REGISTRY_COLLECTION = 'radar_repository_snapshots_v1';

export function isDurableRepositoryProductionMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.PREVENT_PROD_FIREBASE_IN_TEST === 'true') return false;
  if (env.RADAR_REPOSITORY_LOCAL_JSON === '1') return false;
  return env.NODE_ENV === 'production';
}

export function isRebuildableRepository(fileName: string): boolean {
  const meta = REPOSITORY_FILE_CLASSIFICATION[fileName];
  return (
    meta?.class === 'DERIVED_SEARCH_INDEX' ||
    meta?.class === 'DERIVED_GEOSPATIAL_INDEX' ||
    meta?.class === 'REBUILDABLE_CACHE'
  );
}

export function classifyRepositoryFile(fileName: string): RepositoryPersistenceClass {
  return REPOSITORY_FILE_CLASSIFICATION[fileName]?.class ?? 'UNRESOLVED';
}

export async function verifyDurableRepositorySnapshotStore(
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (!isDurableRepositoryProductionMode(env)) return { ok: true };
  const storage = assertProductionObjectStorageConfigured(resolveObjectStorageRuntimeConfig(env), env);
  if (!storage.ok) return storage;
  const projectId = (env.FIREBASE_PROJECT_ID || '').trim();
  if (!projectId) {
    return {
      ok: false,
      code: 'FIRESTORE_PROJECT_NOT_CONFIGURED',
      message: 'FIREBASE_PROJECT_ID is required for durable repository snapshots in production.',
    };
  }
  const { verifyRepositorySnapshotBackend } = await import('./durableRepositorySnapshotStore');
  return verifyRepositorySnapshotBackend(env);
}