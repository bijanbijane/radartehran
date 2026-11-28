import type { LinearRingCoords, PolygonGeometry, Wgs84Coordinate } from './types';
import { normalizeAndValidateCoordinate } from './coordinateNormalization';
import { validatePolygonGeometry } from './polygonTopologyEngine';

export { normalizeAndValidateCoordinate } from './coordinateNormalization';
export { classifyPointInPolygon, validatePolygonGeometry } from './polygonTopologyEngine';

export function simplifyPolygonGeometry(geometry: PolygonGeometry, stepStride = 2): PolygonGeometry {
  const simplifyRing = (ring: LinearRingCoords): LinearRingCoords => {
    if (ring.length <= 6) return ring.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]);
    const simplified: LinearRingCoords = [
      [Number(ring[0][0].toFixed(5)), Number(ring[0][1].toFixed(5))],
    ];
    for (let i = 1; i < ring.length - 1; i += Math.max(1, stepStride)) {
      simplified.push([Number(ring[i][0].toFixed(5)), Number(ring[i][1].toFixed(5))]);
    }
    const last = ring[ring.length - 1];
    if (simplified.length < 3) {
      return ring.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]);
    }
    simplified.push([Number(last[0].toFixed(5)), Number(last[1].toFixed(5))]);
    return simplified;
  };

  const candidate: PolygonGeometry = geometry.type === 'Polygon'
    ? {
      type: 'Polygon',
      coordinates: (geometry.coordinates as LinearRingCoords[]).map(simplifyRing),
    }
    : {
      type: 'MultiPolygon',
      coordinates: (geometry.coordinates as LinearRingCoords[][]).map((polygon) => polygon.map(simplifyRing)),
    };

  // Simplification is only a display optimization. Never publish a simplified
  // geometry that fails the same topology/coordinate checks as its source.
  // The canonical input geometry remains untouched and is the safe fallback.
  return validatePolygonGeometry(candidate).valid ? candidate : structuredClone(geometry);
}

export function boundingBoxesOverlap(
  a: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  b: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return !(a.maxLat < b.minLat || a.minLat > b.maxLat || a.maxLng < b.minLng || a.minLng > b.maxLng);
}

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
