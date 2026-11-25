/**
 * @file src/shared/result-ui/ResultList.tsx
 * @description Standard & Compact List Renderer for Stage 6 Results Presentation.
 */

import React from 'react';
import type { ResultActionId, ResultItem } from '../../platform/presentation';
import { formatAsciiToPersianDigits } from '../../platform/search';

export interface ResultListProps {
  items: readonly ResultItem[];
  compact?: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect?: (item: ResultItem) => void;
  onAction?: (actionId: ResultActionId, item: ResultItem) => void;
}

export const ResultList: React.FC<ResultListProps> = ({
  items,
  compact = false,
  selectedIds,
  onToggleSelect,
  onAction,
}) => {
  return (
    <ul dir="rtl" aria-label="فهرست نتایج" className="space-y-2.5 text-right">
      {items.map((item) => {
        const isSelected = selectedIds.has(item.id);
        const perSqm = item.metrics.pricePerSqm;
        const total = item.metrics.totalPrice;
        return (
          <li
            key={`${item.entityType}:${item.id}`}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border transition-colors ${
              compact ? 'p-3' : 'p-4'
            } ${
              isSelected
                ? 'border-slate-900 bg-slate-50 dark:border-[var(--color-brand-600)] dark:bg-[var(--color-bg-muted)]'
                : 'border-slate-200 bg-white dark:border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-surface)]'
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {item.permissions.canSelect && onToggleSelect && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(item)}
                  aria-label={`انتخاب ${item.title}`}
                  className="h-5 w-5 shrink-0 cursor-pointer"
                />
              )}
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-bold text-slate-900 dark:text-[var(--color-text-primary)]">
                  {item.title}
                </h4>
                {item.subtitle && (
                  <p className="truncate text-xs text-slate-500 dark:text-[var(--color-text-muted)]">
                    {item.subtitle}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
              {total && total.value !== null && (
                <span>
                  {formatAsciiToPersianDigits(total.value)} {total.unit || 'میلیون تومان'}
                </span>
              )}
              {perSqm && perSqm.value !== null && (
                <span>
                  {formatAsciiToPersianDigits(perSqm.value)} {perSqm.unit || 'میلیون تومان/مترمربع'}
                </span>
              )}
              {item.permissions.canOpen && (
                <button
                  type="button"
                  onClick={() => onAction?.('open-detail', item)}
                  aria-label={`جزئیات ${item.title}`}
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-3 font-sans text-xs font-semibold hover:bg-slate-50 dark:border-[var(--color-border-strong)] dark:hover:bg-[var(--color-bg-elevated)]"
                >
                  مشاهده
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};
