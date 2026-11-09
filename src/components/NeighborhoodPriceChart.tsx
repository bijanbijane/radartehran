import React, { useMemo, useState } from 'react';
import { TrendingUp, ArrowUpRight, BarChart2, Maximize2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BubbleReport, EvaluatedNeighborhood, Neighborhood, toPersianNum } from '../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';
import { buildTrailingJalaliMonths, type MarketSeriesProvenanceType } from '../utils/marketHistoryAndPulseIntegrity';
import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface TwelveMonthBuyRentPoint {
  month: string; monthKey?: string; monthIndex: number; buyPerSqm: number; rahn80m: number;
  monthlyRentEquiv: number; tehranAvgBuy: number; provenance?: MarketSeriesProvenanceType;
}

const SEASONAL_RENT_FACTORS: readonly number[] = [0.80, 0.83, 0.86, 0.89, 0.90, 0.91, 0.93, 0.94, 0.96, 0.98, 0.99, 1.0];
const SEASONAL_BUY_EARLY_FACTORS: readonly number[] = [0.78, 0.80, 0.82, 0.83, 0.85, 0.87];

export function buildRealistic12MonthBuyAndRentTrend(
  selectedHood: EvaluatedNeighborhood | Neighborhood, marketReport?: BubbleReport, referenceDate: Date = new Date()
): TwelveMonthBuyRentPoint[] {
  const currentBuy = Math.max(15, Number((selectedHood as EvaluatedNeighborhood)?.baseBuyPerSqm ?? selectedHood?.buyPerSqm) || 120);
  const currentRahn80m = Math.max(100, Number(selectedHood?.rahn80m) || 1200);
  const trend6m = Array.isArray(marketReport?.trendData) ? marketReport.trendData : [];
  const trailing12 = buildTrailingJalaliMonths(12, referenceDate);
  const earliest6mBuy = trend6m.length > 0 && Number(trend6m[0]?.hoodPrice) > 0 ? Number(trend6m[0].hoodPrice) : Math.round(currentBuy * 0.88);
  const earliest6mCity = trend6m.length > 0 && Number(trend6m[0]?.tehranAvg) > 0 ? Number(trend6m[0].tehranAvg) : Math.round(currentBuy * 0.86);

  return trailing12.map((jalaliItem, idx) => {
    let buyPerSqm: number; let tehranAvgBuy: number;
    if (idx < 6) {
      const factor = SEASONAL_BUY_EARLY_FACTORS[idx] / SEASONAL_BUY_EARLY_FACTORS[5];
      buyPerSqm = Math.max(10, Math.round(earliest6mBuy * factor)); tehranAvgBuy = Math.max(10, Math.round(earliest6mCity * factor));
    } else {
      const point6 = trend6m[idx - 6];
      buyPerSqm = point6 && Number(point6.hoodPrice) > 0 ? Math.round(Number(point6.hoodPrice)) : Math.round(earliest6mBuy + ((currentBuy - earliest6mBuy) * (idx - 5)) / 6);
      tehranAvgBuy = point6 && Number(point6.tehranAvg) > 0 ? Math.round(Number(point6.tehranAvg)) : Math.round(earliest6mCity * (1 + (idx - 5) * 0.02));
      if (idx === 11) buyPerSqm = Math.round(currentBuy);
    }
    const rahn80m = idx === 11 ? Math.round(currentRahn80m) : Math.max(80, Math.round(currentRahn80m * SEASONAL_RENT_FACTORS[idx]));
    const monthlyRentEquiv = Math.max(2, Math.round(rahn80m * 0.03 * 10) / 10);
    const shortMonthName = jalaliItem.monthLabelFa.split(' ')[0] || jalaliItem.monthLabelFa;
    return {
      month: idx >= 6 && trend6m[idx - 6]?.month ? trend6m[idx - 6].month : shortMonthName,
      monthKey: jalaliItem.monthKey, monthIndex: idx + 1, buyPerSqm, rahn80m, monthlyRentEquiv, tehranAvgBuy, provenance: 'modeled_trend_series',
    };
  });
}

export interface NeighborhoodPriceChartProps {
  selectedHood: EvaluatedNeighborhood | Neighborhood; marketReport: BubbleReport; activeCity?: CityId; compact?: boolean; onOpenFullModal?: () => void;
}

export function NeighborhoodPriceChart({ selectedHood, marketReport, activeCity = 'tehran', compact = false, onOpenFullModal }: NeighborhoodPriceChartProps): React.ReactElement {
  const handleOpenFullModal = () => {
    if (onOpenFullModal) onOpenFullModal();
    else if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('radar-open-price-trend-modal'));
  };
  const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency();
  const isEn = radarLocale === 'en';
  const hoodTotal80m = Number(((selectedHood.buyPerSqm * 80) / 1000).toFixed(1));
  const monthlyRent80mMillions = Math.round(selectedHood.rahn80m * 0.03);
  const dealMetrics = useMemo(() => aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, buildNeighborhoodListingSamples(selectedHood)), [selectedHood]);
  const uDealCur = convertPricePerSqmToUnit(dealMetrics.estimatedDealPricePerSqm, areaUnit);
  const [chartView, setChartView] = useState<'12m_buy_rent' | '6m_city'>('12m_buy_rent');
  const cityNameFa = (activeCity && MULTI_CITY_CONFIGS[activeCity]?.nameFa) || 'تهران';
  const trendData6m = Array.isArray(marketReport?.trendData) ? marketReport.trendData : [];
  const trendData12m = useMemo(() => buildRealistic12MonthBuyAndRentTrend(selectedHood, marketReport), [selectedHood, marketReport]);

  const buyGrowth12m = useMemo(() => {
    const first = trendData12m[0]?.buyPerSqm || 1; const last = trendData12m[trendData12m.length - 1]?.buyPerSqm || first;
    return Math.round(((last - first) / Math.max(1, first)) * 100);
  }, [trendData12m]);
  const rentGrowth12m = useMemo(() => {
    const first = trendData12m[0]?.rahn80m || 1; const last = trendData12m[trendData12m.length - 1]?.rahn80m || first;
    return Math.round(((last - first) / Math.max(1, first)) * 100);
  }, [trendData12m]);
  const hoodGrowth6m = useMemo(() => {
    const reported = Number(marketReport?.hoodGrowth6mPercent);
    if (Number.isFinite(reported) && reported !== 0) return reported;
    if (trendData6m.length >= 2) {
      const first = Number(trendData6m[0]?.hoodPrice) || 1; const last = Number(trendData6m[trendData6m.length - 1]?.hoodPrice) || first;
      return Math.round(((last - first) / Math.max(1, first)) * 100);
    }
    return 0;
  }, [marketReport?.hoodGrowth6mPercent, trendData6m]);
  const cityGrowth6m = useMemo(() => {
    const reported = Number(marketReport?.tehranGrowth6mPercent);
    if (Number.isFinite(reported) && reported !== 0) return reported;
    if (trendData6m.length >= 2) {
      const first = Number(trendData6m[0]?.tehranAvg) || 1; const last = Number(trendData6m[trendData6m.length - 1]?.tehranAvg) || first;
      return Math.round(((last - first) / Math.max(1, first)) * 100);
    }
    return 0;
  }, [marketReport?.tehranGrowth6mPercent, trendData6m]);

  return (
    <div className="apple-grouped-card dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <TrendingUp className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs truncate">
            {chartView === '12m_buy_rent'
              ? (isEn ? `12M Buy & Rent Trend (${selectedHood.name})` : `روند ۱۲ ماهه قیمت خرید و اجاره (${selectedHood.name})`)
              : (isEn ? `6M Housing Price Trend (${selectedHood.name})` : `روند ۶ ماهه قیمت مسکن (${selectedHood.name})`)}
          </span>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-[8px] text-[10.5px] font-bold shrink-0 border border-slate-200/60 dark:border-slate-700">
          <button type="button" onClick={() => setChartView('12m_buy_rent')} className={`px-2 py-1 rounded-[6px] transition cursor-pointer ${chartView === '12m_buy_rent' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}>
            {isEn ? '12M Buy & Rent' : '۱۲ ماهه خرید و اجاره'}
          </button>
          <button type="button" onClick={() => setChartView('6m_city')} className={`px-2 py-1 rounded-[6px] transition cursor-pointer ${chartView === '6m_city' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-extrabold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}>
            {isEn ? '6M City Compare' : 'مقایسه ۶ ماهه'}
          </button>
          <button type="button" onClick={handleOpenFullModal} title="مشاهده نمودار تمام‌صفحه روند ۱۲ ماهه خرید و اجاره" className="px-2 py-1 rounded-[6px] bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center gap-1 transition cursor-pointer">
            <Maximize2 className="w-3 h-3" />
            <span>{isEn ? 'Expand' : 'بزرگ‌نمایی'}</span>
          </button>
        </div>
      </div>

      {chartView === '12m_buy_rent' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300 pb-0.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-600 rounded inline-block" />
                <span className="font-semibold text-slate-800 dark:text-slate-200">{isEn ? `Buy / ${areaUnit === 'sqft' ? 'ft²' : 'm²'}` : `خرید ${areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'}`} ({buyGrowth12m > 0 ? '+' : ''}{toPersianNum(buyGrowth12m)}٪ {isEn ? 'YoY' : 'سالانه'})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-sky-600 rounded inline-block" />
                <span className="font-semibold text-sky-800 dark:text-sky-300">{isEn ? `Deposit ${formatAreaShort(80, areaUnit)}` : `رهن و اجاره ${formatAreaShort(80, areaUnit)}`} ({rentGrowth12m > 0 ? '+' : ''}{toPersianNum(rentGrowth12m)}٪ {isEn ? 'YoY' : 'سالانه'})</span>
              </div>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold tabular-nums">
              معامله v6.4: <strong className="text-emerald-700 dark:text-emerald-400">{toPersianNum(uDealCur)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uDealCur, intlCurrency, radarLocale)})` : ''}</strong> · کل ۸۰م: {toPersianNum(hoodTotal80m)} میلیارد · اجاره: {toPersianNum(monthlyRent80mMillions)} م · بازده اجاره: {toPersianNum((((selectedHood.rahn80m * 0.36) / Math.max(1, selectedHood.buyPerSqm * 80)) * 100).toFixed(1))}٪
            </span>
          </div>
          <div dir="ltr" className={`w-full min-w-[240px] ${compact ? 'h-[185px]' : 'h-[215px]'}`}>
            <ResponsiveContainer width="100%" height="100%" minWidth={240}>
              <LineChart data={trendData12m} margin={{ top: 10, right: 8, left: -6, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} vertical={false} />
                <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Vazirmatn' }} axisLine={{ stroke: '#94a3b8', strokeOpacity: 0.35 }} tickLine={false} />
                <YAxis yAxisId="buy" orientation="left" stroke="#059669" width={38} tickFormatter={(val) => toPersianNum(convertPricePerSqmToUnit(Number(val) || 0, areaUnit))} tick={{ fill: '#059669', fontSize: 10, fontFamily: 'Vazirmatn' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                <YAxis yAxisId="rent" orientation="right" stroke="#0284c7" width={42} tickFormatter={(val) => toPersianNum(val)} tick={{ fill: '#0284c7', fontSize: 10, fontFamily: 'Vazirmatn' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const point = payload[0]?.payload as TwelveMonthBuyRentPoint | undefined;
                    const buyVal = Number(point?.buyPerSqm ?? payload.find((p) => p.dataKey === 'buyPerSqm')?.value) || 0;
                    const uBuyVal = convertPricePerSqmToUnit(buyVal, areaUnit);
                    const uDealPoint = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, buyVal, []).estimatedDealPricePerSqm, areaUnit);
                    const total80Buy = Math.round(buyVal * 80);
                    const rahnVal = Number(point?.rahn80m ?? payload.find((p) => p.dataKey === 'rahn80m')?.value) || 0;
                    const rentMonthlyVal = Number(point?.monthlyRentEquiv) || Math.round(rahnVal * 0.03 * 10) / 10;
                    const fxBuy = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uBuyVal, intlCurrency, radarLocale)})` : '';
                    const fxTotal80 = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(total80Buy, intlCurrency, radarLocale)})` : '';
                    const fxRahn = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(rahnVal, intlCurrency, radarLocale)})` : '';
                    const fxRent = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(rentMonthlyVal, intlCurrency, radarLocale)})` : '';
                    return (
                      <div dir={isEn ? 'ltr' : 'rtl'} className="apple-grouped-card bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 rounded-[12px] p-2.5 text-xs shadow-xl space-y-1.5 min-w-[185px]">
                        <div className="font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-1 flex items-center justify-between">
                          <span>{isEn ? `Month: ${label}` : `ماه ${label}`}</span><span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">{selectedHood.name}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-emerald-700 dark:text-emerald-400 font-extrabold">
                          <span>{isEn ? `Buy / ${areaUnit === 'sqft' ? 'ft²' : 'm²'}:` : `خرید هر ${areaUnit === 'sqft' ? 'ft²' : 'متر مربع'}:`}</span>
                          <span className="tabular-nums">{toPersianNum(uBuyVal)} م (معامله: {toPersianNum(uDealPoint)} م){fxBuy}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-slate-700 dark:text-slate-300 text-[10.5px]">
                          <span>{isEn ? '80m² Total:' : 'کل واحد (۸۰م):'}</span>
                          <span className="font-bold tabular-nums">{toPersianNum((total80Buy / 1000).toFixed(2))} میلیارد{fxTotal80}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sky-700 dark:text-sky-400 font-extrabold">
                          <span>{isEn ? 'Deposit 80m²:' : 'رهن کامل (۸۰م):'}</span>
                          <span className="tabular-nums">{toPersianNum(rahnVal)} میلیون{fxRahn}</span>
                        </div>
                        <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10.5px] text-slate-600 dark:text-slate-400">
                          <span>{isEn ? 'Rent Equiv:' : 'معادل اجاره ماهانه:'}</span>
                          <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">{toPersianNum(rentMonthlyVal)} م{fxRent}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Line yAxisId="buy" type="monotone" dataKey="buyPerSqm" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: '#059669', strokeWidth: 1.5, stroke: '#ffffff' }} activeDot={{ r: 5, fill: '#047857', stroke: '#ffffff', strokeWidth: 2 }} />
                <Line yAxisId="rent" type="monotone" dataKey="rahn80m" name={`رهن کامل ${formatAreaShort(80, areaUnit)} (م)`} stroke="#0284c7" strokeWidth={2.25} strokeDasharray="5 3" dot={{ r: 2.75, fill: '#0284c7', strokeWidth: 1.5, stroke: '#ffffff' }} activeDot={{ r: 4.75, fill: '#0369a1', stroke: '#ffffff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between gap-2 text-[10px] text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/80 rounded-lg px-2 py-1">
            <span>{isEn ? 'Source: Model-generated series based on current price and seasonal trends' : 'منبع داده: سری شبیه‌سازی‌شده بر اساس قیمت فعلی و الگوی فصلی بازار'}</span>
            <details className="text-slate-700 dark:text-slate-300">
              <summary className="cursor-pointer font-bold text-emerald-700 dark:text-emerald-400">{isEn ? 'Accessible Data Table' : 'جدول دسترس‌پذیر داده‌ها'}</summary>
              <table className="mt-1 w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-right p-1">{isEn ? 'Month' : 'ماه'}</th>
                    <th className="text-right p-1">{isEn ? 'Buy' : 'خرید'}</th>
                    <th className="text-right p-1">{isEn ? 'Deposit 80m²' : 'رهن ۸۰م'}</th>
                  </tr>
                </thead>
                <tbody>
                  {trendData12m.map((pt) => {
                    const uPtBuy = convertPricePerSqmToUnit(pt.buyPerSqm, areaUnit);
                    return (
                      <tr key={pt.month} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="p-1">{pt.month}</td>
                        <td className="p-1 tabular-nums">{toPersianNum(uPtBuy)}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uPtBuy, intlCurrency, radarLocale)})` : ''}</td>
                        <td className="p-1 tabular-nums">{toPersianNum(pt.rahn80m)}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(pt.rahn80m, intlCurrency, radarLocale)})` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pb-0.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-600 rounded inline-block" />
                <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedHood.name} ({hoodGrowth6m > 0 ? '+' : ''}{toPersianNum(hoodGrowth6m)}٪)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-b border-dashed border-slate-400 inline-block" />
                <span>{cityNameFa} ({cityGrowth6m > 0 ? '+' : ''}{toPersianNum(cityGrowth6m)}٪)</span>
              </div>
            </div>
            <span className={`inline-flex items-center gap-0.5 text-[10.5px] font-extrabold tabular-nums ${hoodGrowth6m >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              <ArrowUpRight className={`w-3 h-3 ${hoodGrowth6m >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 rotate-90'}`} />
              <span>{hoodGrowth6m > 0 ? '+' : ''}{toPersianNum(hoodGrowth6m)}٪</span>
            </span>
          </div>
          {trendData6m.length > 0 ? (
            <div dir="ltr" className={`w-full min-w-[240px] ${compact ? 'h-[175px]' : 'h-[205px]'}`}>
              <ResponsiveContainer width="100%" height="100%" minWidth={240}>
                <LineChart data={trendData6m} margin={{ top: 10, right: 14, left: -4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} vertical={false} />
                  <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10.5, fontFamily: 'Vazirmatn' }} axisLine={{ stroke: '#94a3b8', strokeOpacity: 0.35 }} tickLine={false} />
                  <YAxis stroke="#64748b" width={42} tickFormatter={(val) => toPersianNum(convertPricePerSqmToUnit(Number(val) || 0, areaUnit))} tick={{ fill: '#64748b', fontSize: 10.5, fontFamily: 'Vazirmatn' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const hoodVal = convertPricePerSqmToUnit(Number(payload.find((p) => p.dataKey === 'hoodPrice')?.value) || 0, areaUnit);
                      const cityVal = convertPricePerSqmToUnit(Number(payload.find((p) => p.dataKey === 'tehranAvg')?.value) || 0, areaUnit);
                      const diff = hoodVal - cityVal;
                      const fxH = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(hoodVal, intlCurrency, radarLocale)})` : '';
                      const fxC = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(cityVal, intlCurrency, radarLocale)})` : '';
                      return (
                        <div dir={isEn ? 'ltr' : 'rtl'} className="apple-grouped-card bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 rounded-[12px] p-2.5 text-xs shadow-xl space-y-1.5 min-w-[170px]">
                          <div className="font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-1 flex items-center justify-between">
                            <span>{isEn ? `Month: ${label}` : `ماه ${label}`}</span><span className="text-[10.5px] text-slate-400 dark:text-slate-500 font-normal">{areaUnit === 'sqft' ? 'M/ft²' : 'میلیون/متر'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-emerald-700 dark:text-emerald-400 font-extrabold">
                            <span>{selectedHood.name}:</span><span className="tabular-nums">{toPersianNum(hoodVal)} م{fxH}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
                            <span>{cityNameFa}:</span><span className="tabular-nums">{toPersianNum(cityVal)} م{fxC}</span>
                          </div>
                          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
                            <span>{isEn ? 'Diff from Avg:' : 'اختلاف با میانگین:'}</span>
                            <span className={`font-bold tabular-nums ${diff >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                              {diff >= 0 ? `+${toPersianNum(diff)} م` : `${toPersianNum(diff)} م`}{diff !== 0 && intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(diff), intlCurrency, radarLocale)})` : ''}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="hoodPrice" stroke="#059669" strokeWidth={2.75} dot={{ r: 3.5, fill: '#059669', strokeWidth: 2, stroke: '#ffffff' }} activeDot={{ r: 5.5, fill: '#047857', stroke: '#ffffff', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="tehranAvg" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2.5, fill: '#94a3b8' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-slate-300" />
              <span>{isEn ? 'Historical trend data is not available for this location' : 'داده‌های روند تاریخی برای این نقطه در دسترس نیست'}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}