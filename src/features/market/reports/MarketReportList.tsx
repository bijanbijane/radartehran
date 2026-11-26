import React from 'react';
import { FileText } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { INDICATOR_STATUS_LABELS_FA } from '../indicators/IndicatorRegistry';
import type { MarketReportItem } from '../types/market.types';

export interface MarketReportListProps {
  reports: MarketReportItem[];
  onOpenMethodology: () => void;
}

export const MarketReportList: React.FC<MarketReportListProps> = ({
  reports,
  onOpenMethodology,
}) => {
  return (
    <section
      aria-label="گزارش‌های تحلیلی بازار"
      data-testid="market-reports-section"
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
          <span>گزارش‌های تحلیلی و جمع‌بندی محدوده</span>
        </h2>
        <button
          type="button"
          onClick={onOpenMethodology}
          className="min-h-11 px-2 text-xs font-bold text-[var(--color-brand-600)] dark:text-emerald-400 hover:underline cursor-pointer"
        >
          مشاهده جزئیات روش‌شناسی
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((rep) => (
          <article
            key={rep.id}
            className="p-4 rounded-[12px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-2.5 text-xs"
          >
            <div className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] tabular-nums">
              {rep.scopeLabelFa} · {rep.periodLabelFa} · {toPersianNum(rep.sampleCount)} نمونه · {INDICATOR_STATUS_LABELS_FA[rep.status]}
            </div>
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white">{rep.titleFa}</h3>
            <p className="text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)] leading-relaxed">{rep.summaryFa}</p>
            <ul className="space-y-1 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] list-disc pr-4">
              {rep.keyTakeawaysFa.map((tk, i) => (
                <li key={i}>{tk}</li>
              ))}
            </ul>
            <div className="pt-2 border-t border-[var(--color-border-subtle)]/80 dark:border-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              انتشار: {rep.publishedJalali} · روش: {rep.methodologyId} · منابع: {rep.sourceIds.join(', ')}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
