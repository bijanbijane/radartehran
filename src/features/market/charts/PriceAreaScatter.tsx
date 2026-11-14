import React from 'react';
import { CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PriceScatterPoint } from '../types/indicator.types';
import type { MarketIndicatorStatus } from '../types/market.types';
import { ChartAccessibleFrame } from './ChartAccessibleFrame';

export interface PriceAreaScatterProps {
  points: PriceScatterPoint[];
  geoScopeFa: string;
  status: MarketIndicatorStatus;
}

export const PriceAreaScatter: React.FC<PriceAreaScatterProps> = ({
  points,
  geoScopeFa,
  status,
}) => {
  const normalPts = points.filter((p) => !p.isOutlierBand);
  const outlierPts = points.filter((p) => p.isOutlierBand);

  const tableRows = points.slice(0, 15).map((p) => ({
    hood: p.label,
    sqm: toPersianNum(p.sqm),
    ask: toPersianNum(p.perSqmMillion),
    kind: p.isOutlierBand ? 'پرت / مشکوک' : p.isObserved ? 'آگهی زنده' : 'نمونه مرجع',
  }));

  return (
    <ChartAccessibleFrame
      titleFa={`رابطه متراژ و قیمت هر متر (پراکندگی فایل‌ها در ${geoScopeFa})`}
      unitLabelFa="محور افقی: مترمربع · محور عمودی: میلیون تومان/متر"
      provenanceLineFa={`${toPersianNum(normalPts.length)} فایل معتبر · ${toPersianNum(outlierPts.length)} داده پرت جداشده`}
      status={points.length === 0 ? 'insufficient_sample' : status}
      emptyReasonFa="نمونه فایلی با متراژ و قیمت معتبر برای رسم نمودار پراکندگی یافت نشد."
      tableColumns={[
        { key: 'hood', headerFa: 'محله' },
        { key: 'sqm', headerFa: 'متراژ' },
        { key: 'ask', headerFa: 'قیمت اعلامی/متر' },
        { key: 'kind', headerFa: 'وضعیت نمونه' },
      ]}
      tableRows={tableRows}
    >
      <div dir="ltr" className="w-full h-[215px] min-w-[240px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={240}>
          <ScatterChart margin={{ top: 8, right: 12, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
            <XAxis type="number" dataKey="sqm" name="متراژ" unit="m²" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => toPersianNum(v)} />
            <YAxis type="number" dataKey="perSqmMillion" name="قیمت/متر" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => toPersianNum(v)} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              formatter={(value: any, name: any) => [toPersianNum(value), String(name)]}
              contentStyle={{ fontFamily: 'Vazirmatn', fontSize: 11, borderRadius: 10 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Vazirmatn' }} />
            <Scatter name="فایل‌های معتبر" data={normalPts} fill="#176B63" />
            {outlierPts.length > 0 && <Scatter name="داده‌های پرت (خارج از بازه)" data={outlierPts} fill="#D97706" />}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartAccessibleFrame>
  );
};
