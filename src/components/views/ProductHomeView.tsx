/** @file src/components/views/ProductHomeView.tsx — Architectural Luxury Minimal Home View (< 275 lines) [RULE-01] */
import React, { useState, useMemo } from 'react';
import { Map as MapIcon, ArrowUpRight, Search, SlidersHorizontal, ChevronLeft, Scale, X } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import type { FeatureFlags } from '../../types/models';
import { aggregateNeighborhoodMarketMetrics } from '../../data/realMarketPriceAggregator';
import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';
import { matchesPersianSearch } from '../../utils/security';

export interface ProductHomeViewProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector?: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId) => void;
  onOpenBudgetFilter: () => void;
  onOpenReverseBudget: () => void;
  onOpenHedonic: () => void;
  onOpenCompare: () => void;
  onOpenSmartSuggest: () => void;
  onOpenSuperModule: (tab: any) => void;
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
  const isEn = radarLocale === 'en';
  const [homeQuery, setHomeQuery] = useState<string>('');
  const { comparisonArc } = useMapAdvancedOverlayState();
  const featuredHoods = useMemo(() => {
    const q = homeQuery.trim();
    if (!q) return p.evaluatedNeighborhoods.slice(0, 6);
    return p.evaluatedNeighborhoods.filter((h) => matchesPersianSearch(h.name, q) || matchesPersianSearch(h.zone, q)).slice(0, 8);
  }, [p.evaluatedNeighborhoods, homeQuery]);
  const bargainsCount = p.evaluatedNeighborhoods.reduce((acc, h) => acc + (h.bargains?.length || 0), 0);
  const budgetDisplay = p.mode === 'buy'
    ? (isEn ? `${p.buyTotalBudget.toLocaleString('en-US')}M IRT` : `${toPersianNum(p.buyTotalBudget)} م.ت`)
    : (isEn ? `${p.totalRahnEquivalent.toLocaleString('en-US')}M Deposit` : `${toPersianNum(p.totalRahnEquivalent)} م.ت رهن کامل`);
  const fxBudget = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(p.mode === 'buy' ? p.buyTotalBudget : p.totalRahnEquivalent, intlCurrency, radarLocale)})` : '';

  const pillars = [
    { id: 'map' as const, num: isEn ? '01' : '۰۱', title: isEn ? 'Interactive GIS Map Atlas' : 'اطلس مکانی و نقشه زنده GIS', sub: isEn ? 'Layered map of metro lines, traffic zones, and live neighborhood price heatmap' : 'محور اصلی رادار: نقشه لایه‌ای معابر، مترو، طرح ترافیک و هیت‌مپ قیمت', act: () => p.onNavigateView('map'), meta: isEn ? 'Primary Spatial Canvas' : 'محور اصلی سامانه' },
    { id: 'discover' as const, num: isEn ? '02' : '۰۲', title: isEn ? 'Neighborhood Explorer' : 'کشف محله‌ها', sub: isEn ? 'Filter neighborhoods by budget, air quality, metro access, and commute hubs' : 'بررسی محلات با فیلتر بودجه، ترافیک، کیفیت هوا و قطب‌های اداری', act: () => p.onNavigateView('discover'), meta: isEn ? `${p.counts.green} Within Budget` : `${toPersianNum(p.counts.green)} محله متناسب` },
    { id: 'intelligence' as const, num: isEn ? '03' : '۰۳', title: isEn ? 'Market Pulse & Intelligence' : 'نبض و هوش بازار', sub: isEn ? 'Bubble detection, v6.4 estimated closing prices, and undervalued areas' : 'حباب‌سنجی، قیمت قطعی پای معامله v6.4 و فرصت‌های خرید', act: () => p.onNavigateView('intelligence'), meta: isEn ? `${bargainsCount} Under-Market Deals` : `${toPersianNum(bargainsCount)} فایل زیر قیمت منصفانه` },
    { id: 'tools' as const, num: isEn ? '04' : '۰۴', title: isEn ? 'Real Estate Calculators' : 'جعبه‌ابزار معاملاتی', sub: isEn ? 'Hedonic valuation, mortgage simulator, 1405 tax, commission, and legal audit' : 'ارزش‌گذاری هدونیک، وام مسکن، مالیات ۱۴۰۵، ارث، کمیسیون و چک‌لیست بازدید', act: () => p.onNavigateView('tools'), meta: isEn ? '13 Specialized Tools' : '۱۳ ابزار محاسباتی تخصصی' },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-10 animate-fadeIn text-slate-900 dark:text-slate-100" data-testid="product-home-view">
      {/* 1. Architectural Editorial Hero Header */}
      <section className="space-y-5">
        <div className="space-y-2 border-b border-slate-200/80 dark:border-slate-800 pb-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-700 dark:text-emerald-400">
            <span>{isEn ? 'Housing Intelligence Platform' : 'سامانه تحلیلی رادار مسکن'}</span>
            <span aria-hidden="true">·</span>
            <span>{isEn ? 'Verified, Transparent, Objective' : 'هوشمند، شفاف، بی‌طرف'}</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-slate-950 dark:text-white leading-tight">
                {isEn ? 'Neighborhood Valuation & Livability Intelligence' : 'کالبدشکافی ارزش و کیفیت سکونت در محلات'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 font-medium max-w-2xl leading-relaxed">
                {isEn
                  ? `Analytical evaluation of ${p.evaluatedNeighborhoods.length} neighborhoods based on verified transaction benchmarks, urban livability scores, and your budget.`
                  : `ارزیابی تحلیلی ${toPersianNum(p.evaluatedNeighborhoods.length)} محله بر پایه داده‌های ثبت‌شده معاملات قطعی، شاخص‌های زیست‌شهری و انطباق با بودجه شما.`}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200/70 dark:border-slate-700/80 shrink-0 self-start md:self-end">
              <button type="button" onClick={() => p.setMode('buy')} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${p.mode === 'buy' ? 'bg-white dark:bg-slate-700 text-slate-950 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>{isEn ? 'Buy Property' : 'خرید و فروش'}</button>
              <button type="button" onClick={() => p.setMode('rent')} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${p.mode === 'rent' ? 'bg-white dark:bg-slate-700 text-slate-950 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>{isEn ? 'Rent / Deposit' : 'رهن و اجاره'}</button>
            </div>
          </div>
        </div>

        {/* 2. Unified Interactive Search & Budget Action Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3 sm:p-4 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex-1 flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={homeQuery}
                onChange={(e) => setHomeQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && featuredHoods.length > 0) {
                    p.onSelectNeighborhood(featuredHoods[0]);
                    p.onOpenInspector?.(featuredHoods[0]);
                  }
                }}
                placeholder={isEn ? 'Type neighborhood or district name to filter...' : 'جستجو و فیلتر فوری نام محله یا منطقه شهرداری...'}
                aria-label={isEn ? 'Filter neighborhoods on homepage' : 'جستجو و فیلتر محله در صفحه اصلی'}
                className="w-full bg-transparent text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />
              {homeQuery && (
                <button type="button" aria-label="پاک کردن جستجو" onClick={() => setHomeQuery('')} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 md:pt-0 border-t md:border-t-0 md:border-r border-slate-100 dark:border-slate-800 md:pr-4">
              <div className="text-start md:text-end text-xs">
                <span className="text-slate-400 block text-[11px]">{isEn ? 'Your Active Budget:' : 'مبنای محاسباتی شما:'}</span>
                <span className="font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">{budgetDisplay}<span className="text-slate-500 font-normal">{fxBudget}</span></span>
              </div>
              <button type="button" onClick={p.onOpenBudgetFilter} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap">
                <SlidersHorizontal className="w-3.5 h-3.5" /><span>{isEn ? 'Adjust Budget' : 'تغییر بودجه'}</span>
              </button>
              <button type="button" onClick={() => p.onNavigateView('map')} className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:opacity-90 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap">
                <MapIcon className="w-3.5 h-3.5" /><span>{isEn ? 'Full Map' : 'نقشه کامل'}</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <span className="text-[11px] font-bold text-slate-400 shrink-0">{isEn ? 'Quick Tools:' : 'میان‌برهای تحلیلی:'}</span>
            <button type="button" onClick={p.onOpenReverseBudget} className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold hover:bg-emerald-100 transition shrink-0 cursor-pointer">{isEn ? 'Reverse Budget Finder' : '💡 کاشف معکوس بودجه'}</button>
            <button type="button" onClick={p.onOpenHedonic} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 transition shrink-0 cursor-pointer">{isEn ? 'Hedonic Valuation' : '💎 کارشناسی ارزش ملک'}</button>
            <button type="button" onClick={p.onOpenCompare} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 transition shrink-0 cursor-pointer">{isEn ? 'Compare 2 Areas' : '⚖️ مقایسه دو محله'}</button>
            <button type="button" onClick={() => p.onOpenSuperModule('fake_detector')} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 transition shrink-0 cursor-pointer">{isEn ? 'Fake Listing Detector' : '🕵️ مچ‌گیر آگهی فیک'}</button>
          </div>
        </div>
      </section>

      {/* 3. Four Core Editorial Pillars */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">{isEn ? 'Platform Analytical Modules' : 'بخش‌های تحلیلی پلتفرم'}</h2>
          <span className="text-xs text-slate-500">{isEn ? `${p.counts.green} neighborhoods match your budget` : `${toPersianNum(p.counts.green)} محله کاملاً در محدوده توان مالی شما`}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pillars.map((item) => (
            <button key={item.id} type="button" onClick={item.act} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-all text-start flex flex-col justify-between group cursor-pointer shadow-xs">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2.5">
                  <span>{item.num}</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition">{item.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{item.sub}</p>
              </div>
              <div className="pt-3.5 mt-3.5 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-400">{item.meta}</div>
            </button>
          ))}
        </div>
      </section>

      {/* 4. Featured Neighborhoods — Architectural Editorial Cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">{homeQuery.trim() ? `نتایج جستجو (${toPersianNum(featuredHoods.length)})` : (isEn ? 'Featured Neighborhoods' : 'محله‌های شاخص و برگزیده')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{isEn ? 'Selecting any card centers the live map on that neighborhood' : 'کلیک روی هر کارت، نقشه زنده را روی همان محله متمرکز می‌کند'}</p>
          </div>
          <button type="button" onClick={() => p.onNavigateView('discover')} className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer">
            <span>{isEn ? 'All Neighborhoods' : 'همه محله‌ها'}</span><ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        {featuredHoods.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
            <div className="text-sm font-bold text-slate-900 dark:text-white">محله‌ای با عبارت «{homeQuery}» یافت نشد</div>
            <button type="button" onClick={() => setHomeQuery('')} className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer">نمایش محله‌های برگزیده</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {featuredHoods.map((hood) => {
              const unitBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit);
              const unitDeal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit);
              const isWithinBudget = hood.status === 'green';
              const isSelected = p.selectedHood.id === hood.id;
              const isArcActive = comparisonArc.active &&
                ((comparisonArc.hoodA?.id === p.selectedHood.id && comparisonArc.hoodB?.id === hood.id) ||
                 (comparisonArc.hoodB?.id === p.selectedHood.id && comparisonArc.hoodA?.id === hood.id));

              return (
                <div key={hood.id} onClick={() => p.onSelectNeighborhood(hood)} className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all cursor-pointer flex flex-col justify-between group shadow-xs hover:shadow-md ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'}`}>
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                      <span className="truncate max-w-[180px]">{hood.zone}</span>
                      <div className="flex items-center gap-1.5">
                        {isSelected && <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">فعال روی نقشه</span>}
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{toPersianNum(hood.overallScore)} <span className="text-slate-400 font-normal">/ ۱۰</span></span>
                      </div>
                    </div>
                    <h3 className="text-lg font-black text-slate-950 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition">محله {hood.name}</h3>
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-500">{p.mode === 'buy' ? 'اعلامی / معامله v6.4:' : `رهن کامل (${formatAreaShort(80, areaUnit)}):`}</span>
                        <span className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                          {p.mode === 'buy' ? (
                            <>{toPersianNum(unitBuy)} <span className="text-emerald-600 dark:text-emerald-400">({toPersianNum(unitDeal)})</span></>
                          ) : toPersianNum(hood.rahn80m)}{' '}
                          <span className="text-xs font-semibold text-slate-500">م.ت</span>
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-xs text-slate-500 tabular-nums">
                        <span>{p.mode === 'buy' ? `رهن کامل (${formatAreaShort(80, areaUnit)}): ${toPersianNum(hood.rahn80m)} م.ت` : `معامله v6.4: متری ${toPersianNum(unitDeal)} م.ت`}</span>
                        <span>هوا: <strong className="text-emerald-700 dark:text-emerald-400">{toPersianNum(hood.air)}/۱۰</strong></span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className={isWithinBudget ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400 font-medium'}>
                      {isWithinBudget ? 'متناسب با بودجه تعریف‌شده' : `${toPersianNum(hood.diffPercent)}٪ بالاتر از بودجه`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!isSelected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateMapAdvancedOverlayState({
                              comparisonArc: { active: !isArcActive, isPinned: !isArcActive, hoodA: p.selectedHood, hoodB: hood },
                            });
                          }}
                          title={`ترسیم کمان مقایسه با ${p.selectedHood.name} روی نقشه`}
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${isArcActive ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50'}`}
                        >
                          <Scale className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {p.onOpenInspector ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); p.onOpenInspector?.(hood); }} className="text-emerald-700 dark:text-emerald-400 hover:underline font-bold cursor-pointer">کارنامه تحلیلی ←</button>
                      ) : (
                        <span className="text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition font-medium">تمرکز روی نقشه ←</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Minimalist Bargain Callout */}
      <section className="p-6 rounded-2xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-black text-slate-950 dark:text-white">شناسایی {toPersianNum(bargainsCount)} فرصت زیر قیمت بازار در معاملات جاری</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">واحدهای دارای انحراف منفی معنادار نسبت به میانگین معاملاتی، با فیلتر آگهی‌های فیک و قیمت طعمه.</p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button type="button" onClick={p.onOpenSmartSuggest} className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 transition cursor-pointer">پیشنهادهای هوشمند</button>
          <button type="button" onClick={() => p.onNavigateView('discover')} className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 text-xs font-bold transition cursor-pointer">مشاهده در کاشف محله</button>
        </div>
      </section>
    </div>
  );
}
