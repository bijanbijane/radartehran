/**
 * @file tests/assess-007-008-performance-lod-and-pwa.test.ts
 * @description Empirical validation for Campaign PROD-03 (Performance, Rendering & Offline Resilience):
 *   - ASSESS-007: Leaflet Marker LOD, Screen-Space Collision Declustering, Viewport AABB Culling,
 *     and Bounded GeoJSON LRU Cache eviction.
 *   - ASSESS-008: PWA WebAppManifest compliance (`public/manifest.json`) and Service Worker
 *     caching strategy classification (`src/utils/pwaOfflineSupport.ts`).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  filterNeighborhoodsInViewportWithBuffer,
  buildMacroZoomClusters,
  computeDeclutteredMarkerTiers,
  buildNeighborhoodLodDivIconConfig,
} from '../src/components/mapZoomLodAndDeclutter';
import {
  resolveGeoLazyLoadingPolicy,
  simplifyPolygonRingForZoomLod,
  BoundedGeoJsonLruCache,
  planViewportBoundaryFetchBatch,
} from '../src/utils/geojsonViewportLazyEngine';
import {
  validateManifestOfflineConfig,
  classifyServiceWorkerRequestStrategy,
} from '../src/utils/pwaOfflineSupport';
import { getAllMultiCityNeighborhoods } from '../src/data/multiCityData';
import { EvaluatedNeighborhood } from '../src/data/neighborhoods';

console.log('--- Starting ASSESS-007 & ASSESS-008: LOD Culling & PWA Offline Resilience Audit ---');

const allHoods: EvaluatedNeighborhood[] = getAllMultiCityNeighborhoods().map((h) => ({
  ...h,
  baseBuyPerSqm: h.buyPerSqm,
  overallScore: 8.4,
  status: 'green',
  distKm: null,
  diffPercent: 0,
  trafficInfo: h.trafficInfo || {
    liveStatus: 'تردد روان',
    liveSeverity: 'smooth',
    peakHours: '۱۸ تا ۲۰',
    seasonalAnalysis: 'متعادل',
    bottlenecks: 'ندارد',
    trafficScore: 8.0,
  },
  marketReport: {
    status: 'balanced',
    badgeText: 'متعادل',
    hoodGrowth6mPercent: 12,
    tehranGrowth6mPercent: 10,
    prRatio: 6.5,
    summary: '',
    trendData: [],
  },
}));

// ============================================================================
// 1. ASSESS-007: Viewport AABB Culling & Macro-Zoom Spatial Clustering
// ============================================================================
{
  // Mock Leaflet map centered strictly on central/northern Tehran
  const mockTehranMap = {
    getBounds: () => ({
      pad: () => ({
        contains: ([lat, lng]: [number, number]) =>
          lat >= 35.65 && lat <= 35.85 && lng >= 51.25 && lng <= 51.55,
      }),
      getCenter: () => ({ lat: 35.75, lng: 51.40 }),
      getNorthEast: () => ({ lat: 35.85, lng: 51.55 }),
    }),
    getCenter: () => ({ lat: 35.75, lng: 51.40 }),
  };

  const culled = filterNeighborhoodsInViewportWithBuffer(
    mockTehranMap,
    allHoods,
    null,
    'all'
  );
  assert.ok(
    culled.length < allHoods.length,
    `Viewport culling must exclude distant cities (Mashhad/Shiraz/Isfahan); got ${culled.length}/${allHoods.length}`
  );

  // Verify selected neighborhood is ALWAYS retained even if off-screen (e.g., Shiraz hood 401)
  const culledWithSelectedOffscreen = filterNeighborhoodsInViewportWithBuffer(
    mockTehranMap,
    allHoods,
    401,
    'all'
  );
  assert.ok(
    culledWithSelectedOffscreen.some((h) => h.id === 401),
    'Selected neighborhood (401 Shiraz) must never be culled even when map is over Tehran'
  );

  // Macro-Zoom Clustering at Zoom 7
  const clustersZ7 = buildMacroZoomClusters(allHoods, 5, 7, () => ({
    stroke: '#10b981',
    fill: '#10b981',
    pillBg: '#059669',
  }));
  assert.ok(
    clustersZ7.length >= 4 && clustersZ7.length < allHoods.length / 3,
    `Macro-zoom clustering at zoom 7 must compress ${allHoods.length} neighborhoods into regional clusters (got ${clustersZ7.length})`
  );
  assert.ok(
    clustersZ7.some((c) => c.containsSelected),
    'Macro cluster containing selected hood (id=5) must set containsSelected = true'
  );

  console.log('✓ 1. ASSESS-007: Viewport AABB culling & Macro-Zoom spatial clustering verified');
}

// ============================================================================
// 2. ASSESS-007: Screen-Space Collision Declustering & XSS-Safe DivIcon HTML
// ============================================================================
{
  const tehranSlice = allHoods.slice(0, 15);

  // At Zoom 10 (< 12), all markers must demote to 'dot'
  const tiersZ10 = computeDeclutteredMarkerTiers(null, tehranSlice, 10, 1, () => false);
  for (const [, tier] of tiersZ10) {
    assert.equal(tier, 'dot', 'All markers at zoom < 12 must use minimal dot tier');
  }

  // Simulate tight pixel collision at Zoom 13 where all points map to the same pixel (100, 100)
  const collidingMap = {
    latLngToContainerPoint: () => ({ x: 100, y: 100 }),
  };
  const tiersCollidingZ13 = computeDeclutteredMarkerTiers(collidingMap, tehranSlice, 13, 1, () => false);
  assert.equal(tiersCollidingZ13.get(1), 'standard_pill', 'Selected hood (1) must win priority for standard_pill');
  const dotDemotedCount = Array.from(tiersCollidingZ13.values()).filter((t) => t === 'dot').length;
  assert.equal(dotDemotedCount, tehranSlice.length - 1, 'Colliding lower-priority markers at same pixel must demote to dot');

  const markerMap = {
    latLngToContainerPoint: ([lat, lng]: [number, number]) => ({ x: lng, y: lat }),
  };
  const markerAt = (hood: EvaluatedNeighborhood, id: number, x: number): EvaluatedNeighborhood => ({
    ...hood,
    id,
    lat: 0,
    lng: x,
  });
  const selectedMarker = markerAt(tehranSlice[0], 1, 0);
  const candidateMarker = markerAt(tehranSlice[1], 2, 124);
  const compactCollisionMarker = markerAt(tehranSlice[2], 3, 209);
  const tiersZ12 = computeDeclutteredMarkerTiers(
    markerMap,
    [selectedMarker, markerAt(tehranSlice[1], 2, 200)],
    12,
    1,
    () => false
  );
  assert.equal(tiersZ12.get(1), 'standard_pill', 'Selected neighborhood keeps its readable tier at zoom 12');
  assert.equal(tiersZ12.get(2), 'compact_chip', 'A fitting compact marker remains visible at zoom 12');

  const tiersZ14 = computeDeclutteredMarkerTiers(
    markerMap,
    [selectedMarker, candidateMarker, compactCollisionMarker],
    14,
    1,
    () => false
  );
  assert.equal(tiersZ14.get(1), 'detailed_pill', 'Selected neighborhood keeps the detailed tier at zoom 14');
  assert.equal(tiersZ14.get(2), 'compact_chip', 'A compact chip is used only when its actual footprint fits');
  assert.equal(tiersZ14.get(3), 'dot', 'A marker colliding with a placed compact chip falls back to a dot');

  const sponsorMarker = markerAt({ ...tehranSlice[2], sponsor: { name: 'Agency', phone: '1', specialty: 'Homes', experienceYears: 1 } }, 3, 300);
  const ordinaryMarker = markerAt(tehranSlice[1], 2, 300);
  const sponsorPriorityTiers = computeDeclutteredMarkerTiers(
    markerMap,
    [selectedMarker, ordinaryMarker, sponsorMarker],
    14,
    1,
    (hood) => hood.id === 3
  );
  assert.equal(sponsorPriorityTiers.get(3), 'detailed_pill', 'Sponsored neighborhoods retain priority among ordinary markers');
  assert.equal(sponsorPriorityTiers.get(2), 'dot', 'Lower-priority colliding markers demote to a dot');

  const denseZoomTiers = computeDeclutteredMarkerTiers(
    { latLngToContainerPoint: () => ({ x: 100, y: 100 }) },
    tehranSlice.slice(0, 5),
    14,
    1,
    () => false
  );
  assert.equal(denseZoomTiers.get(1), 'detailed_pill');
  assert.ok(Array.from(denseZoomTiers.values()).slice(1).every((tier) => tier === 'dot'));

  // Verify XSS escaping in buildNeighborhoodLodDivIconConfig
  const maliciousHood: EvaluatedNeighborhood = {
    ...tehranSlice[0],
    name: 'پونک"><script>alert(1)</script>',
  };
  const iconCfg = buildNeighborhoodLodDivIconConfig({
    hood: maliciousHood,
    tier: 'detailed_pill',
    zoom: 14,
    isSelected: true,
    hasSponsor: true,
    isDarkMap: true,
    pillBg: '#059669',
    stroke: '#10b981',
    shortPriceLabel: '۱۳۵م',
    fullPriceLabel: 'متری ۱۳۵م',
  });
  assert.ok(!iconCfg.html.includes('<script>'), 'DivIcon HTML must escape raw <script> tags');
  assert.ok(iconCfg.html.includes('&lt;script&gt;'), 'DivIcon HTML must contain HTML-entity escaped script tag');

  console.log('✓ 2. ASSESS-007: Screen-space collision declustering & XSS-safe DivIcon verified');
}

// ============================================================================
// 3. ASSESS-007: Polygon Vertex Simplification & Bounded LRU Cache Eviction
// ============================================================================
{
  const densePolygon: [number, number][] = Array.from({ length: 120 }, (_, i) => [
    35.7 + Math.sin(i * 0.05) * 0.02,
    51.4 + Math.cos(i * 0.05) * 0.02,
  ]);

  const mobilePolicyZ11 = resolveGeoLazyLoadingPolicy(11, true);
  assert.equal(mobilePolicyZ11.maxVerticesPerPolygon, 6);

  const simplifiedMobile = simplifyPolygonRingForZoomLod(densePolygon, 11, false, true);
  assert.equal(simplifiedMobile.length, 6, '120-vertex polygon must decimate to 6 vertices at zoom 11 on mobile');

  const unsimplifiedSelected = simplifyPolygonRingForZoomLod(densePolygon, 11, true, false);
  assert.equal(unsimplifiedSelected.length, 120, 'Selected neighborhood on desktop must preserve all 120 vertices');

  const lru = new BoundedGeoJsonLruCache<number, string>(16);
  for (let i = 1; i <= 25; i++) {
    lru.set(i, `poly-${i}`);
  }
  const stats = lru.getStats();
  assert.equal(stats.size, 16, 'Bounded LRU cache must never exceed maxEntries (16)');
  assert.equal(stats.evictionsCount, 9, '25 inserts into capacity-16 cache must record 9 evictions');
  assert.equal(lru.get(1), undefined, 'Oldest entry (1) must be evicted');
  assert.equal(lru.get(25), 'poly-25', 'Newest entry (25) must remain in cache');

  const batchPlan = planViewportBoundaryFetchBatch({
    allNeighborhoods: allHoods,
    viewportBounds: { north: 35.85, south: 35.65, east: 51.55, west: 51.25 },
    loadedHoodIds: new Set([1, 2, 3]),
    lowBandwidthOrMobileMode: true,
  });
  assert.ok(batchPlan.batch.length <= 12, 'Mobile boundary fetch batch must cap at 12 items');
  assert.equal(batchPlan.alreadyLoadedCount, 3);
  assert.ok(batchPlan.skippedOffscreenCount > 0, 'Offscreen cities must be skipped in progressive fetch');

  console.log('✓ 3. ASSESS-007: Polygon LOD decimation, Bounded LRU cache & viewport fetch planner verified');
}

// ============================================================================
// 4. ASSESS-008: PWA Manifest Validation & Service Worker Caching Strategies
// ============================================================================
{
  const manifestPath = path.resolve(process.cwd(), 'public/manifest.json');
  const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const audit = validateManifestOfflineConfig(rawManifest);

  assert.equal(audit.valid, true, `public/manifest.json must pass PWA offline audit, issues: ${audit.issues.join(', ')}`);
  assert.equal(audit.has192Icon, true);
  assert.equal(audit.has512AnyIcon, true);
  assert.equal(audit.hasMaskableIcon, true);
  assert.equal(audit.hasOfflineShortcuts, true);

  // Verify Service Worker Request Classification Invariants
  assert.equal(
    classifyServiceWorkerRequestStrategy({ url: 'https://tehranradar.ir/api/admin/config', method: 'GET' }),
    'BypassPrivateOrMutation',
    'Admin routes must never be cached by Service Worker'
  );
  assert.equal(
    classifyServiceWorkerRequestStrategy({ url: 'https://tehranradar.ir/api/market-pulse', hasAuthHeader: true }),
    'BypassPrivateOrMutation',
    'Authenticated requests with Bearer token must bypass SW cache'
  );
  assert.equal(
    classifyServiceWorkerRequestStrategy({ url: 'https://tehranradar.ir/api/object-storage/media/123', method: 'GET' }),
    'BypassPrivateOrMutation',
    'Object storage media routes must bypass SW cache'
  );
  assert.equal(
    classifyServiceWorkerRequestStrategy({ url: 'https://tehranradar.ir/', mode: 'navigate' }),
    'NetworkFirstShell',
    'HTML navigation requests must use NetworkFirstShell'
  );
  assert.equal(
    classifyServiceWorkerRequestStrategy({ url: 'https://tehranradar.ir/api/market-pulse?city=tehran' }),
    'NetworkFirstMarketData',
    'Market pulse GET without refresh=1 must use NetworkFirstMarketData'
  );
  assert.equal(
    classifyServiceWorkerRequestStrategy({ url: 'https://tehranradar.ir/api/osm-tile/12/2632/1611' }),
    'StaleWhileRevalidateMapTile',
    'OSM tile proxy requests must use StaleWhileRevalidateMapTile'
  );
  assert.equal(
    classifyServiceWorkerRequestStrategy({ url: 'https://tehranradar.ir/assets/index-D8a91.js' }),
    'StaleWhileRevalidateUiAsset',
    'Hashed Vite bundle assets must use StaleWhileRevalidateUiAsset'
  );

  console.log('✓ 4. ASSESS-008: PWA manifest compliance & Service Worker security/caching rules verified');
}

console.log('--- ALL ASSESS-007 & ASSESS-008 PERFORMANCE & PWA TESTS PASSED ---');
