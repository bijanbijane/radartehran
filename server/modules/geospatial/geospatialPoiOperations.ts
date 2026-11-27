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

export async function executeUpsertPointOfInterest(params: {
  input: UpsertPoiParams;
  poiStore: Map<string, PointOfInterestRecord>;
  poiDedupeIndex: Map<string, string>;
  nowIso: string;
  invalidateGeoCaches: (cityId: string) => void;
  persistRuntime: () => Promise<void>;
}): Promise<{ record: PointOfInterestRecord; isDuplicate: boolean }> {
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
    return { record: structuredClone(params.poiStore.get(existingId)!), isDuplicate: true };
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

  const previousRecord = params.poiStore.get(record.id);
  const previousDedupeOwner = params.poiDedupeIndex.get(dedupeKey);
  const previousRecordDedupeOwner = previousRecord
    ? params.poiDedupeIndex.get(previousRecord.dedupeKey)
    : undefined;
  if (previousDedupeOwner && previousDedupeOwner !== record.id) {
    throw new CoreApiError('CONFLICT', 409, 'POI deduplication key is already assigned to another record.');
  }

  params.poiStore.set(record.id, record);
  if (previousRecord && previousRecord.dedupeKey !== dedupeKey
      && params.poiDedupeIndex.get(previousRecord.dedupeKey) === record.id) {
    params.poiDedupeIndex.delete(previousRecord.dedupeKey);
  }
  params.poiDedupeIndex.set(dedupeKey, record.id);
  try {
    await params.persistRuntime();
  } catch (error) {
    if (previousRecord) params.poiStore.set(record.id, previousRecord);
    else params.poiStore.delete(record.id);
    if (previousDedupeOwner === undefined) params.poiDedupeIndex.delete(dedupeKey);
    else params.poiDedupeIndex.set(dedupeKey, previousDedupeOwner);
    if (previousRecord && previousRecordDedupeOwner !== undefined) {
      params.poiDedupeIndex.set(previousRecord.dedupeKey, previousRecordDedupeOwner);
    }
    throw error;
  }
  params.invalidateGeoCaches(record.cityId);
  if (previousRecord && previousRecord.cityId !== record.cityId) {
    params.invalidateGeoCaches(previousRecord.cityId);
  }
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