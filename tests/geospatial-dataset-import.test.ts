import assert from 'node:assert/strict';
import test from 'node:test';
import { executeImportGeographicDataset } from '../server/modules/geospatial/geospatialDatasetImport';
import type { GeospatialImportBatchResult, GeospatialObservabilityMetrics } from '../server/modules/geospatial/types';

function createParams(
  importBatches: Map<string, GeospatialImportBatchResult>,
  persistRuntime: () => Promise<void>,
) {
  return {
    input: {
      actorUid: 'gis-operator',
      idempotencyKey: 'dataset-import-001',
      sourceProvenance: 'regression-test',
    },
    boundaryHistoryByEntity: new Map(),
    poiDedupeIndex: new Map(),
    importBatches,
    metrics: {} as GeospatialObservabilityMetrics,
    nowIso: '2026-11-27T00:00:00.000Z',
    upsertNeighborhoodBoundary: async () => { throw new Error('unexpected boundary write'); },
    upsertPointOfInterest: async () => { throw new Error('unexpected POI write'); },
    persistRuntime,
  };
}

test('dataset import waits for durable batch persistence before returning COMMITTED', async () => {
  const batches = new Map<string, GeospatialImportBatchResult>();
  let persistenceFinished = false;
  const result = await executeImportGeographicDataset(createParams(batches, async () => {
    await Promise.resolve();
    persistenceFinished = true;
  }));

  assert.equal(persistenceFinished, true);
  assert.equal(result.status, 'COMMITTED');
  assert.equal(batches.get('dataset-import-001')?.batchId, result.batchId);
});

test('dataset import rejects and rolls back batch metadata when durable persistence fails', async () => {
  const batches = new Map<string, GeospatialImportBatchResult>();
  await assert.rejects(
    executeImportGeographicDataset(createParams(batches, async () => {
      throw new Error('snapshot persistence failed');
    })),
    /snapshot persistence failed/,
  );
  assert.equal(batches.has('dataset-import-001'), false);
});
