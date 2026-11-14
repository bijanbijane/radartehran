/** @file src/components/views/ProductPropertiesView.tsx — Real Estate Listings, Split Map Toggle (RT-L06) & Property Detail View (RT-L07) */
import React, { useMemo, useState } from 'react';
import { Building2, Calculator, Layers, MapPin, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { matchesPersianSearch } from '../../utils/security';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import type { PropertiesSubTabId } from '../../navigation/registry/route.types';
import { PropertyDetailPanel, type FlattenedPropertyItem } from './PropertyDetailPanel';

export interface ProductPropertiesViewProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  activeSubTab?: PropertiesSubTabId;
  onChangeSubTab?: (tab: PropertiesSubTabId) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenHedonicForProperty: (hood: EvaluatedNeighborhood, params?: { sqm?: number }) => void;
  onNavigateView: (view: PrimaryViewId) => void;
  targetSqm: number;
  splitMapMode?: boolean;
  onToggleSplitMap?: () => void;
}

export function ProductPropertiesView(p: ProductPropertiesViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const activeTab: PropertiesSubTabId = p.activeSubTab || 'all';
  const [query, setQuery] = useState('');
  const [onlySelectedHood, setOnlySelectedHood] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const flattenedItems = useMemo<FlattenedPropertyItem[]>(() => {
    const rows: FlattenedPropertyItem[] = [];
    for (const hood of p.evaluatedNeighborhoods) {
      const agg = aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, buildNeighborhoodListingSamples(hood));
      if (hood.bargains && hood.bargains.length > 0) {
        hood.bargains.forEach((b, idx) => {
          const discount = Math.min(60, Math.max(2, Number(b.discountPercent) || 8));
          const derivedAskSqm = Math.round(hood.buyPerSqm * (1 - discount / 100));
          rows.push({
            id: b.id || `b-${hood.id}-${idx}`,
            hood,
            title: b.title || `فایل زیر قیمت در ${hood.name}`,
            street: b.street || hood.zone,
            dealKind: b.type === 'اجاره' ? 'rent' : 'buy',
            sqm: b.sqm || p.targetSqm,
            askPricePerSqm: derivedAskSqm,
            v64BenchmarkPerSqm: agg.estimatedDealPricePerSqm,
            isLiveBargain: true,
          });
        });
      } else {
        rows.push({
          id: `ref-${hood.id}`,
          hood,
          title: `واحد شاخص مسکونی ${hood.name}`,
          street: hood.zone,
          dealKind: 'buy',
          sqm: p.targetSqm,
          askPricePerSqm: hood.buyPerSqm,
          v64BenchmarkPerSqm: agg.estimatedDealPricePerSqm,
          isLiveBargain: false,
        });
      }
    }
    return rows;
  }, [p.evaluatedNeighborhoods, p.targetSqm]);

  const filteredItems = useMemo(() => {
    let list = flattenedItems;
    if (activeTab === 'buy') list = list.filter((it) => it.dealKind === 'buy');
    else if (activeTab === 'rent') list = list.filter((it) => it.dealKind === 'rent');
    else if (activeTab === 'commercial' || activeTab === 'office') return [];
    if (onlySelectedHood) list = list.filter((it) => it.hood.id === p.selectedHood.id);
    if (query.trim()) {
      const q = query.trim();
      list = list.filter((it) => matchesPersianSearch(it.title, q) || matchesPersianSearch(it.street, q) || matchesPersianSearch(it.hood.name, q));
    }
    return list.slice(0, 24);
  }, [flattenedItems, activeTab, onlySelectedHood, p.selectedHood.id, query]);

  const activeProperty = useMemo(
    () => (selectedPropertyId ? flattenedItems.find((it) => it.id === selectedPropertyId) || null : null),
    [flattenedItems, selectedPropertyId]
  );

  if (activeProperty) {
    return (
      <PropertyDetailPanel
        property={activeProperty}
        areaUnit={areaUnit}
        intlCurrency={intlCurrency}
        radarLocale={radarLocale}
        onBack={() => setSelectedPropertyId(null)}
        onSelectNeighborhood={p.onSelectNeighborhood}
        onNavigateView={p.onNavigateView}
        onOpenInspector={p.onOpenInspector}
        onOpenHedonicForProperty={p.onOpenHedonicForProperty}
      />
    );
  }

  return (
    <div className="w-full max-w-[1360px] mx-auto px-4 py-6 space-y-6 animate-fadeIn" data-testid="product-properties-view">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#DCE3DF] dark:border-slate-800 pb-4">
        <div>
          <span className="text-[11px] font-bold text-[#176B63] dark:text-emerald-400 block mb-1">
            {isEn ? 'Verified Property Opportunities & Valuation Context' : 'جست‌وجوی املاک و فایل‌های زیر قیمت · همگام با ارزش‌گذاری هدونیک'}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-[#182522] dark:text-white tracking-tight">
            {isEn ? 'Property Explorer' : 'بازار املاک و فایل‌های هدف'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {p.onToggleSplitMap && (
            <button
              type="button"
              data-testid="properties-split-map-toggle"
              aria-pressed={Boolean(p.splitMapMode)}
              onClick={p.onToggleSplitMap}
              className="hidden lg:inline-flex px-3 py-2 rounded-[9px] border border-[#DCE3DF] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#34433E] dark:text-slate-200 text-xs font-bold items-center gap-1.5 hover:bg-[#F1F4F2] dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-[#176B63]" />
              <span>{p.splitMapMode ? 'بزرگ‌نمایی فهرست املاک' : 'چیدمان دوتایی فهرست + نقشه'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => p.onOpenHedonicForProperty(p.selectedHood, { sqm: p.targetSqm })}
            className="px-3.5 py-2 rounded-[9px] bg-[#176B63] hover:bg-[#14534E] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Calculator className="w-4 h-4" />
            <span>{isEn ? 'Value Any Property' : 'ارزش‌گذاری یک ملک دلخواه'}</span>
          </button>
        </div>
      </div>

      {/* Dedicated Property Filter Bar (Strictly separated from module tabs) */}
      <div className="p-3.5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#64716B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            aria-label={isEn ? 'Filter properties' : 'جست‌وجوی ملک، خیابان یا محله'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isEn ? 'Search property title, street, or neighborhood...' : 'جست‌وجو بر اساس محله، خیابان یا عنوان فایل...'}
            className="w-full pr-9 pl-7 py-1.5 rounded-[9px] bg-[#F1F4F2] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 text-xs text-[#182522] dark:text-white focus:outline-none focus:border-[#176B63]"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="پاک کردن جست‌وجوی ملک" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64716B] hover:text-[#182522] cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          aria-pressed={onlySelectedHood}
          onClick={() => setOnlySelectedHood((v) => !v)}
          className={`px-3 py-1.5 rounded-[9px] border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            onlySelectedHood
              ? 'bg-[#176B63] text-white border-[#176B63]'
              : 'border-[#DCE3DF] dark:border-slate-700 text-[#34433E] dark:text-slate-300 hover:bg-[#F1F4F2] dark:hover:bg-slate-800'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>فقط محله {p.selectedHood.name}</span>
        </button>
      </div>

      {(activeTab === 'commercial' || activeTab === 'office') ? (
        <div className="p-8 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 text-center space-y-3">
          <Building2 className="w-8 h-8 text-[#875000] mx-auto" />
          <h2 className="text-base font-black text-[#182522] dark:text-white">
            پایش مستقل املاک {activeTab === 'commercial' ? 'تجاری و مغازه' : 'اداری و موقعیت تجاری'} در حال توسعه است
          </h2>
          <p className="text-xs text-[#586760] dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
            در نسخه فعلی، مدل ارزش‌گذاری هدونیک و فایل‌های راستی‌آزمایی‌شده برای کاربری مسکونی (خرید و اجاره) فعال است. می‌توانید همه فایل‌های مسکونی را مشاهده کنید یا ارزش ملک خود را محاسبه کنید.
          </p>
          <button type="button" onClick={() => p.onChangeSubTab?.('all')} className="px-4 py-2 rounded-[9px] bg-[#176B63] hover:bg-[#14534E] text-white text-xs font-bold cursor-pointer">
            نمایش همه فایل‌های مسکونی
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-8 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 text-center space-y-3">
          <p className="text-sm font-bold text-[#182522] dark:text-slate-200">فایلی با فیلتر فعلی یافت نشد.</p>
          <button type="button" onClick={() => { setQuery(''); setOnlySelectedHood(false); p.onChangeSubTab?.('all'); }} className="px-4 py-1.5 rounded-[9px] bg-[#176B63] text-white text-xs font-bold cursor-pointer">
            پاک کردن فیلترها
          </button>
        </div>
      ) : (
        <div className={`grid grid-cols-1 ${p.splitMapMode ? 'xl:grid-cols-2' : 'md:grid-cols-2'} gap-4`}>
          {filteredItems.map((item) => {
            const unitAsk = convertPricePerSqmToUnit(item.askPricePerSqm, areaUnit);
            const unitBench = convertPricePerSqmToUnit(item.v64BenchmarkPerSqm, areaUnit);
            const fxLabel = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitAsk, intlCurrency, radarLocale)})` : '';
            return (
              <div key={item.id} className="p-4 sm:p-5 rounded-[14px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 flex flex-col justify-between gap-3 hover:border-[#176B63]/60 transition">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-bold text-[#586760] dark:text-slate-400">محله {item.hood.name} · {item.street}</span>
                    <span className={`px-2 py-0.5 rounded-[7px] font-bold ${item.isLiveBargain ? 'bg-[#EAF5EE] dark:bg-emerald-950/70 text-[#176B4C] dark:text-emerald-300' : 'bg-[#F1F4F2] dark:bg-slate-800 text-[#48534F] dark:text-slate-300'}`}>
                      {item.isLiveBargain ? 'فایل زیر قیمت ثبت‌شده' : 'شاخص مرجع محله'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPropertyId(item.id)}
                    className="text-start text-sm sm:text-base font-black text-[#182522] dark:text-white hover:text-[#176B63] dark:hover:text-emerald-400 transition cursor-pointer"
                  >
                    {item.title}
                  </button>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#DCE3DF] dark:border-slate-800 text-xs tabular-nums">
                    <div>
                      <span className="text-[10px] text-[#586760] block">اعلامی ({formatAreaShort(item.sqm, areaUnit)}):</span>
                      <strong className="text-[#182522] dark:text-white font-black">{toPersianNum(unitAsk)} م/واحد{fxLabel}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#586760] block">سناریو v6.4 (غیرثبتی):</span>
                      <strong className="text-[#176B63] dark:text-emerald-400 font-black">{toPersianNum(unitBench)} م</strong>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-[#DCE3DF] dark:border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedPropertyId(item.id)}
                    className="flex-1 py-2 rounded-[9px] bg-[#176B63] hover:bg-[#14534E] text-white font-bold flex items-center justify-center gap-1 cursor-pointer transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>مشاهده جزئیات و ارزش‌گذاری</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { p.onSelectNeighborhood(item.hood); p.onOpenInspector(item.hood); }}
                    className="px-3 py-2 rounded-[9px] border border-[#DCE3DF] dark:border-slate-700 text-[#34433E] dark:text-slate-200 font-bold hover:bg-[#F1F4F2] dark:hover:bg-slate-800 cursor-pointer"
                  >
                    کارنامه محله
                  </button>
                  <button
                    type="button"
                    onClick={() => { p.onSelectNeighborhood(item.hood); p.onNavigateView('map'); }}
                    aria-label={`نمایش ${item.hood.name} روی نقشه`}
                    className="p-2 rounded-[9px] bg-[#EAF3F0] dark:bg-emerald-950/60 text-[#14534E] dark:text-emerald-300 border border-[#B8D7CE] dark:border-emerald-800 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
