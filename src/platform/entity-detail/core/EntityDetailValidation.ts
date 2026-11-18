/**
 * @file src/platform/entity-detail/core/EntityDetailValidation.ts
 * @description Validates WGS84 coordinates, closed EPSG:4326 Polygons, geodesic area calculation, and privacy redaction (Stage 7).
 */

import type { EntityGeoPoint, NeighborhoodGeometry } from './EntityDetailTypes';

/**
 * Validates WGS84 latitude [-90, 90] and longitude [-180, 180].
 * Rejects (0, 0) or null/NaN so missing coordinates never default to Tehran!
 */
export function validateEntityGeoPoint(
  raw?: Partial<EntityGeoPoint> | null,
  canViewExactCoordinates = false
): EntityGeoPoint | null {
  if (!raw) return null;
  const { latitude, longitude, precision = 'neighborhood' } = raw;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  // Rule 5.3: Private exact coordinates must not be exposed to public users without authorization
  if (precision === 'exact' && !canViewExactCoordinates) {
    return {
      latitude: Number(latitude.toFixed(3)),
      longitude: Number(longitude.toFixed(3)),
      precision: 'neighborhood',
    };
  }

  return {
    latitude,
    longitude,
    precision,
  };
}

function isClosedValidRing(ring: number[][]): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) return false;
    const [lng, lat] = pt;
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return false;
    }
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

export function validateNeighborhoodGeometry(geom?: NeighborhoodGeometry | null): {
  valid: boolean;
  reason?: string;
} {
  if (!geom) return { valid: false, reason: 'MISSING_GEOMETRY' };
  if (geom.coordinateReferenceSystem !== 'EPSG:4326') {
    return { valid: false, reason: 'UNSUPPORTED_CRS' };
  }

  if (geom.type === 'Polygon') {
    const rings = geom.coordinates as number[][][];
    if (!Array.isArray(rings) || rings.length === 0) {
      return { valid: false, reason: 'EMPTY_POLYGON' };
    }
    for (const ring of rings) {
      if (!isClosedValidRing(ring)) {
        return { valid: false, reason: 'UNCLOSED_OR_OUT_OF_RANGE_RING' };
      }
    }
    return { valid: true };
  }

  if (geom.type === 'MultiPolygon') {
    const polys = geom.coordinates as number[][][][];
    if (!Array.isArray(polys) || polys.length === 0) {
      return { valid: false, reason: 'EMPTY_MULTIPOLYGON' };
    }
    for (const poly of polys) {
      if (!Array.isArray(poly) || poly.length === 0) return { valid: false, reason: 'EMPTY_POLYGON' };
      for (const ring of poly) {
        if (!isClosedValidRing(ring)) {
          return { valid: false, reason: 'UNCLOSED_OR_OUT_OF_RANGE_RING' };
        }
      }
    }
    return { valid: true };
  }

  return { valid: false, reason: 'INVALID_GEOMETRY_TYPE' };
}

/**
 * Computes geodesic spherical area of a closed EPSG:4326 Polygon in square kilometers (km²)
 * using WGS84 authalic radius (never planar degree-squared calculation!).
 */
export function computeGeodesicPolygonAreaSqKm(geom?: NeighborhoodGeometry | null): number | null {
  const check = validateNeighborhoodGeometry(geom);
  if (!check.valid || !geom) return null;

  const EARTH_RADIUS_METERS = 6_371_008.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  function ringAreaSqMeters(ring: number[][]): number {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [lng1, lat1] = ring[i];
      const [lng2, lat2] = ring[i + 1];
      sum += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
    }
    return Math.abs((sum * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2);
  }

  let totalSqMeters = 0;
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates as number[][][];
    totalSqMeters += ringAreaSqMeters(rings[0]);
    for (let i = 1; i < rings.length; i++) {
      totalSqMeters = Math.max(0, totalSqMeters - ringAreaSqMeters(rings[i]));
    }
  } else {
    const polys = geom.coordinates as number[][][][];
    for (const rings of polys) {
      let polyArea = ringAreaSqMeters(rings[0]);
      for (let i = 1; i < rings.length; i++) {
        polyArea = Math.max(0, polyArea - ringAreaSqMeters(rings[i]));
      }
      totalSqMeters += polyArea;
    }
  }

  return Number((totalSqMeters / 1_000_000).toFixed(4));
}
