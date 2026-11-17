import { LatLngPoint } from '../core/GeoTypes';
import { calculateHaversineDistanceMeters, calculatePolylineLengthMeters } from '../core/GeoDistance';

const EARTH_RADIUS_METERS = 6_371_008.8;

export function calculatePolygonPerimeterMeters(ring: readonly LatLngPoint[]): number {
  if (!ring || ring.length < 2) return 0;
  const closed = [...ring, ring[0]];
  return calculatePolylineLengthMeters(closed);
}

export function calculatePolygonAreaSqMeters(ring: readonly LatLngPoint[]): number {
  if (!ring || ring.length < 3) return 0;
  let area = 0;
  const n = ring.length;

  for (let i = 0; i < n; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    const x1 = (p1.lng * Math.PI) / 180;
    const y1 = (p1.lat * Math.PI) / 180;
    const x2 = (p2.lng * Math.PI) / 180;
    const y2 = (p2.lat * Math.PI) / 180;
    area += (x2 - x1) * (2 + Math.sin(y1) + Math.sin(y2));
  }

  return Math.abs((area * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2);
}

export function calculatePolygonCentroid(ring: readonly LatLngPoint[]): LatLngPoint | null {
  if (!ring || ring.length === 0) return null;
  let sumLat = 0;
  let sumLng = 0;
  for (const pt of ring) {
    sumLat += pt.lat;
    sumLng += pt.lng;
  }
  return {
    lat: sumLat / ring.length,
    lng: sumLng / ring.length,
  };
}

export function simplifyPolygonVertices(ring: readonly LatLngPoint[], minDistanceMeters = 5): LatLngPoint[] {
  if (ring.length <= 3) return [...ring];
  const result: LatLngPoint[] = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const prev = result[result.length - 1];
    if (calculateHaversineDistanceMeters(prev, ring[i]) >= minDistanceMeters) {
      result.push(ring[i]);
    }
  }
  return result.length >= 3 ? result : [...ring];
}
