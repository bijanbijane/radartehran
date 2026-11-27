import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNeighborhoodProfileBoundaryEvidence } from './neighborhoodProfileBoundaryApi';

const evidence = {
  geographicEntityId: 'IRGEO1-test-neighborhood',
  cityId: 'tehran',
  legacyNeighborhoodId: 13,
  level: 'neighborhood',
  versionId: 'boundary-v3',
  version: 3,
  status: 'ACTIVE',
  identityStatus: 'CONFIRMED_CANONICAL',
  verificationStatus: 'VERIFIED_SECONDARY_GAZETTEER',
  authority: 'VERIFIED_SECONDARY',
  crs: 'EPSG:4326',
  geometry: {
    type: 'Polygon',
    coordinates: [[[51.3, 35.7], [51.31, 35.7], [51.31, 35.71], [51.3, 35.7]]],
  },
  sourceReference: 'https://data.example.org/boundaries/13',
  reviewedIndependently: true,
  reviewedAtIso: '2026-01-02T00:00:00.000Z',
  geometrySha256: 'a'.repeat(64),
  geometryHashVerified: true,
};

test('fetches and accepts only a READY server evidence envelope', async () => {
  let requestedUrl = '';
  const fetchImpl: typeof fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      ok: true,
      data: { status: 'READY', reasonCodes: [], evidence },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await fetchNeighborhoodProfileBoundaryEvidence('tehran', 13, undefined, fetchImpl);
  assert.equal(requestedUrl, '/api/v1/geospatial/neighborhood-boundaries/tehran/13/profile-evidence');
  assert.equal(result.status, 'READY');
  if (result.status === 'READY') {
    assert.equal(result.evidence.geographicEntityId, evidence.geographicEntityId);
    assert.equal(result.evidence.geometryHashVerified, true);
  }
});

test('preserves structured BLOCKED reasons without promoting partial evidence', async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    ok: true,
    data: {
      status: 'BLOCKED',
      reasonCodes: ['CANONICAL_IDENTITY_RESOLVER_NOT_CONFIGURED', 'BOUNDARY_SOURCE_REGISTRY_NOT_CONFIGURED'],
      evidence: null,
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  const result = await fetchNeighborhoodProfileBoundaryEvidence('tehran', 13, undefined, fetchImpl);
  assert.deepEqual(result, {
    status: 'BLOCKED',
    evidence: null,
    reasonCodes: ['CANONICAL_IDENTITY_RESOLVER_NOT_CONFIGURED', 'BOUNDARY_SOURCE_REGISTRY_NOT_CONFIGURED'],
  });
});

test('rejects malformed READY payloads and invalid neighborhood identifiers', async () => {
  let fetchCount = 0;
  const fetchImpl: typeof fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
      ok: true,
      data: { status: 'READY', reasonCodes: [], evidence: { ...evidence, geometryHashVerified: false } },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const malformed = await fetchNeighborhoodProfileBoundaryEvidence('tehran', 13, undefined, fetchImpl);
  assert.equal(malformed.status, 'UNAVAILABLE');
  assert.deepEqual(malformed.reasonCodes, ['INVALID_BOUNDARY_EVIDENCE_RESPONSE']);

  const invalidId = await fetchNeighborhoodProfileBoundaryEvidence('tehran', 0, undefined, fetchImpl);
  assert.equal(invalidId.status, 'UNAVAILABLE');
  assert.deepEqual(invalidId.reasonCodes, ['INVALID_NEIGHBORHOOD_REFERENCE']);
  assert.equal(fetchCount, 1);
});

test('maps unavailable HTTP responses to a fail-closed result', async () => {
  const fetchImpl: typeof fetch = async () => new Response('unavailable', { status: 503 });
  const result = await fetchNeighborhoodProfileBoundaryEvidence('tehran', 13, undefined, fetchImpl);
  assert.deepEqual(result, { status: 'UNAVAILABLE', evidence: null, reasonCodes: ['HTTP_503'] });
});
