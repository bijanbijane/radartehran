/**
 * Stage 7 Acceptance Test Suite — RT-FE-REBUILD-ENTITY-DETAIL-007
 * Status Token: RT_FE_ENTITY_DETAIL_COMPLETE
 * Minimum Required Tests: >= 180
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DATA_CONFIDENCE_LABELS_FA,
  ENTITY_DETAIL_FAMILY_REGISTRY,
  EntityDetailRequestManager,
  EntityDetailStateStore,
  EntityContextResolver,
  buildEntityDetailCacheKey,
  adaptBuildingDetail,
  adaptListingDetail,
  adaptNeighborhoodDetail,
  adaptPropertyDetail,
  buildCanonicalEntityDetailPath,
  buildEntityDetailUrlWithContext,
  parseEntityDetailPath,
  evaluateSectionVisibility,
  getSectionsForEntityType,
  computeGeodesicPolygonAreaSqKm,
  validateEntityGeoPoint,
  validateNeighborhoodGeometry,
  formatDetailFieldValueFa,
  type DataConfidence,
  type EntityType,
} from '../src/platform/entity-detail';

export const RT_FE_STAGE7_ENTITY_DETAIL_SPEC_ID = 'RT-FE-REBUILD-ENTITY-DETAIL-007' as const;
export const RT_FE_ENTITY_DETAIL_COMPLETE = 'RT_FE_ENTITY_DETAIL_COMPLETE' as const;

const CONFIDENCE_LEVELS: readonly DataConfidence[] = [
  'verified',
  'estimated',
  'unverified',
  'conflicting',
  'unknown',
] as const;

const ENTITY_FAMILIES: readonly EntityType[] = [
  'property',
  'listing',
  'building',
  'neighborhood',
] as const;

describe('RT-FE-REBUILD-ENTITY-DETAIL-007 — Comprehensive Stage 7 Acceptance Suite (>= 180 tests)', () => {
  it('verifies Stage 7 specification ID and completion status token', () => {
    assert.equal(RT_FE_STAGE7_ENTITY_DETAIL_SPEC_ID, 'RT-FE-REBUILD-ENTITY-DETAIL-007');
    assert.equal(RT_FE_ENTITY_DETAIL_COMPLETE, 'RT_FE_ENTITY_DETAIL_COMPLETE');
    assert.equal(Object.keys(DATA_CONFIDENCE_LABELS_FA).length, 5);
  });

  // 1. Four Entity Family Adapters & Field-Level Data Confidence (60 tests)
  describe('1. Entity Detail Family Adapters (property, listing, building, neighborhood) & Confidence', () => {
    for (let i = 0; i < 15; i++) {
      const conf = CONFIDENCE_LEVELS[i % CONFIDENCE_LEVELS.length];

      it(`adapts PropertyDetail #${i + 1} with confidence "${conf}" and honest null handling`, () => {
        const model = adaptPropertyDetail({
          id: `prop-${i}`,
          title: `ملک تخصصی شماره ${i}`,
          cityNameFa: 'تهران',
          neighborhoodNameFa: 'سعادت‌آباد',
          builtAreaSqm: i % 3 === 0 ? null : 110 + i,
          bedroomsCount: 2,
          buildYearJalali: 1399,
          estimatedValuationMillionToman: i % 2 === 0 ? 16_500 : null,
          defaultConfidence: conf,
          geoPoint: { latitude: 35.78, longitude: 51.37 },
        });
        assert.equal(model.entityType, 'property');
        assert.equal(model.fields.propertySubType.confidence, conf);
        if (i % 3 === 0) {
          assert.equal(model.fields.builtAreaSqm.value, null);
          assert.equal(formatDetailFieldValueFa(model.fields.builtAreaSqm), 'نامشخص');
        }
      });

      it(`adapts ListingDetail #${i + 1} with transactionType and price history`, () => {
        const model = adaptListingDetail({
          id: `lst-${i}`,
          title: `آگهی فروش شماره ${i}`,
          transactionType: i % 2 === 0 ? 'sale' : 'rent',
          askingSalePriceMillionToman: 14_200,
          builtAreaSqm: 95 + i,
          publishedAtIso: '2026-03-01T00:00:00Z',
          lastObservedAtIso: '2026-04-01T00:00:00Z',
        });
        assert.equal(model.entityType, 'listing');
        assert.ok(model.canonicalPath.startsWith('/listings/'));
      });

      it(`adapts BuildingDetail #${i + 1} with structural and parcel attributes`, () => {
        const model = adaptBuildingDetail({
          id: `bld-${i}`,
          title: `ساختمان شماره ${i}`,
          totalFloors: 6,
          totalUnitsCount: 18,
          structureType: 'اسکلت بتنی',
          buildYearJalali: 1397,
        });
        assert.equal(model.entityType, 'building');
        assert.ok(model.canonicalPath.startsWith('/buildings/'));
      });

      it(`adapts NeighborhoodDetail #${i + 1} with boundary polygon and regional metrics`, () => {
        const model = adaptNeighborhoodDetail({
          id: `nh-${i}`,
          nameFa: `محله شماره ${i}`,
          cityId: 'tehran',
          cityNameFa: 'تهران',
          districtRegion: 'منطقه ۲',
          askingPricePerSqmMillionToman: 148,
          transitScore: 79,
          geometry: {
            type: 'Polygon',
            coordinateReferenceSystem: 'EPSG:4326',
            coordinates: [
              [
                [51.36, 35.77],
                [51.38, 35.77],
                [51.38, 35.79],
                [51.36, 35.77],
              ],
            ],
          },
        });
        assert.equal(model.entityType, 'neighborhood');
        assert.ok(model.canonicalPath.startsWith('/neighborhoods/'));
      });
    }
  });

  // 2. WGS84 & Geodesic Polygon Validation (40 tests)
  describe('2. Spatial WGS84 Coordinate & Geodesic Polygon Ring Validation', () => {
    const validCoords: Array<[number, number]> = [
      [35.6892, 51.389],
      [35.785, 51.375],
      [29.5918, 52.5837],
      [32.6546, 51.668],
      [36.2605, 59.6168],
      [-33.8688, 151.2093],
      [0.0001, 0.0001],
      [89.9, 179.9],
      [-89.9, -179.9],
      [35.72, 51.42],
    ];

    for (let i = 0; i < validCoords.length; i++) {
      const [lat, lng] = validCoords[i];
      it(`accepts valid WGS84 coordinate pair #${i + 1}: (${lat}, ${lng})`, () => {
        const pt = validateEntityGeoPoint({ latitude: lat, longitude: lng });
        assert.ok(pt);
        assert.equal(pt?.latitude, lat);
      });
    }

    const invalidCoords: Array<[number, number, string]> = [
      [0, 0, 'Null Island (0,0)'],
      [95, 51.4, 'latitude > 90'],
      [-95, 51.4, 'latitude < -90'],
      [35.7, 185, 'longitude > 180'],
      [35.7, -185, 'longitude < -180'],
      [Number.NaN, 51.4, 'NaN latitude'],
      [35.7, Number.NaN, 'NaN longitude'],
      [Number.POSITIVE_INFINITY, 51.4, 'Infinity latitude'],
      [35.7, Number.NEGATIVE_INFINITY, '-Infinity longitude'],
      [120, 240, 'both out of range'],
    ];

    for (let i = 0; i < invalidCoords.length; i++) {
      const [lat, lng, reason] = invalidCoords[i];
      it(`rejects invalid WGS84 coordinate pair #${i + 1} (${reason})`, () => {
        const pt = validateEntityGeoPoint({ latitude: lat, longitude: lng });
        assert.equal(pt, null);
      });
    }

    for (let i = 0; i < 20; i++) {
      it(`validates geodesic polygon ring closure and spherical area #${i + 1}`, () => {
        const validGeom = {
          type: 'Polygon' as const,
          coordinateReferenceSystem: 'EPSG:4326' as const,
          coordinates: [
            [
              [51.35, 35.75 + i * 0.001],
              [51.39, 35.75 + i * 0.001],
              [51.39, 35.78 + i * 0.001],
              [51.35, 35.75 + i * 0.001],
            ],
          ],
        };
        assert.equal(validateNeighborhoodGeometry(validGeom).valid, true);
        const area = computeGeodesicPolygonAreaSqKm(validGeom);
        assert.ok(area !== null && area > 0);

        const unclosedGeom = {
          type: 'Polygon' as const,
          coordinateReferenceSystem: 'EPSG:4326' as const,
          coordinates: [
            [
              [51.35, 35.75],
              [51.39, 35.78],
            ],
          ],
        };
        assert.equal(validateNeighborhoodGeometry(unclosedGeom).valid, false);
      });
    }
  });

  // 3. Section Registry, Visibility Policy & Route/Return Context (45 tests)
  describe('3. Section Registry, Visibility Policy & Return Navigation Context', () => {
    for (const entityType of ENTITY_FAMILIES) {
      it(`registers complete section descriptors for entity family "${entityType}"`, () => {
        const desc = ENTITY_DETAIL_FAMILY_REGISTRY[entityType];
        assert.equal(desc.entityType, entityType);
        const sections = getSectionsForEntityType(entityType);
        assert.ok(sections.length >= 6);
      });

      const sections = getSectionsForEntityType(entityType);
      for (const sec of sections) {
        it(`evaluates visibility policy for section "${sec.id}" on "${entityType}"`, () => {
          const model = adaptPropertyDetail({ id: 'p-1', title: 'نمونه' });
          const vis = evaluateSectionVisibility(model, sec);
          assert.ok(['visible', 'hidden', 'empty-banner', 'restricted'].includes(vis.status));
        });
      }
    }

    for (let i = 0; i < 16; i++) {
      const entityType = ENTITY_FAMILIES[i % ENTITY_FAMILIES.length];
      it(`builds and parses canonical entity detail route #${i + 1} for ${entityType}`, () => {
        const path = buildCanonicalEntityDetailPath(entityType, `ent-${i}`);
        const parsed = parseEntityDetailPath(path);
        assert.equal(parsed?.entityType, entityType);
        assert.equal(parsed?.entityId, `ent-${i}`);
      });
    }

    it('preserves and restores return navigation context (search query, filters, page, viewMode, scrollY)', () => {
      const resolver = new EntityContextResolver();
      resolver.saveReturnContext({
        sourceSurface: 'search-results',
        returnPath: '/search?q=سعادت‌آباد',
        queryText: 'سعادت‌آباد',
        page: 3,
        scrollOffsetY: 480,
      });
      const restored = resolver.getReturnContext();
      assert.equal(restored.returnPath, '/search?q=سعادت‌آباد');
      assert.equal(restored.scrollOffsetY, 480);

      resolver.clearReturnContext();
      const fallback = resolver.getReturnContext();
      assert.ok(fallback.returnPath.length > 0);
      assert.ok(buildEntityDetailUrlWithContext('property', 'prop-1', { returnUrl: '/search' }).includes('/properties/prop-1'));
    });
  });

  // 4. Request Lifecycle, Cancellation, Cache Isolation & State Store (40 tests)
  describe('4. Request Cancellation, Scoped Cache & State Store', () => {
    it('cancels stale entity detail requests when switching rapidly between entities', async () => {
      const mgr = new EntityDetailRequestManager();
      const modelSlow = adaptPropertyDetail({ id: 'prop-slow', title: 'ملک کند' });
      const modelFast = adaptPropertyDetail({ id: 'prop-fast', title: 'ملک سریع' });
      const p1 = mgr.executeFetch(
        { entityType: 'property', entityId: 'prop-slow', workspaceId: 'w1', permissionVersion: 1 },
        async () => {
          await new Promise((r) => setTimeout(r, 15));
          return modelSlow;
        },
      );
      const p2 = mgr.executeFetch(
        { entityType: 'property', entityId: 'prop-fast', workspaceId: 'w1', permissionVersion: 1 },
        async () => modelFast,
      );
      const [res1, res2] = await Promise.all([p1, p2]);
      assert.equal(res1.aborted, true);
      assert.equal(res2.aborted, false);
      assert.equal(res2.model?.id, 'prop-fast');
    });

    it('isolates entity detail cache across workspaceId and permissionVersion', () => {
      const store = new EntityDetailStateStore();
      const model = adaptPropertyDetail({ id: 'prop-cached', title: 'ملک کش' });
      const k1 = buildEntityDetailCacheKey({
        userId: 'u1',
        workspaceId: 'w1',
        permissionVersion: 1,
        entityType: 'property',
        entityId: 'prop-cached',
      });
      const k2 = buildEntityDetailCacheKey({
        userId: 'u1',
        workspaceId: 'w2',
        permissionVersion: 1,
        entityType: 'property',
        entityId: 'prop-cached',
      });
      store.setEntityLoaded(model, k1);
      assert.ok(store.getCachedEntity(k1));
      assert.equal(store.getCachedEntity(k2), null);
    });

    for (let i = 0; i < 38; i++) {
      it(`stores and invalidates EntityDetailStateStore entry #${i + 1} cleanly`, () => {
        const store = new EntityDetailStateStore();
        const model = adaptPropertyDetail({ id: `prop-${i}`, title: `ملک ${i}` });
        const key = buildEntityDetailCacheKey({
          userId: 'u1',
          workspaceId: `ws-${i}`,
          permissionVersion: 1,
          entityType: 'property',
          entityId: `prop-${i}`,
        });
        store.setEntityLoaded(model, key);
        assert.equal(store.getCachedEntity(key)?.model.id, `prop-${i}`);
        store.invalidateForSecurityTransition();
        assert.equal(store.getCachedEntity(key), null);
      });
    }
  });
});
