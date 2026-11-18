/**
 * @file src/platform/presentation/core/ResultContract.ts
 * @description Enforces non-fabrication and null-preservation invariants on ResultItem contracts (Stage 6).
 */

import type { ResultEntityType, ResultItem, ResultMetricEntry } from './ResultTypes';

export const SUPPORTED_RESULT_ENTITY_TYPES: readonly ResultEntityType[] = [
  'property',
  'listing',
  'building',
  'neighborhood',
  'service',
] as const;

export const RESULT_ENTITY_TYPES = SUPPORTED_RESULT_ENTITY_TYPES;

/**
 * Ensures missing values stay strictly `null` (never coerced to 0 or empty string)
 * and numeric metrics retain their explicit unit and data confidence status.
 */
export function createSafeMetricEntry(
  rawValue: string | number | null | undefined,
  unit?: string,
  status: ResultMetricEntry['status'] = 'unknown'
): ResultMetricEntry {
  if (rawValue === undefined || rawValue === null) {
    return { value: null, unit, status };
  }
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return { value: null, unit, status };
    return { value: trimmed, unit, status };
  }
  if (typeof rawValue === 'number') {
    if (!Number.isFinite(rawValue)) return { value: null, unit, status };
    return { value: rawValue, unit, status };
  }
  return { value: null, unit, status };
}

export function buildCanonicalResultPath(entityType: ResultEntityType, id: string, cityId?: string): string {
  const safeId = encodeURIComponent(id.trim());
  const citySuffix = cityId ? `?city=${encodeURIComponent(cityId)}` : '';
  switch (entityType) {
    case 'property':
      return `/properties/${safeId}${citySuffix}`;
    case 'listing':
      return `/listings/${safeId}${citySuffix}`;
    case 'building':
      return `/buildings/${safeId}${citySuffix}`;
    case 'neighborhood':
      return `/neighborhoods/${safeId}${citySuffix}`;
    case 'service':
      return `/services/${safeId}${citySuffix}`;
  }
}
