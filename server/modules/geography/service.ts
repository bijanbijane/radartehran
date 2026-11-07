/**
 * @file server/modules/geography/service.ts
 * @description Geographic Reference Data Service & Query Interfaces for Downstream Modules.
 * Exposes robust city/neighborhood lookups, validation, hierarchy traversal, and spatial queries.
 */

import {
  AdministrativeHierarchy,
  CanonicalCity,
  CanonicalNeighborhood,
  CanonicalProvince,
  CityNeighborhoodValidationResult,
  GeoBoundingBox,
  GeoLookupQuery,
  NameResolutionResult,
  SupportedCityId,
} from './types';
import { CANONICAL_PROVINCES, getProvinceById, getProvinceForCity } from './provinces';
import {
  CANONICAL_CITIES,
  getCityByIdOrName,
  isSupportedCityId,
  listCanonicalCities,
} from './cities';
import {
  getNeighborhoodByCityAndId,
  getNeighborhoodByCompositeId,
  getNeighborhoodsByNumericId,
  listAllCanonicalNeighborhoods,
  listNeighborhoodsByCity,
} from './neighborhoods';
import { findMatchingAliases, normalizePersianText } from './aliases';

/**
 * Calculates Great-Circle distance in kilometers between two points using the Haversine formula.
 */
export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(3));
}

export class GeographicReferenceService {
  /**
   * Retrieves a supported city by ID, name, or slug.
   */
  public getCity(cityIdOrName: string): CanonicalCity | null {
    return getCityByIdOrName(cityIdOrName);
  }

  /**
   * Lists all supported canonical cities.
   */
  public listCities(): CanonicalCity[] {
    return listCanonicalCities();
  }

  /**
   * Retrieves a province by ID.
   */
  public getProvince(provinceId: string): CanonicalProvince | null {
    return getProvinceById(provinceId);
  }

  /**
   * Lists all canonical provinces.
   */
  public listProvinces(): CanonicalProvince[] {
    return Object.values(CANONICAL_PROVINCES);
  }

  /**
   * Retrieves a neighborhood by city ID and numeric ID.
   */
  public getNeighborhood(cityId: SupportedCityId, hoodId: number): CanonicalNeighborhood | null {
    return getNeighborhoodByCityAndId(cityId, hoodId);
  }

  /**
   * Retrieves a neighborhood by global composite ID (`${cityId}:${hoodId}`).
   */
  public getNeighborhoodByCompositeId(compositeId: string): CanonicalNeighborhood | null {
    return getNeighborhoodByCompositeId(compositeId);
  }

  /**
   * Validates whether a neighborhood belongs to a specified city.
   */
  public validateCityNeighborhood(cityIdCandidate: unknown, hoodIdCandidate: unknown): CityNeighborhoodValidationResult {
    if (!isSupportedCityId(cityIdCandidate)) {
      return {
        valid: false,
        cityId: null,
        hoodId: typeof hoodIdCandidate === 'number' ? hoodIdCandidate : null,
        reasonCode: 'CITY_NOT_SUPPORTED',
        errorMessage: `City identifier '${String(cityIdCandidate)}' is not in the supported cities registry.`,
      };
    }

    const cityId = cityIdCandidate as SupportedCityId;
    const hoodId = Number(hoodIdCandidate);

    if (!Number.isSafeInteger(hoodId) || hoodId <= 0) {
      return {
        valid: false,
        cityId,
        hoodId: null,
        reasonCode: 'INVALID_IDENTIFIER_FORMAT',
        errorMessage: `Neighborhood ID must be a positive integer, got '${String(hoodIdCandidate)}'.`,
      };
    }

    const neighborhood = getNeighborhoodByCityAndId(cityId, hoodId);
    if (neighborhood) {
      return {
        valid: true,
        cityId,
        hoodId,
        reasonCode: 'VALID',
        neighborhood,
      };
    }

    // Check if the neighborhood exists in a different city
    const otherMatches = getNeighborhoodsByNumericId(hoodId);
    if (otherMatches.length > 0) {
      const actualCity = otherMatches[0].cityId;
      return {
        valid: false,
        cityId,
        hoodId,
        reasonCode: 'HOOD_DOES_NOT_BELONG_TO_CITY',
        suggestedCityId: actualCity,
        errorMessage: `Neighborhood #${hoodId} (${otherMatches[0].nameFa}) belongs to city '${actualCity}', not '${cityId}'.`,
      };
    }

    return {
      valid: false,
      cityId,
      hoodId,
      reasonCode: 'HOOD_NOT_FOUND',
      errorMessage: `Neighborhood #${hoodId} does not exist in any catalog.`,
    };
  }

  /**
   * Resolves the full administrative parent-child hierarchy for a neighborhood.
   */
  public getNeighborhoodHierarchy(cityId: SupportedCityId, hoodId: number): AdministrativeHierarchy | null {
    const neighborhood = getNeighborhoodByCityAndId(cityId, hoodId);
    if (!neighborhood) return null;

    const city = CANONICAL_CITIES[cityId];
    const province = getProvinceForCity(cityId);

    return {
      country: { code: 'IR', nameFa: 'ایران' },
      province,
      city,
      district: {
        districtNumber: neighborhood.districtNumber,
        zoneLabel: neighborhood.zone,
      },
      neighborhood,
    };
  }

  /**
   * Resolves neighborhood names or aliases with ambiguity detection.
   */
  public resolveAmbiguousName(query: string, preferredCityId?: SupportedCityId): NameResolutionResult {
    const norm = normalizePersianText(query);
    if (!norm) {
      return { resolved: false, isAmbiguous: false, candidates: [] };
    }

    const candidates: NameResolutionResult['candidates'] = [];
    const allHoods = preferredCityId ? listNeighborhoodsByCity(preferredCityId) : listAllCanonicalNeighborhoods();

    // 1. Direct name match
    for (const h of allHoods) {
      const hNorm = normalizePersianText(h.nameFa);
      if (hNorm === norm) {
        candidates.push({ neighborhood: h, matchType: 'exact_name', confidence: 1.0 });
      }
    }

    // 2. Alias match
    const aliasMatches = findMatchingAliases(query);
    for (const a of aliasMatches) {
      if (preferredCityId && a.targetCityId !== preferredCityId) continue;
      const targetHood = getNeighborhoodByCityAndId(a.targetCityId, a.targetHoodId);
      if (targetHood && !candidates.some((c) => c.neighborhood.compositeId === targetHood.compositeId)) {
        candidates.push({ neighborhood: targetHood, matchType: 'alias', confidence: 0.95 });
      }
    }

    // 3. Partial normalized match if no direct matches
    if (candidates.length === 0) {
      for (const h of allHoods) {
        const hNorm = normalizePersianText(h.nameFa);
        if (hNorm.includes(norm) || norm.includes(hNorm)) {
          candidates.push({ neighborhood: h, matchType: 'normalized', confidence: 0.75 });
        }
      }
    }

    const isAmbiguous = candidates.length > 1;
    return {
      resolved: candidates.length > 0,
      isAmbiguous,
      candidates,
    };
  }

  /**
   * Searches neighborhoods by query parameters (city, district, text, bbox).
   */
  public findNeighborhoods(query: GeoLookupQuery): CanonicalNeighborhood[] {
    let pool: CanonicalNeighborhood[] = query.cityId
      ? listNeighborhoodsByCity(query.cityId)
      : listAllCanonicalNeighborhoods();

    if (typeof query.districtNumber === 'number') {
      pool = pool.filter((h) => h.districtNumber === query.districtNumber);
    }

    if (query.boundingBox) {
      const bbox = query.boundingBox;
      pool = pool.filter((h) => {
        if (!h.coordinates) return false;
        return (
          h.coordinates.lat >= bbox.minLat &&
          h.coordinates.lat <= bbox.maxLat &&
          h.coordinates.lng >= bbox.minLng &&
          h.coordinates.lng <= bbox.maxLng
        );
      });
    }

    if (query.query && query.query.trim()) {
      const normQuery = normalizePersianText(query.query);
      pool = pool.filter((h) => {
        if (normalizePersianText(h.nameFa).includes(normQuery)) return true;
        if (h.zone && normalizePersianText(h.zone).includes(normQuery)) return true;
        return false;
      });
    }

    if (query.limit && query.limit > 0) {
      return pool.slice(0, query.limit);
    }

    return pool;
  }

  /**
   * Finds the nearest neighborhood to given coordinates.
   * Gracefully ignores records with missing coordinates.
   */
  public findNearestNeighborhood(
    lat: number,
    lng: number,
    cityId?: SupportedCityId
  ): { neighborhood: CanonicalNeighborhood; distanceKm: number } | null {
    if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
      return null;
    }

    const pool = cityId ? listNeighborhoodsByCity(cityId) : listAllCanonicalNeighborhoods();
    let bestMatch: CanonicalNeighborhood | null = null;
    let minDistance = Infinity;

    for (const h of pool) {
      if (!h.coordinates) continue; // Skip records with missing coordinates safely
      const dist = calculateHaversineDistanceKm(lat, lng, h.coordinates.lat, h.coordinates.lng);
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = h;
      }
    }

    if (!bestMatch) return null;
    return { neighborhood: bestMatch, distanceKm: minDistance };
  }

  /**
   * Spatial query: Finds all neighborhoods whose center points fall within the bounding box.
   */
  public findNeighborhoodsInBoundingBox(bbox: GeoBoundingBox, cityId?: SupportedCityId): CanonicalNeighborhood[] {
    return this.findNeighborhoods({ cityId, boundingBox: bbox });
  }
}

export const defaultGeographicService = new GeographicReferenceService();
