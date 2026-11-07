/**
 * @file server/modules/geography/neighborhoods.ts
 * @description Canonical Neighborhood Registry and Spatial Metadata Loader.
 * Directly sources from existing project catalogs to preserve established identifiers and coordinates.
 */

import {
  CanonicalNeighborhood,
  GeoBoundingBox,
  GeoPoint,
  SupportedCityId,
} from './types';
import { CITY_PROVINCE_MAP } from './provinces';
import { MULTI_CITY_CONFIGS } from '../../../src/data/multiCityData';

export const NEIGHBORHOODS_DATASET_VERSION = 'v1.0.0-2026.11-reconciled';

/**
 * Calculates a bounding box from a center point and radius in meters.
 */
export function computeBoundingBox(center: GeoPoint | null, radiusMeters: number | null): GeoBoundingBox | null {
  if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number' || !radiusMeters || radiusMeters <= 0) {
    return null;
  }
  const latDelta = radiusMeters / 111320;
  const radLat = (center.lat * Math.PI) / 180;
  const lngDelta = radiusMeters / (111320 * Math.cos(radLat));

  return {
    minLat: Number((center.lat - latDelta).toFixed(6)),
    maxLat: Number((center.lat + latDelta).toFixed(6)),
    minLng: Number((center.lng - lngDelta).toFixed(6)),
    maxLng: Number((center.lng + lngDelta).toFixed(6)),
  };
}

/**
 * Parses municipal district numbers from Persian or Latin zone descriptions (e.g. "منطقه ۲").
 */
export function parseDistrictNumber(zone: string): number | null {
  if (!zone) return null;
  const match = zone.match(/منطقه\s*([۰-۹\d]+)/);
  if (!match) return null;
  const normalized = match[1].replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  const num = parseInt(normalized, 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Generates an ASCII-safe kebab slug from name and ID.
 */
function toSlug(nameFa: string, id: number): string {
  const ascii = nameFa
    .replace(/[^\u0600-\u06FF\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `hood-${id}-${encodeURIComponent(ascii).toLowerCase()}`;
}

/**
 * In-memory index of canonical neighborhoods keyed by composite ID (`${cityId}:${id}`).
 */
const CANONICAL_NEIGHBORHOODS_BY_COMPOSITE = new Map<string, CanonicalNeighborhood>();

/**
 * In-memory index of canonical neighborhoods grouped by cityId.
 */
const CANONICAL_NEIGHBORHOODS_BY_CITY = new Map<SupportedCityId, CanonicalNeighborhood[]>();

/**
 * In-memory index of canonical neighborhoods keyed by numeric ID (for fast lookups where unique).
 */
const CANONICAL_NEIGHBORHOODS_BY_ID = new Map<number, CanonicalNeighborhood[]>();

function buildCanonicalNeighborhoodRecords(): void {
  for (const [cityIdKey, cfg] of Object.entries(MULTI_CITY_CONFIGS)) {
    const cityId = cityIdKey as SupportedCityId;
    const provinceId = CITY_PROVINCE_MAP[cityId];
    const cityList: CanonicalNeighborhood[] = [];

    for (const raw of cfg.neighborhoods) {
      const hasValidCoords =
        typeof raw.lat === 'number' &&
        typeof raw.lng === 'number' &&
        !Number.isNaN(raw.lat) &&
        !Number.isNaN(raw.lng);

      const coordinates: GeoPoint | null = hasValidCoords ? { lat: raw.lat, lng: raw.lng } : null;
      const radiusMeters = typeof raw.radius === 'number' && raw.radius > 0 ? raw.radius : null;
      const boundingBox = computeBoundingBox(coordinates, radiusMeters);
      const districtNumber = parseDistrictNumber(raw.zone);
      const compositeId = `${cityId}:${raw.id}`;

      const canonical: CanonicalNeighborhood = {
        id: raw.id,
        compositeId,
        cityId,
        provinceId,
        nameFa: raw.name,
        slug: toSlug(raw.name, raw.id),
        zone: raw.zone,
        districtNumber,
        coordinates,
        boundary: {
          geometryType: hasValidCoords ? 'approximate_radius' : 'missing_coordinates',
          center: coordinates,
          radiusMeters,
          boundingBox,
          verifiedPolygonAvailable: false,
          sourceNote: 'Derived from verified project multi-city catalog center coordinates and radius.',
        },
        aliases: [],
        hierarchy: {
          country: 'IR',
          provinceId,
          cityId,
          districtNumber,
        },
        status: 'active',
        provenance: {
          datasetVersion: NEIGHBORHOODS_DATASET_VERSION,
          sourceCatalog: 'radartehran-multi-city-dataset-v2',
          verificationStatus: 'verified',
          lastVerifiedDate: '2026-11-07',
          reconciliationNotes: `Imported from verified repository catalog for ${cityId}.`,
        },
      };

      cityList.push(canonical);
      CANONICAL_NEIGHBORHOODS_BY_COMPOSITE.set(compositeId, canonical);

      const existingForId = CANONICAL_NEIGHBORHOODS_BY_ID.get(raw.id) || [];
      existingForId.push(canonical);
      CANONICAL_NEIGHBORHOODS_BY_ID.set(raw.id, existingForId);
    }

    CANONICAL_NEIGHBORHOODS_BY_CITY.set(cityId, cityList);
  }
}

// Initialize on module load
buildCanonicalNeighborhoodRecords();

/**
 * Retrieves a neighborhood by composite ID (`tehran:1`).
 */
export function getNeighborhoodByCompositeId(compositeId: string): CanonicalNeighborhood | null {
  return CANONICAL_NEIGHBORHOODS_BY_COMPOSITE.get(compositeId) || null;
}

/**
 * Retrieves a neighborhood by city ID and numeric ID.
 */
export function getNeighborhoodByCityAndId(cityId: SupportedCityId, hoodId: number): CanonicalNeighborhood | null {
  return CANONICAL_NEIGHBORHOODS_BY_COMPOSITE.get(`${cityId}:${hoodId}`) || null;
}

/**
 * Returns all neighborhoods belonging to a specific city.
 */
export function listNeighborhoodsByCity(cityId: SupportedCityId): CanonicalNeighborhood[] {
  return CANONICAL_NEIGHBORHOODS_BY_CITY.get(cityId) || [];
}

/**
 * Returns all canonical neighborhoods across all supported cities.
 */
export function listAllCanonicalNeighborhoods(): CanonicalNeighborhood[] {
  const all: CanonicalNeighborhood[] = [];
  for (const list of CANONICAL_NEIGHBORHOODS_BY_CITY.values()) {
    all.push(...list);
  }
  return all;
}

/**
 * Looks up neighborhoods by numeric ID.
 * Since numeric IDs might theoretically collide across future datasets, returns an array.
 */
export function getNeighborhoodsByNumericId(hoodId: number): CanonicalNeighborhood[] {
  return CANONICAL_NEIGHBORHOODS_BY_ID.get(hoodId) || [];
}
