/**
 * @file src/features/home/tests/homeAndMapArchitecture.test.ts
 * @description Unit tests for Stage 14 (RT-UI-HOME-001), Stage 15 (RT-UI-MAP-001), Stage 16 (RT-UI-LAYERS-001) & Stage 17 (RT-UI-NEIGHBORHOOD-001).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import {
  HOME_ACCEPTANCE_CHECKLIST_18, HOME_IMPLEMENTATION_PACKAGES, HOME_QUICK_ACCESS_ITEMS, STAGE_15_MAP_ARCHITECTURE_SPEC,
  buildHomeMarketSnapshotMetrics, buildPrivacySafeHomeTelemetry, executeCategorizedHomeSearch, normalizeHomePersianQuery, selectCuratedHomeNeighborhoods,
} from '../services/homeDataAdapter';
import {
  CANONICAL_MAP_LAYER_REGISTRY, MAP_IMPLEMENTATION_PACKAGES_19, MAP_UI_TEST_SCENARIOS_22, STAGE_16_LAYER_ARCHITECTURE_16,
  activateMapToolbarMode, buildDynamicLayerLegend, buildPrivacySafeMapTelemetry, computeGeodesicMeasurement,
  evaluateLayerActivationAndConflicts, parseShareableMapUrl, resolveClusterDisplayForZoom, serializeShareableMapUrl, validateDrawnPolygonWGS84,
} from '../../map/services/mapExperienceEngine';
import {
  CENTRAL_LAYER_METADATA_REGISTRY, GEOSPATIAL_DATASETS, GEOSPATIAL_DATA_SOURCES, STAGE_16_ACCEPTANCE_CHECKLIST_25, STAGE_17_NEIGHBORHOOD_PROFILE_SPEC_20,
  evaluateLayerZoomVisibility, getPublicCatalogLayers, manageActiveLayerStack, validateSavedLayerPreset,
} from '../../map/services/layerManagementRegistry';
import {
  NEIGHBORHOOD_SECTION_NAV_8, STAGE_17_ACCEPTANCE_CHECKLIST_30, STAGE_18_MARKET_INTELLIGENCE_SPEC_20,
  buildNeighborhoodIntelligenceProfile, evaluateMarketSampleAdequacy, formatNullSafeMetricValue,
} from '../../neighborhoods/services/neighborhoodProfileEngine';
import { computeViewportPulseSnapshot } from '../../../components/map/MapViewportPulseDock';
import {
  appendInteractiveSpatialPoint,
  clearInteractiveSpatialPoints,
  estimateTravelTimesFromMeters,
  findNeighborhoodsInsidePolygon,
  getInteractiveSpatialMeasureState,
  isPointInsidePolygonWGS84,
  resetInteractiveSpatialMeasure,
  setInteractiveSpatialMode,
  undoInteractiveSpatialPoint,
} from '../../../components/map/interactiveSpatialMeasureLayer';
import { resolveMapToolVisualState } from '../../../navigation/map/mapToolRailConfig';
import { resolveSelectedNeighborhoodById } from '../../../components/selectedNeighborhoodResolver';
import { resolveUrlNeighborhoodEntry } from '../../../components/useAppUrlAndTitleSync';

const MOCK_HOODS: EvaluatedNeighborhood[] = [
  {
    id: 1, name: 'ونک', zone: 'منطقه ۳ شهرداری تهران', lat: 35.7575, lng: 51.4100,
    buyPerSqm: 210, rahn80m: 2400, air: 7, traffic: 6, metro: 8, power: 9, internet: 9, security: 9, flat: 8,
    overallScore: 8.4, status: 'green', diffPercent: 0, bargains: [{ id: 'b1', title: 'واحد ونک', street: 'ملاصدرا', sqm: 95, proposedPrice: 18500, type: 'buy' }],
  } as unknown as EvaluatedNeighborhood,
  {
    id: 2, name: 'پاسداران', zone: 'منطقه ۴ شهرداری تهران', lat: 35.7720, lng: 51.4600,
    buyPerSqm: 195, rahn80m: 2100, air: 8, traffic: 7, metro: 7, power: 9, internet: 8, security: 9, flat: 8,
    overallScore: 8.1, status: 'yellow', diffPercent: 12, bargains: [],
  } as unknown as EvaluatedNeighborhood,
];


describe('URL neighborhood selection resolution', () => {
  const urlHoods = [
    { cityId: 'tehran' as const, hood: { id: 1, name: 'ونک', lat: 35.75, lng: 51.41 } as any },
    { cityId: 'mashhad' as const, hood: { id: 101, name: 'احمدآباد', lat: 36.29, lng: 59.59 } as any },
  ];

  it('resolves a valid URL neighborhood ID in its requested city', () => {
    assert.equal(resolveUrlNeighborhoodEntry('101', 'mashhad', urlHoods)?.hood.id, 101);
  });

  it('rejects malformed, unknown, and cross-city URL neighborhood IDs', () => {
    assert.equal(resolveUrlNeighborhoodEntry('not-a-number', undefined, urlHoods), null);
    assert.equal(resolveUrlNeighborhoodEntry('999999', undefined, urlHoods), null);
    assert.equal(resolveUrlNeighborhoodEntry('101', 'tehran', urlHoods), null);
  });

  it('distinguishes an absent URL neighborhood parameter from an invalid one', () => {
    assert.equal(resolveUrlNeighborhoodEntry(null, undefined, urlHoods), undefined);
  });
});

describe('Stage 14 (RT-UI-HOME-001) Homepage Experience Architecture', () => {
  it('builds 4 Market Snapshot metrics with full provenance and handles unavailable/partial states without fake numbers', () => {
    const normalMetrics = buildHomeMarketSnapshotMetrics(MOCK_HOODS, 'tehran', 'normal');
    assert.equal(normalMetrics.length, 4);
    assert.equal(normalMetrics[0].id, 'asking_price_sqm');
    assert.ok(normalMetrics[0].value !== null && normalMetrics[0].value > 0);
    assert.ok(normalMetrics[0].sourceLabels.length > 0);
    assert.equal(normalMetrics[0].quality, 'verified');

    const unavailableMetrics = buildHomeMarketSnapshotMetrics(MOCK_HOODS, 'tehran', 'market_unavailable');
    assert.equal(unavailableMetrics[0].value, null);
    assert.equal(unavailableMetrics[0].quality, 'unavailable');
    assert.ok(unavailableMetrics[0].limitationNote?.includes('داده‌ای برای نمایش معتبر'));

    const partialMetrics = buildHomeMarketSnapshotMetrics(MOCK_HOODS, 'tehran', 'partial_data');
    const supply = partialMetrics.find((m) => m.id === 'supply_status')!;
    assert.equal(supply.value, null);
    assert.equal(supply.quality, 'incomplete');
  });

  it('normalizes Persian/Arabic characters and returns categorized Global Search results for ونک', () => {
    assert.equal(normalizeHomePersianQuery('  وَنك\u200cهایی  '), normalizeHomePersianQuery('وَنک هایی'));
    const results = executeCategorizedHomeSearch('ونك', MOCK_HOODS, 'tehran');
    assert.ok(results.length >= 3);
    const categories = new Set(results.map((r) => r.category));
    assert.ok(categories.has('neighborhoods'));
    assert.ok(categories.has('streets_zones'));
    assert.ok(categories.has('properties'));
  });

  it('curates neighborhoods across editorial, data completeness, and budget fit modes', () => {
    const editorial = selectCuratedHomeNeighborhoods(MOCK_HOODS, 'editorial_curated');
    assert.equal(editorial.length, 2);
    const budgetFirst = selectCuratedHomeNeighborhoods(MOCK_HOODS, 'budget_fit');
    assert.equal(budgetFirst[0].status, 'green');
  });

  it('scrubs raw search query text in privacy-safe homepage telemetry', () => {
    const ev = buildPrivacySafeHomeTelemetry('home_search_submit', {
      cityId: 'tehran', rawSearchQuery: 'خیابان ملاصدرا پلاک ۱۲ واحد ۴', resultCategory: 'neighborhoods',
    });
    assert.equal(ev.piiScrubbed, true);
    assert.equal(ev.hasSearchQuery, true);
    assert.equal(ev.queryLengthBucket, '11_plus');
    assert.equal('rawSearchQuery' in ev, false);
  });

  it('verifies all 6 Quick Access paths, 11 HOME packages, 18 acceptance criteria, and 15 Stage 15 specs', () => {
    assert.equal(HOME_QUICK_ACCESS_ITEMS.length, 6);
    assert.equal(HOME_IMPLEMENTATION_PACKAGES.length, 11);
    assert.equal(HOME_ACCEPTANCE_CHECKLIST_18.length, 18);
    assert.ok(HOME_ACCEPTANCE_CHECKLIST_18.every((c) => c.verified));
    assert.equal(STAGE_15_MAP_ARCHITECTURE_SPEC.length, 15);
  });
});

describe('Stage 15 (RT-UI-MAP-001) Map Experience Architecture', () => {
  it('separates Layer toggles from Applied Filters and detects surface heatmap conflicts', () => {
    const initialFilters = { market: 'sale', minSqm: 75 };
    const step1 = evaluateLayerActivationAndConflicts(['base_light', 'property_asking_price'], 'urban_air_heatmap', initialFilters);
    assert.equal(step1.hasSurfaceConflict, true);
    assert.ok(step1.conflictWarningFa?.includes('هشدار تداخل بصری'));
    assert.deepEqual(step1.preservedFilters, initialFilters);

    const step2 = evaluateLayerActivationAndConflicts(step1.nextLayerIds, 'urban_air_heatmap', initialFilters);
    assert.equal(step2.hasSurfaceConflict, false);
    assert.deepEqual(step2.preservedFilters, initialFilters);
  });

  it('enforces mutual exclusivity between Draw and Measure modes and blocks accidental feature selection', () => {
    const drawState = activateMapToolbarMode('explore', 'draw');
    assert.equal(drawState.activeMode, 'draw');
    assert.equal(drawState.blocksFeatureSelection, true);

    const measureState = activateMapToolbarMode(drawState.activeMode, 'measure');
    assert.equal(measureState.activeMode, 'measure');
    assert.equal(measureState.blocksFeatureSelection, true);

    const toggleOff = activateMapToolbarMode('measure', 'measure');
    assert.equal(toggleOff.activeMode, 'explore');
    assert.equal(toggleOff.blocksFeatureSelection, false);
  });

  it('validates WGS84 polygons and rejects self-intersecting or under-vertex geometries', () => {
    const validPoly = validateDrawnPolygonWGS84([
      { lat: 35.755, lng: 51.405 }, { lat: 35.765, lng: 51.425 }, { lat: 35.748, lng: 51.432 }, { lat: 35.742, lng: 51.410 },
    ]);
    assert.equal(validPoly.valid, true);
    assert.equal(validPoly.hasSelfIntersection, false);
    assert.ok(validPoly.areaSqKm > 0);

    const selfIntersecting = validateDrawnPolygonWGS84([
      { lat: 35.750, lng: 51.400 }, { lat: 35.770, lng: 51.430 }, { lat: 35.770, lng: 51.400 }, { lat: 35.750, lng: 51.430 },
    ]);
    assert.equal(selfIntersecting.valid, false);
    assert.equal(selfIntersecting.hasSelfIntersection, true);
  });

  it('computes geodesic linear distance and spherical polygon area in meters/kilometers/hectares', () => {
    const dist = computeGeodesicMeasurement('linear_distance', [{ lat: 35.7575, lng: 51.4100 }, { lat: 35.7720, lng: 51.4600 }]);
    assert.ok(dist.rawValueMetersOrSqm > 4000 && dist.rawValueMetersOrSqm < 6000);
    assert.equal(dist.unitFa, 'کیلومتر');

    const area = computeGeodesicMeasurement('area', [{ lat: 35.755, lng: 51.405 }, { lat: 35.765, lng: 51.425 }, { lat: 35.748, lng: 51.432 }]);
    assert.ok(area.rawValueMetersOrSqm > 10_000);
    assert.equal(area.unitFa, 'هکتار');
  });

  it('resolves 3-tier zoom clustering and serializes/parses shareable URL state cleanly', () => {
    assert.equal(resolveClusterDisplayForZoom(10, 120).tier, 'low_zoom_cluster');
    assert.equal(resolveClusterDisplayForZoom(12, 45).tier, 'mid_zoom_group');
    assert.equal(resolveClusterDisplayForZoom(15, 18).tier, 'high_zoom_markers');

    const url = serializeShareableMapUrl({
      cityId: 'tehran', viewport: { latitude: 35.74, longitude: 51.4, zoom: 13 },
      activeLayerIds: ['boundaries_hoods', 'property_asking_price'], appliedFilters: { market: 'sale', propertyType: 'apartment' },
    });
    assert.ok(url.includes('/explore/map?city=tehran'));
    const parsed = parseShareableMapUrl(url.split('?')[1]);
    assert.equal(parsed.cityId, 'tehran');
    assert.equal(parsed.viewport.zoom, 13);
    assert.deepEqual(parsed.activeLayerIds, ['boundaries_hoods', 'property_asking_price']);
    assert.equal(parsed.appliedFilters.market, 'sale');
  });

  it('verifies Dynamic Legend, Privacy-Safe Map Telemetry, 22 MAP-UI tests, 19 MAP packages & 16 Stage 16 rules', () => {
    const legend = buildDynamicLayerLegend('property_asking_price', MOCK_HOODS);
    assert.equal(legend.minNumericValue, 195);
    assert.equal(legend.maxNumericValue, 210);
    const tel = buildPrivacySafeMapTelemetry('map_draw_complete', { mode: 'draw', durationMs: 1200 });
    assert.equal(tel.piiAndExactTrackScrubbed, true);
    assert.equal(CANONICAL_MAP_LAYER_REGISTRY.length, 8);
    assert.equal(MAP_UI_TEST_SCENARIOS_22.length, 22);
    assert.equal(MAP_IMPLEMENTATION_PACKAGES_19.length, 19);
    assert.equal(STAGE_16_LAYER_ARCHITECTURE_16.length, 16);
  });
});

describe('Stage 16 (RT-UI-LAYERS-001) & Stage 17 (RT-UI-NEIGHBORHOOD-001) Layer Registry & Governance', () => {
  it('separates DataSource, Dataset, and Layer (1 Dataset powers multiple Layers) and hides Draft/Internal layers from public catalog', () => {
    assert.ok(GEOSPATIAL_DATA_SOURCES.length >= 3);
    assert.ok(GEOSPATIAL_DATASETS.length >= 6);
    const saleLayers = CENTRAL_LAYER_METADATA_REGISTRY.filter((l) => l.datasetId === 'ds.sale_listings');
    assert.equal(saleLayers.length, 3);
    const publicCatalog = getPublicCatalogLayers();
    assert.equal(publicCatalog.some((l) => l.publicationStatus === 'draft'), false);
    assert.equal(publicCatalog.some((l) => l.id === 'internal.draft_parcels'), false);
  });

  it('distinguishes Mute (hide without removing) vs Remove, replaces Exclusive Base Maps, and warns on Conditional Choropleth/Heatmap overlap', () => {
    const initialStack = [
      { layerId: 'base.light', visible: true, opacity: 100, zOrder: 1 },
      { layerId: 'market.price', visible: true, opacity: 100, zOrder: 3 },
    ];
    const swappedBase = manageActiveLayerStack(initialStack, { type: 'activate', layerId: 'base.satellite' });
    assert.equal(swappedBase.compatibilityStatus, 'Exclusive');
    assert.equal(swappedBase.nextStack.some((i) => i.layerId === 'base.light'), false);
    assert.equal(swappedBase.nextStack.some((i) => i.layerId === 'base.satellite'), true);

    const withSupply = manageActiveLayerStack(swappedBase.nextStack, { type: 'activate', layerId: 'market.supply' });
    assert.equal(withSupply.compatibilityStatus, 'Conditional');
    assert.ok(withSupply.warningFa?.includes('هم‌پوشانی لایه‌ها'));

    const muted = manageActiveLayerStack(withSupply.nextStack, { type: 'mute_toggle', layerId: 'market.supply' });
    assert.equal(muted.compatibilityStatus, 'Compatible');
    assert.equal(muted.nextStack.find((i) => i.layerId === 'market.supply')?.visible, false);

    const removed = manageActiveLayerStack(muted.nextStack, { type: 'remove', layerId: 'market.supply' });
    assert.equal(removed.nextStack.some((i) => i.layerId === 'market.supply'), false);
  });

  it('evaluates Zoom Scale visibility, Preset Versioning/Permissions, 25 Stage 16 Acceptance Criteria, and 20 Stage 17 Profile Sections', () => {
    const zoomLow = evaluateLayerZoomVisibility({ minZoom: 12, maxZoom: 18 }, 10);
    assert.equal(zoomLow.inScale, false);
    assert.equal(zoomLow.statusCode, 'out_of_scale');
    assert.ok(zoomLow.messageFa?.includes('برای مشاهده این لایه بزرگ‌نمایی کنید'));

    const validPreset = validateSavedLayerPreset({ id: 'p1', titleFa: 'بررسی بازار', version: 1, layerIds: ['boundary.neighborhoods', 'market.price'], requiredAccess: 'public' }, 'public');
    assert.equal(validPreset.status, 'ready');

    const outdatedPreset = validateSavedLayerPreset({ id: 'p2', titleFa: 'قدیمی', version: 1, layerIds: ['boundary.neighborhoods', 'removed.layer.v0'], requiredAccess: 'public' }, 'public');
    assert.equal(outdatedPreset.status, 'needs_layer_replacement');
    assert.deepEqual(outdatedPreset.missingLayerIds, ['removed.layer.v0']);

    assert.equal(STAGE_16_ACCEPTANCE_CHECKLIST_25.length, 25);
    assert.equal(STAGE_17_NEIGHBORHOOD_PROFILE_SPEC_20.length, 20);
  });

  it('builds Stage 17 Neighborhood Intelligence Profile with Zero !== No Data, Adjacent vs Nearby separation, and Stage 18 registry', () => {
    assert.equal(formatNullSafeMetricValue(null), '—');
    assert.equal(formatNullSafeMetricValue(0), '۰');
    assert.equal(evaluateMarketSampleAdequacy(8).adequate, false);
    assert.equal(evaluateMarketSampleAdequacy(8).quality, 'incomplete');

    const profile = buildNeighborhoodIntelligenceProfile(MOCK_HOODS[0], MOCK_HOODS, 'tehran', 198);
    assert.equal(profile.identity.canonicalPath, '/areas/tehran/neighborhoods/hood-1');
    assert.equal(profile.boundary.status, 'under-review');
    assert.equal(profile.boundary.areaKm2, null, 'a map display radius is not a reviewed neighborhood polygon');
    assert.equal(profile.identity.canonicalGeographicEntityId, null, 'legacy numeric IDs are not canonical IRNI IDs');
    assert.equal(NEIGHBORHOOD_SECTION_NAV_8.length, 8);
    const censusMetric = profile.quickMetrics.find((m) => m.id === 'official-census-household')!;
    assert.equal(censusMetric.value, null);
    assert.equal(censusMetric.formattedValue, '—');
    assert.ok(profile.landUseDenominatorLabelFa.includes('مخرج محاسبه'));
    assert.equal(STAGE_17_ACCEPTANCE_CHECKLIST_30.length, 30);
    assert.equal(STAGE_18_MARKET_INTELLIGENCE_SPEC_20.length, 20);
  });
});

describe('Map UX Enhancements: Viewport Pulse Dock, Geodesic Ruler & Polygon Containment', () => {
  const SAMPLE_CITY_HOODS: EvaluatedNeighborhood[] = [
    ...MOCK_HOODS,
    {
      id: 3, name: 'پونک', zone: 'منطقه ۵ شهرداری تهران', lat: 35.7620, lng: 51.3310,
      buyPerSqm: 140, rahn80m: 1500, air: 9, trafficInfo: { trafficScore: 7.4 }, metro: 7, power: 9, internet: 8, security: 8, flat: 8,
      overallScore: 8.6, status: 'green', diffPercent: -6, bargains: [],
    } as unknown as EvaluatedNeighborhood,
    {
      id: 4, name: 'اکباتان', zone: 'منطقه ۵ شهرداری تهران', lat: 35.7080, lng: 51.3090,
      buyPerSqm: 130, rahn80m: 1400, air: 6, trafficInfo: { trafficScore: 8.8 }, metro: 9, power: 9, internet: 9, security: 9, flat: 9,
      overallScore: 8.2, status: 'red', diffPercent: 18, bargains: [],
    } as unknown as EvaluatedNeighborhood,
  ];

  it('computes viewport median, v6.4 negotiation scenario, city diff %, and lens-aware top-4 neighborhoods', () => {
    const westBounds = { north: 35.78, south: 35.70, east: 51.36, west: 51.29, zoom: 12 };
    const buySnap = computeViewportPulseSnapshot({
      evaluatedNeighborhoods: SAMPLE_CITY_HOODS,
      viewportBounds: westBounds,
      mode: 'buy',
      targetSqm: 80,
      rentAgeMultiplier: 1,
      mapLens: 'budget',
    });
    assert.equal(buySnap.inViewportCount, 2);
    assert.equal(buySnap.affordableCount, 1);
    assert.equal(buySnap.viewportMedianBuyPerSqm, 135);
    assert.equal(buySnap.viewportNegotiatedBuyPerSqm, Math.round(135 * 0.88));
    assert.ok(buySnap.diffVsCityPct !== null && buySnap.diffVsCityPct < 0);
    assert.equal(buySnap.topNeighborhoods[0].id, 3);

    const airSnap = computeViewportPulseSnapshot({
      evaluatedNeighborhoods: SAMPLE_CITY_HOODS,
      viewportBounds: null,
      mode: 'rent',
      targetSqm: 100,
      rentAgeMultiplier: 0.9,
      mapLens: 'air',
    });
    assert.equal(airSnap.usingFullCityFallback, true);
    assert.equal(airSnap.topNeighborhoods[0].id, 3);
    assert.ok(airSnap.viewportMedianRahn !== null && airSnap.viewportMedianRahn > 0);

    const trafficSnap = computeViewportPulseSnapshot({
      evaluatedNeighborhoods: SAMPLE_CITY_HOODS,
      viewportBounds: null,
      mode: 'buy',
      targetSqm: 80,
      rentAgeMultiplier: 1,
      mapLens: 'traffic',
    });
    assert.equal(trafficSnap.topNeighborhoods[0].id, 4);
  });

  it('estimates walking and driving times safely and finds neighborhoods inside valid drawn polygons', () => {
    assert.deepEqual(estimateTravelTimesFromMeters(0), { walkMinutes: 0, driveMinutes: 0 });
    const times = estimateTravelTimesFromMeters(1500);
    assert.equal(times.walkMinutes, 20);
    assert.equal(times.driveMinutes, 4);

    const polygon = [
      { lat: 35.74, lng: 51.39 },
      { lat: 35.78, lng: 51.39 },
      { lat: 35.78, lng: 51.47 },
      { lat: 35.74, lng: 51.47 },
    ];
    assert.equal(isPointInsidePolygonWGS84({ lat: 35.7575, lng: 51.41 }, polygon), true);
    assert.equal(isPointInsidePolygonWGS84({ lat: 35.708, lng: 51.309 }, polygon), false);

    const match = findNeighborhoodsInsidePolygon(polygon, SAMPLE_CITY_HOODS);
    assert.equal(match.validPolygon, true);
    assert.equal(match.matched.length, 2);
    assert.equal(match.avgBuyPerSqm, 203);

    const selfIntersecting = findNeighborhoodsInsidePolygon(
      [
        { lat: 35.75, lng: 51.40 },
        { lat: 35.77, lng: 51.43 },
        { lat: 35.77, lng: 51.40 },
        { lat: 35.75, lng: 51.43 },
      ],
      SAMPLE_CITY_HOODS,
    );
    assert.equal(selfIntersecting.validPolygon, false);
    assert.equal(selfIntersecting.matched.length, 0);
  });

  it('manages interactive spatial store transitions (append, undo, clear) and measure tool rail state', () => {
    resetInteractiveSpatialMeasure();
    setInteractiveSpatialMode('measure');
    appendInteractiveSpatialPoint({ lat: 35.7575, lng: 51.41 });
    appendInteractiveSpatialPoint({ lat: 35.772, lng: 51.46 });
    assert.equal(getInteractiveSpatialMeasureState().points.length, 2);
    undoInteractiveSpatialPoint();
    assert.equal(getInteractiveSpatialMeasureState().points.length, 1);
    clearInteractiveSpatialPoints();
    assert.equal(getInteractiveSpatialMeasureState().points.length, 0);
    resetInteractiveSpatialMeasure();

    assert.equal(
      resolveMapToolVisualState('measure', {
        openPanel: null,
        activeLens: 'budget',
        showMetroLines: false,
        showTrafficZones: false,
        hasFilterApplied: false,
        isComparing: false,
        hasSavedViews: false,
        showSpatialTools: true,
        isSpatialMeasuring: true,
      }),
      'open',
    );
    assert.equal(
      resolveMapToolVisualState('measure', {
        openPanel: null,
        activeLens: 'budget',
        showMetroLines: false,
        showTrafficZones: false,
        hasFilterApplied: false,
        isComparing: false,
        hasSavedViews: false,
        showSpatialTools: false,
        isSpatialMeasuring: true,
      }),
      'active',
    );
  });
});



describe('Global selected neighborhood resolution', () => {
  it('returns nullish when the selected ID is absent instead of silently choosing the first city result', () => {
    assert.equal(resolveSelectedNeighborhoodById(999, MOCK_HOODS, []), undefined);
  });

  it('prefers the matching current-city neighborhood', () => {
    assert.equal(resolveSelectedNeighborhoodById(2, MOCK_HOODS, [MOCK_HOODS[0]]), MOCK_HOODS[1]);
  });

  it('resolves a matching nationwide neighborhood when it is outside the current city list', () => {
    assert.equal(resolveSelectedNeighborhoodById(1, [MOCK_HOODS[1]], [MOCK_HOODS[0]]), MOCK_HOODS[0]);
  });
});

