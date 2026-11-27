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
/**
 * Resolve the selected neighborhood without silently substituting the first list item
 * when the selected ID is stale or belongs to another city.
 */
export function resolveMapExplorerSelectedNeighborhood(params: {
  neighborhoods: readonly EvaluatedNeighborhood[];
  selectedHoodId: number;
  selectedHood?: EvaluatedNeighborhood | null;
}): EvaluatedNeighborhood | null {
  if (params.selectedHood?.id === params.selectedHoodId) return params.selectedHood;
  return params.neighborhoods.find((hood) => hood.id === params.selectedHoodId) ?? null;
}
