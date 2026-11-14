/** @file src/features/valuation/components/ValuationScenarioComparison.tsx — Non-Destructive What-If Scenario Explorer */
import React, { useMemo, useState } from 'react';
import { GitCompare } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { HEDONIC_RENOVATION_OPTIONS, type HedonicRenovationStatus } from '../../../data/hedonicPricingEngine';
import { evaluateWorkspaceValuation } from '../services/valuationWorkspaceService';
import type { ValuationWorkspaceInput, ValuationWorkspaceResult } from '../types/valuation.types';

export interface ValuationScenarioComparisonProps {
  baseInput: ValuationWorkspaceInput;
  baseResult: ValuationWorkspaceResult;
  hood: EvaluatedNeighborhood;
}

export const ValuationScenarioComparison: React.FC<ValuationScenarioComparisonProps> = ({
  baseInput,
  baseResult,
  hood,
}) => {
  const [altRenovation, setAltRenovation] = useState<HedonicRenovationStatus>(
    baseInput.renovationStatus === 'needs_renovation' ? 'renovated' : 'luxury_renovated',
  );
  const [altParking, setAltParking] = useState<boolean>(!baseInput.hasParking ? true : baseInput.hasParking);
  const [altFloorDelta, setAltFloorDelta] = useState<number>(1);

  const hypotheticalInput = useMemo<ValuationWorkspaceInput>(
    () => ({
      ...baseInput,
      renovationStatus: altRenovation,
      hasParking: altParking,
      floor: Math.min(baseInput.totalFloors, Math.max(1, baseInput.floor + altFloorDelta)),
    }),
    [baseInput, altRenovation, altParking, altFloorDelta],
  );

  const altResult = useMemo(
    () => evaluateWorkspaceValuation(hypotheticalInput, hood),
    [hypotheticalInput, hood],
  );

  if (!baseResult.hedonic || !altResult.hedonic) return null;

  const baseTotal = baseResult.hedonic.hedonicTotalMillion;
  const altTotal = altResult.hedonic.hedonicTotalMillion;
  const deltaBillion = ((altTotal - baseTotal) / 1000).toFixed(2);
  const deltaPercent = baseTotal > 0 ? Number((((altTotal - baseTotal) / baseTotal) * 100).toFixed(1)) : 0;

  return (
    <div
      data-testid="valuation-whatif-comparison"
      className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-black text-[#182522] dark:text-white flex items-center gap-1.5">
          <GitCompare className="w-4 h-4 text-[#176B63]" />
          <span>تحلیل سناریوی فرضی جایگزین (What-If)</span>
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-[6px] bg-[#EEF5FC] text-[#1D4E89] dark:bg-sky-950/60 dark:text-sky-300">
          تست فرضی — بدون تغییر در ورودی اصلی ملک
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-[10.5px] font-bold text-[#586760] block mb-1">وضعیت نوسازی فرضی</label>
          <select
            value={altRenovation}
            onChange={(e) => setAltRenovation(e.target.value as HedonicRenovationStatus)}
            className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold"
          >
            {HEDONIC_RENOVATION_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.shortLabel}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10.5px] font-bold text-[#586760] block mb-1">جابجایی فرضی طبقه</label>
          <select
            value={altFloorDelta}
            onChange={(e) => setAltFloorDelta(Number(e.target.value))}
            className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold"
          >
            <option value={0}>بدون تغییر طبقه</option>
            <option value={1}>+۱ طبقه بالاتر</option>
            <option value={2}>+۲ طبقه بالاتر</option>
            <option value={-1}>۱ طبقه پایین‌تر</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="w-full p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={altParking} onChange={(e) => setAltParking(e.target.checked)} className="accent-[#176B63]" />
            <span>دارای پارکینگ سندی</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#DCE3DF] dark:border-slate-800 tabular-nums text-center">
        <div className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800">
          <span className="text-[10px] text-[#586760] block">سناریوی پایه واقعی</span>
          <strong className="font-black text-[#182522] dark:text-white">{toPersianNum(baseResult.hedonic.hedonicTotalBillion)} م.ت</strong>
        </div>
        <div className="p-2 rounded-[8px] bg-[#EAF3F0] dark:bg-emerald-950/30">
          <span className="text-[10px] text-[#14534E] dark:text-emerald-300 block">سناریوی فرضی</span>
          <strong className="font-black text-[#14534E] dark:text-emerald-300">{toPersianNum(altResult.hedonic.hedonicTotalBillion)} م.ت</strong>
        </div>
        <div className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800">
          <span className="text-[10px] text-[#586760] block">تفاوت فرضی</span>
          <strong className={`font-black ${deltaPercent >= 0 ? 'text-[#176B4C]' : 'text-[#B3261E]'}`}>
            {deltaPercent > 0 ? '+' : ''}{toPersianNum(deltaBillion)} م.ت ({deltaPercent > 0 ? '+' : ''}{toPersianNum(deltaPercent)}٪)
          </strong>
        </div>
      </div>
    </div>
  );
};
