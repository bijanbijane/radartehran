/**
 * Employee 18 — Geography & Spatial Intelligence Backend Verification Suite
 * (`server/modules/geography/__tests__/employee18Geography.test.ts`)
 * Exclusive ownership: `server/modules/geography/`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Employee18GeographyEngine,
  MAX_BULK_SPATIAL_QUERY_LIMIT,
  UnconfiguredH3Provider,
  calculateGeodesicDistanceMeters,
  doGeoJsonPolygonsIntersect,
  doesPolygonContainPolygon,
  extractAllDistrictNumbersFromZone,
  isPointWithinGeoJsonGeometry,
  transformCoordinatesToWgs84,
  validateGeoJsonGeometry,
  type GeoJsonGeometry,
  type GeographyAdminActor,
  type GeographyDomainEvent,
  type StructuredAddressReference,
} from '../index';

const ADMIN_ACTOR: GeographyAdminActor = { uid: 'geo_admin_18', isAdmin: true };
const UNAUTHORIZED_ACTOR: GeographyAdminActor = { uid: 'anon_user_1', isAdmin: false };

describe('Employee 18 — Geography & Spatial Intelligence Backend', () => {
  describe('1. Geographic Hierarchy & Multi-City Disambiguation', () => {
    it('seeds country, 31 provinces, Tehran satellite county, 5 cities, 22 Tehran districts, and 265 neighborhoods', () => {
      const engine = new Employee18GeographyEngine();
      assert.ok(engine.store.entities.has('country:ir'));
      assert.ok(engine.store.entities.has('province:tehran'));
      assert.ok(engine.store.entities.has('province:razavi_khorasan'));
      assert.ok(engine.store.entities.has('county:tehran_satellite'));
      assert.ok(engine.store.entities.has('city:tehran'));
      assert.ok(engine.store.entities.has('district:tehran:1'));
      assert.ok(engine.store.entities.has('district:tehran:22'));

      const hoods = [...engine.store.entities.values()].filter((e) => e.entityType === 'neighborhood');
      assert.equal(hoods.length, 265);

      const pardis = engine.store.entities.get('hood:tehran:61');
      assert.ok(pardis);
      assert.equal(pardis.parentId, 'county:tehran_satellite');

      const multiDistrictNums = extractAllDistrictNumbersFromZone('منطقه ۱ و ۳');
      assert.deepEqual(multiDistrictNums, [1, 3]);
      const locatedWithinDistricts = engine.store.relationships.filter(
        (r) => r.relationshipType === 'LOCATED_WITHIN' && r.targetEntityId.startsWith('district:tehran:'),
      );
      assert.ok(locatedWithinDistricts.length > 0);
    });

    it('rejects missing parent, invalid hierarchy link, and duplicate identifiers', () => {
      const engine = new Employee18GeographyEngine();
      assert.throws(() =>
        engine.store.createEntity({
          actor: ADMIN_ACTOR,
          entity: {
            id: 'hood:tehran:missing_parent_test', entityType: 'neighborhood', displayNameFa: 'محله آزمایشی',
            alternativeNames: [], parentId: 'district:tehran:999', sourceReference: 'test',
            verificationStatus: 'provisional_review', geographicStatus: 'active', isInformalOrMarketingName: false,
          },
          reason: 'Test missing parent',
        }),
      /PARENT_NOT_FOUND/);

      assert.throws(() =>
        engine.store.createEntity({
          actor: ADMIN_ACTOR,
          entity: {
            id: 'hood:invalid_parent_type', entityType: 'neighborhood', displayNameFa: 'محله نامعتبر',
            alternativeNames: [], parentId: 'country:ir', sourceReference: 'test',
            verificationStatus: 'provisional_review', geographicStatus: 'active', isInformalOrMarketingName: false,
          },
          reason: 'Test invalid hierarchy',
        }),
      /INVALID_HIERARCHY_PARENT_TYPE/);

      assert.throws(() =>
        engine.store.createEntity({
          actor: ADMIN_ACTOR,
          entity: {
            id: 'city:tehran', entityType: 'city', displayNameFa: 'تهران تکراری',
            alternativeNames: [], parentId: 'province:tehran', sourceReference: 'test',
            verificationStatus: 'provisional_review', geographicStatus: 'active', isInformalOrMarketingName: false,
          },
          reason: 'Test duplicate ID',
        }),
      /DUPLICATE_ENTITY_ID/);
    });

    it('supports sub-neighborhood creation while blocking official status on marketing names', () => {
      const engine = new Employee18GeographyEngine();
      const subHood = engine.store.createEntity({
        actor: ADMIN_ACTOR,
        entity: {
          id: 'subhood:tehran:punak_north', entityType: 'sub_neighborhood', displayNameFa: 'پونک شمالی',
          alternativeNames: ['فاز شمال پونک'], parentId: 'hood:tehran:1', sourceReference: 'curated_subhood',
          verificationStatus: 'reconciled_catalog', geographicStatus: 'active', isInformalOrMarketingName: true,
        },
        reason: 'Add informal sub-neighborhood under Punak',
      });
      assert.equal(subHood.entityType, 'sub_neighborhood');
      assert.equal(subHood.isInformalOrMarketingName, true);

      assert.throws(() =>
        engine.store.createEntity({
          actor: ADMIN_ACTOR,
          entity: {
            id: 'subhood:tehran:marketing_fake_official', entityType: 'sub_neighborhood', displayNameFa: 'پونک لاکچری',
            alternativeNames: [], parentId: 'hood:tehran:1', sourceReference: 'ad_copy',
            verificationStatus: 'verified_official', geographicStatus: 'active', isInformalOrMarketingName: true,
          },
          reason: 'Should reject marketing label claimed as verified_official',
        }),
      /MARKETING_NAME_CANNOT_BE_OFFICIAL/);
    });
  });

  describe('2. Geometry Validation & Coordinate Reference Systems (CRS)', () => {
    const validPolygon: GeoJsonGeometry = {
      type: 'Polygon',
      coordinates: [[[51.32, 35.75], [51.35, 35.75], [51.35, 35.78], [51.32, 35.78], [51.32, 35.75]]],
    };

    it('validates closed polygons, MultiPolygons, and polygon holes while rejecting unclosed or self-intersecting rings', () => {
      assert.equal(validateGeoJsonGeometry(validPolygon).valid, true);

      const unclosed: GeoJsonGeometry = {
        type: 'Polygon',
        coordinates: [[[51.32, 35.75], [51.35, 35.75], [51.35, 35.78], [51.32, 35.78]]],
      };
      const unclosedRes = validateGeoJsonGeometry(unclosed);
      assert.equal(unclosedRes.valid, false);
      assert.ok(unclosedRes.errors.some((e) => e.includes('UNCLOSED_LINEAR_RING')));

      const bowtie: GeoJsonGeometry = {
        type: 'Polygon',
        coordinates: [[[51.30, 35.70], [51.35, 35.75], [51.35, 35.70], [51.30, 35.75], [51.30, 35.70]]],
      };
      const bowtieRes = validateGeoJsonGeometry(bowtie);
      assert.equal(bowtieRes.valid, false);
      assert.equal(bowtieRes.hasSelfIntersection, true);

      const polygonWithHole: GeoJsonGeometry = {
        type: 'Polygon',
        coordinates: [
          [[51.30, 35.70], [51.40, 35.70], [51.40, 35.80], [51.30, 35.80], [51.30, 35.70]],
          [[51.33, 35.73], [51.37, 35.73], [51.37, 35.77], [51.33, 35.77], [51.33, 35.73]],
        ],
      };
      const holeValidation = validateGeoJsonGeometry(polygonWithHole);
      assert.equal(holeValidation.valid, true);
      assert.equal(holeValidation.hasHoles, true);
      assert.equal(isPointWithinGeoJsonGeometry({ lat: 35.75, lng: 51.35 }, polygonWithHole), false);
      assert.equal(isPointWithinGeoJsonGeometry({ lat: 35.71, lng: 51.31 }, polygonWithHole), true);

      const multiPoly: GeoJsonGeometry = { type: 'MultiPolygon', coordinates: [validPolygon.coordinates] };
      assert.equal(validateGeoJsonGeometry(multiPoly).valid, true);
    });

    it('transforms coordinates across EPSG:4326, EPSG:3857, and EPSG:32639 while rejecting swapped lat/lng', () => {
      const wgsRes = transformCoordinatesToWgs84([51.389, 35.6892], 'EPSG:4326');
      assert.equal(wgsRes.valid, true);
      assert.deepEqual(wgsRes.wgs84Point, { lng: 51.389, lat: 35.6892 });

      const mercatorRes = transformCoordinatesToWgs84([5720601.5, 4257980.2], 'EPSG:3857');
      assert.equal(mercatorRes.valid, true);
      assert.ok(mercatorRes.wgs84Point && Math.abs(mercatorRes.wgs84Point.lng - 51.389) < 0.01);

      const utmRes = transformCoordinatesToWgs84([535200, 3949700], 'EPSG:32639');
      assert.equal(utmRes.valid, true);
      assert.ok(utmRes.wgs84Point && utmRes.wgs84Point.lat > 35 && utmRes.wgs84Point.lng > 51);

      const swapped = transformCoordinatesToWgs84([35.6892, 51.389], 'EPSG:4326');
      assert.equal(swapped.valid, false);
      assert.ok(swapped.error?.includes('SWAPPED_LAT_LNG_DETECTED'));
    });
  });

  describe('3. Spatial Query Engine & Boundary Versioning', () => {
    const outerPoly: GeoJsonGeometry = {
      type: 'Polygon',
      coordinates: [[[51.30, 35.70], [51.40, 35.70], [51.40, 35.80], [51.30, 35.80], [51.30, 35.70]]],
    };
    const innerPoly: GeoJsonGeometry = {
      type: 'Polygon',
      coordinates: [[[51.32, 35.72], [51.36, 35.72], [51.36, 35.76], [51.32, 35.76], [51.32, 35.72]]],
    };

    it('supports polygon containment, polygon intersection, geodesic distance, radius, bbox, and area queries', () => {
      assert.equal(doesPolygonContainPolygon(outerPoly, innerPoly), true);
      assert.equal(doesPolygonContainPolygon(innerPoly, outerPoly), false);
      assert.equal(doGeoJsonPolygonsIntersect(outerPoly, innerPoly), true);

      const distMeters = calculateGeodesicDistanceMeters({ lat: 35.7575, lng: 51.41 }, { lat: 35.7592, lng: 51.3324 });
      assert.ok(distMeters > 6000 && distMeters < 8000);

      const engine = new Employee18GeographyEngine();
      const b1 = engine.store.upsertBoundary({
        actor: ADMIN_ACTOR, entityId: 'hood:tehran:1', geometry: innerPoly, boundarySource: 'tehran_gis_v1',
        sourceVersion: '2025.1', verificationStatus: 'reconciled_catalog', boundaryClassification: 'estimated',
        effectiveDateIso: '2025-01-01T00:00:00.000Z', reason: 'Initial approximate boundary',
      });
      const b2 = engine.store.upsertBoundary({
        actor: ADMIN_ACTOR, entityId: 'hood:tehran:1', geometry: outerPoly, boundarySource: 'tehran_gis_v2',
        sourceVersion: '2026.1', verificationStatus: 'verified_official', boundaryClassification: 'official',
        effectiveDateIso: '2026-01-01T00:00:00.000Z', reason: 'Official boundary update',
      });
      assert.equal(b1.geometryVersion, 1);
      assert.equal(b2.geometryVersion, 2);
      assert.equal(engine.store.boundaryHistoryByEntity.get('hood:tehran:1')?.length, 2);

      const areaRes = engine.queryEntitiesPaginated({ entityType: 'neighborhood', minAreaSqMeters: 1000 });
      assert.equal(areaRes.totalCount, 1);
      assert.equal(areaRes.items[0].id, 'hood:tehran:1');
    });
  });

  describe('4. Location Resolution & Homonym Disambiguation', () => {
    it('resolves by canonical ID, admin code, alias, coordinates, and disambiguates multi-city homonyms (ستارخان)', () => {
      const engine = new Employee18GeographyEngine();

      const byId = engine.resolveLocationReference({ canonicalId: 'hood:tehran:2' });
      assert.equal(byId.resolved, true);
      assert.equal(byId.matchType, 'canonical_id');
      assert.ok(byId.parentHierarchy.some((p) => p.id === 'city:tehran'));

      const byCode = engine.resolveLocationReference({ administrativeCode: 'THR-D2' });
      assert.equal(byCode.resolved, true);
      assert.equal(byCode.entity?.id, 'district:tehran:2');

      const ambiguousSattarkhan = engine.resolveLocationReference({ neighborhoodNameOrAlias: 'ستارخان' });
      assert.equal(ambiguousSattarkhan.resolved, false);
      assert.equal(ambiguousSattarkhan.isAmbiguous, true);
      assert.ok(ambiguousSattarkhan.ambiguityCandidates.length >= 2);

      const tehranSattarkhan = engine.resolveLocationReference({
        cityNameOrId: 'tehran',
        neighborhoodNameOrAlias: 'ستارخان',
      });
      assert.equal(tehranSattarkhan.resolved, true);
      assert.equal(tehranSattarkhan.entity?.id, 'hood:tehran:28');

      const shirazSattarkhan = engine.resolveLocationReference({
        cityNameOrId: 'shiraz',
        neighborhoodNameOrAlias: 'ستارخان',
      });
      assert.equal(shirazSattarkhan.resolved, true);
      assert.ok(shirazSattarkhan.entity?.id.startsWith('hood:shiraz:'));

      const badCoord = engine.resolveLocationReference({ coordinates: { lat: 51.41, lng: 35.75 } });
      assert.equal(badCoord.resolved, false);
    });
  });

  describe('5. Data Management: Quarantine Import, Rename, Merge, Split & Events', () => {
    it('stages external imports, quarantines invalid records, and commits approved records', () => {
      const events: GeographyDomainEvent[] = [];
      const engine = new Employee18GeographyEngine({
        publishGeographyEvent: async (ev) => { events.push(ev); },
      });

      const staged = engine.stageExternalGeographicImport({
        actor: ADMIN_ACTOR,
        datasetId: 'ds_tehran_2026',
        datasetVersion: '1.0',
        sourceReference: 'tehran_municipality_open_gis',
        candidates: [
          {
            id: 'hood:tehran:custom_test_1', entityType: 'neighborhood',
            displayNameFa: 'محله نمونه ۱', parentId: 'district:tehran:5', center: { lat: 35.75, lng: 51.31 },
          },
          {
            id: 'hood:tehran:bad_parent', entityType: 'neighborhood',
            displayNameFa: 'محله با والد ناموجود', parentId: 'district:tehran:999',
          },
        ],
      });

      assert.equal(staged.validStagedCount, 1);
      assert.equal(staged.quarantinedCount, 1);
      assert.equal(staged.quarantinedRecords[0].reasonCode, 'PARENT_CHILD_CONFLICT');
      assert.equal(engine.store.entities.has('hood:tehran:custom_test_1'), false);

      const committed = engine.approveAndCommitStagedImport({
        actor: ADMIN_ACTOR,
        stagedBatchId: staged.stagedBatchId,
        reason: 'Approved verified neighborhood batch',
      });
      assert.equal(committed.committedCount, 1);
      assert.equal(engine.store.entities.has('hood:tehran:custom_test_1'), true);
      assert.ok(events.some((e) => e.eventType === 'GeographicDatasetImported'));
      assert.ok(events.some((e) => e.eventType === 'GeographicDatasetApproved'));
    });

    it('preserves historical references on rename, merge, and split (requiring explicit split mapping rule)', () => {
      const engine = new Employee18GeographyEngine();

      engine.store.createEntity({
        actor: ADMIN_ACTOR,
        entity: {
          id: 'hood:tehran:merge_a', entityType: 'neighborhood', displayNameFa: 'محله ادغام الف',
          alternativeNames: [], parentId: 'district:tehran:2', sourceReference: 'test',
          verificationStatus: 'reconciled_catalog', geographicStatus: 'active', isInformalOrMarketingName: false,
        },
        reason: 'Seed merge A',
      });
      engine.store.createEntity({
        actor: ADMIN_ACTOR,
        entity: {
          id: 'hood:tehran:merge_b', entityType: 'neighborhood', displayNameFa: 'محله ادغام ب',
          alternativeNames: [], parentId: 'district:tehran:2', sourceReference: 'test',
          verificationStatus: 'reconciled_catalog', geographicStatus: 'active', isInformalOrMarketingName: false,
        },
        reason: 'Seed merge B',
      });

      engine.store.renameEntity({
        actor: ADMIN_ACTOR, entityId: 'hood:tehran:merge_a', newDisplayNameFa: 'محله ادغام الف جدید',
        sourceReference: 'tehran_gazette', reason: 'Official rename',
      });
      const resolvedByOldName = engine.resolveLocationReference({
        cityNameOrId: 'tehran',
        neighborhoodNameOrAlias: 'محله ادغام الف',
      });
      assert.equal(resolvedByOldName.resolved, true);
      assert.equal(resolvedByOldName.entity?.id, 'hood:tehran:merge_a');

      assert.throws(() =>
        engine.store.renameEntity({
          actor: ADMIN_ACTOR, entityId: 'hood:tehran:merge_a', newDisplayNameFa: 'تغییر همزمان نامعتبر',
          expectedVersion: 1, sourceReference: 'tehran_gazette', reason: 'Stale version',
        }),
      /CONCURRENT_VERSION_CONFLICT/);

      const mergeRes = engine.store.mergeEntities({
        actor: ADMIN_ACTOR, sourceEntityId: 'hood:tehran:merge_a', targetEntityId: 'hood:tehran:merge_b',
        sourceReference: 'tehran_gazette', reason: 'Municipal consolidation',
      });
      assert.equal(mergeRes.target.id, 'hood:tehran:merge_b');
      const postMergeLookup = engine.resolveLocationReference({ canonicalId: 'hood:tehran:merge_a' });
      assert.equal(postMergeLookup.resolved, true);
      assert.equal(postMergeLookup.entity?.id, 'hood:tehran:merge_b');

      assert.throws(() =>
        engine.store.splitEntity({
          actor: ADMIN_ACTOR, sourceEntityId: 'hood:tehran:merge_b',
          targetEntityIds: ['hood:tehran:1', 'hood:tehran:2'], splitMappingRule: '',
          sourceReference: 'tehran_gazette', reason: 'Invalid split without mapping rule',
        }),
      /SPLIT_MAPPING_RULE_REQUIRED/);

      const splitRes = engine.store.splitEntity({
        actor: ADMIN_ACTOR, sourceEntityId: 'hood:tehran:merge_b',
        targetEntityIds: ['hood:tehran:1', 'hood:tehran:2'],
        splitMappingRule: 'Reassign records north of 35.75 to hood:tehran:1 and south to hood:tehran:2',
        sourceReference: 'tehran_gazette', reason: 'Split into north and south sectors',
      });
      assert.equal(splitRes.geographicStatus, 'split');
      assert.deepEqual(splitRes.splitIntoIds, ['hood:tehran:1', 'hood:tehran:2']);
    });
  });

  describe('6. Security, Privacy, POIs, H3 Status & Spatial Intelligence', () => {
    it('blocks unauthorized writes, strips restricted coordinates from public address views, and enforces query caps', () => {
      const engine = new Employee18GeographyEngine();

      assert.throws(() =>
        engine.store.deactivateEntity({
          actor: UNAUTHORIZED_ACTOR, entityId: 'hood:tehran:1', sourceReference: 'unauth', reason: 'Malicious deactivation',
        }),
      /FORBIDDEN_GEOGRAPHY_ADMIN_REQUIRED/);

      const privateAddr: StructuredAddressReference = {
        addressId: 'addr_101', countryCode: 'IR', provinceId: 'province:tehran', cityId: 'city:tehran',
        districtId: 'district:tehran:2', neighborhoodId: 'hood:tehran:2', mainRoad: 'بلوار سعادت‌آباد',
        street: 'خیابان بیست و چهارم', alley: 'کوچه سوم', buildingNumber: 'پلاک ۱۲', postalCode: '1997711111',
        preciseCoordinates: { lat: 35.7798, lng: 51.3749 }, publicApproxCenter: { lat: 35.78, lng: 51.375 },
        addressSource: 'user_submission', visibilityPolicy: 'PUBLIC_NEIGHBORHOOD_ONLY', ownerUid: 'seller_99',
        verificationStatus: 'reconciled_catalog',
      };

      const publicView = engine.toPublicSafeAddressView(privateAddr, { uid: 'stranger_1', isAdmin: false });
      assert.equal(publicView.coordinatesExposed, false);
      assert.deepEqual(publicView.displayCoordinates, { lat: 35.78, lng: 51.375 });
      assert.equal('buildingNumber' in publicView, false);
      assert.equal(publicView.street, undefined);

      const ownerView = engine.toPublicSafeAddressView(privateAddr, { uid: 'seller_99', isAdmin: false });
      assert.equal(ownerView.coordinatesExposed, true);
      assert.deepEqual(ownerView.displayCoordinates, { lat: 35.7798, lng: 51.3749 });

      const poi = engine.registerPointOfInterest({
        actor: ADMIN_ACTOR,
        poi: {
          poiId: 'poi:metro_saadat_abad', nameFa: 'ایستگاه مترو میدان کتاب', category: 'metro_station',
          parentEntityId: 'hood:tehran:2', coordinates: { lat: 35.7798, lng: 51.3749 },
          sourceReference: 'tehran_metro_map', verificationStatus: 'reconciled_catalog',
          publicVisibility: 'public', operationalStatus: 'verified_open',
        },
      });
      assert.equal(poi.operationalStatus, 'unknown_unverified');

      const intel = engine.getNeighborhoodSpatialIntelligence('hood:tehran:2');
      assert.ok(intel);
      assert.equal(intel.containsMarketValuationData, false);
      assert.equal(intel.nearbyPublicFacilitiesCountByCategory.metro_station, 1);

      const paged = engine.queryEntitiesPaginated({ limit: 9999 });
      assert.equal(paged.limit, MAX_BULK_SPATIAL_QUERY_LIMIT);

      const h3 = new UnconfiguredH3Provider();
      assert.equal(h3.isAvailable, false);
      assert.equal(h3.pointToCell({ lat: 35.75, lng: 51.37 }, 9).status, 'UNAVAILABLE');

      const quality = engine.generateQualityReport();
      assert.equal(quality.missingParentReferences.length, 0);
      assert.equal(quality.invalidHierarchyLinks.length, 0);
    });
  });
});
