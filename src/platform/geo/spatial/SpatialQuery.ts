import { BoundingBox, LatLngPoint, SpatialPointItem } from '../core/GeoTypes';
import { isPointInBoundingBox } from '../core/GeoBounds';
import { calculateHaversineDistanceMeters } from '../core/GeoDistance';

export function isPointInPolygonRing(point: LatLngPoint, ring: readonly LatLngPoint[]): boolean {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function queryPointsInBounds<T>(
  items: readonly SpatialPointItem<T>[],
  bounds: BoundingBox
): SpatialPointItem<T>[] {
  return items.filter((item) => isPointInBoundingBox({ lat: item.lat, lng: item.lng }, bounds));
}

export function queryPointsWithinRadius<T>(
  items: readonly SpatialPointItem<T>[],
  center: LatLngPoint,
  radiusMeters: number
): SpatialPointItem<T>[] {
  if (radiusMeters <= 0) return [];
  return items.filter(
    (item) => calculateHaversineDistanceMeters(center, { lat: item.lat, lng: item.lng }) <= radiusMeters
  );
}

export function queryPointsInPolygon<T>(
  items: readonly SpatialPointItem<T>[],
  polygonRing: readonly LatLngPoint[]
): SpatialPointItem<T>[] {
  if (polygonRing.length < 3) return [];
  return items.filter((item) => isPointInPolygonRing({ lat: item.lat, lng: item.lng }, polygonRing));
}
