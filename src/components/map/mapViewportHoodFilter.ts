/**
 * @file src/components/map/mapViewportHoodFilter.ts
 * Shared viewport-bounds filtering for map explorer & discover surfaces (RT-UI-MAP-PILOT-001).
 */
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { isCoordInsideStoredViewport, type MapViewportBoundsState } from '../mapAdvancedLayers';

export function listNeighborhoodsInMapViewport(
  neighborhoods: readonly EvaluatedNeighborhood[],
  viewportBounds: MapViewportBoundsState | null,
): EvaluatedNeighborhood[] {
  if (!viewportBounds) return [];
  return neighborhoods.filter(
    (h) =>
      Number.isFinite(h.lat) &&
      Number.isFinite(h.lng) &&
      isCoordInsideStoredViewport(h.lat, h.lng, viewportBounds),
  );
}

export function resolveMapExplorerNeighborhoodList(params: {
  neighborhoods: readonly EvaluatedNeighborhood[];
  viewportBounds: MapViewportBoundsState | null;
  restrictToViewport: boolean;
}): EvaluatedNeighborhood[] {
  if (params.restrictToViewport && params.viewportBounds) {
    return listNeighborhoodsInMapViewport(params.neighborhoods, params.viewportBounds);
  }
  return [...params.neighborhoods];
}