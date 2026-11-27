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
import type { BoundaryVersionRecord } from '../server/modules/geospatial/types';
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

  const duplicateActive = sampleState();
  const originalActive = duplicateActive.boundaryHistoryByEntity['hood-tehran-1'][0];
  duplicateActive.boundaryHistoryByEntity['hood-tehran-1'].push({
    ...structuredClone(originalActive),
    id: 'bnd-duplicate-active',
    version: 2,
  });
  const duplicateActiveReport = validatePersistedGeospatialState(duplicateActive);
  assert.equal(duplicateActiveReport.valid, false);
  assert.ok(duplicateActiveReport.errors.includes('BOUNDARY_MULTIPLE_ACTIVE_VERSIONS:hood-tehran-1'));
  assert.equal(assessGeospatialSnapshot(duplicateActive, { remoteSnapshotPresent: true }).health, 'BLOCKED');

  const entityMismatch = sampleState();
  entityMismatch.boundaryHistoryByEntity['hood-tehran-1'][0].entityId = 'hood-tehran-99';
  assert.ok(validatePersistedGeospatialState(entityMismatch).errors.some(
    (error) => error.startsWith('BOUNDARY_ENTITY_KEY_MISMATCH:'),
  ));

  const unordered = sampleState();
  const firstBoundary = unordered.boundaryHistoryByEntity['hood-tehran-1'][0];
  unordered.boundaryHistoryByEntity['hood-tehran-1'].push(
    { ...structuredClone(firstBoundary), id: 'bnd-v3', version: 3, status: 'SUPERSEDED' },
    { ...structuredClone(firstBoundary), id: 'bnd-v2', version: 2, status: 'SUPERSEDED' },
  );
  assert.ok(validatePersistedGeospatialState(unordered).errors.includes(
    'BOUNDARY_VERSION_SEQUENCE_INVALID:hood-tehran-1',
  ));

  const malformedHistory = sampleState();
  (malformedHistory.boundaryHistoryByEntity as unknown as Record<string, unknown>)['hood-tehran-1'] = null;
  assert.doesNotThrow(() => validatePersistedGeospatialState(malformedHistory));
  assert.ok(validatePersistedGeospatialState(malformedHistory).errors.includes(
    'BOUNDARY_HISTORY_NOT_ARRAY:hood-tehran-1',
  ));

  const malformedRecord = sampleState();
  malformedRecord.boundaryHistoryByEntity['hood-tehran-1'].push(null as unknown as BoundaryVersionRecord);
  assert.doesNotThrow(() => validatePersistedGeospatialState(malformedRecord));
  assert.ok(validatePersistedGeospatialState(malformedRecord).errors.includes(
    'BOUNDARY_RECORD_NOT_OBJECT:hood-tehran-1',
  ));

  const lateCorruption = sampleState();
  for (let i = 0; i < 55; i += 1) lateCorruption.boundaryHistoryByEntity[`hood-tehran-${i + 2}`] = [];
  (lateCorruption.boundaryHistoryByEntity as unknown as Record<string, unknown>)['hood-tehran-56'] = null;
  assert.ok(validatePersistedGeospatialState(lateCorruption).errors.includes(
    'BOUNDARY_HISTORY_NOT_ARRAY:hood-tehran-56',
  ));

  const longHistory = sampleState();
  const longRecord = longHistory.boundaryHistoryByEntity['hood-tehran-1'][0];
  for (let version = 2; version <= 25; version += 1) {
    longHistory.boundaryHistoryByEntity['hood-tehran-1'].push({
      ...structuredClone(longRecord),
      id: `bnd-long-v${version}`,
      version,
      status: 'SUPERSEDED',
    });
  }
  longHistory.boundaryHistoryByEntity['hood-tehran-1'][24].boundingBox = null as unknown as BoundaryVersionRecord['boundingBox'];
  assert.ok(validatePersistedGeospatialState(longHistory).errors.some(
    (error) => error.startsWith('BOUNDARY_BBOX_INVALID:'),
  ));


  const malformedGeometry = sampleState();
  malformedGeometry.boundaryHistoryByEntity['hood-tehran-1'][0].geometry = {
    type: 'Polygon',
    coordinates: [[[51.3, 35.7], [51.31, 35.7], [51.31, 35.71], [51.3, 35.71]]],
  };
  assert.ok(validatePersistedGeospatialState(malformedGeometry).errors.some(
    (error) => error.startsWith('BOUNDARY_GEOMETRY_INVALID:bnd-1:'),
  ));

  const bboxGeometryMismatch = sampleState();
  bboxGeometryMismatch.boundaryHistoryByEntity['hood-tehran-1'][0].boundingBox = {
    minLat: 35.7,
    maxLat: 35.71,
    minLng: 51.3,
    maxLng: 51.39,
  };
  assert.ok(validatePersistedGeospatialState(bboxGeometryMismatch).errors.includes(
    'BOUNDARY_BBOX_GEOMETRY_MISMATCH:bnd-1',
  ));
  assert.equal(
    assessGeospatialSnapshot(bboxGeometryMismatch, { remoteSnapshotPresent: true }).health,
    'BLOCKED',
  );

  const malformedSimplifiedGeometry = sampleState();
  malformedSimplifiedGeometry.boundaryHistoryByEntity['hood-tehran-1'][0].simplifiedGeometry = {
    type: 'Polygon',
    coordinates: [],
  };
  assert.ok(validatePersistedGeospatialState(malformedSimplifiedGeometry).errors.some(
    (error) => error.startsWith('BOUNDARY_SIMPLIFIED_GEOMETRY_INVALID:bnd-1:'),
  ));

  const malformedListing = sampleState();
  (malformedListing.spatialListingsByCity as unknown as Record<string, unknown>).tehran = { listing-1: null };
  assert.ok(validatePersistedGeospatialState(malformedListing).errors.includes(
    'SPATIAL_LISTING_NOT_OBJECT:tehran:listing-1',
  ));

  const malformedListingCity = sampleState();
  (malformedListingCity.spatialListingsByCity as unknown as Record<string, unknown>).tehran = null;
  assert.ok(validatePersistedGeospatialState(malformedListingCity).errors.includes(
    'SPATIAL_LISTING_CITY_NOT_OBJECT:tehran',
  ));

  const orphanDedupeReference = sampleState();
  orphanDedupeReference.poiDedupeIndex['orphan-key'] = 'missing-poi';
  assert.ok(validatePersistedGeospatialState(orphanDedupeReference).errors.includes(
    'POI_DEDUPE_INDEX_REFERENCE_INVALID:orphan-key',
  ));

  const malformedOverlay = sampleState();
  (malformedOverlay.overlayStore as unknown as Record<string, unknown>)['overlay-1'] = null;
  assert.ok(validatePersistedGeospatialState(malformedOverlay).errors.includes(
    'OVERLAY_RECORD_NOT_OBJECT:overlay-1',
  ));

  const malformedImportBatch = sampleState();
  (malformedImportBatch.importBatches as unknown as Record<string, unknown>)['batch-1'] = null;
  assert.ok(validatePersistedGeospatialState(malformedImportBatch).errors.includes(
    'IMPORT_BATCH_NOT_OBJECT:batch-1',
  ));

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