import type {
  BoundaryVersionRecord,
  GeospatialImportBatchResult,
  GeospatialObservabilityMetrics,
  GeographicOverlayLayer,
  PointOfInterestRecord,
  SpatialPublishableListing,
} from './types';

export interface GeospatialRuntimeMaps {
  boundaryHistoryByEntity: Map<string, BoundaryVersionRecord[]>;
  poiStore: Map<string, PointOfInterestRecord>;
  poiDedupeIndex: Map<string, string>;
  spatialListingsByCity: Map<string, Map<string, SpatialPublishableListing>>;
  overlayStore: Map<string, GeographicOverlayLayer>;
  importBatches: Map<string, GeospatialImportBatchResult>;
}

export type GeospatialMetrics = GeospatialObservabilityMetrics;