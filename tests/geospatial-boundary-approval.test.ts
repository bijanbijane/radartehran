import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createGeospatialService } from '../server/modules/geospatial/service';
import { CoreApiError } from '../server/modules/core';
import {
  executeApproveNeighborhoodBoundary,
  executeUpsertNeighborhoodBoundary,
} from '../server/modules/geospatial/geospatialBoundaryMutations';
import { calculateNeighborhoodBoundaryGeometrySha256 } from '../server/modules/geospatial/neighborhoodProfileBoundaryReadModel';
import type { BoundaryVersionRecord, GeospatialObservabilityMetrics, PolygonGeometry } from '../server/modules/geospatial/types';
import { resetGeospatialRepositoryForTests } from '../server/modules/geospatial/geospatialRepository';
import { setRepositoryBaseDirForTests } from '../server/modules/shared/atomicJsonRepository';

async function testPendingBoundaryNotActive() {
  const tmp = path.join(os.tmpdir(), `gis-boundary-${Date.now()}`);
  setRepositoryBaseDirForTests(tmp);
  resetGeospatialRepositoryForTests();
  const svc = createGeospatialService();
  const rec = await svc.upsertNeighborhoodBoundary({
    actorUid: 'creator',
    entityId: 'hood:tehran:1',
    cityId: 'tehran',
    hoodId: 1,
    level: 'neighborhood',
    nameFa: 'تست',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [51.3, 35.7],
          [51.3, 35.71],
          [51.31, 35.71],
          [51.31, 35.7],
          [51.3, 35.7],
        ],
      ],
    },
    sourceProvenance: 'test',
    autoApprove: false,
  });
  assert.equal(rec.status, 'PENDING_REVIEW');
  assert.equal(svc.getActiveBoundary('hood:tehran:1'), null);
  assert.ok(svc.getLatestBoundaryVersion('hood:tehran:1'));
  setRepositoryBaseDirForTests(null);
  resetGeospatialRepositoryForTests();
}

async function testDuplicateActiveHistoryRequiresIndependentRepair() {
  const entityId = 'hood:tehran:77';
  const geometry: PolygonGeometry = {
    type: 'Polygon',
    coordinates: [[
      [51.30, 35.70],
      [51.40, 35.70],
      [51.40, 35.80],
      [51.30, 35.80],
      [51.30, 35.70],
    ]],
  };
  const makeActive = (version: number): BoundaryVersionRecord => ({
    id: `bnd_hood_tehran_77_v${version}`,
    entityId,
    cityId: 'tehran',
    hoodId: 77,
    level: 'neighborhood',
    nameFa: 'محلهٔ آزمون ۷۷',
    version,
    status: 'ACTIVE',
    geometry: structuredClone(geometry),
    geometrySha256: calculateNeighborhoodBoundaryGeometrySha256(geometry),
    geometryCrs: 'EPSG:4326',
    simplifiedGeometry: structuredClone(geometry),
    boundingBox: { minLat: 35.70, maxLat: 35.80, minLng: 51.30, maxLng: 51.40 },
    sourceProvenance: 'duplicate_active_history_test',
    createdByUid: 'original-creator',
    createdAtIso: '2026-11-20T00:00:00.000Z',
    reviewedByUid: 'previous-reviewer',
    reviewedAtIso: '2026-11-21T00:00:00.000Z',
  });
  const history = [makeActive(1), makeActive(2)];
  const boundaryHistoryByEntity = new Map<string, BoundaryVersionRecord[]>([[entityId, history]]);
  const activeBoundaryLocks = new Set<string>();
  const metrics: GeospatialObservabilityMetrics = {
    spatialQueriesCount: 0,
    totalQueryLatencyMs: 0,
    pointResolutionFailuresCount: 0,
    invalidGeometryEventsCount: 0,
    importFailuresCount: 0,
    cacheHitsCount: 0,
    cacheMissesCount: 0,
    geocodingErrorsCount: 0,
  };
  const common = {
    boundaryHistoryByEntity,
    activeBoundaryLocks,
    nowIso: '2026-11-27T00:00:00.000Z',
    invalidateGeoCaches: (_cityId: string) => {},
    persistRuntime: async () => {},
  };

  await assert.rejects(
    () => executeUpsertNeighborhoodBoundary({
      ...common,
      input: {
        actorUid: 'new-creator',
        entityId,
        cityId: 'tehran',
        hoodId: 77,
        level: 'neighborhood',
        nameFa: 'محلهٔ آزمون ۷۷',
        geometry,
        sourceProvenance: 'duplicate_active_history_test',
      },
      metrics,
    }),
    (error: unknown) => error instanceof CoreApiError && error.status === 409,
  );
  assert.equal(history.filter((record) => record.status === 'ACTIVE').length, 2);

  const pending = await executeUpsertNeighborhoodBoundary({
    ...common,
    input: {
      actorUid: 'new-creator',
      entityId,
      cityId: 'tehran',
      hoodId: 77,
      level: 'neighborhood',
      nameFa: 'محلهٔ آزمون ۷۷',
      geometry,
      sourceProvenance: 'duplicate_active_history_test',
      autoApprove: false,
    },
    metrics,
  });
  assert.equal(pending.status, 'PENDING_REVIEW');
  assert.equal(pending.previousVersionId, undefined);
  assert.equal(history.filter((record) => record.status === 'ACTIVE').length, 2);

  const approved = await executeApproveNeighborhoodBoundary({
    ...common,
    input: { entityId, versionId: pending.id, reviewerUid: 'independent-reviewer' },
  });
  assert.equal(approved.status, 'ACTIVE');
  // Lifecycle writes replace the detached history only after durable persistence succeeds.
  // Assert against the canonical map entry, not the intentionally unchanged pre-mutation array.
  const approvedHistory = boundaryHistoryByEntity.get(entityId) ?? [];
  assert.equal(approvedHistory.filter((record) => record.status === 'ACTIVE').length, 1);
  assert.equal(approvedHistory.filter((record) => record.status === 'SUPERSEDED').length, 2);

  // A failed durable write must restore the exact pre-mutation lifecycle for upserts.
  const rollbackActive = makeActive(1);
  const rollbackUpsertHistory = [rollbackActive];
  const rollbackUpsertStore = new Map<string, BoundaryVersionRecord[]>([[entityId, rollbackUpsertHistory]]);
  const persistenceError = new Error('simulated durable snapshot failure');
  await assert.rejects(
    () => executeUpsertNeighborhoodBoundary({
      ...common,
      boundaryHistoryByEntity: rollbackUpsertStore,
      persistRuntime: async () => { throw persistenceError; },
      input: {
        actorUid: 'replacement-creator',
        entityId,
        cityId: 'tehran',
        hoodId: 77,
        level: 'neighborhood',
        nameFa: 'نسخهٔ جایگزین',
        geometry,
        sourceProvenance: 'persistence_rollback_test',
      },
      metrics,
    }),
    (error: unknown) => error === persistenceError,
  );
  assert.equal(rollbackUpsertStore.get(entityId), rollbackUpsertHistory);
  assert.equal(rollbackUpsertHistory.length, 1);
  assert.equal(rollbackUpsertHistory[0].status, 'ACTIVE');

  // A failed approval write must not supersede the prior active boundary in memory.
  const approvalActive = makeActive(1);
  const approvalPending: BoundaryVersionRecord = {
    ...makeActive(2),
    status: 'PENDING_REVIEW',
    createdByUid: 'new-creator',
    reviewedByUid: undefined,
    reviewedAtIso: undefined,
  };
  const rollbackApprovalHistory = [approvalActive, approvalPending];
  const rollbackApprovalStore = new Map<string, BoundaryVersionRecord[]>([[entityId, rollbackApprovalHistory]]);
  await assert.rejects(
    () => executeApproveNeighborhoodBoundary({
      ...common,
      boundaryHistoryByEntity: rollbackApprovalStore,
      persistRuntime: async () => { throw persistenceError; },
      input: { entityId, versionId: approvalPending.id, reviewerUid: 'independent-reviewer' },
    }),
    (error: unknown) => error === persistenceError,
  );
  assert.equal(rollbackApprovalStore.get(entityId), rollbackApprovalHistory);
  assert.equal(rollbackApprovalHistory[0].status, 'ACTIVE');
  assert.equal(rollbackApprovalHistory[1].status, 'PENDING_REVIEW');
}

void (async () => {
  await testPendingBoundaryNotActive();
  await testDuplicateActiveHistoryRequiresIndependentRepair();
  console.log('geospatial-boundary-approval: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});