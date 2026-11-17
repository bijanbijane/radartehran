import { IRAN_VALID_BOUNDS, TEHRAN_METROPOLITAN_BOUNDS } from './GeoConfig';
import { isPointInBoundingBox } from './GeoBounds';
import { GeoTuple, LatLngPoint } from './GeoTypes';

export interface CoordinateValidationResult {
  valid: boolean;
  reason?: 'NON_FINITE' | 'ZERO_COORDINATE' | 'OUT_OF_WGS84_RANGE' | 'SWAPPED_LAT_LNG';
  normalized?: LatLngPoint;
}

export function validateCoordinate(lat: unknown, lng: unknown): CoordinateValidationResult {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, reason: 'NON_FINITE' };
  }

  if (lat === 0 && lng === 0) {
    return { valid: false, reason: 'ZERO_COORDINATE' };
  }

  // Detect swapped [lng, lat] for Iran/Tehran (e.g., lat ~ 51.3, lng ~ 35.7)
  if (lat >= 44 && lat <= 64 && lng >= 24 && lng <= 40) {
    return {
      valid: false,
      reason: 'SWAPPED_LAT_LNG',
      normalized: { lat: lng, lng: lat },
    };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, reason: 'OUT_OF_WGS84_RANGE' };
  }

  return {
    valid: true,
    normalized: { lat, lng },
  };
}

export function isWithinTehranBounds(point: LatLngPoint): boolean {
  return isPointInBoundingBox(point, TEHRAN_METROPOLITAN_BOUNDS);
}

export function isWithinIranBounds(point: LatLngPoint): boolean {
  return isPointInBoundingBox(point, IRAN_VALID_BOUNDS);
}

export function normalizeGeoTuple(tuple: readonly [number, number]): LatLngPoint | null {
  const res = validateCoordinate(tuple[0], tuple[1]);
  if (res.valid && res.normalized) return res.normalized;
  if (res.reason === 'SWAPPED_LAT_LNG' && res.normalized) return res.normalized;
  return null;
}

export function toLeafletTuple(point: LatLngPoint): GeoTuple {
  return [point.lat, point.lng];
}

export function toGeoJsonPosition(point: LatLngPoint): [number, number] {
  return [point.lng, point.lat];
}
