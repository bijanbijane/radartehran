/** Shared types for durable GIS snapshot assessment and recovery. */
export type GeospatialPersistenceHealth = 'READY' | 'DEGRADED' | 'BLOCKED' | 'RECOVERING';

export interface GeospatialRecordCounts {
  boundaryEntities: number;
  activeBoundaries: number;
  poiRecords: number;
  spatialListingCities: number;
  spatialListings: number;
  overlayLayers: number;
  importBatches: number;
}

export interface GeospatialRecoveryReport {
  health: GeospatialPersistenceHealth;
  schemaVersion: string;
  snapshotRevision?: number;
  recordCounts: GeospatialRecordCounts;
  validationErrors: string[];
  recoveryRequirement?: string;
  activated: boolean;
}
