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
        <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-[#176B63] dark:text-emerald-400" />
          <span>گزارش‌های تحلیلی و جمع‌بندی محدوده</span>
        </h3>
        <button
          type="button"
          onClick={onOpenMethodology}
          className="text-xs font-bold text-[#176B63] dark:text-emerald-400 hover:underline cursor-pointer"
        >
          مشاهده جزئیات روش‌شناسی
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((rep) => (
          <article
            key={rep.id}
            className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2.5 text-xs"
          >
            <div className="text-[11px] text-[#586760] dark:text-slate-400 tabular-nums">
              {rep.scopeLabelFa} · {rep.periodLabelFa} · {toPersianNum(rep.sampleCount)} نمونه · {INDICATOR_STATUS_LABELS_FA[rep.status]}
            </div>
            <h4 className="text-sm font-bold text-[#182522] dark:text-white">{rep.titleFa}</h4>
            <p className="text-[#34433E] dark:text-slate-300 leading-relaxed">{rep.summaryFa}</p>
            <ul className="space-y-1 text-[11px] text-[#586760] dark:text-slate-400 list-disc pr-4">
              {rep.keyTakeawaysFa.map((tk, i) => (
                <li key={i}>{tk}</li>
              ))}
            </ul>
            <div className="pt-2 border-t border-[#DCE3DF]/80 dark:border-slate-800 text-[10.5px] text-[#586760] dark:text-slate-400">
              انتشار: {rep.publishedJalali} · روش: {rep.methodologyId} · منابع: {rep.sourceIds.join(', ')}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
