/**
 * @file src/features/home/sections/HomeHeroAndMapPreview.tsx
 * @description Stage 14 (RT-UI-HOME-001 Section 14.5 & 14.15) — Hero, Categorized Global Search & Lightweight Spatial Map Preview.
 */
import React, { useState, useMemo } from 'react';
import { Map as MapIcon, Search, Layers, ArrowLeft, X, Compass } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../../../data/multiCityData';
import type { CityId } from '../../../types/models';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import { executeCategorizedHomeSearch, buildPrivacySafeHomeTelemetry } from '../services/homeDataAdapter';
import type { HomeResilienceScenarioId, HomeSearchResultItem } from '../types/home.types';

export interface HomeHeroAndMapPreviewProps {
  evaluatedNeighborhoods: readonly EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  activeCity: CityId;
  mode: 'rent' | 'buy';
  onSelectMode: (m: 'rent' | 'buy') => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector?: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  resilienceScenario: HomeResilienceScenarioId;
  onRecordTelemetry?: (event: ReturnType<typeof buildPrivacySafeHomeTelemetry>) => void;
}

export const HomeHeroAndMapPreview: React.FC<HomeHeroAndMapPreviewProps> = (p) => {
  const [searchInput, setSearchInput] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewLayer, setPreviewLayer] = useState<'price' | 'budget' | 'air'>('price');
  const activeCityNameFa = MULTI_CITY_CONFIGS[p.activeCity]?.nameFa || 'تهران';
  const searchExampleNames = p.evaluatedNeighborhoods.slice(0, 2).map((h) => h.name);
  const searchPlaceholder = searchExampleNames.length >= 2
    ? `مثلاً: محله ${searchExampleNames[0]} یا ${searchExampleNames[1]}...`
    : `جست‌وجوی محله در ${activeCityNameFa}...`;

  const categorizedResults = useMemo(
    () => executeCategorizedHomeSearch(searchInput, p.evaluatedNeighborhoods, p.activeCity),
    [searchInput, p.evaluatedNeighborhoods, p.activeCity],
  );

  const previewPins = useMemo(() => {
    const sample = p.evaluatedNeighborhoods.slice(0, 8);
    if (sample.length === 0) return [];
    const lats = sample.map((h) => h.lat), lngs = sample.map((h) => h.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const latSpan = Math.max(0.04, maxLat - minLat), lngSpan = Math.max(0.06, maxLng - minLng);
    return sample.map((h) => ({
      hood: h,
      xPct: Math.min(88, Math.max(12, Math.round(((h.lng - minLng) / lngSpan) * 72 + 14))),
      yPct: Math.min(84, Math.max(16, Math.round((1 - (h.lat - minLat) / latSpan) * 66 + 16))),
    }));
  }, [p.evaluatedNeighborhoods]);

  const handleSelectResult = (item: HomeSearchResultItem) => {
    p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_search_submit', {
      cityId: p.activeCity, rawSearchQuery: searchInput, resultCategory: item.category, targetDestination: item.targetView,
    }));
    if (item.hoodId) {
      const found = p.evaluatedNeighborhoods.find((h) => h.id === item.hoodId);
      if (found) {
        p.onSelectNeighborhood(found);
        if (item.targetView === 'discover') p.onOpenInspector?.(found);
      }
    }
    p.onNavigateView(item.targetView, item.targetSubTab);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (categorizedResults.length > 0 ? (prev + 1) % categorizedResults.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (categorizedResults.length > 0 ? (prev - 1 + categorizedResults.length) % categorizedResults.length : 0));
    } else if (e.key === 'Enter' && categorizedResults[activeIndex]) {
      e.preventDefault();
      handleSelectResult(categorizedResults[activeIndex]);
    } else if (e.key === 'Escape') {
      setSearchInput('');
    }
  };

  return (
    <section aria-labelledby="home-hero-heading" data-testid="home-hero-section" className="bg-white dark:bg-slate-900 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        <div className="lg:col-span-5 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#176B63] dark:text-emerald-400">معرفی محصول · شناخت مکانی و تحلیلی شهر</span>
              <div role="group" aria-label="حالت معامله" className="inline-flex items-center bg-[#F1F4F2] dark:bg-slate-800 p-0.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 text-[11px]">
                <button type="button" onClick={() => p.onSelectMode('buy')} className={`px-2.5 py-1 rounded-[6px] font-bold transition cursor-pointer ${p.mode === 'buy' ? 'bg-white dark:bg-slate-900 text-[#182522] dark:text-white shadow-2xs' : 'text-[#34433E] dark:text-slate-400'}`}>خرید</button>
                <button type="button" onClick={() => p.onSelectMode('rent')} className={`px-2.5 py-1 rounded-[6px] font-bold transition cursor-pointer ${p.mode === 'rent' ? 'bg-white dark:bg-slate-900 text-[#182522] dark:text-white shadow-2xs' : 'text-[#34433E] dark:text-slate-400'}`}>رهن و اجاره</button>
              </div>
            </div>
            <h1 id="home-hero-heading" className="text-[28px] sm:text-[32px] lg:text-[36px] font-extrabold text-[#182522] dark:text-white leading-[1.35] tracking-tight">
              بازار ملک را در بستر شهر ببینید.
            </h1>
            <p className="text-sm sm:text-base font-bold text-[#182522] dark:text-slate-200 leading-relaxed">
              نقشه، اطلاعات محله‌ها، داده‌های بازار و املاک را کنار هم بررسی کنید.
            </p>
            <p className="text-xs sm:text-sm text-[#34433E] dark:text-slate-400 leading-[1.75]">
              رادارتهران بستری برای شناخت مکانی و تحلیلی بازار املاک و اطلاعات شهری در {activeCityNameFa} و کلان‌شهرهای ایران است.
            </p>
          </div>

          <div className="space-y-2 relative">
            <label htmlFor="home-global-search-input" className="block text-xs font-bold text-[#182522] dark:text-slate-200">
              محله، منطقه، خیابان یا ملک را جست‌وجو کنید
            </label>
            <div className="flex items-center gap-2 min-h-[48px] px-3 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800/90 border border-[#DCE3DF] dark:border-slate-700 focus-within:border-[#176B63]">
              <Search className="w-4 h-4 text-[#34433E] dark:text-slate-400 shrink-0" aria-hidden="true" />
              <input
                id="home-global-search-input" data-testid="home-global-search-input" type="text"
                value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setActiveIndex(0); }} onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label="جست‌وجوی سراسری محله، منطقه، خیابان یا گزارش"
                className="w-full bg-transparent text-xs sm:text-sm text-[#182522] dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />
              {searchInput && (
                <button type="button" onClick={() => setSearchInput('')} aria-label="پاک کردن جست‌وجوی صفحه خانه" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchInput.trim().length >= 2 && (
              <div role="listbox" aria-label="نتایج دسته‌بندی‌شده جست‌وجوی سراسری" data-testid="home-categorized-search-results" className="rounded-[10px] border border-[#DCE3DF] dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-2 space-y-1 max-h-64 overflow-y-auto z-20">
                {categorizedResults.length === 0 || p.resilienceScenario === 'search_empty' ? (
                  <div className="p-3 text-xs text-[#34433E] dark:text-slate-300 space-y-2" data-testid="home-search-empty-state">
                    <div className="font-bold text-[#182522] dark:text-white">نتیجه‌ای برای «{searchInput}» یافت نشد.</div>
                    <div className="text-[11px] text-slate-500">مسیرهای جایگزین: فهرست همه محله‌ها یا نقشه کامل شهر را بررسی کنید.</div>
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={() => p.onNavigateView('discover')} className="px-2.5 py-1 rounded-[8px] bg-[#F1F4F2] dark:bg-slate-800 text-[#182522] dark:text-slate-200 font-bold cursor-pointer">فهرست محله‌ها</button>
                      <button type="button" onClick={() => p.onNavigateView('map')} className="px-2.5 py-1 rounded-[8px] bg-[#176B63] text-white font-bold cursor-pointer">کاوش روی نقشه</button>
                    </div>
                  </div>
                ) : (
                  categorizedResults.map((item, idx) => (
                    <button
                      key={item.id} type="button" role="option" aria-selected={idx === activeIndex} onClick={() => handleSelectResult(item)}
                      className={`w-full px-3 py-2 rounded-[8px] text-start flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                        idx === activeIndex ? 'bg-[#F1F4F2] dark:bg-slate-800 text-[#182522] dark:text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-[#34433E] dark:text-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#182522] dark:text-white truncate">{item.titleFa}</div>
                        <div className="text-[11px] text-slate-500 truncate">{item.subtitleFa}</div>
                      </div>
                      <span className="text-[10.5px] font-semibold text-[#176B63] dark:text-emerald-400 shrink-0">{item.categoryLabelFa} ←</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="button" data-testid="home-primary-cta-map"
              onClick={() => { p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_map_open', { cityId: p.activeCity, targetDestination: '/explore/map' })); p.onNavigateView('map'); }}
              className="min-h-[48px] px-5 py-2.5 rounded-[8px] bg-[#176B63] hover:bg-[#125650] text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer"
            >
              <MapIcon className="w-4 h-4" aria-hidden="true" /> <span>ورود به نقشه</span>
            </button>
            <button
              type="button"
              onClick={() => { p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_market_open', { cityId: p.activeCity, targetDestination: '/market' })); p.onNavigateView('intelligence', 'overview'); }}
              className="min-h-[44px] px-3.5 py-2 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 hover:bg-[#F1F4F2] dark:hover:bg-slate-800 text-xs font-bold text-[#182522] dark:text-slate-200 transition cursor-pointer"
            >
              بررسی بازار
            </button>
            <button
              type="button"
              onClick={() => { p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_neighborhood_open', { cityId: p.activeCity, targetDestination: '/neighborhoods' })); p.onNavigateView('discover'); }}
              className="min-h-[44px] px-3.5 py-2 rounded-[8px] text-xs font-bold text-[#34433E] dark:text-slate-300 hover:text-[#176B63] dark:hover:text-emerald-400 transition cursor-pointer"
            >
              شناخت محله‌ها ←
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col">
          {p.resilienceScenario === 'map_unavailable' ? (
            <div data-testid="home-map-unavailable-fallback" className="flex-1 min-h-[260px] rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 bg-[#F1F4F2] dark:bg-slate-800/60 p-6 flex flex-col items-center justify-center text-center space-y-3">
              <Compass className="w-7 h-7 text-[#176B63]" aria-hidden="true" />
              <div className="text-sm font-bold text-[#182522] dark:text-white">پیش‌نمایش نقشه در حال حاضر در دسترس نیست</div>
              <p className="text-xs text-[#34433E] dark:text-slate-400 max-w-md">می‌توانید مستقیماً از فهرست ساختاریافته محله‌ها یا شناسنامه هر منطقه برای بررسی شاخص‌های قیمتی و کالبدی استفاده کنید.</p>
              <button type="button" onClick={() => p.onNavigateView('discover')} className="min-h-[44px] px-4 py-2 rounded-[8px] bg-[#176B63] text-white text-xs font-bold cursor-pointer">مشاهده فهرست محله‌ها</button>
            </div>
          ) : (
            <div data-testid="home-lightweight-map-preview" className="flex-1 min-h-[260px] sm:min-h-[320px] rounded-[12px] border border-[#DCE3DF] dark:border-slate-700 bg-[#E9EFEC] dark:bg-slate-950 p-3.5 flex flex-col justify-between relative overflow-hidden">
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 bg-white/95 dark:bg-slate-900/95 px-3 py-2 rounded-[8px] border border-[#DCE3DF] dark:border-slate-800 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[#182522] dark:text-white">
                  <Layers className="w-3.5 h-3.5 text-[#176B63]" aria-hidden="true" /> <span>کاوش در نقشه · محدوده جغرافیایی معتبر</span>
                </div>
                <div role="group" aria-label="تغییر لایه پیش‌نمایش نقشه" className="flex items-center gap-1 text-[11px]">
                  {([{ id: 'price', label: 'قیمت پیشنهادی' }, { id: 'budget', label: 'تطابق بودجه' }, { id: 'air', label: 'کیفیت هوا' }] as const).map((ly) => (
                    <button
                      key={ly.id} type="button" aria-pressed={previewLayer === ly.id} onClick={() => setPreviewLayer(ly.id)}
                      className={`px-2 py-0.5 rounded-[6px] font-bold transition cursor-pointer ${previewLayer === ly.id ? 'bg-[#176B63] text-white' : 'text-[#34433E] dark:text-slate-300 hover:bg-[#F1F4F2] dark:hover:bg-slate-800'}`}
                    >
                      {ly.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative my-3 flex-1 min-h-[175px] rounded-[8px] border border-[#DCE3DF]/80 dark:border-slate-800 bg-[#F6F8F6]/90 dark:bg-slate-900/80 overflow-hidden">
                <svg className="absolute inset-0 w-full h-full opacity-35 dark:opacity-20 pointer-events-none" viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M 20 55 Q 140 35 260 65 T 385 45" fill="none" stroke="#176B63" strokeWidth="1.5" strokeDasharray="4 4" />
                  <path d="M 15 135 Q 180 110 310 145 T 390 130" fill="none" stroke="#34433E" strokeWidth="1.2" />
                  <path d="M 110 15 L 145 205 M 255 15 L 235 205" fill="none" stroke="#94A39E" strokeWidth="0.8" strokeDasharray="3 3" />
                </svg>

                {previewPins.map(({ hood, xPct, yPct }) => {
                  const isCurrent = hood.id === p.selectedHood.id;
                  const metricText = previewLayer === 'price' ? `${toPersianNum(hood.buyPerSqm)} م/متر` : previewLayer === 'budget' ? (hood.status === 'green' ? 'در بودجه' : 'فراتر') : `هوا ${toPersianNum(hood.air)}`;
                  return (
                    <button
                      key={hood.id} type="button" style={{ left: `${xPct}%`, top: `${yPct}%` }}
                      onClick={() => { p.onSelectNeighborhood(hood); p.onNavigateView('map'); }} title={`ورود به نقشه محله ${hood.name}`}
                      className={`-translate-x-1/2 -translate-y-1/2 absolute px-2 py-1 rounded-[6px] border text-[10.5px] font-bold transition cursor-pointer whitespace-nowrap tabular-nums ${
                        isCurrent ? 'bg-[#176B63] text-white border-[#176B63] z-10 shadow-sm' : 'bg-white/95 dark:bg-slate-800/95 text-[#182522] dark:text-slate-200 border-[#DCE3DF] dark:border-slate-700 hover:border-[#176B63]'
                      }`}
                    >
                      <span>{hood.name}</span> <span className="mx-1 opacity-60">·</span> <span>{metricText}</span>
                    </button>
                  );
                })}
              </div>

              <div className="relative z-10 flex items-center justify-between gap-2 bg-white/95 dark:bg-slate-900/95 px-3 py-2 rounded-[8px] border border-[#DCE3DF] dark:border-slate-800 text-xs">
                <div className="text-[#34433E] dark:text-slate-300 truncate">
                  کانون فعلی: <strong className="text-[#182522] dark:text-white">محله {p.selectedHood.name}</strong> · {toPersianNum(p.selectedHood.buyPerSqm)} میلیون تومان / مترمربع
                </div>
                <button type="button" onClick={() => p.onNavigateView('map')} className="text-[#176B63] dark:text-emerald-400 font-bold flex items-center gap-1 hover:underline shrink-0 cursor-pointer">
                  <span>باز کردن نقشه اصلی</span> <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
