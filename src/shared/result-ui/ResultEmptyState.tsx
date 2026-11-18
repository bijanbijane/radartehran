/**
 * @file src/shared/result-ui/ResultEmptyState.tsx
 * @description State-aware Banner for Initial, Empty, Partial, Error, Stale, Restricted, and Invalid states (Stage 6 Section 12).
 */

import React from 'react';
import { DATA_STATE_LABELS_FA, type ResultDataStatusState } from '../../platform/presentation';
import { formatAsciiToPersianDigits } from '../../platform/search';

export interface ResultEmptyStateProps {
  state: ResultDataStatusState;
  receivedCount?: number;
  messageFa?: string;
  onRetry?: () => void;
}

export const ResultEmptyState: React.FC<ResultEmptyStateProps> = ({
  state,
  receivedCount = 0,
  messageFa,
  onRetry,
}) => {
  return (
    <section
      dir="rtl"
      role={state === 'Error' || state === 'Restricted' ? 'alert' : 'status'}
      aria-live="polite"
      className="rounded-2xl border border-slate-200 bg-white p-6 text-right text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
    >
      <h3 className="text-sm font-bold">{DATA_STATE_LABELS_FA[state]}</h3>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        {messageFa ||
          (state === 'Partial'
            ? `تعداد واقعی نتایج دریافت‌شده: ${formatAsciiToPersianDigits(receivedCount)} مورد.`
            : 'فیلترهای فعلی شما بدون تغییر حفظ شده‌اند.')}
      </p>
      {onRetry && (state === 'Error' || state === 'Partial' || state === 'Stale') && (
        <button
          type="button"
          onClick={onRetry}
          aria-label="تلاش مجدد برای دریافت نتایج"
          className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
        >
          تلاش مجدد
        </button>
      )}
    </section>
  );
};
