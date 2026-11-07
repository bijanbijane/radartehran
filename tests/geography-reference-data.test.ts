/**
 * @file tests/geography-reference-data.test.ts
 * @description Comprehensive Test Suite for the Geographic Reference-Data Backend (Employee 8).
 * Covers city-neighborhood consistency, duplicate identifiers, aliases, invalid references,
 * missing coordinates, versioning, hierarchy traversal, spatial queries, and backward compatibility.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  defaultGeographicService,
  generateReconciliationInventoryReport,
  auditGeographicDataIntegrity,
  HISTORICAL_59_RECONCILIATION_ANALYSIS,
  SUPPORTED_CITY_IDS,
  CANONICAL_CITIES,
  CANONICAL_PROVINCES,
  listAllCanonicalNeighborhoods,
  listNeighborhoodsByCity,
  getNeighborhoodByCompositeId,
  normalizePersianText,
  computeBoundingBox,
  calculateHaversineDistanceKm,
  NEIGHBORHOODS_DATASET_VERSION,
} from '../server/modules/geography';

describe('Employee 8 — Geographic Reference Data Backend', () => {
  // =========================================================================
  // 1. City Registry & Province Relationships
  // =========================================================================
  describe('City Registry & Province Relationships', () => {
    it('supports exactly the 5 initial required cities', () => {
      assert.deepEqual([...SUPPORTED_CITY_IDS], ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);
      const cities = defaultGeographicService.listCities();
      assert.equal(cities.length, 5);
    });

    it('links each city to its canonical parent province', () => {
      const tehran = defaultGeographicService.getCity('tehran');
      assert.ok(tehran);
      assert.equal(tehran?.provinceId, 'tehran');
      assert.equal(tehran?.nameFa, 'تهران');

      const karaj = defaultGeographicService.getCity('karaj');
      assert.ok(karaj);
      assert.equal(karaj?.provinceId, 'alborz');
      assert.equal(karaj?.nameFa, 'کرج');

      const mashhad = defaultGeographicService.getCity('mashhad');
      assert.ok(mashhad);
      assert.equal(mashhad?.provinceId, 'razavi_khorasan');

      const isfahan = defaultGeographicService.getCity('isfahan');
      assert.ok(isfahan);
      assert.equal(isfahan?.provinceId, 'isfahan');

      const shiraz = defaultGeographicService.getCity('shiraz');
      assert.ok(shiraz);
      assert.equal(shiraz?.provinceId, 'fars');
    });

    it('resolves cities by ID, slug, and official Persian name', () => {
      assert.equal(defaultGeographicService.getCity('TEHRAN')?.id, 'tehran');
      assert.equal(defaultGeographicService.getCity('اصفهان')?.id, 'isfahan');
      assert.equal(defaultGeographicService.getCity('shiraz')?.id, 'shiraz');
      assert.equal(defaultGeographicService.getCity('non_existent_city'), null);
    });
  });

  // =========================================================================
  // 2. Initial Data Inventory & 59-Neighborhood Historical Reconciliation
  // =========================================================================
  describe('Inventory & 59-Neighborhood Historical Reconciliation', () => {
    it('inventories all 265 active canonical neighborhoods across 5 cities', () => {
      const allHoods = listAllCanonicalNeighborhoods();
      assert.equal(allHoods.length, 265, 'Total canonical neighborhoods must equal 265');

      assert.equal(listNeighborhoodsByCity('tehran').length, 80);
      assert.equal(listNeighborhoodsByCity('karaj').length, 55);
      assert.equal(listNeighborhoodsByCity('mashhad').length, 40);
      assert.equal(listNeighborhoodsByCity('isfahan').length, 45);
      assert.equal(listNeighborhoodsByCity('shiraz').length, 45);
    });

    it('reconciles historical 59-neighborhood report with source data', () => {
      const report = generateReconciliationInventoryReport();
      assert.equal(report.historical59Reconciliation.reportedCount, 59);
      assert.equal(report.historical59Reconciliation.reconciledCount, 265);
      assert.equal(report.historical59Reconciliation.tehranMunicipalCoreCount, 60);
      assert.equal(report.historical59Reconciliation.tehranCountyCount, 20);
      assert.equal(report.historical59Reconciliation.totalTehranCatalogCount, 80);

      // Verify that record #59 is indeed Khani Abad No & Abdol Abad
      const hood59 = defaultGeographicService.getNeighborhood('tehran', 59);
      assert.ok(hood59);
      assert.ok(hood59?.nameFa.includes('خانی‌آباد'));
    });

    it('confirms every neighborhood belongs to exactly one city', () => {
      const audit = auditGeographicDataIntegrity();
      assert.equal(audit.allHoodsBelongToExactlyOneCity, true);
    });
  });

  // =========================================================================
  // 3. Identifier Requirements & Immutability
  // =========================================================================
  describe('Identifier Requirements & Immutability', () => {
    it('verifies zero duplicate numeric IDs across all cities', () => {
      const audit = auditGeographicDataIntegrity();
      assert.deepEqual(audit.duplicateNumericIds, [], 'There must be 0 duplicate numeric IDs');
    });

    it('constructs valid globally unique composite IDs', () => {
      const hood1 = getNeighborhoodByCompositeId('tehran:1');
      assert.ok(hood1);
      assert.equal(hood1?.id, 1);
      assert.equal(hood1?.nameFa, 'زعفرانیه');

      const hood101 = getNeighborhoodByCompositeId('karaj:101');
      assert.ok(hood101);
      assert.equal(hood101?.id, 101);
      assert.equal(hood101?.nameFa, 'عظیمیه');

      const hood401 = getNeighborhoodByCompositeId('shiraz:401');
      assert.ok(hood401);
      assert.equal(hood401?.nameFa, 'قصرالدشت');
    });

    it('preserves established numeric ID allocation intervals', () => {
      const tehranIds = listNeighborhoodsByCity('tehran').map((h) => h.id);
      assert.equal(Math.min(...tehranIds), 1);
      assert.equal(Math.max(...tehranIds), 80);

      const karajIds = listNeighborhoodsByCity('karaj').map((h) => h.id);
      assert.equal(Math.min(...karajIds), 101);
      assert.equal(Math.max(...karajIds), 155);

      const mashhadIds = listNeighborhoodsByCity('mashhad').map((h) => h.id);
      assert.equal(Math.min(...mashhadIds), 201);
      assert.equal(Math.max(...mashhadIds), 240);

      const isfahanIds = listNeighborhoodsByCity('isfahan').map((h) => h.id);
      assert.equal(Math.min(...isfahanIds), 301);
      assert.equal(Math.max(...isfahanIds), 345);

      const shirazIds = listNeighborhoodsByCity('shiraz').map((h) => h.id);
      assert.equal(Math.min(...shirazIds), 401);
      assert.equal(Math.max(...shirazIds), 445);
    });
  });

  // =========================================================================
  // 4. City-to-Neighborhood Validation
  // =========================================================================
  describe('City-to-Neighborhood Validation', () => {
    it('validates correct city and neighborhood pairs', () => {
      const res = defaultGeographicService.validateCityNeighborhood('tehran', 3);
      assert.equal(res.valid, true);
      assert.equal(res.reasonCode, 'VALID');
      assert.equal(res.neighborhood?.nameFa, 'سعادت‌آباد');
    });

    it('rejects unsupported city identifiers', () => {
      const res = defaultGeographicService.validateCityNeighborhood('tabriz', 1);
      assert.equal(res.valid, false);
      assert.equal(res.reasonCode, 'CITY_NOT_SUPPORTED');
    });

    it('rejects invalid identifier formats (negative, NaN, non-integer)', () => {
      const res1 = defaultGeographicService.validateCityNeighborhood('tehran', -5);
      assert.equal(res1.valid, false);
      assert.equal(res1.reasonCode, 'INVALID_IDENTIFIER_FORMAT');

      const res2 = defaultGeographicService.validateCityNeighborhood('tehran', 'abc');
      assert.equal(res2.valid, false);
      assert.equal(res2.reasonCode, 'INVALID_IDENTIFIER_FORMAT');
    });

    it('detects mismatched city for a valid neighborhood and provides suggestedCityId', () => {
      // ID 101 is Azimiyeh in Karaj, passed with city 'tehran'
      const res = defaultGeographicService.validateCityNeighborhood('tehran', 101);
      assert.equal(res.valid, false);
      assert.equal(res.reasonCode, 'HOOD_DOES_NOT_BELONG_TO_CITY');
      assert.equal(res.suggestedCityId, 'karaj');
      assert.ok(res.errorMessage?.includes('Karaj') || res.errorMessage?.includes('karaj'));
    });

    it('handles non-existent neighborhood IDs', () => {
      const res = defaultGeographicService.validateCityNeighborhood('tehran', 99999);
      assert.equal(res.valid, false);
      assert.equal(res.reasonCode, 'HOOD_NOT_FOUND');
    });
  });

  // =========================================================================
  // 5. Aliases, Alternative Spellings & Ambiguity Detection
  // =========================================================================
  describe('Aliases, Alternative Spellings & Ambiguity Detection', () => {
    it('normalizes Persian text across ZWNJ, Arabic Yeh/Kaf, and diacritics', () => {
      assert.equal(normalizePersianText('سعادت‌آباد'), normalizePersianText('سعادت آباد'));
      assert.equal(normalizePersianText('يوسف‌اباد'), normalizePersianText('یوسف آباد'));
      assert.equal(normalizePersianText('شهرك غرب'), normalizePersianText('شهرک غرب'));
    });

    it('resolves common colloquial and spelling aliases', () => {
      const r1 = defaultGeographicService.resolveAmbiguousName('شهرک قدس', 'tehran');
      assert.equal(r1.resolved, true);
      assert.equal(r1.candidates[0].neighborhood.id, 4); // Shahrak Gharb

      const r2 = defaultGeographicService.resolveAmbiguousName('رجایی شهر', 'karaj');
      assert.equal(r2.resolved, true);
      assert.equal(r2.candidates[0].neighborhood.id, 103); // Gohardasht

      const r3 = defaultGeographicService.resolveAmbiguousName('قصردشت', 'shiraz');
      assert.equal(r3.resolved, true);
      assert.equal(r3.candidates[0].neighborhood.id, 401); // Qasr al-Dasht
    });

    it('detects cross-city duplicate name ambiguity for Sattarkhan', () => {
      // Sattarkhan exists in both Tehran (ID: 28) and Shiraz (ID: 404)
      const audit = auditGeographicDataIntegrity();
      assert.equal(audit.crossCityDuplicateNames.length, 1);
      assert.equal(audit.crossCityDuplicateNames[0].name, 'ستارخان');
      assert.deepEqual(audit.crossCityDuplicateNames[0].cities, ['tehran', 'shiraz']);

      // Unqualified lookup must be flagged as ambiguous
      const resUnqualified = defaultGeographicService.resolveAmbiguousName('ستارخان');
      assert.equal(resUnqualified.resolved, true);
      assert.equal(resUnqualified.isAmbiguous, true);
      assert.equal(resUnqualified.candidates.length, 2);

      // Qualified lookup resolves cleanly
      const resTehran = defaultGeographicService.resolveAmbiguousName('ستارخان', 'tehran');
      assert.equal(resTehran.isAmbiguous, false);
      assert.equal(resTehran.candidates[0].neighborhood.compositeId, 'tehran:28');

      const resShiraz = defaultGeographicService.resolveAmbiguousName('ستارخان', 'shiraz');
      assert.equal(resShiraz.isAmbiguous, false);
      assert.equal(resShiraz.candidates[0].neighborhood.compositeId, 'shiraz:404');
    });
  });

  // =========================================================================
  // 6. Administrative Hierarchy & Parent-Child Traversal
  // =========================================================================
  describe('Administrative Hierarchy & Parent-Child Traversal', () => {
    it('resolves full hierarchical path from country to neighborhood', () => {
      const hierarchy = defaultGeographicService.getNeighborhoodHierarchy('tehran', 1);
      assert.ok(hierarchy);
      assert.equal(hierarchy?.country.code, 'IR');
      assert.equal(hierarchy?.country.nameFa, 'ایران');
      assert.equal(hierarchy?.province.id, 'tehran');
      assert.equal(hierarchy?.city.id, 'tehran');
      assert.equal(hierarchy?.district.districtNumber, 1);
      assert.equal(hierarchy?.neighborhood.nameFa, 'زعفرانیه');
    });

    it('correctly extracts municipal district numbers', () => {
      const punak = defaultGeographicService.getNeighborhood('tehran', 5);
      assert.equal(punak?.districtNumber, 5);

      const saadat = defaultGeographicService.getNeighborhood('tehran', 3);
      assert.equal(saadat?.districtNumber, 2);
    });
  });

  // =========================================================================
  // 7. Spatial Capabilities & Missing Coordinates
  // =========================================================================
  describe('Spatial Capabilities & Missing Coordinates', () => {
    it('audits that active records have zero missing coordinates', () => {
      const audit = auditGeographicDataIntegrity();
      assert.equal(audit.missingCoordinatesCount, 0);
    });

    it('safely computes bounding boxes from center and radius', () => {
      const bbox = computeBoundingBox({ lat: 35.735, lng: 51.395 }, 1000);
      assert.ok(bbox);
      assert.ok(bbox!.minLat < 35.735 && bbox!.maxLat > 35.735);
      assert.ok(bbox!.minLng < 51.395 && bbox!.maxLng > 51.395);

      // Missing coordinates return null safely
      assert.equal(computeBoundingBox(null, 1000), null);
      assert.equal(computeBoundingBox({ lat: 35.0, lng: 51.0 }, 0), null);
    });

    it('calculates accurate Haversine distance and locates nearest neighborhood', () => {
      const dist = calculateHaversineDistanceKm(35.735, 51.395, 35.8085, 51.4162);
      assert.ok(dist > 7 && dist < 11);

      // Near Saadat Abad coordinates [35.7795, 51.3685]
      const nearest = defaultGeographicService.findNearestNeighborhood(35.779, 51.368, 'tehran');
      assert.ok(nearest);
      assert.equal(nearest?.neighborhood.nameFa, 'سعادت‌آباد');
      assert.ok(nearest?.distanceKm < 1.0);
    });

    it('queries neighborhoods within a bounding box', () => {
      // Bounding box covering northern Tehran
      const bbox = { minLat: 35.78, maxLat: 35.85, minLng: 51.35, maxLng: 51.45 };
      const hoods = defaultGeographicService.findNeighborhoodsInBoundingBox(bbox, 'tehran');
      assert.ok(hoods.length > 0);
      assert.ok(hoods.some((h) => h.nameFa === 'زعفرانیه'));
    });
  });

  // =========================================================================
  // 8. Versioning, Provenance & Backward Compatibility
  // =========================================================================
  describe('Versioning, Provenance & Backward Compatibility', () => {
    it('attaches consistent dataset provenance metadata to all records', () => {
      const allHoods = listAllCanonicalNeighborhoods();
      for (const h of allHoods) {
        assert.equal(h.provenance.datasetVersion, NEIGHBORHOODS_DATASET_VERSION);
        assert.equal(h.provenance.verificationStatus, 'verified');
        assert.equal(h.status, 'active');
        assert.equal(h.boundary.geometryType, 'approximate_radius');
        assert.equal(h.boundary.verifiedPolygonAvailable, false);
      }
    });

    it('preserves existing frontend catalog contracts without modification', () => {
      // Re-verifies that core Tehran ID 1 is Zaferaniyeh, ID 3 is Saadat Abad, ID 5 is Punak
      assert.equal(defaultGeographicService.getNeighborhood('tehran', 1)?.nameFa, 'زعفرانیه');
      assert.equal(defaultGeographicService.getNeighborhood('tehran', 3)?.nameFa, 'سعادت‌آباد');
      assert.equal(defaultGeographicService.getNeighborhood('tehran', 5)?.nameFa, 'پونک');
    });
  });
});
