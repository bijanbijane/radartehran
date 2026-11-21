import type {
  BoundaryVersionRecord,
  GeospatialImportBatchResult,
  GeographicOverlayLayer,
  PointOfInterestRecord,
  SpatialPublishableListing,
} from './types';
import { AtomicJsonRepository } from '../shared/atomicJsonRepository';

export interface PersistedGeospatialState {
  boundaryHistoryByEntity: Record<string, BoundaryVersionRecord[]>;
  poiStore: Record<string, PointOfInterestRecord>;
  poiDedupeIndex: Record<string, string>;
  spatialListingsByCity: Record<string, Record<string, SpatialPublishableListing>>;
  overlayStore: Record<string, GeographicOverlayLayer>;
  importBatches: Record<string, GeospatialImportBatchResult>;
}

const geoRepo = new AtomicJsonRepository<PersistedGeospatialState>('geospatial-state.json');

function defaultState(): PersistedGeospatialState {
  return {
    boundaryHistoryByEntity: {},
    poiStore: {},
    poiDedupeIndex: {},
    spatialListingsByCity: {},
    overlayStore: {},
    importBatches: {},
  };
}

export function loadGeospatialState(): PersistedGeospatialState {
  return geoRepo.load(defaultState);
}

export async function ensureGeospatialRepositoryHydrated(): Promise<PersistedGeospatialState> {
  const { loadRepositorySnapshot, getRepositorySnapshotRegistryMeta } = await import(
    '../shared/durableRepositorySnapshotStore'
  );
  const { isDurableRepositoryProductionMode } = await import('../shared/repositoryPersistencePolicy');
  const { runGeospatialDurableRecovery } = await import('./geospatialDurableRecovery');

  const hydrated = await geoRepo.ensureRemoteHydrated(defaultState);
  if (!isDurableRepositoryProductionMode()) return hydrated;

  const remoteRaw = await loadRepositorySnapshot('geospatial-state.json');
  const meta = await getRepositorySnapshotRegistryMeta('geospatial-state.json');
  const report = await runGeospatialDurableRecovery({
    hydratedState: hydrated,
    remoteSnapshotPresent: Boolean(remoteRaw && remoteRaw.trim()),
    snapshotRevision: meta?.revision,
    activateOnSuccess: false,
  });

  return report.health === 'READY' ? hydrated : defaultState();
}

export function persistGeospatialState(state: PersistedGeospatialState): void {
  geoRepo.writeImmediate(state);
}

export async function persistGeospatialStateAwait(state: PersistedGeospatialState): Promise<void> {
  await geoRepo.writeImmediateAwait(state);
}

export function resetGeospatialRepositoryForTests(): void {
  geoRepo.resetInMemoryCacheForTests();
}

export function snapshotFromMaps(maps: {
  boundaryHistoryByEntity: Map<string, BoundaryVersionRecord[]>;
  poiStore: Map<string, PointOfInterestRecord>;
  poiDedupeIndex: Map<string, string>;
  spatialListingsByCity: Map<string, Map<string, SpatialPublishableListing>>;
  overlayStore: Map<string, GeographicOverlayLayer>;
  importBatches: Map<string, GeospatialImportBatchResult>;
}): PersistedGeospatialState {
  const spatialListingsByCity: Record<string, Record<string, SpatialPublishableListing>> = {};
  for (const [cityId, inner] of maps.spatialListingsByCity.entries()) {
    spatialListingsByCity[cityId] = Object.fromEntries(inner.entries());
  }
  return {
    boundaryHistoryByEntity: Object.fromEntries(maps.boundaryHistoryByEntity.entries()),
    poiStore: Object.fromEntries(maps.poiStore.entries()),
    poiDedupeIndex: Object.fromEntries(maps.poiDedupeIndex.entries()),
    spatialListingsByCity,
    overlayStore: Object.fromEntries(maps.overlayStore.entries()),
    importBatches: Object.fromEntries(maps.importBatches.entries()),
  };
}

export function hydrateMaps(
  state: PersistedGeospatialState,
  maps: {
    boundaryHistoryByEntity: Map<string, BoundaryVersionRecord[]>;
    poiStore: Map<string, PointOfInterestRecord>;
    poiDedupeIndex: Map<string, string>;
    spatialListingsByCity: Map<string, Map<string, SpatialPublishableListing>>;
    overlayStore: Map<string, GeographicOverlayLayer>;
    importBatches: Map<string, GeospatialImportBatchResult>;
  },
): void {
  for (const [k, v] of Object.entries(state.boundaryHistoryByEntity)) maps.boundaryHistoryByEntity.set(k, v);
  for (const [k, v] of Object.entries(state.poiStore)) maps.poiStore.set(k, v);
  for (const [k, v] of Object.entries(state.poiDedupeIndex)) maps.poiDedupeIndex.set(k, v);
  for (const [k, v] of Object.entries(state.spatialListingsByCity)) {
    maps.spatialListingsByCity.set(k, new Map(Object.entries(v)));
  }
  for (const [k, v] of Object.entries(state.overlayStore)) maps.overlayStore.set(k, v);
  for (const [k, v] of Object.entries(state.importBatches)) maps.importBatches.set(k, v);
}