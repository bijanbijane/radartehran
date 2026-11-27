import test from 'node:test';
import assert from 'node:assert/strict';
import { executeUpsertPointOfInterest } from '../server/modules/geospatial/geospatialPoiOperations';
import { executeUpsertGeographicOverlay } from '../server/modules/geospatial/geospatialOverlayAccess';
import type { GeographicOverlayLayer, PointOfInterestRecord } from '../server/modules/geospatial/types';

test('POI upsert restores store and dedupe index when durable persistence rejects', async () => {
  const poiStore = new Map<string, PointOfInterestRecord>();
  const poiDedupeIndex = new Map<string, string>();
  let invalidations = 0;
  const persistenceError = new Error('durable write rejected');

  await assert.rejects(
    () => executeUpsertPointOfInterest({
      input: {
        id: 'poi_rollback',
        nameFa: 'پارک آزمون',
        category: 'park',
        coordinates: { lat: 35.812, lng: 51.471 },
        cityId: 'tehran',
        sourceProvenance: 'regression_test',
      },
      poiStore,
      poiDedupeIndex,
      nowIso: '2026-11-27T00:00:00.000Z',
      invalidateGeoCaches: () => { invalidations += 1; },
      persistRuntime: async () => { throw persistenceError; },
    }),
    (error: unknown) => error === persistenceError,
  );

  assert.equal(poiStore.has('poi_rollback'), false);
  assert.equal(poiDedupeIndex.size, 0);
  assert.equal(invalidations, 0);
});

test('overlay upsert restores previous store and cache entries when durable persistence rejects', async () => {
  const previous: GeographicOverlayLayer = {
    layerId: 'overlay_rollback',
    layerType: 'INTERNAL_ADMIN_AUDIT_LAYER',
    dataSourceReference: 'previous',
    cityId: 'tehran',
    version: 1,
    updatedAtIso: '2026-11-26T00:00:00.000Z',
    visibilityPolicy: 'ADMIN_ONLY',
    accessPolicy: 'PRIVILEGED_ADMIN',
    featuresCount: 1,
    payload: { revision: 'previous' },
  };
  const replacement: GeographicOverlayLayer = {
    ...previous,
    dataSourceReference: 'replacement',
    version: 2,
    updatedAtIso: '2026-11-27T00:00:00.000Z',
    payload: { revision: 'replacement' },
  };
  const overlayStore = new Map([[previous.layerId, structuredClone(previous)]]);
  const overlayCache = new Map([[previous.layerId, structuredClone(previous)]]);
  const persistenceError = new Error('durable write rejected');

  await assert.rejects(
    () => executeUpsertGeographicOverlay(
      replacement,
      overlayStore,
      overlayCache,
      async () => { throw persistenceError; },
    ),
    (error: unknown) => error === persistenceError,
  );

  assert.deepEqual(overlayStore.get(previous.layerId), previous);
  assert.deepEqual(overlayCache.get(previous.layerId), previous);
});
