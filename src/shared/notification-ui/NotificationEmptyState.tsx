/**
 * @file src/shared/notification-ui/NotificationEmptyState.tsx
 * @description Distinguishes between an empty notification inbox and an empty filtered search result (Stage 9).
 */

import React from 'react';

export interface NotificationEmptyStateProps {
  hasActiveFilters: boolean;
  onResetFilters?: () => void;
}

export const NotificationEmptyState: React.FC<NotificationEmptyStateProps> = ({
  hasActiveFilters,
  onResetFilters,
}) => {
  return (
    <div
      dir="rtl"
      data-testid="notification-empty-state"
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center space-y-2"
    >
      <h3 className="text-sm font-bold text-slate-100">
        {hasActiveFilters
          ? 'اعلانی منطبق با فیلترهای انتخابی یافت نشد'
          : 'صندوق اعلان‌های شما خالی است'}
      </h3>
      <p className="text-xs text-slate-400">
        {hasActiveFilters
          ? 'برای مشاهده سایر اعلان‌ها فیلترهای وضعیت یا دسته‌بندی را بازنشانی کنید.'
          : 'هشدارهای کاهش قیمت، تغییرات املاک دنبال‌شده و پیام‌های امنیتی در این بخش نمایش داده می‌شوند.'}
      </p>
      {hasActiveFilters && onResetFilters && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onResetFilters}
            className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer"
          >
            پاک‌کردن فیلترهای اعلان
          </button>
        </div>
      )}
    </div>
  );
};
