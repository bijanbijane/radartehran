import React, { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, ArrowUpRight, Flame, MapPin, Scale, Search, ShieldCheck, X } from 'lucide-react';
import type { EvaluatedNeighborhood, MarketPulseData } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';
import { matchesPersianSearch } from '../../utils/security';
import { Stage2MasterWidget } from '../stage2/Stage2MasterWidget';

export interface ProductIntelligenceViewProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[]; selectedHood: EvaluatedNeighborhood;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; marketPulse: MarketPulseData | null;
  onOpenPriceTrend: () => void; onOpenPulseModal: () => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void; onNavigateView?: (view: PrimaryViewId) => void;
  onSyncMapLens?: (lens: 'bubble' | 'heatmap' | 'budget') => void; activeCity: string;
}

export function ProductIntelligenceView(p: ProductIntelligenceViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const { comparisonArc } = useMapAdvancedOverlayState();
  const [activeSegment, setActiveSegment] = useState<'undervalued' | 'balanced' | 'bubble'>('undervalued'), [segQuery, setSegQuery] = useState<string>('');
  const handleSelectSegment = (seg: 'undervalued' | 'balanced' | 'bubble') => { setActiveSegment(seg); p.onSyncMapLens?.('bubble'); };

  const undervaluedList = useMemo(() => p.evaluatedNeighborhoods.filter((h) => h.marketReport?.status === 'undervalued'), [p.evaluatedNeighborhoods]);
  const balancedList = useMemo(() => p.evaluatedNeighborhoods.filter((h) => h.marketReport?.status === 'balanced'), [p.evaluatedNeighborhoods]);
  const premiumList = useMemo(() => p.evaluatedNeighborhoods.filter((h) => h.marketReport?.status === 'bubble'), [p.evaluatedNeighborhoods]);

  const activeList = useMemo(() => {
    const base = activeSegment === 'undervalued' ? undervaluedList : activeSegment === 'balanced' ? balancedList : premiumList;
    if (!segQuery.trim()) return base;
    const q = segQuery.trim();
    return base.filter((h) => matchesPersianSearch(h.name, q) || matchesPersianSearch(h.zone, q));
  }, [activeSegment, undervaluedList, balancedList, premiumList, segQuery]);

  const selectedAgg = useMemo(() => aggregateNeighborhoodMarketMetrics(p.selectedHood.id, p.selectedHood.name, p.selectedHood.buyPerSqm, buildNeighborhoodListingSamples(p.selectedHood)), [p.selectedHood]);
  const uAsking = convertPricePerSqmToUnit(selectedAgg.askingPricePerSqm, areaUnit), uDeal = convertPricePerSqmToUnit(selectedAgg.estimatedDealPricePerSqm, areaUnit);
  const uIqrLow = convertPricePerSqmToUnit(selectedAgg.iqrLowPerSqm, areaUnit), uIqrHigh = convertPricePerSqmToUnit(selectedAgg.iqrHighPerSqm, areaUnit);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-7 animate-fadeIn" data-testid="product-intelligence-view">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
            {isEn ? 'Data-Driven Valuation & Bubble Analytics · Synced with Live Map' : 'سنجش داده‌محور ارزش و حباب · همگام با نقشه زنده'}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {isEn ? 'Housing Market Pulse & Intelligence' : 'نبض و هوش بازار مسکن'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            پایش آماری حباب، ارزیابی دامنه توافق معامله (مدل v6.4) و تفکیک فرصت‌های زیر ارزش ذاتی
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={p.onOpenPriceTrend} className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /><span>{isEn ? 'Historical Trends' : 'روند تاریخی قیمت'}</span>
          </button>
          <button type="button" onClick={p.onOpenPulseModal} className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer hover:opacity-90 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /><span>{isEn ? 'Full Pulse Report' : 'گزارش کامل نبض بازار'}</span>
          </button>
        </div>
      </div>

      {/* Live Macro Market Pulse Banner (if available) */}
      {p.marketPulse && (
        <div className="p-3.5 rounded-xl bg-slate-900 text-white dark:bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
              {isEn ? 'Live Market Pulse' : 'نبض کلان بازار'}
            </span>
            <span className="font-bold tabular-nums">
              {isEn
                ? `City Avg: ${toPersianNum(convertPricePerSqmToUnit(p.marketPulse.marketSummary.tehranAverageBuyPerSqm, areaUnit))}M · 80m² Deposit: ${toPersianNum(p.marketPulse.marketSummary.tehranAverageRahn80m)}M`
                : `میانگین کلان‌شهر: متری ${toPersianNum(convertPricePerSqmToUnit(p.marketPulse.marketSummary.tehranAverageBuyPerSqm, areaUnit))} م.ت · رهن ۸۰متر: ${toPersianNum(p.marketPulse.marketSummary.tehranAverageRahn80m)} م.ت`}
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-300 tabular-nums">
            <span>{isEn ? 'Air Quality (AQI):' : 'شاخص هوا (AQI):'} <strong className="text-white">{toPersianNum(p.marketPulse.airQuality.tehranAverageAqi)} ({p.marketPulse.airQuality.statusLabel})</strong></span>
            <span>{isEn ? 'Updated:' : 'بروزرسانی:'} <strong className="text-emerald-400">{p.marketPulse.lastUpdatedTimeFa}</strong></span>
          </div>
        </div>
      )}

      {/* Interactive Institutional Metric Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button type="button" onClick={() => handleSelectSegment('undervalued')} className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border text-start flex flex-col justify-between transition cursor-pointer ${activeSegment === 'undervalued' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'}`}>
          <div className="text-[11px] font-bold text-slate-400">{isEn ? '01 · Undervalued Areas' : '۰۱ · فرصت‌های زیر ارزش ذاتی'}</div>
          <div className="my-3"><span className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">{toPersianNum(undervaluedList.length)}</span><span className="text-xs text-slate-400 mx-1.5">{isEn ? 'areas' : 'محله'}</span></div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">{isEn ? '≥10% below intrinsic value' : 'حداقل ۱۰٪ ارزان‌تر از ارزش برآوردی'}</div>
        </button>

        <button type="button" onClick={() => handleSelectSegment('balanced')} className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border text-start flex flex-col justify-between transition cursor-pointer ${activeSegment === 'balanced' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'}`}>
          <div className="text-[11px] font-bold text-slate-400">{isEn ? '02 · Balanced Areas' : '۰۲ · محلات در محدوده تعادل'}</div>
          <div className="my-3"><span className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">{toPersianNum(balancedList.length)}</span><span className="text-xs text-slate-400 mx-1.5">{isEn ? 'areas' : 'محله'}</span></div>
          <div className="text-[11px] text-slate-500 font-medium">{isEn ? 'Aligned with closing benchmarks' : 'همگرایی قیمت اعلامی با دامنه تعادلی'}</div>
        </button>

        <button type="button" onClick={() => handleSelectSegment('bubble')} className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border text-start flex flex-col justify-between transition cursor-pointer ${activeSegment === 'bubble' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'}`}>
          <div className="text-[11px] font-bold text-slate-400">{isEn ? '03 · Speculative Bubble' : '۰۳ · حباب مثبت و نرخ هیجانی'}</div>
          <div className="my-3"><span className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">{toPersianNum(premiumList.length)}</span><span className="text-xs text-slate-400 mx-1.5">{isEn ? 'areas' : 'محله'}</span></div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">{isEn ? 'Requires strong negotiation' : 'احتیاط معاملاتی و چانه‌زنی بالا'}</div>
        </button>

        <button type="button" onClick={p.onOpenPriceTrend} className="p-5 rounded-2xl text-start bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 flex flex-col justify-between cursor-pointer transition group">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span>{isEn ? '04 · v6.4 Closing Discount' : '۰۴ · شکاف تخفیف قطعی v6.4'}</span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 group-hover:underline">{isEn ? 'Trend ↗' : 'تحلیل روند ↗'}</span>
          </div>
          <div className="my-3"><span className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">-{toPersianNum(Math.max(1, Math.round((1 - selectedAgg.askToDealRatio) * 100)))}٪</span><span className="text-xs text-slate-400 mx-1.5">{isEn ? 'closing spread' : 'تخفیف جلسه معامله'}</span></div>
          <div className="text-[11px] text-slate-500 font-medium truncate">
            وضعیت: <strong className="text-slate-800 dark:text-slate-200">{selectedAgg.marketRegime === 'HOT' ? 'داغ و رقابتی' : selectedAgg.marketRegime === 'FROZEN' ? 'رکودی (به نفع خریدار)' : 'متعادل و پایدار'}</strong>
          </div>
        </button>
      </div>

      {/* Selected Neighborhood Deep Analysis + Provenance */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="text-[11px] text-slate-400 font-semibold">{isEn ? 'Price Structure & Statistical Provenance of Active Map Neighborhood' : 'کالبدشکافی ساختار قیمتی محله انتخابی روی نقشه'}</div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">محله {p.selectedHood.name} {p.selectedHood.zone ? `· ${p.selectedHood.zone}` : ''}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold tabular-nums" title="ضریب اطمینان آماری و تعداد نمونه‌های پالایش‌شده">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>اطمینان {toPersianNum(selectedAgg.confidenceScore)}٪ · {toPersianNum(selectedAgg.validSampleCount)} نمونه معتبر</span>
            </span>
            {p.onNavigateView && (
              <button type="button" onClick={() => p.onNavigateView?.('map')} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /><span>{isEn ? 'Full Map' : 'نقشه کامل'}</span>
              </button>
            )}
            <button type="button" onClick={() => p.onOpenInspector(p.selectedHood)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold transition cursor-pointer flex items-center gap-1.5">
              <span>{isEn ? 'Scorecard' : 'مشاهده کارنامه تحلیلی'}</span><ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs tabular-nums">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block mb-0.5">ادعای آگهی‌دهنده (Advertiser Claim)</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">میانه قیمت اعلامی آگهی‌ها:</span>
            <strong className="text-xl font-black text-slate-900 dark:text-white mt-1.5 block">{toPersianNum(uAsking)} <span className="text-xs font-normal text-slate-400">م.ت / {areaUnit === 'sqft' ? 'ft²' : 'متر'}</span></strong>
          </div>
          <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block mb-0.5">برآورد مدل (Model Estimate v6.4)</span>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-bold">تخمین قطعی پای معامله (v6.4):</span>
            <strong className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1.5 block">{toPersianNum(uDeal)} <span className="text-xs font-normal text-emerald-600/70">م.ت / {areaUnit === 'sqft' ? 'ft²' : 'متر'}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uDeal, intlCurrency, radarLocale)})` : ''}</span></strong>
          </div>
          <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20">
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5">نقدشوندگی فوری (Fast-Sale 0.88)</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">کف تسویه نقدی و فروش سریع:</span>
            <strong className="text-xl font-black text-indigo-700 dark:text-indigo-300 mt-1.5 block">{toPersianNum(Math.round(uAsking * 0.88))} <span className="text-xs font-normal text-slate-400">م.ت / {areaUnit === 'sqft' ? 'ft²' : 'متر'}</span></strong>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">دامنه عدم‌قطعیت (Statistical IQR)</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">بازه معتبر آماری محله (IQR):</span>
            <strong className="text-xl font-black text-slate-900 dark:text-white mt-1.5 block">{toPersianNum(uIqrLow)} تا {toPersianNum(uIqrHigh)} <span className="text-xs font-normal text-slate-400">م.ت</span></strong>
          </div>
        </div>
        <div className="space-y-1.5 pt-1 tabular-nums">
          <div className="flex justify-between items-center text-[10.5px] text-slate-500 dark:text-slate-400 font-medium">
            <span>کف آماری محله ({toPersianNum(uIqrLow)} م)</span>
            <span className="text-emerald-700 dark:text-emerald-300 font-bold">جایگاه برآورد معامله v6.4: صدک {toPersianNum(uIqrHigh > uIqrLow ? Math.min(100, Math.max(0, Math.round(((uDeal - uIqrLow) / (uIqrHigh - uIqrLow)) * 100))) : 50)}٪ دامنه</span>
            <span>سقف آماری محله ({toPersianNum(uIqrHigh)} م)</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
            <div className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-300" style={{ width: `${uIqrHigh > uIqrLow ? Math.min(100, Math.max(0, Math.round(((uDeal - uIqrLow) / (uIqrHigh - uIqrLow)) * 100))) : 50}%` }} />
          </div>
        </div>

        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div><span className="font-bold text-slate-900 dark:text-white">جمع‌بندی تحلیلی و تفکیک معرفتی (CASPER): </span>{p.selectedHood.marketReport?.summary || 'تحلیل الگوی قیمت‌گذاری و نسبت قیمت به رهن در محدوده تعادلی ارزیابی می‌شود.'}</div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold">تفکیک داده: مشاهده آگهی ≠ نرخ قطعی معامله (حاشیه خطا ±{toPersianNum(Math.max(2.5, Number(((100 - selectedAgg.confidenceScore) * 0.28).toFixed(1))))}٪)</span>
            <span>پالایش موتور ضدتقلب: حذف {toPersianNum(selectedAgg.rejectedFraudCount)} آگهی پرت/طعمه</span>
          </div>
        </div>

        <Stage2MasterWidget
          hoodId={p.selectedHood.id} hoodName={p.selectedHood.name} cityKey={p.activeCity}
          basePriceSqm={p.selectedHood.buyPerSqm} intlCurrency={intlCurrency} hood={p.selectedHood} initialTab="HOUSING_CYCLE"
          onSelectCompareHood={(targetName) => { const match = p.evaluatedNeighborhoods.find((h) => h.name === targetName); if (match) p.onSelectNeighborhood(match); }}
        />
      </div>

      {/* Filtered Market Segment Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-black text-slate-900 dark:text-white text-base flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-500" />
            <span>
              {activeSegment === 'undervalued'
                ? 'محله‌های دارای فرصت زیر قیمت واقعی (Undervalued)'
                : activeSegment === 'balanced'
                  ? 'محله‌های در محدوده تعادل قیمتی (Balanced)'
                  : 'محله‌های دارای حباب مثبت و نیازمند چانه‌زنی بالا'}
            </span>
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" aria-label={isEn ? 'Filter segment' : 'فیلتر سریع در این دسته'} value={segQuery} onChange={(e) => setSegQuery(e.target.value)} placeholder={isEn ? 'Filter segment...' : 'فیلتر سریع در این دسته...'} className="w-full pr-8 pl-6 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600" />
            {segQuery && <button type="button" aria-label="پاک کردن فیلتر دسته" onClick={() => setSegQuery('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {activeList.slice(0, 10).map((hood) => {
            const unitBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit);
            const unitDeal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, buildNeighborhoodListingSamples(hood)).estimatedDealPricePerSqm, areaUnit);
            const isSelected = hood.id === p.selectedHood.id;
            const isArcActive = comparisonArc.active && ((comparisonArc.hoodA?.id === p.selectedHood.id && comparisonArc.hoodB?.id === hood.id) || (comparisonArc.hoodB?.id === p.selectedHood.id && comparisonArc.hoodA?.id === hood.id));

            return (
              <div key={hood.id} className={`p-4 rounded-xl bg-white dark:bg-slate-900 border transition flex items-center justify-between ${isSelected ? 'border-emerald-600 dark:border-emerald-400 ring-1 ring-emerald-600 dark:ring-emerald-400' : 'border-slate-200 dark:border-slate-800 hover:border-slate-900 dark:hover:border-white'}`}>
                <div role="button" tabIndex={0} onClick={() => p.onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectNeighborhood(hood); } }} className="cursor-pointer">
                  <div className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                    <span>محله {hood.name}</span>
                    {isSelected && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">فعال روی نقشه</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{hood.zone} · رهن: {toPersianNum(hood.rahn80m)} م.ت</div>
                </div>
                <div className="text-left shrink-0 tabular-nums flex items-center gap-2">
                  <div>
                    <div className="text-xs font-black text-slate-900 dark:text-white">{toPersianNum(unitBuy)} <span className="text-emerald-600 dark:text-emerald-400">({toPersianNum(unitDeal)})</span> م</div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">معامله v6.4 · امتیاز {toPersianNum(hood.overallScore)}/۱۰</div>
                  </div>
                  {!isSelected && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); updateMapAdvancedOverlayState({ comparisonArc: { active: !isArcActive, isPinned: !isArcActive, hoodA: p.selectedHood, hoodB: hood } }); }} title={`ترسیم کمان مقایسه زنده با ${p.selectedHood.name} روی نقشه`} aria-label={`کمان مقایسه ${hood.name} روی نقشه`} className={`p-1.5 rounded-lg border text-[10px] font-bold cursor-pointer ${isArcActive ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50'}`}>
                      <Scale className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={(e) => { e.stopPropagation(); p.onOpenInspector(hood); }} aria-label={`مشاهده کارنامه ${hood.name}`} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                    کارنامه ↗
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
