/**
 * @file src/platform/presentation/adapters/BuildingResultAdapter.ts
 * @description Adapts raw Building records to canonical ResultItem (Stage 6).
 */

import { buildCanonicalResultPath, createSafeMetricEntry } from '../core/ResultContract';
import { normalizeResultItem } from '../core/ResultNormalizer';
import type { ResultItem, ResultMetricStatus } from '../core/ResultTypes';

export interface RawBuildingResultInput {
  id: string;
  title?: string;
  cityId?: string;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;
  latitude?: number;
  longitude?: number;
  landAreaSqm?: number | null;
  totalFloors?: number | null;
  knownUnitsCount?: number | null;
  buildYearJalali?: number | null;
  structureType?: string | null;
  updatedAtIso?: string | null;
  dataStatus?: ResultMetricStatus;
  thumbnailUrl?: string | null;
  canOpen?: boolean;
  canCompare?: boolean;
  canSelect?: boolean;
}

export function adaptBuildingToResultItem(raw: RawBuildingResultInput): ResultItem {
  const status: ResultMetricStatus = raw.dataStatus ?? 'verified';
  return normalizeResultItem({
    id: raw.id,
    entityType: 'building',
    title: raw.title || `ساختمان (${raw.id})`,
    subtitle: [raw.neighborhoodNameFa, raw.structureType].filter(Boolean).join(' · ') || undefined,
    canonicalUrl: buildCanonicalResultPath('building', raw.id, raw.cityId),
    location: {
      cityId: raw.cityId,
      neighborhoodId: raw.neighborhoodId,
      latitude: raw.latitude,
      longitude: raw.longitude,
    },
    metrics: {
      landAreaSqm: createSafeMetricEntry(
        typeof raw.landAreaSqm === 'number' && raw.landAreaSqm > 0 ? raw.landAreaSqm : null,
        'مترمربع',
        status
      ),
      totalFloors: createSafeMetricEntry(
        typeof raw.totalFloors === 'number' && raw.totalFloors > 0 ? raw.totalFloors : null,
        'طبقه',
        status
      ),
      knownUnitsCount: createSafeMetricEntry(
        typeof raw.knownUnitsCount === 'number' && raw.knownUnitsCount >= 0 ? raw.knownUnitsCount : null,
        'واحد شناخته‌شده',
        status
      ),
      buildYear: createSafeMetricEntry(
        typeof raw.buildYearJalali === 'number' && raw.buildYearJalali > 1300 ? raw.buildYearJalali : null,
        'شمسی',
        status
      ),
      updatedAt: createSafeMetricEntry(raw.updatedAtIso ?? null, undefined, status),
    },
    media: raw.thumbnailUrl ? { thumbnailUrl: raw.thumbnailUrl } : undefined,
    status: status,
    permissions: {
      canOpen: raw.canOpen ?? true,
      canCompare: raw.canCompare ?? true,
      canSelect: raw.canSelect ?? true,
    },
  });
}
