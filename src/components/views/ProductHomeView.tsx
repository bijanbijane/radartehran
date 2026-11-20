/**
 * @file src/components/views/ProductHomeView.tsx
 * @description Stage 14 (RT-UI-HOME-001) Homepage Experience Specification (< 260 lines).
 * Composes Hero + Map Preview, Quick Access, Market Snapshot, Curated Neighborhoods, Research, Services, Methodology & Footer.
 */
import React, { useState, useMemo } from 'react';
import { SlidersHorizontal, ChevronLeft, Scale, X } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useExchangeRateSnapshot } from '../../features/commerce/services/exchangeRateClient';
import type { CityId, FeatureFlags } from '../../types/models';
import type { ModuleSubTabId } from '../../navigation/registry/route.types';
import { MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { explainNeighborhoodRecommendation } from '../useEvaluatedNeighborhoods';
import { useDealPriceByHoodIdMap } from '../useDealPriceByHoodIdMap';
import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';
import { matchesPersianSearch } from '../../utils/security';
import { ListingVerdictHero } from '../listing/ListingVerdictHero';
import { BudgetFitVerdict } from '../listing/BudgetFitVerdict';
import { computePaginationSlice } from '../../utils/productViewRouterShellClasses';
import { RadarPaginationBar } from '../common/RadarPaginationBar';
import { HomeHeroAndMapPreview } from '../../features/home/sections/HomeHeroAndMapPreview';
import {
  QuickAccessAndMarketSnapshotSection,
  ResearchServicesAndMethodologySection,
} from '../../features/home/sections/HomeMarketAndMethodologySections';
import { selectCuratedHomeNeighborhoods } from '../../features/home/services/homeDataAdapter';
import type { HomeNeighborhoodSelectionMode, HomeResilienceScenarioId } from '../../features/home/types/home.types';
import {
  getNeighborhoodPricePresentation,
  getPriceBracketOptions,
  matchesFinancialBracket,
  type PriceBracketId,
} from '../../features/neighborhoods/services/neighborhoodPricePresentation';

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
  const [homeQuery, setHomeQuery] = useState<string>('');
  const [selectionMode, setSelectionMode] = useState<HomeNeighborhoodSelectionMode>('editorial_curated');
  const [resilienceScenario, setResilienceScenario] = useState<HomeResilienceScenarioId>('normal');
  const { comparisonArc } = useMapAdvancedOverlayState();
  const activeCity = p.activeCity || 'tehran';
  const [priceBracket, setPriceBracket] = useState<PriceBracketId>('all');
  const [homePage, setHomePage] = useState<number>(1), [homePageSize, setHomePageSize] = useState<number>(6);
  const dealPriceByHoodId = useDealPriceByHoodIdMap(p.evaluatedNeighborhoods);

  const filteredFeaturedPool = useMemo(() => {
    let list = selectCuratedHomeNeighborhoods(p.evaluatedNeighborhoods, selectionMode);
    if (priceBracket !== 'all') {
      list = list.filter((h) => matchesFinancialBracket(h, p.mode, p.targetSqm, dealPriceByHoodId.get(h.id) ?? h.buyPerSqm, priceBracket));
    }
    const q = homeQuery.trim();
    if (!q) return list;
    return list.filter((h) => matchesPersianSearch(h.name, q) || matchesPersianSearch(h.zone, q));
  }, [p.evaluatedNeighborhoods, dealPriceByHoodId, homeQuery, priceBracket, p.mode, p.targetSqm, selectionMode]);

  const homePaginationSlice = useMemo(() => computePaginationSlice(filteredFeaturedPool, homePage, homePageSize), [filteredFeaturedPool, homePage, homePageSize]);
  const featuredHoods = homePaginationSlice.items;
  const budgetDisplay = p.mode === 'buy'
    ? (isEn ? `${p.buyTotalBudget.toLocaleString('en-US')}M IRT` : `${toPersianNum(p.buyTotalBudget)} میلیون تومان`)
    : (isEn ? `${p.totalRahnEquivalent.toLocaleString('en-US')}M Deposit` : `${toPersianNum(p.totalRahnEquivalent)} میلیون تومان رهن کامل`);
  const fxBudget = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(p.mode === 'buy' ? p.buyTotalBudget : p.totalRahnEquivalent, intlCurrency, radarLocale, rateState.snapshot)})` : '';
  const topFeaturedScore = filteredFeaturedPool.length > 0 ? Math.max(...filteredFeaturedPool.map((h) => h.overallScore)) : undefined;
  const activeCityNameFa = MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران';

  return (
    <div className="w-full max-w-[1280px] mx-auto px-4 py-6 sm:py-10 space-y-12 animate-fadeIn text-[#182522] dark:text-slate-100" data-testid="product-home-view">
      {/* 02. بخش معرفی و جست‌وجوی اصلی (Hero + Global Search + Lightweight Spatial Map Preview) */}
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

      {/* 03 & 04. مسیرهای دسترسی سریع و نمای کلی بازار (Quick Access + Market Snapshot) */}
      <QuickAccessAndMarketSnapshotSection
        evaluatedNeighborhoods={p.evaluatedNeighborhoods}
        activeCity={activeCity}
        resilienceScenario={resilienceScenario}
        onChangeResilienceScenario={setResilienceScenario}
        onNavigateView={p.onNavigateView}
        onOpenHedonic={p.onOpenHedonic}
      />

      {/* 05. محله‌های منتخب — Featured Neighborhoods (Section 14.8) */}
      <section aria-labelledby="home-featured-hoods-heading" data-testid="home-featured-neighborhoods-section" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 id="home-featured-hoods-heading" className="text-lg sm:text-xl font-extrabold text-[#182522] dark:text-white">
              محله‌های {activeCityNameFa} را دقیق‌تر بشناسید
            </h2>
            <p className="text-xs text-[#34433E] dark:text-slate-400 mt-0.5">
              معرفی مستند محله‌ها بر پایه پوشش اطلاعاتی، کیفیت داده و تنوع جغرافیایی · بودجه فعال: <strong className="tabular-nums">{budgetDisplay}{fxBudget}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="روش انتخاب محله‌های منتخب" className="inline-flex items-center bg-[#F1F4F2] dark:bg-slate-800 p-0.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 text-[11px]">
              {([
                { id: 'editorial_curated', label: 'منتخب تحریریه‌ای' },
                { id: 'data_completeness', label: 'کیفیت و پوشش داده' },
                { id: 'budget_fit', label: 'انطباق با بودجه' },
              ] as const).map((m) => (
                <button key={m.id} type="button" onClick={() => { setSelectionMode(m.id); setHomePage(1); }} className={`px-2.5 py-1 rounded-[6px] font-bold transition cursor-pointer ${selectionMode === m.id ? 'bg-white dark:bg-slate-900 text-[#182522] dark:text-white shadow-2xs' : 'text-[#34433E] dark:text-slate-400'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={p.onOpenBudgetFilter} className="px-2.5 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-[#182522] dark:text-slate-200 flex items-center gap-1 cursor-pointer">
              <SlidersHorizontal className="w-3.5 h-3.5" /><span>تنظیم بودجه</span>
            </button>
            <button type="button" onClick={() => p.onNavigateView('discover')} className="text-xs font-bold text-[#176B63] dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer">
              <span>همه محله‌ها</span><ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Price Bracket Filter + Local Filter Input */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div role="group" aria-label={p.mode === 'rent' ? 'بازه رهن کامل' : 'بازه قیمت کل خرید'} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {getPriceBracketOptions(p.mode, isEn).map((b) => (
              <button key={b.id} type="button" onClick={() => { setPriceBracket(b.id); setHomePage(1); }} className={`px-3 py-1 rounded-[8px] text-xs font-bold transition whitespace-nowrap cursor-pointer ${priceBracket === b.id ? 'bg-[#176B63] text-white' : 'text-[#34433E] dark:text-slate-400 bg-[#F1F4F2] dark:bg-slate-800'}`}>
                {b.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              type="text"
              value={homeQuery}
              onChange={(e) => { setHomeQuery(e.target.value); setHomePage(1); }}
              placeholder="فیلتر سریع نام محله..."
              aria-label="فیلتر محله‌های منتخب"
              className="px-3 pl-7 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-[#182522] dark:text-slate-100 focus:outline-none focus:border-[#176B63]"
            />
            {homeQuery && (
              <button type="button" aria-label="پاک کردن فیلتر محله‌ها" onClick={() => { setHomeQuery(''); setHomePage(1); }} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {featuredHoods.length === 0 ? (
          <div className="p-6 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 text-center space-y-2">
            <div className="text-sm font-bold text-[#182522] dark:text-white">محله‌ای با این فیلتر یافت نشد</div>
            <button type="button" onClick={() => { setHomeQuery(''); setPriceBracket('all'); setHomePage(1); }} className="px-3 py-1.5 rounded-[8px] bg-[#176B63] text-white text-xs font-bold cursor-pointer">بازنشانی فیلتر محله‌ها</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredHoods.map((hood) => {
              const dealPerSqm = dealPriceByHoodId.get(hood.id) ?? hood.buyPerSqm;
              const pres = getNeighborhoodPricePresentation({ hood, cityId: activeCity, dealPerSqm, targetSqm: p.targetSqm, areaUnit, intlCurrency, exchangeRateRef: rateState.snapshot });
              const explain = explainNeighborhoodRecommendation(hood, { mode: p.mode, topReferenceScore: topFeaturedScore });
              const isSelected = p.selectedHood.id === hood.id;
              const isArcActive = comparisonArc.active &&
                ((comparisonArc.hoodA?.id === p.selectedHood.id && comparisonArc.hoodB?.id === hood.id) ||
                 (comparisonArc.hoodB?.id === p.selectedHood.id && comparisonArc.hoodA?.id === hood.id));
              const fabricLabel = hood.overallScore >= 8 ? 'بافت نوساز و برنامه‌ریزی‌شده' : hood.overallScore >= 6.5 ? 'بافت میانی و متعادل' : 'بافت در حال نوسازی';

              return (
                <div key={hood.id} className={`p-4 rounded-[12px] bg-white dark:bg-slate-900 border transition flex flex-col justify-between group ${isSelected ? 'border-[#176B63] ring-1 ring-[#176B63]/30' : 'border-[#DCE3DF] dark:border-slate-800 hover:border-[#176B63]/60'}`}>
                  <div role="button" tabIndex={0} onClick={() => p.onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectNeighborhood(hood); } }} className="cursor-pointer">
                    <div className="flex items-center justify-between text-xs text-[#34433E] dark:text-slate-400">
                      <span className="truncate">{hood.zone} · {fabricLabel}</span>
                      <span className="font-mono font-bold text-[#182522] dark:text-slate-200 tabular-nums">{toPersianNum(hood.overallScore)}/۱۰</span>
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-[#182522] dark:text-white group-hover:text-[#176B63] dark:group-hover:text-emerald-400 transition">محله {hood.name}</h3>
                    <p className="text-xs text-[#34433E] dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {hood.pros || `محدوده شهری در ${hood.zone} با دسترسی مترو ${toPersianNum(hood.metro)}/۱۰ و شاخص هوا ${toPersianNum(hood.air)}/۱۰.`}
                    </p>
                    <p className={`mt-1 text-[11px] truncate ${explain.nonCompensatoryWarningsFa[0] ? 'text-amber-700 dark:text-amber-400 font-bold' : 'text-[#176B63] dark:text-emerald-400 font-semibold'}`}>
                      {explain.nonCompensatoryWarningsFa[0] || explain.primaryReasonFa}
                    </p>
                    <div className="pt-2.5 border-t border-[#DCE3DF]/70 dark:border-slate-800 space-y-1 text-xs tabular-nums">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500">{p.mode === 'buy' ? `${pres.buyReferenceLabelFa}:` : `${pres.rahnAreaLabelFa}:`}</span>
                        <strong className="text-[#182522] dark:text-white">{p.mode === 'buy' ? pres.buyValueWithUnitFa : pres.rahnValueWithUnitFa}</strong>
                      </div>
                      <div className="flex justify-between gap-2 text-[11px] text-slate-500">
                        <span>{p.mode === 'buy' ? `${pres.rahnAreaLabelFa}:` : `${pres.buyReferenceLabelFa}:`}</span>
                        <span>{p.mode === 'buy' ? pres.rahnValueWithUnitFa : pres.buyValueWithUnitFa}</span>
                      </div>
                      <div className="text-[11px] text-slate-500" title="سناریو v6.4 (برآورد غیرثبتی)">{pres.dealScenarioLineFa}</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-[#DCE3DF]/70 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className={hood.status === 'green' ? 'text-[#176B63] dark:text-emerald-400 font-bold' : 'text-slate-500'}>
                      {hood.status === 'green' ? 'در محدوده بودجه' : `${toPersianNum(hood.diffPercent)}٪ بالاتر از بودجه`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!isSelected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateMapAdvancedOverlayState({ comparisonArc: { active: !isArcActive, isPinned: !isArcActive, hoodA: p.selectedHood, hoodB: hood } });
                          }}
                          aria-label={`کمان مقایسه ${hood.name} روی نقشه`}
                          className={`p-1.5 rounded-[6px] border transition cursor-pointer ${isArcActive ? 'bg-[#176B63] text-white border-[#176B63]' : 'border-[#DCE3DF] dark:border-slate-700 text-[#34433E] dark:text-slate-300'}`}
                        >
                          <Scale className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button type="button" onClick={(e) => { e.stopPropagation(); if (p.onOpenInspector) p.onOpenInspector(hood); else p.onSelectNeighborhood(hood); }} className="font-bold text-[#176B63] dark:text-emerald-400 hover:underline cursor-pointer">
                        شناسنامه محله ←
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <RadarPaginationBar slice={homePaginationSlice} onPageChange={setHomePage} onPageSizeChange={(size) => { setHomePageSize(size); setHomePage(1); }} pageSizeOptions={[6, 12, 0]} isEn={isEn} compact />
      </section>

      {/* بودجه‌سنج و راستی‌آزمایی آگهی (ابزارهای تحلیلی متصل به سرویس‌های اصلی) */}
      <section aria-label="ابزارهای تطابق بودجه و بررسی آگهی" className="space-y-4">
        <BudgetFitVerdict neighborhoods={p.evaluatedNeighborhoods} mode={p.mode} budgetMillion={p.mode === 'buy' ? p.buyTotalBudget : p.totalRahnEquivalent} targetSqm={p.targetSqm} city={activeCity} selectedHoodId={p.selectedHood?.id} />
        <ListingVerdictHero evaluatedNeighborhoods={p.evaluatedNeighborhoods} cityKey={activeCity} defaultHoodName={p.selectedHood?.name} initialListingText={p.initialListingVerdictText} onOpenFullModal={p.onOpenListingVerifier} />
      </section>

      {/* 06, 07, 08, 09. گزارش‌ها، املاک و خدمات، روش‌شناسی داده و فوتر */}
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
