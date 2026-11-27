import crypto from 'crypto';
import { normalizeAndValidateCoordinate, validatePolygonGeometry } from './coordinateAndPolygonEngine';
import { computePoiDedupeKey } from './poiAndSpatialSearchEngine';
import type { UpsertNeighborhoodBoundaryParams } from './geospatialBoundaryMutations';
import type { UpsertPoiParams } from './geospatialPoiOperations';
import type {
  BoundaryVersionRecord,
  GeospatialImportBatchResult,
  GeospatialObservabilityMetrics,
  PoiCategory,
  PolygonGeometry,
  Wgs84Coordinate,
} from './types';

export type ImportGeographicDatasetParams = {
  actorUid: string;
  idempotencyKey: string;
  dryRun?: boolean;
  sourceProvenance: string;
  boundaries?: Array<{
    entityId: string;
    cityId: string;
    districtId?: string;
    hoodId?: number;
    level: BoundaryVersionRecord['level'];
    nameFa: string;
    geometry: PolygonGeometry;
  }>;
  pois?: Array<{
    nameFa: string;
    category: PoiCategory;
    coordinates: Wgs84Coordinate;
    cityId: string;
    hoodId?: number;
  }>;
};

export async function executeImportGeographicDataset(params: {
  input: ImportGeographicDatasetParams;
  boundaryHistoryByEntity: Map<string, BoundaryVersionRecord[]>;
  poiDedupeIndex: Map<string, string>;
  importBatches: Map<string, GeospatialImportBatchResult>;
  metrics: GeospatialObservabilityMetrics;
  nowIso: string;
  upsertNeighborhoodBoundary: (input: UpsertNeighborhoodBoundaryParams) => Promise<BoundaryVersionRecord>;
  upsertPointOfInterest: (input: UpsertPoiParams) => Promise<{ record: unknown; isDuplicate: boolean }>;
  persistRuntime: () => void;
}): Promise<GeospatialImportBatchResult> {
  const input = params.input;
  if (!input.dryRun && params.importBatches.has(input.idempotencyKey)) {
    return structuredClone(params.importBatches.get(input.idempotencyKey)!);
  }

  const failedRecords: Array<{ index: number; reason: string }> = [];
  let importedBoundariesCount = 0;
  let importedPoisCount = 0;
  let duplicateSkippedCount = 0;
  let conflictCount = 0;

  const boundaries = input.boundaries ?? [];
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    const val = validatePolygonGeometry(b.geometry);
    if (!val.valid) {
      failedRecords.push({ index: i, reason: val.issues.map((x) => x.message).join('; ') });
      params.metrics.importFailuresCount += 1;
      continue;
    }
    if (params.boundaryHistoryByEntity.has(b.entityId)) {
      conflictCount += 1;
    }
    if (!input.dryRun) {
      await params.upsertNeighborhoodBoundary({
        actorUid: input.actorUid,
        entityId: b.entityId,
        cityId: b.cityId,
        districtId: b.districtId,
        hoodId: b.hoodId,
        level: b.level,
        nameFa: b.nameFa,
        geometry: b.geometry,
        sourceProvenance: input.sourceProvenance,
        autoApprove: false,
      });
    }
    importedBoundariesCount += 1;
  }

  const pois = input.pois ?? [];
  for (let i = 0; i < pois.length; i++) {
    const p = pois[i];
    const check = normalizeAndValidateCoordinate(p.coordinates.lat, p.coordinates.lng);
    if (!check.valid || !check.coordinate) {
      failedRecords.push({
        index: boundaries.length + i,
        reason: check.errorMessage ?? 'Invalid POI coordinate',
      });
      params.metrics.importFailuresCount += 1;
      continue;
    }
    const dedupeKey = computePoiDedupeKey({
      cityId: p.cityId,
      category: p.category,
      nameFa: p.nameFa,
      coordinates: check.coordinate,
    });
    if (params.poiDedupeIndex.has(dedupeKey)) {
      duplicateSkippedCount += 1;
      continue;
    }
    if (!input.dryRun) {
      await params.upsertPointOfInterest({
        nameFa: p.nameFa,
        category: p.category,
        coordinates: check.coordinate,
        cityId: p.cityId,
        hoodId: p.hoodId,
        sourceProvenance: input.sourceProvenance,
      });
    }
    importedPoisCount += 1;
  }

  const result: GeospatialImportBatchResult = {
    batchId: `gis_imp_${crypto.randomBytes(6).toString('hex')}`,
    idempotencyKey: input.idempotencyKey,
    dryRun: Boolean(input.dryRun),
    status: input.dryRun ? 'PREVIEW_READY' : failedRecords.length > 0 ? 'PARTIAL_WITH_FAILURES' : 'COMMITTED',
    importedBoundariesCount,
    importedPoisCount,
    duplicateSkippedCount,
    conflictCount,
    failedRecords,
    sourceProvenance: input.sourceProvenance,
    processedAtIso: params.nowIso,
  };

  if (!input.dryRun) {
    params.importBatches.set(input.idempotencyKey, result);
    params.persistRuntime();
  }
  return structuredClone(result);
}