/**
 * @file src/components/BuyerAlertPriceSparkline.tsx
 * @description کامپوننت نمودار اسپارک‌لاین ۶ ماهه (Recharts Sparkline) برای نمایش روند تاریخی قیمت محله
 * در اعلان‌های هشدار خریدار (Buyer Alert Notifications) به همراه خط مرجع سقف قیمت انتخابی کاربر (`ReferenceLine`).
 */

import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  EvaluatedNeighborhood,
  Neighborhood,
  getNeighborhoodMarketReport,
  toPersianNum,
} from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, aggregateMarketMetricsForHood } from '../data/realMarketPriceAggregator';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
} from '../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

export interface SparklinePoint {
  month: string;
  priceMillion: number;
  thresholdMillion: number;
}

export interface SparklineSeriesSummary {
  points: SparklinePoint[];
  startMillion: number;
  endMillion: number;
  growth6mPercent: number;
  minDomain: number;
  maxDomain: number;
}

const DEFAULT_6_MONTH_LABELS: readonly string[] = [
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
  'فروردین',
  'اردیبهشت',
];

/**
 * استخراج سری زمانی ۶ ماهه قیمت خرید (هر متر) یا رهن کامل (۸۰ متری) محله
 * به همراه خط آستانه انتخابی کاربر برای نمایش در نمودار Sparkline.
 */
export function buildSubscribedNeighborhood6MonthSparkline(
  neighborhood: Neighborhood | EvaluatedNeighborhood,
  dealType: 'خرید' | 'اجاره',
  maxThresholdMillion: number
): SparklineSeriesSummary {
  const currentBuy = Math.max(
    15,
    Number((neighborhood as EvaluatedNeighborhood)?.buyPerSqm ?? neighborhood?.buyPerSqm) || 120
  );
  const baseBuy = Math.max(
    15,
    Number((neighborhood as EvaluatedNeighborhood)?.baseBuyPerSqm ?? currentBuy) || currentBuy
  );
  const currentRahn = Math.max(80, Number(neighborhood?.rahn80m) || 1200);
  const safeThreshold = Math.max(10, Number(maxThresholdMillion) || (dealType === 'خرید' ? currentBuy : currentRahn));

  const report =
    (neighborhood as EvaluatedNeighborhood)?.marketReport ||
    getNeighborhoodMarketReport(neighborhood as Neighborhood);
  const rawTrend = Array.isArray(report?.trendData) && report.trendData.length > 0
    ? report.trendData
    : DEFAULT_6_MONTH_LABELS.map((month, idx) => ({
        month,
        hoodPrice: Math.round(baseBuy * (0.88 + (idx * 0.12) / 5)),
        tehranAvg: Math.round(baseBuy * 0.9),
      }));

  const ageRatio = currentBuy / Math.max(1, baseBuy);
  const lastRawBuy = Math.max(1, Number(rawTrend[rawTrend.length - 1]?.hoodPrice) || baseBuy);

  const points: SparklinePoint[] = rawTrend.slice(-6).map((pt, idx, arr) => {
    const rawHoodPrice = Math.max(10, Number(pt.hoodPrice) || baseBuy);
    let priceMillion: number;

    if (dealType === 'خرید') {
      priceMillion =
        idx === arr.length - 1
          ? Math.round(currentBuy)
          : Math.max(10, Math.round(rawHoodPrice * ageRatio));
    } else {
      const ratioToCurrent = rawHoodPrice / lastRawBuy;
      priceMillion =
        idx === arr.length - 1
          ? Math.round(currentRahn)
          : Math.max(50, Math.round(currentRahn * ratioToCurrent));
    }

    return {
      month: pt.month || DEFAULT_6_MONTH_LABELS[idx] || `ماه ${idx + 1}`,
      priceMillion,
      thresholdMillion: safeThreshold,
    };
  });

  const startMillion = points[0]?.priceMillion || currentBuy;
  const endMillion = points[points.length - 1]?.priceMillion || startMillion;
  const growth6mPercent = Math.round(((endMillion - startMillion) / Math.max(1, startMillion)) * 100);

  const allValues = [...points.map((p) => p.priceMillion), safeThreshold];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = Math.max(4, Math.round((maxVal - minVal) * 0.18));

  return {
    points,
    startMillion,
    endMillion,
    growth6mPercent,
    minDomain: Math.max(0, minVal - padding),
    maxDomain: maxVal + padding,
  };
}

export interface BuyerAlertPriceSparklineProps {
  neighborhood: Neighborhood | EvaluatedNeighborhood;
  dealType: 'خرید' | 'اجاره';
  maxThresholdMillion: number;
  observedMillion?: number;
  compact?: boolean;
}

export function BuyerAlertPriceSparkline({
  neighborhood,
  dealType,
  maxThresholdMillion,
  observedMillion,
  compact = false,
}: BuyerAlertPriceSparklineProps): React.ReactElement {
  const [areaUnit] = useAreaUnit();
  const [currency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const showIntl = currency !== 'IRT';
  const series = useMemo(
    () => buildSubscribedNeighborhood6MonthSparkline(neighborhood, dealType, maxThresholdMillion),
    [neighborhood, dealType, maxThresholdMillion]
  );

  const isMatched = (observedMillion ?? series.endMillion) <= maxThresholdMillion;
  const strokeColor = isMatched ? '#059669' : '#d97706';
  const gradientId = `spark-grad-${neighborhood.id}-${dealType === 'خرید' ? 'buy' : 'rent'}-${compact ? 'c' : 'f'}`;
  const fmtVal = (v: number) =>
    dealType === 'خرید' ? toPersianNum(convertPricePerSqmToUnit(v, areaUnit)) : toPersianNum(v);
  const fmtFx = (v: number) =>
    showIntl ? ` (${formatMillionTomanAsIntlCurrency(dealType === 'خرید' ? convertPricePerSqmToUnit(v, areaUnit) : v, currency, locale)})` : '';
  const unitSuffix = dealType === 'خرید' && areaUnit === 'sqft' ? 'م/ft²' : 'م';
  const uDealEnd =
    dealType === 'خرید'
      ? convertPricePerSqmToUnit(
          aggregateMarketMetricsForHood({ ...neighborhood, buyPerSqm: series.endMillion }, series.endMillion).estimatedDealPricePerSqm,
          areaUnit
        )
      : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 shrink-0" title={`روند ۶ ماهه ${neighborhood.name}: ${fmtVal(series.startMillion)} ${unitSuffix}${fmtFx(series.startMillion)} ← ${fmtVal(series.endMillion)} ${unitSuffix}${fmtFx(series.endMillion)}${dealType === 'خرید' ? ` (سناریو v6.4 (غیرثبتی): ${toPersianNum(uDealEnd)} ${unitSuffix})` : ''}`}>
        <div dir="ltr" className="w-20 h-7">
          <ResponsiveContainer width="100%" height="100%" minWidth={72}>
            <AreaChart data={series.points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <YAxis hide domain={[series.minDomain, series.maxDomain]} />
              <ReferenceLine
                y={maxThresholdMillion}
                stroke="#64748b"
                strokeDasharray="2 2"
                strokeWidth={1}
              />
              <Area
                type="monotone"
                dataKey="priceMillion"
                stroke={strokeColor}
                strokeWidth={1.75}
                fill={strokeColor}
                fillOpacity={0.14}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums hidden sm:inline">
          ۶ماهه: +{toPersianNum(series.growth6mPercent)}٪
        </span>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl p-2.5 space-y-1.5">
      <div className="flex items-center justify-between text-[10.5px] text-slate-600 dark:text-slate-300 tabular-nums">
        <span className="font-bold text-slate-800 dark:text-slate-100">
          روند ۶ ماهه {neighborhood.name} ({dealType === 'خرید' ? (areaUnit === 'sqft' ? 'هر ft²' : 'هر متر') : `رهن ${formatAreaShort(80, areaUnit)}`}):
        </span>
        <div className="flex items-center gap-2">
          <span>
            {fmtVal(series.startMillion)} {unitSuffix}{fmtFx(series.startMillion)} ←{' '}
            <strong className="text-slate-900 dark:text-slate-100">{fmtVal(series.endMillion)} {unitSuffix}</strong>
            {fmtFx(series.endMillion)}{dealType === 'خرید' ? ` (سناریو v6.4 (غیرثبتی): ${toPersianNum(uDealEnd)} ${unitSuffix})` : ''}
          </span>
          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
            ({series.growth6mPercent >= 0 ? `+${toPersianNum(series.growth6mPercent)}` : toPersianNum(series.growth6mPercent)}٪ · {series.endMillion >= series.startMillion ? '+' : '-'}{fmtVal(Math.abs(series.endMillion - series.startMillion))} {unitSuffix}{fmtFx(Math.abs(series.endMillion - series.startMillion))})
          </span>
        </div>
      </div>

      <div dir="ltr" className="w-full h-14 min-w-[200px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={200}>
          <AreaChart data={series.points} margin={{ top: 4, right: 6, left: 6, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.28} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" hide />
            <YAxis hide domain={[series.minDomain, series.maxDomain]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const pt = payload[0]?.payload as SparklinePoint | undefined;
                if (!pt) return null;
                return (
                  <div
                    dir="rtl"
                    className="apple-grouped-card bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-700 rounded-lg px-2 py-1 text-[10px] shadow-md tabular-nums"
                  >
                    <span className="font-bold text-slate-900 dark:text-slate-100">{pt.month}: </span>
                    <strong className="text-emerald-700 dark:text-emerald-400">{fmtVal(pt.priceMillion)} {unitSuffix}</strong>
                    {fmtFx(pt.priceMillion)}
                    <span className="text-slate-500 dark:text-slate-400"> ({dealType === 'خرید' ? `کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((pt.priceMillion * 80) / 1000).toFixed(1))} میلیارد` : `اجاره: ${toPersianNum(Math.round(pt.priceMillion * 0.03))} م`})</span>
                    <span className="text-slate-400 mx-1">|</span>
                    <span className="text-slate-600 dark:text-slate-300">سقف شما: {fmtVal(pt.thresholdMillion)} {unitSuffix}{fmtFx(pt.thresholdMillion)}</span>
                  </div>
                );
              }}
            />
            <ReferenceLine y={maxThresholdMillion} stroke="#0284c7" strokeDasharray="3 3" strokeWidth={1.25} />
            <Area
              type="monotone"
              dataKey="priceMillion"
              stroke={strokeColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={{ r: 2, fill: strokeColor }}
              activeDot={{ r: 3.5, fill: strokeColor }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-[var(--color-brand-600)] inline-block rounded" />
          <span>منحنی قیمت ۶ ماه اخیر</span>
        </span>
        <span className="flex items-center gap-1 text-sky-700 dark:text-sky-400 font-semibold">
          <span className="w-2.5 h-0 border-b border-dashed border-sky-600 inline-block" />
          <span>خط سقف انتخابی شما ({fmtVal(maxThresholdMillion)} {unitSuffix}{showIntl ? ` • ${formatMillionTomanAsIntlCurrency(dealType === 'خرید' ? convertPricePerSqmToUnit(maxThresholdMillion, areaUnit) : maxThresholdMillion, currency, locale)}` : ''})</span>
        </span>
      </div>
    </div>
  );
}
