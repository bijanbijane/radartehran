/**
 * RT-UI-SEARCH-001 (Stages 27 & 30) | Specialized Multi-Domain Result Cards,
 * Zero-Result Assistant & Explainable Discovery Recommendations Grid
 */

import React from 'react';
import { Compass, Sparkles } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type {
  RecommendationCardItem,
  SearchExecutionResponse,
} from '../models/search.types';

export interface SearchResultsAndDiscoveryGridProps {
  searchResponse: SearchExecutionResponse;
  recommendations: RecommendationCardItem[];
  personalizationOn: boolean;
  onTogglePersonalization: (next: boolean) => void;
  onDismissRecommendation: (id: string) => void;
  onResetFilters: () => void;
  onApplySuggestedQuery: (q: string) => void;
  onSelectNeighborhoodId?: (hoodId: string) => void;
  onNavigatePath?: (path: string) => void;
}

export const SearchResultsAndDiscoveryGrid: React.FC<SearchResultsAndDiscoveryGridProps> = ({
  searchResponse,
  recommendations,
  personalizationOn,
  onTogglePersonalization,
  onDismissRecommendation,
  onResetFilters,
  onApplySuggestedQuery,
  onSelectNeighborhoodId,
  onNavigatePath,
}) => {
  return (
    <div className="space-y-4">
      {searchResponse.results.length === 0 && searchResponse.zeroResultAssistant ? (
        <div
          data-testid="search-zero-result-assistant"
          className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2.5"
        >
          <strong className="text-sm font-black text-slate-900 dark:text-white block">
            نتیجه‌ای با این ترکیب پیدا نشد
          </strong>
          <p className="text-slate-600 dark:text-slate-300">{searchResponse.zeroResultAssistant.reasonFa}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onResetFilters}
              className="px-3 py-1.5 rounded-lg bg-[#176B63] text-white font-bold cursor-pointer"
            >
              {searchResponse.zeroResultAssistant.relaxedFilterLabelFa || 'حذف فیلترها'}
            </button>
            {searchResponse.zeroResultAssistant.suggestedQueries.map((sq) => (
              <button
                key={sq}
                type="button"
                onClick={() => onApplySuggestedQuery(sq)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
              >
                {sq}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="search-results-list">
          {searchResponse.results.map((item) => {
            const d = item.document;
            return (
              <article
                key={d.id}
                data-testid={`search-result-card-${d.id}`}
                className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-[#176B63] dark:text-emerald-300 font-bold text-[10.5px]">
                      {d.entityType} · {d.scope}
                    </span>
                    <span className="text-[10.5px] text-slate-500">
                      دقت مکانی: <strong>{d.locationPrecision}</strong>
                    </span>
                  </div>
                  <strong className="text-xs sm:text-sm font-black text-slate-900 dark:text-white block">
                    {d.titleFa}
                  </strong>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">{d.subtitleFa}</div>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{d.summaryFa}</p>

                  {d.pricePerSqmMillionToman !== undefined && (
                    <div className="pt-1 flex flex-wrap items-center gap-2 text-[10.5px] tabular-nums">
                      <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        پیشنهادی آگهی: <strong>{toPersianNum(d.pricePerSqmMillionToman)}</strong> م.ت/متر
                      </span>
                      {d.dealPricePerSqmMillionToman !== undefined && (
                        <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                          معامله سناریویی: <strong>{toPersianNum(d.dealPricePerSqmMillionToman)}</strong> م.ت/متر
                        </span>
                      )}
                      {d.hedonicValuationPerSqmMillionToman !== undefined && (
                        <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                          ارزش‌گذاری هدونیک: <strong>{toPersianNum(d.hedonicValuationPerSqmMillionToman)}</strong> م.ت/متر
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {item.explanationFa.slice(0, 2).map((exp, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-bold text-[10px]"
                      >
                        چرا این نتیجه؟ {exp}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (d.neighborhoodId && onSelectNeighborhoodId) onSelectNeighborhoodId(d.neighborhoodId);
                      if (onNavigatePath) onNavigatePath(d.urlPath);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#176B63] text-white font-bold text-[11px] cursor-pointer"
                  >
                    مشاهده در بخش تخصصی
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5" data-testid="search-discovery-recommendations">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#176B63]" />
            <span>کشف محتوا و پیشنهادهای مرتبط (با توضیح شفاف علت پیشنهاد)</span>
          </strong>
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={personalizationOn}
              onChange={(e) => onTogglePersonalization(e.target.checked)}
            />
            <span>پیشنهادهای مبتنی بر جست‌وجوهای ذخیره‌شده شما فعال باشد</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              data-testid={`recommendation-card-${rec.id}`}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2"
            >
              <div>
                <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-[#176B63] dark:text-emerald-300">
                  <span className="flex items-center gap-1">
                    <Compass className="w-3 h-3" />
                    {rec.reasonFa}
                  </span>
                  <button
                    type="button"
                    aria-label="عدم نمایش این پیشنهاد"
                    onClick={() => onDismissRecommendation(rec.id)}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
                <strong className="font-black text-slate-900 dark:text-white block mt-1">{rec.titleFa}</strong>
                <p className="text-[10.5px] text-slate-500 mt-0.5">{rec.subtitleFa}</p>
              </div>
              {rec.metricBadgeFa && (
                <span className="self-start px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold">
                  {rec.metricBadgeFa}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
