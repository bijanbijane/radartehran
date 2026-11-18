/**
 * @file src/platform/search/filters/FilterNormalizer.ts
 * @description Filter normalization, deduplication, isolated removal, context-scoped reset, and city-switch cleanup.
 */

import { convertAreaBetweenUnits } from '../core/SearchNormalizer';
import type { AreaUnit, SearchFilter, SearchScope } from '../core/SearchTypes';
import { FILTER_BY_FIELD } from './FilterRegistry';

export function buildStableFilterId(field: string, operator: string): string {
  return `flt:${field}:${operator}`;
}

/**
 * Normalizes a SearchFilter while preserving its `rawValue`.
 * Area filters in `sqft` are normalized to `sqm` for canonical comparison while retaining `rawValue`.
 */
export function normalizeSingleFilter(filter: SearchFilter): SearchFilter {
  const id = filter.id || buildStableFilterId(filter.field, filter.operator);
  const rawValue = filter.rawValue !== undefined ? filter.rawValue : filter.value;

  if (filter.field === 'area' && filter.unit === 'sqft') {
    if (typeof filter.value === 'number') {
      const converted = convertAreaBetweenUnits(filter.value, 'sqft', 'sqm');
      return {
        ...filter,
        id,
        rawValue,
        value: converted.value,
        unit: 'sqm',
      };
    }
    if (
      Array.isArray(filter.value) &&
      filter.value.length === 2 &&
      typeof filter.value[0] === 'number' &&
      typeof filter.value[1] === 'number'
    ) {
      const minSqm = convertAreaBetweenUnits(filter.value[0], 'sqft', 'sqm').value;
      const maxSqm = convertAreaBetweenUnits(filter.value[1], 'sqft', 'sqm').value;
      return {
        ...filter,
        id,
        rawValue,
        value: [minSqm, maxSqm],
        unit: 'sqm',
      };
    }
  }

  return {
    ...filter,
    id,
    rawValue,
  };
}

/**
 * Deduplicates filters by `(field, operator)` keeping the latest updated filter.
 */
export function deduplicateAndNormalizeFilters(filters: readonly SearchFilter[]): SearchFilter[] {
  const map = new Map<string, SearchFilter>();
  for (const raw of filters) {
    const normalized = normalizeSingleFilter(raw);
    const key = `${normalized.field}::${normalized.operator}`;
    map.set(key, normalized);
  }
  return Array.from(map.values());
}

/**
 * Removes a single filter by its id or field without corrupting any other active filters.
 */
export function removeFilterIsolated(filters: readonly SearchFilter[], idOrField: string): SearchFilter[] {
  return filters.filter((f) => f.id !== idOrField && f.field !== idOrField);
}

/**
 * Resets filters only for the active scope or source while preserving global/other context filters if requested.
 */
export function resetFiltersInContext(
  filters: readonly SearchFilter[],
  options?: { scope?: SearchScope; preserveMapBoundsFilter?: boolean }
): SearchFilter[] {
  if (!options) return [];
  return filters.filter((f) => {
    if (options.preserveMapBoundsFilter && f.source === 'map') return true;
    if (options.scope && options.scope !== 'all') {
      const def = FILTER_BY_FIELD.get(f.field);
      if (def && !def.supportedScopes.includes(options.scope)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Cleans up city-specific filters (neighborhoodId, districtNumber) when switching cities.
 */
export function pruneIncompatibleFiltersForCity(
  filters: readonly SearchFilter[],
  nextCityId: string
): { retained: SearchFilter[]; removed: SearchFilter[] } {
  const retained: SearchFilter[] = [];
  const removed: SearchFilter[] = [];

  for (const f of filters) {
    const def = FILTER_BY_FIELD.get(f.field);
    const isCityMismatch =
      (def?.citySpecific && f.cityScoped && f.cityScoped !== nextCityId) ||
      (def?.citySpecific && !f.cityScoped);
    if (isCityMismatch) {
      removed.push(f);
    } else {
      retained.push(f);
    }
  }

  return { retained, removed };
}

export function formatActiveFilterLabelFa(filter: SearchFilter, displayAreaUnit: AreaUnit = 'sqm'): string {
  const def = FILTER_BY_FIELD.get(filter.field);
  const label = def?.labelFa || filter.field;
  if (filter.field === 'area' && typeof filter.value === 'number') {
    const converted = convertAreaBetweenUnits(filter.value, 'sqm', displayAreaUnit);
    return `${label}: ${converted.value} ${displayAreaUnit === 'sqm' ? 'مترمربع' : 'فوت‌مربع'}`;
  }
  if (Array.isArray(filter.value) && filter.value.length === 2) {
    return `${label}: از ${filter.value[0]} تا ${filter.value[1]}${filter.unit === 'million' ? ' میلیون تومان' : ''}`;
  }
  return `${label}: ${String(filter.value)}`;
}
