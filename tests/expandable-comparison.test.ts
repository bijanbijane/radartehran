import assert from 'node:assert/strict';
import type { EvaluatedNeighborhood } from '../src/data/neighborhoods';

console.log('--- Running Expandable Comparison Unit Tests ---');

const mockHoodA = {
  id: 1,
  name: 'سعادت‌آباد',
  zone: 'شمال غرب',
  lat: 35.78,
  lng: 51.37,
  radius: 1200,
  buyPerSqm: 180,
  rahn80m: 2500,
  air: 8.5,
  powerWater: 9.0,
  internet: 9.5,
  metro: 7.0,
  security: 9.2,
  flatTerrain: 7.0,
  overallScore: 8.8,
  status: 'green',
  diffPercent: 0,
  distKm: 5,
  bargains: [],
  pros: 'آب و هوای عالی',
  cons: 'شیب معابر',
} as unknown as EvaluatedNeighborhood;

const mockHoodB = {
  id: 2,
  name: 'پونک',
  zone: 'غرب',
  lat: 35.76,
  lng: 51.33,
  radius: 1100,
  buyPerSqm: 120,
  rahn80m: 1600,
  air: 7.8,
  powerWater: 8.5,
  internet: 8.8,
  metro: 8.5,
  security: 8.6,
  flatTerrain: 8.0,
  overallScore: 8.3,
  status: 'green',
  diffPercent: 0,
  distKm: 8,
  bargains: [],
  pros: 'دسترسی عالی به اتوبان‌ها',
  cons: 'شلوغی عصرها',
} as unknown as EvaluatedNeighborhood;

// 1. Metric evaluation: Cost (lower is more affordable/better)
assert.ok(mockHoodB.buyPerSqm < mockHoodA.buyPerSqm, 'Poonak is more affordable per sqm than Saadat Abad');
assert.ok(mockHoodB.rahn80m < mockHoodA.rahn80m, 'Poonak has lower total rahn than Saadat Abad');

// 2. Metric evaluation: Air Quality (higher is better)
assert.ok(mockHoodA.air > mockHoodB.air, 'Saadat Abad has higher air quality score than Poonak');

// 3. Metric evaluation: Metro accessibility (higher is better)
assert.ok(mockHoodB.metro > mockHoodA.metro, 'Poonak has better metro accessibility than Saadat Abad');

// 4. Metric evaluation: Overall liveability score (higher is better)
assert.ok(mockHoodA.overallScore > mockHoodB.overallScore, 'Saadat Abad has higher overall score');

// 5. Scaled rahn calculation for custom target sqm (e.g., 100 sqm)
const targetSqm = 100;
const rentAgeMultiplier = 1.0;
const scaledRahnA = Math.round(mockHoodA.rahn80m * (targetSqm / 80) * rentAgeMultiplier);
const scaledRahnB = Math.round(mockHoodB.rahn80m * (targetSqm / 80) * rentAgeMultiplier);
assert.equal(scaledRahnA, Math.round(2500 * 1.25));
assert.equal(scaledRahnB, Math.round(1600 * 1.25));

// 6. Advanced Spatial Map Layers & 3-Tier Zoom-Adaptive LOD Tests
import {
  buildZoomAdaptivePillIconConfig,
  isCoordInsideStoredViewport,
  updateMapAdvancedOverlayState,
  getMapAdvancedOverlayState,
  renderAdvancedSpatialOverlaysOnLeaflet,
  CITY_METRO_LINES,
  computeSpatialProximityReport,
} from '../src/components/mapAdvancedLayers';

// 6a. Tier 1 (Zoom <= 11, non-selected) -> compact 54x22 pill
const tier1 = buildZoomAdaptivePillIconConfig({
  hood: mockHoodA,
  zoom: 10,
  isSelected: false,
  hasSponsor: false,
  isDarkMap: false,
  pillBg: '#059669',
  priceLabel: 'متری ۱۸۰م',
});
assert.deepEqual(tier1.iconSize, [54, 22], 'Tier 1 low-zoom non-selected pill should be compact 54x22');

// 6b. Tier 1 when selected -> upgrades to Tier 2 standard 110x26 pill
const tier1Selected = buildZoomAdaptivePillIconConfig({
  hood: mockHoodA,
  zoom: 10,
  isSelected: true,
  hasSponsor: false,
  isDarkMap: false,
  pillBg: '#059669',
  priceLabel: 'متری ۱۸۰م',
});
assert.deepEqual(tier1Selected.iconSize, [110, 26], 'Selected pill at low zoom should still show full name');
assert.ok(tier1Selected.html.includes('سعادت‌آباد'));

// 6c. Tier 3 (Zoom >= 14) -> enriched 165x28 street-level pill with growth & metro badge
const tier3 = buildZoomAdaptivePillIconConfig({
  hood: mockHoodA,
  zoom: 15,
  isSelected: false,
  hasSponsor: true,
  isDarkMap: true,
  pillBg: '#059669',
  priceLabel: 'متری ۱۸۰م',
});
assert.deepEqual(tier3.iconSize, [165, 28], 'Tier 3 high-zoom pill should be 165x28 enriched');
assert.ok(tier3.html.includes('مترو'), 'Tier 3 pill must include metro score badge');

// 6d. Viewport bounding-box filter check
const sampleBounds = { north: 35.82, south: 35.74, east: 51.42, west: 51.30, zoom: 13 };
assert.equal(isCoordInsideStoredViewport(mockHoodA.lat, mockHoodA.lng, sampleBounds), true);
assert.equal(isCoordInsideStoredViewport(35.60, 51.37, sampleBounds), false);
assert.equal(isCoordInsideStoredViewport(35.60, 51.37, null), true);

// 6e. Multi-city metro coverage & spatial proximity report check (all 5 metropolises)
(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const).forEach((cityId) => {
  assert.ok(CITY_METRO_LINES[cityId].length >= 2, `City ${cityId} must have at least 2 metro corridors`);
  const sampleCoord = CITY_METRO_LINES[cityId][0].coords[0];
  const prox = computeSpatialProximityReport({ lat: sampleCoord[0], lng: sampleCoord[1] }, cityId);
  assert.equal(prox.nearestMetroDistKm, 0, `Station coordinate in ${cityId} should have 0km distance`);
  assert.ok(prox.walkingMinutesEstimate >= 3);
});

// Check Tehran core traffic zone point-in-polygon vs outside
const fatemiProx = computeSpatialProximityReport({ lat: 35.715, lng: 51.410 }, 'tehran');
assert.equal(fatemiProx.trafficZoneStatus, 'inside_core', 'Fatemi/Central Tehran should be inside core traffic zone');
const saadatProx = computeSpatialProximityReport({ lat: 35.78, lng: 51.37 }, 'tehran');
assert.equal(saadatProx.trafficZoneStatus, 'outside', 'Saadat Abad should be outside traffic zone');

// 6f. Mock Leaflet rendering verification for Metro, Traffic, Isochrones, and Comparison Arc
const addedLayers: any[] = [];
const mockL = {
  layerGroup: () => ({
    addLayer: (l: any) => addedLayers.push(l),
    addTo: () => {},
  }),
  polygon: (coords: any, opts: any) => ({ type: 'polygon', coords, opts, bindTooltip() { return this; } }),
  polyline: (coords: any, opts: any) => ({ type: 'polyline', coords, opts, bindTooltip() { return this; } }),
  circleMarker: (pt: any, opts: any) => ({ type: 'circleMarker', pt, opts, bindTooltip() { return this; } }),
  circle: (pt: any, opts: any) => ({ type: 'circle', pt, opts, bindTooltip() { return this; } }),
  divIcon: (opts: any) => ({ type: 'divIcon', ...opts }),
  marker: (pt: any, opts: any) => ({ type: 'marker', pt, opts }),
};

updateMapAdvancedOverlayState({
  showMetroLines: true,
  showTrafficZones: true,
  showCommuteIsochrones: true,
  comparisonArc: { active: true, isPinned: true, hoodA: mockHoodA, hoodB: mockHoodB },
});

renderAdvancedSpatialOverlaysOnLeaflet({
  L: mockL,
  map: {},
  activeCity: 'tehran',
  mode: 'buy',
  targetSqm: 85,
  rentAgeMultiplier: 1,
  selectedWorkHub: { id: 'vanak', name: 'میدان ونک', lat: 35.7575, lng: 51.4099 },
  overlayState: getMapAdvancedOverlayState(),
});

assert.ok(addedLayers.some((l) => l.type === 'polygon'), 'Should render traffic/pollution zone polygons');
assert.ok(addedLayers.some((l) => l.type === 'polyline' && l.coords.length === 17), 'Should render 17-point Bezier comparison arc');
assert.equal(addedLayers.filter((l) => l.type === 'circle').length, 3, 'Should render 3 commute isochrone rings');
assert.ok(addedLayers.some((l) => l.type === 'marker' && l.opts.icon.html.includes('مقایسه:')), 'Should render comparison delta badge');

console.log('[PASS] All Expandable Comparison & Spatial Map Layer unit tests passed.');

