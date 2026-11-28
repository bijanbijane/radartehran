import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CoreApiError } from '../server/modules/core';
import { createMarketIntelligenceService } from '../server/modules/market-intelligence';
import { createGeospatialService } from '../server/modules/geospatial';
import type { GeospatialModuleDependencies } from '../server/modules/geospatial/types';
import { resetGeospatialRepositoryForTests } from '../server/modules/geospatial/geospatialRepository';
import { setRepositoryBaseDirForTests } from '../server/modules/shared/atomicJsonRepository';

function createIsolatedGeospatialService(deps: GeospatialModuleDependencies = {}) {
  const tmp = path.join(os.tmpdir(), `gis-mod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  setRepositoryBaseDirForTests(tmp);
  resetGeospatialRepositoryForTests();
  return createGeospatialService(deps);
}

function releaseGeospatialTestRepository(): void {
  setRepositoryBaseDirForTests(null);
  resetGeospatialRepositoryForTests();
}

test('Employee 61 — 1. Coordinate normalization, lat/lng reversal detection, hierarchy & polygon validation', async () => {
  const gis = createIsolatedGeospatialService();

  // Valid coordinate with precision rounding provenance
  const validCoord = gis.normalizeCoordinate(35.805123456, 51.451987654, {
    precisionDecimals: 5,
    sourceProvenance: 'gps_device',
  });
  assert.equal(validCoord.valid, true);
  assert.equal(validCoord.coordinate?.lat, 35.80512);
  assert.equal(validCoord.coordinate?.lng, 51.45199);
  assert.equal(validCoord.transformationMethod, 'PRECISION_ROUNDED');
  assert.equal(validCoord.sourceProvenance, 'gps_device');

  // Reversed lat/lng detection (51.45 passed as lat, 35.80 passed as lng)
  const reversed = gis.normalizeCoordinate(51.4519, 35.8051);
  assert.equal(reversed.valid, false);
  assert.equal(reversed.errorCode, 'LAT_LNG_REVERSED');

  // Impossible coordinate rejection
  const impossible = gis.normalizeCoordinate(95.0, 200.0);
  assert.equal(impossible.valid, false);
  assert.equal(impossible.errorCode, 'IMPOSSIBLE_COORDINATE');

  // Canonical hierarchy validation via existing GeographyService
  assert.equal(gis.validateHierarchyRelationship('city:tehran', 'prov:tehran'), true);
  assert.equal(gis.validateHierarchyRelationship('city:shiraz', 'prov:tehran'), false);

  // Polygon validation: detect unclosed ring and self-intersecting bowtie polygon
  const unclosed = gis.validatePolygonGeometry({
    type: 'Polygon',
    coordinates: [
      [
        [51.44, 35.80],
        [51.46, 35.80],
        [51.46, 35.82],
        [51.44, 35.82],
      ],
    ],
  });
  assert.equal(unclosed.valid, false);
  assert.ok(unclosed.issues.some((i) => i.code === 'UNCLOSED_RING'));

  const selfIntersecting = gis.validatePolygonGeometry({
    type: 'Polygon',
    coordinates: [
      [
        [51.44, 35.80],
        [51.46, 35.82],
        [51.46, 35.80],
        [51.44, 35.82],
        [51.44, 35.80],
      ],
    ],
  });
  assert.equal(selfIntersecting.valid, false);
  assert.ok(selfIntersecting.issues.some((i) => i.code === 'SELF_INTERSECTION'));
  releaseGeospatialTestRepository();
});

test('Employee 61 — 2. Boundary versioning, MultiPolygon, point-in-polygon resolution & boundary-edge ambiguity', async () => {
  const gis = createIsolatedGeospatialService();

  // Create v1 boundary for Niavaran (hoodId: 1)
  const bndV1 = await gis.upsertNeighborhoodBoundary({
    actorUid: 'admin_gis',
    entityId: 'hood:tehran:1',
    cityId: 'tehran',
    districtId: 'd1',
    hoodId: 1,
    level: 'neighborhood',
    nameFa: 'نیاوران',
    nameEn: 'Niavaran',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [51.44, 35.80],
          [51.48, 35.80],
          [51.48, 35.83],
          [51.44, 35.83],
          [51.44, 35.80],
        ],
      ],
    },
    sourceProvenance: 'tehran_municipality_gis_2025',
    autoApprove: true,
  });
  assert.equal(bndV1.version, 1);
  assert.equal(bndV1.status, 'ACTIVE');

  // Update to v2 MultiPolygon boundary -> v1 is preserved as SUPERSEDED
  const bndV2 = await gis.upsertNeighborhoodBoundary({
    actorUid: 'admin_gis',
    entityId: 'hood:tehran:1',
    cityId: 'tehran',
    districtId: 'd1',
    hoodId: 1,
    level: 'neighborhood',
    nameFa: 'نیاوران',
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [51.44, 35.80],
            [51.485, 35.80],
            [51.485, 35.835],
            [51.44, 35.835],
            [51.44, 35.80],
          ],
        ],
      ],
    },
    sourceProvenance: 'tehran_municipality_gis_2026',
    autoApprove: true,
  });
  assert.equal(bndV2.version, 2);
  const allVersions = gis.listBoundaryVersions('hood:tehran:1');
  assert.equal(allVersions.length, 2);
  assert.equal(allVersions[0].status, 'SUPERSEDED');
  assert.equal(allVersions[1].status, 'ACTIVE');

  // Point inside polygon resolves to Hood 1 v2
  const insideRes = gis.resolvePointToGeography(35.815, 51.46);
  assert.equal(insideRes.resolved, true);
  assert.equal(insideRes.status, 'RESOLVED_INSIDE');
  assert.equal(insideRes.hoodId, 1);
  assert.equal(insideRes.boundaryVersion, 2);

  // Point on exact boundary edge resolves with RESOLVED_ON_EDGE
  const edgeRes = gis.resolvePointToGeography(35.80, 51.46);
  assert.equal(edgeRes.resolved, true);
  assert.equal(edgeRes.status, 'RESOLVED_ON_EDGE');
  assert.equal(edgeRes.confidence, 'medium');

  // Point outside known polygons
  const outsideRes = gis.resolvePointToGeography(35.70, 51.35);
  assert.equal(outsideRes.resolved, false);
  assert.equal(outsideRes.status, 'OUTSIDE_KNOWN_BOUNDARIES');
  releaseGeospatialTestRepository();
});

test('Employee 61 — 3. Spatial property search (radius, bbox, corridor, clustering), query limits & privacy', () => {
  const gis = createIsolatedGeospatialService();

  // Index 4 published verified listings + 1 draft listing
  gis.indexListingForSpatialSearch({
    id: 'lst_1',
    propertyId: 'prop_1',
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 110,
    priceMillion: 16500,
    bedrooms: 2,
    hasParking: true,
    coordinates: { lat: 35.812, lng: 51.455 },
    coordinateAccuracy: 'EXACT_VERIFIED',
    exactPrivateAddress: 'خیابان باهنر، کوچه اختصاصی پلاک ۱۲ واحد ۴',
    publicationStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    available: true,
  });
  gis.indexListingForSpatialSearch({
    id: 'lst_2',
    propertyId: 'prop_2',
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 140,
    priceMillion: 21000,
    bedrooms: 3,
    hasParking: true,
    coordinates: { lat: 35.814, lng: 51.458 },
    coordinateAccuracy: 'EXACT_VERIFIED',
    exactPrivateAddress: 'پلاک محرمانه ۲۲',
    publicationStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    available: true,
  });
  gis.indexListingForSpatialSearch({
    id: 'lst_3',
    propertyId: 'prop_3',
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 95,
    priceMillion: 14200,
    bedrooms: 2,
    hasParking: true,
    coordinates: { lat: 35.816, lng: 51.460 },
    coordinateAccuracy: 'EXACT_VERIFIED',
    publicationStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    available: true,
  });
  gis.indexListingForSpatialSearch({
    id: 'lst_4',
    propertyId: 'prop_4',
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 125,
    priceMillion: 18500,
    bedrooms: 3,
    hasParking: true,
    coordinates: { lat: 35.818, lng: 51.462 },
    coordinateAccuracy: 'EXACT_VERIFIED',
    publicationStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    available: true,
  });
  // Unverified / draft listing must never appear in spatial discovery
  gis.indexListingForSpatialSearch({
    id: 'lst_draft',
    propertyId: 'prop_draft',
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 100,
    priceMillion: 15000,
    coordinates: { lat: 35.812, lng: 51.455 },
    coordinateAccuracy: 'EXACT_VERIFIED',
    publicationStatus: 'DRAFT',
    verificationStatus: 'PENDING',
    available: true,
  });

  // Approximate and legacy coordinate records are never eligible for public spatial search.
  gis.indexListingForSpatialSearch({
    id: 'lst_approx',
    propertyId: 'prop_approx',
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 100,
    priceMillion: 15000,
    coordinates: { lat: 35.812, lng: 51.455 },
    coordinateAccuracy: 'APPROXIMATE',
    publicationStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    available: true,
  });
  gis.indexListingForSpatialSearch({
    id: 'lst_legacy_coordinate',
    propertyId: 'prop_legacy_coordinate',
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 100,
    priceMillion: 15000,
    coordinates: { lat: 35.812, lng: 51.455 },
    publicationStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    available: true,
  });

  // Radius search with privacy stripping of exactPrivateAddress
  const radiusRes = gis.searchListingsSpatially({
    cityId: 'tehran',
    center: { lat: 35.812, lng: 51.455 },
    radiusMeters: 1500,
    propertyCategory: 'residential',
    transactionType: 'sale',
  });
  assert.equal(radiusRes.mode, 'INDIVIDUAL_LISTINGS');
  assert.equal(radiusRes.totalMatched, 4);
  assert.equal((radiusRes.items[0] as any).exactPrivateAddress, undefined);

  // Corridor search along a road line
  const corridorRes = gis.searchListingsSpatially({
    cityId: 'tehran',
    corridorLine: [
      { lat: 35.810, lng: 51.450 },
      { lat: 35.820, lng: 51.465 },
    ],
    corridorBufferMeters: 400,
  });
  assert.ok(corridorRes.totalMatched >= 3);

  // Zoom-aware clustering when zoomLevel <= 11
  const clusteredRes = gis.searchListingsSpatially({
    cityId: 'tehran',
    zoomLevel: 10,
  });
  assert.equal(clusteredRes.mode, 'CLUSTERED_VIEWPORT');
  assert.ok((clusteredRes.clusters?.length ?? 0) >= 1);

  // Spatial listing index mutations must survive repository rehydration.
  resetGeospatialRepositoryForTests();
  const rehydratedGis = createGeospatialService();
  const rehydratedSearch = rehydratedGis.searchListingsSpatially({
    cityId: 'tehran',
    center: { lat: 35.812, lng: 51.455 },
    radiusMeters: 1500,
    propertyCategory: 'residential',
    transactionType: 'sale',
  });
  assert.equal(rehydratedSearch.totalMatched, 4);

  // Re-indexing a globally unique listing ID under another city must remove its stale entry.
  rehydratedGis.indexListingForSpatialSearch({
    id: 'lst_1',
    propertyId: 'prop_1',
    cityId: 'karaj',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 110,
    priceMillion: 16500,
    bedrooms: 2,
    hasParking: true,
    coordinates: { lat: 35.812, lng: 51.455 },
    coordinateAccuracy: 'EXACT_VERIFIED',
    exactPrivateAddress: 'private address',
    publicationStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    available: true,
  });
  const tehranAfterCityMove = rehydratedGis.searchListingsSpatially({
    cityId: 'tehran',
    center: { lat: 35.812, lng: 51.455 },
    radiusMeters: 1500,
    propertyCategory: 'residential',
    transactionType: 'sale',
  });
  const karajAfterCityMove = rehydratedGis.searchListingsSpatially({
    cityId: 'karaj',
    center: { lat: 35.812, lng: 51.455 },
    radiusMeters: 1500,
    propertyCategory: 'residential',
    transactionType: 'sale',
  });
  assert.equal(tehranAfterCityMove.totalMatched, 3);
  assert.equal(karajAfterCityMove.totalMatched, 1);

  // A same-ID status update must replace the published record and fail closed in public search.
  rehydratedGis.indexListingForSpatialSearch({
    id: 'lst_1',
    propertyId: 'prop_1',
    cityId: 'karaj',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 110,
    priceMillion: 16500,
    coordinates: { lat: 35.812, lng: 51.455 },
    coordinateAccuracy: 'EXACT_VERIFIED',
    publicationStatus: 'DRAFT',
    verificationStatus: 'VERIFIED',
    available: true,
  });
  const karajAfterUnpublish = rehydratedGis.searchListingsSpatially({
    cityId: 'karaj',
    center: { lat: 35.812, lng: 51.455 },
    radiusMeters: 1500,
  });
  assert.equal(karajAfterUnpublish.totalMatched, 0);

  // Explicit deletion removes a listing from every city index and persists the removal.
  rehydratedGis.indexListingForSpatialSearch({
    id: 'lst_remove',
    propertyId: 'prop_remove',
    cityId: 'karaj',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    sqm: 90,
    priceMillion: 12000,
    coordinates: { lat: 35.812, lng: 51.455 },
    coordinateAccuracy: 'EXACT_VERIFIED',
    publicationStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    available: true,
  });
  assert.equal(rehydratedGis.removeListingFromSpatialSearch('lst_remove'), true);
  assert.equal(rehydratedGis.removeListingFromSpatialSearch('lst_remove'), false);
  resetGeospatialRepositoryForTests();
  const afterRemovalReload = createGeospatialService().searchListingsSpatially({
    cityId: 'karaj',
    center: { lat: 35.812, lng: 51.455 },
    radiusMeters: 1500,
  });
  assert.equal(afterRemovalReload.totalMatched, 0);

  // Reject excessive radius query (> 25,000 meters)
  assert.throws(
    () =>
      gis.searchListingsSpatially({
        cityId: 'tehran',
        center: { lat: 35.812, lng: 51.455 },
        radiusMeters: 90_000,
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 400,
  );
  releaseGeospatialTestRepository();
});

test('Employee 61 — 4. POIs, location context, overlays, Employee 59 & 60 integration, imports & observability', async () => {
  const miService = createMarketIntelligenceService({
    now: () => new Date('2026-11-08T00:00:00.000Z'),
  });
  miService.ingestEvidenceEvents([
    { id: 'm1', sourceRecordId: 'tx1', sourceCategory: 'VERIFIED_TRANSACTION', cityId: 'tehran', hoodId: 1, hoodName: 'نیاوران', propertyCategory: 'residential', transactionType: 'sale', sqm: 100, completedPriceMillion: 15500, observedAtIso: '2026-11-01T00:00:00.000Z' },
    { id: 'm2', sourceRecordId: 'tx2', sourceCategory: 'VERIFIED_TRANSACTION', cityId: 'tehran', hoodId: 1, hoodName: 'نیاوران', propertyCategory: 'residential', transactionType: 'sale', sqm: 110, completedPriceMillion: 17050, observedAtIso: '2026-11-02T00:00:00.000Z' },
    { id: 'm3', sourceRecordId: 'tx3', sourceCategory: 'VERIFIED_TRANSACTION', cityId: 'tehran', hoodId: 1, hoodName: 'نیاوران', propertyCategory: 'residential', transactionType: 'sale', sqm: 95, completedPriceMillion: 14820, observedAtIso: '2026-11-03T00:00:00.000Z' },
  ]);

  const gis = createIsolatedGeospatialService({
    marketIntelligenceService: miService,
  });

  const summaryWithoutActiveBoundary = gis.getSpatialMarketSummary({ cityId: 'tehran', hoodId: 1 });
  assert.equal(summaryWithoutActiveBoundary.boundaryVersionId, null);
  assert.equal(summaryWithoutActiveBoundary.boundaryVersion, null);
  assert.equal(summaryWithoutActiveBoundary.simplifiedGeometry, null);

  // Import boundary and POIs via safe import pipeline (dryRun preview then commit)
  const preview = await gis.importGeographicDataset({
    actorUid: 'admin_gis',
    idempotencyKey: 'gis_imp_001',
    dryRun: true,
    sourceProvenance: 'official_gis_import',
    boundaries: [
      {
        entityId: 'hood:tehran:1',
        cityId: 'tehran',
        districtId: 'd1',
        hoodId: 1,
        level: 'neighborhood',
        nameFa: 'نیاوران',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [51.44, 35.80],
              [51.48, 35.80],
              [51.48, 35.83],
              [51.44, 35.83],
              [51.44, 35.80],
            ],
          ],
        },
      },
    ],
    pois: [
      { nameFa: 'ایستگاه مترو تجریش', category: 'metro_station', coordinates: { lat: 35.806, lng: 51.432 }, cityId: 'tehran', hoodId: 1 },
      { nameFa: 'پارک نیاوران', category: 'park', coordinates: { lat: 35.812, lng: 51.471 }, cityId: 'tehran', hoodId: 1 },
      { nameFa: 'بیمارستان فرمانیه', category: 'hospital', coordinates: { lat: 35.801, lng: 51.465 }, cityId: 'tehran', hoodId: 1 },
    ],
  });
  assert.equal(preview.status, 'PREVIEW_READY');
  assert.equal(gis.getActiveBoundary('hood:tehran:1'), null); // Dry-run did not mutate state

  const committed = await gis.importGeographicDataset({
    actorUid: 'admin_gis',
    idempotencyKey: 'gis_imp_001',
    dryRun: false,
    sourceProvenance: 'official_gis_import',
    boundaries: [
      {
        entityId: 'hood:tehran:1',
        cityId: 'tehran',
        districtId: 'd1',
        hoodId: 1,
        level: 'neighborhood',
        nameFa: 'نیاوران',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [51.44, 35.80],
              [51.48, 35.80],
              [51.48, 35.83],
              [51.44, 35.83],
              [51.44, 35.80],
            ],
          ],
        },
      },
    ],
    pois: [
      { nameFa: 'ایستگاه مترو تجریش', category: 'metro_station', coordinates: { lat: 35.806, lng: 51.432 }, cityId: 'tehran', hoodId: 1 },
      { nameFa: 'پارک نیاوران', category: 'park', coordinates: { lat: 35.812, lng: 51.471 }, cityId: 'tehran', hoodId: 1 },
      { nameFa: 'بیمارستان فرمانیه', category: 'hospital', coordinates: { lat: 35.801, lng: 51.465 }, cityId: 'tehran', hoodId: 1 },
    ],
  });
  assert.equal(committed.status, 'COMMITTED');
  assert.equal(committed.importedBoundariesCount, 1);
  assert.equal(committed.importedPoisCount, 3);

  await gis.upsertNeighborhoodBoundary({
    actorUid: 'admin_gis',
    entityId: 'hood:tehran:1',
    cityId: 'tehran',
    districtId: 'd1',
    hoodId: 1,
    level: 'neighborhood',
    nameFa: 'نیاوران',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [51.44, 35.80],
          [51.48, 35.80],
          [51.48, 35.83],
          [51.44, 35.83],
          [51.44, 35.80],
        ],
      ],
    },
    sourceProvenance: 'official_gis_import',
    autoApprove: true,
  });
  assert.ok(gis.getActiveBoundary('hood:tehran:1'));

  // Duplicate POI prevention
  const dupPoi = await gis.upsertPointOfInterest({
    nameFa: 'پارک نیاوران',
    category: 'park',
    coordinates: { lat: 35.812, lng: 51.471 },
    cityId: 'tehran',
    hoodId: 1,
    sourceProvenance: 'manual_entry',
  });
  assert.equal(dupPoi.isDuplicate, true);

  // Location context & Employee 59 valuation location vector
  const valVector = gis.getValuationLocationFeatures({
    coordinates: { lat: 35.812, lng: 51.465 },
    cityId: 'tehran',
  });
  assert.equal(valVector.hoodId, 1);
  assert.equal(valVector.boundaryVersion, 2);
  assert.ok(valVector.overallAccessibilityIndex > 0);
  assert.ok(valVector.reproducibleHash.length >= 16);

  // Employee 60 Spatial Market Summary integration
  const spatialSummary = gis.getSpatialMarketSummary({ cityId: 'tehran', hoodId: 1 });
  assert.equal(spatialSummary.hoodName, 'نیاوران');
  assert.ok((spatialSummary.medianVerifiedPsmMillion ?? 0) > 0);
  const activeMarketBoundary = gis.getActiveBoundary('hood:tehran:1');
  assert.ok(activeMarketBoundary);
  assert.equal(spatialSummary.boundaryVersionId, activeMarketBoundary.id);
  assert.equal(spatialSummary.boundaryVersion, activeMarketBoundary.version);
  assert.ok(spatialSummary.simplifiedGeometry);

  // Public vs Admin overlay permission enforcement
  await gis.upsertGeographicOverlay({
    layerId: 'layer_admin_audit',
    layerType: 'INTERNAL_ADMIN_AUDIT_LAYER',
    dataSourceReference: 'internal_ops',
    cityId: 'tehran',
    version: 1,
    updatedAtIso: '2026-11-08T00:00:00.000Z',
    visibilityPolicy: 'ADMIN_ONLY',
    accessPolicy: 'PRIVILEGED_ADMIN',
    featuresCount: 5,
    payload: { internalNotes: 'restricted' },
  });
  assert.throws(
    () => gis.getGeographicOverlay({ layerId: 'layer_admin_audit', isAdminCaller: false }),
    (err: unknown) => err instanceof CoreApiError && err.status === 403,
  );
  const adminOverlay = gis.getGeographicOverlay({ layerId: 'layer_admin_audit', isAdminCaller: true });
  assert.equal(adminOverlay.layerId, 'layer_admin_audit');

  // Geographic overlay mutations must survive repository rehydration.
  resetGeospatialRepositoryForTests();
  const rehydratedOverlayService = createGeospatialService();
  const rehydratedOverlay = rehydratedOverlayService.getGeographicOverlay({
    layerId: 'layer_admin_audit',
    isAdminCaller: true,
  });
  assert.equal(rehydratedOverlay.payload.internalNotes, 'restricted');

  // Geocoding failure handling when provider is unconfigured
  const geocodeRes = await gis.forwardGeocode('تهران، نیاوران');
  assert.equal(geocodeRes.status, 'PROVIDER_UNAVAILABLE');

  // Observability metrics tracked
  const obs = gis.getObservabilityMetrics();
  assert.ok(obs.geocodingErrorsCount >= 1);
  assert.ok(obs.cacheMissesCount >= 1);
  releaseGeospatialTestRepository();
});
