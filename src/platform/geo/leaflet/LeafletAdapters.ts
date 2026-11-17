import { BoundingBox, GeoTuple, LatLngPoint } from '../core/GeoTypes';
import { validateCoordinate } from '../core/GeoValidation';

export function adaptPointToLeafletTuple(point: LatLngPoint): GeoTuple | null {
  const res = validateCoordinate(point.lat, point.lng);
  if (!res.valid || !res.normalized) return null;
  return [res.normalized.lat, res.normalized.lng];
}

export function adaptPolygonToLeafletRing(points: readonly LatLngPoint[]): GeoTuple[] {
  const ring: GeoTuple[] = [];
  for (const pt of points) {
    const tuple = adaptPointToLeafletTuple(pt);
    if (tuple) {
      ring.push(tuple);
    }
  }
  return ring;
}

export function adaptLeafletBoundsToBoundingBox(leafletBounds: {
  getNorth: () => number;
  getSouth: () => number;
  getEast: () => number;
  getWest: () => number;
}): BoundingBox {
  return {
    north: leafletBounds.getNorth(),
    south: leafletBounds.getSouth(),
    east: leafletBounds.getEast(),
    west: leafletBounds.getWest(),
  };
}
