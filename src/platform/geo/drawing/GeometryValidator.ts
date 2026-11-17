import { LatLngPoint } from '../core/GeoTypes';
import { validateCoordinate } from '../core/GeoValidation';
import { calculatePolygonAreaSqMeters } from '../spatial/GeometryOperations';

export interface PolygonValidationReport {
  valid: boolean;
  reason?:
    | 'TOO_FEW_VERTICES'
    | 'INVALID_COORDINATE'
    | 'ZERO_AREA'
    | 'SELF_INTERSECTING';
  vertexCount: number;
  areaSqMeters: number;
}

function ccw(a: LatLngPoint, b: LatLngPoint, c: LatLngPoint): number {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
}

function segmentsProperlyIntersect(
  p1: LatLngPoint,
  p2: LatLngPoint,
  p3: LatLngPoint,
  p4: LatLngPoint
): boolean {
  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);

  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function hasPolygonSelfIntersection(ring: readonly LatLngPoint[]): boolean {
  const n = ring.length;
  if (n < 4) return false;

  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];

    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges sharing a vertex
      if (i === 0 && j === n - 1) continue;
      const b1 = ring[j];
      const b2 = ring[(j + 1) % n];

      if (segmentsProperlyIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

export function validateDrawnPolygon(ring: readonly LatLngPoint[]): PolygonValidationReport {
  if (!ring || ring.length < 3) {
    return {
      valid: false,
      reason: 'TOO_FEW_VERTICES',
      vertexCount: ring?.length ?? 0,
      areaSqMeters: 0,
    };
  }

  for (const pt of ring) {
    if (!validateCoordinate(pt.lat, pt.lng).valid) {
      return {
        valid: false,
        reason: 'INVALID_COORDINATE',
        vertexCount: ring.length,
        areaSqMeters: 0,
      };
    }
  }

  if (hasPolygonSelfIntersection(ring)) {
    return {
      valid: false,
      reason: 'SELF_INTERSECTING',
      vertexCount: ring.length,
      areaSqMeters: 0,
    };
  }

  const areaSqMeters = calculatePolygonAreaSqMeters(ring);
  if (areaSqMeters < 1) {
    return {
      valid: false,
      reason: 'ZERO_AREA',
      vertexCount: ring.length,
      areaSqMeters,
    };
  }

  return {
    valid: true,
    vertexCount: ring.length,
    areaSqMeters,
  };
}
