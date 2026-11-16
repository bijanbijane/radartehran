import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMapAdvancedOverlayState,
  updateMapAdvancedOverlayState,
  renderCommuteIsochronesLayer,
} from '../src/components/mapAdvancedLayers';
import { mountLeafletMapLifecycle } from '../src/components/map/leafletMapLifecycle';

test('Stage 50.4: updateMapAdvancedOverlayState rounds viewportBounds to 5 decimals and skips redundant updates', () => {
  updateMapAdvancedOverlayState({
    viewportBounds: {
      north: 35.7891234,
      south: 35.6543211,
      east: 51.4987654,
      west: 51.3123456,
      zoom: 12,
    },
  });
  const firstState = getMapAdvancedOverlayState();
  assert.equal(firstState.viewportBounds?.north, 35.78912);
  assert.equal(firstState.viewportBounds?.south, 35.65432);

  // Sub-5-decimal jitter should be a no-op and preserve object reference
  updateMapAdvancedOverlayState({
    viewportBounds: {
      north: 35.7891239,
      south: 35.6543214,
      east: 51.4987651,
      west: 51.3123452,
      zoom: 12,
    },
  });
  const secondState = getMapAdvancedOverlayState();
  assert.equal(secondState, firstState, 'State reference must be preserved on 5-decimal no-op update');
});

test('Stage 50.5: renderCommuteIsochronesLayer uses radial distance rings (4.3 / 8.2 / 12.5 km) without minute claims', () => {
  const tooltips: string[] = [];
  const mockL = {
    layerGroup: () => {
      const group = {
        addTo: () => group,
        addLayer: () => {},
        clearLayers: () => {},
        remove: () => {},
      };
      return group;
    },
    circle: () => {
      const c = {
        bindTooltip: (html: string) => {
          tooltips.push(html);
          return c;
        },
        addTo: () => c,
      };
      return c;
    },
  };

  const groupRef = { current: null as unknown };
  const sigRef = { current: null as string | null };

  renderCommuteIsochronesLayer({
    L: mockL,
    map: { removeLayer: () => {} },
    groupRef,
    sigRef,
    showCommuteIsochrones: true,
    selectedWorkHub: { id: 'vanak', name: 'میدان ونک', lat: 35.7575, lng: 51.41 },
    activeCity: 'tehran',
  });

  assert.equal(tooltips.length, 3);
  assert.ok(tooltips[0].includes('۱۲.۵ کیلومتر') || tooltips[0].includes('۱۲٫۵ کیلومتر'));
  assert.ok(tooltips[1].includes('۸.۲ کیلومتر') || tooltips[1].includes('۸٫۲ کیلومتر'));
  assert.ok(tooltips[2].includes('۴.۳ کیلومتر') || tooltips[2].includes('۴٫۳ کیلومتر'));
  for (const t of tooltips) {
    assert.ok(!t.includes('دقیقه'), `Radial ring tooltip must not claim travel minutes: "${t}"`);
  }
});

test('Stage 50.6: mountLeafletMapLifecycle cleans up listeners, timers, and tile controller on unmount', async () => {
  const offCalls: string[] = [];
  let mapRemoved = false;
  let tornDown = false;

  const mockMap = {
    setView: () => mockMap,
    getZoom: () => 12,
    getBounds: () => ({
      getNorth: () => 35.8,
      getSouth: () => 35.6,
      getEast: () => 51.5,
      getWest: () => 51.3,
    }),
    on: () => mockMap,
    off: (evt: string) => {
      offCalls.push(evt);
      return mockMap;
    },
    removeLayer: () => {},
    invalidateSize: () => {},
    remove: () => {
      mapRemoved = true;
    },
  };

  const mockL = {
    map: () => mockMap,
    control: {
      zoom: () => ({ addTo: () => {} }),
    },
    tileLayer: () => ({
      on: function () {
        return this;
      },
      off: function () {
        return this;
      },
      addTo: function () {
        return this;
      },
      remove: () => {},
    }),
  };

  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    L: mockL,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };

  try {
    const mockContainer = {
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLDivElement;
    const mapInstanceRef = { current: null as unknown };
    const tileLayerRef = { current: null as any };

    const cleanup = mountLeafletMapLifecycle({
      mapContainerRef: { current: mockContainer },
      mapInstanceRef,
      tileLayerRef,
      initCenter: [35.6892, 51.389],
      initZoom: 12,
      initialTileStyle: 'osm',
      onSelectPreferredStyle: () => {},
      onMapLoaded: () => {},
      onZoomChange: () => {},
      onViewportSettled: () => {},
      onOpenModalQuick: () => {},
      onTeardownLayers: () => {
        tornDown = true;
      },
      loadLeaflet: async () => mockL,
      retryLoadLeaflet: async () => mockL,
    });

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(mapInstanceRef.current, mockMap);

    cleanup();
    assert.equal(mapInstanceRef.current, null);
    assert.equal(mapRemoved, true);
    assert.equal(tornDown, true);
    assert.ok(offCalls.includes('zoomend'));
    assert.ok(offCalls.includes('moveend'));
    assert.ok(offCalls.includes('resize'));
  } finally {
    (globalThis as any).window = prevWindow;
  }
});
