import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGeospatialService } from '../server/modules/geospatial/service';
import { resetGeospatialRepositoryForTests } from '../server/modules/geospatial/geospatialRepository';
import { setRepositoryBaseDirForTests } from '../server/modules/shared/atomicJsonRepository';
import type {
  BoundaryVersionRecord,
  NeighborhoodProfileBoundaryResolvers,
} from '../server/modules/geospatial/types';
import {
  buildNeighborhoodProfileBoundaryReadModel,
  calculateNeighborhoodBoundaryGeometrySha256,
} from '../server/modules/geospatial/neighborhoodProfileBoundaryReadModel';
import { evaluateNeighborhoodProfileBoundary } from '../src/features/neighborhoods/profile-contract/neighborhoodProfileBoundaryContract';

const geometry: BoundaryVersionRecord['geometry'] = {
  type: 'Polygon',
  coordinates: [[
    [51.30, 35.70],
    [51.31, 35.70],
    [51.31, 35.71],
    [51.30, 35.71],
    [51.30, 35.70],
  ]],
};

function makeBoundary(overrides: Partial<BoundaryVersionRecord> = {}): BoundaryVersionRecord {
  return {
    id: 'bnd_hood_tehran_13_v1',
    entityId: 'hood:tehran:13',
    cityId: 'tehran',
    hoodId: 13,
    level: 'neighborhood',
    nameFa: 'محله آزمایشی',
    version: 1,
    status: 'ACTIVE',
    geometry: structuredClone(geometry),
    geometrySha256: calculateNeighborhoodBoundaryGeometrySha256(geometry),
    geometryCrs: 'EPSG:4326',
    simplifiedGeometry: structuredClone(geometry),
    boundingBox: { minLat: 35.7, maxLat: 35.71, minLng: 51.3, maxLng: 51.31 },
    sourceProvenance: 'tehran_municipality_gis_2025',
    createdByUid: 'creator-1',
    createdAtIso: '2026-01-01T00:00:00.000Z',
    reviewedByUid: 'reviewer-2',
    reviewedAtIso: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function makeResolvers(
  overrides: Partial<NeighborhoodProfileBoundaryResolvers> = {},
): NeighborhoodProfileBoundaryResolvers {
  return {
    resolveIdentity: async () => ({
      geographicEntityId: 'irni:neighborhood:tehran:canonical-13',
      cityId: 'tehran',
      legacyNeighborhoodId: 13,
      level: 'neighborhood',
      identityStatus: 'CONFIRMED_CANONICAL',
      verificationStatus: 'VERIFIED_SECONDARY_GAZETTEER',
    }),
    resolveSource: async (sourceProvenance) => ({
      sourceProvenance,
      sourceReference: 'https://data.example.org/tehran/neighborhoods/13',
      authority: 'REVIEWED_COMMUNITY',
      crs: 'EPSG:4326',
      verificationStatus: 'VERIFIED_SECONDARY_GAZETTEER',
    }),
    ...overrides,
  };
}

test('blocks when there is no active boundary', async () => {
  const result = await buildNeighborhoodProfileBoundaryReadModel({
    boundary: null,
    expectedCityId: 'tehran',
    expectedLegacyNeighborhoodId: 13,
    resolvers: makeResolvers(),
  });
  assert.equal(result.status, 'BLOCKED');
  if (result.status === 'BLOCKED') {
    assert.deepEqual(result.reasonCodes, ['ACTIVE_BOUNDARY_NOT_FOUND']);
    assert.equal(result.evidence, null);
  }
});

test('blocks legacy active records whose creator self-approved the boundary', async () => {
  const result = await buildNeighborhoodProfileBoundaryReadModel({
    boundary: makeBoundary({ reviewedByUid: 'creator-1' }),
    expectedCityId: 'tehran',
    expectedLegacyNeighborhoodId: 13,
    resolvers: makeResolvers(),
  });
  assert.equal(result.status, 'BLOCKED');
  if (result.status === 'BLOCKED') {
    assert.ok(result.reasonCodes.includes('BOUNDARY_REVIEW_NOT_INDEPENDENT'));
  }
});

test('blocks when canonical identity and source registries are not injected', async () => {
  const result = await buildNeighborhoodProfileBoundaryReadModel({
    boundary: makeBoundary(),
    expectedCityId: 'tehran',
    expectedLegacyNeighborhoodId: 13,
  });
  assert.equal(result.status, 'BLOCKED');
  if (result.status === 'BLOCKED') {
    assert.ok(result.reasonCodes.includes('CANONICAL_IDENTITY_RESOLVER_NOT_CONFIGURED'));
    assert.ok(result.reasonCodes.includes('BOUNDARY_SOURCE_REGISTRY_NOT_CONFIGURED'));
    assert.equal(result.evidence, null);
  }
});

test('creates evidence only after geometry hash, independent review and both registries agree', async () => {
  const result = await buildNeighborhoodProfileBoundaryReadModel({
    boundary: makeBoundary(),
    expectedCityId: 'tehran',
    expectedLegacyNeighborhoodId: 13,
    resolvers: makeResolvers(),
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.evidence.geometryHashVerified, true);
  assert.equal(result.evidence.identityStatus, 'CONFIRMED_CANONICAL');
  assert.equal(result.evidence.authority, 'REVIEWED_COMMUNITY');
  assert.equal(result.evidence.reviewedIndependently, true);
  assert.equal('reviewedByUid' in result.evidence, false);

  const eligibility = evaluateNeighborhoodProfileBoundary({
    expectedGeographicEntityId: 'irni:neighborhood:tehran:canonical-13',
    expectedCityId: 'tehran',
    expectedLegacyNeighborhoodId: 13,
    evidence: result.evidence,
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.areaAnalysisAllowed, true);
  assert.equal(eligibility.areaSqKm !== null, true);
  assert.equal(eligibility.officialBoundary, false);
});

test('blocks geometry changed after the server-computed digest was stored', async () => {
  const alteredGeometry: BoundaryVersionRecord['geometry'] = {
    type: 'Polygon',
    coordinates: [[
      [51.30, 35.70],
      [51.32, 35.70],
      [51.31, 35.71],
      [51.30, 35.70],
    ]],
  };
  const result = await buildNeighborhoodProfileBoundaryReadModel({
    boundary: makeBoundary({ geometry: alteredGeometry }),
    expectedCityId: 'tehran',
    expectedLegacyNeighborhoodId: 13,
    resolvers: makeResolvers(),
  });
  assert.equal(result.status, 'BLOCKED');
  if (result.status === 'BLOCKED') {
    assert.ok(result.reasonCodes.includes('BOUNDARY_GEOMETRY_HASH_MISMATCH'));
  }
});

test('blocks identity that resolves to another city or legacy neighborhood', async () => {
  const result = await buildNeighborhoodProfileBoundaryReadModel({
    boundary: makeBoundary(),
    expectedCityId: 'tehran',
    expectedLegacyNeighborhoodId: 13,
    resolvers: makeResolvers({
      resolveIdentity: async () => ({
        geographicEntityId: 'irni:neighborhood:karaj:wrong-13',
        cityId: 'karaj',
        legacyNeighborhoodId: 13,
        level: 'neighborhood',
        identityStatus: 'CONFIRMED_CANONICAL',
        verificationStatus: 'VERIFIED_SECONDARY_GAZETTEER',
      }),
    }),
  });
  assert.equal(result.status, 'BLOCKED');
  if (result.status === 'BLOCKED') {
    assert.ok(result.reasonCodes.includes('CANONICAL_IDENTITY_MISMATCH'));
  }
});

test('blocks algorithmic or unknown source authority even when an entry exists', async () => {
  const result = await buildNeighborhoodProfileBoundaryReadModel({
    boundary: makeBoundary(),
    expectedCityId: 'tehran',
    expectedLegacyNeighborhoodId: 13,
    resolvers: makeResolvers({
      resolveSource: async (sourceProvenance) => ({
        sourceProvenance,
        sourceReference: 'https://data.example.org/derived/13',
        authority: 'ALGORITHMIC',
        crs: 'EPSG:4326',
        verificationStatus: 'VERIFIED_SECONDARY_GAZETTEER',
      }),
    }),
  });
  assert.equal(result.status, 'BLOCKED');
  if (result.status === 'BLOCKED') {
    assert.ok(result.reasonCodes.includes('BOUNDARY_SOURCE_METADATA_INVALID'));
  }
});

test('blocks resolver failures without returning a partial evidence object', async () => {
  const result = await buildNeighborhoodProfileBoundaryReadModel({
    boundary: makeBoundary(),
    expectedCityId: 'tehran',
    expectedLegacyNeighborhoodId: 13,
    resolvers: makeResolvers({
      resolveIdentity: async () => {
        throw new Error('registry unavailable');
      },
    }),
  });
  assert.equal(result.status, 'BLOCKED');
  if (result.status === 'BLOCKED') {
    assert.deepEqual(result.reasonCodes, ['CANONICAL_IDENTITY_RESOLUTION_FAILED']);
    assert.equal(result.evidence, null);
  }
});

test('server geometry digest is stable for the persisted coordinate order', () => {
  const first = calculateNeighborhoodBoundaryGeometrySha256(geometry);
  const second = calculateNeighborhoodBoundaryGeometrySha256(structuredClone(geometry));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
});


test('geospatial service persists server hash and requires independent approval before profile evidence is returned', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'nips-boundary-read-model-'));
  setRepositoryBaseDirForTests(tempRoot);
  resetGeospatialRepositoryForTests();
  try {
    const service = createGeospatialService({
      now: () => new Date('2026-01-02T00:00:00.000Z'),
      neighborhoodProfileBoundaryResolvers: makeResolvers(),
    });
    const pending = await service.upsertNeighborhoodBoundary({
      actorUid: 'creator-1',
      entityId: 'hood:tehran:13',
      cityId: 'tehran',
      hoodId: 13,
      level: 'neighborhood',
      nameFa: 'محله آزمایشی',
      geometry: structuredClone(geometry),
      sourceProvenance: 'tehran_municipality_gis_2025',
      autoApprove: false,
    });

    assert.equal(pending.status, 'PENDING_REVIEW');
    assert.match(pending.geometrySha256 ?? '', /^[a-f0-9]{64}$/);
    assert.equal(pending.geometryCrs, 'EPSG:4326');
    assert.equal(await service.getNeighborhoodProfileBoundaryReadModel({ cityId: 'tehran', hoodId: 13 }).then((result) => result.status), 'BLOCKED');

    await assert.rejects(
      service.approveNeighborhoodBoundary({
        entityId: 'hood:tehran:13',
        versionId: pending.id,
        reviewerUid: 'creator-1',
      }),
    );

    const approved = await service.approveNeighborhoodBoundary({
      entityId: 'hood:tehran:13',
      versionId: pending.id,
      reviewerUid: 'reviewer-2',
    });
    assert.equal(approved.status, 'ACTIVE');
    assert.equal(approved.reviewedByUid, 'reviewer-2');

    const readModel = await service.getNeighborhoodProfileBoundaryReadModel({
      cityId: 'tehran',
      hoodId: 13,
    });
    assert.equal(readModel.status, 'READY');
    if (readModel.status !== 'READY') return;
    const eligibility = evaluateNeighborhoodProfileBoundary({
      expectedGeographicEntityId: 'irni:neighborhood:tehran:canonical-13',
      expectedCityId: 'tehran',
      expectedLegacyNeighborhoodId: 13,
      evidence: readModel.evidence,
    });
    assert.equal(eligibility.eligible, true);
  } finally {
    resetGeospatialRepositoryForTests();
    setRepositoryBaseDirForTests(null);
    rmSync(tempRoot, { recursive: true, force: true });
  }
});


test('HTTP profile endpoint stays fail-closed and approval route denies callers without admin dependencies', async () => {
  const express = (await import('express')).default;
  const { createGeospatialRouter } = await import('../server/modules/geospatial/routes');
  const tempRoot = mkdtempSync(join(tmpdir(), 'nips-http-boundary-'));
  setRepositoryBaseDirForTests(tempRoot);
  resetGeospatialRepositoryForTests();
  const service = createGeospatialService();
  const app = express();
  app.use('/api/v1/geospatial', createGeospatialRouter(service));
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1/geospatial`;

    const readResponse = await fetch(`${baseUrl}/neighborhood-boundaries/tehran/13/profile-evidence`);
    assert.equal(readResponse.status, 200);
    const readPayload = await readResponse.json();
    assert.match(JSON.stringify(readPayload), /ACTIVE_BOUNDARY_NOT_FOUND/);

    const approveResponse = await fetch(
      `${baseUrl}/neighborhood-boundaries/tehran/13/versions/bnd_hood_tehran_13_v1/approve`,
      { method: 'POST' },
    );
    assert.equal(approveResponse.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    resetGeospatialRepositoryForTests();
    setRepositoryBaseDirForTests(null);
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
