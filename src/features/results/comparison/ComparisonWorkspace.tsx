/**
 * @file src/features/results/comparison/ComparisonWorkspace.tsx
 * @description Stage 6 Homogeneous-Entity Comparison Workspace with harmonized units, verified vs estimated badges, and sticky field labels.
 */

import React, { useMemo } from 'react';
import {
  METRIC_STATUS_LABELS_FA,
  buildNormalizedComparisonMatrix,
  type ResultItem,
} from '../../../platform/presentation';
import { formatAsciiToPersianDigits } from '../../../platform/search';

export interface ComparisonWorkspaceProps {
  items: readonly ResultItem[];
  onRemoveEntity: (entityId: string) => void;
  onClearAll: () => void;
}

export const ComparisonWorkspace: React.FC<ComparisonWorkspaceProps> = ({
  items,
  onRemoveEntity,
  onClearAll,
}) => {
  const rows = useMemo(() => buildNormalizedComparisonMatrix(items), [items]);

  if (items.length === 0) {
    return (
      <section
        dir="rtl"
        aria-label="میز کار مقایسه خالی"
        className="rounded-2xl border border-slate-200 bg-white p-6 text-right dark:border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-surface)]"
      >
        <h3 className="text-sm font-bold text-slate-900 dark:text-[var(--color-text-primary)]">میز کار مقایسه</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-[var(--color-text-muted)]">
          هنوز موردی برای مقایسه انتخاب نشده است. از فهرست یا جدول نتایج، موارد هم‌نوع (ملک با ملک یا محله با محله) را اضافه کنید.
        </p>
      </section>
    );
  }

  return (
    <section
      dir="rtl"
      aria-label="میز کار مقایسه تخصصی"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-right dark:border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-surface)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-[var(--color-border-subtle)]">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-[var(--color-text-primary)]">
            مقایسه تخصصی ({formatAsciiToPersianDigits(items.length)} مورد)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-[var(--color-text-muted)]">
            واحدها پیش از مقایسه یکسان‌سازی شده‌اند و داده‌های تأییدشده از مقادیر برآوردی تفکیک شده‌اند.
          </p>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          aria-label="پاک کردن تمام موارد مقایسه"
          className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-xs font-medium hover:bg-slate-50 dark:border-[var(--color-border-strong)] dark:hover:bg-[var(--color-bg-elevated)]"
        >
          پاک کردن جدول مقایسه
        </button>
      </header>

      <div className="w-full overflow-x-auto">
        <table className="min-w-[760px] w-full border-collapse text-right text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[var(--color-border-subtle)]">
              <th className="sticky right-0 z-10 min-w-[180px] bg-white px-3 py-3 font-bold text-slate-700 dark:bg-[var(--color-bg-surface)] dark:text-[var(--color-text-primary)]">
                شاخص مقایسه
              </th>
              {items.map((item) => (
                <th
                  key={item.id}
                  style={{ minWidth: '240px' }}
                  className="px-4 py-3 font-bold text-slate-900 dark:text-[var(--color-text-primary)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveEntity(item.id)}
                      aria-label={`حذف ${item.title} از مقایسه`}
                      className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-normal text-slate-600 hover:bg-slate-100 dark:border-[var(--color-border-strong)] dark:text-[var(--color-text-secondary)] dark:hover:bg-[var(--color-bg-elevated)]"
                    >
                      حذف
                    </button>
                  </div>
                </th>
              ))}
              <th className="min-w-[160px] px-3 py-3 font-bold text-slate-600 dark:text-[var(--color-text-secondary)]">
                دامنه اختلاف
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-[var(--color-border-subtle)]">
            {rows.map((row) => (
              <tr key={row.field.id}>
                <th className="sticky right-0 z-10 bg-white px-3 py-3 font-semibold text-slate-700 dark:bg-[var(--color-bg-surface)] dark:text-[var(--color-text-primary)]">
                  <div>{row.field.label}</div>
                  <div className="text-[11px] font-normal text-slate-400">{row.field.group}</div>
                </th>
                {row.cells.map((cell) => {
                  const isMin =
                    cell.normalizedNumericValue !== null &&
                    row.minNumericValue !== null &&
                    row.maxNumericValue !== row.minNumericValue &&
                    cell.normalizedNumericValue === row.minNumericValue;
                  const isMax =
                    cell.normalizedNumericValue !== null &&
                    row.maxNumericValue !== null &&
                    row.maxNumericValue !== row.minNumericValue &&
                    cell.normalizedNumericValue === row.maxNumericValue;

                  return (
                    <td key={cell.entityId} className="px-4 py-3 font-mono tabular-nums">
                      {cell.rawValue === null ? (
                        <span className="font-sans text-slate-400">نامشخص (بدون داده)</span>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-[var(--color-text-primary)]">
                            {formatAsciiToPersianDigits(
                              cell.normalizedNumericValue !== null ? cell.normalizedNumericValue : cell.rawValue
                            )}{' '}
                            {cell.displayUnit || ''}
                          </div>
                          <div className="mt-0.5 font-sans text-[11px] text-slate-500 dark:text-[var(--color-text-muted)]">
                            <span>{METRIC_STATUS_LABELS_FA[cell.status]}</span>
                            {isMin && <span> · کمترین مقدار</span>}
                            {isMax && <span> · بیشترین مقدار</span>}
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-slate-600 dark:text-[var(--color-text-secondary)]">
                  {row.deltaSummaryFa || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
