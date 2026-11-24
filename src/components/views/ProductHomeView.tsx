/**
 * @file src/components/views/ProductHomeView.tsx
 * @description Focused 5-section Homepage Launchpad (AUD-002, AUD-003, AUD-007, AUD-008, AUD-014).
 * Hero + Map Preview -> Market Snapshot + Decision Toolbox Launchpad -> Top 6 Curated Neighborhoods -> Research/Services + Methodology Trust Strip.
 */
import React, { useState, useMemo } from 'react';
import { SlidersHorizontal, ChevronLeft } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useExchangeRateSnapshot } from '../../features/commerce/services/exchangeRateClient';
import type { CityId, FeatureFlags } from '../../types/models';
import type { ModuleSubTabId } from '../../navigation/registry/route.types';
import { MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { explainNeighborhoodRecommendation } from '../useEvaluatedNeighborhoods';
import { useDealPriceByHoodIdMap } from '../useDealPriceByHoodIdMap';
import { RadarLink } from '../ui/RadarPrimitives';
import { HomeHeroAndMapPreview } from '../../features/home/sections/HomeHeroAndMapPreview';
import {
  QuickAccessAndMarketSnapshotSection,
  ResearchServicesAndMethodologySection,
} from '../../features/home/sections/HomeMarketAndMethodologySections';
import { selectCuratedHomeNeighborhoods } from '../../features/home/services/homeDataAdapter';
import type { HomeResilienceScenarioId } from '../../features/home/types/home.types';
import { getNeighborhoodPricePresentation } from '../../features/neighborhoods/services/neighborhoodPricePresentation';

export interface ProductHomeViewProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector?: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenBudgetFilter: () => void;
  onOpenReverseBudget: () => void;
  onOpenHedonic: () => void;
  onOpenCompare: () => void;
  onOpenSmartSuggest: () => void;
  onOpenSuperModule: (tab: any) => void;
  onOpenListingVerifier?: () => void;
  initialListingVerdictText?: string;
  activeCity?: CityId;
  mode: 'rent' | 'buy';
  setMode: (m: 'rent' | 'buy') => void;
  targetSqm: number;
  totalRahnEquivalent: number;
  buyTotalBudget: number;
  counts: { green: number; yellow: number; red: number };
  featureFlags: FeatureFlags;
}

export function ProductHomeView(p: ProductHomeViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const rateState = useExchangeRateSnapshot();
  const isEn = radarLocale === 'en';
  const [resilienceScenario, setResilienceScenario] = useState<HomeResilienceScenarioId>('normal');
  const activeCity = p.activeCity || 'tehran';
  const dealPriceByHoodId = useDealPriceByHoodIdMap(p.evaluatedNeighborhoods);

  const featuredHoods = useMemo(
    () => selectCuratedHomeNeighborhoods(p.evaluatedNeighborhoods, 'editorial_curated').slice(0, 6),
    [p.evaluatedNeighborhoods],
  );
  const budgetDisplay = p.mode === 'buy'
    ? (isEn ? `${p.buyTotalBudget.toLocaleString('en-US')}M IRT` : `${toPersianNum(p.buyTotalBudget)} میلیون تومان`)
    : (isEn ? `${p.totalRahnEquivalent.toLocaleString('en-US')}M Deposit` : `${toPersianNum(p.totalRahnEquivalent)} میلیون تومان رهن کامل`);
  const fxBudget = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(p.mode === 'buy' ? p.buyTotalBudget : p.totalRahnEquivalent, intlCurrency, radarLocale, rateState.snapshot)})` : '';
  const topFeaturedScore = featuredHoods.length > 0 ? Math.max(...featuredHoods.map((h) => h.overallScore)) : undefined;
  const activeCityNameFa = MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران';

  return (
    <div
      className="w-full max-w-[1320px] mx-auto px-4 py-6 sm:py-8 space-y-8 animate-fadeIn text-[var(--color-text-primary)]"
      data-testid="product-home-view"
    >
      {/* 1. Hero Search + Buy/Rent Intent Switcher + Lightweight Spatial Preview */}
      <HomeHeroAndMapPreview
        evaluatedNeighborhoods={p.evaluatedNeighborhoods}
        selectedHood={p.selectedHood}
        activeCity={activeCity}
        mode={p.mode}
        onSelectMode={p.setMode}
        onSelectNeighborhood={p.onSelectNeighborhood}
        onOpenInspector={p.onOpenInspector}
        onNavigateView={p.onNavigateView}
        resilienceScenario={resilienceScenario}
      />

      {/* 2 & 3. City Market Snapshot Strip + 3-Card Decision Toolbox Launchpad */}
      <QuickAccessAndMarketSnapshotSection
        evaluatedNeighborhoods={p.evaluatedNeighborhoods}
        activeCity={activeCity}
        resilienceScenario={resilienceScenario}
        onChangeResilienceScenario={setResilienceScenario}
        onNavigateView={p.onNavigateView}
        onOpenHedonic={p.onOpenHedonic}
      />

      {/* 4. Top 6 Curated Read-Only Neighborhood Preview Cards */}
      <section aria-labelledby="home-featured-hoods-heading" data-testid="home-featured-neighborhoods-section" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 id="home-featured-hoods-heading" className="text-lg sm:text-xl font-bold text-[var(--color-text-primary)]">
              محله‌های منتخب {activeCityNameFa}
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              پایش نمونه محله‌های شاخص بر اساس پوشش داده · بودجه فعال:{' '}
              <strong className="tabular-nums text-[var(--color-text-primary)]">{budgetDisplay}{fxBudget}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={p.onOpenBudgetFilter}
              className="min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-xs font-bold text-[var(--color-text-primary)] inline-flex items-center gap-1.5 cursor-pointer hover:bg-[var(--color-bg-muted)] transition"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>تنظیم بودجه</span>
            </button>
            <RadarLink
              href="/areas"
              onNavigate={() => p.onNavigateView('discover')}
              className="min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[8px] text-xs font-bold text-[var(--color-brand-fg)] hover:underline gap-1"
            >
              <span>مشاهده همه محله‌ها</span>
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </RadarLink>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredHoods.map((hood) => {
            const dealPerSqm = dealPriceByHoodId.get(hood.id) ?? hood.buyPerSqm;
            const pres = getNeighborhoodPricePresentation({
              hood,
              cityId: activeCity,
              dealPerSqm,
              targetSqm: p.targetSqm,
              areaUnit,
              intlCurrency,
              exchangeRateRef: rateState.snapshot,
            });
            const explain = explainNeighborhoodRecommendation(hood, { mode: p.mode, topReferenceScore: topFeaturedScore });
            const isSelected = p.selectedHood.id === hood.id;

            return (
              <article
                key={hood.id}
                className={`p-4 rounded-[12px] bg-[var(--color-bg-surface)] border transition flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'border-[var(--color-brand-600)] ring-1 ring-[var(--color-brand-600)]/30'
                    : 'border-[var(--color-border-subtle)] hover:border-[var(--color-brand-600)]/60'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                    <span className="truncate">{hood.zone}</span>
                    <span className="font-mono font-bold text-[var(--color-text-primary)] tabular-nums">{toPersianNum(hood.overallScore)}/۱۰</span>
                  </div>
                  <h3 className="text-base font-bold text-[var(--color-text-primary)]">محله {hood.name}</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">
                    {explain.nonCompensatoryWarningsFa[0] || explain.primaryReasonFa}
                  </p>
                  <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-1 text-xs tabular-nums">
                    <div className="flex justify-between gap-2">
                      <span className="text-[var(--color-text-muted)]">{p.mode === 'buy' ? `${pres.buyReferenceLabelFa}:` : `${pres.rahnAreaLabelFa}:`}</span>
                      <strong className="text-[var(--color-text-primary)]">{p.mode === 'buy' ? pres.buyValueWithUnitFa : pres.rahnValueWithUnitFa}</strong>
                    </div>
                    <div className="flex justify-between gap-2 text-[var(--color-text-muted)]">
                      <span>{p.mode === 'buy' ? `${pres.rahnAreaLabelFa}:` : `${pres.buyReferenceLabelFa}:`}</span>
                      <span>{p.mode === 'buy' ? pres.rahnValueWithUnitFa : pres.buyValueWithUnitFa}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-2.5 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs">
                  <span className={hood.status === 'green' ? 'text-[var(--color-brand-600)] dark:text-emerald-400 font-bold' : 'text-[var(--color-text-muted)]'}>
                    {hood.status === 'green' ? 'در محدوده بودجه' : `${toPersianNum(hood.diffPercent)}٪ بالاتر از بودجه`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (p.onOpenInspector) p.onOpenInspector(hood);
                      else p.onSelectNeighborhood(hood);
                    }}
                    className="min-h-[44px] md:min-h-[36px] inline-flex items-center px-2 font-bold text-[var(--color-brand-fg)] hover:underline cursor-pointer"
                  >
                    شناسنامه محله ←
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 5. Research Briefs, Properties/Services Entry & Compact Methodology Trust Strip */}
      <ResearchServicesAndMethodologySection
        evaluatedNeighborhoods={p.evaluatedNeighborhoods}
        activeCity={activeCity}
        resilienceScenario={resilienceScenario}
        onChangeResilienceScenario={setResilienceScenario}
        onNavigateView={p.onNavigateView}
        onOpenHedonic={p.onOpenHedonic}
      />
    </div>
  );
}
