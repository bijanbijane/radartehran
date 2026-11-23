/**
 * @file mapExplorerArchitecture.test.ts — RT-UI-MAP-PILOT-001 map explorer helpers
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { listNeighborhoodsInMapViewport, resolveMapExplorerNeighborhoodList } from './mapViewportHoodFilter';
import { resolveMapToolVisualState } from '../../navigation/map/mapToolRailConfig';

const HOODS = [
  { id: 1, name: 'A', lat: 35.7, lng: 51.4 } as EvaluatedNeighborhood,
  { id: 2, name: 'B', lat: 36.2, lng: 59.6 } as EvaluatedNeighborhood,
];

describe('RT-UI-MAP-PILOT-001 viewport list filtering', () => {
  it('filters neighborhoods inside stored viewport bounds', () => {
    const bounds = { north: 35.8, south: 35.6, east: 51.5, west: 51.3, zoom: 12 };
    const inView = listNeighborhoodsInMapViewport(HOODS, bounds);
    assert.equal(inView.length, 1);
    assert.equal(inView[0].id, 1);
  });

  it('resolveMapExplorerNeighborhoodList respects restrictToViewport flag', () => {
    const bounds = { north: 35.8, south: 35.6, east: 51.5, west: 51.3, zoom: 12 };
    assert.equal(resolveMapExplorerNeighborhoodList({ neighborhoods: HOODS, viewportBounds: bounds, restrictToViewport: true }).length, 1);
    assert.equal(resolveMapExplorerNeighborhoodList({ neighborhoods: HOODS, viewportBounds: bounds, restrictToViewport: false }).length, 2);
  });
});

describe('Map tool rail filters visual state', () => {
  it('marks filters tool active when panel open or filters applied', () => {
    const base = {
      openPanel: null,
      activeLens: 'budget' as const,
      showMetroLines: false,
      showTrafficZones: false,
      hasFilterApplied: false,
      isComparing: false,
      hasSavedViews: false,
    };
    assert.equal(resolveMapToolVisualState('filters', { ...base, openPanel: 'filters' }), 'open');
    assert.equal(resolveMapToolVisualState('filters', { ...base, hasFilterApplied: true }), 'active');
  });
});