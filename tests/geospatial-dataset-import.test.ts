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
    activeImportKeys: new Set<string>(),
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

test('concurrent dataset imports with the same idempotency key conflict until the first commit finishes', async () => {
  const batches = new Map<string, GeospatialImportBatchResult>();
  let releasePersistence!: () => void;
  let signalPersistenceStarted!: () => void;
  const persistenceStarted = new Promise<void>((resolve) => { signalPersistenceStarted = resolve; });
  const persistenceGate = new Promise<void>((resolve) => { releasePersistence = resolve; });
  const params = createParams(batches, async () => {
    signalPersistenceStarted();
    await persistenceGate;
  });
  const firstImport = executeImportGeographicDataset(params);
  await persistenceStarted;

  await assert.rejects(
    executeImportGeographicDataset(params),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 409);
      assert.match((error as Error).message, /already in progress/);
      return true;
    },
  );

  releasePersistence();
  const committed = await firstImport;
  const retry = await executeImportGeographicDataset(params);
  assert.equal(retry.batchId, committed.batchId);
  assert.equal(batches.get('dataset-import-001')?.batchId, committed.batchId);
});

test('dataset import rejects an empty idempotency key', async () => {
  const params = createParams(new Map(), async () => {});
  params.input.idempotencyKey = '   ';
  await assert.rejects(
    executeImportGeographicDataset(params),
    (error: unknown) => (error as { status?: number }).status === 400,
  );
});
