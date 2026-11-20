import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createGeospatialService } from '../server/modules/geospatial/service';
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

void testPendingBoundaryNotActive().then(() => console.log('geospatial-boundary-approval: ok'));