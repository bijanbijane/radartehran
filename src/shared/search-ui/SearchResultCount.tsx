/**
 * @file src/shared/search-ui/SearchResultCount.tsx
 * @description Accessible aria-live result count and partial-result warning banner (never fabricates total count).
 */

import React from 'react';
import { formatAsciiToPersianDigits, type SearchUiDisplayState } from '../../platform/search';

export interface SearchResultCountProps {
  displayState: SearchUiDisplayState;
  receivedCount: number;
  totalServerCount: number | null;
  appliedFilterCount: number;
  warningsFa?: readonly string[];
}

export const SearchResultCount: React.FC<SearchResultCountProps> = ({
  displayState,
  receivedCount,
  totalServerCount,
  appliedFilterCount,
  warningsFa = [],
}) => {
  return (
    <div dir="rtl" role="status" aria-live="polite" className="space-y-1 text-right text-xs">
      <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-[var(--color-text-secondary)]">
        {displayState === 'ResultsLoading' ? (
          <span>در حال دریافت نتایج جست‌وجو...</span>
        ) : totalServerCount !== null ? (
          <span>
            نمایش <strong className="font-mono tabular-nums">{formatAsciiToPersianDigits(receivedCount)}</strong> مورد از مجموع{' '}
            <strong className="font-mono tabular-nums">{formatAsciiToPersianDigits(totalServerCount)}</strong> نتیجه معتبر
          </span>
        ) : (
          <span>
            نمایش <strong className="font-mono tabular-nums">{formatAsciiToPersianDigits(receivedCount)}</strong> نتیجه دریافت‌شده
          </span>
        )}
        {appliedFilterCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatAsciiToPersianDigits(appliedFilterCount)} فیلتر اعمال‌شده</span>
          </>
        )}
      </div>

      {displayState === 'PartialResults' && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-800 dark:text-amber-200">
          هشدار نتیجه جزئی: برخی سرویس‌ها پاسخ ندادند؛ تنها نتایج واقعی دریافت‌شده ({formatAsciiToPersianDigits(receivedCount)} مورد) نمایش داده شده است.
        </p>
      )}

      {warningsFa.map((w, idx) => (
        <p key={idx} className="text-rose-600 dark:text-rose-400">
          {w}
        </p>
      ))}
    </div>
  );
};
