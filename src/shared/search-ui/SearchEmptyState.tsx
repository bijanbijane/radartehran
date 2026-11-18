/**
 * @file src/shared/search-ui/SearchEmptyState.tsx
 * @description Empty and Error states for Search that preserve user filters unless explicitly cleared.
 */

import React from 'react';

export interface SearchEmptyStateProps {
  rawQuery: string;
  activeFilterCount: number;
  isError?: boolean;
  errorMessageFa?: string;
  onRetry?: () => void;
  onExplicitClearFilters?: () => void;
}

export const SearchEmptyState: React.FC<SearchEmptyStateProps> = ({
  rawQuery,
  activeFilterCount,
  isError = false,
  errorMessageFa,
  onRetry,
  onExplicitClearFilters,
}) => {
  if (isError) {
    return (
      <section
        dir="rtl"
        role="alert"
        className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-right text-slate-900 dark:text-slate-100"
      >
        <h3 className="text-sm font-bold text-rose-700 dark:text-rose-300">
          خطا در دریافت نتایج جست‌وجو
        </h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {errorMessageFa || 'امکان ارتباط با سرویس جست‌وجو فراهم نشد. فیلترها و عبارت جست‌وجوی شما حفظ شده‌اند.'}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            aria-label="تلاش مجدد برای جست‌وجو"
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            تلاش مجدد
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      dir="rtl"
      aria-label="نتیجه‌ای یافت نشد"
      className="rounded-2xl border border-slate-200 bg-white p-6 text-right text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
    >
      <h3 className="text-sm font-bold">
        نتیجه‌ای برای {rawQuery ? `«${rawQuery}»` : 'فیلترهای انتخاب‌شده'} یافت نشد
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        فیلترهای فعلی شما بدون تغییر حفظ شده‌اند. در صورت تمایل می‌توانید عبارت جست‌وجو را تغییر دهید یا فیلترها را بازنشانی کنید.
      </p>
      {activeFilterCount > 0 && onExplicitClearFilters && (
        <button
          type="button"
          onClick={onExplicitClearFilters}
          aria-label="حذف فیلترها با تایید کاربر"
          className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          بازنشانی فیلترها ({activeFilterCount})
        </button>
      )}
    </section>
  );
};
