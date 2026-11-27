import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CoreApiError } from '../server/modules/core';
import { resolvePointInBoundaryStore } from '../server/modules/geospatial/geospatialPointResolution';
import type { BoundaryVersionRecord } from '../server/modules/geospatial/types';
import { createGeospatialService, type GeospatialService } from '../server/modules/geospatial/service';
import { resetGeospatialRepositoryForTests } from '../server/modules/geospatial/geospatialRepository';
import { setRepositoryBaseDirForTests } from '../server/modules/shared/atomicJsonRepository';
import type { PolygonGeometry } from '../server/modules/geospatial/types';
import { classifyPointInPolygon, simplifyPolygonGeometry, validatePolygonGeometry } from '../server/modules/geospatial/coordinateAndPolygonEngine';

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

const POLYGON_WITH_HOLE: PolygonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [51.30, 35.70],
      [51.40, 35.70],
      [51.40, 35.80],
      [51.30, 35.80],
      [51.30, 35.70],
    ],
    [
      [51.32, 35.72],
      [51.38, 35.72],
      [51.38, 35.78],
      [51.32, 35.78],
      [51.32, 35.72],
    ],
  ],
};

const MULTIPOLYGON_WITH_HOLE: PolygonGeometry = {
  type: 'MultiPolygon',
  coordinates: [
    POLYGON_WITH_HOLE.coordinates as [number, number][][],
    [[
      [51.50, 35.70],
      [51.60, 35.70],
      [51.60, 35.80],
      [51.50, 35.80],
      [51.50, 35.70],
    ]],
  ],
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

const SQUARE_EDGE_OVERLAP: PolygonGeometry = {
  type: 'Polygon',
  coordinates: [[
    [51.36, 35.70],
    [51.46, 35.70],
    [51.46, 35.80],
    [51.36, 35.80],
    [51.36, 35.70],
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
  input: { hoodId: number; geometry?: PolygonGeometry; cityId?: string; subNeighborhoodId?: string },
): Promise<void> {
  const cityId = input.cityId ?? 'tehran';
  await service.upsertNeighborhoodBoundary({
    actorUid: 'gis-test-reviewer',
    entityId: `hood:${cityId}:${input.hoodId}`,
    cityId,
    hoodId: input.hoodId,
    subNeighborhoodId: input.subNeighborhoodId,
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



test('falls back to canonical geometry when stride simplification creates a self-intersection', () => {
  const concaveUShape: PolygonGeometry = {
    type: 'Polygon',
    coordinates: [[
      [51.30, 35.70],
      [51.34, 35.70],
      [51.34, 35.74],
      [51.33, 35.74],
      [51.33, 35.71],
      [51.31, 35.71],
      [51.31, 35.74],
      [51.30, 35.74],
      [51.30, 35.70],
    ]],
  };
  const ring = concaveUShape.coordinates as [number, number][][];
  const naiveStrideResult: PolygonGeometry = {
    type: 'Polygon',
    coordinates: [[ring[0][0], ring[0][2], ring[0][4], ring[0][6], ring[0][8]]],
  };

  assert.equal(validatePolygonGeometry(concaveUShape).valid, true);
  assert.equal(validatePolygonGeometry(naiveStrideResult).valid, false);

  const simplified = simplifyPolygonGeometry(concaveUShape, 2);
  assert.deepEqual(simplified, concaveUShape);
  assert.equal(validatePolygonGeometry(simplified).valid, true);
});

test('point-in-polygon respects interior rings for Polygon and MultiPolygon geometries', () => {
  assert.equal(
    classifyPointInPolygon({ lat: 35.75, lng: 51.35 }, POLYGON_WITH_HOLE),
    'OUTSIDE',
  );
  assert.equal(
    classifyPointInPolygon({ lat: 35.71, lng: 51.35 }, POLYGON_WITH_HOLE),
    'INSIDE',
  );
  assert.equal(
    classifyPointInPolygon({ lat: 35.72, lng: 51.35 }, POLYGON_WITH_HOLE),
    'ON_EDGE',
  );
  assert.equal(
    classifyPointInPolygon({ lat: 35.75, lng: 51.35 }, MULTIPOLYGON_WITH_HOLE),
    'OUTSIDE',
  );
  assert.equal(
    classifyPointInPolygon({ lat: 35.75, lng: 51.55 }, MULTIPOLYGON_WITH_HOLE),
    'INSIDE',
  );
});


test('polygon validation rejects holes outside or touching the exterior ring', () => {
  const outsideHole: PolygonGeometry = {
    type: 'Polygon',
    coordinates: [
      (SQUARE_A.coordinates as [number, number][][])[0],
      [[51.42, 35.72], [51.44, 35.72], [51.44, 35.74], [51.42, 35.74], [51.42, 35.72]],
    ],
  };
  const touchingHole: PolygonGeometry = {
    type: 'Polygon',
    coordinates: [
      (SQUARE_A.coordinates as [number, number][][])[0],
      [[51.30, 35.72], [51.34, 35.72], [51.34, 35.74], [51.30, 35.74], [51.30, 35.72]],
    ],
  };
  assert.ok(validatePolygonGeometry(outsideHole).issues.some((issue) => issue.code === 'HOLE_OUTSIDE_OUTER'));
  assert.ok(validatePolygonGeometry(touchingHole).issues.some((issue) => issue.code === 'HOLE_OUTSIDE_OUTER'));
});

test('polygon validation rejects overlapping or nested interior rings', () => {
  const overlappingHoles: PolygonGeometry = {
    type: 'Polygon',
    coordinates: [
      (SQUARE_A.coordinates as [number, number][][])[0],
      [[51.32, 35.72], [51.36, 35.72], [51.36, 35.76], [51.32, 35.76], [51.32, 35.72]],
      [[51.34, 35.74], [51.38, 35.74], [51.38, 35.78], [51.34, 35.78], [51.34, 35.74]],
    ],
  };
  const nestedHoles: PolygonGeometry = {
    type: 'Polygon',
    coordinates: [
      (SQUARE_A.coordinates as [number, number][][])[0],
      [[51.32, 35.72], [51.38, 35.72], [51.38, 35.78], [51.32, 35.78], [51.32, 35.72]],
      [[51.34, 35.74], [51.36, 35.74], [51.36, 35.76], [51.34, 35.76], [51.34, 35.74]],
    ],
  };
  assert.ok(validatePolygonGeometry(overlappingHoles).issues.some((issue) => issue.code === 'HOLE_OVERLAP'));
  assert.ok(validatePolygonGeometry(nestedHoles).issues.some((issue) => issue.code === 'HOLE_OVERLAP'));
});


test('MultiPolygon validation rejects intersecting and nested components', () => {
  const outer = (SQUARE_A.coordinates as [number, number][][])[0];
  const overlapping: PolygonGeometry = {
    type: 'MultiPolygon',
    coordinates: [
      [outer],
      [[[51.35, 35.73], [51.38, 35.73], [51.38, 35.76], [51.35, 35.76], [51.35, 35.73]]],
    ],
  };
  const touching: PolygonGeometry = {
    type: 'MultiPolygon',
    coordinates: [
      [outer],
      [[[51.40, 35.72], [51.42, 35.72], [51.42, 35.74], [51.40, 35.74], [51.40, 35.72]]],
    ],
  };
  assert.ok(validatePolygonGeometry(overlapping).issues.some(
    (issue) => issue.code === 'MULTIPOLYGON_COMPONENT_OVERLAP',
  ));
  assert.ok(validatePolygonGeometry(touching).issues.some(
    (issue) => issue.code === 'MULTIPOLYGON_COMPONENT_OVERLAP',
  ));
});

test('MultiPolygon validation permits disjoint components and an island inside a valid hole', () => {
  const outer = (SQUARE_A.coordinates as [number, number][][])[0];
  const hole = [[51.33, 35.73], [51.37, 35.73], [51.37, 35.77], [51.33, 35.77], [51.33, 35.73]];
  const island = [[51.34, 35.74], [51.36, 35.74], [51.36, 35.76], [51.34, 35.76], [51.34, 35.74]];
  const valid: PolygonGeometry = {
    type: 'MultiPolygon',
    coordinates: [
      [outer, hole],
      [island],
      [[[51.50, 35.70], [51.52, 35.70], [51.52, 35.72], [51.50, 35.72], [51.50, 35.70]]],
    ],
  };
  assert.equal(validatePolygonGeometry(valid).valid, true);
});

test('polygon validation checks closure and self-intersection of interior rings', () => {
  const unclosedHole: PolygonGeometry = {
    type: 'Polygon',
    coordinates: [
      (SQUARE_A.coordinates as [number, number][][])[0],
      [
        [51.32, 35.72],
        [51.38, 35.72],
        [51.38, 35.78],
        [51.32, 35.78],
      ],
    ],
  };
  const validation = validatePolygonGeometry(unclosedHole);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === 'UNCLOSED_RING'));
});



test('classifies a point inside one neighborhood but on another neighborhood edge as ambiguous', async () => {
  await withGeospatialService(async (service) => {
    await addBoundary(service, { hoodId: 10, geometry: SQUARE_A });
    await addBoundary(service, { hoodId: 11, geometry: SQUARE_EDGE_OVERLAP });
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

test('fails closed when one neighborhood history contains multiple ACTIVE boundary versions', () => {
  const makeRecord = (id: string, version: number, geometry: PolygonGeometry, boundingBox: BoundaryVersionRecord['boundingBox']): BoundaryVersionRecord => ({
    id,
    entityId: 'hood:tehran:10',
    cityId: 'tehran',
    hoodId: 10,
    level: 'neighborhood',
    nameFa: 'محله آزمون',
    version,
    status: 'ACTIVE',
    geometry: structuredClone(geometry),
    simplifiedGeometry: structuredClone(geometry),
    boundingBox,
    sourceProvenance: 'duplicate_active_version_regression_test',
    createdByUid: 'test-creator',
    createdAtIso: '2026-11-27T00:00:00.000Z',
  });
  const v1 = makeRecord('bnd_hood_tehran_10_v1', 1, SQUARE_A, {
    minLat: 35.70, maxLat: 35.80, minLng: 51.30, maxLng: 51.40,
  });
  const v2 = makeRecord('bnd_hood_tehran_10_v2', 2, SQUARE_OVERLAP, {
    minLat: 35.72, maxLat: 35.82, minLng: 51.34, maxLng: 51.44,
  });
  const metrics = {
    spatialQueriesCount: 0,
    totalQueryLatencyMs: 0,
    pointResolutionFailuresCount: 0,
    invalidGeometryEventsCount: 0,
    importFailuresCount: 0,
    cacheHitsCount: 0,
    cacheMissesCount: 0,
    geocodingErrorsCount: 0,
  };

  const result = resolvePointInBoundaryStore({
    boundaryHistoryByEntity: new Map([[v1.entityId, [v1, v2]]]),
    metrics,
    rawLat: 35.75,
    rawLng: 51.36,
  });

  assert.equal(result.resolved, false);
  assert.equal(result.status, 'MULTIPLE_ACTIVE_BOUNDARY_VERSIONS');
  assert.equal(result.confidence, 'none');
  assert.deepEqual(result.candidateBoundaryIds, [v1.id, v2.id]);
  assert.equal(metrics.pointResolutionFailuresCount, 1);
});


test('rejects malformed Polygon and MultiPolygon coordinate containers without throwing', () => {
  const malformedPolygon = {
    type: 'Polygon',
    coordinates: null,
  } as unknown as PolygonGeometry;
  const malformedMultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [null, {}],
  } as unknown as PolygonGeometry;

  assert.equal(validatePolygonGeometry(malformedPolygon).valid, false);
  assert.equal(validatePolygonGeometry(malformedMultiPolygon).valid, false);
  assert.equal(
    classifyPointInPolygon({ lat: 35.75, lng: 51.35 }, malformedPolygon),
    'OUTSIDE',
  );
  assert.equal(
    classifyPointInPolygon({ lat: 35.75, lng: 51.35 }, malformedMultiPolygon),
    'OUTSIDE',
  );
});

test('polygon validation detects collinear overlap between non-adjacent ring segments', () => {
  const collinearSelfOverlap: PolygonGeometry = {
    type: 'Polygon',
    coordinates: [[
      [51.30, 35.70],
      [51.40, 35.70],
      [51.40, 35.80],
      [51.35, 35.80],
      [51.35, 35.70],
      [51.40, 35.70],
      [51.30, 35.70],
    ]],
  };

  const report = validatePolygonGeometry(collinearSelfOverlap);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === 'SELF_INTERSECTION'));
});

test('does not treat a parent interior as resolved when the matched sub-neighborhood point is on its edge', async () => {
  await withGeospatialService(async (service) => {
    await addBoundary(service, { hoodId: 10, subNeighborhoodId: 'legacy-parent-sub-id' });
    await service.upsertNeighborhoodBoundary({
      actorUid: 'gis-test-reviewer',
      entityId: 'sub:tehran:10:edge',
      cityId: 'tehran',
      hoodId: 10,
      subNeighborhoodId: 'sub-edge',
      level: 'sub_neighborhood',
      nameFa: 'ریزپهنه مرزی آزمون',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [51.35, 35.72],
          [51.37, 35.72],
          [51.37, 35.78],
          [51.35, 35.78],
          [51.35, 35.72],
        ]],
      },
      sourceProvenance: 'sub_neighborhood_edge_regression_test',
      autoApprove: true,
    });

    const resolution = service.resolvePointToGeography(35.75, 51.35);
    assert.equal(resolution.resolved, true);
    assert.equal(resolution.status, 'RESOLVED_ON_EDGE');
    assert.equal(resolution.hoodId, 10);
    assert.equal(resolution.subNeighborhoodId, undefined);

    assert.throws(
      () => service.getValuationLocationFeatures({
        coordinates: { lat: 35.75, lng: 51.35 },
        cityId: 'tehran',
        hoodId: 10,
      }),
      isConflict,
    );
  });
});
