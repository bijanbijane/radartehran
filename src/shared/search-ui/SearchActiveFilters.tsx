/**
 * @file src/shared/search-ui/SearchActiveFilters.tsx
 * @description Displays active filters with isolated single-filter removal and context reset.
 */

import React from 'react';
import { formatActiveFilterLabelFa, type AreaUnit, type SearchFilter } from '../../platform/search';

export interface SearchActiveFiltersProps {
  filters: readonly SearchFilter[];
  areaUnit?: AreaUnit;
  onRemoveFilter: (filterIdOrField: string) => void;
  onClearAll: () => void;
}

export const SearchActiveFilters: React.FC<SearchActiveFiltersProps> = ({
  filters,
  areaUnit = 'sqm',
  onRemoveFilter,
  onClearAll,
}) => {
  if (filters.length === 0) return null;

  return (
    <div
      dir="rtl"
      aria-label="فیلترهای فعال"
      className="flex flex-wrap items-center gap-2 py-1"
    >
      <span className="text-xs text-slate-500 dark:text-slate-400">فیلترهای فعال:</span>
      {filters.map((filter) => {
        const label = formatActiveFilterLabelFa(filter, areaUnit);
        return (
          <button
            key={filter.id}
            type="button"
            onClick={() => onRemoveFilter(filter.id)}
            aria-label={`حذف فیلتر ${label}`}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <span>{label}</span>
            <span aria-hidden="true" className="text-slate-400">×</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onClearAll}
        aria-label="پاک کردن تمام فیلترهای فعال"
        className="min-h-[36px] px-2 text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
      >
        حذف همه
      </button>
    </div>
  );
};
