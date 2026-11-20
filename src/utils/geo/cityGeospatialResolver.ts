/**
 * @file src/utils/geo/cityGeospatialResolver.ts
 * @description Pure deterministic geospatial city boundary resolver, strict city parameter validator,
 * canonical brand identity formatter, and city service-coverage matrix (zero React/UI imports).
 */
import type { CityId } from '../../types/models';

export const CANONICAL_BRAND_FA = 'رادارتهران' as const;
export const CANONICAL_BRAND_EN = 'RadarTehran' as const;
export const NAVIGATION_GEOMETRY_VERSION = 'nav-geom-2026.1' as const;

export const SUPPORTED_CITY_IDS: readonly CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const;

export const CITY_DISPLAY_NAMES: Record<CityId, { fa: string; en: string }> = {
  tehran: { fa: 'تهران', en: 'Tehran' },
  karaj: { fa: 'کرج', en: 'Karaj' },
  mashhad: { fa: 'مشهد', en: 'Mashhad' },
  isfahan: { fa: 'اصفهان', en: 'Isfahan' },
  shiraz: { fa: 'شیراز', en: 'Shiraz' },
};

export function formatBrandCityTitle(
  cityNameOrId?: string | null,
  locale: 'fa' | 'en' = 'fa',
): string {
  const trimmed = typeof cityNameOrId === 'string' ? cityNameOrId.trim() : '';
  const strictId = parseStrictCityId(trimmed);
  const cityLabel = strictId
    ? CITY_DISPLAY_NAMES[strictId][locale]
    : trimmed;
  const brand = locale === 'en' ? CANONICAL_BRAND_EN : CANONICAL_BRAND_FA;
  if (!cityLabel) return brand;
  return `${brand} | ${cityLabel}`;
}

export function parseStrictCityId(raw: unknown): CityId | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  return (SUPPORTED_CITY_IDS as readonly string[]).includes(normalized) ? (normalized as CityId) : null;
}

export interface StrictCityParamResult {
  ok: boolean;
  cityId?: CityId;
  wasOmitted?: boolean;
  code?: 'INVALID_CITY_ID' | 'MISSING_CITY_ID';
  rawValue?: string;
  messageFa?: string;
}

/**
 * Validates an explicit city parameter without ever silently coercing an unknown city to Tehran.
 * Only allows omitting the parameter when `allowOmittedDefault` is explicitly specified.
 */
export function resolveCityParamOrReject(
  raw: unknown,
  options?: { allowOmittedDefault?: CityId | null },
): StrictCityParamResult {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    if (options?.allowOmittedDefault) {
      return { ok: true, cityId: options.allowOmittedDefault, wasOmitted: true };
    }
    return {
      ok: false,
      code: 'MISSING_CITY_ID',
      rawValue: '',
      messageFa: 'شناسهٔ شهر در درخواست مشخص نشده است.',
    };
  }
  const parsed = parseStrictCityId(raw);
  if (!parsed) {
    const safeRaw = String(raw).trim().slice(0, 64);
    return {
      ok: false,
      code: 'INVALID_CITY_ID',
      rawValue: safeRaw,
      messageFa: `شهر درخواستی «${safeRaw}» پشتیبانی نمی‌شود.`,
    };
  }
  return { ok: true, cityId: parsed, wasOmitted: false };
}

export function validateCityNeighborhoodOwnership(
  cityId: CityId,
  hoodId: number,
  resolveOwnerCity: (id: number) => CityId | null,
): { ok: boolean; valid: boolean; ownerCityId: CityId | null; code?: 'UNKNOWN_NEIGHBORHOOD' | 'CITY_NEIGHBORHOOD_MISMATCH'; messageFa?: string } {
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999) {
    return { ok: false, valid: false, ownerCityId: null, code: 'UNKNOWN_NEIGHBORHOOD', messageFa: 'شناسه محله نامعتبر است.' };
  }
  const ownerCityId = resolveOwnerCity(hoodId);
  if (!ownerCityId) {
    return { ok: false, valid: false, ownerCityId: null, code: 'UNKNOWN_NEIGHBORHOOD', messageFa: 'محله درخواستی یافت نشد.' };
  }
  if (ownerCityId !== cityId) {
    return {
      ok: false,
      valid: false,
      ownerCityId,
      code: 'CITY_NEIGHBORHOOD_MISMATCH',
      messageFa: `محله انتخاب‌شده متعلق به شهر ${CITY_DISPLAY_NAMES[ownerCityId].fa} است و با شهر درخواستی (${CITY_DISPLAY_NAMES[cityId].fa}) همخوانی ندارد.`,
    };
  }
  return { ok: true, valid: true, ownerCityId };
}

/** GeoJSON coordinate tuple: [longitude, latitude] */
export type GeoPosition = readonly [number, number];
export type GeoLinearRing = readonly GeoPosition[];

export interface GeoPolygonGeometry {
  type: 'Polygon';
  coordinates: readonly GeoLinearRing[];
}

export interface GeoMultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: readonly (readonly GeoLinearRing[])[];
}

export type GeoBoundaryGeometry = GeoPolygonGeometry | GeoMultiPolygonGeometry;

export interface GeoBoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface CityNavigationGeometry {
  cityId: CityId;
  version: string;
  geometry: GeoBoundaryGeometry;
  bbox: GeoBoundingBox;
}

export function computeGeometryBbox(geometry: GeoBoundaryGeometry): GeoBoundingBox | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let pointCount = 0;

  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polygons) {
    if (!Array.isArray(poly) || poly.length === 0) return null;
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 4) return null;
      for (const pos of ring) {
        if (!Array.isArray(pos) || pos.length < 2) return null;
        const lng = pos[0];
        const lat = pos[1];
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return null;
        }
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        pointCount += 1;
      }
    }
  }
  return pointCount >= 4 ? { minLng, minLat, maxLng, maxLat } : null;
}

export function isValidLinearRing(ring: GeoLinearRing): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) return false;
    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return false;
    if (pt[1] < -90 || pt[1] > 90 || pt[0] < -180 || pt[0] > 180) return false;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

export function isValidBoundaryGeometry(geometry: GeoBoundaryGeometry | null | undefined): boolean {
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0) return false;
  for (const poly of polygons) {
    if (!Array.isArray(poly) || poly.length === 0) return false;
    for (const ring of poly) {
      if (!isValidLinearRing(ring)) return false;
    }
  }
  return true;
}

const EDGE_EPSILON = 1e-10;

function isPointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const cross = (py - ay) * (bx - ax) - (px - ax) * (by - ay);
  if (Math.abs(cross) > EDGE_EPSILON) return false;
  const minX = Math.min(ax, bx) - EDGE_EPSILON;
  const maxX = Math.max(ax, bx) + EDGE_EPSILON;
  const minY = Math.min(ay, by) - EDGE_EPSILON;
  const maxY = Math.max(ay, by) + EDGE_EPSILON;
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function pointToSegmentDistanceDeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function minDistanceToRingDeg(lng: number, lat: number, ring: GeoLinearRing): number {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const d = pointToSegmentDistanceDeg(lng, lat, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

export function isPointInRing(lng: number, lat: number, ring: GeoLinearRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (isPointOnSegment(lng, lat, xi, yi, xj, yj)) return true;
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isPointInPolygonRings(lng: number, lat: number, rings: readonly GeoLinearRing[]): boolean {
  if (rings.length === 0) return false;
  if (!isPointInRing(lng, lat, rings[0])) return false;
  for (let h = 1; h < rings.length; h += 1) {
    const hole = rings[h];
    // Points strictly inside a hole are excluded; points on the hole rim remain inside.
    let onHoleEdge = false;
    for (let i = 0; i < hole.length - 1; i += 1) {
      if (isPointOnSegment(lng, lat, hole[i][0], hole[i][1], hole[i + 1][0], hole[i + 1][1])) {
        onHoleEdge = true;
        break;
      }
    }
    if (!onHoleEdge && isPointInRing(lng, lat, hole)) return false;
  }
  return true;
}

export function isPointInGeometry(lng: number, lat: number, geometry: GeoBoundaryGeometry): boolean {
  if (geometry.type === 'Polygon') {
    return isPointInPolygonRings(lng, lat, geometry.coordinates);
  }
  return geometry.coordinates.some((polyRings) => isPointInPolygonRings(lng, lat, polyRings));
}

function distanceToGeometryOuterBoundaryDeg(lng: number, lat: number, geometry: GeoBoundaryGeometry): number {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let best = Infinity;
  for (const poly of polygons) {
    if (poly.length > 0) {
      const d = minDistanceToRingDeg(lng, lat, poly[0]);
      if (d < best) best = d;
    }
  }
  return best;
}

function buildCityNavGeometry(cityId: CityId, geometry: GeoBoundaryGeometry): CityNavigationGeometry {
  const bbox = computeGeometryBbox(geometry);
  if (!bbox) {
    throw new Error(`INVALID_CITY_NAVIGATION_GEOMETRY:${cityId}`);
  }
  return { cityId, version: NAVIGATION_GEOMETRY_VERSION, geometry, bbox };
}

/**
 * Authoritative non-overlapping metropolitan NavigationGeometry boundaries (GeoJSON [lng, lat]).
 * Tehran western edge stops at lng 51.11; Karaj eastern edge stops at lng 51.08 so borders never overlap.
 */
export const CITY_NAVIGATION_GEOMETRIES: readonly CityNavigationGeometry[] = [
  buildCityNavGeometry('tehran', { type: 'Polygon', coordinates: [[[51.11, 35.53], [51.64, 35.53], [51.64, 35.86], [51.11, 35.86], [51.11, 35.53]]] }),
  buildCityNavGeometry('karaj', { type: 'Polygon', coordinates: [[[50.74, 35.66], [51.08, 35.66], [51.08, 35.93], [50.74, 35.93], [50.74, 35.66]]] }),
  buildCityNavGeometry('mashhad', { type: 'Polygon', coordinates: [[[59.35, 36.15], [59.78, 36.15], [59.78, 36.47], [59.35, 36.47], [59.35, 36.15]]] }),
  buildCityNavGeometry('isfahan', { type: 'Polygon', coordinates: [[[51.48, 32.50], [51.86, 32.50], [51.86, 32.82], [51.48, 32.82], [51.48, 32.50]]] }),
  buildCityNavGeometry('shiraz', { type: 'Polygon', coordinates: [[[52.34, 29.46], [52.72, 29.46], [52.72, 29.79], [52.34, 29.79], [52.34, 29.46]]] }),
];

export interface CityResolutionResult {
  status: 'resolved' | 'outside_city_boundaries' | 'ambiguous' | 'invalid_coordinates' | 'invalid_geometry';
  cityId: CityId | null;
  matchedVia?: 'polygon' | 'hysteresis_hold';
  geometryVersion: string;
  switchedFromCurrent?: boolean;
  candidateCityIds?: CityId[];
}

/**
 * Deterministically resolves a geographic point (lat, lng) against NavigationGeometry polygons.
 * Never falls back to Tehran and never picks a nearest city outside all polygons.
 */
export function resolveCityFromCoordinates(
  lat: number,
  lng: number,
  options?: {
    currentCityId?: CityId | null;
    hysteresisMarginDeg?: number;
    geometries?: readonly CityNavigationGeometry[];
  },
): CityResolutionResult {
  const geometries = options?.geometries ?? CITY_NAVIGATION_GEOMETRIES;
  const version = geometries[0]?.version || NAVIGATION_GEOMETRY_VERSION;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { status: 'invalid_coordinates', cityId: null, geometryVersion: version };
  }
  if (!Array.isArray(geometries) || geometries.length === 0) {
    return { status: 'invalid_geometry', cityId: null, geometryVersion: version };
  }

  const matchedCities: CityId[] = [];
  for (const entry of geometries) {
    if (!isValidBoundaryGeometry(entry.geometry)) {
      return { status: 'invalid_geometry', cityId: null, geometryVersion: entry.version || version };
    }
    const { minLng, maxLng, minLat, maxLat } = entry.bbox;
    if (lng < minLng - EDGE_EPSILON || lng > maxLng + EDGE_EPSILON || lat < minLat - EDGE_EPSILON || lat > maxLat + EDGE_EPSILON) {
      continue;
    }
    if (isPointInGeometry(lng, lat, entry.geometry)) {
      matchedCities.push(entry.cityId);
    }
  }

  if (matchedCities.length > 1) {
    return { status: 'ambiguous', cityId: null, candidateCityIds: matchedCities, geometryVersion: version };
  }

  const currentCityId = options?.currentCityId ?? null;
  const hysteresisMarginDeg = options?.hysteresisMarginDeg ?? 0.008; // ~850m border stability band

  if (matchedCities.length === 1) {
    const targetCity = matchedCities[0];
    if (currentCityId && targetCity !== currentCityId && hysteresisMarginDeg > 0) {
      const currentGeom = geometries.find((g) => g.cityId === currentCityId);
      if (currentGeom) {
        const distFromCurrent = distanceToGeometryOuterBoundaryDeg(lng, lat, currentGeom.geometry);
        if (distFromCurrent <= hysteresisMarginDeg) {
          return {
            status: 'resolved',
            cityId: currentCityId,
            matchedVia: 'hysteresis_hold',
            geometryVersion: version,
            switchedFromCurrent: false,
          };
        }
      }
    }
    return {
      status: 'resolved',
      cityId: targetCity,
      matchedVia: 'polygon',
      geometryVersion: version,
      switchedFromCurrent: Boolean(currentCityId && targetCity !== currentCityId),
    };
  }

  if (currentCityId && hysteresisMarginDeg > 0) {
    const currentGeom = geometries.find((g) => g.cityId === currentCityId);
    if (currentGeom && distanceToGeometryOuterBoundaryDeg(lng, lat, currentGeom.geometry) <= hysteresisMarginDeg) {
      return {
        status: 'resolved',
        cityId: currentCityId,
        matchedVia: 'hysteresis_hold',
        geometryVersion: version,
        switchedFromCurrent: false,
      };
    }
  }

  return { status: 'outside_city_boundaries', cityId: null, geometryVersion: version };
}

export type CityCapabilityAvailability =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'NO_DATA'
  | 'INSUFFICIENT_DATA'
  | 'NOT_SUPPORTED'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'ERROR';

export interface CityServiceCoverageProfile {
  cityId: CityId;
  geographicallyRecognized: boolean;
  capabilities: {
    neighborhoodIndex: CityCapabilityAvailability;
    hedonicValuation: CityCapabilityAvailability;
    trafficZones: CityCapabilityAvailability;
    airQualityStations: CityCapabilityAvailability;
    metroNetwork: CityCapabilityAvailability;
    liveListings: CityCapabilityAvailability;
  };
}

const CITY_SERVICE_COVERAGE_MAP: Record<CityId, CityServiceCoverageProfile> = {
  tehran: { cityId: 'tehran', geographicallyRecognized: true, capabilities: { neighborhoodIndex: 'AVAILABLE', hedonicValuation: 'AVAILABLE', trafficZones: 'AVAILABLE', airQualityStations: 'AVAILABLE', metroNetwork: 'AVAILABLE', liveListings: 'AVAILABLE' } },
  karaj: { cityId: 'karaj', geographicallyRecognized: true, capabilities: { neighborhoodIndex: 'AVAILABLE', hedonicValuation: 'AVAILABLE', trafficZones: 'NOT_SUPPORTED', airQualityStations: 'PARTIAL', metroNetwork: 'PARTIAL', liveListings: 'PARTIAL' } },
  mashhad: { cityId: 'mashhad', geographicallyRecognized: true, capabilities: { neighborhoodIndex: 'AVAILABLE', hedonicValuation: 'AVAILABLE', trafficZones: 'NOT_SUPPORTED', airQualityStations: 'PARTIAL', metroNetwork: 'AVAILABLE', liveListings: 'PARTIAL' } },
  isfahan: { cityId: 'isfahan', geographicallyRecognized: true, capabilities: { neighborhoodIndex: 'AVAILABLE', hedonicValuation: 'AVAILABLE', trafficZones: 'NOT_SUPPORTED', airQualityStations: 'PARTIAL', metroNetwork: 'PARTIAL', liveListings: 'PARTIAL' } },
  shiraz: { cityId: 'shiraz', geographicallyRecognized: true, capabilities: { neighborhoodIndex: 'AVAILABLE', hedonicValuation: 'AVAILABLE', trafficZones: 'NOT_SUPPORTED', airQualityStations: 'PARTIAL', metroNetwork: 'PARTIAL', liveListings: 'PARTIAL' } },
};

export function getCityServiceCoverage(cityId: CityId): CityServiceCoverageProfile {
  return CITY_SERVICE_COVERAGE_MAP[cityId];
}
