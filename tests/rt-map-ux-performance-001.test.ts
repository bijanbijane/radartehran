import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_NEIGHBORHOODS,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  type EvaluatedNeighborhood,
} from '../src/data/neighborhoods';
import { selectVisibleMapNeighborhoods } from '../src/components/map/neighborhoodLayerReconciler';
import {
  buildMacroZoomClusters,
  computeDeclutteredMarkerTiers,
  getMapLabelBudget,
  getNeighborhoodMapLabel,
} from '../src/components/mapZoomLodAndDeclutter';

function evaluateSeeds(): EvaluatedNeighborhood[] {
  return INITIAL_NEIGHBORHOODS.slice(0, 8).map((hood) => ({
    ...hood,
    status: 'green' as const,
    distKm: 4.2,
    overallScore: 8.5,
    diffPercent: 10,
    marketReport: getNeighborhoodMarketReport(hood),
    trafficInfo: getNeighborhoodTrafficInfo(hood),
  }));
}

test('RT-MAP-UX-001: Tehran neighborhoods are viewport-culled while selected hood is retained', () => {
  const hoods = evaluateSeeds();
  const selected = { ...hoods[0], status: 'red' as const };
  const viewportHood = hoods[5];
  const farHood = { ...selected, id: 900001, status: 'green' as const, name: 'محله دوردست آزمایشی', lat: selected.lat + 2, lng: selected.lng + 2 };
  const all = [selected, ...hoods.slice(1), farHood];
  const map = {
    getBounds: () => ({
      pad: (ratio: number) => ({
        contains: ([lat, lng]: [number, number]) =>
          Math.abs(lat - viewportHood.lat) <= ratio * 0.02 &&
          Math.abs(lng - viewportHood.lng) <= ratio * 0.02,
      }),
    }),
  };

  const result = selectVisibleMapNeighborhoods({
    map,
    allNeighborhoods: all,
    activeCity: 'tehran',
    activeCityHoodIds: new Set(all.map((hood) => hood.id)),
    selectedHoodId: selected.id,
    selectedHood: selected,
    currentZoom: 13,
    statusFilter: 'green',
    lowBandwidthMode: false,
  });

  assert.equal(result.renderHoods.length, all.length);
  assert.ok(result.visibleHoods.some((hood) => hood.id === selected.id), 'selected neighborhood must never be culled');
  assert.ok(result.visibleHoods.some((hood) => hood.id === viewportHood.id), 'neighborhoods in the live viewport must render after a manual pan');
  assert.ok(!result.visibleHoods.some((hood) => hood.id === farHood.id), 'off-screen Tehran neighborhood must be culled');
  assert.ok(result.visibleHoods.length < result.renderHoods.length);
});

test('RT-MAP-UX-002: text-label budget scales with map dimensions and has hard limits', () => {
  const mobileBudget = getMapLabelBudget({ getSize: () => ({ x: 390, y: 844 }) });
  const desktopBudget = getMapLabelBudget({ getSize: () => ({ x: 1440, y: 900 }) });
  assert.equal(mobileBudget, 18);
  assert.equal(desktopBudget, 40);
  assert.ok(getMapLabelBudget({ getSize: () => ({ x: 100, y: 100 }) }) >= 12);
});

test('RT-MAP-UX-003: decluttering never exceeds the label budget and preserves selected label', () => {
  const seed = evaluateSeeds()[0];
  const hoods = Array.from({ length: 60 }, (_, index) => ({
    ...seed,
    id: 910000 + index,
    name: `محله آزمایشی شماره ${index}`,
    lat: seed.lat + index * 0.001,
    lng: seed.lng + index * 0.05,
    overallScore: 9 - index / 100,
  }));
  const selectedId = hoods[0].id;
  const map = {
    getSize: () => ({ x: 390, y: 844 }),
    latLngToContainerPoint: ([lat, lng]: [number, number]) => ({ x: lng * 10000, y: lat * 10000 }),
  };

  const tiers = computeDeclutteredMarkerTiers(map, hoods, 14, selectedId, () => false);
  const labelCount = Array.from(tiers.values()).filter((tier) => tier !== 'dot').length;
  assert.ok(labelCount <= getMapLabelBudget(map), `expected at most ${getMapLabelBudget(map)} labels, received ${labelCount}`);
  assert.equal(tiers.get(selectedId), 'detailed_pill');
});

test('RT-MAP-UX-004: compact map labels stay short without changing the canonical source name', () => {
  const canonicalName = 'شهرک بسیار طولانی و پیچیده با عنوان رسمی';
  const mapLabel = getNeighborhoodMapLabel(canonicalName);
  assert.ok(mapLabel.length <= 14);
  assert.notEqual(mapLabel, canonicalName);
  assert.ok(canonicalName.includes('عنوان رسمی'));
});

test('RT-MAP-UX-005: spatial macro clustering retains every neighborhood and selected membership', () => {
  const seed = evaluateSeeds()[0];
  const hoods = Array.from({ length: 300 }, (_, index) => ({
    ...seed,
    id: 920000 + index,
    lat: seed.lat + index * 0.00001,
    lng: seed.lng + index * 0.00001,
  }));
  const clusters = buildMacroZoomClusters(hoods, hoods[111].id, 7, () => ({
    stroke: '#0f766e',
    fill: '#14b8a6',
    pillBg: '#0d9488',
  }));
  assert.equal(clusters.reduce((sum, cluster) => sum + cluster.count, 0), hoods.length);
  assert.ok(clusters.some((cluster) => cluster.containsSelected));
  assert.equal(clusters.length, 1, 'nearby Tehran neighborhoods should collapse into one macro cluster at zoom 7');
});
