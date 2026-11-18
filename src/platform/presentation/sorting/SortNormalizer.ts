/**
 * @file src/platform/presentation/sorting/SortNormalizer.ts
 * @description Type-aware sort value normalization (numeric vs date vs text) with deterministic Null-last policy.
 */

import type { ResultItem } from '../core/ResultTypes';

export type ResultSortField =
  | 'totalPrice'
  | 'pricePerSqm'
  | 'areaSqm'
  | 'buildingAge'
  | 'publishedAt'
  | 'updatedAt'
  | 'distance'
  | 'title';

export type ResultSortDirection = 'asc' | 'desc';

export interface ResultSortSpec {
  field: ResultSortField;
  direction: ResultSortDirection;
}

export function extractComparableValue(
  item: ResultItem,
  field: ResultSortField,
  referenceCoords?: { latitude: number; longitude: number }
): number | string | null {
  if (field === 'title') {
    return item.title || null;
  }

  if (field === 'distance') {
    if (
      !referenceCoords ||
      !item.location ||
      typeof item.location.latitude !== 'number' ||
      typeof item.location.longitude !== 'number'
    ) {
      return null;
    }
    const dLat = item.location.latitude - referenceCoords.latitude;
    const dLng = item.location.longitude - referenceCoords.longitude;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  const metric = item.metrics[field];
  if (!metric || metric.value === null || metric.value === undefined) return null;

  if (field === 'publishedAt' || field === 'updatedAt') {
    if (typeof metric.value === 'number') return metric.value;
    const ts = Date.parse(String(metric.value));
    return Number.isFinite(ts) ? ts : null;
  }

  if (typeof metric.value === 'number') {
    return Number.isFinite(metric.value) ? metric.value : null;
  }

  const parsedNum = Number(metric.value);
  if (Number.isFinite(parsedNum)) return parsedNum;
  return String(metric.value);
}
