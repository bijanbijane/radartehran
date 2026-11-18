/**
 * @file src/shared/result-ui/ResultPagination.tsx
 * @description Offset & Cursor Pagination Bar supporting 20/40/60 page sizes and honest total page display.
 */

import React from 'react';
import { ALLOWED_RESULT_PAGE_SIZES, type ResultPaginationModel } from '../../platform/presentation';
import { formatAsciiToPersianDigits } from '../../platform/search';

export interface ResultPaginationProps {
  model: ResultPaginationModel;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
}

export const ResultPagination: React.FC<ResultPaginationProps> = ({
  model,
  onPageChange,
  onPageSizeChange,
}) => {
  const canGoPrev = model.page > 1 && model.status !== 'Loading';
  const canGoNext =
    model.status !== 'Loading' &&
    model.status !== 'LastPage' &&
    model.status !== 'EmptyResult' &&
    (model.totalPages === null ? model.receivedCount >= model.pageSize : model.page < model.totalPages);

  return (
    <nav
      dir="rtl"
      aria-label="صفحه‌بندی نتایج"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
        <span>صفحه <strong className="font-mono tabular-nums">{formatAsciiToPersianDigits(model.page)}</strong></span>
        {model.totalPages !== null && (
          <span>
            از <strong className="font-mono tabular-nums">{formatAsciiToPersianDigits(model.totalPages)}</strong>
          </span>
        )}
        <span aria-hidden="true">·</span>
        <span>وضعیت: {model.status}</span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={model.pageSize}
          aria-label="تعداد نتایج در هر صفحه"
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="min-h-[44px] rounded-xl border border-slate-300 bg-transparent px-2.5 font-mono tabular-nums dark:border-slate-700"
        >
          {ALLOWED_RESULT_PAGE_SIZES.map((sz) => (
            <option key={sz} value={sz}>
              {formatAsciiToPersianDigits(sz)} مورد در صفحه
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={!canGoPrev}
          onClick={() => onPageChange(model.page - 1)}
          aria-label="صفحه قبلی"
          className="min-h-[44px] rounded-xl border border-slate-300 px-3 font-semibold disabled:opacity-40 dark:border-slate-700"
        >
          صفحه قبل
        </button>

        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => onPageChange(model.page + 1)}
          aria-label="صفحه بعدی"
          className="min-h-[44px] rounded-xl border border-slate-300 px-3 font-semibold disabled:opacity-40 dark:border-slate-700"
        >
          صفحه بعد
        </button>
      </div>
    </nav>
  );
};
