/**
 * @file src/shared/entity-detail-ui/DetailErrorState.tsx
 * @description Renders canonical error, restricted, deleted, archived, or conflict states for Entity Detail pages (Stage 7).
 */

import React from 'react';
import type { EntityDetailPageStatus } from '../../platform/entity-detail';

export interface DetailErrorStateProps {
  status: EntityDetailPageStatus;
  messageFa?: string | null;
  onRetry?: () => void;
  onReturnToSearch?: () => void;
}

export const DetailErrorState: React.FC<DetailErrorStateProps> = ({
  status,
  messageFa,
  onRetry,
  onReturnToSearch,
}) => {
  const titleMap: Partial<Record<EntityDetailPageStatus, string>> = {
    Restricted: 'دسترسی به این موجودیت محدود شده است',
    Deleted: 'این موجودیت حذف شده است',
    Archived: 'این موجودیت به بایگانی منتقل شده است',
    Conflict: 'تعارض در نسخه اطلاعات موجودیت',
    Error: 'خطا در دریافت اطلاعات موجودیت',
  };

  return (
    <div
      dir="rtl"
      role="alert"
      data-testid={`entity-detail-error-${status}`}
      className="rounded-2xl border border-rose-500/30 bg-slate-900/90 p-6 text-right"
    >
      <h2 className="text-base font-bold text-rose-300">
        {titleMap[status] || 'امکان نمایش کامل این موجودیت وجود ندارد'}
      </h2>
      <p className="mt-2 text-xs text-slate-300">
        {messageFa || 'لطفاً دسترسی کاربری خود را بررسی کنید یا دوباره تلاش نمایید.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            تلاش مجدد
          </button>
        )}
        {onReturnToSearch && (
          <button
            type="button"
            onClick={onReturnToSearch}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            بازگشت به فهرست نتایج
          </button>
        )}
      </div>
    </div>
  );
};
