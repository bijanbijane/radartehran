import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INITIAL_NEIGHBORHOODS,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  type EvaluatedNeighborhood,
} from '../src/data/neighborhoods';
import {
  clearMapLayerProfiles,
  getMapLayerProfiles,
} from '../src/components/map/mapRenderProfiler';
import {
  createEmptyReconcilerRefs,
  reconcileNeighborhoodLayers,
  updateNeighborhoodMarkerPresentation,
} from '../src/components/map/neighborhoodLayerReconciler';
import {
  buildNeighborhoodLodDivIconConfig,
  buildNeighborhoodRichTooltipHtml,
  computeDeclutteredMarkerTiers,
  estimateLodPillSize,
  formatCompactNeighborhoodName,
} from '../src/components/mapZoomLodAndDeclutter';
import {
  createEmptyWorkRouteAndLandmarkRefs,
  reconcileWorkRouteAndLandmarks,
} from '../src/components/map/workRouteAndLandmarkLayers';
import { setStoredAreaUnit } from '../src/utils/areaUnit';

const EVALUATED_HOODS: EvaluatedNeighborhood[] = INITIAL_NEIGHBORHOODS.slice(0, 30).map((h, idx) => ({
  ...h,
  status: idx % 3 === 0 ? 'green' : idx % 3 === 1 ? 'yellow' : 'red',
  distKm: 5.2,
  overallScore: Number((8.8 - idx * 0.08).toFixed(1)),
  diffPercent: 4,
  marketReport: getNeighborhoodMarketReport(h),
  trafficInfo: getNeighborhoodTrafficInfo(h),
}));

function createMockLeaflet() {
  const createMockLayer = (initialLatLng?: unknown) => {
    let currentLatLng = initialLatLng;
    let currentIcon: unknown = null;
    let currentStyle: Record<string, unknown> = {};
    let currentTooltip = '';
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const layer = {
      addTo: () => layer,
      remove: () => {},
      on: (evt: string, fn: (...args: unknown[]) => void) => {
        handlers[evt] = fn;
        return layer;
      },
      off: () => layer,
      setStyle: (style: unknown) => {
        currentStyle = typeof style === 'function' ? style() : { ...currentStyle, ...(style as Record<string, unknown>) };
        return layer;
      },
      setLatLngs: (coords: unknown) => {
        currentLatLng = coords;
        return layer;
      },
      setLatLng: (coords: unknown) => {
        currentLatLng = coords;
        return layer;
      },
      setIcon: (icon: unknown) => {
        currentIcon = icon;
        return layer;
      },
      setZIndexOffset: () => layer,
      bindTooltip: (html: string) => {
        currentTooltip = html;
        return layer;
      },
      setTooltipContent: (html: string) => {
        currentTooltip = html;
        return layer;
      },
      unbindTooltip: () => layer,
      clearLayers: () => {},
      addData: () => {},
      getElement: () => null,
      _getState: () => ({ currentLatLng, currentIcon, currentStyle, currentTooltip, handlers }),
    };
    return layer;
  };

  return {
    geoJSON: (feat: unknown) => createMockLayer(feat),
    polygon: (coords: unknown) => createMockLayer(coords),
    marker: (coords: unknown) => createMockLayer(coords),
    polyline: (coords: unknown) => createMockLayer(coords),
    circleMarker: (coords: unknown) => createMockLayer(coords),
    divIcon: (opts: Record<string, unknown>) => opts,
  };
}

test('Stage 50.1: reconcileNeighborhoodLayers creates 30 polygons & markers once and updates in place with 0 remove/create across state changes', () => {
  const L = createMockLeaflet();
  const map = {
    removeLayer: () => {},
    latLngToContainerPoint: ([lat, lng]: [number, number]) => ({ x: lng * 5000, y: lat * 5000 }),
  };
  const refs = createEmptyReconcilerRefs();

  clearMapLayerProfiles();
  reconcileNeighborhoodLayers({
    L,
    map,
    refs,
    visibleHoods: EVALUATED_HOODS,
    allCityHoods: EVALUATED_HOODS,
    selectedHoodId: EVALUATED_HOODS[0].id,
    currentZoom: 12,
    activeCity: 'tehran',
    mode: 'buy',
    targetSqm: 85,
    rentAgeMultiplier: 1,
    mapLens: 'budget',
    isDarkMap: false,
    lowBandwidthMode: false,
    enableSponsorBilling: true,
    osmBoundariesByHood: {},
    areaUnit: 'sqm',
    intlCurrency: 'IRT',
    locale: 'fa',
    reason: 'INITIAL_RENDER',
    onSelectNeighborhood: () => {},
  });

  const initialProfiles = getMapLayerProfiles();
  const polyInit = initialProfiles.find((p) => p.layer === 'polygons');
  const markerInit = initialProfiles.find((p) => p.layer === 'markers');
  assert.equal(polyInit?.created, 30);
  assert.equal(polyInit?.removed, 0);
  assert.equal(markerInit?.created, 30);
  assert.equal(markerInit?.removed, 0);

  // Presentation changes: selectedHoodId, mode, targetSqm, rentAgeMultiplier, mapLens, areaUnit, intlCurrency, locale
  const scenarios = [
    { selectedHoodId: EVALUATED_HOODS[1].id, mode: 'buy' as const, mapLens: 'budget' as const, areaUnit: 'sqm' as const, intlCurrency: 'IRT' as const, locale: 'fa' as const },
    { selectedHoodId: EVALUATED_HOODS[1].id, mode: 'rent' as const, mapLens: 'bubble' as const, areaUnit: 'sqm' as const, intlCurrency: 'IRT' as const, locale: 'fa' as const },
    { selectedHoodId: EVALUATED_HOODS[1].id, mode: 'buy' as const, mapLens: 'air' as const, areaUnit: 'sqft' as const, intlCurrency: 'IRT' as const, locale: 'fa' as const },
    { selectedHoodId: EVALUATED_HOODS[1].id, mode: 'buy' as const, mapLens: 'traffic' as const, areaUnit: 'sqft' as const, intlCurrency: 'USD' as const, locale: 'en' as const },
  ];

  for (const s of scenarios) {
    clearMapLayerProfiles();
    updateNeighborhoodMarkerPresentation({
      L,
      refs,
      selectedHoodId: s.selectedHoodId,
      currentZoom: 12,
      activeCity: 'tehran',
      mode: s.mode,
      targetSqm: 110,
      rentAgeMultiplier: 1.05,
      mapLens: s.mapLens,
      isDarkMap: true,
      enableSponsorBilling: true,
      areaUnit: s.areaUnit,
      intlCurrency: s.intlCurrency,
      locale: s.locale,
    });
    for (const p of getMapLayerProfiles()) {
      assert.equal(p.created, 0, `Expected 0 created on presentation update (${p.layer})`);
      assert.equal(p.removed, 0, `Expected 0 removed on presentation update (${p.layer})`);
      assert.equal(p.updated + p.retained, 30, `Expected 30 updated+retained for ${p.layer}`);
    }
  }
});

test('Stage 50.2: computeDeclutteredMarkerTiers enforces zoom decluttering rules (7, 10, 12, 13, 14) and keeps selected hood pill', () => {
  const selectedId = EVALUATED_HOODS[25].id;
  const mockMap = {
    latLngToContainerPoint: ([lat, lng]: [number, number]) => ({ x: lng * 8000, y: lat * 8000 }),
  };

  const zoom7 = computeDeclutteredMarkerTiers(mockMap, EVALUATED_HOODS, 7, selectedId, () => false);
  const dotCountZ7 = Array.from(zoom7.values()).filter((t) => t === 'dot').length;
  assert.equal(dotCountZ7, 30, 'At zoom < 12 all markers render as low-clutter dot tier');

  const zoom12 = computeDeclutteredMarkerTiers(mockMap, EVALUATED_HOODS, 12, selectedId, () => false);
  assert.equal(zoom12.get(selectedId), 'standard_pill', 'At zoom 12 selected hood gets standard_pill');

  const zoom14 = computeDeclutteredMarkerTiers(mockMap, EVALUATED_HOODS, 14, selectedId, () => false);
  assert.equal(zoom14.get(selectedId), 'detailed_pill', 'At zoom >= 14 selected hood gets detailed_pill');
});

test('Stage 50.3: reconcileWorkRouteAndLandmarks preserves metric km distance even when areaUnit is sqft', () => {
  const L = createMockLeaflet();
  const map = { removeLayer: () => {} };
  const refs = createEmptyWorkRouteAndLandmarkRefs();
  const hood = { ...EVALUATED_HOODS[0], distKm: 6.4 };

  setStoredAreaUnit('sqft');
  reconcileWorkRouteAndLandmarks({
    L,
    map,
    refs,
    selectedWorkHub: { id: 'vanak', name: 'میدان ونک', lat: 35.7575, lng: 51.41 },
    selectedHood: hood,
    showLandmarkPins: true,
    hoodLandmarks: [],
    areaUnit: 'sqft',
  });

  assert.notEqual(refs.workLine, null);
  const state = refs.workLine._getState();
  assert.ok(
    state.currentTooltip.includes('کیلومتر'),
    'Work route tooltip must stay in metric کیلومتر even when areaUnit is sqft'
  );
  setStoredAreaUnit('sqm');
});

test('Stage 50.4: dynamic LOD pill sizing, clean compact label formatting, and tooltip bidi/header guards', () => {
  assert.equal(formatCompactNeighborhoodName('گیشا (کوی نصر)'), 'گیشا');
  assert.equal(formatCompactNeighborhoodName('شهر قدس (قلعه حسن‌خان)'), 'شهر قدس');
  assert.equal(formatCompactNeighborhoodName('فاطمی و بلوار کشاورز'), 'فاطمی');
  assert.ok(!formatCompactNeighborhoodName('شهر قدس (قلعه حسن‌خان)').includes('('));

  const wideConfig = buildNeighborhoodLodDivIconConfig({
    hood: { ...EVALUATED_HOODS[0], name: 'دهکده المپیک' },
    tier: 'compact_chip',
    zoom: 12,
    isSelected: false,
    hasSponsor: true,
    isDarkMap: false,
    pillBg: '#059669',
    stroke: '#10b981',
    shortPriceLabel: '۳٬۵۰۰م',
    fullPriceLabel: '۳٬۵۰۰م رهن',
  });
  const estimated = estimateLodPillSize({
    tier: 'compact_chip',
    hoodName: 'دهکده المپیک',
    shortPriceLabel: '۳٬۵۰۰م',
    hasSponsor: true,
  });
  assert.deepEqual(wideConfig.iconSize, [estimated.w, estimated.h]);
  assert.ok(wideConfig.iconSize[0] > 95, 'Compact chip iconSize must dynamically expand beyond legacy 82px cap for wide Persian labels');

  // With dynamic priceLabelsById, two wide pills 105px apart must NOT both render as overlapping compact chips
  const wideHoodA = { ...EVALUATED_HOODS[0], id: 901, name: 'شهرک اکباتان', lat: 0, lng: 0 };
  const wideHoodB = { ...EVALUATED_HOODS[1], id: 902, name: 'سعادت‌آباد', lat: 0, lng: 105 };
  const labelsMap = new Map<number, { shortPriceLabel: string; fullPriceLabel: string }>([
    [901, { shortPriceLabel: '۵٬۰۵۰م', fullPriceLabel: '۵٬۰۵۰م رهن' }],
    [902, { shortPriceLabel: '۷٬۹۰۰م', fullPriceLabel: '۷٬۹۰۰م رهن' }],
  ]);
  const pixelMap = { latLngToContainerPoint: ([lat, lng]: [number, number]) => ({ x: lng, y: lat }) };
  const dynamicTiers = computeDeclutteredMarkerTiers(pixelMap, [wideHoodA, wideHoodB], 12, null, () => true, labelsMap);
  assert.equal(dynamicTiers.get(901), 'compact_chip');
  assert.equal(dynamicTiers.get(902), 'dot', 'Colliding wide pill at 105px must demote to dot');

  // Tooltip header should not emit nested parentheses when zone already contains parens
  const tooltipHtml = buildNeighborhoodRichTooltipHtml({
    hood: { ...EVALUATED_HOODS[0], name: 'پونک', zone: 'غرب (منطقه ۵)' },
    activeCity: 'tehran',
    mode: 'rent',
    safeSqmPill: 80,
    scaledRahnPill: 5100,
    isDarkMap: false,
  });
  assert.ok(!tooltipHtml.includes('((منطقه ۵))') && !tooltipHtml.includes('منطقه ۵))'));
  assert.ok(tooltipHtml.includes('dir="ltr"'));
});

