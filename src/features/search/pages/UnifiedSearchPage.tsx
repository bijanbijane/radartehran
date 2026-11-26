/**
 * @file src/features/search/pages/UnifiedSearchPage.tsx
 * @description Unified Search & Discovery Page shell integrating SearchInput, Filters, and Results (Stage 5).
 */

import React, { useState } from 'react';
import {
  SearchActiveFilters,
  SearchEmptyState,
  SearchFilterPanel,
  SearchInput,
  SearchResultCount,
  SearchSuggestions,
} from '../../../shared/search-ui';
import { formatAreaValueFa, formatMoneyValueFa, type AreaUnit } from '../../../platform/search';
import { useUnifiedSearch } from '../hooks/useUnifiedSearch';

export interface UnifiedSearchPageProps {
  cityId?: string;
  areaUnit?: AreaUnit;
  onSelectEntity?: (entityType: string, entityId: string) => void;
}

export const UnifiedSearchPage: React.FC<UnifiedSearchPageProps> = ({
  cityId = 'tehran',
  areaUnit = 'sqm',
  onSelectEntity,
}) => {
  const {
    request,
    response,
    isLoading,
    suggestions,
    hoveredResultId,
    setHoveredResultId,
    setRawQuery,
    submitSearch,
    addOrUpdateFilter,
    removeFilter,
    resetFilters,
    setScope,
  } = useUnifiedSearch({ initialCityId: cityId, areaUnit });

  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);

  return (
    <section dir="rtl" aria-labelledby="unified-search-heading" className="mx-auto max-w-6xl space-y-4 p-4 text-right" data-testid="unified-search-page">
      <header className="space-y-1 border-b border-[var(--color-border-subtle)] pb-3">
        <h1 id="unified-search-heading" className="text-xl sm:text-2xl font-bold text-[var(--color-text-primary)]">جست‌وجوی سراسری رادار تهران</h1>
        <p className="text-sm text-[var(--color-text-muted)]">جست‌وجو در محله‌ها، آگهی‌ها، املاک، ساختمان‌ها، خدمات تخصصی و تحلیل بازار در یک مسیر یکپارچه.</p>
      </header>
      <div className="relative">
        <SearchInput
          value={request.rawQuery}
          scope={request.scope}
          isLoading={isLoading}
          onChange={(val) => {
            setRawQuery(val);
            setSuggestionsOpen(true);
            setActiveSuggestionIdx(0);
          }}
          onDebouncedChange={(val) => setRawQuery(val)}
          onSubmit={(val) => {
            submitSearch(val);
            setSuggestionsOpen(false);
          }}
          onEscape={() => setSuggestionsOpen(false)}
          onArrowMove={(dir) => {
            if (suggestions.length === 0) return;
            setActiveSuggestionIdx((prev) =>
              dir === 'down' ? (prev + 1) % suggestions.length : (prev - 1 + suggestions.length) % suggestions.length
            );
          }}
          onScopeChange={setScope}
        />

        {suggestionsOpen && suggestions.length > 0 && (
          <div className="absolute right-0 left-0 z-30 mt-1">
            <SearchSuggestions
              suggestions={suggestions}
              activeIndex={activeSuggestionIdx}
              isOpen={suggestionsOpen}
              onSelect={(item) => {
                setScope(item.targetScope);
                submitSearch(item.queryText);
                setSuggestionsOpen(false);
              }}
            />
          </div>
        )}
      </div>

      <SearchFilterPanel
        filters={request.filters}
        areaUnit={areaUnit}
        cityId={request.cityId}
        onAddOrUpdateFilter={addOrUpdateFilter}
        onResetFilters={resetFilters}
      />

      <SearchActiveFilters
        filters={request.filters}
        areaUnit={areaUnit}
        onRemoveFilter={removeFilter}
        onClearAll={resetFilters}
      />

      {response && (
        <SearchResultCount
          displayState={isLoading ? 'ResultsLoading' : response.displayState}
          receivedCount={response.totalReceivedCount}
          totalServerCount={response.totalServerCount}
          appliedFilterCount={response.appliedFilterCount}
          warningsFa={response.warningsFa}
        />
      )}

      {response && response.items.length === 0 && !isLoading ? (
        <SearchEmptyState
          rawQuery={request.rawQuery}
          activeFilterCount={request.filters.length}
          isError={response.displayState === 'Error'}
          onExplicitClearFilters={resetFilters}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(response?.items ?? []).map((hit) => (
            <article
              key={`${hit.domainType}:${hit.id}`}
              onMouseEnter={() => setHoveredResultId(hit.id)}
              onMouseLeave={() => setHoveredResultId(null)}
              className={`rounded-2xl border p-4 transition-colors ${
                hoveredResultId === hit.id
                  ? 'border-slate-900 bg-slate-50 dark:border-[var(--color-border-strong)] dark:bg-[var(--color-bg-muted)]'
                  : 'border-slate-200 bg-white dark:border-[var(--color-border-subtle)] dark:bg-[var(--color-bg-surface)]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-[var(--color-text-primary)]">
                  {hit.titleFa}
                </h3>
                <span className="shrink-0 text-xs text-slate-500 dark:text-[var(--color-text-muted)]">
                  {hit.cityNameFa}
                </span>
              </div>
              {hit.subtitleFa && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-[var(--color-text-muted)]">
                  {hit.subtitleFa}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-700 dark:text-[var(--color-text-primary)]">
                {hit.area && <span>{formatAreaValueFa(hit.area)}</span>}
                {hit.pricing?.pricePerSqm && (
                  <span>هر متر: {formatMoneyValueFa(hit.pricing.pricePerSqm)}</span>
                )}
                {hit.pricing?.totalBuyPrice && (
                  <span>قیمت کل: {formatMoneyValueFa(hit.pricing.totalBuyPrice)}</span>
                )}
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => onSelectEntity?.(hit.domainType, hit.id)}
                  aria-label={`مشاهده جزئیات ${hit.titleFa}`}
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-[var(--color-border-strong)] dark:text-[var(--color-text-primary)] dark:hover:bg-[var(--color-bg-elevated)]"
                >
                  مشاهده جزئیات
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default UnifiedSearchPage;
