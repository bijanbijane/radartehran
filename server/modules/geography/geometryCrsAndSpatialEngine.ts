/**
 * Employee 18 — Geometry Validator, CRS Transformer & Spatial Query Engine
 * (`server/modules/geography/geometryCrsAndSpatialEngine.ts`)
 *
 * Exclusive ownership: `server/modules/geography/`
 */

import type { GeoBoundingBox, GeoPoint } from './types';
import type {
  CrsTransformationResult,
  GeoJsonGeometry,
  GeometryValidationResult,
  PaginatedGeoEnvelope,
  SupportedCrsCode,
} from './employee18Contracts';

export const MAX_BULK_SPATIAL_QUERY_LIMIT = 100;

function isValidWgs84LonLat(lng: number, lat: number): boolean {
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function orientation(p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]): number {
  const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(val) < 1e-12) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment(p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]): boolean {
  return (
    q[0] <= Math.max(p[0], r[0]) + 1e-12 &&
    q[0] >= Math.min(p[0], r[0]) - 1e-12 &&
    q[1] <= Math.max(p[1], r[1]) + 1e-12 &&
    q[1] >= Math.min(p[1], r[1]) - 1e-12
  );
}

export function doLineSegmentsIntersect(
  p1: readonly [number, number],
  q1: readonly [number, number],
  p2: readonly [number, number],
  q2: readonly [number, number],
): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

export function hasRingSelfIntersection(ring: readonly (readonly [number, number])[]): boolean {
  const n = ring.length - 1; // last vertex equals first vertex in closed ring
  if (n < 3) return true;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[i + 1];
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent edges sharing a vertex
      if (j === i || j === i + 1 || (i === 0 && j === n - 1)) continue;
      const b1 = ring[j];
      const b2 = ring[j + 1];
      if (doLineSegmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

export function computeRingAreaSqMeters(ring: readonly (readonly [number, number])[]): number {
  if (ring.length < 4) return 0;
  const R = 6_378_137;
  const refLatRad = (ring[0][1] * Math.PI) / 180;
  const cosLat = Math.cos(refLatRad);
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ((ring[i][0] - ring[0][0]) * Math.PI * R * cosLat) / 180;
    const y1 = ((ring[i][1] - ring[0][1]) * Math.PI * R) / 180;
    const x2 = ((ring[i + 1][0] - ring[0][0]) * Math.PI * R * cosLat) / 180;
    const y2 = ((ring[i + 1][1] - ring[0][1]) * Math.PI * R) / 180;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.round(Math.abs(sum) * 0.5 * 100) / 100;
}

export function isPointInClosedRing(point: GeoPoint, ring: readonly (readonly [number, number])[]): boolean {
  if (ring.length < 4) return false;
  const pt: readonly [number, number] = [point.lng, point.lat];
  for (let i = 0; i < ring.length - 1; i++) {
    if (orientation(ring[i], ring[i + 1], pt) === 0 && onSegment(ring[i], pt, ring[i + 1])) {
      return true; // Point lies directly on boundary edge
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
  return inside;
}

/**
 * Validates GeoJSON geometry structure, coordinate bounds, ring closure, self-intersections, and holes.
 */
export function validateGeoJsonGeometry(geometry: GeoJsonGeometry): GeometryValidationResult {
  const errors: string[] = [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let hasHoles = false;
  let hasSelfIntersection = false;
  let totalAreaSqMeters = 0;

  const trackCoord = (lng: number, lat: number, ctx: string) => {
    if (!isValidWgs84LonLat(lng, lat)) {
      errors.push(`INVALID_COORDINATE_RANGE at ${ctx}: [${lng}, ${lat}]`);
      return;
    }
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  };

  const validatePolygonRings = (rings: readonly (readonly (readonly [number, number])[])[], polyIdx: number) => {
    if (!Array.isArray(rings) || rings.length === 0) {
      errors.push(`EMPTY_POLYGON_RINGS at polygon[${polyIdx}]`);
      return;
    }
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      if (!Array.isArray(ring) || ring.length < 4) {
        errors.push(`RING_TOO_SHORT at polygon[${polyIdx}].ring[${r}]: minimum 4 positions required.`);
        continue;
      }
      ring.forEach((pt, vIdx) => trackCoord(pt[0], pt[1], `polygon[${polyIdx}].ring[${r}][${vIdx}]`));
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        errors.push(`UNCLOSED_LINEAR_RING at polygon[${polyIdx}].ring[${r}]: first and last position must be identical.`);
        continue;
      }
      if (hasRingSelfIntersection(ring)) {
        hasSelfIntersection = true;
        errors.push(`SELF_INTERSECTING_RING at polygon[${polyIdx}].ring[${r}]`);
      }
      const ringArea = computeRingAreaSqMeters(ring);
      if (r === 0) {
        totalAreaSqMeters += ringArea;
      } else {
        hasHoles = true;
        totalAreaSqMeters = Math.max(0, totalAreaSqMeters - ringArea);
        // Verify hole vertices are inside outer ring
        for (let v = 0; v < ring.length - 1; v++) {
          if (!isPointInClosedRing({ lng: ring[v][0], lat: ring[v][1] }, rings[0])) {
            errors.push(`HOLE_OUTSIDE_EXTERIOR_RING at polygon[${polyIdx}].ring[${r}][${v}]`);
            break;
          }
        }
      }
    }
  };

  switch (geometry.type) {
    case 'Point': {
      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 2) {
        errors.push('INVALID_POINT_COORDINATES');
      } else {
        trackCoord(geometry.coordinates[0], geometry.coordinates[1], 'Point');
      }
      break;
    }
    case 'MultiPoint':
    case 'LineString': {
      const minLen = geometry.type === 'LineString' ? 2 : 1;
      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < minLen) {
        errors.push(`INVALID_${geometry.type.toUpperCase()}_LENGTH`);
      } else {
        geometry.coordinates.forEach((pt, idx) => trackCoord(pt[0], pt[1], `${geometry.type}[${idx}]`));
      }
      break;
    }
    case 'Polygon': {
      validatePolygonRings(geometry.coordinates, 0);
      break;
    }
    case 'MultiPolygon': {
      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
        errors.push('EMPTY_MULTIPOLYGON');
      } else {
        geometry.coordinates.forEach((polyRings, idx) => validatePolygonRings(polyRings, idx));
      }
      break;
    }
  }

  const valid = errors.length === 0 && Number.isFinite(minLat);
  return {
    valid,
    errors,
    ...(valid
      ? {
          boundingBox: { minLat, maxLat, minLng, maxLng },
          computedAreaSqMeters: Math.round(totalAreaSqMeters * 100) / 100,
        }
      : {}),
    hasHoles,
    hasSelfIntersection,
  };
}

/**
 * Transforms coordinates from SupportedCrsCode into canonical WGS84 (`EPSG:4326`),
 * preserving original values and never silently swapping latitude and longitude.
 */
export function transformCoordinatesToWgs84(
  rawCoordPair: readonly [number, number],
  sourceCrs: SupportedCrsCode,
): CrsTransformationResult {
  const [c0, c1] = rawCoordPair;
  if (typeof c0 !== 'number' || typeof c1 !== 'number' || !Number.isFinite(c0) || !Number.isFinite(c1)) {
    return {
      valid: false,
      sourceCrs,
      targetCrs: 'EPSG:4326',
      originalCoordinates: rawCoordPair,
      transformationMethod: 'none',
      transformationVersion: 'v1.0',
      error: 'NON_FINITE_COORDINATES',
    };
  }

  if (sourceCrs === 'EPSG:4326') {
    // Expect [lng, lat] in GeoJSON CRS order; detect if caller passed [lat, lng] for Iran (lat 24..40, lng 44..64)
    if (c0 >= 24 && c0 <= 40.5 && c1 >= 44 && c1 <= 64) {
      return {
        valid: false,
        sourceCrs,
        targetCrs: 'EPSG:4326',
        originalCoordinates: rawCoordPair,
        transformationMethod: 'identity_wgs84',
        transformationVersion: 'v1.0',
        error: 'SWAPPED_LAT_LNG_DETECTED: Expected [lng, lat] for EPSG:4326, but received [lat, lng]; silent coordinate swapping is prohibited.',
      };
    }
    if (!isValidWgs84LonLat(c0, c1)) {
      return {
        valid: false,
        sourceCrs,
        targetCrs: 'EPSG:4326',
        originalCoordinates: rawCoordPair,
        transformationMethod: 'identity_wgs84',
        transformationVersion: 'v1.0',
        error: 'OUT_OF_WGS84_BOUNDS',
      };
    }
    return {
      valid: true,
      sourceCrs,
      targetCrs: 'EPSG:4326',
      originalCoordinates: rawCoordPair,
      wgs84Point: { lng: Math.round(c0 * 1e6) / 1e6, lat: Math.round(c1 * 1e6) / 1e6 },
      transformationMethod: 'identity_wgs84',
      transformationVersion: 'v1.0',
    };
  }

  if (sourceCrs === 'EPSG:3857') {
    const maxExtent = 20_037_508.342789244;
    if (Math.abs(c0) > maxExtent || Math.abs(c1) > maxExtent) {
      return {
        valid: false,
        sourceCrs,
        targetCrs: 'EPSG:4326',
        originalCoordinates: rawCoordPair,
        transformationMethod: 'inverse_web_mercator_epsg3857',
        transformationVersion: 'v1.0',
        error: 'OUT_OF_WEB_MERCATOR_EXTENT',
      };
    }
    const lng = (c0 / maxExtent) * 180;
    let lat = (c1 / maxExtent) * 180;
    lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
    return {
      valid: true,
      sourceCrs,
      targetCrs: 'EPSG:4326',
      originalCoordinates: rawCoordPair,
      wgs84Point: { lng: Math.round(lng * 1e6) / 1e6, lat: Math.round(lat * 1e6) / 1e6 },
      transformationMethod: 'inverse_web_mercator_epsg3857',
      transformationVersion: 'v1.0',
    };
  }

  // EPSG:32639 (UTM 39N, lon0=51) or EPSG:32640 (UTM 40N, lon0=57)
  if (c0 < 100_000 || c0 > 900_000 || c1 < 0 || c1 > 10_000_000) {
    return {
      valid: false,
      sourceCrs,
      targetCrs: 'EPSG:4326',
      originalCoordinates: rawCoordPair,
      transformationMethod: 'inverse_utm_wgs84',
      transformationVersion: 'v1.0',
      error: 'OUT_OF_UTM_ZONE_BOUNDS',
    };
  }
  const lonOrigin = sourceCrs === 'EPSG:32639' ? 51 : 57;
  const a = 6_378_137.0;
  const eSq = 0.00669437999014;
  const k0 = 0.9996;
  const x = c0 - 500_000.0;
  const y = c1;
  const M = y / k0;
  const mu = M / (a * (1 - eSq / 4 - (3 * eSq * eSq) / 64));
  const e1 = (1 - Math.sqrt(1 - eSq)) / (1 + Math.sqrt(1 - eSq));
  const phi1Rad =
    mu +
    ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu);
  const sinPhi1 = Math.sin(phi1Rad);
  const cosPhi1 = Math.cos(phi1Rad);
  const tanPhi1 = Math.tan(phi1Rad);
  const N1 = a / Math.sqrt(1 - eSq * sinPhi1 * sinPhi1);
  const R1 = (a * (1 - eSq)) / Math.pow(1 - eSq * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * k0);
  const latRad = phi1Rad - ((N1 * tanPhi1) / R1) * ((D * D) / 2);
  const lngRad = ((lonOrigin * Math.PI) / 180) + D / cosPhi1;

  return {
    valid: true,
    sourceCrs,
    targetCrs: 'EPSG:4326',
    originalCoordinates: rawCoordPair,
    wgs84Point: {
      lat: Math.round(((latRad * 180) / Math.PI) * 1e6) / 1e6,
      lng: Math.round(((lngRad * 180) / Math.PI) * 1e6) / 1e6,
    },
    transformationMethod: `inverse_utm_${sourceCrs.toLowerCase()}`,
    transformationVersion: 'v1.0',
  };
}

export function isPointWithinGeoJsonGeometry(point: GeoPoint, geometry: GeoJsonGeometry): boolean {
  if (geometry.type === 'Point') {
    return Math.abs(geometry.coordinates[0] - point.lng) < 1e-7 && Math.abs(geometry.coordinates[1] - point.lat) < 1e-7;
  }
  if (geometry.type === 'Polygon') {
    const outer = geometry.coordinates[0];
    if (!outer || !isPointInClosedRing(point, outer)) return false;
    for (let h = 1; h < geometry.coordinates.length; h++) {
      if (isPointInClosedRing(point, geometry.coordinates[h])) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      const outer = poly[0];
      if (outer && isPointInClosedRing(point, outer)) {
        let inHole = false;
        for (let h = 1; h < poly.length; h++) {
          if (isPointInClosedRing(point, poly[h])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

export function doBoundingBoxesOverlap(a: GeoBoundingBox, b: GeoBoundingBox): boolean {
  return a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLng <= b.maxLng && a.maxLng >= b.minLng;
}

export function doGeoJsonPolygonsIntersect(polyA: GeoJsonGeometry, polyB: GeoJsonGeometry): boolean {
  const ringsA = polyA.type === 'Polygon' ? [polyA.coordinates[0]] : polyA.type === 'MultiPolygon' ? polyA.coordinates.map((p) => p[0]) : [];
  const ringsB = polyB.type === 'Polygon' ? [polyB.coordinates[0]] : polyB.type === 'MultiPolygon' ? polyB.coordinates.map((p) => p[0]) : [];
  if (ringsA.length === 0 || ringsB.length === 0) return false;

  for (const rA of ringsA) {
    for (const rB of ringsB) {
      for (let i = 0; i < rA.length - 1; i++) {
        for (let j = 0; j < rB.length - 1; j++) {
          if (doLineSegmentsIntersect(rA[i], rA[i + 1], rB[j], rB[j + 1])) return true;
        }
      }
      if (isPointWithinGeoJsonGeometry({ lng: rA[0][0], lat: rA[0][1] }, polyB)) return true;
      if (isPointWithinGeoJsonGeometry({ lng: rB[0][0], lat: rB[0][1] }, polyA)) return true;
    }
  }
  return false;
}

export function doesPolygonContainPolygon(outerGeom: GeoJsonGeometry, innerGeom: GeoJsonGeometry): boolean {
  const innerRings = innerGeom.type === 'Polygon' ? [innerGeom.coordinates[0]] : innerGeom.type === 'MultiPolygon' ? innerGeom.coordinates.map((p) => p[0]) : [];
  if (innerRings.length === 0) return false;
  for (const ring of innerRings) {
    for (const pt of ring) {
      if (!isPointWithinGeoJsonGeometry({ lng: pt[0], lat: pt[1] }, outerGeom)) return false;
    }
  }
  return true;
}

export function paginateGeoItems<T>(items: readonly T[], rawLimit = 20, rawOffset = 0): PaginatedGeoEnvelope<T> {
  const limit = Math.min(Math.max(1, Math.floor(rawLimit)), MAX_BULK_SPATIAL_QUERY_LIMIT);
  const offset = Math.max(0, Math.floor(rawOffset));
  const slice = items.slice(offset, offset + limit);
  const hasMore = offset + limit < items.length;
  return {
    items: slice,
    totalCount: items.length,
    limit,
    offset,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}
