import crypto from 'crypto';
import { CoreApiError } from '../core';
import { calculateGeodesicDistanceMeters, normalizeAndValidateCoordinate } from './coordinateAndPolygonEngine';
import { computePoiDedupeKey } from './poiAndSpatialSearchEngine';
import type { PoiCategory, PointOfInterestRecord, Wgs84Coordinate } from './types';

export type UpsertPoiParams = {
  id?: string;
  nameFa: string;
  nameEn?: string;
  category: PoiCategory;
  coordinates: Wgs84Coordinate;
  cityId: string;
  districtId?: string;
  hoodId?: number;
  sourceProvenance: string;
  verificationStatus?: PointOfInterestRecord['verificationStatus'];
  publicVisible?: boolean;
  attributes?: Record<string, string | number | boolean>;
};

export function executeUpsertPointOfInterest(params: {
  input: UpsertPoiParams;
  poiStore: Map<string, PointOfInterestRecord>;
  poiDedupeIndex: Map<string, string>;
  nowIso: string;
  invalidateGeoCaches: (cityId: string) => void;
  persistRuntime: () => void;
}): { record: PointOfInterestRecord; isDuplicate: boolean } {
  const coordCheck = normalizeAndValidateCoordinate(params.input.coordinates.lat, params.input.coordinates.lng);
  if (!coordCheck.valid || !coordCheck.coordinate) {
    throw new CoreApiError('VALIDATION_FAILED', 400, coordCheck.errorMessage ?? 'Invalid POI coordinates.');
  }

  const dedupeKey = computePoiDedupeKey({
    cityId: params.input.cityId,
    category: params.input.category,
    nameFa: params.input.nameFa,
    coordinates: coordCheck.coordinate,
  });

  const existingId = params.poiDedupeIndex.get(dedupeKey);
  if (existingId && params.poiStore.has(existingId)) {
    return {
      record: structuredClone(params.poiStore.get(existingId)!),
      isDuplicate: true,
    };
  }

  const record: PointOfInterestRecord = {
    id: params.input.id ?? `poi_${crypto.randomBytes(6).toString('hex')}`,
    nameFa: params.input.nameFa.trim(),
    nameEn: params.input.nameEn?.trim(),
    category: params.input.category,
    coordinates: coordCheck.coordinate,
    cityId: params.input.cityId,
    districtId: params.input.districtId,
    hoodId: params.input.hoodId,
    sourceProvenance: params.input.sourceProvenance,
    verificationStatus: params.input.verificationStatus ?? 'PENDING_REVIEW',
    publicVisible: params.input.publicVisible ?? false,
    attributes: params.input.attributes ?? {},
    lastValidatedAtIso: params.nowIso,
    dedupeKey,
  };

  params.poiStore.set(record.id, record);
  params.poiDedupeIndex.set(dedupeKey, record.id);
  params.invalidateGeoCaches(record.cityId);
  params.persistRuntime();
  return { record: structuredClone(record), isDuplicate: false };
}

export function executeFindNearbyPointsOfInterest(params: {
  cityId: string;
  center: Wgs84Coordinate;
  radiusMeters: number;
  categories?: PoiCategory[];
  includeUnverifiedOrPrivate?: boolean;
  poiStore: Map<string, PointOfInterestRecord>;
}): Array<PointOfInterestRecord & { distanceMeters: number; distanceUnit: 'meters' }> {
  if (params.radiusMeters <= 0 || params.radiusMeters > 25_000) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'radiusMeters must be between 1 and 25000.');
  }
  const results: Array<PointOfInterestRecord & { distanceMeters: number; distanceUnit: 'meters' }> = [];
  for (const poi of params.poiStore.values()) {
    if (poi.cityId !== params.cityId) continue;
    if (
      !params.includeUnverifiedOrPrivate &&
      (!poi.publicVisible || poi.verificationStatus !== 'VERIFIED')
    ) {
      continue;
    }
    if (params.categories && params.categories.length > 0 && !params.categories.includes(poi.category)) {
      continue;
    }
    const dist = calculateGeodesicDistanceMeters(params.center, poi.coordinates);
    if (dist <= params.radiusMeters) {
      results.push({
        ...structuredClone(poi),
        distanceMeters: dist,
        distanceUnit: 'meters',
      });
    }
  }
  results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return results;
}