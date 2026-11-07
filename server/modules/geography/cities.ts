/**
 * @file server/modules/geography/cities.ts
 * @description Canonical City Registry for Initial Supported Cities (Tehran, Karaj, Mashhad, Isfahan, Shiraz).
 */

import { CanonicalCity, SupportedCityId, ProvinceId } from './types';
import { CITY_PROVINCE_MAP, PROVINCES_DATASET_VERSION } from './provinces';

export const CITIES_DATASET_VERSION = 'v1.0.0-2026.11';

export const SUPPORTED_CITY_IDS: readonly SupportedCityId[] = [
  'tehran',
  'karaj',
  'mashhad',
  'isfahan',
  'shiraz',
] as const;

export const CANONICAL_CITIES: Record<SupportedCityId, CanonicalCity> = {
  tehran: {
    id: 'tehran',
    provinceId: CITY_PROVINCE_MAP.tehran,
    nameFa: 'تهران',
    nameEn: 'Tehran',
    slug: 'tehran',
    officialCode: 'THR-01',
    center: { lat: 35.735, lng: 51.395 },
    defaultZoom: 12,
    boundingBox: { minLat: 35.5, maxLat: 35.88, minLng: 51.15, maxLng: 51.65 },
    neighborhoodCount: 80,
    municipalDistrictsCount: 22,
    status: 'active',
    provenance: {
      datasetVersion: CITIES_DATASET_VERSION,
      sourceCatalog: 'radartehran-multi-city-dataset-v2',
      verificationStatus: 'verified',
      lastVerifiedDate: '2026-11-07',
      reconciliationNotes: 'Tehran municipality (Districts 1-22) plus satellite county centers.',
    },
  },
  karaj: {
    id: 'karaj',
    provinceId: CITY_PROVINCE_MAP.karaj,
    nameFa: 'کرج',
    nameEn: 'Karaj',
    slug: 'karaj',
    officialCode: 'KRJ-01',
    center: { lat: 35.8327, lng: 50.9915 },
    defaultZoom: 12,
    boundingBox: { minLat: 35.7, maxLat: 35.95, minLng: 50.8, maxLng: 51.15 },
    neighborhoodCount: 55,
    municipalDistrictsCount: 10,
    status: 'active',
    provenance: {
      datasetVersion: CITIES_DATASET_VERSION,
      sourceCatalog: 'radartehran-multi-city-dataset-v2',
      verificationStatus: 'verified',
      lastVerifiedDate: '2026-11-07',
      reconciliationNotes: 'Alborz capital metropolitan districts and suburban expansions.',
    },
  },
  mashhad: {
    id: 'mashhad',
    provinceId: CITY_PROVINCE_MAP.mashhad,
    nameFa: 'مشهد',
    nameEn: 'Mashhad',
    slug: 'mashhad',
    officialCode: 'MSH-01',
    center: { lat: 36.2972, lng: 59.6067 },
    defaultZoom: 12,
    boundingBox: { minLat: 36.18, maxLat: 36.42, minLng: 59.4, maxLng: 59.78 },
    neighborhoodCount: 40,
    municipalDistrictsCount: 13,
    status: 'active',
    provenance: {
      datasetVersion: CITIES_DATASET_VERSION,
      sourceCatalog: 'radartehran-multi-city-dataset-v2',
      verificationStatus: 'verified',
      lastVerifiedDate: '2026-11-07',
      reconciliationNotes: 'Razavi Khorasan capital metropolitan districts.',
    },
  },
  isfahan: {
    id: 'isfahan',
    provinceId: CITY_PROVINCE_MAP.isfahan,
    nameFa: 'اصفهان',
    nameEn: 'Isfahan',
    slug: 'isfahan',
    officialCode: 'ISF-01',
    center: { lat: 32.6539, lng: 51.666 },
    defaultZoom: 12,
    boundingBox: { minLat: 32.55, maxLat: 32.75, minLng: 51.55, maxLng: 51.78 },
    neighborhoodCount: 45,
    municipalDistrictsCount: 15,
    status: 'active',
    provenance: {
      datasetVersion: CITIES_DATASET_VERSION,
      sourceCatalog: 'radartehran-multi-city-dataset-v2',
      verificationStatus: 'verified',
      lastVerifiedDate: '2026-11-07',
      reconciliationNotes: 'Isfahan historical and Zayandeh-Rood northern/southern districts.',
    },
  },
  shiraz: {
    id: 'shiraz',
    provinceId: CITY_PROVINCE_MAP.shiraz,
    nameFa: 'شیراز',
    nameEn: 'Shiraz',
    slug: 'shiraz',
    officialCode: 'SHR-01',
    center: { lat: 29.5918, lng: 52.5837 },
    defaultZoom: 12,
    boundingBox: { minLat: 29.5, maxLat: 29.75, minLng: 52.4, maxLng: 52.65 },
    neighborhoodCount: 45,
    municipalDistrictsCount: 11,
    status: 'active',
    provenance: {
      datasetVersion: CITIES_DATASET_VERSION,
      sourceCatalog: 'radartehran-multi-city-dataset-v2',
      verificationStatus: 'verified',
      lastVerifiedDate: '2026-11-07',
      reconciliationNotes: 'Fars capital cultural and residential districts.',
    },
  },
};

/**
 * Checks if a given string is a supported city ID.
 */
export function isSupportedCityId(candidate: unknown): candidate is SupportedCityId {
  return typeof candidate === 'string' && Object.prototype.hasOwnProperty.call(CANONICAL_CITIES, candidate);
}

/**
 * Retrieves a canonical city by ID or name (Persian or English).
 */
export function getCityByIdOrName(query: string): CanonicalCity | null {
  const normalized = query.trim().toLowerCase();
  if (isSupportedCityId(normalized)) {
    return CANONICAL_CITIES[normalized];
  }
  for (const city of Object.values(CANONICAL_CITIES)) {
    if (
      city.nameFa === query.trim() ||
      city.nameEn.toLowerCase() === normalized ||
      city.slug === normalized ||
      city.officialCode.toLowerCase() === normalized
    ) {
      return city;
    }
  }
  return null;
}

/**
 * Returns all supported canonical cities.
 */
export function listCanonicalCities(): CanonicalCity[] {
  return Object.values(CANONICAL_CITIES);
}

/**
 * Returns cities situated within a specific province.
 */
export function getCitiesByProvinceId(provinceId: ProvinceId): CanonicalCity[] {
  return Object.values(CANONICAL_CITIES).filter((city) => city.provinceId === provinceId);
}
