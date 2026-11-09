/**
 * @file src/components/NeighborhoodMonthlyBarChart.tsx
 * @description کامپوننت نمودار میله‌ای Recharts برای نمایش تغییرات قیمت ماهانه محله انتخابی در بازه ۶ ماهه
 * به همراه تفکیک ماه به ماه، میزان رشد مقطعی، مقایسه با میانگین شهر و هایلایت آخرین ماه.
 */

import React, { useMemo, useState } from 'react';
import { BarChart3, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { BubbleReport, EvaluatedNeighborhood, Neighborhood, toPersianNum } from '../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency, formatUnitBuyPriceTitle } from '../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

export interface MonthlyPriceBarPoint {
  month: string; price: number; cityAvg: number; changeAmount: number; changePercent: number; isLatest: boolean;
}

export interface NeighborhoodMonthlyBarChartProps {
  selectedHood: EvaluatedNeighborhood | Neighborhood; marketReport: BubbleReport; activeCity?: CityId; compact?: boolean;
  areaUnit?: string; intlCurrency?: string;
}

export function buildMonthlyPriceBarPoints(
  selectedHood: EvaluatedNeighborhood | Neighborhood,
  marketReport?: BubbleReport
): MonthlyPriceBarPoint[] {
  const rawData = Array.isArray(marketReport?.trendData) ? marketReport.trendData : [];
  if (!rawData.length) {
    const currentPrice = Number(selectedHood?.baseBuyPerSqm ?? selectedHood?.buyPerSqm) || 120;
    return [
      { month: 'ماه ۱', price: Math.round(currentPrice * 0.9), cityAvg: 90, changeAmount: 0, changePercent: 0, isLatest: false },
      { month: 'ماه ۲', price: Math.round(currentPrice * 0.92), cityAvg: 92, changeAmount: Math.round(currentPrice * 0.02), changePercent: 2.2, isLatest: false },
      { month: 'ماه ۳', price: Math.round(currentPrice * 0.94), cityAvg: 93, changeAmount: Math.round(currentPrice * 0.02), changePercent: 2.1, isLatest: false },
      { month: 'ماه ۴', price: Math.round(currentPrice * 0.96), cityAvg: 95, changeAmount: Math.round(currentPrice * 0.02), changePercent: 2.1, isLatest: false },
      { month: 'ماه ۵', price: Math.round(currentPrice * 0.98), cityAvg: 97, changeAmount: Math.round(currentPrice * 0.02), changePercent: 2.0, isLatest: false },
      { month: 'ماه ۶', price: currentPrice, cityAvg: 99, changeAmount: Math.round(currentPrice * 0.02), changePercent: 2.0, isLatest: true },
    ];
  }

  return rawData.map((item, idx) => {
    const price = Number(item.hoodPrice) || 0;
    const prevPrice = idx > 0 ? Number(rawData[idx - 1]?.hoodPrice) || price : price;
    const changeAmount = idx > 0 ? Math.round((price - prevPrice) * 10) / 10 : 0;
    const changePercent = idx > 0 && prevPrice > 0 ? Math.round(((price - prevPrice) / prevPrice) * 1000) / 10 : 0;

    return {
      month: item.month, price, cityAvg: Number(item.tehranAvg) || 0,
      changeAmount, changePercent, isLatest: idx === rawData.length - 1,
    };
  });
}

export function NeighborhoodMonthlyBarChart({ selectedHood, marketReport, activeCity = 'tehran', compact = false, areaUnit: propAreaUnit, intlCurrency: propIntlCurrency }: NeighborhoodMonthlyBarChartProps): React.ReactElement {
  const [viewMode, setViewMode] = useState<'price' | 'change'>('price');
  const [ctxAreaUnit] = useAreaUnit(); const [ctxIntlCurrency] = useIntlCurrency(); const [radarLocale] = useRadarLocale();
  const areaUnit = (propAreaUnit as any) ?? ctxAreaUnit; const intlCurrency = (propIntlCurrency as any) ?? ctxIntlCurrency;
  const isEn = radarLocale === 'en';
  const monthlyRent80mMillions = Math.round(selectedHood.rahn80m * 0.03);
  const unitLabel = areaUnit === 'sqft' ? 'ft²' : (isEn ? 'm²' : 'متر');
  const cityNameFa = (activeCity && MULTI_CITY_CONFIGS[activeCity]?.nameFa) || 'تهران';
  const hoodName = selectedHood?.name || 'محله';
  const chartData = useMemo(() => buildMonthlyPriceBarPoints(selectedHood, marketReport), [marketReport, selectedHood]);

  const totalGrowth6m = useMemo(() => {
    if (typeof marketReport?.hoodGrowth6mPercent === 'number' && marketReport.hoodGrowth6mPercent !== 0) return marketReport.hoodGrowth6mPercent;
    if (chartData.length >= 2 && chartData[0].price > 0) {
      const diff = chartData[chartData.length - 1].price - chartData[0].price;
      return Math.round((diff / chartData[0].price) * 1000) / 10;
    }
    return 0;
  }, [marketReport?.hoodGrowth6mPercent, chartData]);

  const avgMonthlyIncreaseMillion = useMemo(() => {
    if (chartData.length < 2) return 0;
    const diff = convertPricePerSqmToUnit(chartData[chartData.length - 1].price, areaUnit) - convertPricePerSqmToUnit(chartData[0].price, areaUnit);
    return Math.round((diff / (chartData.length - 1)) * 10) / 10;
  }, [chartData, areaUnit]);

  const latestCityAvg = chartData[chartData.length - 1]?.cityAvg || 0;
  const firstUnitPrice = convertPricePerSqmToUnit(chartData[0]?.price || 0, areaUnit);
  const latestRawPrice = chartData[chartData.length - 1]?.price || selectedHood?.buyPerSqm || 0;
  const latestUnitPrice = convertPricePerSqmToUnit(latestRawPrice, areaUnit);
  const latestDealUnitPrice = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(selectedHood.id, hoodName, latestRawPrice, []).estimatedDealPricePerSqm, areaUnit);
  const totalPriceDelta6m = Math.round((latestUnitPrice - firstUnitPrice) * 10) / 10;

  return (
    <div className="apple-grouped-card dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3.5 mb-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <BarChart3 className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs truncate block">
              {isEn ? `Monthly Price Bar Chart (${hoodName})` : `نمودار میله‌ای تغییرات قیمت ماهانه (${hoodName})`}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              {isEn ? `6-Month Trend ${formatUnitBuyPriceTitle(areaUnit)}` : `روند ۶ ماهه ${formatUnitBuyPriceTitle(areaUnit)}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-[8px] text-[10.5px] font-bold shrink-0 border border-slate-200/60 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setViewMode('price')}
            className={`px-2 py-1 rounded-[6px] transition cursor-pointer ${
              viewMode === 'price'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-extrabold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {isEn ? `Price / ${unitLabel}` : `قیمت هر ${unitLabel}`}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('change')}
            className={`px-2 py-1 rounded-[6px] transition cursor-pointer ${
              viewMode === 'change'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-extrabold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {isEn ? 'MoM Change' : 'تغییر ماه به ماه'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-[6px] border ${
            totalGrowth6m >= 0
              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
              : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
          }`}>
            {totalGrowth6m >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            <span>{isEn ? '6M Growth: ' : 'رشد ۶ ماهه: '}{totalGrowth6m > 0 ? `+${toPersianNum(totalGrowth6m)}` : toPersianNum(totalGrowth6m)}٪</span>
          </span>
          <span className="text-slate-500 dark:text-slate-400 text-[10.5px] tabular-nums">
            {isEn ? `Avg (${unitLabel}): ` : `میانگین (${unitLabel}): `}{avgMonthlyIncreaseMillion >= 0 ? `+${toPersianNum(avgMonthlyIncreaseMillion)}` : toPersianNum(avgMonthlyIncreaseMillion)} م/ماه{avgMonthlyIncreaseMillion !== 0 && intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(avgMonthlyIncreaseMillion), intlCurrency, radarLocale)})` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
          <Calendar className="w-3 h-3" />
          <span>{isEn ? 'Trailing 6 Months' : 'بازه ۶ ماه اخیر'}</span>
        </div>
      </div>

      <div dir="ltr" className={`w-full min-w-[240px] ${compact ? 'h-[175px]' : 'h-[200px]'}`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={240}>
          <BarChart data={chartData} margin={{ top: 12, right: 10, left: -6, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} vertical={false} />
            <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10.5, fontFamily: 'Vazirmatn' }} axisLine={{ stroke: '#94a3b8', strokeOpacity: 0.35 }} tickLine={false} />
            <YAxis
              stroke="#64748b"
              width={38}
              tickFormatter={(val) => toPersianNum(convertPricePerSqmToUnit(Number(val) || 0, areaUnit))}
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Vazirmatn' }}
              axisLine={false}
              tickLine={false}
              domain={
                viewMode === 'price'
                  ? [0, 'auto']
                  : [(dataMin: number) => Math.min(0, Math.floor(dataMin - 1)), (dataMax: number) => Math.max(2, Math.ceil(dataMax + 1))]
              }
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const point = payload[0]?.payload as MonthlyPriceBarPoint | undefined;
                if (!point) return null;
                const unitPriceVal = convertPricePerSqmToUnit(point.price, areaUnit);
                const unitDealVal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(selectedHood.id, hoodName, point.price, []).estimatedDealPricePerSqm, areaUnit);
                const total80Buy = Math.round(point.price * 80);
                const unitChangeVal = convertPricePerSqmToUnit(point.changeAmount, areaUnit);
                const unitCityVal = convertPricePerSqmToUnit(point.cityAvg, areaUnit);

                return (
                  <div
                    dir={isEn ? 'ltr' : 'rtl'}
                    className="apple-grouped-card bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 rounded-[12px] p-2.5 text-xs shadow-xl space-y-1.5 min-w-[180px]"
                  >
                    <div className="font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-1 flex items-center justify-between">
                      <span>{isEn ? `Month: ${point.month}` : `ماه ${point.month}`}</span>
                      {point.isLatest && (
                        <span className="px-1.5 py-0.5 rounded-[5px] bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[9.5px] font-extrabold border border-emerald-200 dark:border-emerald-800">
                          {isEn ? 'Current' : 'ماه جاری'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 text-emerald-700 dark:text-emerald-400 font-extrabold">
                      <span>{isEn ? `Price / ${unitLabel}:` : `قیمت هر ${unitLabel}:`}</span>
                      <span className="tabular-nums">
                        {toPersianNum(unitPriceVal)} م (معامله v6.4: {toPersianNum(unitDealVal)} م)
                        {intlCurrency !== 'IRT' && ` (${formatMillionTomanAsIntlCurrency(unitPriceVal, intlCurrency, radarLocale)})`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-slate-700 dark:text-slate-300 text-[10.5px]">
                      <span>{isEn ? `80m² Unit Value:` : `ارزش واحد (${formatAreaShort(80, areaUnit)}):`}</span>
                      <span className="font-bold tabular-nums">
                        {toPersianNum((total80Buy / 1000).toFixed(2))} {isEn ? 'B Toman' : 'میلیارد'}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(total80Buy, intlCurrency, radarLocale)})` : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-400 text-[11px]">
                      <span>{isEn ? 'MoM Change:' : 'تغییر نسبت به ماه قبل:'}</span>
                      <span className={`font-bold tabular-nums ${unitChangeVal >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {unitChangeVal > 0 ? `+${toPersianNum(unitChangeVal)} م` : unitChangeVal < 0 ? `${toPersianNum(unitChangeVal)} م` : (isEn ? 'No change' : 'بدون تغییر')}{unitChangeVal !== 0 && intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(unitChangeVal), intlCurrency, radarLocale)})` : ''}
                        {point.changePercent !== 0 && ` (${toPersianNum(point.changePercent)}٪)`}
                      </span>
                    </div>
                    <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
                      <span>{isEn ? `City Avg (${cityNameFa}):` : `میانگین ${cityNameFa}:`}</span>
                      <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                        {toPersianNum(unitCityVal)} {isEn ? 'M' : 'میلیون'}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitCityVal, intlCurrency, radarLocale)})` : ''}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            {viewMode === 'price' && latestCityAvg > 0 && <ReferenceLine y={latestCityAvg} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />}
            {viewMode === 'change' && <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />}
            <Bar dataKey={viewMode === 'price' ? 'price' : 'changeAmount'} radius={[6, 6, 0, 0]} maxBarSize={38}>
              {chartData.map((entry, index) => {
                const barColor = viewMode === 'price'
                  ? (entry.isLatest ? '#047857' : index % 2 === 0 ? '#10b981' : '#34d399')
                  : (entry.changeAmount >= 0 ? (entry.isLatest ? '#059669' : '#10b981') : '#ef4444');
                return <Cell key={`cell-${index}`} fill={barColor} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-1.5 pt-1 text-center bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/80 rounded-[10px] p-2 text-[10.5px] tabular-nums">
        <div>
          <span className="text-slate-400 dark:text-slate-400 block text-[10px]">{isEn ? 'First Month' : 'نخستین ماه'} ({unitLabel})</span>
          <strong className="text-slate-800 dark:text-slate-200 font-extrabold">
            {toPersianNum(firstUnitPrice)} م{intlCurrency !== 'IRT' && <span className="block text-[9.5px] font-bold" dir="ltr">{formatMillionTomanAsIntlCurrency(firstUnitPrice, intlCurrency, radarLocale)}</span>}
          </strong>
        </div>
        <div className="border-x border-slate-200/60 dark:border-slate-700">
          <span className="text-slate-400 dark:text-slate-400 block text-[10px]">{isEn ? 'Latest / Deal v6.4' : 'آخرین / معامله v6.4'} ({unitLabel})</span>
          <strong className="text-emerald-700 dark:text-emerald-400 font-extrabold">
            {toPersianNum(latestUnitPrice)} م (معامله v6.4: {toPersianNum(latestDealUnitPrice)} م)
            {intlCurrency !== 'IRT' && <span className="block text-[9.5px] font-bold" dir="ltr">{formatMillionTomanAsIntlCurrency(latestDealUnitPrice, intlCurrency, radarLocale)}</span>}
          </strong>
        </div>
        <div>
          <span className="text-slate-400 dark:text-slate-400 block text-[10px]">{isEn ? '6M Total Change' : 'تغییر کل ۶ ماهه'} ({unitLabel})</span>
          <strong className={`font-black ${totalPriceDelta6m >= 0 ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-400'}`}>
            {totalPriceDelta6m > 0 ? `+${toPersianNum(totalPriceDelta6m)}` : toPersianNum(totalPriceDelta6m)} م
            {intlCurrency !== 'IRT' && <span className="block text-[9.5px] font-bold" dir="ltr">{formatMillionTomanAsIntlCurrency(Math.abs(totalPriceDelta6m), intlCurrency, radarLocale)}</span>}
          </strong>
        </div>
      </div>
    </div>
  );
}
