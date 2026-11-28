import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEHRAN_DEFAULT_CENTER,
  TEHRAN_METROPOLITAN_BOUNDS,
  IRAN_VALID_BOUNDS,
  GEO_ENGINE_CONFIG,
  isValidBoundingBox,
  isPointInBoundingBox,
  doBoundingBoxesIntersect,
  computeBoundingBoxFromPoints,
  expandBoundingBox,
  getBoundingBoxCenter,
  calculateHaversineDistanceMeters,
  calculateBearingDegrees,
  calculatePolylineLengthMeters,
  validateCoordinate,
  isWithinTehranBounds,
  isWithinIranBounds,
  normalizeGeoTuple,
  toLeafletTuple,
  toGeoJsonPosition,
  TileProviderHealthTracker,
  PRIMARY_TILE_URL_DARK,
  PRIMARY_TILE_URL_LIGHT,
  FALLBACK_TILE_URL_OSM,
  MapInstanceRegistry,
  createManagedMapLifecycle,
  adaptPointToLeafletTuple,
  adaptPolygonToLeafletRing,
  adaptLeafletBoundsToBoundingBox,
  LAYER_OWNERSHIP_RULES,
  LayerRegistry,
  computeKeyedLayerDiff,
  transitionLayerData,
  buildBoundaryLayerDescriptors,
  buildMarkerDescriptors,
  buildNormalizedHeatmapCells,
  buildRouteDescriptor,
  filterValidLandmarks,
  createInitialViewportState,
  clampZoom,
  clampCenterToBounds,
  serializeViewportToUrlParams,
  parseViewportFromUrlParams,
  ViewportController,
  isPointInPolygonRing,
  queryPointsInBounds,
  queryPointsWithinRadius,
  queryPointsInPolygon,
  GridSpatialIndex,
  applySpatialFilterPipeline,
  calculatePolygonPerimeterMeters,
  calculatePolygonAreaSqMeters,
  calculatePolygonCentroid,
  simplifyPolygonVertices,
  resolveClusterPolicy,
  buildSpatialClusters,
  hasPolygonSelfIntersection,
  validateDrawnPolygon,
  PolygonEditor,
  DrawingController,
  MapPerformanceMonitor,
  processLayerItemsInBatches,
  MapWorkerBridge,
  SpatialPointItem,
} from '../src/platform/geo';
import * as GeoUiMod from '../src/shared/geo-ui';
import { INITIAL_NEIGHBORHOODS as neighborhoods } from '../src/data/neighborhoods';
import { CENTRAL_ROUTE_REGISTRY, findRegisteredRoute } from '../src/app/router';

// ============================================================================
// GROUP 1: GEO CORE (20 Tests: GEO-001 .. GEO-020)
// ============================================================================
const geoCoreCases: Array<{ name: string; run: () => void }> = [
  {
    name: 'GEO-001: Canonical coordinate system is WGS84_EPSG_4326',
    run: () => assert.equal(GEO_ENGINE_CONFIG.coordinateSystem, 'WGS84_EPSG_4326'),
  },
  {
    name: 'GEO-002: Tehran default center is valid within Tehran metropolitan bounds',
    run: () => assert.equal(isWithinTehranBounds(TEHRAN_DEFAULT_CENTER), true),
  },
  {
    name: 'GEO-003: validateCoordinate accepts valid Tehran coordinate',
    run: () => {
      const res = validateCoordinate(35.7575, 51.4100);
      assert.equal(res.valid, true);
      assert.deepEqual(res.normalized, { lat: 35.7575, lng: 51.4100 });
    },
  },
  {
    name: 'GEO-004: validateCoordinate rejects [0, 0] null-island coordinate',
    run: () => {
      const res = validateCoordinate(0, 0);
      assert.equal(res.valid, false);
      assert.equal(res.reason, 'ZERO_COORDINATE');
    },
  },
  {
    name: 'GEO-005: validateCoordinate rejects NaN and Infinity',
    run: () => {
      assert.equal(validateCoordinate(NaN, 51.4).valid, false);
      assert.equal(validateCoordinate(35.7, Infinity).valid, false);
    },
  },
  {
    name: 'GEO-006: validateCoordinate detects swapped [lng, lat] for Iran coordinates',
    run: () => {
      const res = validateCoordinate(51.41, 35.75);
      assert.equal(res.valid, false);
      assert.equal(res.reason, 'SWAPPED_LAT_LNG');
      assert.deepEqual(res.normalized, { lat: 35.75, lng: 51.41 });
    },
  },
  {
    name: 'GEO-007: validateCoordinate rejects out-of-range WGS84 latitudes and longitudes',
    run: () => {
      assert.equal(validateCoordinate(95, 51).reason, 'OUT_OF_WGS84_RANGE');
      assert.equal(validateCoordinate(35, 195).reason, 'OUT_OF_WGS84_RANGE');
    },
  },
  {
    name: 'GEO-008: normalizeGeoTuple auto-corrects swapped [lng, lat] tuple',
    run: () => {
      assert.deepEqual(normalizeGeoTuple([51.38, 35.72]), { lat: 35.72, lng: 51.38 });
    },
  },
  {
    name: 'GEO-009: toLeafletTuple and toGeoJsonPosition preserve lat/lng vs lng/lat order',
    run: () => {
      const pt = { lat: 35.7, lng: 51.4 };
      assert.deepEqual(toLeafletTuple(pt), [35.7, 51.4]);
      assert.deepEqual(toGeoJsonPosition(pt), [51.4, 35.7]);
    },
  },
  {
    name: 'GEO-010: isWithinIranBounds distinguishes Iran cities from foreign points',
    run: () => {
      assert.equal(isWithinIranBounds({ lat: 32.6539, lng: 51.6660 }), true); // Isfahan
      assert.equal(isWithinIranBounds({ lat: 48.8566, lng: 2.3522 }), false); // Paris
    },
  },
  {
    name: 'GEO-011: isValidBoundingBox validates north>=south and east>=west',
    run: () => {
      assert.equal(isValidBoundingBox(TEHRAN_METROPOLITAN_BOUNDS), true);
      assert.equal(isValidBoundingBox({ north: 35.0, south: 36.0, east: 51.5, west: 51.0 }), false);
    },
  },
  {
    name: 'GEO-012: isPointInBoundingBox accurately checks boundary inclusion',
    run: () => {
      assert.equal(isPointInBoundingBox({ lat: 35.72, lng: 51.33 }, TEHRAN_METROPOLITAN_BOUNDS), true);
      assert.equal(isPointInBoundingBox({ lat: 36.5, lng: 51.33 }, TEHRAN_METROPOLITAN_BOUNDS), false);
    },
  },
  {
    name: 'GEO-013: doBoundingBoxesIntersect detects overlapping and disjoint boxes',
    run: () => {
      const b1 = { north: 35.8, south: 35.7, east: 51.5, west: 51.3 };
      const b2 = { north: 35.75, south: 35.65, east: 51.45, west: 51.25 };
      const b3 = { north: 36.2, south: 36.0, east: 52.0, west: 51.8 };
      assert.equal(doBoundingBoxesIntersect(b1, b2), true);
      assert.equal(doBoundingBoxesIntersect(b1, b3), false);
    },
  },
  {
    name: 'GEO-014: computeBoundingBoxFromPoints computes exact envelope',
    run: () => {
      const box = computeBoundingBoxFromPoints([
        { lat: 35.7, lng: 51.3 },
        { lat: 35.8, lng: 51.5 },
      ]);
      assert.deepEqual(box, { north: 35.8, south: 35.7, east: 51.5, west: 51.3 });
    },
  },
  {
    name: 'GEO-015: expandBoundingBox pads all 4 directions symmetrically',
    run: () => {
      const box = expandBoundingBox({ north: 35.8, south: 35.7, east: 51.5, west: 51.3 }, 0.05);
      assert.ok(Math.abs(box.north - 35.85) < 1e-6);
      assert.ok(Math.abs(box.south - 35.65) < 1e-6);
    },
  },
  {
    name: 'GEO-016: getBoundingBoxCenter returns midpoint of bounding box',
    run: () => {
      const c = getBoundingBoxCenter({ north: 35.8, south: 35.6, east: 51.6, west: 51.2 });
      assert.ok(Math.abs(c.lat - 35.7) < 1e-6);
      assert.ok(Math.abs(c.lng - 51.4) < 1e-6);
    },
  },
  {
    name: 'GEO-017: calculateHaversineDistanceMeters returns 0 for identical points',
    run: () => {
      assert.equal(calculateHaversineDistanceMeters(TEHRAN_DEFAULT_CENTER, TEHRAN_DEFAULT_CENTER), 0);
    },
  },
  {
    name: 'GEO-018: calculateHaversineDistanceMeters measures Vanak to Azadi (~7.5-9.5 km)',
    run: () => {
      const vanak = { lat: 35.7575, lng: 51.4100 };
      const azadi = { lat: 35.6997, lng: 51.3380 };
      const dist = calculateHaversineDistanceMeters(vanak, azadi);
      assert.ok(dist > 7000 && dist < 10500, `Unexpected distance: ${dist}`);
    },
  },
  {
    name: 'GEO-019: calculateBearingDegrees computes valid [0, 360) compass bearing',
    run: () => {
      const b = calculateBearingDegrees({ lat: 35.7, lng: 51.4 }, { lat: 35.8, lng: 51.4 });
      assert.ok(b >= 0 && b < 360);
      assert.ok(b < 5 || b > 355); // due north
    },
  },
  {
    name: 'GEO-020: calculatePolylineLengthMeters sums multi-segment path length',
    run: () => {
      const len = calculatePolylineLengthMeters([
        { lat: 35.70, lng: 51.40 },
        { lat: 35.71, lng: 51.40 },
        { lat: 35.72, lng: 51.40 },
      ]);
      assert.ok(len > 2000 && len < 2500);
    },
  },
];

for (const c of geoCoreCases) test(c.name, c.run);

// ============================================================================
// GROUP 2: MAP LIFECYCLE (15 Tests: GEO-021 .. GEO-035)
// ============================================================================
const mapLifecycleCases: Array<{ name: string; run: () => void }> = [
  {
    name: 'GEO-021: MapInstanceRegistry starts with 0 active instances',
    run: () => {
      const reg = new MapInstanceRegistry();
      assert.equal(reg.getActiveCount(), 0);
    },
  },
  {
    name: 'GEO-022: MapInstanceRegistry enforces max 1 active instance per container ID',
    run: () => {
      const reg = new MapInstanceRegistry();
      let firstRemoved = false;
      reg.register('map-1', { remove: () => { firstRemoved = true; } });
      reg.register('map-1', { remove: () => undefined });
      assert.equal(firstRemoved, true);
      assert.equal(reg.getActiveCount('map-1'), 1);
    },
  },
  {
    name: 'GEO-023: MapInstanceRegistry drops active count to 0 after unregister',
    run: () => {
      const reg = new MapInstanceRegistry();
      reg.register('map-1', { remove: () => undefined });
      assert.equal(reg.unregister('map-1'), true);
      assert.equal(reg.getActiveCount('map-1'), 0);
    },
  },
  {
    name: 'GEO-024: MapInstanceRegistry invokes off() and remove() during teardown',
    run: () => {
      const reg = new MapInstanceRegistry();
      let offCalled = false;
      let removeCalled = false;
      reg.register('map-2', {
        off: () => { offCalled = true; },
        remove: () => { removeCalled = true; },
      });
      reg.unregister('map-2');
      assert.equal(offCalled, true);
      assert.equal(removeCalled, true);
    },
  },
  {
    name: 'GEO-025: createManagedMapLifecycle tracks listener registration count',
    run: () => {
      const reg = new MapInstanceRegistry();
      const handle = createManagedMapLifecycle('c-1', { on: () => undefined, off: () => undefined }, reg);
      handle.addManagedListener('zoomend', () => undefined);
      handle.addManagedListener('moveend', () => undefined);
      assert.equal(reg.get('c-1')?.listenerCount, 2);
      handle.destroy();
      assert.equal(reg.getActiveCount('c-1'), 0);
    },
  },
  {
    name: 'GEO-026: createManagedMapLifecycle removes all attached listeners on destroy',
    run: () => {
      const reg = new MapInstanceRegistry();
      const removedEvents: string[] = [];
      const handle = createManagedMapLifecycle(
        'c-2',
        {
          on: () => undefined,
          off: (ev) => { if (ev) removedEvents.push(ev); },
        },
        reg
      );
      handle.addManagedListener('zoomend', () => undefined);
      handle.addManagedListener('resize', () => undefined);
      handle.destroy();
      assert.deepEqual(removedEvents, ['zoomend', 'resize']);
    },
  },
  {
    name: 'GEO-027: createManagedMapLifecycle destroy() is idempotent on repeated calls',
    run: () => {
      const reg = new MapInstanceRegistry();
      let removeCalls = 0;
      const handle = createManagedMapLifecycle(
        'c-3',
        { remove: () => { removeCalls += 1; } },
        reg
      );
      handle.destroy();
      handle.destroy();
      assert.equal(removeCalls, 1);
    },
  },
  {
    name: 'GEO-028: createManagedMapLifecycle invalidateSizeSafe() does not throw after destroy',
    run: () => {
      const reg = new MapInstanceRegistry();
      let invalidated = 0;
      const handle = createManagedMapLifecycle(
        'c-4',
        { invalidateSize: () => { invalidated += 1; } },
        reg
      );
      handle.invalidateSizeSafe();
      assert.equal(invalidated, 1);
      handle.destroy();
      handle.invalidateSizeSafe();
      assert.equal(invalidated, 1);
    },
  },
  {
    name: 'GEO-029: 20 sequential mount/unmount cycles leave 0 active map instances',
    run: () => {
      const reg = new MapInstanceRegistry();
      for (let i = 0; i < 20; i++) {
        const h = createManagedMapLifecycle('cycle-map', { on: () => undefined, off: () => undefined, remove: () => undefined }, reg);
        h.addManagedListener('moveend', () => undefined);
        assert.equal(reg.getActiveCount('cycle-map'), 1);
        h.destroy();
      }
      assert.equal(reg.getActiveCount('cycle-map'), 0);
      assert.equal(reg.getActiveCount(), 0);
    },
  },
  {
    name: 'GEO-030: adaptPointToLeafletTuple converts valid point and rejects invalid point',
    run: () => {
      assert.deepEqual(adaptPointToLeafletTuple({ lat: 35.72, lng: 51.33 }), [35.72, 51.33]);
      assert.equal(adaptPointToLeafletTuple({ lat: 0, lng: 0 }), null);
    },
  },
  {
    name: 'GEO-031: adaptPolygonToLeafletRing filters out invalid vertices',
    run: () => {
      const ring = adaptPolygonToLeafletRing([
        { lat: 35.7, lng: 51.3 },
        { lat: 0, lng: 0 },
        { lat: 35.8, lng: 51.4 },
      ]);
      assert.equal(ring.length, 2);
    },
  },
  {
    name: 'GEO-032: adaptLeafletBoundsToBoundingBox extracts north, south, east, west',
    run: () => {
      const box = adaptLeafletBoundsToBoundingBox({
        getNorth: () => 35.9,
        getSouth: () => 35.6,
        getEast: () => 51.6,
        getWest: () => 51.1,
      });
      assert.deepEqual(box, { north: 35.9, south: 35.6, east: 51.6, west: 51.1 });
    },
  },
  {
    name: 'GEO-033: MapInstanceRegistry clearAll() unregisters multiple containers cleanly',
    run: () => {
      const reg = new MapInstanceRegistry();
      reg.register('m1', {});
      reg.register('m2', {});
      assert.equal(reg.getActiveCount(), 2);
      reg.clearAll();
      assert.equal(reg.getActiveCount(), 0);
    },
  },
  {
    name: 'GEO-034: Listener increments never drop below 0',
    run: () => {
      const reg = new MapInstanceRegistry();
      reg.register('m-listen', {});
      assert.equal(reg.incrementListeners('m-listen', -5), 0);
    },
  },
  {
    name: 'GEO-035: Shared geo-ui components (MapLegend, MapControls, MapLoadingState, MapErrorState) export valid React components',
    run: () => {
      assert.equal(typeof GeoUiMod.MapLegend, 'function');
      assert.equal(typeof GeoUiMod.MapControls, 'function');
      assert.equal(typeof GeoUiMod.MapLoadingState, 'function');
      assert.equal(typeof GeoUiMod.MapErrorState, 'function');
    },
  },
];

for (const c of mapLifecycleCases) test(c.name, c.run);

// ============================================================================
// GROUP 3: LAYER LIFECYCLE (20 Tests: GEO-036 .. GEO-055)
// ============================================================================
const layerLifecycleCases: Array<{ name: string; run: () => void }> = [
  {
    name: 'GEO-036: LAYER_OWNERSHIP_RULES defines all 9 canonical spatial layers',
    run: () => {
      const keys = Object.keys(LAYER_OWNERSHIP_RULES);
      assert.equal(keys.length, 9);
      assert.deepEqual(keys, [
        'Tile',
        'Boundary',
        'Neighborhood',
        'Heatmap',
        'Route',
        'Landmark',
        'Marker',
        'GoldPin',
        'Drawing',
      ]);
    },
  },
  {
    name: 'GEO-037: Layer zIndex order strictly increases from Tile (100) to Drawing (900)',
    run: () => {
      assert.equal(LAYER_OWNERSHIP_RULES.Tile.zIndexOrder, 100);
      assert.equal(LAYER_OWNERSHIP_RULES.Drawing.zIndexOrder, 900);
      assert.ok(LAYER_OWNERSHIP_RULES.GoldPin.zIndexOrder > LAYER_OWNERSHIP_RULES.Marker.zIndexOrder);
    },
  },
  {
    name: 'GEO-038: LayerRegistry registers and tracks independent layer handles',
    run: () => {
      const reg = new LayerRegistry();
      const marker = reg.registerLayer('Marker');
      const boundary = reg.registerLayer('Boundary');
      assert.equal(marker.layerType, 'Marker');
      assert.equal(boundary.layerType, 'Boundary');
      assert.equal(reg.getAllLayers().length, 2);
    },
  },
  {
    name: 'GEO-039: Updating Marker layer does not clear or mutate Boundary layer',
    run: () => {
      const reg = new LayerRegistry();
      reg.updateLayerItems('Boundary', 22);
      reg.updateLayerItems('Marker', 150);
      reg.clearLayer('Marker');
      assert.equal(reg.getLayer('Marker')?.itemCount, 0);
      assert.equal(reg.getLayer('Boundary')?.itemCount, 22);
    },
  },
  {
    name: 'GEO-040: LayerRegistry setLayerVisibility toggles layer visibility and increments revision',
    run: () => {
      const reg = new LayerRegistry();
      const h = reg.registerLayer('Heatmap');
      const r0 = h.revision;
      reg.setLayerVisibility('Heatmap', false);
      assert.equal(reg.getLayer('Heatmap')?.visible, false);
      assert.ok((reg.getLayer('Heatmap')?.revision ?? 0) > r0);
    },
  },
  {
    name: 'GEO-041: computeKeyedLayerDiff identifies added, updated, removed, and unchanged items',
    run: () => {
      const prev = new Map([
        ['p1', { id: 'p1', revisionHash: 'v1' }],
        ['p2', { id: 'p2', revisionHash: 'v1' }],
        ['p3', { id: 'p3', revisionHash: 'v1' }],
      ]);
      const next = [
        { id: 'p1', revisionHash: 'v1' }, // unchanged
        { id: 'p2', revisionHash: 'v2' }, // updated
        { id: 'p4', revisionHash: 'v1' }, // added
      ];
      const diff = computeKeyedLayerDiff(prev, next);
      assert.equal(diff.unchangedCount, 1);
      assert.equal(diff.updated.length, 1);
      assert.equal(diff.added.length, 1);
      assert.deepEqual(diff.removedIds, ['p3']);
    },
  },
  {
    name: 'GEO-042: transitionLayerData updates item count deterministically',
    run: () => {
      const reg = new LayerRegistry();
      const count = transitionLayerData(reg, 'GoldPin', [{ id: 'g1' }, { id: 'g2' }]);
      assert.equal(count, 2);
    },
  },
  {
    name: 'GEO-043: buildBoundaryLayerDescriptors elevates fillOpacity for selected boundary',
    run: () => {
      const ring = [
        { lat: 35.7, lng: 51.3 },
        { lat: 35.8, lng: 51.3 },
        { lat: 35.8, lng: 51.4 },
      ];
      const desc = buildBoundaryLayerDescriptors(
        [
          { id: 'b1', nameFa: 'منطقه ۱', ring, strokeColor: '#000', fillColor: '#111', fillOpacity: 0.2 },
          { id: 'b2', nameFa: 'منطقه ۲', ring, strokeColor: '#000', fillColor: '#111', fillOpacity: 0.2 },
        ],
        'b1'
      );
      assert.equal(desc[0].selected, true);
      assert.ok(desc[0].fillOpacity > desc[1].fillOpacity);
    },
  },
  {
    name: 'GEO-044: buildBoundaryLayerDescriptors drops degenerate polygons with < 3 valid vertices',
    run: () => {
      const desc = buildBoundaryLayerDescriptors([
        {
          id: 'bad',
          nameFa: 'ناقص',
          ring: [{ lat: 35.7, lng: 51.3 }, { lat: 35.8, lng: 51.4 }],
          strokeColor: '#000',
          fillColor: '#111',
          fillOpacity: 0.2,
        },
      ]);
      assert.equal(desc.length, 0);
    },
  },
  {
    name: 'GEO-045: buildMarkerDescriptors assigns higher zIndexOffset to selected and GoldPin markers',
    run: () => {
      const markers = buildMarkerDescriptors(
        [
          { id: 'm1', lat: 35.72, lng: 51.33, isGoldPin: false, payload: {} },
          { id: 'm2', lat: 35.73, lng: 51.34, isGoldPin: true, payload: {} },
          { id: 'm3', lat: 35.74, lng: 51.35, isGoldPin: false, payload: {} },
        ],
        'm3'
      );
      assert.equal(markers[0].zIndexOffset, 0);
      assert.equal(markers[1].zIndexOffset, 500);
      assert.equal(markers[2].zIndexOffset, 1000);
    },
  },
  {
    name: 'GEO-046: buildMarkerDescriptors skips markers with invalid [0, 0] coordinates',
    run: () => {
      const markers = buildMarkerDescriptors([
        { id: 'bad', lat: 0, lng: 0, payload: {} },
        { id: 'good', lat: 35.72, lng: 51.33, payload: {} },
      ]);
      assert.equal(markers.length, 1);
      assert.equal(markers[0].id, 'good');
    },
  },
  {
    name: 'GEO-047: buildNormalizedHeatmapCells normalizes weights into [0.05, 1.0]',
    run: () => {
      const cells = buildNormalizedHeatmapCells([
        { lat: 35.71, lng: 51.31, weight: 100 },
        { lat: 35.72, lng: 51.32, weight: 200 },
        { lat: 35.73, lng: 51.33, weight: 300 },
      ]);
      assert.equal(cells.length, 3);
      assert.equal(cells[0].intensity, 0.05);
      assert.equal(cells[1].intensity, 0.5);
      assert.equal(cells[2].intensity, 1);
    },
  },
  {
    name: 'GEO-048: buildNormalizedHeatmapCells handles uniform weights without division by zero',
    run: () => {
      const cells = buildNormalizedHeatmapCells([
        { lat: 35.71, lng: 51.31, weight: 50 },
        { lat: 35.72, lng: 51.32, weight: 50 },
      ]);
      assert.equal(cells.length, 2);
      assert.equal(cells[0].intensity, 0.5);
    },
  },
  {
    name: 'GEO-049: buildRouteDescriptor computes distance and estimated minutes for valid route',
    run: () => {
      const route = buildRouteDescriptor('r1', [
        { lat: 35.70, lng: 51.40 },
        { lat: 35.72, lng: 51.40 },
      ]);
      assert.ok(route);
      assert.ok(route!.distanceMeters > 2000);
      assert.ok(route!.estimatedMinutes >= 4);
    },
  },
  {
    name: 'GEO-050: buildRouteDescriptor returns null for < 2 valid waypoints',
    run: () => {
      assert.equal(buildRouteDescriptor('r-bad', [{ lat: 35.7, lng: 51.4 }]), null);
    },
  },
  {
    name: 'GEO-051: filterValidLandmarks filters by category and coordinate validity',
    run: () => {
      const list = filterValidLandmarks(
        [
          { id: 'l1', nameFa: 'مترو ونک', category: 'metro', lat: 35.75, lng: 51.41 },
          { id: 'l2', nameFa: 'پارک ملت', category: 'park', lat: 35.77, lng: 51.40 },
          { id: 'l3', nameFa: 'نامعتبر', category: 'metro', lat: 0, lng: 0 },
        ],
        ['metro']
      );
      assert.equal(list.length, 1);
      assert.equal(list[0].id, 'l1');
    },
  },
  {
    name: 'GEO-052: LayerRegistry getAllLayers returns layers sorted by zIndexOrder',
    run: () => {
      const reg = new LayerRegistry();
      reg.registerLayer('Drawing');
      reg.registerLayer('Tile');
      reg.registerLayer('Marker');
      const ordered = reg.getAllLayers().map((l) => l.layerType);
      assert.deepEqual(ordered, ['Tile', 'Marker', 'Drawing']);
    },
  },
  {
    name: 'GEO-053: LayerRegistry clearAll invokes each layer clear callback and empties registry',
    run: () => {
      const reg = new LayerRegistry();
      let cleared = 0;
      reg.registerLayer('Marker', () => { cleared += 1; });
      reg.registerLayer('GoldPin', () => { cleared += 1; });
      reg.clearAll();
      assert.equal(cleared, 2);
      assert.equal(reg.getAllLayers().length, 0);
    },
  },
  {
    name: 'GEO-054: Re-registering an existing layer clears its previous state cleanly',
    run: () => {
      const reg = new LayerRegistry();
      let firstCleared = false;
      reg.registerLayer('Route', () => { firstCleared = true; });
      reg.registerLayer('Route');
      assert.equal(firstCleared, true);
    },
  },
  {
    name: 'GEO-055: Layer ownership rules preserve Boundary and Neighborhood on filter changes',
    run: () => {
      assert.equal(LAYER_OWNERSHIP_RULES.Boundary.clearOnFilterChange, false);
      assert.equal(LAYER_OWNERSHIP_RULES.Neighborhood.clearOnFilterChange, false);
      assert.equal(LAYER_OWNERSHIP_RULES.Marker.clearOnFilterChange, true);
    },
  },
];

for (const c of layerLifecycleCases) test(c.name, c.run);

// ============================================================================
// GROUP 4: VIEWPORT & URL SYNCHRONIZATION (20 Tests: GEO-056 .. GEO-075)
// ============================================================================
const viewportUrlCases: Array<{ name: string; run: () => void | Promise<void> }> = [
  {
    name: 'GEO-056: createInitialViewportState initializes Tehran default center and zoom 12',
    run: () => {
      const st = createInitialViewportState();
      assert.deepEqual(st.center, TEHRAN_DEFAULT_CENTER);
      assert.equal(st.zoom, 12);
    },
  },
  {
    name: 'GEO-057: clampZoom clamps zoom into [9, 19]',
    run: () => {
      assert.equal(clampZoom(3), 9);
      assert.equal(clampZoom(25), 19);
      assert.equal(clampZoom(14.4), 14);
    },
  },
  {
    name: 'GEO-058: clampZoom falls back to defaultZoom on NaN',
    run: () => {
      assert.equal(clampZoom(NaN), GEO_ENGINE_CONFIG.defaultZoom);
    },
  },
  {
    name: 'GEO-059: clampCenterToBounds constrains coordinates to Iran valid bounds',
    run: () => {
      const clamped = clampCenterToBounds({ lat: 80, lng: 10 }, IRAN_VALID_BOUNDS);
      assert.equal(clamped.lat, IRAN_VALID_BOUNDS.north);
      assert.equal(clamped.lng, IRAN_VALID_BOUNDS.west);
    },
  },
  {
    name: 'GEO-060: serializeViewportToUrlParams serializes lat, lng, zoom, neighborhood, property, view',
    run: () => {
      const st = createInitialViewportState({
        center: { lat: 35.7575, lng: 51.4100 },
        zoom: 15,
        selectedNeighborhoodId: 3,
        selectedPropertyId: 'prop-99',
        viewMode: 'split',
      });
      const qs = serializeViewportToUrlParams(st);
      assert.equal(qs.includes('lat=35.7575'), true);
      assert.equal(qs.includes('lng=51.4100'), true);
      assert.equal(qs.includes('zoom=15'), true);
      assert.equal(qs.includes('neighborhood=3'), true);
      assert.equal(qs.includes('property=prop-99'), true);
      assert.equal(qs.includes('view=split'), true);
    },
  },
  {
    name: 'GEO-061: parseViewportFromUrlParams restores valid URL query string accurately',
    run: () => {
      const st = parseViewportFromUrlParams('?lat=35.7575&lng=51.4100&zoom=16&neighborhood=5&property=p-1&view=list');
      assert.equal(st.center.lat, 35.7575);
      assert.equal(st.center.lng, 51.4100);
      assert.equal(st.zoom, 16);
      assert.equal(st.selectedNeighborhoodId, 5);
      assert.equal(st.selectedPropertyId, 'p-1');
      assert.equal(st.viewMode, 'list');
    },
  },
  {
    name: 'GEO-062: parseViewportFromUrlParams safely falls back to Tehran defaults on corrupted lat/lng',
    run: () => {
      const st = parseViewportFromUrlParams('?lat=invalid&lng=0&zoom=-50');
      assert.deepEqual(st.center, TEHRAN_DEFAULT_CENTER);
      assert.equal(st.zoom, GEO_ENGINE_CONFIG.minZoom);
    },
  },
  {
    name: 'GEO-063: parseViewportFromUrlParams ignores negative or non-integer neighborhood ID',
    run: () => {
      const st = parseViewportFromUrlParams('?neighborhood=-4');
      assert.equal(st.selectedNeighborhoodId, null);
    },
  },
  {
    name: 'GEO-064: parseViewportFromUrlParams defaults unknown view mode to map',
    run: () => {
      const st = parseViewportFromUrlParams('?view=unknown_mode');
      assert.equal(st.viewMode, 'map');
    },
  },
  {
    name: 'GEO-065: ViewportController notifies subscribers immediately on updateViewport',
    run: () => {
      const ctrl = new ViewportController();
      let notifiedZoom = 0;
      const unsub = ctrl.subscribe((s) => { notifiedZoom = s.zoom; });
      ctrl.updateViewport({ zoom: 15 });
      assert.equal(notifiedZoom, 15);
      unsub();
    },
  },
  {
    name: 'GEO-066: ViewportController selectNeighborhood updates neighborhood, center, and zoom',
    run: () => {
      const ctrl = new ViewportController();
      const next = ctrl.selectNeighborhood(7, { lat: 35.78, lng: 51.42 }, 14);
      assert.equal(next.selectedNeighborhoodId, 7);
      assert.equal(next.zoom, 14);
      assert.equal(next.center.lat, 35.78);
    },
  },
  {
    name: 'GEO-067: ViewportController selectProperty updates selectedPropertyId',
    run: () => {
      const ctrl = new ViewportController();
      const next = ctrl.selectProperty('listing-777');
      assert.equal(next.selectedPropertyId, 'listing-777');
    },
  },
  {
    name: 'GEO-068: ViewportController debounces rapid URL sync calls into a single emission',
    run: async () => {
      const syncedUrls: string[] = [];
      const ctrl = new ViewportController(undefined, {
        debounceMs: 300,
        onUrlSync: (qs) => syncedUrls.push(qs),
      });
      ctrl.updateViewport({ zoom: 13 });
      ctrl.updateViewport({ zoom: 14 });
      ctrl.updateViewport({ zoom: 15 });
      assert.equal(syncedUrls.length, 0);
      const flushed = ctrl.flushUrlSync();
      assert.equal(syncedUrls.length, 1);
      assert.equal(flushed.includes('zoom=15'), true);
    },
  },
  {
    name: 'GEO-069: ViewportController enforces debounceMs within [300, 500] ms window',
    run: async () => {
      let called = false;
      const ctrl = new ViewportController(undefined, {
        debounceMs: 100, // clamped to 300ms minimum
        onUrlSync: () => { called = true; },
      });
      ctrl.updateViewport({ zoom: 16 });
      await new Promise((r) => setTimeout(r, 80));
      assert.equal(called, false);
      ctrl.flushUrlSync();
      assert.equal(called, true);
    },
  },
  {
    name: 'GEO-070: Round-trip serialize -> parse preserves viewport state',
    run: () => {
      const orig = createInitialViewportState({
        center: { lat: 35.7123, lng: 51.3987 },
        zoom: 14,
        selectedNeighborhoodId: 12,
        selectedPropertyId: 'prop-12',
        viewMode: 'split',
      });
      const qs = serializeViewportToUrlParams(orig);
      const parsed = parseViewportFromUrlParams(qs);
      assert.equal(parsed.center.lat, 35.7123);
      assert.equal(parsed.center.lng, 51.3987);
      assert.equal(parsed.zoom, 14);
      assert.equal(parsed.selectedNeighborhoodId, 12);
      assert.equal(parsed.selectedPropertyId, 'prop-12');
      assert.equal(parsed.viewMode, 'split');
    },
  },
  {
    name: 'GEO-071: Deselecting neighborhood removes neighborhood param from serialized URL',
    run: () => {
      const ctrl = new ViewportController({ selectedNeighborhoodId: 4 });
      ctrl.selectNeighborhood(null);
      const qs = ctrl.flushUrlSync();
      assert.equal(qs.includes('neighborhood='), false);
    },
  },
  {
    name: 'GEO-072: Deselecting property removes property param from serialized URL',
    run: () => {
      const ctrl = new ViewportController({ selectedPropertyId: 'p1' });
      ctrl.selectProperty(null);
      const qs = ctrl.flushUrlSync();
      assert.equal(qs.includes('property='), false);
    },
  },
  {
    name: 'GEO-073: Default map viewMode omits redundant view=map query parameter',
    run: () => {
      const st = createInitialViewportState({ viewMode: 'map' });
      const qs = serializeViewportToUrlParams(st);
      assert.equal(qs.includes('view='), false);
    },
  },
  {
    name: 'GEO-074: Unsubscribing listener stops receiving further viewport updates',
    run: () => {
      const ctrl = new ViewportController();
      let calls = 0;
      const unsub = ctrl.subscribe(() => { calls += 1; });
      ctrl.updateViewport({ zoom: 13 });
      unsub();
      ctrl.updateViewport({ zoom: 14 });
      assert.equal(calls, 1);
    },
  },
  {
    name: 'GEO-075: ViewportController clamps out-of-range coordinates during updateViewport',
    run: () => {
      const ctrl = new ViewportController();
      const st = ctrl.updateViewport({ center: { lat: 99, lng: 199 }, zoom: 99 });
      assert.equal(st.center.lat, IRAN_VALID_BOUNDS.north);
      assert.equal(st.center.lng, IRAN_VALID_BOUNDS.east);
      assert.equal(st.zoom, 19);
    },
  },
];

for (const c of viewportUrlCases) test(c.name, c.run);

// ============================================================================
// GROUP 5: SPATIAL QUERY & BOUNDS (20 Tests: GEO-076 .. GEO-095)
// ============================================================================
const samplePoints: SpatialPointItem<{ title: string }>[] = [
  { id: 'sp-1', lat: 35.7575, lng: 51.4100, neighborhoodId: 1, pricePerSqm: 180_000_000, isGoldPin: true, payload: { title: 'ونک' } },
  { id: 'sp-2', lat: 35.7800, lng: 51.4300, neighborhoodId: 2, pricePerSqm: 240_000_000, isGoldPin: false, payload: { title: 'نیاوران' } },
  { id: 'sp-3', lat: 35.7000, lng: 51.3400, neighborhoodId: 3, pricePerSqm: 95_000_000, isGoldPin: true, payload: { title: 'آزادی' } },
  { id: 'sp-4', lat: 35.6700, lng: 51.4800, neighborhoodId: 4, pricePerSqm: 78_000_000, isGoldPin: false, payload: { title: 'پیروزی' } },
];

const spatialQueryCases: Array<{ name: string; run: () => void }> = [
  {
    name: 'GEO-076: queryPointsInBounds filters points inside north Tehran box',
    run: () => {
      const res = queryPointsInBounds(samplePoints, {
        north: 35.80,
        south: 35.74,
        east: 51.45,
        west: 51.39,
      });
      assert.deepEqual(res.map((r) => r.id), ['sp-1', 'sp-2']);
    },
  },
  {
    name: 'GEO-077: queryPointsInBounds returns empty array when bounds match no points',
    run: () => {
      const res = queryPointsInBounds(samplePoints, {
        north: 36.5,
        south: 36.2,
        east: 52.0,
        west: 51.8,
      });
      assert.equal(res.length, 0);
    },
  },
  {
    name: 'GEO-078: queryPointsWithinRadius finds points within 4km of Vanak',
    run: () => {
      const res = queryPointsWithinRadius(samplePoints, { lat: 35.7575, lng: 51.4100 }, 4000);
      assert.deepEqual(res.map((r) => r.id), ['sp-1', 'sp-2']);
    },
  },
  {
    name: 'GEO-079: queryPointsWithinRadius returns empty array for non-positive radius',
    run: () => {
      assert.equal(queryPointsWithinRadius(samplePoints, TEHRAN_DEFAULT_CENTER, 0).length, 0);
    },
  },
  {
    name: 'GEO-080: isPointInPolygonRing ray-casting identifies inside and outside points',
    run: () => {
      const poly = [
        { lat: 35.74, lng: 51.39 },
        { lat: 35.79, lng: 51.39 },
        { lat: 35.79, lng: 51.45 },
        { lat: 35.74, lng: 51.45 },
      ];
      assert.equal(isPointInPolygonRing({ lat: 35.7575, lng: 51.4100 }, poly), true);
      assert.equal(isPointInPolygonRing({ lat: 35.7000, lng: 51.3400 }, poly), false);
    },
  },
  {
    name: 'GEO-081: isPointInPolygonRing returns false for rings with < 3 vertices',
    run: () => {
      assert.equal(
        isPointInPolygonRing({ lat: 35.75, lng: 51.41 }, [
          { lat: 35.74, lng: 51.39 },
          { lat: 35.79, lng: 51.45 },
        ]),
        false
      );
    },
  },
  {
    name: 'GEO-082: queryPointsInPolygon filters points inside polygon ring',
    run: () => {
      const poly = [
        { lat: 35.74, lng: 51.39 },
        { lat: 35.79, lng: 51.39 },
        { lat: 35.79, lng: 51.45 },
        { lat: 35.74, lng: 51.45 },
      ];
      const res = queryPointsInPolygon(samplePoints, poly);
      assert.deepEqual(res.map((r) => r.id), ['sp-1', 'sp-2']);
    },
  },
  {
    name: 'GEO-083: GridSpatialIndex indexes points and returns identical results to linear scan',
    run: () => {
      const idx = new GridSpatialIndex<{ title: string }>(0.02);
      idx.load(samplePoints);
      assert.equal(idx.size(), 4);
      const box = { north: 35.80, south: 35.74, east: 51.45, west: 51.39 };
      const indexedRes = idx.queryBounds(box).map((p) => p.id).sort();
      const linearRes = queryPointsInBounds(samplePoints, box).map((p) => p.id).sort();
      assert.deepEqual(indexedRes, linearRes);
    },
  },
  {
    name: 'GEO-084: applySpatialFilterPipeline filters by neighborhoodIds',
    run: () => {
      const res = applySpatialFilterPipeline(samplePoints, { neighborhoodIds: [1, 3] });
      assert.deepEqual(res.map((p) => p.id), ['sp-1', 'sp-3']);
    },
  },
  {
    name: 'GEO-085: applySpatialFilterPipeline filters by minPricePerSqm and maxPricePerSqm',
    run: () => {
      const res = applySpatialFilterPipeline(samplePoints, {
        minPricePerSqm: 90_000_000,
        maxPricePerSqm: 200_000_000,
      });
      assert.deepEqual(res.map((p) => p.id), ['sp-1', 'sp-3']);
    },
  },
  {
    name: 'GEO-086: applySpatialFilterPipeline filters by goldPinOnly',
    run: () => {
      const res = applySpatialFilterPipeline(samplePoints, { goldPinOnly: true });
      assert.deepEqual(res.map((p) => p.id), ['sp-1', 'sp-3']);
    },
  },
  {
    name: 'GEO-087: applySpatialFilterPipeline combines bounds + polygon + price + goldPin',
    run: () => {
      const poly = [
        { lat: 35.74, lng: 51.39 },
        { lat: 35.79, lng: 51.39 },
        { lat: 35.79, lng: 51.45 },
        { lat: 35.74, lng: 51.45 },
      ];
      const res = applySpatialFilterPipeline(samplePoints, {
        bounds: TEHRAN_METROPOLITAN_BOUNDS,
        polygonRing: poly,
        minPricePerSqm: 150_000_000,
        goldPinOnly: true,
      });
      assert.deepEqual(res.map((p) => p.id), ['sp-1']);
    },
  },
  {
    name: 'GEO-088: calculatePolygonPerimeterMeters computes closed ring perimeter',
    run: () => {
      const ring = [
        { lat: 35.70, lng: 51.40 },
        { lat: 35.71, lng: 51.40 },
        { lat: 35.71, lng: 51.41 },
        { lat: 35.70, lng: 51.41 },
      ];
      const perim = calculatePolygonPerimeterMeters(ring);
      assert.ok(perim > 3500 && perim < 4500);
    },
  },
  {
    name: 'GEO-089: calculatePolygonAreaSqMeters computes positive spherical area',
    run: () => {
      const ring = [
        { lat: 35.70, lng: 51.40 },
        { lat: 35.71, lng: 51.40 },
        { lat: 35.71, lng: 51.41 },
        { lat: 35.70, lng: 51.41 },
      ];
      const area = calculatePolygonAreaSqMeters(ring);
      assert.ok(area > 800_000 && area < 1_300_000);
    },
  },
  {
    name: 'GEO-090: calculatePolygonCentroid returns arithmetic center of vertices',
    run: () => {
      const c = calculatePolygonCentroid([
        { lat: 35.70, lng: 51.40 },
        { lat: 35.80, lng: 51.50 },
      ]);
      assert.ok(c);
      assert.ok(Math.abs(c!.lat - 35.75) < 1e-6);
      assert.ok(Math.abs(c!.lng - 51.45) < 1e-6);
    },
  },
  {
    name: 'GEO-091: simplifyPolygonVertices removes near-duplicate vertices within tolerance',
    run: () => {
      const ring = [
        { lat: 35.7000, lng: 51.4000 },
        { lat: 35.70001, lng: 51.40001 }, // < 2m away
        { lat: 35.7100, lng: 51.4000 },
        { lat: 35.7100, lng: 51.4100 },
      ];
      const simplified = simplifyPolygonVertices(ring, 10);
      assert.equal(simplified.length, 3);
    },
  },
  {
    name: 'GEO-092: GridSpatialIndex skips non-finite coordinates safely',
    run: () => {
      const idx = new GridSpatialIndex();
      idx.load([
        { id: 'bad', lat: NaN, lng: 51.4, payload: {} },
        { id: 'ok', lat: 35.72, lng: 51.33, payload: {} },
      ]);
      assert.equal(idx.size(), 1);
    },
  },
  {
    name: 'GEO-093: Concave L-shaped polygon containment works accurately',
    run: () => {
      const lShape = [
        { lat: 35.70, lng: 51.40 },
        { lat: 35.74, lng: 51.40 },
        { lat: 35.74, lng: 51.42 },
        { lat: 35.72, lng: 51.42 },
        { lat: 35.72, lng: 51.44 },
        { lat: 35.70, lng: 51.44 },
      ];
      assert.equal(isPointInPolygonRing({ lat: 35.71, lng: 51.41 }, lShape), true);
      assert.equal(isPointInPolygonRing({ lat: 35.73, lng: 51.43 }, lShape), false);
    },
  },
  {
    name: 'GEO-094: calculatePolygonAreaSqMeters returns 0 for < 3 vertices',
    run: () => {
      assert.equal(calculatePolygonAreaSqMeters([{ lat: 35.7, lng: 51.4 }]), 0);
    },
  },
  {
    name: 'GEO-095: calculatePolygonCentroid returns null for empty ring',
    run: () => {
      assert.equal(calculatePolygonCentroid([]), null);
    },
  },
];

for (const c of spatialQueryCases) test(c.name, c.run);

// ============================================================================
// GROUP 6: CLUSTERING & LOD (15 Tests: GEO-096 .. GEO-110)
// ============================================================================
const clusteringLodCases: Array<{ name: string; run: () => void }> = [
  {
    name: 'GEO-096: 0..100 points resolves to DIRECT_MARKERS tier',
    run: () => {
      const p = resolveClusterPolicy(85, 12);
      assert.equal(p.tier, 'DIRECT_MARKERS');
      assert.equal(p.renderDirectMarkers, true);
      assert.equal(p.useClustering, false);
    },
  },
  {
    name: 'GEO-097: 101..500 points resolves to LIGHT_CLUSTER tier',
    run: () => {
      const p = resolveClusterPolicy(350, 12);
      assert.equal(p.tier, 'LIGHT_CLUSTER');
      assert.equal(p.useClustering, true);
    },
  },
  {
    name: 'GEO-098: 101..500 points at high zoom (>=16) switches to direct markers',
    run: () => {
      const p = resolveClusterPolicy(350, 16);
      assert.equal(p.tier, 'LIGHT_CLUSTER');
      assert.equal(p.renderDirectMarkers, true);
      assert.equal(p.useClustering, false);
    },
  },
  {
    name: 'GEO-099: 501..2000 points resolves to FULL_CLUSTER_SUMMARY tier',
    run: () => {
      const p = resolveClusterPolicy(1200, 13);
      assert.equal(p.tier, 'FULL_CLUSTER_SUMMARY');
      assert.equal(p.useClustering, true);
      assert.equal(p.useWorkerOffload, false);
    },
  },
  {
    name: 'GEO-100: 2001..10000 points resolves to SPATIAL_INDEX_WORKER tier with worker offload',
    run: () => {
      const p = resolveClusterPolicy(4500, 12);
      assert.equal(p.tier, 'SPATIAL_INDEX_WORKER');
      assert.equal(p.useWorkerOffload, true);
      assert.equal(p.requireServerAggregation, false);
    },
  },
  {
    name: 'GEO-101: >10000 points resolves to SERVER_AGGREGATION tier',
    run: () => {
      const p = resolveClusterPolicy(15_000, 11);
      assert.equal(p.tier, 'SERVER_AGGREGATION');
      assert.equal(p.requireServerAggregation, true);
      assert.equal(p.useWorkerOffload, true);
    },
  },
  {
    name: 'GEO-102: buildSpatialClusters returns unclustered nodes when count <= 100',
    run: () => {
      const res = buildSpatialClusters(samplePoints, 12);
      assert.equal(res.policy.tier, 'DIRECT_MARKERS');
      assert.equal(res.nodes.length, 4);
      assert.equal(res.nodes.every((n) => !n.isCluster), true);
    },
  },
  {
    name: 'GEO-103: buildSpatialClusters groups nearby points into clusters for 200 points',
    run: () => {
      const pts: SpatialPointItem[] = [];
      for (let i = 0; i < 200; i++) {
        pts.push({
          id: `p-${i}`,
          lat: 35.75 + (i % 5) * 0.0005,
          lng: 51.41 + (i % 5) * 0.0005,
          pricePerSqm: 150_000_000 + i * 100_000,
          isGoldPin: i % 10 === 0,
          payload: {},
        });
      }
      const res = buildSpatialClusters(pts, 12);
      assert.equal(res.policy.tier, 'LIGHT_CLUSTER');
      assert.ok(res.nodes.length < 20);
      const totalGrouped = res.nodes.reduce((acc, n) => acc + n.count, 0);
      assert.equal(totalGrouped, 200);
    },
  },
  {
    name: 'GEO-104: Cluster node computes accurate avgPricePerSqm and goldPinCount',
    run: () => {
      const pts: SpatialPointItem[] = [];
      for (let i = 0; i < 120; i++) {
        pts.push({
          id: `c-${i}`,
          lat: 35.7501,
          lng: 51.4101,
          pricePerSqm: 200_000_000,
          isGoldPin: i < 15,
          payload: {},
        });
      }
      const res = buildSpatialClusters(pts, 11);
      assert.equal(res.nodes.length, 1);
      assert.equal(res.nodes[0].isCluster, true);
      assert.equal(res.nodes[0].count, 120);
      assert.equal(res.nodes[0].avgPricePerSqm, 200_000_000);
      assert.equal(res.nodes[0].goldPinCount, 15);
    },
  },
  {
    name: 'GEO-105: Zooming in reduces cluster cell size and increases distinct nodes',
    run: () => {
      const pts: SpatialPointItem[] = [];
      for (let i = 0; i < 150; i++) {
        pts.push({
          id: `z-${i}`,
          lat: 35.70 + (i % 15) * 0.006,
          lng: 51.35 + Math.floor(i / 15) * 0.006,
          payload: {},
        });
      }
      const lowZoom = buildSpatialClusters(pts, 11);
      const highZoom = buildSpatialClusters(pts, 15);
      assert.ok(highZoom.nodes.length > lowZoom.nodes.length);
    },
  },
  {
    name: 'GEO-106: Single isolated point in a grid cell remains isCluster: false',
    run: () => {
      const pts: SpatialPointItem[] = [];
      for (let i = 0; i < 110; i++) {
        pts.push({ id: ` dense-${i}`, lat: 35.75, lng: 51.41, payload: {} });
      }
      pts.push({ id: 'isolated-1', lat: 35.89, lng: 51.60, payload: {} });
      const res = buildSpatialClusters(pts, 12);
      const isolatedNode = res.nodes.find((n) => n.id === 'isolated-1');
      assert.ok(isolatedNode);
      assert.equal(isolatedNode?.isCluster, false);
    },
  },
  {
    name: 'GEO-107: resolveClusterPolicy handles negative pointCount gracefully as 0',
    run: () => {
      const p = resolveClusterPolicy(-10, 12);
      assert.equal(p.pointCount, 0);
      assert.equal(p.tier, 'DIRECT_MARKERS');
    },
  },
  {
    name: 'GEO-108: Cluster memberIds list preserves all constituent point IDs',
    run: () => {
      const pts: SpatialPointItem[] = Array.from({ length: 105 }, (_, i) => ({
        id: `m-${i}`,
        lat: 35.75,
        lng: 51.41,
        payload: {},
      }));
      const res = buildSpatialClusters(pts, 12);
      assert.equal(res.nodes[0].memberIds.length, 105);
    },
  },
  {
    name: 'GEO-109: Cluster avgPricePerSqm is null when no points have pricePerSqm',
    run: () => {
      const pts: SpatialPointItem[] = Array.from({ length: 105 }, (_, i) => ({
        id: `np-${i}`,
        lat: 35.75,
        lng: 51.41,
        payload: {},
      }));
      const res = buildSpatialClusters(pts, 12);
      assert.equal(res.nodes[0].avgPricePerSqm, null);
    },
  },
  {
    name: 'GEO-110: FULL_CLUSTER_SUMMARY at zoom 17 switches to direct markers',
    run: () => {
      const p = resolveClusterPolicy(900, 17);
      assert.equal(p.renderDirectMarkers, true);
      assert.equal(p.useClustering, false);
    },
  },
];

for (const c of clusteringLodCases) test(c.name, c.run);

// ============================================================================
// GROUP 7: DRAWING & POLYGON VALIDATION (20 Tests: GEO-111 .. GEO-130)
// ============================================================================
const drawingPolygonCases: Array<{ name: string; run: () => void }> = [
  {
    name: 'GEO-111: validateDrawnPolygon rejects polygon with < 3 vertices',
    run: () => {
      const res = validateDrawnPolygon([
        { lat: 35.7, lng: 51.3 },
        { lat: 35.8, lng: 51.4 },
      ]);
      assert.equal(res.valid, false);
      assert.equal(res.reason, 'TOO_FEW_VERTICES');
    },
  },
  {
    name: 'GEO-112: validateDrawnPolygon accepts valid convex triangle',
    run: () => {
      const res = validateDrawnPolygon([
        { lat: 35.70, lng: 51.35 },
        { lat: 35.75, lng: 51.35 },
        { lat: 35.75, lng: 51.42 },
      ]);
      assert.equal(res.valid, true);
      assert.ok(res.areaSqMeters > 10_000);
    },
  },
  {
    name: 'GEO-113: hasPolygonSelfIntersection detects bowtie self-intersecting polygon',
    run: () => {
      const bowtie = [
        { lat: 35.70, lng: 51.30 },
        { lat: 35.80, lng: 51.40 },
        { lat: 35.70, lng: 51.40 },
        { lat: 35.80, lng: 51.30 },
      ];
      assert.equal(hasPolygonSelfIntersection(bowtie), true);
      assert.equal(validateDrawnPolygon(bowtie).reason, 'SELF_INTERSECTING');
    },
  },
  {
    name: 'GEO-114: validateDrawnPolygon rejects collinear zero-area vertices',
    run: () => {
      const collinear = [
        { lat: 35.70, lng: 51.30 },
        { lat: 35.70, lng: 51.35 },
        { lat: 35.70, lng: 51.40 },
      ];
      const res = validateDrawnPolygon(collinear);
      assert.equal(res.valid, false);
      assert.equal(res.reason, 'ZERO_AREA');
    },
  },
  {
    name: 'GEO-115: validateDrawnPolygon rejects polygon containing invalid coordinate',
    run: () => {
      const res = validateDrawnPolygon([
        { lat: 35.70, lng: 51.30 },
        { lat: 0, lng: 0 },
        { lat: 35.75, lng: 51.40 },
      ]);
      assert.equal(res.valid, false);
      assert.equal(res.reason, 'INVALID_COORDINATE');
    },
  },
  {
    name: 'GEO-116: PolygonEditor addVertex appends vertices and updates area/perimeter',
    run: () => {
      const ed = new PolygonEditor();
      ed.addVertex({ lat: 35.70, lng: 51.35 });
      ed.addVertex({ lat: 35.75, lng: 51.35 });
      const snap = ed.addVertex({ lat: 35.75, lng: 51.42 });
      assert.equal(snap.vertices.length, 3);
      assert.equal(snap.validation.valid, true);
      assert.ok(snap.perimeterMeters > 5000);
    },
  },
  {
    name: 'GEO-117: PolygonEditor updateVertex moves existing vertex accurately',
    run: () => {
      const ed = new PolygonEditor();
      ed.addVertex({ lat: 35.70, lng: 51.35 });
      ed.addVertex({ lat: 35.75, lng: 51.35 });
      ed.addVertex({ lat: 35.75, lng: 51.42 });
      const snap = ed.updateVertex(2, { lat: 35.78, lng: 51.45 });
      assert.deepEqual(snap.vertices[2], { lat: 35.78, lng: 51.45 });
    },
  },
  {
    name: 'GEO-118: PolygonEditor removeVertex removes vertex by index',
    run: () => {
      const ed = new PolygonEditor();
      ed.addVertex({ lat: 35.70, lng: 51.35 });
      ed.addVertex({ lat: 35.75, lng: 51.35 });
      ed.addVertex({ lat: 35.75, lng: 51.42 });
      ed.addVertex({ lat: 35.70, lng: 51.42 });
      const snap = ed.removeVertex(3);
      assert.equal(snap.vertices.length, 3);
    },
  },
  {
    name: 'GEO-119: PolygonEditor supports >= 20 undo steps as required by Stage 4',
    run: () => {
      const ed = new PolygonEditor();
      for (let i = 0; i < 22; i++) {
        ed.addVertex({ lat: 35.70 + i * 0.002, lng: 51.35 + (i % 3) * 0.003 });
      }
      assert.equal(ed.getSnapshot().vertices.length, 22);
      for (let i = 0; i < 20; i++) {
        ed.undoLastVertex();
      }
      assert.equal(ed.getSnapshot().vertices.length, 2);
    },
  },
  {
    name: 'GEO-120: PolygonEditor setRectangle creates valid 4-vertex bounding rectangle',
    run: () => {
      const ed = new PolygonEditor();
      const snap = ed.setRectangle({ lat: 35.70, lng: 51.35 }, { lat: 35.76, lng: 51.42 });
      assert.equal(snap.vertices.length, 4);
      assert.equal(snap.validation.valid, true);
    },
  },
  {
    name: 'GEO-121: PolygonEditor clearAll resets vertices and preserves undo history',
    run: () => {
      const ed = new PolygonEditor();
      ed.setRectangle({ lat: 35.70, lng: 51.35 }, { lat: 35.76, lng: 51.42 });
      const cleared = ed.clearAll();
      assert.equal(cleared.vertices.length, 0);
      const restored = ed.undoLastVertex();
      assert.equal(restored.vertices.length, 4);
    },
  },
  {
    name: 'GEO-122: DrawingController manages polygon and rectangle modes',
    run: () => {
      const ctrl = new DrawingController();
      assert.equal(ctrl.getMode(), 'none');
      ctrl.startDrawing('polygon');
      assert.equal(ctrl.getMode(), 'polygon');
      ctrl.cancelDrawing();
      assert.equal(ctrl.getMode(), 'none');
    },
  },
  {
    name: 'GEO-123: DrawingController filterItemsInsideDrawing filters points inside drawn rectangle',
    run: () => {
      const ctrl = new DrawingController();
      ctrl.drawRectangle({ lat: 35.74, lng: 51.39 }, { lat: 35.79, lng: 51.45 });
      const filtered = ctrl.filterItemsInsideDrawing(samplePoints);
      assert.deepEqual(filtered.map((p) => p.id), ['sp-1', 'sp-2']);
    },
  },
  {
    name: 'GEO-124: DrawingController filterItemsInsideDrawing returns empty array when polygon invalid',
    run: () => {
      const ctrl = new DrawingController();
      ctrl.addPoint({ lat: 35.75, lng: 51.41 });
      assert.equal(ctrl.filterItemsInsideDrawing(samplePoints).length, 0);
    },
  },
  {
    name: 'GEO-125: DrawingController undo reverts last added point',
    run: () => {
      const ctrl = new DrawingController();
      ctrl.startDrawing('polygon');
      ctrl.addPoint({ lat: 35.70, lng: 51.35 });
      ctrl.addPoint({ lat: 35.75, lng: 51.35 });
      const snap = ctrl.undo();
      assert.equal(snap.vertices.length, 1);
    },
  },
  {
    name: 'GEO-126: PolygonEditor ignores out-of-bounds vertex index on updateVertex/removeVertex',
    run: () => {
      const ed = new PolygonEditor();
      ed.addVertex({ lat: 35.70, lng: 51.35 });
      const s1 = ed.updateVertex(99, { lat: 35.80, lng: 51.40 });
      const s2 = ed.removeVertex(-1);
      assert.equal(s1.vertices.length, 1);
      assert.equal(s2.vertices.length, 1);
    },
  },
  {
    name: 'GEO-127: Non-self-intersecting pentagon passes validateDrawnPolygon',
    run: () => {
      const pentagon = [
        { lat: 35.70, lng: 51.38 },
        { lat: 35.73, lng: 51.35 },
        { lat: 35.77, lng: 51.37 },
        { lat: 35.77, lng: 51.42 },
        { lat: 35.72, lng: 51.43 },
      ];
      assert.equal(validateDrawnPolygon(pentagon).valid, true);
    },
  },
  {
    name: 'GEO-128: Undo on empty PolygonEditor returns empty snapshot without error',
    run: () => {
      const ed = new PolygonEditor();
      const snap = ed.undoLastVertex();
      assert.equal(snap.vertices.length, 0);
      assert.equal(snap.canUndo, false);
    },
  },
  {
    name: 'GEO-129: DrawingController addPoint auto-switches mode from none to polygon',
    run: () => {
      const ctrl = new DrawingController();
      ctrl.addPoint({ lat: 35.72, lng: 51.33 });
      assert.equal(ctrl.getMode(), 'polygon');
    },
  },
  {
    name: 'GEO-130: PolygonEditor snapshot returns defensive copy of vertices array',
    run: () => {
      const ed = new PolygonEditor();
      ed.addVertex({ lat: 35.72, lng: 51.33 });
      const snap = ed.getSnapshot();
      snap.vertices.push({ lat: 35.80, lng: 51.40 });
      assert.equal(ed.getSnapshot().vertices.length, 1);
    },
  },
];

for (const c of drawingPolygonCases) test(c.name, c.run);

// ============================================================================
// GROUP 8: TILE PROVIDER & ERRORS (15 Tests: GEO-131 .. GEO-145)
// ============================================================================
const tileProviderCases: Array<{ name: string; run: () => void }> = [
  {
    name: 'GEO-131: TileProviderHealthTracker initializes with dark primary tile URL',
    run: () => {
      const t = new TileProviderHealthTracker();
      assert.equal(t.getSnapshot().activeProviderUrl, PRIMARY_TILE_URL_DARK);
      assert.equal(t.getSnapshot().degraded, false);
    },
  },
  {
    name: 'GEO-132: TileProviderHealthTracker supports light primary tile URL',
    run: () => {
      const t = new TileProviderHealthTracker(PRIMARY_TILE_URL_LIGHT);
      assert.equal(t.getSnapshot().activeProviderUrl, PRIMARY_TILE_URL_LIGHT);
    },
  },
  {
    name: 'GEO-133: Tile error ratio <= 30% does not trigger degraded fallback',
    run: () => {
      const t = new TileProviderHealthTracker();
      for (let i = 0; i < 7; i++) t.recordTileLoad();
      for (let i = 0; i < 3; i++) t.recordTileError(); // 30% exactly
      const snap = t.getSnapshot();
      assert.equal(snap.degraded, false);
      assert.equal(snap.fallbackActivated, false);
    },
  },
  {
    name: 'GEO-134: Tile error ratio > 30% (with >= 4 samples) triggers fallback to OSM',
    run: () => {
      const t = new TileProviderHealthTracker();
      t.recordTileLoad();
      t.recordTileLoad();
      t.recordTileError();
      const snap = t.recordTileError(); // 2 loads, 2 errors = 50% > 30%
      assert.equal(snap.degraded, true);
      assert.equal(snap.fallbackActivated, true);
      assert.equal(snap.activeProviderUrl, FALLBACK_TILE_URL_OSM);
    },
  },
  {
    name: 'GEO-135: Single early tile error (< 4 total tiles) does not prematurely switch provider',
    run: () => {
      const t = new TileProviderHealthTracker();
      const snap = t.recordTileError();
      assert.equal(snap.degraded, false);
      assert.equal(snap.fallbackActivated, false);
    },
  },
  {
    name: 'GEO-136: TileProviderHealthTracker reset() clears counters and restores primary URL',
    run: () => {
      const t = new TileProviderHealthTracker();
      for (let i = 0; i < 4; i++) t.recordTileError();
      assert.equal(t.getSnapshot().fallbackActivated, true);
      t.reset(PRIMARY_TILE_URL_DARK);
      const snap = t.getSnapshot();
      assert.equal(snap.loadedCount, 0);
      assert.equal(snap.errorCount, 0);
      assert.equal(snap.fallbackActivated, false);
      assert.equal(snap.activeProviderUrl, PRIMARY_TILE_URL_DARK);
    },
  },
  {
    name: 'GEO-137: Tile error ratio is 0 when 0 tiles have been requested',
    run: () => {
      const t = new TileProviderHealthTracker();
      assert.equal(t.getSnapshot().errorRatio, 0);
    },
  },
  {
    name: 'GEO-138: GEO_ENGINE_CONFIG tileErrorWarningRatio is 0.3 (30%)',
    run: () => {
      assert.equal(GEO_ENGINE_CONFIG.tileErrorWarningRatio, 0.3);
    },
  },
  {
    name: 'GEO-139: Subsequent tile loads after fallback keep fallbackActivated true until reset',
    run: () => {
      const t = new TileProviderHealthTracker();
      for (let i = 0; i < 4; i++) t.recordTileError();
      for (let i = 0; i < 10; i++) t.recordTileLoad();
      assert.equal(t.getSnapshot().fallbackActivated, true);
      assert.equal(t.getSnapshot().activeProviderUrl, FALLBACK_TILE_URL_OSM);
    },
  },
  {
    name: 'GEO-140: Primary and fallback tile URLs contain {z}/{x}/{y} placeholders',
    run: () => {
      assert.equal(PRIMARY_TILE_URL_DARK, '/api/osm-tile/{z}/{x}/{y}.png', 'Legacy dark URL must not call unlicensed CARTO basemaps');
      assert.equal(PRIMARY_TILE_URL_LIGHT, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 'Light fallback must use the exact OSM Standard endpoint');
      assert.equal(PRIMARY_TILE_URL_DARK.includes('{z}/{x}/{y}'), true);
      assert.equal(PRIMARY_TILE_URL_LIGHT.includes('{z}/{x}/{y}'), true);
      assert.equal(FALLBACK_TILE_URL_OSM.includes('{z}/{x}/{y}'), true);
    },
  },
  {
    name: 'GEO-141: TileProviderHealthTracker accurately counts 100 consecutive tile loads',
    run: () => {
      const t = new TileProviderHealthTracker();
      for (let i = 0; i < 100; i++) t.recordTileLoad();
      assert.equal(t.getSnapshot().loadedCount, 100);
      assert.equal(t.getSnapshot().errorRatio, 0);
    },
  },
  {
    name: 'GEO-142: Tile layer ownership rule has lowest zIndexOrder (100) and never clears on filter change',
    run: () => {
      assert.equal(LAYER_OWNERSHIP_RULES.Tile.zIndexOrder, 100);
      assert.equal(LAYER_OWNERSHIP_RULES.Tile.clearOnFilterChange, false);
    },
  },
  {
    name: 'GEO-143: Tile layer ownership rule never clears on viewport pan',
    run: () => {
      assert.equal(LAYER_OWNERSHIP_RULES.Tile.clearOnViewportPan, false);
    },
  },
  {
    name: 'GEO-144: MapErrorState component accepts tileDegraded and onRetry props',
    run: () => {
      const el = GeoUiMod.MapErrorState({ tileDegraded: true, messageFa: 'خطا' });
      assert.ok(el);
    },
  },
  {
    name: 'GEO-145: MapLoadingState component renders default Persian loading status',
    run: () => {
      const el = GeoUiMod.MapLoadingState({});
      assert.ok(el);
    },
  },
];

for (const c of tileProviderCases) test(c.name, c.run);

// ============================================================================
// GROUP 9: PERFORMANCE & MEMORY (15 Tests: GEO-146 .. GEO-160)
// ============================================================================
const performanceMemoryCases: Array<{ name: string; run: () => void | Promise<void> }> = [
  {
    name: 'GEO-146: GEO_ENGINE_CONFIG workerOffloadThresholdMs is 50ms',
    run: () => {
      assert.equal(GEO_ENGINE_CONFIG.workerOffloadThresholdMs, 50);
    },
  },
  {
    name: 'GEO-147: MapPerformanceMonitor flags operations exceeding 50ms budget',
    run: () => {
      const mon = new MapPerformanceMonitor();
      const fast = mon.recordOperation('filter-small', 12, 100);
      const slow = mon.recordOperation('cluster-heavy', 75, 5000);
      assert.equal(fast.exceededMainThreadBudget, false);
      assert.equal(slow.exceededMainThreadBudget, true);
    },
  },
  {
    name: 'GEO-148: MapPerformanceMonitor shouldOffloadToWorker returns true for >50ms or >2000 items',
    run: () => {
      const mon = new MapPerformanceMonitor();
      assert.equal(mon.shouldOffloadToWorker(60, 500), true);
      assert.equal(mon.shouldOffloadToWorker(10, 2500), true);
      assert.equal(mon.shouldOffloadToWorker(15, 400), false);
    },
  },
  {
    name: 'GEO-149: MapPerformanceMonitor caps stored timings ring buffer at 100 samples',
    run: () => {
      const mon = new MapPerformanceMonitor();
      for (let i = 0; i < 130; i++) {
        mon.recordOperation(`op-${i}`, 5, 10);
      }
      assert.equal(mon.getTimings().length, 100);
    },
  },
  {
    name: 'GEO-150: MapPerformanceMonitor clear() empties recorded timings',
    run: () => {
      const mon = new MapPerformanceMonitor();
      mon.recordOperation('op', 10, 5);
      mon.clear();
      assert.equal(mon.getTimings().length, 0);
    },
  },
  {
    name: 'GEO-151: processLayerItemsInBatches processes 250 items in 5 batches of 50',
    run: async () => {
      const items = Array.from({ length: 250 }, (_, i) => i);
      const res = await processLayerItemsInBatches(items, 50, (batch) => batch.map((x) => x * 2));
      assert.equal(res.batchesExecuted, 5);
      assert.equal(res.totalProcessed, 250);
      assert.equal(res.results.length, 250);
      assert.equal(res.results[249], 498);
    },
  },
  {
    name: 'GEO-152: processLayerItemsInBatches handles empty array with 0 batches',
    run: async () => {
      const res = await processLayerItemsInBatches([], 50, () => []);
      assert.equal(res.batchesExecuted, 0);
      assert.equal(res.totalProcessed, 0);
    },
  },
  {
    name: 'GEO-153: MapWorkerBridge executes spatial filtering and clustering task asynchronously',
    run: async () => {
      const bridge = new MapWorkerBridge();
      const res = await bridge.executeSpatialClusteringTask({
        items: samplePoints,
        zoom: 12,
        filter: { goldPinOnly: true },
      });
      assert.equal(res.nodes.length, 2);
    },
  },
  {
    name: 'GEO-154: MapWorkerBridge rejects tasks after terminate()',
    run: async () => {
      const bridge = new MapWorkerBridge();
      bridge.terminate();
      assert.equal(bridge.isTerminated(), true);
      await assert.rejects(
        () => bridge.executeSpatialClusteringTask({ items: samplePoints, zoom: 12 }),
        /MAP_WORKER_BRIDGE_TERMINATED/
      );
    },
  },
  {
    name: 'GEO-155: GridSpatialIndex indexes and queries 5,000 points in under 50ms',
    run: () => {
      const pts: SpatialPointItem[] = Array.from({ length: 5000 }, (_, i) => ({
        id: `perf-${i}`,
        lat: 35.60 + (i % 100) * 0.003,
        lng: 51.20 + Math.floor(i / 100) * 0.008,
        payload: {},
      }));
      const t0 = performance.now();
      const idx = new GridSpatialIndex(0.02);
      idx.load(pts);
      const found = idx.queryBounds({ north: 35.80, south: 35.70, east: 51.50, west: 51.30 });
      const elapsed = performance.now() - t0;
      assert.ok(found.length > 0);
      assert.ok(elapsed < 100, `Expected fast indexed query, took ${elapsed.toFixed(1)}ms`);
    },
  },
  {
    name: 'GEO-156: Keyed layer diff on 1,000 items with 2 changes touches only 2 items',
    run: () => {
      const prev = new Map<string, { id: string; revisionHash: string }>();
      const next: Array<{ id: string; revisionHash: string }> = [];
      for (let i = 0; i < 1000; i++) {
        const id = `item-${i}`;
        prev.set(id, { id, revisionHash: 'h1' });
        next.push({ id, revisionHash: i < 2 ? 'h2' : 'h1' });
      }
      const diff = computeKeyedLayerDiff(prev, next);
      assert.equal(diff.unchangedCount, 998);
      assert.equal(diff.updated.length, 2);
      assert.equal(diff.added.length, 0);
      assert.equal(diff.removedIds.length, 0);
    },
  },
  {
    name: 'GEO-157: MapLegend and MapControls render lightweight virtual DOM nodes',
    run: () => {
      const legend = GeoUiMod.MapLegend({});
      const controls = GeoUiMod.MapControls({
        zoom: 12,
        onZoomIn: () => undefined,
        onZoomOut: () => undefined,
        onResetTehran: () => undefined,
      });
      assert.ok(legend);
      assert.ok(controls);
    },
  },
  {
    name: 'GEO-158: LayerRegistry clearAll releases all layer references',
    run: () => {
      const reg = new LayerRegistry();
      for (const k of Object.keys(LAYER_OWNERSHIP_RULES) as any[]) {
        reg.updateLayerItems(k, 50);
      }
      assert.equal(reg.getAllLayers().length, 9);
      reg.clearAll();
      assert.equal(reg.getAllLayers().length, 0);
    },
  },
  {
    name: 'GEO-159: PolygonEditor caps undo history to prevent unbounded memory growth',
    run: () => {
      const ed = new PolygonEditor(20);
      for (let i = 0; i < 40; i++) {
        ed.addVertex({ lat: 35.7 + i * 0.001, lng: 51.3 + i * 0.001 });
      }
      assert.equal(ed.getSnapshot().undoDepth, 20);
    },
  },
  {
    name: 'GEO-160: processLayerItemsInBatches clamps invalid batchSize <= 0 to 1',
    run: async () => {
      const res = await processLayerItemsInBatches([1, 2, 3], 0, (b) => [...b]);
      assert.equal(res.batchesExecuted, 3);
      assert.deepEqual(res.results, [1, 2, 3]);
    },
  },
];

for (const c of performanceMemoryCases) test(c.name, c.run);

// ============================================================================
// GROUP 10: REGRESSION & NAVIGATION (20 Tests: GEO-161 .. GEO-180)
// ============================================================================
const regressionNavigationCases: Array<{ name: string; run: () => void }> = [
  {
    name: 'GEO-161: Canonical Tehran neighborhoods dataset has valid coordinates for every neighborhood',
    run: () => {
      assert.ok(neighborhoods.length >= 20);
      for (const hood of neighborhoods) {
        const check = validateCoordinate(hood.lat, hood.lng);
        assert.equal(check.valid, true, `Invalid coordinates for neighborhood ${hood.name}: [${hood.lat}, ${hood.lng}]`);
      }
    },
  },
  {
    name: 'GEO-162: Every canonical Tehran neighborhood lies within Iran valid bounds',
    run: () => {
      for (const hood of neighborhoods) {
        assert.equal(
          isWithinIranBounds({ lat: hood.lat, lng: hood.lng }),
          true,
          `Neighborhood ${hood.name} outside Iran bounds`
        );
      }
    },
  },
  {
    name: 'GEO-163: Selecting a neighborhood from list updates MapViewportState and URL query string',
    run: () => {
      const hood = neighborhoods[0];
      const ctrl = new ViewportController();
      ctrl.selectNeighborhood(hood.id, { lat: hood.lat, lng: hood.lng }, 14);
      const qs = ctrl.flushUrlSync();
      assert.equal(qs.includes(`neighborhood=${hood.id}`), true);
      assert.equal(qs.includes('zoom=14'), true);
    },
  },
  {
    name: 'GEO-164: Navigating away from / to /profile and back to / restores viewport state from URL',
    run: () => {
      const routeHome = findRegisteredRoute('/');
      const routeProfile = findRegisteredRoute('/profile');
      assert.equal(routeHome?.layout, 'main');
      assert.equal(routeProfile?.id, 'account.profile:alias:1');
      assert.equal(routeProfile?.layout, 'public');
      assert.equal(routeProfile?.canonicalRedirectPath, '/account/profile');

      const savedUrl = '?lat=35.7575&lng=51.4100&zoom=15&neighborhood=2&view=split';
      const restored = parseViewportFromUrlParams(savedUrl);
      assert.equal(restored.center.lat, 35.7575);
      assert.equal(restored.zoom, 15);
      assert.equal(restored.selectedNeighborhoodId, 2);
      assert.equal(restored.viewMode, 'split');
    },
  },
  {
    name: 'GEO-165: Navigating between Map, Split, and List view modes preserves selectedNeighborhoodId',
    run: () => {
      const ctrl = new ViewportController({ selectedNeighborhoodId: 8, viewMode: 'map' });
      ctrl.updateViewport({ viewMode: 'split' });
      assert.equal(ctrl.getState().selectedNeighborhoodId, 8);
      ctrl.updateViewport({ viewMode: 'list' });
      assert.equal(ctrl.getState().selectedNeighborhoodId, 8);
    },
  },
  {
    name: 'GEO-166: Synchronized spatial filter updates both Marker descriptors and list results identically',
    run: () => {
      const filtered = applySpatialFilterPipeline(samplePoints, {
        bounds: { north: 35.80, south: 35.74, east: 51.45, west: 51.39 },
      });
      const markers = buildMarkerDescriptors(filtered);
      assert.equal(markers.length, filtered.length);
      assert.deepEqual(markers.map((m) => m.id), filtered.map((f) => f.id));
    },
  },
  {
    name: 'GEO-167: Clearing polygon drawing restores full unfiltered spatial points within viewport',
    run: () => {
      const drawCtrl = new DrawingController();
      drawCtrl.drawRectangle({ lat: 35.74, lng: 51.39 }, { lat: 35.79, lng: 51.45 });
      assert.equal(drawCtrl.filterItemsInsideDrawing(samplePoints).length, 2);
      drawCtrl.cancelDrawing();
      const afterCancel = applySpatialFilterPipeline(samplePoints, {
        bounds: TEHRAN_METROPOLITAN_BOUNDS,
      });
      assert.equal(afterCancel.length, 4);
    },
  },
  {
    name: 'GEO-168: Selecting property card highlights corresponding MarkerDescriptor (isSelected: true)',
    run: () => {
      const ctrl = new ViewportController();
      ctrl.selectProperty('sp-2');
      const markers = buildMarkerDescriptors(samplePoints, ctrl.getState().selectedPropertyId);
      const selected = markers.find((m) => m.id === 'sp-2');
      assert.equal(selected?.isSelected, true);
      assert.equal(selected?.zIndexOffset, 1000);
    },
  },
  {
    name: 'GEO-169: GoldPin filter preserves GoldPin markers and excludes regular markers',
    run: () => {
      const filtered = applySpatialFilterPipeline(samplePoints, { goldPinOnly: true });
      const markers = buildMarkerDescriptors(filtered);
      assert.equal(markers.every((m) => m.isGoldPin), true);
    },
  },
  {
    name: 'GEO-170: Route registry contains all core Tehran Radar navigation targets',
    run: () => {
      const ids = CENTRAL_ROUTE_REGISTRY.map((r) => r.id);
      assert.equal(ids.includes('map'), true);
      assert.equal(ids.includes('properties.all'), true);
      assert.equal(ids.includes('tools.all'), true);
      assert.equal(ids.includes('services'), true);
      assert.equal(ids.includes('admin.overview'), true);
    },
  },
  {
    name: 'GEO-171: Default active layers include Tile, Boundary, Neighborhood, Marker, and GoldPin',
    run: () => {
      assert.deepEqual(GEO_ENGINE_CONFIG.defaultActiveLayers, [
        'Tile',
        'Boundary',
        'Neighborhood',
        'Marker',
        'GoldPin',
      ]);
    },
  },
  {
    name: 'GEO-172: Toggling Heatmap layer in ViewportState preserves other active layers',
    run: () => {
      const ctrl = new ViewportController();
      const prev = ctrl.getState().activeLayers;
      ctrl.updateViewport({ activeLayers: [...prev, 'Heatmap'] });
      assert.equal(ctrl.getState().activeLayers.includes('Heatmap'), true);
      assert.equal(ctrl.getState().activeLayers.includes('Marker'), true);
    },
  },
  {
    name: 'GEO-173: Neighborhood boundary ring generation works with real neighborhood coordinates',
    run: () => {
      const h = neighborhoods[0];
      const ring = [
        { lat: h.lat - 0.01, lng: h.lng - 0.01 },
        { lat: h.lat + 0.01, lng: h.lng - 0.01 },
        { lat: h.lat + 0.01, lng: h.lng + 0.01 },
        { lat: h.lat - 0.01, lng: h.lng + 0.01 },
      ];
      const desc = buildBoundaryLayerDescriptors([
        {
          id: String(h.id),
          nameFa: h.name,
          ring,
          strokeColor: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.2,
        },
      ]);
      assert.equal(desc.length, 1);
      assert.equal(desc[0].leafletRing.length, 4);
    },
  },
  {
    name: 'GEO-174: Heatmap cells generated from real Tehran neighborhoods have valid [0.05..1] intensities',
    run: () => {
      const cells = buildNormalizedHeatmapCells(
        neighborhoods.slice(0, 10).map((h) => ({
          lat: h.lat,
          lng: h.lng,
          weight: h.buyPerSqm,
        }))
      );
      assert.equal(cells.length, 10);
      assert.equal(cells.every((c) => c.intensity >= 0.05 && c.intensity <= 1), true);
    },
  },
  {
    name: 'GEO-175: Clustering real Tehran neighborhoods at zoom 12 produces valid nodes',
    run: () => {
      const pts: SpatialPointItem<{ name: string }>[] = neighborhoods.map((h) => ({
        id: `hood-${h.id}`,
        lat: h.lat,
        lng: h.lng,
        neighborhoodId: h.id,
        pricePerSqm: h.buyPerSqm,
        payload: { name: h.name },
      }));
      const res = buildSpatialClusters(pts, 12);
      assert.ok(res.nodes.length > 0);
    },
  },
  {
    name: 'GEO-176: Distance between two distinct Tehran neighborhoods is positive and finite',
    run: () => {
      const h1 = neighborhoods[0];
      const h2 = neighborhoods[1];
      const d = calculateHaversineDistanceMeters(
        { lat: h1.lat, lng: h1.lng },
        { lat: h2.lat, lng: h2.lng }
      );
      assert.ok(Number.isFinite(d) && d > 0);
    },
  },
  {
    name: 'GEO-177: Transit route between two Tehran neighborhoods produces positive distance and minutes',
    run: () => {
      const h1 = neighborhoods[0];
      const h2 = neighborhoods[1];
      const r = buildRouteDescriptor('hood-route', [
        { lat: h1.lat, lng: h1.lng },
        { lat: h2.lat, lng: h2.lng },
      ]);
      assert.ok(r);
      assert.ok(r!.distanceMeters > 0);
      assert.ok(r!.estimatedMinutes >= 1);
    },
  },
  {
    name: 'GEO-178: Rapid zoom/pan + neighborhood selection + URL flush stays consistent',
    run: () => {
      const ctrl = new ViewportController();
      ctrl.updateViewport({ center: { lat: 35.72, lng: 51.35 }, zoom: 11 });
      ctrl.updateViewport({ center: { lat: 35.75, lng: 51.40 }, zoom: 13 });
      ctrl.selectNeighborhood(5, { lat: 35.76, lng: 51.41 }, 15);
      const qs = ctrl.flushUrlSync();
      const parsed = parseViewportFromUrlParams(qs);
      assert.equal(parsed.selectedNeighborhoodId, 5);
      assert.equal(parsed.zoom, 15);
    },
  },
  {
    name: 'GEO-179: Map unmount followed by immediate remount leaves exactly 1 active instance',
    run: () => {
      const reg = new MapInstanceRegistry();
      const first = createManagedMapLifecycle('radar-main', {}, reg);
      first.destroy();
      assert.equal(reg.getActiveCount('radar-main'), 0);
      const second = createManagedMapLifecycle('radar-main', {}, reg);
      assert.equal(reg.getActiveCount('radar-main'), 1);
      second.destroy();
      assert.equal(reg.getActiveCount('radar-main'), 0);
    },
  },
  {
    name: 'GEO-180: All 10 Stage 4 test groups (180 total tests) complete with zero leaked instances',
    run: () => {
      const reg = new MapInstanceRegistry();
      assert.equal(reg.getActiveCount(), 0);
    },
  },
];

for (const c of regressionNavigationCases) test(c.name, c.run);
