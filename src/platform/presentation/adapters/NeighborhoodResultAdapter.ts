/**
 * @file src/platform/presentation/adapters/NeighborhoodResultAdapter.ts
 * @description Adapts raw Neighborhood records to canonical ResultItem (Stage 6) without fabricating sample counts.
 */

import { buildCanonicalResultPath, createSafeMetricEntry } from '../core/ResultContract';
import { normalizeResultItem } from '../core/ResultNormalizer';
import type { ResultItem, ResultMetricStatus } from '../core/ResultTypes';

export interface RawNeighborhoodResultInput {
  id: string;
  nameFa: string;
  cityId?: string;
  cityNameFa?: string;
  districtZone?: string;
  latitude?: number;
  longitude?: number;
  areaSqKm?: number | null;
  askingPricePerSqmMillionToman?: number | null;
  estimatedDealPricePerSqmMillionToman?: number | null;
  verifiedSampleCount?: number | null;
  updatedAtIso?: string | null;
  dataStatus?: ResultMetricStatus;
  canOpen?: boolean;
  canCompare?: boolean;
  canSelect?: boolean;
}

export function adaptNeighborhoodToResultItem(raw: RawNeighborhoodResultInput): ResultItem {
  const status: ResultMetricStatus = raw.dataStatus ?? 'verified';
  return normalizeResultItem({
    id: raw.id,
    entityType: 'neighborhood',
    title: raw.nameFa || raw.id,
    subtitle: [raw.cityNameFa, raw.districtZone].filter(Boolean).join(' · ') || undefined,
    canonicalUrl: buildCanonicalResultPath('neighborhood', raw.id, raw.cityId),
    location: {
      cityId: raw.cityId || 'tehran',
      neighborhoodId: raw.id,
      latitude: raw.latitude,
      longitude: raw.longitude,
    },
    metrics: {
      pricePerSqm: createSafeMetricEntry(
        typeof raw.askingPricePerSqmMillionToman === 'number' && raw.askingPricePerSqmMillionToman > 0
          ? raw.askingPricePerSqmMillionToman
          : null,
        'میلیون تومان/مترمربع',
        status
      ),
      estimatedDealPricePerSqm: createSafeMetricEntry(
        typeof raw.estimatedDealPricePerSqmMillionToman === 'number' && raw.estimatedDealPricePerSqmMillionToman > 0
          ? raw.estimatedDealPricePerSqmMillionToman
          : null,
        'میلیون تومان/مترمربع',
        'estimated'
      ),
      areaSqm: createSafeMetricEntry(
        typeof raw.areaSqKm === 'number' && raw.areaSqKm > 0 ? raw.areaSqKm : null,
        'کیلومترمربع',
        status
      ),
      sampleCount: createSafeMetricEntry(
        typeof raw.verifiedSampleCount === 'number' && raw.verifiedSampleCount >= 0
          ? raw.verifiedSampleCount
          : null,
        'آگهی معتبر',
        status
      ),
      updatedAt: createSafeMetricEntry(raw.updatedAtIso ?? null, undefined, status),
    },
    status,
    permissions: {
      canOpen: raw.canOpen ?? true,
      canCompare: raw.canCompare ?? true,
      canSelect: raw.canSelect ?? true,
    },
  });
}
