/**
 * @file src/shared/result-ui/ResultCard.tsx
 * @description Entity-aware Result Card (Property, Listing, Building, Neighborhood, Service) with 16:9 media fallback and zero fabricated metrics.
 */

import React, { useState } from 'react';
import {
  METRIC_STATUS_LABELS_FA,
  getAllowedItemActions,
  type ResultActionId,
  type ResultItem,
} from '../../platform/presentation';
import { formatAsciiToPersianDigits } from '../../platform/search';

export interface ResultCardProps {
  item: ResultItem;
  isSelected?: boolean;
  onToggleSelect?: (item: ResultItem) => void;
  onAction?: (actionId: ResultActionId, item: ResultItem) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({
  item,
  isSelected = false,
  onToggleSelect,
  onAction,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const allowedActions = getAllowedItemActions(item);

  const areaMetric = item.metrics.areaSqm;
  const totalMetric = item.metrics.totalPrice;
  const perSqmMetric = item.metrics.pricePerSqm;
  const dealPerSqmMetric = item.metrics.estimatedDealPricePerSqm;
  const sampleCountMetric = item.metrics.sampleCount;

  return (
    <article
      dir="rtl"
      aria-label={item.title}
      className={`flex flex-col justify-between rounded-2xl border p-4 text-right transition-colors ${
        isSelected
          ? 'border-slate-900 bg-slate-50 dark:border-[var(--color-brand-600)] dark:bg-[var(--color-bg-muted)]'
          : 'border-slate-200 bg-white dark:border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-surface)]'
      }`}
    >
      <div>
        {/* 16:9 Media or Resilient Fallback preserving card height */}
        <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-[var(--color-bg-muted)]">
          {item.media?.thumbnailUrl && !imgFailed ? (
            <img
              src={item.media.thumbnailUrl}
              alt={item.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-slate-500 dark:text-[var(--color-text-muted)]">
              <span>{item.title}</span>
            </div>
          )}
        </div>

        {/* Header with Checkbox & max 2 lines title */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-[var(--color-text-primary)]">
            {item.title}
          </h3>
          {item.permissions.canSelect && onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(item)}
              aria-label={`انتخاب ${item.title}`}
              className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300"
            />
          )}
        </div>

        {item.subtitle && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-[var(--color-text-muted)]">
            {item.subtitle}
          </p>
        )}

        {/* Metrics with explicit units kept next to values */}
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5 text-xs dark:border-[var(--color-border-subtle)]">
          {areaMetric && areaMetric.value !== null && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-[var(--color-text-muted)]">مساحت:</span>
              <span className="font-mono font-semibold tabular-nums">
                {formatAsciiToPersianDigits(areaMetric.value)} {areaMetric.unit || 'مترمربع'}
              </span>
            </div>
          )}

          {totalMetric && totalMetric.value !== null && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-[var(--color-text-muted)]">قیمت کل:</span>
              <span className="font-mono font-semibold whitespace-nowrap tabular-nums">
                {formatAsciiToPersianDigits(totalMetric.value)} {totalMetric.unit || 'میلیون تومان'}
              </span>
            </div>
          )}

          {perSqmMetric && perSqmMetric.value !== null && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-[var(--color-text-muted)]">قیمت هر متر:</span>
              <span className="font-mono font-semibold whitespace-nowrap tabular-nums">
                {formatAsciiToPersianDigits(perSqmMetric.value)} {perSqmMetric.unit || 'میلیون تومان/مترمربع'}
              </span>
            </div>
          )}

          {dealPerSqmMetric && dealPerSqmMetric.value !== null && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-[var(--color-text-muted)]">ارزش برآوردی (تخمینی):</span>
              <span className="font-mono whitespace-nowrap tabular-nums text-slate-700 dark:text-[var(--color-text-secondary)]">
                {formatAsciiToPersianDigits(dealPerSqmMetric.value)} {dealPerSqmMetric.unit || 'میلیون تومان/مترمربع'}
              </span>
            </div>
          )}

          {sampleCountMetric && sampleCountMetric.value !== null && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-[var(--color-text-muted)]">نمونه‌های معتبر:</span>
              <span className="font-mono tabular-nums">
                {formatAsciiToPersianDigits(sampleCountMetric.value)} {sampleCountMetric.unit || 'آگهی'}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[var(--color-text-muted)]">
            <span>وضعیت داده:</span>
            <span>
              {METRIC_STATUS_LABELS_FA[
                (totalMetric?.status || perSqmMetric?.status || 'verified') as keyof typeof METRIC_STATUS_LABELS_FA
              ] || 'تأییدشده'}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons (>= 44px touch target) */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-[var(--color-border-subtle)]">
        {allowedActions.includes('show-on-map') && (
          <button
            type="button"
            onClick={() => onAction?.('show-on-map', item)}
            aria-label={`نمایش ${item.title} روی نقشه`}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[var(--color-border-strong)] dark:text-[var(--color-text-primary)] dark:hover:bg-[var(--color-bg-elevated)]"
          >
            نمایش روی نقشه
          </button>
        )}
        {allowedActions.includes('add-to-compare') && (
          <button
            type="button"
            onClick={() => onAction?.('add-to-compare', item)}
            aria-label={`افزودن ${item.title} به مقایسه`}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[var(--color-border-strong)] dark:text-[var(--color-text-primary)] dark:hover:bg-[var(--color-bg-elevated)]"
          >
            مقایسه
          </button>
        )}
        {allowedActions.includes('open-detail') && (
          <button
            type="button"
            onClick={() => onAction?.('open-detail', item)}
            aria-label={`مشاهده جزئیات ${item.title}`}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-[var(--color-brand-600)] dark:text-white"
          >
            مشاهده جزئیات
          </button>
        )}
      </div>
    </article>
  );
};
