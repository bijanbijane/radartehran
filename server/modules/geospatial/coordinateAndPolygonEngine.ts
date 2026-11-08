import type {
  LinearRingCoords,
  NormalizedCoordinateResult,
  PolygonGeometry,
  PolygonValidationReport,
  Wgs84Coordinate,
} from './types';

export function normalizeAndValidateCoordinate(
  rawLat: unknown,
  rawLng: unknown,
  options?: { precisionDecimals?: number; sourceProvenance?: string },
): NormalizedCoordinateResult {
  const sourceProvenance = options?.sourceProvenance ?? 'user_or_api_input';
  const precision = Math.max(4, Math.min(8, options?.precisionDecimals ?? 6));

  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'NON_FINITE',
      errorMessage: 'Latitude and longitude must be finite numbers.',
    };
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    // Check if lat falls in Iran longitude range (44..64) and lng falls in Iran latitude range (24..40)
    if (lat >= 44 && lat <= 64 && lng >= 24 && lng <= 40) {
      return {
        valid: false,
        sourceProvenance,
        transformationMethod: 'REJECTED',
        errorCode: 'LAT_LNG_REVERSED',
        errorMessage: 'Latitude and longitude appear to be reversed (lat in 44..64, lng in 24..40).',
      };
    }
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'IMPOSSIBLE_COORDINATE',
      errorMessage: 'Coordinates exceed global WGS84 bounds (|lat|<=90, |lng|<=180).',
    };
  }

  // Also check reversed inside valid global bounds when lat is 44..64 and lng is 24..40
  if (lat >= 44 && lat <= 64 && lng >= 24 && lng <= 40) {
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'LAT_LNG_REVERSED',
      errorMessage: 'Latitude and longitude appear to be reversed for Iran geography.',
    };
  }

  if (lat < 24.0 || lat > 40.5 || lng < 44.0 || lng > 63.8) {
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'OUT_OF_IRAN_BOUNDS',
      errorMessage: 'Coordinate is outside supported Iran geographic boundaries.',
    };
  }

  const roundedLat = Number(lat.toFixed(precision));
  const roundedLng = Number(lng.toFixed(precision));
  const wasRounded = roundedLat !== lat || roundedLng !== lng;

  return {
    valid: true,
    coordinate: { lat: roundedLat, lng: roundedLng },
    precisionDecimals: precision,
    sourceProvenance,
    transformationMethod: wasRounded ? 'PRECISION_ROUNDED' : 'NONE_WGS84',
  };
}

function segmentsProperlyIntersect(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
): boolean {
  const ccw = (p1: [number, number], p2: [number, number], p3: [number, number]) =>
    (p3[1] - p1[1]) * (p2[0] - p1[0]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);

  const d1 = ccw(b1, b2, a1);
  const d2 = ccw(b1, b2, a2);
  const d3 = ccw(a1, a2, b1);
  const d4 = ccw(a1, a2, b2);

  return ((d1 > 1e-10 && d2 < -1e-10) || (d1 < -1e-10 && d2 > 1e-10)) &&
    ((d3 > 1e-10 && d4 < -1e-10) || (d3 < -1e-10 && d4 > 1e-10));
}

function extractOuterRings(geometry: PolygonGeometry): LinearRingCoords[] {
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as LinearRingCoords[];
    return coords.length > 0 ? [coords[0]] : [];
  }
  const multi = geometry.coordinates as LinearRingCoords[][];
  return multi.map((poly) => poly[0]).filter((r): r is LinearRingCoords => Array.isArray(r) && r.length > 0);
}

export function validatePolygonGeometry(geometry: PolygonGeometry): PolygonValidationReport {
  const issues: PolygonValidationReport['issues'] = [];
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
    return {
      valid: false,
      issues: [{ code: 'INVALID_COORDINATE', message: 'Geometry type must be Polygon or MultiPolygon.' }],
    };
  }

  const rings = extractOuterRings(geometry);
  if (rings.length === 0) {
    return {
      valid: false,
      issues: [{ code: 'TOO_FEW_VERTICES', message: 'Geometry has no outer rings.' }],
    };
  }

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) {
      issues.push({
        code: 'TOO_FEW_VERTICES',
        message: 'A linear ring must contain at least 4 coordinates (3 distinct vertices + closing vertex).',
      });
      continue;
    }

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.abs(first[0] - last[0]) > 1e-7 || Math.abs(first[1] - last[1]) > 1e-7) {
      issues.push({
        code: 'UNCLOSED_RING',
        message: 'Polygon linear ring must be closed (first and last vertex must match).',
      });
    }

    let signedArea2 = 0;
    for (let i = 0; i < ring.length; i++) {
      const [lng, lat] = ring[i];
      const check = normalizeAndValidateCoordinate(lat, lng);
      if (!check.valid) {
        issues.push({
          code: 'INVALID_COORDINATE',
          message: check.errorMessage ?? 'Invalid vertex coordinate in polygon.',
        });
      }
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;

      if (i < ring.length - 1) {
        const [nextLng, nextLat] = ring[i + 1];
        signedArea2 += lng * nextLat - nextLng * lat;
      }
    }

    if (Math.abs(signedArea2) < 1e-10) {
      issues.push({
        code: 'DEGENERATE_ZERO_AREA',
        message: 'Polygon ring has zero or near-zero area.',
      });
    }

    // Check non-adjacent segment self-intersections
    const segCount = ring.length - 1;
    let foundSelfIntersect = false;
    for (let i = 0; i < segCount && !foundSelfIntersect; i++) {
      for (let j = i + 2; j < segCount; j++) {
        if (i === 0 && j === segCount - 1) continue; // adjacent at closing vertex
        if (segmentsProperlyIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
          issues.push({
            code: 'SELF_INTERSECTION',
            message: `Polygon ring self-intersects between segments ${i} and ${j}.`,
          });
          foundSelfIntersect = true;
          break;
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    boundingBox: issues.length === 0 ? { minLat, maxLat, minLng, maxLng } : undefined,
  };
}

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

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as LinearRingCoords[];
    return {
      type: 'Polygon',
      coordinates: rings.map(simplifyRing),
    };
  }
  const multi = geometry.coordinates as LinearRingCoords[][];
  return {
    type: 'MultiPolygon',
    coordinates: multi.map((poly) => poly.map(simplifyRing)),
  };
}

function isPointOnSegment(
  pt: Wgs84Coordinate,
  v1: [number, number],
  v2: [number, number],
  epsilon = 1e-5,
): boolean {
  const [x1, y1] = v1; // [lng, lat]
  const [x2, y2] = v2;
  const px = pt.lng;
  const py = pt.lat;

  const minX = Math.min(x1, x2) - epsilon;
  const maxX = Math.max(x1, x2) + epsilon;
  const minY = Math.min(y1, y2) - epsilon;
  const maxY = Math.max(y1, y2) + epsilon;
  if (px < minX || px > maxX || py < minY || py > maxY) return false;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    return Math.hypot(px - x1, py - y1) <= epsilon;
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY) <= epsilon;
}

export function classifyPointInPolygon(
  point: Wgs84Coordinate,
  geometry: PolygonGeometry,
): 'INSIDE' | 'ON_EDGE' | 'OUTSIDE' {
  const rings = extractOuterRings(geometry);
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      if (isPointOnSegment(point, ring[i], ring[i + 1])) {
        return 'ON_EDGE';
      }
    }

    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];

      const intersect =
        yi > point.lat !== yj > point.lat &&
        point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 1e-15) + xi;
      if (intersect) inside = !inside;
    }
    if (inside) return 'INSIDE';
  }
  return 'OUTSIDE';
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
