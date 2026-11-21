import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PriceDistributionStats } from '../types/indicator.types';
import type { MarketIndicatorStatus } from '../types/market.types';
import { ChartAccessibleFrame } from './ChartAccessibleFrame';

export interface PriceDistributionChartProps {
  stats: PriceDistributionStats;
  geoScopeFa: string;
  status: MarketIndicatorStatus;
}

export const PriceDistributionChart: React.FC<PriceDistributionChartProps> = ({
  stats,
  geoScopeFa,
  status,
}) => {
  const tableRows = stats.bins.map((b) => ({
    range: b.rangeLabelFa,
    count: toPersianNum(b.count),
    share: `${toPersianNum(b.sharePct)}٪`,
  }));

  return (
    <ChartAccessibleFrame
      titleFa={`توزیع قیمت پیشنهادی و صدک‌های آماری در ${geoScopeFa}`}
      unitLabelFa="میلیون تومان بر مترمربع (تعداد فایل در هر بازه)"
      provenanceLineFa={`${toPersianNum(stats.count)} نمونه معتبر · مقایسه میانگین و میانه`}
      status={stats.count === 0 ? 'insufficient_sample' : status}
      emptyReasonFa="برای ترسیم توزیع قیمت در این فیلتر، تعداد فایل کافی در دسترس نیست."
      tableColumns={[
        { key: 'range', headerFa: 'بازه قیمت (میلیون/متر)' },
        { key: 'count', headerFa: 'تعداد فایل' },
        { key: 'share', headerFa: 'سهم از عرضه' },
      ]}
      tableRows={tableRows}
    >
      <div className="space-y-3">
        {/* Statistical summary row */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px] tabular-nums bg-[var(--color-bg-canvas)] dark:bg-slate-800/50 p-2.5 rounded-lg border border-[var(--color-border-subtle)]/80 dark:border-slate-800">
          <div><span className="text-[var(--color-text-muted)] block">P10 (کف)</span><strong className="font-bold text-[var(--color-text-primary)] dark:text-white">{stats.p10 !== null ? toPersianNum(stats.p10) : '—'}</strong></div>
          <div><span className="text-[var(--color-text-muted)] block">P25</span><strong className="font-bold text-[var(--color-text-primary)] dark:text-white">{stats.p25 !== null ? toPersianNum(stats.p25) : '—'}</strong></div>
          <div><span className="text-[var(--color-brand-600)] dark:text-emerald-400 block font-bold">میانه (P50)</span><strong className="font-black text-[var(--color-brand-600)] dark:text-emerald-300">{stats.median !== null ? toPersianNum(stats.median) : '—'}</strong></div>
          <div><span className="text-[var(--color-text-muted)] block">میانگین</span><strong className="font-bold text-[var(--color-text-primary)] dark:text-white">{stats.mean !== null ? toPersianNum(stats.mean) : '—'}</strong></div>
          <div><span className="text-[var(--color-text-muted)] block">P75</span><strong className="font-bold text-[var(--color-text-primary)] dark:text-white">{stats.p75 !== null ? toPersianNum(stats.p75) : '—'}</strong></div>
          <div><span className="text-[var(--color-text-muted)] block">P90 / IQR</span><strong className="font-bold text-[var(--color-text-primary)] dark:text-white">{stats.p90 !== null ? toPersianNum(stats.p90) : '—'} ({stats.iqr !== null ? toPersianNum(stats.iqr) : '—'})</strong></div>
        </div>

        <div dir="ltr" className="w-full h-[200px] min-w-[240px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={240}>
            <BarChart data={stats.bins} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} vertical={false} />
              <XAxis dataKey="rangeLabelFa" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Vazirmatn' }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Vazirmatn' }} tickFormatter={(v) => toPersianNum(v)} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                formatter={(val: any) => [`${toPersianNum(val)} فایل`, 'تعداد']}
                contentStyle={{ fontFamily: 'Vazirmatn', fontSize: 11, borderRadius: 10 }}
              />
              <Bar dataKey="count" name="تعداد فایل" fill="#176B63" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartAccessibleFrame>
  );
};
