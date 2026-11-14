import React from 'react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { SupplyCompositionSegment } from '../types/indicator.types';
import type { MarketIndicatorStatus } from '../types/market.types';
import { ChartAccessibleFrame } from './ChartAccessibleFrame';

export interface SupplyCompositionChartProps {
  byArea: SupplyCompositionSegment[];
  byAge: SupplyCompositionSegment[];
  geoScopeFa: string;
  status: MarketIndicatorStatus;
}

export const SupplyCompositionChart: React.FC<SupplyCompositionChartProps> = ({
  byArea,
  byAge,
  geoScopeFa,
  status,
}) => {
  const combinedRows = [
    ...byArea.map((r) => ({ group: 'بر پایه متراژ', segment: r.labelFa, count: toPersianNum(r.count), share: `${toPersianNum(r.sharePct)}٪` })),
    ...byAge.map((r) => ({ group: 'بر پایه سن بنا', segment: r.labelFa, count: toPersianNum(r.count), share: `${toPersianNum(r.sharePct)}٪` })),
  ];

  const renderBars = (title: string, items: SupplyCompositionSegment[], barColor: string) => (
    <div className="space-y-2">
      <div className="text-xs font-bold text-[#182522] dark:text-slate-200">{title}</div>
      {items.map((seg) => (
        <div key={seg.key} className="space-y-1 text-xs tabular-nums">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#34433E] dark:text-slate-300">{seg.labelFa}</span>
            <span className="font-bold text-[#182522] dark:text-white">
              {toPersianNum(seg.count)} فایل ({toPersianNum(seg.sharePct)}٪)
            </span>
          </div>
          <div className="w-full h-2 rounded bg-[#EEF2EF] dark:bg-slate-800 overflow-hidden">
            <div className={`h-full rounded ${barColor}`} style={{ width: `${Math.max(seg.count > 0 ? 4 : 0, seg.sharePct)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <ChartAccessibleFrame
      titleFa={`ترکیب عرضه بر حسب متراژ و سن بنا در ${geoScopeFa}`}
      unitLabelFa="تعداد مطلق فایل و سهم درصدی"
      provenanceLineFa="تفکیک‌شده روی فایل‌های یکتا و غیرپرت"
      status={combinedRows.length === 0 ? 'insufficient_sample' : status}
      emptyReasonFa="در فیلتر فعلی فایلی برای نمایش ترکیب عرضه وجود ندارد."
      tableColumns={[
        { key: 'group', headerFa: 'دسته‌بندی' },
        { key: 'segment', headerFa: 'بازه' },
        { key: 'count', headerFa: 'تعداد مطلق' },
        { key: 'share', headerFa: 'سهم' },
      ]}
      tableRows={combinedRows}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {renderBars('ترکیب بر اساس متراژ', byArea, 'bg-[#176B63] dark:bg-emerald-500')}
        {renderBars('ترکیب بر اساس سن بنا', byAge, 'bg-[#155E9A] dark:bg-sky-500')}
      </div>
    </ChartAccessibleFrame>
  );
};
