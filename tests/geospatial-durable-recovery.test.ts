/**
 * RT-INFRA-009 — geospatial durable recovery & migration dry-run.
 */
import assert from 'node:assert/strict';
import {
  assessGeospatialSnapshot,
  activateStagedGeospatialSnapshot,
  resetGeospatialRecoveryStateForTests,
  runGeospatialDurableRecovery,
  stageGeospatialSnapshotForActivation,
  validatePersistedGeospatialState,
  type GeospatialRecordCounts,
} from '../server/modules/geospatial/geospatialDurableRecovery';
import type { PersistedGeospatialState } from '../server/modules/geospatial/geospatialRepository';
import {
  runGeospatialOperatorMigration,
  runGeospatialRepositoryMigration,
} from '../server/modules/shared/geospatialRepositoryMigration';
import { runRepositorySnapshotMigrationDryRun } from '../server/modules/shared/repositorySnapshotMigration';
import { setRepositorySnapshotBackendForTests } from '../server/modules/shared/durableRepositorySnapshotStore';

function sampleState(): PersistedGeospatialState {
  const boundaryId = 'bnd-1';
  return {
    boundaryHistoryByEntity: {
      'hood-tehran-1': [
        {
          id: boundaryId,
          entityId: 'hood-tehran-1',
          cityId: 'tehran',
          hoodId: 1,
          level: 'neighborhood',
          nameFa: 'تست',
          version: 1,
          status: 'ACTIVE',
          geometry: {
            type: 'Polygon',
            coordinates: [[[51.3, 35.7], [51.31, 35.7], [51.31, 35.71], [51.3, 35.71], [51.3, 35.7]]],
          },
          simplifiedGeometry: {
            type: 'Polygon',
            coordinates: [[[51.3, 35.7], [51.31, 35.7], [51.31, 35.71], [51.3, 35.71], [51.3, 35.7]]],
          },
          boundingBox: { minLat: 35.7, maxLat: 35.71, minLng: 51.3, maxLng: 51.31 },
          sourceProvenance: 'test',
          createdByUid: 'admin',
          createdAtIso: new Date().toISOString(),
        },
      ],
    },
    poiStore: {},
    poiDedupeIndex: {},
    spatialListingsByCity: {},
    overlayStore: {},
    importBatches: {},
  };
}

async function runTests(): Promise<void> {
  resetGeospatialRecoveryStateForTests();

  const empty = assessGeospatialSnapshot(
    {
      boundaryHistoryByEntity: {},
      poiStore: {},
      poiDedupeIndex: {},
      spatialListingsByCity: {},
      overlayStore: {},
      importBatches: {},
    },
    { remoteSnapshotPresent: false },
  );
  assert.equal(empty.health, 'BLOCKED');
  assert.ok(empty.recoveryRequirement);

  const valid = validatePersistedGeospatialState(sampleState());
  assert.equal(valid.valid, true);

  const ready = assessGeospatialSnapshot(sampleState(), { remoteSnapshotPresent: true, snapshotRevision: 3 });
  assert.equal(ready.health, 'READY');

  const blockedReport = await runGeospatialDurableRecovery({
    hydratedState: {
      boundaryHistoryByEntity: {},
      poiStore: {},
      poiDedupeIndex: {},
      spatialListingsByCity: {},
      overlayStore: {},
      importBatches: {},
    },
    remoteSnapshotPresent: false,
    activateOnSuccess: false,
  });
  assert.equal(blockedReport.health, 'BLOCKED');
  assert.equal(blockedReport.activated, false);

  resetGeospatialRecoveryStateForTests();
  stageGeospatialSnapshotForActivation(sampleState());
  let persisted: PersistedGeospatialState | null = null;
  const activated = await activateStagedGeospatialSnapshot({
    persist: async (state) => {
      persisted = state;
    },
  });
  assert.equal(activated.health, 'READY');
  assert.equal(activated.activated, true);
  assert.ok(persisted);

  const migration = await runGeospatialOperatorMigration({ dryRun: true });
  assert.equal(migration.mode, 'DRY_RUN');
  assert.equal(migration.executeAuthorized, false);
  assert.ok(
    ['SKIP', 'WOULD_UPLOAD', 'REJECTED_INVALID', 'CONFLICT'].includes(migration.action),
  );

  const executeWithoutFlag = await runGeospatialOperatorMigration({
    dryRun: false,
    execute: true,
    authorizeProduction: false,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  assert.equal(executeWithoutFlag.action, 'PRODUCTION_NOT_AUTHORIZED');

  const dryRunAll = await runRepositorySnapshotMigrationDryRun({
    fileNames: ['geospatial-state.json'],
  });
  assert.ok(dryRunAll.geospatialPreMigration);

  setRepositorySnapshotBackendForTests(null);

  console.log('[PASS] geospatial-durable-recovery.test.ts');
}

runTests().catch((error) => {
  console.error('[FAIL] geospatial-durable-recovery.test.ts', error);
  process.exit(1);
});