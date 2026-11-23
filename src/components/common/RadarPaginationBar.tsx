/**
 * @file src/components/common/RadarPaginationBar.tsx
 * Accessible RTL/LTR-aware pagination bar with page size selector and range summary.
 */
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toPersianNum } from '../../data/neighborhoods';
import type { PaginationSliceResult } from '../../utils/productViewRouterShellClasses';

export interface RadarPaginationBarProps<T> {
  slice: PaginationSliceResult<T>;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabelFa?: string;
  itemLabelEn?: string;
  isEn?: boolean;
  compact?: boolean;
}

export function RadarPaginationBar<T>({
  slice,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [12, 24, 0],
  itemLabelFa = 'محله',
  itemLabelEn = 'neighborhoods',
  isEn = false,
  compact = false,
}: RadarPaginationBarProps<T>): React.ReactElement | null {
  if (slice.totalItems === 0) return null;
  const fmt = (n: number) => (isEn ? String(n) : toPersianNum(n));

  return (
    <nav
      aria-label={isEn ? 'Pagination Navigation' : 'صفحه‌بندی نتایج'}
      data-testid="radar-pagination-bar"
      className={`flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/90 ${
        compact ? 'px-3 py-2 text-[11px]' : 'px-4 py-3 text-xs'
      } shadow-2xs`}
    >
      <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300 tabular-nums">
        <span data-testid="pagination-range-summary" className="font-medium">
          {isEn ? (
            <>
              Showing <strong className="font-black text-slate-900 dark:text-white">{fmt(slice.startIndex)}</strong>–
              <strong className="font-black text-slate-900 dark:text-white">{fmt(slice.endIndex)}</strong> of{' '}
              <strong className="font-black text-emerald-700 dark:text-emerald-400">{fmt(slice.totalItems)}</strong> {itemLabelEn}
            </>
          ) : (
            <>
              نمایش <strong className="font-black text-slate-900 dark:text-white">{fmt(slice.startIndex)}</strong> تا{' '}
              <strong className="font-black text-slate-900 dark:text-white">{fmt(slice.endIndex)}</strong> از{' '}
              <strong className="font-black text-emerald-700 dark:text-emerald-400">{fmt(slice.totalItems)}</strong> {itemLabelFa}
              {slice.totalPages > 1 && (
                <span className="text-slate-400 dark:text-slate-500 mr-1.5">
                  (صفحه {fmt(slice.currentPage)} از {fmt(slice.totalPages)})
                </span>
              )}
            </>
          )}
        </span>

        {onPageSizeChange && slice.totalItems > (pageSizeOptions[0] || 12) && (
          <label className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span>{isEn ? 'Per page:' : 'در هر صفحه:'}</span>
            <select
              data-testid="pagination-size-select"
              aria-label={isEn ? 'Items per page' : 'تعداد نمایش در هر صفحه'}
              value={slice.pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600 cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 0 ? (isEn ? `All (${slice.totalItems})` : `همه (${toPersianNum(slice.totalItems)})`) : fmt(opt)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {slice.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1 tabular-nums">
          <button
            type="button"
            data-testid="pagination-prev"
            disabled={!slice.hasPrev}
            onClick={() => slice.hasPrev && onPageChange(slice.currentPage - 1)}
            aria-label={isEn ? 'Previous page' : 'صفحه قبل'}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
          >
            {isEn ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span>{isEn ? 'Prev' : 'قبلی'}</span>
          </button>

          <div className="flex items-center gap-1">
            {slice.pageNumbers.map((entry, idx) =>
              entry === 'ellipsis' ? (
                <span key={`el-${idx}`} className="px-1.5 text-slate-400 select-none" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  data-testid={`pagination-page-${entry}`}
                  aria-current={slice.currentPage === entry ? 'page' : undefined}
                  aria-label={isEn ? `Page ${entry}` : `صفحه ${toPersianNum(entry)}`}
                  onClick={() => onPageChange(entry)}
                  className={`min-w-7 h-7 px-2 rounded-lg font-extrabold transition cursor-pointer ${
                    slice.currentPage === entry
                      ? 'bg-slate-900 dark:bg-[var(--color-brand-600)] text-white shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 border border-slate-200/70 dark:border-slate-700'
                  }`}
                >
                  {fmt(entry)}
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            data-testid="pagination-next"
            disabled={!slice.hasNext}
            onClick={() => slice.hasNext && onPageChange(slice.currentPage + 1)}
            aria-label={isEn ? 'Next page' : 'صفحه بعد'}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
          >
            <span>{isEn ? 'Next' : 'بعدی'}</span>
            {isEn ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </nav>
  );
}
