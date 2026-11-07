/**
 * @file tests/geography-module.test.ts
 * @description Unit and spatial tests for Employee 11 Geography & Location Intelligence Module.
 */

import assert from 'node:assert/strict';
import {
  GeographyService,
  GeographyCatalog,
  normalizeGeographicNameFa,
  validateCoordinates,
  calculateGeodesicDistanceMeters,
  isPointInsideGeometry,
  MockGeocodingProvider,
} from '../server/modules/geography';

console.log('🧪 Running Employee 11 Geography & Location Intelligence Tests...\n');

let passed = 0;
function verify(name: string, fn: () => void | Promise<void>) {
  const res = fn();
  if (res instanceof Promise) {
    return res.then(() => {
      passed += 1;
      console.log(`  ✅ ${passed}. ${name}`);
    });
  }
  passed += 1;
  console.log(`  ✅ ${passed}. ${name}`);
}

async function runAllTests() {
  const service = new GeographyService();

  // Test 1: Geographic hierarchy navigation
  await verify('Hierarchy supports Country -> Province -> City -> District -> Neighborhood navigation', () => {
    const provinces = service.listProvinces();
    assert.ok(provinces.length >= 31, 'Must include all 31 Iranian provinces');

    const tehranProv = provinces.find((p) => p.id === 'province:tehran');
    assert.ok(tehranProv !== undefined);
    assert.equal(tehranProv?.parentId, 'country:ir');

    const tehranCities = service.listCitiesByProvince('province:tehran');
    assert.ok(tehranCities.some((c) => c.id === 'city:tehran'));

    const tehranDistricts = service.listDistrictsByCity('city:tehran');
    assert.equal(tehranDistricts.length, 22, 'Tehran must have 22 urban districts');

    const tehranHoods = service.listNeighborhoods('city:tehran');
    assert.ok(tehranHoods.length > 50, 'Tehran must have populated canonical neighborhoods');
  });

  // Test 2: Persian text normalization and alternative name search
  await verify('Search engine resolves entities with Persian/Arabic normalization and alternative names', () => {
    // Normalization check: Yeh/Kaf, Alef with Hamza, ZWNJ, digits
    const normalized = normalizeGeographicNameFa('  سَعادَت‌آباد، مَنطقه‌ٔ ۲  ');
    assert.ok(normalized.includes('سعادت اباد'));

    // Search with normalized text
    const searchResults = service.searchEntities('سعادت اباد', { level: 'neighborhood' });
    assert.ok(searchResults.length > 0);
    assert.ok(searchResults[0].nameFa.includes('سعادت‌آباد') || searchResults[0].nameFa.includes('سعادت آباد'));

    // Search with city alternative name
    const karajMatches = service.searchEntities('کلانشهر کرج', { level: 'city' });
    assert.ok(karajMatches.length > 0);
    assert.equal(karajMatches[0].id, 'city:karaj');
  });

  // Test 3: Parent-child relationship validation
  await verify('Catalog validates parent-child integrity and rejects invalid cross-city relationships', () => {
    // Valid relationship: Punak in Tehran
    const validCheck = service.validateHierarchyRelationship('hood:tehran:5', 'city:tehran');
    assert.equal(validCheck, true);

    const validProvinceCheck = service.validateHierarchyRelationship('hood:tehran:5', 'province:tehran');
    assert.equal(validProvinceCheck, true);

    // Invalid relationship: Punak in Shiraz or Isfahan
    const invalidCheck = service.validateHierarchyRelationship('hood:tehran:5', 'city:shiraz');
    assert.equal(invalidCheck, false, 'Tehran neighborhood must not be validated as part of Shiraz');
  });

  // Test 4: Coordinate validation and Lat/Lng swap detection
  await verify('Coordinate validator verifies bounds and detects swapped latitude/longitude', () => {
    // Valid Tehran coordinate
    const valid = validateCoordinates(35.75, 51.40);
    assert.equal(valid.valid, true);
    assert.equal(valid.isInIranBounds, true);
    assert.equal(valid.isPotentiallySwapped, false);

    // Out of WGS84 range
    const outOfRange = validateCoordinates(120, 51.40);
    assert.equal(outOfRange.valid, false);

    // Null island
    const nullIsland = validateCoordinates(0, 0);
    assert.equal(nullIsland.valid, false);

    // Swapped coordinates: Lat=51.40, Lng=35.75 (swapped!)
    const swapped = validateCoordinates(51.40, 35.75);
    assert.equal(swapped.valid, true);
    assert.equal(swapped.isPotentiallySwapped, true, 'Must flag swapped coordinates');
  });

  // Test 5: Geodesic distance calculation
  await verify('Geodesic calculator computes accurate distances on WGS-84 ellipsoid', () => {
    // Distance between Azadi Tower (~35.6997, 51.3380) and Milad Tower (~35.7448, 51.3753)
    const dist = calculateGeodesicDistanceMeters(
      { lat: 35.6997, lng: 51.3380 },
      { lat: 35.7448, lng: 51.3753 },
    );
    // Real distance is ~6.1 km (6100 meters +- 200m)
    assert.ok(dist >= 5900 && dist <= 6400, `Expected ~6.1km, got ${dist}m`);
  });

  // Test 6: Point-in-polygon geometry and hole tests
  await verify('Spatial engine calculates point-in-polygon and respects polygon holes', () => {
    // Synthetic test polygon around coordinates [51.0, 35.0] to [51.1, 35.1]
    const testPolygon = {
      type: 'Polygon' as const,
      coordinates: [
        // Outer ring: [lng, lat]
        [
          [51.0, 35.0],
          [51.1, 35.0],
          [51.1, 35.1],
          [51.0, 35.1],
          [51.0, 35.0],
        ],
        // Inner hole: [lng, lat]
        [
          [51.04, 35.04],
          [51.06, 35.04],
          [51.06, 35.06],
          [51.04, 35.06],
          [51.04, 35.04],
        ],
      ],
    };

    // Point inside outer ring but outside hole
    const insidePoint = { lat: 35.02, lng: 51.02 };
    assert.equal(isPointInsideGeometry(insidePoint, testPolygon), true);

    // Point inside hole -> must be outside!
    const holePoint = { lat: 35.05, lng: 51.05 };
    assert.equal(isPointInsideGeometry(holePoint, testPolygon), false);

    // Point outside outer ring
    const outsidePoint = { lat: 35.2, lng: 51.2 };
    assert.equal(isPointInsideGeometry(outsidePoint, testPolygon), false);
  });

  // Test 7: Address normalization & zero coordinate fabrication
  await verify('Address resolver parses administrative units and never fabricates coordinates', () => {
    const rawAddress = 'تهران، منطقه ۵، محله پونک، بلوار میرزابابایی، پلاک ۱۲';
    const outcome = service.resolveAddress(rawAddress);

    assert.equal(outcome.normalizedAddress.detectedCityFa, 'تهران');
    assert.equal(outcome.normalizedAddress.detectedNeighborhoodFa, 'پونک');
    assert.ok(outcome.resolvedEntity !== undefined);
    assert.equal(outcome.isCoordinateVerified, false, 'Must not claim verified coordinates from text');
    assert.equal(outcome.verifiedCoordinates, undefined, 'Must NEVER fabricate coordinates from user text');
  });

  // Test 8: Geocoding and H3 provider abstractions
  await verify('Geocoding and H3 providers report transparent availability status', async () => {
    // 1. Default geocoder is unavailable
    const forwardRes = await service.forwardGeocode('تهران، سعادت‌آباد');
    assert.equal(forwardRes.status, 'UNAVAILABLE');
    assert.ok(forwardRes.error?.includes('GEOCODING_PROVIDER_NOT_CONFIGURED'));

    // 2. Mock geocoder for testing
    const mockService = new GeographyService({
      geocodingProvider: new MockGeocodingProvider('test_provider', 'SUCCESS'),
    });
    const mockRes = await mockService.forwardGeocode('تهران، ونک');
    assert.equal(mockRes.status, 'SUCCESS');
    assert.ok(mockRes.location !== undefined);

    // 3. H3 Provider is unconfigured by default
    const h3Status = service.getH3CellForPoint({ lat: 35.75, lng: 51.40 });
    assert.equal(h3Status.status, 'UNAVAILABLE');
    assert.ok(h3Status.reason?.includes('H3_DEPENDENCY_MISSING'));
  });

  // Test 9: Dataset import pipeline and dry-run validation
  await verify('Dataset import pipeline validates batches, detects duplicates, and supports dry-run', () => {
    // Valid candidate
    const candidates = [
      {
        id: 'hood:tehran:999',
        level: 'neighborhood' as const,
        parentId: 'city:tehran',
        nameFa: 'محله آزمایشی پرواز',
        boundaryProvenance: 'APPROXIMATE_RADIUS_SYNTHESIS' as const,
        sourceAuthority: 'داده آزمایشی',
        datasetVersion: 'V1',
        approximateRadiusMeters: 800,
        center: { lat: 35.78, lng: 51.35 },
      },
      // Invalid duplicate candidate in same batch
      {
        id: 'hood:tehran:999',
        level: 'neighborhood' as const,
        parentId: 'city:tehran',
        nameFa: 'محله تکراری',
        boundaryProvenance: 'APPROXIMATE_RADIUS_SYNTHESIS' as const,
        sourceAuthority: 'داده آزمایشی',
        datasetVersion: 'V1',
      },
    ];

    const dryRunSummary = service.importDataset(candidates, { dryRun: true });
    assert.equal(dryRunSummary.dryRun, true);
    assert.equal(dryRunSummary.totalImported, 2);
    assert.equal(dryRunSummary.invalidCount, 1, 'Duplicate ID must be flagged as invalid');
    assert.ok(dryRunSummary.errors.some((e) => e.includes('DUPLICATE_ID_IN_BATCH')));
  });

  console.log('\n🎉 ALL 9 EMPLOYEE 11 GEOGRAPHY & LOCATION INTELLIGENCE TESTS PASSED!');
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
