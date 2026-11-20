/**
 * @file tests/multicity-brand-and-geo-integrity.test.ts
 * @description Comprehensive unit, fuzz, static-invariant, and HTTP integration tests for
 * RadarTehran permanent brand identity, geospatial city resolution, zero silent Tehran fallback,
 * cross-city ownership integrity, service coverage matrix, and Service Worker cache isolation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express, { type Request } from 'express';

import {
  CANONICAL_BRAND_FA,
  CANONICAL_BRAND_EN,
  NAVIGATION_GEOMETRY_VERSION,
  CITY_NAVIGATION_GEOMETRIES,
  SUPPORTED_CITY_IDS,
  formatBrandCityTitle,
  parseStrictCityId,
  resolveCityParamOrReject,
  validateCityNeighborhoodOwnership,
  isValidBoundaryGeometry,
  isPointInGeometry,
  resolveCityFromCoordinates,
  getCityServiceCoverage,
  computeGeometryBbox,
  type CityNavigationGeometry,
  type GeoBoundaryGeometry,
} from '../src/utils/geo/cityGeospatialResolver';
import { MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood } from '../src/data/multiCityData';
import { injectDynamicSeoMeta } from '../src/utils/serverSeoAndSitemap';
import { registerGlobalSearchGovernanceAndAnalyticsRoutes } from '../server/modules/search/globalSearchAndGovernanceGateway';
import { validateAndSanitizeSearchQuery } from '../server/modules/search/searchValidator';
import { registerUtilityRoutes } from '../src/utils/serverUtilityRoutes';
import { registerAiAndCommerceRoutes } from '../src/utils/serverAiAndCommerceRoutes';
import { registerSocioeconomicRoutes } from '../src/cells/socioeconomic-intelligence/socioeconomicRoutes';
import { registerCrowdClaimsRoutes } from '../src/cells/knowledge-crowd/crowdClaimsRoutes';
import { registerDataGovernanceRoutes } from '../server/modules/data-governance/dgovRoutes';

const ROOT = process.cwd();

test('Permanent Brand Identity: canonical brand helpers and static UI/SEO/manifest invariants', () => {
  assert.equal(CANONICAL_BRAND_FA, 'رادارتهران');
  assert.equal(CANONICAL_BRAND_EN, 'RadarTehran');

  for (const cityId of SUPPORTED_CITY_IDS) {
    const title = formatBrandCityTitle(cityId);
    assert.ok(title.includes('رادارتهران'), `Title for ${cityId} must preserve permanent brand: ${title}`);
    assert.ok(!/رادار\s+(کرج|مشهد|اصفهان|شیراز|مسکن)/.test(title), `Forbidden mutated brand in title: ${title}`);
  }

  const forbiddenBrandPattern = /رادار\s+(کرج|مشهد|اصفهان|شیراز|مسکن)|رادر\s+مسکن|BRAND_BY_CITY/;
  const filesToCheck = [
    'index.html',
    'public/manifest.json',
    'src/components/navigation/ProductGlobalHeader.tsx',
    'src/components/FloatingTopBar.tsx',
    'src/features/home/sections/HomeHeroAndMapPreview.tsx',
    'src/features/home/sections/HomeMarketAndMethodologySections.tsx',
    'src/utils/serverSeoAndSitemap.ts',
  ];

  for (const relPath of filesToCheck) {
    const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.ok(!forbiddenBrandPattern.test(content), `Forbidden mutated brand pattern detected in ${relPath}`);
  }

  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('رادارتهران'), 'index.html must include permanent brand رادارتهران');

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.json'), 'utf8')) as {
    name?: string;
    short_name?: string;
  };
  assert.equal(manifest.short_name, 'رادارتهران');
  assert.ok(String(manifest.name || '').startsWith('رادارتهران'));
});

test('Strict City Parameter Parsing & Ownership Validation: zero silent Tehran fallback', () => {
  assert.equal(parseStrictCityId('tehran'), 'tehran');
  assert.equal(parseStrictCityId('KARAJ'), 'karaj');
  assert.equal(parseStrictCityId('  mashhad  '), 'mashhad');
  assert.equal(parseStrictCityId('unknown_xyz'), null);
  assert.equal(parseStrictCityId(''), null);
  assert.equal(parseStrictCityId(null), null);

  const rejectedExplicit = resolveCityParamOrReject('invalid_city', { allowOmittedDefault: 'tehran' });
  assert.equal(rejectedExplicit.ok, false);
  if (!rejectedExplicit.ok) {
    assert.equal(rejectedExplicit.code, 'INVALID_CITY_ID');
  }

  const allowedOmitted = resolveCityParamOrReject(undefined, { allowOmittedDefault: 'tehran' });
  assert.equal(allowedOmitted.ok, true);
  if (allowedOmitted.ok) {
    assert.equal(allowedOmitted.cityId, 'tehran');
  }

  const rejectedOmittedStrict = resolveCityParamOrReject(undefined, { allowOmittedDefault: null });
  assert.equal(rejectedOmittedStrict.ok, false);

  // Hood 5 (Punak) belongs to Tehran — requesting under Karaj must fail with CITY_NEIGHBORHOOD_MISMATCH
  const mismatch = validateCityNeighborhoodOwnership('karaj', 5, resolveCityIdForNeighborhood);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.code, 'CITY_NEIGHBORHOOD_MISMATCH');
  assert.equal(mismatch.ownerCityId, 'tehran');

  const validOwn = validateCityNeighborhoodOwnership('tehran', 5, resolveCityIdForNeighborhood);
  assert.equal(validOwn.ok, true);
  assert.equal(validOwn.valid, true);
  assert.equal(validOwn.ownerCityId, 'tehran');

  const searchValidation = validateAndSanitizeSearchQuery({ cityId: 'unknown_city', query: 'پونک' });
  assert.equal(searchValidation.valid, false);
  assert.ok(searchValidation.errors.length > 0);
});

test('Geospatial Resolver: Polygon, MultiPolygon, holes, exact edges/vertices, overlap, outside, invalid input & hysteresis', () => {
  assert.ok(NAVIGATION_GEOMETRY_VERSION.length > 0);

  // 1. Polygon with hole
  const polyWithHole: GeoBoundaryGeometry = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
    ],
  };
  assert.equal(isValidBoundaryGeometry(polyWithHole), true);
  assert.equal(isPointInGeometry(1, 1, polyWithHole), true, 'Point in outer ring outside hole must be inside');
  assert.equal(isPointInGeometry(5, 5, polyWithHole), false, 'Point strictly inside hole must be excluded');
  assert.equal(isPointInGeometry(0, 0, polyWithHole), true, 'Exact vertex must be inside');
  assert.equal(isPointInGeometry(5, 0, polyWithHole), true, 'Exact outer edge must be inside');
  assert.equal(isPointInGeometry(3, 5, polyWithHole), true, 'Point on hole rim remains inside');

  // 2. MultiPolygon with two disjoint islands
  const multiPoly: GeoBoundaryGeometry = {
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
      [[[5, 5], [7, 5], [7, 7], [5, 7], [5, 5]]],
    ],
  };
  assert.equal(isValidBoundaryGeometry(multiPoly), true);
  assert.equal(isPointInGeometry(1, 1, multiPoly), true);
  assert.equal(isPointInGeometry(6, 6, multiPoly), true);
  assert.equal(isPointInGeometry(3.5, 3.5, multiPoly), false);

  // 3. Invalid geometry rejection (open ring)
  const openRing: GeoBoundaryGeometry = {
    type: 'Polygon',
    coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]],
  };
  assert.equal(isValidBoundaryGeometry(openRing), false);

  // 4. Invalid coordinates rejection
  assert.equal(resolveCityFromCoordinates(Number.NaN, 51.3).status, 'invalid_coordinates');
  assert.equal(resolveCityFromCoordinates(35.7, Number.POSITIVE_INFINITY).status, 'invalid_coordinates');
  assert.equal(resolveCityFromCoordinates(95, 51.3).status, 'invalid_coordinates');
  assert.equal(resolveCityFromCoordinates(35.7, 190).status, 'invalid_coordinates');

  // 5. Overlap ambiguity detection (zero silent preference for Tehran)
  const geomA: GeoBoundaryGeometry = { type: 'Polygon', coordinates: [[[51.0, 35.0], [51.5, 35.0], [51.5, 35.5], [51.0, 35.5], [51.0, 35.0]]] };
  const geomB: GeoBoundaryGeometry = { type: 'Polygon', coordinates: [[[51.2, 35.0], [51.7, 35.0], [51.7, 35.5], [51.2, 35.5], [51.2, 35.0]]] };
  const overlappingGeoms: CityNavigationGeometry[] = [
    { cityId: 'tehran', version: 'test', geometry: geomA, bbox: computeGeometryBbox(geomA)! },
    { cityId: 'karaj', version: 'test', geometry: geomB, bbox: computeGeometryBbox(geomB)! },
  ];
  const overlapRes = resolveCityFromCoordinates(35.25, 51.35, { geometries: overlappingGeoms });
  assert.equal(overlapRes.status, 'ambiguous');
  assert.equal(overlapRes.cityId, null);
  if (overlapRes.status === 'ambiguous') {
    assert.deepEqual(overlapRes.candidateCityIds, ['tehran', 'karaj']);
  }

  // 6. Outside all supported cities (e.g. Tabriz) -> never defaults to Tehran
  const outsideRes = resolveCityFromCoordinates(38.0962, 46.2738);
  assert.equal(outsideRes.status, 'outside_city_boundaries');
  assert.equal(outsideRes.cityId, null);

  // 7. Hysteresis stability on touching border (no ping-pong)
  const leftGeom: GeoBoundaryGeometry = { type: 'Polygon', coordinates: [[[50.0, 35.0], [51.0, 35.0], [51.0, 36.0], [50.0, 36.0], [50.0, 35.0]]] };
  const rightGeom: GeoBoundaryGeometry = { type: 'Polygon', coordinates: [[[51.001, 35.0], [52.0, 35.0], [52.0, 36.0], [51.001, 36.0], [51.001, 35.0]]] };
  const borderGeoms: CityNavigationGeometry[] = [
    { cityId: 'karaj', version: 'test', geometry: leftGeom, bbox: computeGeometryBbox(leftGeom)! },
    { cityId: 'tehran', version: 'test', geometry: rightGeom, bbox: computeGeometryBbox(rightGeom)! },
  ];
  // 0.003 deg into Tehran from Karaj -> stays Karaj due to 0.008 deg hysteresis band
  const nearBorder = resolveCityFromCoordinates(35.5, 51.003, {
    currentCityId: 'karaj',
    hysteresisMarginDeg: 0.008,
    geometries: borderGeoms,
  });
  assert.equal(nearBorder.status, 'resolved');
  if (nearBorder.status === 'resolved') {
    assert.equal(nearBorder.cityId, 'karaj');
    assert.equal(nearBorder.matchedVia, 'hysteresis_hold');
  }
  // 0.02 deg deep into Tehran -> switches cleanly to Tehran
  const deepCross = resolveCityFromCoordinates(35.5, 51.02, {
    currentCityId: 'karaj',
    hysteresisMarginDeg: 0.008,
    geometries: borderGeoms,
  });
  assert.equal(deepCross.status, 'resolved');
  if (deepCross.status === 'resolved') {
    assert.equal(deepCross.cityId, 'tehran');
    assert.equal(deepCross.switchedFromCurrent, true);
  }

  // 8. All 5 official city centers resolve cleanly to their exact city with zero overlap
  assert.equal(CITY_NAVIGATION_GEOMETRIES.length, 5);
  for (const cityId of SUPPORTED_CITY_IDS) {
    const cfg = MULTI_CITY_CONFIGS[cityId];
    const [centerLat, centerLng] = cfg.center;
    const centerRes = resolveCityFromCoordinates(centerLat, centerLng);
    assert.equal(centerRes.status, 'resolved', `City center for ${cityId} must resolve cleanly`);
    if (centerRes.status === 'resolved') {
      assert.equal(centerRes.cityId, cityId);
    }
  }
});

test('City Service Coverage Matrix separates geographic recognition from Tehran-only capabilities', () => {
  const tehranCov = getCityServiceCoverage('tehran');
  assert.equal(tehranCov.geographicallyRecognized, true);
  assert.equal(tehranCov.capabilities.trafficZones, 'AVAILABLE');

  for (const cityId of ['karaj', 'mashhad', 'isfahan', 'shiraz'] as const) {
    const cov = getCityServiceCoverage(cityId);
    assert.equal(cov.geographicallyRecognized, true);
    assert.equal(cov.capabilities.trafficZones, 'NOT_SUPPORTED');
    assert.equal(cov.capabilities.neighborhoodIndex, 'AVAILABLE');
  }
});

test('SSR SEO Metadata & Service Worker: zero silent Tehran fallback and city-isolated cache', () => {
  const sampleHtml = '<html><head><title>Placeholder</title><meta name="description" content="d"><meta property="og:title" content="o"><meta property="og:description" content="od"><meta property="og:url" content="u"><meta name="twitter:title" content="t"><meta name="twitter:description" content="td"><link rel="canonical" href="c"></head><body></body></html>';

  const karajReq = {
    query: { city: 'karaj' },
    protocol: 'https',
    get: () => 'radartehran.ir',
  } as unknown as Request;
  const karajHtml = injectDynamicSeoMeta(sampleHtml, karajReq);
  assert.ok(karajHtml.includes('رادارتهران | کرج'), 'Karaj SSR title must show permanent brand رادارتهران | کرج');
  assert.ok(!karajHtml.includes('رادار کرج'), 'Karaj SSR title must NEVER mutate brand to رادار کرج');

  const invalidReq = {
    query: { city: 'unknown_xyz' },
    protocol: 'https',
    get: () => 'radartehran.ir',
  } as unknown as Request;
  const invalidHtml = injectDynamicSeoMeta(sampleHtml, invalidReq);
  assert.ok(invalidHtml.includes('شهر پشتیبانی‌نشده | رادارتهران'), 'Invalid ?city= must render unsupported-city SEO title');

  const swContent = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
  assert.ok(!swContent.includes("caches.match('/api/market-pulse?city=tehran')"), 'SW must never fall back to Tehran cache');
  assert.ok(swContent.includes('offline_unavailable'), 'SW must return explicit offline_unavailable state');
  assert.ok(swContent.includes('airQuality: null'), 'SW offline fallback must not forge Tehran AQI');
});

test('HTTP Integration: strict city rejection, Karaj scoping, and cross-city ownership enforcement', async () => {
  const app = express();
  app.use(express.json());
  const deps = {
    checkRateLimit: () => true,
    getClientIp: () => '127.0.0.1',
  };

  registerGlobalSearchGovernanceAndAnalyticsRoutes(app, deps);
  registerUtilityRoutes(app, deps);
  registerAiAndCommerceRoutes(app, deps);
  registerSocioeconomicRoutes(app, deps);
  registerCrowdClaimsRoutes(app, deps);
  registerDataGovernanceRoutes(app, { getIp: () => '127.0.0.1', checkRateLimit: () => true });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Explicit invalid city -> 400 across all city-scoped APIs
    const invalidGetEndpoints = [
      '/api/v1/search?city=invalid_xyz&q=test',
      '/api/v1/search/suggest?city=invalid_xyz&q=پ',
      '/api/v1/search/recommendations?city=invalid_xyz',
      '/api/telegram-digest?city=invalid_xyz',
      '/api/v1/commerce/neighborhood-index?city=invalid_xyz',
      '/api/v1/reference/hood/5/rollup?cityId=invalid_xyz',
      '/api/v1/claims/hood/5?cityId=invalid_xyz',
    ];
    for (const endpoint of invalidGetEndpoints) {
      const resp = await fetch(`${baseUrl}${endpoint}`);
      assert.equal(resp.status, 400, `Expected HTTP 400 for ${endpoint}, got ${resp.status}`);
      const payload = (await resp.json()) as Record<string, unknown>;
      assert.ok(
        payload.code === 'INVALID_CITY_ID' ||
          payload.errorCode === 'INVALID_CITY_ID' ||
          payload.error === 'INVALID_SEARCH_PARAMS',
        `Expected INVALID_CITY_ID error payload for ${endpoint}, got ${JSON.stringify(payload)}`,
      );
    }

    // 2. Karaj-scoped search & recommendations must NOT leak Tehran results
    const karajSearchResp = await fetch(`${baseUrl}/api/v1/search?city=karaj`);
    assert.equal(karajSearchResp.status, 200);
    const karajSearchJson = (await karajSearchResp.json()) as {
      cityId?: string;
      appliedFilters?: { cityId?: string };
      results?: Array<{ document?: { cityId?: string; scope?: string } }>;
    };
    assert.equal(karajSearchJson.cityId, 'karaj');
    assert.equal(karajSearchJson.appliedFilters?.cityId, 'karaj');
    assert.ok((karajSearchJson.results || []).length > 0, 'Karaj search must return Karaj documents');
    for (const item of karajSearchJson.results || []) {
      const doc = item.document;
      if (doc?.cityId) {
        assert.equal(doc.cityId, 'karaj', `Karaj search leaked non-Karaj doc: ${doc.cityId}`);
      }
    }

    const karajRecsResp = await fetch(`${baseUrl}/api/v1/search/recommendations?city=karaj`);
    assert.equal(karajRecsResp.status, 200);
    const karajRecsJson = (await karajRecsResp.json()) as {
      cityId?: string;
      recommendations?: Array<{ titleFa?: string; urlPath?: string }>;
    };
    assert.equal(karajRecsJson.cityId, 'karaj');
    assert.ok((karajRecsJson.recommendations || []).length > 0, 'Karaj recommendations must be non-empty');
    for (const rec of karajRecsJson.recommendations || []) {
      assert.ok(!String(rec.titleFa || '').includes('سعادت‌آباد'), 'Karaj recommendation leaked Tehran Saadat-Abad');
      if (rec.urlPath && rec.urlPath.includes('city=')) {
        assert.ok(rec.urlPath.includes('city=karaj'), `Karaj recommendation URL leaked wrong city: ${rec.urlPath}`);
      }
    }

    // 3. Cross-city ownership mismatch (city=karaj + Tehran hoodId=5) -> 400 CITY_NEIGHBORHOOD_MISMATCH
    const mismatchEndpoints = [
      '/api/v1/commerce/neighborhood-dossier/5?city=karaj',
      '/api/v1/reference/hood/5/rollup?cityId=karaj',
      '/api/v1/claims/hood/5?cityId=karaj',
    ];
    for (const endpoint of mismatchEndpoints) {
      const resp = await fetch(`${baseUrl}${endpoint}`);
      assert.equal(resp.status, 400, `Expected HTTP 400 mismatch for ${endpoint}, got ${resp.status}`);
      const payload = (await resp.json()) as Record<string, unknown>;
      assert.equal(payload.code, 'CITY_NEIGHBORHOOD_MISMATCH', `Expected CITY_NEIGHBORHOOD_MISMATCH for ${endpoint}`);
    }

    // 3b. POST /api/listing-verdict/comparables rejects invalid city & cross-city mismatch
    const invalidComp = await fetch(`${baseUrl}/api/listing-verdict/comparables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'invalid_xyz', hoodName: 'پونک', hoodId: 5 }),
    });
    assert.equal(invalidComp.status, 400);
    const invalidCompJson = (await invalidComp.json()) as Record<string, unknown>;
    assert.equal(invalidCompJson.code, 'INVALID_CITY_ID');

    const mismatchComp = await fetch(`${baseUrl}/api/listing-verdict/comparables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: 'karaj', hoodName: 'پونک', hoodId: 5 }),
    });
    assert.equal(mismatchComp.status, 400);
    const mismatchCompJson = (await mismatchComp.json()) as Record<string, unknown>;
    assert.equal(mismatchCompJson.code, 'CITY_NEIGHBORHOOD_MISMATCH');

    // 4. POST /api/v1/data-governance/corrections rejects invalid cityId and cross-city numeric entityId
    const invalidDgov = await fetch(`${baseUrl}/api/v1/data-governance/corrections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityId: '5',
        cityId: 'invalid_xyz',
        proposedValue: '120',
        reasonFa: 'تست اعتبارسنجی شهر نامعتبر در حاکمیت داده',
      }),
    });
    assert.equal(invalidDgov.status, 400);

    const mismatchDgov = await fetch(`${baseUrl}/api/v1/data-governance/corrections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityId: '5',
        cityId: 'karaj',
        proposedValue: '120',
        reasonFa: 'تست تطابق محله و شهر در حاکمیت داده',
      }),
    });
    assert.equal(mismatchDgov.status, 400);
    const mismatchDgovJson = (await mismatchDgov.json()) as Record<string, unknown>;
    assert.equal(mismatchDgovJson.code, 'CITY_NEIGHBORHOOD_MISMATCH');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
