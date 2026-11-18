/**
 * @file src/shared/entity-detail-ui/DetailSkeleton.tsx
 * @description Skeleton loading state for Entity Detail pages preserving CLS < 0.1 layout stability (Stage 7).
 */

import React from 'react';

export const DetailSkeleton: React.FC = () => {
  return (
    <div
      dir="rtl"
      role="status"
      aria-label="در حال بارگذاری جزئیات موجودیت"
      data-testid="entity-detail-skeleton"
      className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
    >
      <div className="h-5 w-48 animate-pulse rounded bg-slate-800" />
      <div className="h-8 w-80 animate-pulse rounded bg-slate-800" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-xl bg-slate-800/80" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-800/80" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-800/80" />
      </div>
    </div>
  );
};
