/**
 * RT-UI-SEARCH-001 (Stages 27 & 30) | Specialized Multi-Domain Result Cards,
 * LIST/MAP/SPLIT Synchronized Views, Zero-Result Assistant & Discovery Recommendations
 */

import React, { useState } from 'react';
import { AlertTriangle, Compass, MapPin, RefreshCw, Sparkles } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type {
  RecommendationCardItem,
  SearchExecutionResponse,
  SearchViewMode,
} from '../models/search.types';

export interface SearchResultsAndDiscoveryGridProps {
  searchResponse: SearchExecutionResponse;
  viewMode?: SearchViewMode;
  recommendations: RecommendationCardItem[];
  personalizationOn: boolean;
  onTogglePersonalization: (next: boolean) => void;
  onDismissRecommendation: (id: string) => void;
  onResetFilters: () => void;
  onApplySuggestedQuery: (q: string) => void;
  onSelectNeighborhoodId?: (hoodId: string) => void;
  onNavigatePath?: (path: string) => void;
  onRetryFailedSources?: () => void;
}

export const SearchResultsAndDiscoveryGrid: React.FC<SearchResultsAndDiscoveryGridProps> = ({
  searchResponse,
  viewMode = 'LIST',
  recommendations,
  personalizationOn,
  onTogglePersonalization,
  onDismissRecommendation,
  onResetFilters,
  onApplySuggestedQuery,
  onSelectNeighborhoodId,
  onNavigatePath,
  onRetryFailedSources,
}) => {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const spatialResults = searchResponse.results.filter(
    (r) => r.document.lat !== undefined && r.document.lng !== undefined
  );

  const handleSelectResultEntity = (docId: string, neighborhoodId?: string) => {
    setSelectedDocId(docId);
    if (neighborhoodId && onSelectNeighborhoodId) {
      onSelectNeighborhoodId(neighborhoodId);
    }
  };

  const renderCards = () => (
    <div
      className={viewMode === 'LIST' ? 'flex flex-col gap-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}
      data-testid="search-results-list"
      data-view-mode={viewMode}
    >
      {searchResponse.results.map((item) => {
        const d = item.document;
        const hasCoords = d.lat !== undefined && d.lng !== undefined;
        const isSelected = selectedDocId === d.id;
        return (
          <article
            key={d.id}
            data-testid={`search-result-card-${d.id}`}
            onClick={() => handleSelectResultEntity(d.id, d.neighborhoodId)}
            className={`p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-2 cursor-pointer ${
              isSelected
                ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-[var(--color-brand-600)] ring-1 ring-[var(--color-brand-600)]'
                : 'bg-slate-50/80 dark:bg-[var(--color-bg-muted)] border-slate-200 dark:border-[var(--color-border-strong)]'
            }`}
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[var(--color-brand-600)] dark:text-emerald-300 font-bold text-[10.5px]">
                  {d.entityType} · {d.scope}
                </span>
                <span className="text-[10.5px] text-slate-500">
                  {hasCoords ? (
                    <>دقت مکانی: <strong>{d.locationPrecision}</strong></>
                  ) : (
                    <span data-testid={`search-result-no-coords-${d.id}`} className="text-amber-700 dark:text-amber-300 font-bold">
                      وضعیت مکان: فاقد مختصات نقشه
                    </span>
                  )}
                </span>
              </div>
              <strong className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                {d.titleFa}
              </strong>
              <div className="text-[11px] text-slate-600 dark:text-[var(--color-text-secondary)] font-medium">{d.subtitleFa}</div>
              <p className="text-[11px] text-slate-500 line-clamp-2">{d.summaryFa}</p>

              {d.pricePerSqmMillionToman !== undefined && (
                <div className="pt-1 flex flex-wrap items-center gap-2 text-[10.5px] tabular-nums">
                  <span className="px-2 py-0.5 rounded bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)]">
                    پیشنهادی آگهی: <strong>{toPersianNum(d.pricePerSqmMillionToman)}</strong> میلیون تومان / مترمربع
                  </span>
                  {d.dealPricePerSqmMillionToman !== undefined && (
                    <span className="px-2 py-0.5 rounded bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)]">
                      سناریوی معامله غیرثبتی · میلیون تومان / مترمربع: <strong>{toPersianNum(d.dealPricePerSqmMillionToman)}</strong>
                    </span>
                  )}
                  {d.hedonicValuationPerSqmMillionToman !== undefined && (
                    <span className="px-2 py-0.5 rounded bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)]">
                      ارزش‌گذاری هدونیک · میلیون تومان / مترمربع: <strong>{toPersianNum(d.hedonicValuationPerSqmMillionToman)}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200/70 dark:border-[var(--color-border-strong)] flex flex-wrap items-center justify-between gap-2">
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectResultEntity(d.id, d.neighborhoodId);
                  if (onNavigatePath) onNavigatePath(d.urlPath);
                }}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold text-[11px] cursor-pointer"
              >
                مشاهده در بخش تخصصی
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );

  const renderMapCompanion = () => (
    <div
      data-testid="search-map-companion-panel"
      className="p-3.5 rounded-xl bg-slate-100/90 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-[var(--color-brand-600)]" />
          <span>موجودیت‌های مکانی همگام با نقشه اصلی ({toPersianNum(spatialResults.length)} مورد دارای مختصات)</span>
        </strong>
        <span className="text-[10.5px] text-slate-500">انتخاب هر پین، موقعیت آن را روی نقشه اصلی فعال می‌کند</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {spatialResults.map((r) => {
          const d = r.document;
          const active = selectedDocId === d.id;
          return (
            <button
              key={d.id}
              type="button"
              data-testid={`search-map-pin-${d.id}`}
              onClick={() => handleSelectResultEntity(d.id, d.neighborhoodId)}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${
                active
                  ? 'bg-[var(--color-brand-600)] text-white border-[var(--color-brand-600)]'
                  : 'bg-white dark:bg-[var(--color-bg-surface)] text-slate-800 dark:text-[var(--color-text-primary)] border-slate-300 dark:border-[var(--color-border-strong)]'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{d.neighborhoodName || d.titleFa.slice(0, 24)}</span>
              {d.pricePerSqmMillionToman !== undefined && (
                <span className="opacity-85 tabular-nums">({toPersianNum(d.pricePerSqmMillionToman)} م/متر)</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {searchResponse.partialSourceFailure && (
        <div
          data-testid="search-partial-failure-banner"
          role="status"
          className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-2"
        >
          <div className="space-y-0.5">
            <strong className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>نتایج به‌صورت ناقص دریافت شده‌اند.</span>
            </strong>
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              بعضی منابع در دسترس نبودند؛ نتایج منابع دیگر نمایش داده شده است.
            </p>
          </div>
          {onRetryFailedSources && (
            <button
              type="button"
              data-testid="btn-retry-failed-search-sources"
              onClick={onRetryFailedSources}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تلاش مجدد منابع ناموفق</span>
            </button>
          )}
        </div>
      )}

      {searchResponse.results.length === 0 && searchResponse.zeroResultAssistant ? (
        <div
          data-testid="search-zero-result-assistant"
          className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2.5"
        >
          <strong className="text-sm font-bold text-slate-900 dark:text-white block">
            نتیجه‌ای با این ترکیب پیدا نشد
          </strong>
          <p className="text-slate-600 dark:text-[var(--color-text-secondary)]">{searchResponse.zeroResultAssistant.reasonFa}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onResetFilters}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
            >
              {searchResponse.zeroResultAssistant.relaxedFilterLabelFa || 'حذف فیلترها'}
            </button>
            {searchResponse.zeroResultAssistant.suggestedQueries.map((sq) => (
              <button
                key={sq}
                type="button"
                onClick={() => onApplySuggestedQuery(sq)}
                className="min-h-[40px] px-2.5 py-1 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-300 dark:border-[var(--color-border-strong)] font-bold cursor-pointer"
              >
                {sq}
              </button>
            ))}
          </div>
        </div>
      ) : viewMode === 'MAP' ? (
        <div className="space-y-3" data-testid="search-map-mode-view">
          {renderMapCompanion()}
          {renderCards()}
        </div>
      ) : viewMode === 'SPLIT' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start" data-testid="search-split-mode-view">
          <div className="lg:col-span-7">{renderCards()}</div>
          <div className="lg:col-span-5">{renderMapCompanion()}</div>
        </div>
      ) : (
        renderCards()
      )}

      <div className="pt-3 border-t border-slate-200 dark:border-[var(--color-border-subtle)] space-y-2.5" data-testid="search-discovery-recommendations">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>کشف محتوا و پیشنهادهای مرتبط (با توضیح شفاف علت پیشنهاد)</span>
          </strong>
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-[var(--color-text-secondary)] cursor-pointer">
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
              className="p-3 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] flex flex-col justify-between gap-2"
            >
              <div>
                <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-[var(--color-brand-600)] dark:text-emerald-300">
                  <span className="flex items-center gap-1">
                    <Compass className="w-3 h-3" />
                    {rec.reasonFa}
                  </span>
                  <button
                    type="button"
                    aria-label="عدم نمایش این پیشنهاد"
                    onClick={() => onDismissRecommendation(rec.id)}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer px-1"
                  >
                    ×
                  </button>
                </div>
                <strong className="font-bold text-slate-900 dark:text-white block mt-1">{rec.titleFa}</strong>
                <p className="text-[10.5px] text-slate-500 mt-0.5">{rec.subtitleFa}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {rec.isDemoSample && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    نمونه نمایشی
                  </span>
                )}
                {rec.metricBadgeFa && (
                  <span className="px-2 py-0.5 rounded bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] text-[10.5px] font-bold">
                    {rec.metricBadgeFa}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
