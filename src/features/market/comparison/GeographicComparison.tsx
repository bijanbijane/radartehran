import React from 'react';
import { ArrowLeftRight, Plus, X } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { convertPricePerSqmToUnit, type AreaUnit } from '../../../utils/areaUnit';
import { INDICATOR_STATUS_LABELS_FA } from '../indicators/IndicatorRegistry';
import type { GeoComparisonItem } from '../types/market.types';
import { updateMapAdvancedOverlayState } from '../../../components/mapAdvancedLayers';

export interface GeographicComparisonProps {
  allHoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  comparisonRows: GeoComparisonItem[];
  compareHoodIds: number[];
  areaUnit: AreaUnit;
  onAddCompareHood: (id: number) => void;
  onRemoveCompareHood: (id: number) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
}

export const GeographicComparison: React.FC<GeographicComparisonProps> = ({
  allHoods,
  selectedHood,
  comparisonRows,
  compareHoodIds,
  areaUnit,
  onAddCompareHood,
  onRemoveCompareHood,
  onSelectNeighborhood,
}) => {
  const candidates = allHoods.filter(
    (h) => h.id !== selectedHood.id && !compareHoodIds.includes(h.id),
  );

  return (
    <section
      aria-label="مقایسه جغرافیایی محله‌ها"
      data-testid="market-geo-comparison-section"
      className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCE3DF]/80 dark:border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <ArrowLeftRight className="w-4 h-4 text-[#176B63] dark:text-emerald-400" />
            <span>مقایسه هم‌معنای محدوده‌ها (تا ۴ محله)</span>
          </h3>
          <p className="text-[11px] text-[#586760] dark:text-slate-400 mt-0.5">
            تمامی ستون‌ها با یک تعریف یکسان (میانه پیشنهادی، برآورد v6.4، رهن ۸۰م و تعداد آگهی زنده) سنجیده می‌شوند.
          </p>
        </div>

        {comparisonRows.length < 4 && candidates.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-[#176B63]" />
            <select
              aria-label="افزودن محله به مقایسه"
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id > 0) onAddCompareHood(id);
              }}
              className="min-h-[36px] px-2.5 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-[#182522] dark:text-white"
            >
              <option value="">+ افزودن محله برای مقایسه...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.zone})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse tabular-nums">
          <thead>
            <tr className="border-b border-[#DCE3DF] dark:border-slate-700 text-[#586760] dark:text-slate-400 text-[11px]">
              <th className="text-right py-2 px-2">محدوده</th>
              <th className="text-right py-2 px-2">پیشنهادی آگهی</th>
              <th className="text-right py-2 px-2">سناریو v6.4 (غیرثبتی)</th>
              <th className="text-right py-2 px-2">اختلاف با مبنا</th>
              <th className="text-right py-2 px-2">رهن ۸۰م (خام)</th>
              <th className="text-right py-2 px-2">وضعیت نمونه</th>
              <th className="text-right py-2 px-2">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => {
              const isBase = row.hoodId === selectedHood.id;
              const uAsk = convertPricePerSqmToUnit(row.askingPerSqmMillion, areaUnit);
              const uDeal = convertPricePerSqmToUnit(row.estimatedDealPerSqmMillion, areaUnit);
              const targetHood = allHoods.find((h) => h.id === row.hoodId);
              return (
                <tr key={row.hoodId} className="border-b border-[#DCE3DF]/60 dark:border-slate-800">
                  <td className="py-2.5 px-2 font-bold text-[#182522] dark:text-white">
                    {row.hoodName}{' '}
                    <span className="text-[10.5px] font-normal text-[#586760] dark:text-slate-400">
                      ({row.zone}) {isBase ? '· مبنا' : ''}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 font-bold">{toPersianNum(uAsk)} م</td>
                  <td className="py-2.5 px-2 font-bold text-[#176B63] dark:text-emerald-400">{toPersianNum(uDeal)} م</td>
                  <td className="py-2.5 px-2">
                    {isBase ? '—' : `${row.gapFromBasePct > 0 ? '+' : ''}${toPersianNum(row.gapFromBasePct)}٪`}
                  </td>
                  <td className="py-2.5 px-2">{toPersianNum(row.rahn80mMillion)} م</td>
                  <td className="py-2.5 px-2 text-[11px] text-[#586760] dark:text-slate-400">
                    {toPersianNum(row.observedCount)} زنده · {INDICATOR_STATUS_LABELS_FA[row.status]}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1.5">
                      {!isBase && targetHood && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              updateMapAdvancedOverlayState({
                                comparisonArc: { active: true, isPinned: true, hoodA: selectedHood, hoodB: targetHood },
                              });
                            }}
                            className="px-2 py-1 rounded border border-[#C5D0CA] dark:border-slate-700 text-[10.5px] font-bold hover:bg-[#F6F8F6] dark:hover:bg-slate-800 cursor-pointer"
                          >
                            کمان روی نقشه
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectNeighborhood(targetHood)}
                            className="px-2 py-1 rounded border border-[#C5D0CA] dark:border-slate-700 text-[10.5px] font-bold hover:bg-[#F6F8F6] dark:hover:bg-slate-800 cursor-pointer"
                          >
                            انتخاب مبنا
                          </button>
                          <button
                            type="button"
                            aria-label={`حذف ${row.hoodName} از مقایسه`}
                            onClick={() => onRemoveCompareHood(row.hoodId)}
                            className="p-1 text-[#586760] hover:text-[#A61B1B] cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
