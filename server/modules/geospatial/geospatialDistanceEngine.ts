import type { Wgs84Coordinate } from './types';

export function calculateGeodesicDistanceMeters(a: Wgs84Coordinate, b: Wgs84Coordinate): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return Number((2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))).toFixed(1));
}

export function calculateDistanceToCorridorMeters(
  point: Wgs84Coordinate,
  corridorLine: Wgs84Coordinate[],
): number {
  if (corridorLine.length === 0) return Number.POSITIVE_INFINITY;
  if (corridorLine.length === 1) return calculateGeodesicDistanceMeters(point, corridorLine[0]);

  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < corridorLine.length - 1; i++) {
    const p1 = corridorLine[i];
    const p2 = corridorLine[i + 1];
    const dx = p2.lng - p1.lng;
    const dy = p2.lat - p1.lat;
    const lenSq = dx * dx + dy * dy;
    let closest: Wgs84Coordinate = p1;
    if (lenSq > 1e-12) {
      const t = Math.max(0, Math.min(1, ((point.lng - p1.lng) * dx + (point.lat - p1.lat) * dy) / lenSq));
      closest = { lat: p1.lat + t * dy, lng: p1.lng + t * dx };
    }
    const d = calculateGeodesicDistanceMeters(point, closest);
    if (d < minDistance) minDistance = d;
  }
  return minDistance;
}
