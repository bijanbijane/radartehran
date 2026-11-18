/**
 * @file src/shared/entity-detail-ui/DetailStatus.tsx
 * @description Renders canonical entity status badges, lifecycle states, and data confidence indicators in Persian (Stage 7).
 */

import React from 'react';
import {
  DATA_CONFIDENCE_LABELS_FA,
  type DataConfidence,
  type EntityDetailPageStatus,
  type ListingLifecycleState,
} from '../../platform/entity-detail';

const PAGE_STATUS_LABELS_FA: Record<EntityDetailPageStatus, string> = {
  Initial: 'آماده بارگذاری',
  Loading: 'در حال دریافت داده...',
  Success: 'داده معتبر و کامل',
  Partial: 'بارگذاری جزئی (بخشی از داده‌ها ناقص است)',
  NotFound: 'موجودیت یافت نشد',
  Restricted: 'دسترسی محدودشده',
  Deleted: 'حذف‌شده',
  Archived: 'آرشیوشده',
  Stale: 'داده نیازمند به‌روزرسانی',
  Conflict: 'تعارض در منابع داده',
  Error: 'خطا در بارگذاری',
};

const LIFECYCLE_LABELS_FA: Record<ListingLifecycleState, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING_REVIEW: 'در انتظار بررسی',
  REJECTED: 'ردشده',
  PUBLISHED: 'منتشرشده',
  EXPIRED: 'منقضی‌شده',
  REMOVED: 'برداشته‌شده',
  SUSPENDED: 'تعلیق‌شده',
};

export interface DetailStatusProps {
  pageStatus?: EntityDetailPageStatus;
  confidence?: DataConfidence;
  lifecycleState?: ListingLifecycleState;
}

export const DetailStatus: React.FC<DetailStatusProps> = ({
  pageStatus = 'Success',
  confidence,
  lifecycleState,
}) => {
  return (
    <div dir="rtl" className="flex flex-wrap items-center gap-2" data-testid="entity-detail-status-badges">
      <span
        data-testid={`detail-page-status-${pageStatus}`}
        className="inline-flex items-center rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-xs font-medium text-slate-200"
      >
        {PAGE_STATUS_LABELS_FA[pageStatus]}
      </span>

      {confidence && (
        <span
          data-testid={`detail-confidence-${confidence}`}
          className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium ${
            confidence === 'verified'
              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
              : confidence === 'estimated'
                ? 'border-sky-500/40 bg-sky-950/40 text-sky-300'
                : confidence === 'conflicting'
                  ? 'border-amber-500/40 bg-amber-950/40 text-amber-300'
                  : 'border-slate-600 bg-slate-800 text-slate-300'
          }`}
        >
          اعتبار داده: {DATA_CONFIDENCE_LABELS_FA[confidence]}
        </span>
      )}

      {lifecycleState && (
        <span
          data-testid={`detail-lifecycle-${lifecycleState}`}
          className="inline-flex items-center rounded-md border border-indigo-500/40 bg-indigo-950/40 px-2.5 py-0.5 text-xs font-medium text-indigo-200"
        >
          وضعیت آگهی: {LIFECYCLE_LABELS_FA[lifecycleState]}
        </span>
      )}
    </div>
  );
};
