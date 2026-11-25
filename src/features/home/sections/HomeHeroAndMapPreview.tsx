/**
 * @file src/features/home/sections/HomeHeroAndMapPreview.tsx
 * @description Stage 14 (RT-UI-HOME-001) — Streamlined Hero, Categorized Global Search & Lightweight Spatial Map Preview (AUD-002, AUD-003, AUD-007, AUD-008).
 */
import React, { useState, useMemo } from 'react';
import { Map as MapIcon, Search, Layers, ArrowLeft, X, Compass } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../../../data/multiCityData';
import type { CityId } from '../../../types/models';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import { RadarLink } from '../../../components/ui/RadarPrimitives';
import { executeCategorizedHomeSearch, buildPrivacySafeHomeTelemetry } from '../services/homeDataAdapter';
import { HomeSpatialSvgMapPreview } from '../components/HomeSpatialSvgMapPreview';
import type { HomeResilienceScenarioId, HomeSearchResultItem } from '../types/home.types';
import { formatPersianPrice } from '../../../utils/persianBidiFormat';
import { useRadarLocale } from '../../../components/AreaUnitToggle';

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
  const [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const [searchInput, setSearchInput] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewLayer, setPreviewLayer] = useState<'price' | 'budget' | 'air'>('price');
  const CITY_EN_LABELS: Record<CityId, string> = {
    tehran: 'Tehran',
    karaj: 'Karaj',
    mashhad: 'Mashhad',
    isfahan: 'Isfahan',
    shiraz: 'Shiraz',
  };
  const activeCityNameFa = MULTI_CITY_CONFIGS[p.activeCity]?.nameFa || 'تهران';
  const activeCityName = isEn ? (CITY_EN_LABELS[p.activeCity] || 'Tehran') : activeCityNameFa;
  const searchExampleNames = p.evaluatedNeighborhoods.slice(0, 2).map((h) => h.name);
  const searchPlaceholder = isEn
    ? `Search neighborhood in ${activeCityName}...`
    : searchExampleNames.length >= 2
      ? `مثلاً: محله ${searchExampleNames[0]} یا ${searchExampleNames[1]}...`
      : `جست‌وجوی محله در ${activeCityNameFa}...`;

  const categorizedResults = useMemo(
    () => executeCategorizedHomeSearch(searchInput, p.evaluatedNeighborhoods, p.activeCity),
    [searchInput, p.evaluatedNeighborhoods, p.activeCity],
  );

  const previewPins = useMemo(() => p.evaluatedNeighborhoods.slice(0, 6), [p.evaluatedNeighborhoods]);

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
    <section
      aria-labelledby="home-hero-heading"
      data-testid="home-hero-section"
      className="bg-[var(--color-bg-surface)] rounded-[12px] border border-[var(--color-border-subtle)] p-4 sm:p-6 lg:p-7"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-7 items-stretch">
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[var(--color-brand-fg)]">
                {isEn
                  ? `Spatial & Analytical Real Estate Intelligence · ${activeCityName}`
                  : `شناخت مکانی و تحلیلی بازار املاک ${activeCityNameFa}`}
              </span>
              <div
                role="group"
                aria-label={isEn ? 'Transaction mode' : 'حالت معامله'}
                className="inline-flex items-center bg-[var(--color-bg-muted)] p-0.5 rounded-[8px] border border-[var(--color-border-subtle)] text-xs shrink-0"
              >
                <button
                  type="button"
                  onClick={() => p.onSelectMode('buy')}
                  className={`min-h-[44px] md:min-h-[36px] px-3 py-1 rounded-[6px] font-bold transition cursor-pointer whitespace-nowrap ${
                    p.mode === 'buy'
                      ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-2xs'
                      : 'text-[var(--color-text-secondary)]'
                  }`}
                >
                  {isEn ? 'Buy' : 'خرید'}
                </button>
                <button
                  type="button"
                  onClick={() => p.onSelectMode('rent')}
                  className={`min-h-[44px] md:min-h-[36px] px-3 py-1 rounded-[6px] font-bold transition cursor-pointer whitespace-nowrap ${
                    p.mode === 'rent'
                      ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-2xs'
                      : 'text-[var(--color-text-secondary)]'
                  }`}
                >
                  {isEn ? 'Rent' : 'رهن و اجاره'}
                </button>
              </div>
            </div>
            <h1 id="home-hero-heading" className="text-2xl sm:text-[28px] lg:text-[32px] font-bold text-[var(--color-text-primary)] leading-[1.35] tracking-tight">
              {isEn ? 'See the housing market in full urban context' : 'بازار ملک را در بستر شهر ببینید'}
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              {isEn
                ? `Neighborhood price map, market indicators, property listings, and valuation tools for ${activeCityName} in one unified workspace.`
                : `نقشه قیمت محله‌ها، شاخص‌های بازار، فایل‌های ملکی و ابزارهای ارزیابی ${activeCityNameFa} در یک فضای تحلیلی یکپارچه.`}
            </p>
          </div>

          <div className="space-y-2 relative">
            <label htmlFor="home-global-search-input" className="block text-xs font-bold text-[var(--color-text-primary)]">
              {isEn ? 'Search neighborhood, district, street, or property' : 'محله، منطقه، خیابان یا ملک را جست‌وجو کنید'}
            </label>
            <div className="flex items-center gap-2 min-h-[48px] px-3 rounded-[8px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-strong)] focus-within:border-[var(--color-brand-600)]">
              <Search className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" aria-hidden="true" />
              <input
                id="home-global-search-input"
                data-testid="home-global-search-input"
                type="text"
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setActiveIndex(0); }}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label={isEn ? 'Global search for neighborhood, district, street, or report' : 'جست‌وجوی سراسری محله، منطقه، خیابان یا گزارش'}
                className="w-full min-h-[44px] bg-transparent text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label={isEn ? 'Clear search' : 'پاک کردن جست‌وجوی صفحه خانه'}
                  className="min-w-[44px] min-h-[44px] md:min-w-[36px] md:min-h-[36px] inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchInput.trim().length >= 2 && (
              <div
                role="listbox"
                aria-label={isEn ? 'Categorized search results' : 'نتایج دسته‌بندی‌شده جست‌وجوی سراسری'}
                data-testid="home-categorized-search-results"
                className="rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-lg p-2 space-y-1 max-h-64 overflow-y-auto z-20"
              >
                {categorizedResults.length === 0 || p.resilienceScenario === 'search_empty' ? (
                  <div className="p-3 text-xs text-[var(--color-text-secondary)] space-y-2" data-testid="home-search-empty-state">
                    <div className="font-bold text-[var(--color-text-primary)]">
                      {isEn ? `No results found for "${searchInput}".` : `نتیجه‌ای برای «${searchInput}» یافت نشد.`}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {isEn ? 'Try browsing all neighborhoods or opening the interactive map.' : 'مسیرهای جایگزین: فهرست همه محله‌ها یا نقشه کامل شهر را بررسی کنید.'}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <RadarLink href="/areas" onNavigate={() => p.onNavigateView('discover')} className="min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[8px] bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] font-bold">
                        {isEn ? 'Neighborhoods' : 'فهرست محله‌ها'}
                      </RadarLink>
                      <RadarLink href="/map" onNavigate={() => p.onNavigateView('map')} className="min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold">
                        {isEn ? 'Explore Map' : 'کاوش روی نقشه'}
                      </RadarLink>
                    </div>
                  </div>
                ) : (
                  categorizedResults.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={idx === activeIndex}
                      onClick={() => handleSelectResult(item)}
                      className={`w-full min-h-[44px] px-3 py-2 rounded-[8px] text-start flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                        idx === activeIndex ? 'bg-[var(--color-bg-muted)] text-[var(--color-text-primary)]' : 'hover:bg-[var(--color-bg-canvas)] text-[var(--color-text-secondary)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[var(--color-text-primary)] truncate">{item.titleFa}</div>
                        <div className="text-xs text-[var(--color-text-muted)] truncate">{item.subtitleFa}</div>
                      </div>
                      <span className="text-xs font-semibold text-[var(--color-brand-fg)] shrink-0">{item.categoryLabelFa} ←</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="pt-1 flex flex-wrap items-center gap-2.5">
            <RadarLink
              href="/map"
              data-testid="home-primary-cta-map"
              onNavigate={() => {
                p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_map_open', { cityId: p.activeCity, targetDestination: '/map' }));
                p.onNavigateView('map');
              }}
              className="min-h-[44px] px-5 py-2.5 rounded-[8px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-xs sm:text-sm font-bold gap-2 transition"
            >
              <MapIcon className="w-4 h-4" aria-hidden="true" />
              <span>{isEn ? 'Open Map' : 'ورود به نقشه'}</span>
            </RadarLink>
            <RadarLink
              href="/market"
              onNavigate={() => {
                p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_market_open', { cityId: p.activeCity, targetDestination: '/market' }));
                p.onNavigateView('intelligence', 'overview');
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-[8px] border border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)] text-xs font-bold text-[var(--color-text-primary)] transition"
            >
              {isEn ? 'Market Overview' : 'بررسی بازار'}
            </RadarLink>
            <RadarLink
              href="/areas"
              onNavigate={() => {
                p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_neighborhood_open', { cityId: p.activeCity, targetDestination: '/areas' }));
                p.onNavigateView('discover');
              }}
              className="min-h-[44px] px-3 py-2 rounded-[8px] text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-brand-fg)] transition"
            >
              {isEn ? 'Neighborhoods →' : 'شناخت محله‌ها ←'}
            </RadarLink>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col">
          {p.resilienceScenario === 'map_unavailable' ? (
            <div data-testid="home-map-unavailable-fallback" className="flex-1 min-h-[240px] rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-muted)] p-6 flex flex-col items-center justify-center text-center space-y-3">
              <Compass className="w-7 h-7 text-[var(--color-brand-fg)]" aria-hidden="true" />
              <div className="text-sm font-bold text-[var(--color-text-primary)]">
                {isEn ? 'Map preview is temporarily unavailable' : 'پیش‌نمایش نقشه در حال حاضر در دسترس نیست'}
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-md">
                {isEn ? 'Browse the structured neighborhood directory directly to review pricing and livability scores.' : 'می‌توانید مستقیماً از فهرست ساختاریافته محله‌ها برای بررسی شاخص‌های قیمتی و کالبدی استفاده کنید.'}
              </p>
              <RadarLink href="/areas" onNavigate={() => p.onNavigateView('discover')} className="min-h-[44px] px-4 py-2 rounded-[8px] bg-[var(--color-brand-600)] text-white text-xs font-bold">
                {isEn ? 'Browse Neighborhoods' : 'مشاهده فهرست محله‌ها'}
              </RadarLink>
            </div>
          ) : (
            <div data-testid="home-lightweight-map-preview" className="flex-1 min-h-[240px] rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-3.5 flex flex-col justify-between gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--color-bg-surface)] px-3 py-2 rounded-[8px] border border-[var(--color-border-subtle)] text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[var(--color-text-primary)]">
                  <Layers className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" aria-hidden="true" />
                  <span>{isEn ? `Quick Snapshot · ${activeCityName}` : `نمای سریع محله‌های ${activeCityNameFa}`}</span>
                </div>
                <div role="group" aria-label={isEn ? 'Switch map preview layer' : 'تغییر لایه پیش‌نمایش نقشه'} className="flex flex-wrap items-center gap-1 text-xs">
                  {([
                    { id: 'price', labelFa: 'قیمت پیشنهادی', labelEn: 'Asking Price' },
                    { id: 'budget', labelFa: 'تطابق بودجه', labelEn: 'Budget Fit' },
                    { id: 'air', labelFa: 'کیفیت هوا', labelEn: 'Air Quality' },
                  ] as const).map((ly) => (
                    <button
                      key={ly.id}
                      type="button"
                      aria-pressed={previewLayer === ly.id}
                      onClick={() => setPreviewLayer(ly.id)}
                      className={`min-h-[44px] md:min-h-[32px] px-2.5 py-1 rounded-[6px] font-bold transition cursor-pointer whitespace-nowrap ${
                        previewLayer === ly.id
                          ? 'bg-[var(--color-brand-600)] text-white'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
                      }`}
                    >
                      {isEn ? ly.labelEn : ly.labelFa}
                    </button>
                  ))}
                </div>
              </div>

              <HomeSpatialSvgMapPreview
                neighborhoods={previewPins}
                selectedHood={p.selectedHood}
                activeCity={p.activeCity}
                previewLayer={previewLayer}
                isEn={isEn}
                onSelectPin={(hood) => {
                  p.onSelectNeighborhood(hood);
                  p.onNavigateView('map');
                }}
              />

              <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--color-bg-surface)] px-3 py-2 rounded-[8px] border border-[var(--color-border-subtle)] text-xs">
                <div className="text-[var(--color-text-secondary)] truncate tabular-nums">
                  {isEn ? 'Active focus:' : 'کانون فعلی:'}{' '}
                  <strong className="text-[var(--color-text-primary)]">{isEn ? p.selectedHood.name : `محله ${p.selectedHood.name}`}</strong> ·{' '}
                  {isEn ? `${p.selectedHood.buyPerSqm} M/m²` : formatPersianPrice(p.selectedHood.buyPerSqm, 'م/متر')}
                </div>
                <RadarLink
                  href="/map"
                  onNavigate={() => p.onNavigateView('map')}
                  className="min-h-[44px] md:min-h-[32px] text-[var(--color-brand-fg)] font-bold gap-1 hover:underline shrink-0"
                >
                  <span>{isEn ? 'Open Full Map' : 'باز کردن نقشه اصلی'}</span>
                  <ArrowLeft className={`w-3.5 h-3.5 ${isEn ? 'rotate-180' : ''}`} aria-hidden="true" />
                </RadarLink>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
