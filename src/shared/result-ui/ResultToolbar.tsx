/**
 * @file src/shared/result-ui/ResultToolbar.tsx
 * @description Toolbar for switching Result Renderers (Card Grid, List, Table, Comparison) and Sorting without re-running Query.
 */

import React from 'react';
import {
  STANDARD_RESULT_RENDERERS,
  type ResultPresentationMode,
  type ResultSortDirection,
  type ResultSortField,
} from '../../platform/presentation';

export interface ResultToolbarProps {
  activeMode: ResultPresentationMode;
  sortField: ResultSortField;
  sortDirection: ResultSortDirection;
  comparisonCount: number;
  onChangeMode: (mode: ResultPresentationMode) => void;
  onChangeSort: (field: ResultSortField, direction: ResultSortDirection) => void;
}

export const ResultToolbar: React.FC<ResultToolbarProps> = ({
  activeMode,
  sortField,
  sortDirection,
  comparisonCount,
  onChangeMode,
  onChangeSort,
}) => {
  return (
    <div
      dir="rtl"
      aria-label="نوار ابزار نمایش و مرتب‌سازی نتایج"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="قالب نمایش نتایج">
        {STANDARD_RESULT_RENDERERS.map((renderer) => {
          const isActive = activeMode === renderer.id;
          return (
            <button
              key={renderer.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChangeMode(renderer.id)}
              className={`min-h-[44px] rounded-xl px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {renderer.titleFa}
              {renderer.id === 'comparison' && comparisonCount > 0 ? ` (${comparisonCount})` : ''}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500 dark:text-slate-400">مرتب‌سازی:</label>
        <select
          value={`${sortField}:${sortDirection}`}
          aria-label="مرتب‌سازی نتایج"
          onChange={(e) => {
            const [f, d] = e.target.value.split(':') as [ResultSortField, ResultSortDirection];
            onChangeSort(f, d);
          }}
          className="min-h-[44px] rounded-xl border border-slate-300 bg-transparent px-3 text-xs dark:border-slate-700"
        >
          <option value="totalPrice:asc">قیمت کل (ارزان‌ترین به گران‌ترین)</option>
          <option value="totalPrice:desc">قیمت کل (گران‌ترین به ارزان‌ترین)</option>
          <option value="pricePerSqm:asc">قیمت هر مترمربع (صعودی)</option>
          <option value="pricePerSqm:desc">قیمت هر مترمربع (نزولی)</option>
          <option value="areaSqm:desc">متراژ زیربنا (بزرگ‌ترین)</option>
          <option value="areaSqm:asc">متراژ زیربنا (کوچک‌ترین)</option>
          <option value="buildingAge:asc">سن بنا (نوسازترین)</option>
          <option value="updatedAt:desc">آخرین به‌روزرسانی (جدیدترین)</option>
        </select>
      </div>
    </div>
  );
};
