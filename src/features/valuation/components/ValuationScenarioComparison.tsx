/** @file src/features/valuation/components/ValuationScenarioComparison.tsx — Stage 95 Non-Mutating What-If Scenario Explorer */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, GitCompare } from 'lucide-react';
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
  // Stage 95.1: Initialize scenario strictly from baseInput (no hidden auto-upgrades)
  const [altRenovation, setAltRenovation] = useState<HedonicRenovationStatus>(baseInput.renovationStatus);
  const [altParking, setAltParking] = useState<boolean>(baseInput.hasParking);
  const [altFloorDelta, setAltFloorDelta] = useState<number>(0);

  useEffect(() => {
    setAltRenovation(baseInput.renovationStatus);
    setAltParking(baseInput.hasParking);
    setAltFloorDelta(0);
  }, [baseInput.hoodId, baseInput.renovationStatus, baseInput.hasParking, baseInput.floor, baseInput.totalFloors]);

  const rawHypotheticalFloor = baseInput.floor + altFloorDelta;
  const isFloorOutOfBounds = rawHypotheticalFloor > baseInput.totalFloors || rawHypotheticalFloor < -2;

  const hypotheticalInput = useMemo<ValuationWorkspaceInput>(
    () => ({
      ...baseInput,
      inputOrigins: { ...baseInput.inputOrigins },
      renovationStatus: altRenovation,
      hasParking: altParking,
      floor: isFloorOutOfBounds ? baseInput.floor : rawHypotheticalFloor,
      isHypotheticalScenario: true,
      scenarioId: `whatif-${baseInput.hoodId}`,
    }),
    [baseInput, altRenovation, altParking, isFloorOutOfBounds, rawHypotheticalFloor],
  );

  const altResult = useMemo(
    () => evaluateWorkspaceValuation(hypotheticalInput, hood, baseResult.geographicScope.cityId),
    [hypotheticalInput, hood, baseResult.geographicScope.cityId],
  );

  if (!baseResult.hedonic || !altResult.hedonic) return null;

  const isRent = baseInput.purpose === 'rent';
  const baseValue = isRent ? baseResult.hedonic.estimatedRahnMillion : baseResult.hedonic.hedonicTotalMillion;
  const altValue = isRent ? altResult.hedonic.estimatedRahnMillion : altResult.hedonic.hedonicTotalMillion;
  const deltaMillion = altValue - baseValue;
  const deltaBillion = (deltaMillion / 1000).toFixed(2);
  const deltaPercent = baseValue > 0 ? Number(((deltaMillion / baseValue) * 100).toFixed(1)) : 0;

  return (
    <div
      data-testid="valuation-whatif-comparison"
      className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-black text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
          <GitCompare className="w-4 h-4 text-[var(--color-brand-fg)]" />
          <span>تحلیل سناریوی فرضی جایگزین (What-If)</span>
        </span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-[6px] bg-[#EEF5FC] text-[#1D4E89] dark:bg-sky-950/60 dark:text-sky-300">
          تست فرضی — بدون تغییر در ورودی اصلی ملک
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label htmlFor="ws-whatif-renovation" className="text-xs font-bold text-[var(--color-text-muted)] block mb-1">وضعیت نوسازی فرضی</label>
          <select
            id="ws-whatif-renovation"
            aria-label="وضعیت نوسازی فرضی"
            value={altRenovation}
            onChange={(e) => setAltRenovation(e.target.value as HedonicRenovationStatus)}
            className="w-full min-h-[44px] md:min-h-[36px] p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold"
          >
            {HEDONIC_RENOVATION_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.shortLabel}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ws-whatif-floor-delta" className="text-xs font-bold text-[var(--color-text-muted)] block mb-1">جابجایی فرضی طبقه</label>
          <select
            id="ws-whatif-floor-delta"
            aria-label="جابجایی فرضی طبقه"
            value={altFloorDelta}
            onChange={(e) => setAltFloorDelta(Number(e.target.value))}
            className="w-full min-h-[44px] md:min-h-[36px] p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold"
          >
            <option value={0}>بدون تغییر طبقه</option>
            <option value={1}>+۱ طبقه بالاتر</option>
            <option value={2}>+۲ طبقه بالاتر</option>
            <option value={-1}>۱ طبقه پایین‌تر</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="w-full min-h-[44px] md:min-h-[36px] p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={altParking} onChange={(e) => setAltParking(e.target.checked)} className="accent-[var(--color-brand-600)]" />
            <span>دارای پارکینگ سندی</span>
          </label>
        </div>
      </div>

      {isFloorOutOfBounds && (
        <div
          data-testid="valuation-whatif-floor-warning"
          className="p-2.5 rounded-[8px] bg-[#FFF4E5] dark:bg-amber-950/30 border border-[#F4D3A1] text-xs font-bold text-[#875000] dark:text-amber-200 flex items-center gap-1.5"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>
            طبقه فرضی انتخاب‌شده ({toPersianNum(rawHypotheticalFloor)}) خارج از محدوده طبقات ساختمان ({toPersianNum(baseInput.totalFloors)} طبقه) است و بدون برش پنهان متوقف شد.
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--color-border-subtle)] dark:border-slate-800 tabular-nums text-center">
        <div className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800">
          <span className="text-xs text-[var(--color-text-muted)] block">سناریوی پایه</span>
          <strong className="font-black text-[var(--color-text-primary)] dark:text-white">
            {isRent ? `${toPersianNum(baseValue)} م رهن` : `${toPersianNum(baseResult.hedonic.hedonicTotalBillion)} م.ت`}
          </strong>
        </div>
        <div className="p-2 rounded-[8px] bg-[#EAF3F0] dark:bg-emerald-950/30">
          <span className="text-xs text-[var(--color-brand-fg)] block">سناریوی فرضی</span>
          <strong className="font-black text-[var(--color-brand-fg)]">
            {isRent ? `${toPersianNum(altValue)} م رهن` : `${toPersianNum(altResult.hedonic.hedonicTotalBillion)} م.ت`}
          </strong>
        </div>
        <div className="p-2 rounded-[8px] bg-[#F8F9FA] dark:bg-slate-800">
          <span className="text-xs text-[var(--color-text-muted)] block">تفاوت فرضی</span>
          <strong className={`font-black ${deltaPercent >= 0 ? 'text-[var(--color-brand-fg)]' : 'text-rose-700 dark:text-rose-300'}`}>
            {deltaPercent > 0 ? '+' : ''}
            {isRent ? `${toPersianNum(deltaMillion)} م` : `${toPersianNum(deltaBillion)} م.ت`} ({deltaPercent > 0 ? '+' : ''}{toPersianNum(deltaPercent)}٪)
          </strong>
        </div>
      </div>
    </div>
  );
};
