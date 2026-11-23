/**
 * RT-INFRA-009 §5 — operator migration execute / idempotency tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  setRepositoryBaseDirForTests,
} from '../server/modules/shared/atomicJsonRepository';
import {
  setRepositorySnapshotBackendForTests,
  type RepositorySnapshotBackendPort,
} from '../server/modules/shared/durableRepositorySnapshotStore';
import { runGeospatialOperatorMigration } from '../server/modules/shared/geospatialRepositoryMigration';
import type { PersistedGeospatialState } from '../server/modules/geospatial/geospatialRepository';

function memoryBackend(): RepositorySnapshotBackendPort {
  const store = new Map<string, string>();
  return {
    async verify() {
      return { ok: true as const };
    },
    async load(fileName) {
      return store.get(fileName) ?? null;
    },
    async persist(fileName, jsonUtf8) {
      store.set(fileName, jsonUtf8);
    },
  };
}

function minimalGeo(): PersistedGeospatialState {
  return {
    boundaryHistoryByEntity: {
      'hood-tehran-9': [
        {
          id: 'bnd-test',
          entityId: 'hood-tehran-9',
          cityId: 'tehran',
          hoodId: 9,
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
          sourceProvenance: 'migration-test',
          createdByUid: 'operator',
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
  const tmp = fs.mkdtempSync(path.join(process.cwd(), '.tmp-geo-migrate-'));
  const prev = { ...process.env };
  try {
    setRepositoryBaseDirForTests(tmp);
    setRepositorySnapshotBackendForTests(memoryBackend());
    const geoPath = path.join(tmp, 'geospatial-state.json');
    fs.writeFileSync(geoPath, JSON.stringify(minimalGeo(), null, 2), 'utf-8');

    process.env.NODE_ENV = 'development';
    const dry = await runGeospatialOperatorMigration({ dryRun: true });
    assert.equal(dry.mode, 'DRY_RUN');
    assert.equal(dry.action, 'WOULD_UPLOAD');
    assert.ok(dry.preMigration.migrationEligible);

    const executed = await runGeospatialOperatorMigration({
      dryRun: false,
      execute: true,
    });
    assert.equal(executed.action, 'EXECUTED');
    assert.equal(executed.reconciliation?.localFileIntact, true);
    assert.equal(executed.reconciliation?.r2Verified, true);

    const repeat = await runGeospatialOperatorMigration({
      dryRun: false,
      execute: true,
    });
    assert.equal(repeat.action, 'SKIP');
    assert.equal(repeat.reconciliation?.idempotent, true);
  } finally {
    process.env = prev;
    setRepositorySnapshotBackendForTests(null);
    setRepositoryBaseDirForTests(null);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('[PASS] geospatial-operator-migration.test.ts');
}

runTests().catch((error) => {
  console.error('[FAIL] geospatial-operator-migration.test.ts', error);
  process.exit(1);
});