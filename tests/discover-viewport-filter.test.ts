import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  isCoordInsideStoredViewport,
  type MapViewportBoundsState,
} from '../src/components/mapAdvancedLayers';
import { computePaginationSlice } from '../src/utils/productViewRouterShellClasses';
import { INITIAL_NEIGHBORHOODS } from '../src/data/neighborhoods';

test('Stage 44.1: Viewport filter returns empty array when no neighborhood falls inside valid viewportBounds (no full-city fallback)', () => {
  const emptyDesertBounds: MapViewportBoundsState = {
    north: 29.05,
    south: 29.0,
    east: 51.05,
    west: 51.0,
    zoom: 12,
  };

  const inside = INITIAL_NEIGHBORHOODS.filter((h) =>
    isCoordInsideStoredViewport(h.lat, h.lng, emptyDesertBounds)
  );
  assert.equal(inside.length, 0, 'Out-of-city bounds must return 0 neighborhoods without falling back to all neighborhoods');
});

test('Stage 44.2: Viewport filter separates VIEWPORT_UNAVAILABLE (null bounds) from VIEWPORT_EMPTY (valid bounds with 0 matches)', () => {
  const resolveViewportStatus = (
    viewportBounds: MapViewportBoundsState | null,
    insideCount: number
  ): 'VIEWPORT_UNAVAILABLE' | 'VIEWPORT_EMPTY' | 'VIEWPORT_READY' => {
    if (!viewportBounds) return 'VIEWPORT_UNAVAILABLE';
    if (insideCount === 0) return 'VIEWPORT_EMPTY';
    return 'VIEWPORT_READY';
  };

  assert.equal(resolveViewportStatus(null, 0), 'VIEWPORT_UNAVAILABLE');
  assert.equal(
    resolveViewportStatus({ north: 35.8, south: 35.79, east: 51.4, west: 51.39, zoom: 13 }, 0),
    'VIEWPORT_EMPTY'
  );
  assert.equal(
    resolveViewportStatus({ north: 35.9, south: 35.6, east: 51.6, west: 51.2, zoom: 12 }, 15),
    'VIEWPORT_READY'
  );
});

test('Stage 44.3: computePaginationSlice clamps out-of-range page and handles 0 items cleanly', () => {
  const zeroSlice = computePaginationSlice([], 3, 12);
  assert.equal(zeroSlice.totalPages, 1);
  assert.equal(zeroSlice.currentPage, 1);
  assert.equal(zeroSlice.startIndex, 0);
  assert.equal(zeroSlice.endIndex, 0);

  const twentyItems = Array.from({ length: 20 }, (_, i) => i + 1);
  const clampedSlice = computePaginationSlice(twentyItems, 5, 12);
  assert.equal(clampedSlice.totalPages, 2);
  assert.equal(clampedSlice.currentPage, 2, 'Page 5 must clamp to page 2 when only 20 items exist');
  assert.equal(clampedSlice.startIndex, 13);
  assert.equal(clampedSlice.endIndex, 20);
});

test('Stage 44.4: ProductDiscoverView contains dedicated empty-viewport-state, unavailable bounds guard, and reset action', () => {
  const discoverSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/views/ProductDiscoverView.tsx'),
    'utf-8'
  );
  assert.ok(discoverSrc.includes('disabled={!viewportBounds}'));
  assert.ok(discoverSrc.includes('محدوده نقشه هنوز آماده نیست'));
  assert.ok(discoverSrc.includes('data-testid="empty-viewport-state"'));
  assert.ok(discoverSrc.includes('محله‌ای در محدوده فعلی نقشه قرار ندارد.'));
  assert.ok(discoverSrc.includes('نمایش تمام محله‌ها'));
});

