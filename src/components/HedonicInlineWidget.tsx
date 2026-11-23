/**
 * @file src/components/HedonicInlineWidget.tsx
 * @description ویجت درون‌خطی «ماشین‌حساب هوشمند قیمت‌گذاری ملک (Hedonic)» برای نمایش مستقیم
 * در پنل کالبدشکافی محله (تب بازار و نمودار) با امکان انتقال پارامترهای سفارشی به مودال کامل.
 */

import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { Calculator, ArrowUpRight } from 'lucide-react';
import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import {
  calculateHedonicValuation,
  HEDONIC_RENOVATION_OPTIONS,
  HedonicRenovationStatus,
} from '../data/hedonicPricingEngine';
import { clampNumber } from '../utils/security';
import {
  formatMillionToVerbalPersian,
} from '../utils/persianFinancials';
import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { NumericDraftInput } from './ui/NumericDraftInput';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaValue,
  formatMillionTomanAsIntlCurrency,
  getRadarInspectorCopy,
} from '../utils/areaUnit';

export function resolveBuildYearFromSegment(segment?: 'new' | 'mid' | 'older'): number {
  if (segment === 'new') return 1403;
  if (segment === 'older') return 1385;
  return 1395;
}

export interface HedonicInlineParams {
  sqm?: number;
  buildYear?: number;
  renovationStatus?: HedonicRenovationStatus;
  floor?: number;
  streetTier?: 'luxury' | 'balanced' | 'economic' | 'economy';
  streetMultiplier?: number;
}

export interface HedonicInlineWidgetProps {
  neighborhood: EvaluatedNeighborhood;
  defaultSqm?: number;
  buildingAgeSegment?: 'new' | 'mid' | 'older';
  onOpenFullModal: (params?: HedonicInlineParams) => void;
}

export function HedonicInlineWidget({
  neighborhood,
  defaultSqm = 85,
  buildingAgeSegment,
  onOpenFullModal,
}: HedonicInlineWidgetProps): React.ReactElement {
  const [areaUnit] = useAreaUnit();
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const inspectorCopy = getRadarInspectorCopy(radarLocale);
  const [sqm, setSqm] = useState<number>(clampNumber(defaultSqm, 35, 350, 85));
  const [buildYear, setBuildYear] = useState<number>(() => resolveBuildYearFromSegment(buildingAgeSegment));
  const [renovationStatus, setRenovationStatus] = useState<HedonicRenovationStatus>('renovated');
  const [floor, setFloor] = useState<number>(3);

  useEffect(() => {
    setSqm(clampNumber(defaultSqm, 35, 350, 85));
  }, [defaultSqm]);

  useEffect(() => {
    if (buildingAgeSegment) setBuildYear(resolveBuildYearFromSegment(buildingAgeSegment));
  }, [buildingAgeSegment]);

  const deferredSqm = useDeferredValue(sqm);
  const deferredBuildYear = useDeferredValue(buildYear);
  const deferredFloor = useDeferredValue(floor);

  const result = useMemo(
    () =>
      calculateHedonicValuation({
        neighborhood,
        sqm: deferredSqm,
        buildYear: deferredBuildYear,
        renovationStatus,
        floor: deferredFloor,
      }),
    [neighborhood, deferredSqm, deferredBuildYear, renovationStatus, deferredFloor]
  );

  const unitPrice = convertPricePerSqmToUnit(result.hedonicPerSqm, areaUnit);
  const unitHoodBase = convertPricePerSqmToUnit(result.hoodBasePerSqm, areaUnit);
  const fastSaleUnitPrice = convertPricePerSqmToUnit(Math.round(result.fastSaleTotalMillion / Math.max(1, sqm)), areaUnit);
  const totalDiffMillion = Math.round(Math.abs(result.hedonicTotalMillion - result.hoodBasePerSqm * sqm));
  const hoodTotal80mMillions = Math.round((result.hoodBasePerSqm * 80) / 1000);
  const estimatedMonthlyRentMillions = Math.round((neighborhood?.rahn80m || 1200) * 0.03);

  return (
    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-2">
        <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
          <Calculator className="w-4 h-4 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
          <span>{inspectorCopy.hedonicCta}</span>
        </span>
        <button
          type="button"
          onClick={() => onOpenFullModal({ sqm, buildYear, renovationStatus, floor })}
          className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 flex items-center gap-0.5 cursor-pointer"
        >
          <span>کالبدشکافی کامل</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800 rounded-lg px-2.5 py-1 flex items-center justify-between">
        <span>تخمین هوشمند رادار ({formatAreaShort(80, areaUnit)}: {toPersianNum(hoodTotal80mMillions)} میلیارد · اجاره: {toPersianNum(estimatedMonthlyRentMillions)} م)</span>
        <span className="radar-tabular-num text-emerald-800 dark:text-emerald-200">{formatMillionToVerbalPersian(result.hedonicTotalMillion)}</span>
      </div>

      {/* 3 Compact Numeric Inputs Grid: Sqm, Build Year, Floor */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2">
          <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">متراژ ({formatAreaValue(sqm, areaUnit, true)})</label>
          <NumericDraftInput
            aria-label="متراژ واحد"
            min={35}
            max={400}
            fallback={85}
            value={sqm}
            onValueChange={setSqm}
            className="radar-tabular-num w-full font-black text-slate-900 dark:text-white bg-transparent text-xs text-center focus:outline-none tabular-nums"
          />
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2">
          <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">سال ساخت</label>
          <NumericDraftInput
            aria-label="سال ساخت"
            min={1370}
            max={1405}
            fallback={1398}
            value={buildYear}
            onValueChange={setBuildYear}
            className="radar-tabular-num w-full font-black text-slate-900 dark:text-white bg-transparent text-xs text-center focus:outline-none tabular-nums"
          />
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2">
          <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">طبقه واحد</label>
          <NumericDraftInput
            aria-label="طبقه واحد"
            min={-1}
            max={25}
            fallback={3}
            value={floor}
            onValueChange={setFloor}
            className="radar-tabular-num w-full font-black text-slate-900 dark:text-white bg-transparent text-xs text-center focus:outline-none tabular-nums"
          />
        </div>
      </div>

      {/* Renovation Segmented Selector */}
      <div>
        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mb-1.5">وضعیت نوسازی:</div>
        <div className="grid grid-cols-2 gap-1.5">
          {HEDONIC_RENOVATION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRenovationStatus(opt.id)}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition cursor-pointer truncate ${
                renovationStatus === opt.id
                  ? 'bg-[var(--color-brand-600)] text-white border-emerald-600'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {opt.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Valuation Output & Comparison Box */}
      <div className="bg-white dark:bg-slate-950/60 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400 text-[11px]">قیمت کارشناسی این ملک:</span>
          <strong className="text-sm font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
            {toPersianNum(result.hedonicTotalBillion)} میلیارد تومان
            {intlCurrency !== 'IRT' && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 mr-1.5">
                ({formatMillionTomanAsIntlCurrency(result.hedonicTotalMillion, intlCurrency, radarLocale)})
              </span>
            )}
          </strong>
        </div>

        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <span className="text-slate-500 dark:text-slate-400">
            {areaUnit === 'sqft' ? 'هر ft²:' : 'هر متر:'}{' '}
            <strong className="text-slate-900 dark:text-white">{toPersianNum(unitPrice)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, radarLocale)})` : ''}</strong> (میانگین محله: {toPersianNum(unitHoodBase)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(unitHoodBase, intlCurrency, radarLocale)}` : ''})
          </span>
          <span
            className={`font-extrabold tabular-nums ${
              result.diffFromHoodAvgPercent > 0
                ? 'text-amber-700 dark:text-amber-400'
                : result.diffFromHoodAvgPercent < 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {result.diffFromHoodAvgPercent > 0 ? '+' : ''}
            {toPersianNum(result.diffFromHoodAvgPercent)}٪ ({toPersianNum(totalDiffMillion)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(totalDiffMillion, intlCurrency, radarLocale)}` : ''}) نسبت به محله
          </span>
        </div>

        <div className="flex items-center justify-between text-[10.5px] pt-1.5 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 tabular-nums">
          <span>
            فروش فوری نقدی (-۱۲٪):{' '}
            <strong className="text-amber-700 dark:text-amber-400 font-extrabold">{toPersianNum((result.fastSaleTotalMillion / 1000).toFixed(2))} میلیارد ({areaUnit === 'sqft' ? 'ft² ' : 'متری '}{toPersianNum(fastSaleUnitPrice)} م)</strong>
            {intlCurrency !== 'IRT' && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 mr-1">
                ({formatMillionTomanAsIntlCurrency(result.fastSaleTotalMillion, intlCurrency, radarLocale)})
              </span>
            )}
          </span>
          <span>
            رهن کارشناسی: <strong className="text-emerald-700 dark:text-emerald-400 font-extrabold">{toPersianNum(result.estimatedRahnMillion)} م (اجاره: {toPersianNum(Math.round(result.estimatedRahnMillion * 0.03))} م)</strong>
            {intlCurrency !== 'IRT' && (
              <span className="text-[10px] text-[var(--color-brand-600)] dark:text-emerald-400 mr-1">
                ({formatMillionTomanAsIntlCurrency(result.estimatedRahnMillion, intlCurrency, radarLocale)})
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10.5px] pt-1.5 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 tabular-nums">
          <span>بازه منصفانه معامله:</span>
          <strong className="text-slate-800 dark:text-slate-200">
            {toPersianNum((result.confidenceRangeMillion.min / 1000).toFixed(2))} تا {toPersianNum((result.confidenceRangeMillion.max / 1000).toFixed(2))} میلیارد
            {intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(result.confidenceRangeMillion.min, intlCurrency, radarLocale)}–${formatMillionTomanAsIntlCurrency(result.confidenceRangeMillion.max, intlCurrency, radarLocale)})` : ''}
          </strong>
        </div>
      </div>
    </div>
  );
}
