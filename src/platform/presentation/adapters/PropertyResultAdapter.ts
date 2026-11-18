/**
 * @file src/platform/presentation/adapters/PropertyResultAdapter.ts
 * @description Adapts raw Property records to canonical ResultItem (Stage 6) without fabricating missing fields.
 */

import { buildCanonicalResultPath, createSafeMetricEntry } from '../core/ResultContract';
import { normalizeResultItem } from '../core/ResultNormalizer';
import type { ResultItem, ResultMetricStatus } from '../core/ResultTypes';

export interface RawPropertyResultInput {
  id: string;
  title?: string;
  propertyType?: string;
  transactionMode?: string;
  cityId?: string;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;
  latitude?: number;
  longitude?: number;
  areaSqm?: number | null;
  areaUnitLabel?: string;
  totalPriceMillionToman?: number | null;
  pricePerSqmMillionToman?: number | null;
  buildingAgeYears?: number | null;
  dataStatus?: ResultMetricStatus;
  updatedAtIso?: string | null;
  thumbnailUrl?: string | null;
  mediaCount?: number;
  canOpen?: boolean;
  canCompare?: boolean;
  canSelect?: boolean;
}

export function adaptPropertyToResultItem(raw: RawPropertyResultInput): ResultItem {
  const status: ResultMetricStatus = raw.dataStatus ?? 'verified';
  const areaVal = typeof raw.areaSqm === 'number' && Number.isFinite(raw.areaSqm) && raw.areaSqm > 0 ? raw.areaSqm : null;
  const totalVal =
    typeof raw.totalPriceMillionToman === 'number' &&
    Number.isFinite(raw.totalPriceMillionToman) &&
    raw.totalPriceMillionToman > 0
      ? raw.totalPriceMillionToman
      : null;

  let perSqmVal: number | null =
    typeof raw.pricePerSqmMillionToman === 'number' &&
    Number.isFinite(raw.pricePerSqmMillionToman) &&
    raw.pricePerSqmMillionToman > 0
      ? raw.pricePerSqmMillionToman
      : null;

  if (perSqmVal === null && totalVal !== null && areaVal !== null) {
    perSqmVal = Number((totalVal / areaVal).toFixed(2));
  }

  return normalizeResultItem({
    id: raw.id,
    entityType: 'property',
    title: raw.title || `ملک مسکونی (${raw.id})`,
    subtitle: [raw.propertyType, raw.neighborhoodNameFa, raw.transactionMode].filter(Boolean).join(' · ') || undefined,
    canonicalUrl: buildCanonicalResultPath('property', raw.id, raw.cityId),
    location: {
      cityId: raw.cityId,
      neighborhoodId: raw.neighborhoodId,
      latitude: raw.latitude,
      longitude: raw.longitude,
    },
    metrics: {
      propertyType: createSafeMetricEntry(raw.propertyType ?? null, undefined, status),
      transactionMode: createSafeMetricEntry(raw.transactionMode ?? null, undefined, status),
      areaSqm: createSafeMetricEntry(areaVal, raw.areaUnitLabel || 'مترمربع', status),
      totalPrice: createSafeMetricEntry(totalVal, 'میلیون تومان', status),
      pricePerSqm: createSafeMetricEntry(perSqmVal, 'میلیون تومان/مترمربع', status),
      buildingAge: createSafeMetricEntry(
        typeof raw.buildingAgeYears === 'number' && Number.isFinite(raw.buildingAgeYears) && raw.buildingAgeYears >= 0
          ? raw.buildingAgeYears
          : null,
        'سال',
        status
      ),
      updatedAt: createSafeMetricEntry(raw.updatedAtIso ?? null, undefined, status),
    },
    media:
      raw.thumbnailUrl || typeof raw.mediaCount === 'number'
        ? {
            thumbnailUrl: raw.thumbnailUrl || undefined,
            mediaCount: raw.mediaCount,
          }
        : undefined,
    status: status,
    permissions: {
      canOpen: raw.canOpen ?? true,
      canCompare: raw.canCompare ?? true,
      canSelect: raw.canSelect ?? true,
    },
  });
}
