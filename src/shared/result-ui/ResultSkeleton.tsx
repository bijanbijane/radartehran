/**
 * @file src/shared/result-ui/ResultSkeleton.tsx
 * @description Geometry-preserving Skeletons for Card Grid and Data Table (matching visible column count).
 */

import React from 'react';
import type { ResultPresentationMode } from '../../platform/presentation';

export interface ResultSkeletonProps {
  mode: ResultPresentationMode;
  count?: number;
  visibleColumnCount?: number;
}

export const ResultSkeleton: React.FC<ResultSkeletonProps> = ({
  mode,
  count = 6,
  visibleColumnCount = 7,
}) => {
  if (mode === 'data-table') {
    return (
      <div
        dir="rtl"
        aria-busy="true"
        aria-label="در حال بارگذاری جدول نتایج"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="space-y-3">
          {Array.from({ length: count }).map((_, rIdx) => (
            <div
              key={rIdx}
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleColumnCount)}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: visibleColumnCount }).map((__, cIdx) => (
                <div
                  key={cIdx}
                  className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      aria-busy="true"
      aria-label="در حال بارگذاری کارت‌های نتایج"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-3 aspect-video w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="mt-4 h-10 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
};
