/**
 * @file src/platform/presentation/sorting/SortController.ts
 * @description Deterministic numeric/date/text SortController with Nulls-Last policy and Page=1 reset on sort change.
 */

import type { ResultItem } from '../core/ResultTypes';
import { extractComparableValue, type ResultSortDirection, type ResultSortField, type ResultSortSpec } from './SortNormalizer';

/**
 * Sorts ResultItem[] strictly numerically for numbers/dates (never lexicographical on numbers),
 * always placing `null` values at the end regardless of ascending/descending direction.
 */
export function sortResultItemsClientSide(
  items: readonly ResultItem[],
  spec: ResultSortSpec,
  referenceCoords?: { latitude: number; longitude: number }
): ResultItem[] {
  const dirMultiplier = spec.direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    const valA = extractComparableValue(a, spec.field, referenceCoords);
    const valB = extractComparableValue(b, spec.field, referenceCoords);

    if (valA === null && valB === null) return a.id.localeCompare(b.id);
    if (valA === null) return 1; // Nulls always last
    if (valB === null) return -1;

    if (typeof valA === 'number' && typeof valB === 'number') {
      if (valA === valB) return a.id.localeCompare(b.id);
      return (valA - valB) * dirMultiplier;
    }

    return String(valA).localeCompare(String(valB), 'fa') * dirMultiplier;
  });
}

export function applySortChangeAndResetPage(
  currentPage: number,
  nextField: ResultSortField,
  nextDirection: ResultSortDirection
): { sort: ResultSortSpec; nextPage: number } {
  return {
    sort: { field: nextField, direction: nextDirection },
    nextPage: 1, // Rule 7.1.6: Changing Sort MUST return page to 1
  };
}
