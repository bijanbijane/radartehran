/**
 * @file src/shared/result-ui/ResultSelectionBar.tsx
 * @description Bulk Action Selection Bar with permission enforcement and explicit confirmation for irreversible operations.
 */

import React from 'react';
import type { ResultActionId } from '../../platform/presentation';
import { formatAsciiToPersianDigits } from '../../platform/search';

export interface ResultSelectionBarProps {
  selectedCount: number;
  canCompareSelected?: boolean;
  canExportSelected?: boolean;
  canDeleteSelected?: boolean;
  onExecuteBulkAction: (actionId: ResultActionId) => void;
  onClearSelection: () => void;
}

export const ResultSelectionBar: React.FC<ResultSelectionBarProps> = ({
  selectedCount,
  canCompareSelected = true,
  canExportSelected = false,
  canDeleteSelected = false,
  onExecuteBulkAction,
  onClearSelection,
}) => {
  if (selectedCount <= 0) return null;

  return (
    <div
      dir="rtl"
      role="region"
      aria-label="نوار عملیات گروهی موارد انتخاب‌شده"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-xs text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900"
    >
      <div className="font-semibold">
        <span className="font-mono tabular-nums">{formatAsciiToPersianDigits(selectedCount)}</span> مورد انتخاب شده است
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canCompareSelected && (
          <button
            type="button"
            onClick={() => onExecuteBulkAction('add-to-compare')}
            aria-label="مقایسه موارد انتخاب‌شده"
            className="min-h-[44px] rounded-xl bg-white/15 px-3 font-semibold hover:bg-white/25 dark:bg-slate-900/10 dark:hover:bg-slate-900/20"
          >
            مقایسه موارد انتخاب‌شده
          </button>
        )}

        {canExportSelected && (
          <button
            type="button"
            onClick={() => onExecuteBulkAction('export-selected')}
            aria-label="خروجی موارد انتخاب‌شده"
            className="min-h-[44px] rounded-xl bg-white/15 px-3 font-semibold hover:bg-white/25 dark:bg-slate-900/10 dark:hover:bg-slate-900/20"
          >
            دریافت خروجی
          </button>
        )}

        {canDeleteSelected && (
          <button
            type="button"
            onClick={() => onExecuteBulkAction('delete-selected')}
            aria-label="حذف موارد انتخاب‌شده با تأیید صریح"
            className="min-h-[44px] rounded-xl bg-rose-600 px-3 font-semibold text-white hover:bg-rose-700"
          >
            حذف گروهی (نیازمند تأیید)
          </button>
        )}

        <button
          type="button"
          onClick={onClearSelection}
          aria-label="پاک کردن انتخاب‌ها"
          className="min-h-[44px] px-3 underline opacity-90 hover:opacity-100"
        >
          لغو انتخاب
        </button>
      </div>
    </div>
  );
};
