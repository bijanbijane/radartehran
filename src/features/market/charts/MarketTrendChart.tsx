import React from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toPersianNum } from '../../../data/neighborhoods';
import { convertPricePerSqmToUnit, type AreaUnit } from '../../../utils/areaUnit';
import type { MarketTrendSeriesPoint } from '../types/indicator.types';
import type { MarketIndicatorStatus } from '../types/market.types';
import { ChartAccessibleFrame } from './ChartAccessibleFrame';

export interface MarketTrendChartProps {
  series: MarketTrendSeriesPoint[];
  geoScopeFa: string;
  cityNameFa: string;
  periodLabelFa: string;
  transactionType: 'sale' | 'rent';
  areaUnit: AreaUnit;
  status: MarketIndicatorStatus;
}

export const MarketTrendChart: React.FC<MarketTrendChartProps> = ({
  series,
  geoScopeFa,
  cityNameFa,
  periodLabelFa,
  transactionType,
  areaUnit,
  status,
}) => {
  const isRent = transactionType === 'rent';
  const unitLabelFa = isRent
    ? 'میلیون تومان (رهن ۸۰م و معادل اجاره ماهانه)'
    : `میلیون تومان بر ${areaUnit === 'sqft' ? 'فوت مربع' : 'مترمربع'}`;

  const chartData = series.map((pt) => ({
    ...pt,
    askDisplay: pt.askingPerSqmMillion !== null ? convertPricePerSqmToUnit(pt.askingPerSqmMillion, areaUnit) : null,
    dealDisplay: pt.estimatedDealPerSqmMillion !== null ? convertPricePerSqmToUnit(pt.estimatedDealPerSqmMillion, areaUnit) : null,
    cityDisplay: pt.cityAvgPerSqmMillion !== null ? convertPricePerSqmToUnit(pt.cityAvgPerSqmMillion, areaUnit) : null,
  }));

  const tableRows = chartData.map((pt) => ({
    month: pt.monthLabelFa,
    primary: isRent
      ? pt.deposit80mMillion !== null ? toPersianNum(pt.deposit80mMillion) : '—'
      : pt.askDisplay !== null ? toPersianNum(pt.askDisplay) : '—',
    secondary: isRent
      ? pt.monthlyRentEquivMillion !== null ? toPersianNum(pt.monthlyRentEquivMillion) : '—'
      : pt.dealDisplay !== null ? toPersianNum(pt.dealDisplay) : '—',
    samples: pt.hasDataGap ? 'شکاف داده' : toPersianNum(pt.sampleCount),
  }));

  return (
    <ChartAccessibleFrame
      titleFa={isRent ? `روند شاخص رهن و معادل اجاره در ${geoScopeFa}` : `روند قیمت پیشنهادی و برآورد v6.4 در ${geoScopeFa}`}
      unitLabelFa={unitLabelFa}
      provenanceLineFa={`بازه: ${periodLabelFa} · مقایسه با ${cityNameFa}`}
      status={status}
      emptyReasonFa="برای فیلتر انتخاب‌شده (یا حالت فقط مشاهدات زنده)، سری پیوسته موجود نیست."
      tableColumns={[
        { key: 'month', headerFa: 'دوره' },
        { key: 'primary', headerFa: isRent ? 'رهن ۸۰م (م.ت)' : 'پیشنهادی آگهی (م.ت)' },
        { key: 'secondary', headerFa: isRent ? 'معادل اجاره ماهانه (م.ت)' : 'برآورد v6.4 (م.ت)' },
        { key: 'samples', headerFa: 'نمونه / وضعیت' },
      ]}
      tableRows={tableRows}
    >
      <div dir="ltr" className="w-full h-[230px] min-w-[240px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={240}>
          <LineChart data={chartData} margin={{ top: 10, right: 12, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} vertical={false} />
            <XAxis dataKey="monthLabelFa" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Vazirmatn' }} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Vazirmatn' }} tickFormatter={(v) => toPersianNum(v)} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip
              formatter={(value: any, name: any) => [value !== null && value !== undefined ? `${toPersianNum(value)} م` : 'بدون داده', String(name)]}
              labelStyle={{ fontFamily: 'Vazirmatn', fontWeight: 700 }}
              contentStyle={{ fontFamily: 'Vazirmatn', fontSize: 11, borderRadius: 10 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Vazirmatn' }} />
            {isRent ? (
              <>
                <Line type="monotone" dataKey="deposit80mMillion" name="رهن کامل ۸۰م" stroke="#155E9A" strokeWidth={2.5} connectNulls={false} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="monthlyRentEquivMillion" name="معادل اجاره (نرخ ۳۶٪)" stroke="#176B63" strokeWidth={2} strokeDasharray="4 3" connectNulls={false} dot={{ r: 2.5 }} />
              </>
            ) : (
              <>
                <Line type="monotone" dataKey="askDisplay" name="پیشنهادی آگهی" stroke="#176B63" strokeWidth={2.5} connectNulls={false} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="dealDisplay" name="برآورد سناریو v6.4" stroke="#B45309" strokeWidth={2} strokeDasharray="5 3" connectNulls={false} dot={{ r: 2.5 }} />
                <Line type="monotone" dataKey="cityDisplay" name={`میانگین ${cityNameFa}`} stroke="#64748B" strokeWidth={1.75} strokeDasharray="2 3" connectNulls={false} dot={false} />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartAccessibleFrame>
  );
};
