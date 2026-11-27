import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CoreApiError } from '../server/modules/core';
import { createGeospatialService, type GeospatialService } from '../server/modules/geospatial/service';
import { resetGeospatialRepositoryForTests } from '../server/modules/geospatial/geospatialRepository';
import { setRepositoryBaseDirForTests } from '../server/modules/shared/atomicJsonRepository';
import type { PolygonGeometry } from '../server/modules/geospatial/types';

const SQUARE_A: PolygonGeometry = {
  type: 'Polygon',
  coordinates: [[
    [51.30, 35.70],
    [51.40, 35.70],
    [51.40, 35.80],
    [51.30, 35.80],
    [51.30, 35.70],
  ]],
};

const SQUARE_OVERLAP: PolygonGeometry = {
  type: 'Polygon',
  coordinates: [[
    [51.34, 35.72],
    [51.44, 35.72],
    [51.44, 35.82],
    [51.34, 35.82],
    [51.34, 35.72],
  ]],
};

async function withGeospatialService(
  run: (service: GeospatialService) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'gis-valuation-assignment-'));
  setRepositoryBaseDirForTests(root);
  resetGeospatialRepositoryForTests();
  try {
    await run(createGeospatialService());
  } finally {
    resetGeospatialRepositoryForTests();
    setRepositoryBaseDirForTests(null);
    rmSync(root, { recursive: true, force: true });
  }
}

async function addBoundary(
  service: GeospatialService,
  input: { hoodId: number; geometry?: PolygonGeometry; cityId?: string },
): Promise<void> {
  const cityId = input.cityId ?? 'tehran';
  await service.upsertNeighborhoodBoundary({
    actorUid: 'gis-test-reviewer',
    entityId: `hood:${cityId}:${input.hoodId}`,
    cityId,
    hoodId: input.hoodId,
    level: 'neighborhood',
    nameFa: `محله آزمون ${input.hoodId}`,
    geometry: structuredClone(input.geometry ?? SQUARE_A),
    sourceProvenance: 'geospatial_valuation_assignment_test',
    autoApprove: true,
  });
}

const isConflict = (error: unknown): boolean =>
  error instanceof CoreApiError && error.status === 409;

test('does not fall back to caller-supplied or hardcoded neighborhood IDs without a boundary match', async () => {
  await withGeospatialService(async (service) => {
    assert.throws(
      () => service.getValuationLocationFeatures({
        coordinates: { lat: 35.75, lng: 51.35 },
        cityId: 'tehran',
        hoodId: 17,
      }),
      isConflict,
    );
  });
});

test('accepts a unique interior match and treats caller neighborhood ID only as a consistency assertion', async () => {
  await withGeospatialService(async (service) => {
    await addBoundary(service, { hoodId: 10 });
    const result = service.getValuationLocationFeatures({
      coordinates: { lat: 35.75, lng: 51.35 },
      cityId: 'tehran',
      hoodId: 10,
    });
    assert.equal(result.cityId, 'tehran');
    assert.equal(result.hoodId, 10);
    assert.equal(result.boundaryVersion, 1);

    assert.throws(
      () => service.getValuationLocationFeatures({
        coordinates: { lat: 35.75, lng: 51.35 },
        cityId: 'tehran',
        hoodId: 17,
      }),
      isConflict,
    );
  });
});

test('rejects valuation features for a point exactly on a neighborhood boundary', async () => {
  await withGeospatialService(async (service) => {
    await addBoundary(service, { hoodId: 10 });
    const resolution = service.resolvePointToGeography(35.70, 51.35);
    assert.equal(resolution.status, 'RESOLVED_ON_EDGE');
    assert.throws(
      () => service.getValuationLocationFeatures({
        coordinates: { lat: 35.70, lng: 51.35 },
        cityId: 'tehran',
        hoodId: 10,
      }),
      isConflict,
    );
  });
});

test('rejects valuation features when multiple neighborhood polygons contain the point', async () => {
  await withGeospatialService(async (service) => {
    await addBoundary(service, { hoodId: 10, geometry: SQUARE_A });
    await addBoundary(service, { hoodId: 11, geometry: SQUARE_OVERLAP });
    const resolution = service.resolvePointToGeography(35.75, 51.36);
    assert.equal(resolution.status, 'AMBIGUOUS_OVERLAP');
    assert.equal(resolution.candidateBoundaryIds.length, 2);
    assert.throws(
      () => service.getValuationLocationFeatures({
        coordinates: { lat: 35.75, lng: 51.36 },
        cityId: 'tehran',
      }),
      isConflict,
    );
  });
});

test('rejects a spatial match from a different city than the requested city', async () => {
  await withGeospatialService(async (service) => {
    await addBoundary(service, { hoodId: 10, cityId: 'tehran' });
    assert.throws(
      () => service.getValuationLocationFeatures({
        coordinates: { lat: 35.75, lng: 51.35 },
        cityId: 'karaj',
      }),
      isConflict,
    );
  });
});
