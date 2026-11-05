import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Building2, Calendar, LineChart as LineChartIcon, Maximize2, Table2, TrendingUp, X } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BubbleReport, EvaluatedNeighborhood, Neighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData';
import { buildRealistic12MonthBuyAndRentTrend, type TwelveMonthBuyRentPoint } from './NeighborhoodPriceChart';
import { useDialogFocus } from './useDialogFocus';
import { AreaUnitToggle, useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertAreaFromSqm, convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export type PriceTrendChartMode = 'dual_buy_rent' | 'buy_vs_city' | 'rent_rahn_detail';
export interface EnrichedTwelveMonthPoint extends TwelveMonthBuyRentPoint {
  scaledRahn: number; scaledMonthlyRent: number; totalBuyBillion: number; momBuyChangePercent: number; momRentChangePercent: number;
}
export interface NeighborhoodPriceTrendModalProps {
  open: boolean; onClose: () => void; selectedHood: EvaluatedNeighborhood | Neighborhood; marketReport?: BubbleReport;
  activeCity?: CityId; targetSqm?: number; evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void; areaUnit?: string; intlCurrency?: string;
}
const SQM_PRESETS: readonly number[] = [60, 80, 100, 120];

export function NeighborhoodPriceTrendModal({
  open, onClose, selectedHood, marketReport, activeCity = 'tehran', targetSqm = 80, evaluatedNeighborhoods = [],
  onSelectNeighborhood, areaUnit: propAreaUnit, intlCurrency: propIntlCurrency,
}: NeighborhoodPriceTrendModalProps): React.ReactElement | null {
  const dialogRef = useDialogFocus(open, onClose);
  const [ctxAreaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [ctxIntlCurrency] = useIntlCurrency();
  const areaUnit = (propAreaUnit as any) ?? ctxAreaUnit; const intlCurrency = (propIntlCurrency as any) ?? ctxIntlCurrency;
  const isEn = radarLocale === 'en';
  const [chartMode, setChartMode] = useState<PriceTrendChartMode>('dual_buy_rent');
  const [customSqm, setCustomSqm] = useState<number>(targetSqm || 80);
  const [showDataTable, setShowDataTable] = useState<boolean>(false);
  const effectiveSqm = Math.max(35, Math.min(350, customSqm || targetSqm || 80));
  const effectiveAreaLabel = areaUnit === 'sqft' ? `${toPersianNum(Math.round(convertAreaFromSqm(effectiveSqm, 'sqft')))} sqft` : `${toPersianNum(effectiveSqm)} ${isEn ? 'sqm' : 'متری'}`;
  const cityNameFa = (activeCity && MULTI_CITY_CONFIGS[activeCity]?.nameFa) || 'تهران';
  const liveDealAgg = useMemo(() => aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, []), [selectedHood.id, selectedHood.name, selectedHood.buyPerSqm]);
  const baseSeries12m = useMemo(() => buildRealistic12MonthBuyAndRentTrend(selectedHood, marketReport), [selectedHood, marketReport]);

  const enrichedSeries12m = useMemo<EnrichedTwelveMonthPoint[]>(() => {
    const sqmRatio = effectiveSqm / 80;
    return baseSeries12m.map((pt, index, arr) => {
      const uCityBuy = Number(convertPricePerSqmToUnit(pt.tehranAvgBuy, areaUnit).toFixed(1));
      const prev = index > 0 ? arr[index - 1] : pt;
      const scaledRahn = Math.max(50, Math.round(pt.rahn80m * sqmRatio));
      const scaledMonthlyRent = Math.max(1.5, Math.round(scaledRahn * 0.03 * 10) / 10);
      const totalBuyBillion = Math.round(((pt.buyPerSqm * effectiveSqm) / 1000) * 100) / 100;
      const momBuyChangePercent = index === 0 ? 0 : Math.round(((pt.buyPerSqm - prev.buyPerSqm) / Math.max(1, prev.buyPerSqm)) * 1000) / 10;
      const momRentChangePercent = index === 0 ? 0 : Math.round(((pt.rahn80m - prev.rahn80m) / Math.max(1, prev.rahn80m)) * 1000) / 10;
      return { ...pt, uCityBuy, scaledRahn, scaledMonthlyRent, totalBuyBillion, momBuyChangePercent, momRentChangePercent };
    });
  }, [baseSeries12m, effectiveSqm, areaUnit]);

  const summaryStats = useMemo(() => {
    if (enrichedSeries12m.length === 0) return { firstMonth: '—', lastMonth: '—', startBuy: 0, endBuy: 0, buyGrowth12m: 0, startRahn: 0, endRahn: 0, endMonthlyRent: 0, rentGrowth12m: 0, avgBuy12m: 0, avgRahn12m: 0, annualRentYield: '0.0', prRatioYears: '0.0', endTotal80mMillions: 0 };
    const first = enrichedSeries12m[0]; const last = enrichedSeries12m[enrichedSeries12m.length - 1];
    const buyGrowth12m = Math.round(((last.buyPerSqm - first.buyPerSqm) / Math.max(1, first.buyPerSqm)) * 100);
    const rentGrowth12m = Math.round(((last.scaledRahn - first.scaledRahn) / Math.max(1, first.scaledRahn)) * 100);
    const avgBuy12m = Math.round(enrichedSeries12m.reduce((acc, item) => acc + item.buyPerSqm, 0) / enrichedSeries12m.length);
    const avgRahn12m = Math.round(enrichedSeries12m.reduce((acc, item) => acc + item.scaledRahn, 0) / enrichedSeries12m.length);
    const annualRentTotalMillion = last.scaledRahn * 0.36; const totalBuyMillion = Math.max(1, last.buyPerSqm * effectiveSqm);
    const annualRentYield = ((annualRentTotalMillion / totalBuyMillion) * 100).toFixed(1);
    const prRatioYears = (totalBuyMillion / Math.max(1, annualRentTotalMillion)).toFixed(1);
    const endTotal80mMillions = Math.round((last.buyPerSqm * 80) / 1000);
    return { firstMonth: first.month, lastMonth: last.month, startBuy: first.buyPerSqm, endBuy: last.buyPerSqm, endTotal80mMillions, buyGrowth12m, startRahn: first.scaledRahn, endRahn: last.scaledRahn, endMonthlyRent: last.scaledMonthlyRent, rentGrowth12m, avgBuy12m, avgRahn12m, annualRentYield, prRatioYears };
  }, [enrichedSeries12m, effectiveSqm]);

  if (!open) return null;

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} role="dialog" aria-modal="true" aria-labelledby="neighborhood-price-trend-modal-title" className="fixed inset-0 z-[1250] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn" onClick={onClose}>
      <div ref={dialogRef} className="apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-[20px] shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shrink-0 shadow-xs"><LineChartIcon className="w-4 h-4 stroke-[2]" /></div>
            <div className="min-w-0">
              <h2 id="neighborhood-price-trend-modal-title" className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
                {isEn ? `12-Month Price Trend — ${selectedHood.name}` : `روند تاریخی ۱۲ ماهه قیمت خرید و اجاره — ${selectedHood.name}`}
              </h2>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /><span>{summaryStats.firstMonth} {isEn ? 'to' : 'تا'} {summaryStats.lastMonth}</span></span>
                <span>·</span><span>{cityNameFa} ({selectedHood.zone})</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <AreaUnitToggle compact showIntlControls />
            {evaluatedNeighborhoods.length > 1 && onSelectNeighborhood && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select value={selectedHood.id} onChange={(e) => { const f = evaluatedNeighborhoods.find((h) => h.id === Number(e.target.value)); if (f) onSelectNeighborhood(f); }} className="bg-transparent font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer max-w-[140px] truncate">
                  {evaluatedNeighborhoods.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.zone}) — {toPersianNum(Number(convertPricePerSqmToUnit(h.buyPerSqm, areaUnit).toFixed(1)))} م</option>)}
                </select>
              </div>
            )}
            <button type="button" onClick={onClose} aria-label={isEn ? 'Close' : 'بستن'} className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer">
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 tabular-nums">
            <div className="bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-900/40 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-emerald-900 dark:text-emerald-300 font-semibold">
                <span>{isEn ? `Buy Price (${areaUnit === 'sqft' ? 'ft²' : 'm²'})` : `قیمت خرید (${areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'})`}</span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-600/10 dark:bg-emerald-400/10 text-emerald-800 dark:text-emerald-300 font-extrabold text-[10.5px]">
                  {summaryStats.buyGrowth12m >= 0 ? <ArrowUpRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <ArrowDownRight className="w-3 h-3 text-rose-600 dark:text-rose-400" />}{summaryStats.buyGrowth12m > 0 ? '+' : ''}{toPersianNum(summaryStats.buyGrowth12m)}٪
                </span>
              </div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white">{toPersianNum(Number(convertPricePerSqmToUnit(summaryStats.endBuy, areaUnit).toFixed(1)))} <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{isEn ? 'M IRT' : 'میلیون تومان'}</span></div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">12M: {toPersianNum(Number(convertPricePerSqmToUnit(summaryStats.startBuy, areaUnit).toFixed(1)))} م · قطعی معامله v6.4: {toPersianNum(Number(convertPricePerSqmToUnit(liveDealAgg.estimatedDealPricePerSqm, areaUnit).toFixed(1)))} م</div>
            </div>

            <div className="bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200/80 dark:border-sky-900/40 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-sky-900 dark:text-sky-300 font-semibold">
                <span>{isEn ? `Deposit (${effectiveAreaLabel})` : `رهن کامل (${effectiveAreaLabel})`}</span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-600/10 dark:bg-sky-400/10 text-sky-800 dark:text-sky-300 font-extrabold text-[10.5px]">
                  {summaryStats.rentGrowth12m >= 0 ? <ArrowUpRight className="w-3 h-3 text-sky-600 dark:text-sky-400" /> : <ArrowDownRight className="w-3 h-3 text-rose-600 dark:text-rose-400" />}{summaryStats.rentGrowth12m > 0 ? '+' : ''}{toPersianNum(summaryStats.rentGrowth12m)}٪
                </span>
              </div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white">{toPersianNum(summaryStats.endRahn)} <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{isEn ? 'M IRT' : 'میلیون تومان'}</span></div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{isEn ? `Monthly Rent: ${toPersianNum(summaryStats.endMonthlyRent)}M` : `اجاره ماهانه: ${toPersianNum(summaryStats.endMonthlyRent)} م`}</div>
            </div>

            <div className="bg-violet-50/70 dark:bg-violet-950/25 border border-violet-200/80 dark:border-violet-900/40 rounded-xl p-3 space-y-1">
              <div className="text-[11px] text-violet-900 dark:text-violet-300 font-semibold">{isEn ? 'Monthly Rent Equiv' : 'معادل اجاره ماهانه'}</div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white">{toPersianNum(summaryStats.endMonthlyRent)} <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{isEn ? 'M/mo' : 'میلیون/ماه'}</span></div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{isEn ? '3% monthly conversion' : 'نرخ تبدیل عرف بازار: ۳٪ ماهانه'}</div>
            </div>

            <div className="bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-900/40 rounded-xl p-3 space-y-1">
              <div className="text-[11px] text-amber-900 dark:text-amber-300 font-semibold">{isEn ? 'Yield & P/R Ratio' : 'بازده اجاره و نسبت P/R'}</div>
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white">{toPersianNum(summaryStats.annualRentYield)}٪ <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{isEn ? 'Annual Yield' : 'بازده سالانه'}</span></div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{isEn ? `P/R: ${toPersianNum(summaryStats.prRatioYears)} yrs` : `بازگشت: ${toPersianNum(summaryStats.prRatioYears)} سال`}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl p-2">
            <div className="flex flex-wrap items-center gap-1 bg-slate-200/70 dark:bg-slate-900 p-0.5 rounded-lg text-[11px] font-bold">
              {[
                { id: 'dual_buy_rent' as const, labelFa: 'روند همزمان خرید و اجاره', labelEn: 'Buy & Rent Dual' },
                { id: 'buy_vs_city' as const, labelFa: `خرید در برابر میانگین شهر`, labelEn: `Neighborhood vs City Avg` },
                { id: 'rent_rahn_detail' as const, labelFa: 'رهن کامل و اجاره ماهانه', labelEn: 'Deposit & Rent Detail' },
              ].map((tab) => (
                <button key={tab.id} type="button" onClick={() => setChartMode(tab.id)} className={`px-2.5 py-1 rounded-md transition cursor-pointer ${chartMode === tab.id ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-extrabold' : 'text-slate-600 dark:text-slate-400'}`}>
                  {isEn ? tab.labelEn : tab.labelFa}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg p-0.5 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 px-1 font-medium">{isEn ? 'Area:' : 'متراژ:'}</span>
                {SQM_PRESETS.map((sqm) => (
                  <button key={sqm} type="button" onClick={() => setCustomSqm(sqm)} className={`px-1.5 py-0.5 rounded font-bold tabular-nums transition cursor-pointer ${effectiveSqm === sqm ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-700 dark:text-slate-300'}`}>
                    {areaUnit === 'sqft' ? `${toPersianNum(Math.round(convertAreaFromSqm(sqm, 'sqft')))}ft²` : `${toPersianNum(sqm)}م`}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setShowDataTable((prev) => !prev)} className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${showDataTable ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                <Table2 className="w-3.5 h-3.5" /><span>{showDataTable ? (isEn ? 'Hide Table' : 'پنهان‌کردن جدول') : (isEn ? '12M Table' : 'جدول ۱۲ ماهه')}</span>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 font-bold">
              <div className="flex items-center gap-1 text-slate-800 dark:text-white"><TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><span>{selectedHood.name} — 12 Month Historical Trend</span></div>
              <span className="text-[10px] text-slate-400">{isEn ? 'Hover on points for details' : 'نشانگر را روی نقاط ببرید'}</span>
            </div>
            <div dir="ltr" className="w-full h-[270px] min-w-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={enrichedSeries12m} margin={{ top: 10, right: 14, left: 2, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} vertical={false} />
                  <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Vazirmatn' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                  <YAxis yAxisId="left" orientation="left" stroke={chartMode === 'rent_rahn_detail' ? '#0284c7' : '#059669'} width={44} tickFormatter={(val) => toPersianNum(chartMode === 'rent_rahn_detail' ? val : Number(convertPricePerSqmToUnit(Number(val) || 0, areaUnit).toFixed(1)))} tick={{ fill: chartMode === 'rent_rahn_detail' ? '#0284c7' : '#059669', fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  {chartMode !== 'buy_vs_city' && <YAxis yAxisId="right" orientation="right" stroke={chartMode === 'rent_rahn_detail' ? '#7c3aed' : '#0284c7'} width={44} tickFormatter={(val) => toPersianNum(val)} tick={{ fill: chartMode === 'rent_rahn_detail' ? '#7c3aed' : '#0284c7', fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />}
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0]?.payload as EnrichedTwelveMonthPoint | undefined;
                    if (!pt) return null;
                    const uBuy = Number(convertPricePerSqmToUnit(pt.buyPerSqm, areaUnit).toFixed(1));
                    return (
                      <div dir={isEn ? 'ltr' : 'rtl'} className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs shadow-xl space-y-1 tabular-nums">
                        <div className="font-extrabold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1 flex justify-between gap-2"><span>{label}</span><span className="text-slate-400">{selectedHood.name}</span></div>
                        <div className="text-emerald-700 dark:text-emerald-400 font-bold">خرید: {toPersianNum(uBuy)} M</div>
                        <div className="text-sky-700 dark:text-sky-400 font-bold">رهن: {toPersianNum(pt.scaledRahn)} M</div>
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Vazirmatn' }} />
                  {chartMode === 'dual_buy_rent' && (
                    <>
                      <ReferenceLine yAxisId="left" y={summaryStats.avgBuy12m} label={toPersianNum(convertPricePerSqmToUnit(summaryStats.avgBuy12m, areaUnit))} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.55} />
                      <Line yAxisId="left" type="monotone" dataKey="buyPerSqm" name={isEn ? `Buy Price (${areaUnit === 'sqft' ? 'ft²' : 'm²'})` : `قیمت خرید`} stroke="#059669" strokeWidth={3} dot={{ r: 3, fill: '#059669' }} />
                      <Line yAxisId="right" type="monotone" dataKey="scaledRahn" name={`رهن کامل ${effectiveAreaLabel} (میلیون تومان)`} stroke="#0284c7" strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 3, fill: '#0284c7' }} />
                    </>
                  )}
                  {chartMode === 'buy_vs_city' && (
                    <>
                      <Line yAxisId="left" type="monotone" dataKey="buyPerSqm" name={selectedHood.name} stroke="#059669" strokeWidth={3} dot={{ r: 3, fill: '#059669' }} />
                      <Line yAxisId="left" type="monotone" dataKey="tehranAvgBuy" name={cityNameFa} stroke="#64748b" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2.5, fill: '#64748b' }} />
                    </>
                  )}
                  {chartMode === 'rent_rahn_detail' && (
                    <>
                      <Line yAxisId="left" type="monotone" dataKey="scaledRahn" name="Deposit" stroke="#0284c7" strokeWidth={3} dot={{ r: 3, fill: '#0284c7' }} />
                      <Line yAxisId="right" type="monotone" dataKey="scaledMonthlyRent" name="Monthly Rent" stroke="#7c3aed" strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 3, fill: '#7c3aed' }} />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {showDataTable && (
            <div className="border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
              <div className="overflow-x-auto max-h-52">
                <table className="w-full text-right border-collapse text-[11px] tabular-nums">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      <th className="py-1.5 px-3 font-bold">Month</th><th className="py-1.5 px-3 font-bold">Buy</th><th className="py-1.5 px-3 font-bold">Deposit</th><th className="py-1.5 px-3 font-bold">Growth</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {enrichedSeries12m.map((row) => {
                      const uRowBuy = Number(convertPricePerSqmToUnit(row.buyPerSqm, areaUnit).toFixed(1));
                      return (
                        <tr key={`${row.monthIndex}-${row.month}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-1.5 px-3 font-bold text-slate-900 dark:text-white">{row.month}</td>
                          <td className="py-1.5 px-3 text-emerald-700 dark:text-emerald-400 font-extrabold">{toPersianNum(uRowBuy)} M</td>
                          <td className="py-1.5 px-3 text-sky-700 dark:text-sky-400 font-extrabold">{toPersianNum(row.scaledRahn)} M</td>
                          <td className="py-1.5 px-3 font-bold">{row.momBuyChangePercent > 0 ? '+' : ''}{toPersianNum(row.momBuyChangePercent)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 sm:px-6 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <Maximize2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{isEn ? '12-month synthesized closing price and market rent trends.' : 'سری زمانی ۱۲ ماهه بر اساس قیمت فعلی محله، داده‌های ۶ ماهه و ضرایب فصلی استخراج شده است.'}</span>
          </div>
          <button type="button" onClick={onClose} className="px-3.5 py-1 rounded-lg bg-slate-900 dark:bg-white hover:bg-slate-800 text-white dark:text-slate-900 font-bold transition cursor-pointer">
            {isEn ? 'Close' : 'بستن نمودار'}
          </button>
        </div>
      </div>
    </div>
  );
}