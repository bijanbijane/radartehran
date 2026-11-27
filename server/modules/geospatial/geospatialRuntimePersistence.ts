import type {
  BoundaryVersionRecord,
  GeospatialImportBatchResult,
  GeographicOverlayLayer,
  PointOfInterestRecord,
  SpatialPublishableListing,
} from './types';
import {
  hydrateMaps,
  loadGeospatialState,
  persistGeospatialState,
  persistGeospatialStateAwait,
  snapshotFromMaps,
} from './geospatialRepository';

export type GeospatialRuntimeMaps = {
  boundaryHistoryByEntity: Map<string, BoundaryVersionRecord[]>;
  poiStore: Map<string, PointOfInterestRecord>;
  poiDedupeIndex: Map<string, string>;
  spatialListingsByCity: Map<string, Map<string, SpatialPublishableListing>>;
  overlayStore: Map<string, GeographicOverlayLayer>;
  importBatches: Map<string, GeospatialImportBatchResult>;
};

export function hydrateGeospatialRuntimeFromRepository(maps: GeospatialRuntimeMaps): void {
  hydrateMaps(loadGeospatialState(), maps);
}

export function persistGeospatialRuntimeToRepository(maps: GeospatialRuntimeMaps): void {
  persistGeospatialState(snapshotFromMaps(maps));
}

export function createGeospatialPersistHook(maps: GeospatialRuntimeMaps): () => void {
  return () => persistGeospatialRuntimeToRepository(maps);
}

/** Await the durable snapshot commit for lifecycle transitions that must be atomic. */
export function createGeospatialPersistHookAsync(maps: GeospatialRuntimeMaps): () => Promise<void> {
  return async () => persistGeospatialStateAwait(snapshotFromMaps(maps));
}