/**
 * @file server/modules/geography/provinces.ts
 * @description Canonical Province Registry and Relationships for Supported Metropolitan Regions.
 */

import { CanonicalProvince, ProvinceId, SupportedCityId } from './types';

export const PROVINCES_DATASET_VERSION = 'v1.0.0-2026.11';

export const CANONICAL_PROVINCES: Record<ProvinceId, CanonicalProvince> = {
  tehran: {
    id: 'tehran',
    nameFa: 'تهران',
    nameEn: 'Tehran',
    capitalFa: 'تهران',
    officialCode: 'IR-07',
    center: { lat: 35.735, lng: 51.395 },
    boundingBox: { minLat: 35.15, maxLat: 36.1, minLng: 50.8, maxLng: 52.85 },
    status: 'active',
    provenance: {
      datasetVersion: PROVINCES_DATASET_VERSION,
      sourceCatalog: 'official-iran-administrative-divisions',
      verificationStatus: 'verified',
      lastVerifiedDate: '2026-11-07',
      reconciliationNotes: 'Host province for Tehran metropolitan area and satellite counties.',
    },
  },
  alborz: {
    id: 'alborz',
    nameFa: 'البرز',
    nameEn: 'Alborz',
    capitalFa: 'کرج',
    officialCode: 'IR-30',
    center: { lat: 35.8327, lng: 50.9915 },
    boundingBox: { minLat: 35.6, maxLat: 36.4, minLng: 50.2, maxLng: 51.5 },
    status: 'active',
    provenance: {
      datasetVersion: PROVINCES_DATASET_VERSION,
      sourceCatalog: 'official-iran-administrative-divisions',
      verificationStatus: 'verified',
      lastVerifiedDate: '2026-11-07',
      reconciliationNotes: 'Host province for Karaj metropolitan and industrial suburban hub.',
    },
  },
  razavi_khorasan: {
    id: 'razavi_khorasan',
    nameFa: 'خراسان رضوی',
    nameEn: 'Razavi Khorasan',
    capitalFa: 'مشهد',
    officialCode: 'IR-09',
    center: { lat: 36.2972, lng: 59.6067 },
    boundingBox: { minLat: 33.8, maxLat: 37.8, minLng: 56.3, maxLng: 61.3 },
    status: 'active',
    provenance: {
      datasetVersion: PROVINCES_DATASET_VERSION,
      sourceCatalog: 'official-iran-administrative-divisions',
      verificationStatus: 'verified',
      lastVerifiedDate: '2026-11-07',
      reconciliationNotes: 'Host province for Mashhad spiritual & pilgrimage metropolis.',
    },
  },
  isfahan: {
    id: 'isfahan',
    nameFa: 'اصفهان',
    nameEn: 'Isfahan',
    capitalFa: 'اصفهان',
    officialCode: 'IR-10',
    center: { lat: 32.6539, lng: 51.666 },
    boundingBox: { minLat: 30.7, maxLat: 34.5, minLng: 49.6, maxLng: 55.2 },
    status: 'active',
    provenance: {
      datasetVersion: PROVINCES_DATASET_VERSION,
      sourceCatalog: 'official-iran-administrative-divisions',
      verificationStatus: 'verified',
      lastVerifiedDate: '2026-11-07',
      reconciliationNotes: 'Host province for Isfahan historical and industrial urban core.',
    },
  },
  fars: {
    id: 'fars',
    nameFa: 'فارس',
    nameEn: 'Fars',
    capitalFa: 'شیراز',
    officialCode: 'IR-14',
    center: { lat: 29.5918, lng: 52.5837 },
    boundingBox: { minLat: 27.0, maxLat: 31.8, minLng: 50.5, maxLng: 55.6 },
    status: 'active',
    provenance: {
      datasetVersion: PROVINCES_DATASET_VERSION,
      sourceCatalog: 'official-iran-administrative-divisions',
      verificationStatus: 'verified',
      lastVerifiedDate: '2026-11-07',
      reconciliationNotes: 'Host province for Shiraz cultural & medical hub in Southern Iran.',
    },
  },
};

export const CITY_PROVINCE_MAP: Record<SupportedCityId, ProvinceId> = {
  tehran: 'tehran',
  karaj: 'alborz',
  mashhad: 'razavi_khorasan',
  isfahan: 'isfahan',
  shiraz: 'fars',
};

/**
 * Retrieves a canonical province by ID.
 */
export function getProvinceById(provinceId: string): CanonicalProvince | null {
  if (Object.prototype.hasOwnProperty.call(CANONICAL_PROVINCES, provinceId)) {
    return CANONICAL_PROVINCES[provinceId as ProvinceId];
  }
  return null;
}

/**
 * Returns all registered canonical provinces.
 */
export function listCanonicalProvinces(): CanonicalProvince[] {
  return Object.values(CANONICAL_PROVINCES);
}

/**
 * Resolves the parent province for a given city ID.
 */
export function getProvinceForCity(cityId: SupportedCityId): CanonicalProvince {
  const provinceId = CITY_PROVINCE_MAP[cityId];
  return CANONICAL_PROVINCES[provinceId];
}
