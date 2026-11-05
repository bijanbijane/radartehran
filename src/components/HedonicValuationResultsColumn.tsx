/**
 * @file src/components/HedonicValuationResultsColumn.tsx
 * @description ستون نتایج کارشناسی هدونیک، نوار مقایسه میانگین محله، جدول ۵ عامل و دکمه‌های خروجی.
 */

import React from 'react';
import {
  TrendingUp, TrendingDown, Minus, Copy, Check, Download, Printer,
} from 'lucide-react';
import { toPersianNum } from '../data/neighborhoods';
import type { HedonicValuationResult } from '../data/hedonicPricingEngine';
import { downloadHedonicValuationCardPng } from '../utils/hedonicImageGenerator';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaValue, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit';

export interface HedonicValuationResultsColumnProps {
  valuation: HedonicValuationResult;
  copiedReport: boolean;
  onCopyValuation: () => void;
  downloadingPng: boolean;
  setDownloadingPng: (v: boolean) => void;
  onClose: () => void;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}

export function HedonicValuationResultsColumn({
  valuation,
  copiedReport,
  onCopyValuation,
  downloadingPng,
  setDownloadingPng,
  onClose,
  areaUnit: propAreaUnit,
  intlCurrency: propIntlCurrency,
}: HedonicValuationResultsColumnProps): React.ReactElement {
  const [hookAreaUnit] = useAreaUnit();
  const [radarLocale] = useRadarLocale();
  const [hookIntlCurrency] = useIntlCurrency();
  const areaUnit = propAreaUnit ?? hookAreaUnit;
  const intlCurrency = propIntlCurrency ?? hookIntlCurrency;
  const hedonicTotal80mMillions = Math.round(valuation.hedonicPerSqm * 80);
  const hoodTotal80mMillions = Math.round(valuation.hoodBasePerSqm * 80);
  void hedonicTotal80mMillions; void hoodTotal80mMillions;
  const maxBarPerSqm = Math.max(valuation.hoodBasePerSqm, valuation.hedonicPerSqm, 1) * 1.15;
  const hoodBarWidth = Math.min(100, Math.max(18, Math.round((valuation.hoodBasePerSqm / maxBarPerSqm) * 100)));
  const hedonicBarWidth = Math.min(100, Math.max(18, Math.round((valuation.hedonicPerSqm / maxBarPerSqm) * 100)));

  return (
    <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
      <div className="space-y-4">
        {/* Primary Hedonic Valuation Result Card */}
        <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70 text-slate-900 dark:text-slate-100 rounded-2xl p-4.5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold">ارزش کارشناسی ملک در {valuation.hoodName}</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {valuation.netAdjustmentPercent > 0 ? '+' : ''}
              {toPersianNum(valuation.netAdjustmentPercent)}٪ ضریب هدونیک
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2 pt-1">
            <div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-800 dark:text-emerald-400 tabular-nums">
                {toPersianNum(valuation.hedonicTotalBillion)}{' '}
                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">میلیارد تومان</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                معادل {toPersianNum(valuation.hedonicTotalMillion.toLocaleString())} میلیون تومان
                {intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(valuation.hedonicTotalMillion, intlCurrency, radarLocale)}` : ''}
              </div>
            </div>
            <div className="text-left bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-800 rounded-xl px-3 py-2">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{areaUnit === 'sqft' ? 'هر فوت مربع (ft²)' : 'هر متر مربع'}</div>
              <div className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                {toPersianNum(convertPricePerSqmToUnit(valuation.hedonicPerSqm, areaUnit))} م
                {intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(valuation.hedonicPerSqm, areaUnit), intlCurrency, radarLocale)})` : ''}
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-emerald-200/70 dark:border-emerald-800/70 grid grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">بازه منصفانه معامله:</span>
              <strong className="text-slate-900 dark:text-white">
                {toPersianNum((valuation.confidenceRangeMillion.min / 1000).toFixed(2))} تا {toPersianNum((valuation.confidenceRangeMillion.max / 1000).toFixed(2))} میلیارد
                {intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuation.confidenceRangeMillion.min, intlCurrency, radarLocale)} – ${formatMillionTomanAsIntlCurrency(valuation.confidenceRangeMillion.max, intlCurrency, radarLocale)})` : ''}
              </strong>
              <span className="text-[9.5px] text-slate-500 dark:text-slate-400 block mt-0.5">
                هر {areaUnit === 'sqft' ? 'ft²' : 'متر'}: {toPersianNum(convertPricePerSqmToUnit(Math.round(valuation.confidenceRangeMillion.min / Math.max(1, valuation.sqm)), areaUnit))}–{toPersianNum(convertPricePerSqmToUnit(Math.round(valuation.confidenceRangeMillion.max / Math.max(1, valuation.sqm)), areaUnit))} م
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">فروش فوری نقدی (-۱۲٪):</span>
              <strong className="text-amber-700 dark:text-amber-400">
                {toPersianNum((valuation.fastSaleTotalMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuation.fastSaleTotalMillion, intlCurrency, radarLocale)})` : ''}
              </strong>
              <span className="text-[9.5px] text-amber-700/80 dark:text-amber-400/80 block mt-0.5">
                هر {areaUnit === 'sqft' ? 'ft²' : 'متر'}: {toPersianNum(convertPricePerSqmToUnit(Math.round(valuation.fastSaleTotalMillion / Math.max(1, valuation.sqm)), areaUnit))} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(Math.round(valuation.fastSaleTotalMillion / Math.max(1, valuation.sqm)), areaUnit), intlCurrency, radarLocale)})` : ''}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">رهن کامل کارشناسی:</span>
              <strong className="text-emerald-700 dark:text-emerald-400">
                {toPersianNum(valuation.estimatedRahnMillion)} میلیون{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuation.estimatedRahnMillion, intlCurrency, radarLocale)})` : ''}
              </strong>
              <span className="text-[9.5px] text-emerald-700/80 dark:text-emerald-400/80 block mt-0.5">
                اجاره ماهانه: {toPersianNum(Math.round(valuation.estimatedRahnMillion * 0.03))} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.round(valuation.estimatedRahnMillion * 0.03), intlCurrency, radarLocale)})` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Comparison vs Neighborhood Average Card */}
        <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-900 dark:text-white">
              مقایسه با میانگین محله {valuation.hoodName}
            </span>
            <span
              className={`text-xs font-black flex items-center gap-1 tabular-nums ${
                valuation.comparisonStatus === 'above_average'
                  ? 'text-amber-700 dark:text-amber-400'
                  : valuation.comparisonStatus === 'below_average'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {valuation.comparisonStatus === 'above_average' && <TrendingUp className="w-3.5 h-3.5" />}
              {valuation.comparisonStatus === 'below_average' && <TrendingDown className="w-3.5 h-3.5" />}
              {valuation.comparisonStatus === 'at_average' && <Minus className="w-3.5 h-3.5" />}
              <span>
                {valuation.diffFromHoodAvgPercent > 0 ? '+' : ''}
                {toPersianNum(valuation.diffFromHoodAvgPercent)}٪ نسبت به عرف محله
              </span>
            </span>
          </div>

          {/* Visual Horizontal Bar Comparison */}
          <div className="space-y-2.5 text-xs pt-1">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-600 dark:text-slate-400 font-medium">قیمت کارشناسی این ملک ({areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'}):</span>
                <strong className="text-slate-900 dark:text-white tabular-nums">
                  {toPersianNum(convertPricePerSqmToUnit(valuation.hedonicPerSqm, areaUnit))} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(valuation.hedonicPerSqm, areaUnit), intlCurrency, radarLocale)})` : ''}
                </strong>
              </div>
              <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                  style={{ width: `${hedonicBarWidth}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-500 dark:text-slate-400">میانگین پایه محله {valuation.hoodName} ({areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'}):</span>
                <strong className="text-slate-700 dark:text-slate-300 tabular-nums">
                  {toPersianNum(convertPricePerSqmToUnit(valuation.hoodBasePerSqm, areaUnit))} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(valuation.hoodBasePerSqm, areaUnit), intlCurrency, radarLocale)})` : ''}
                </strong>
              </div>
              <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-500 rounded-full transition-all duration-300"
                  style={{ width: `${hoodBarWidth}%` }}
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-600 dark:text-slate-400">اختلاف قیمت کل ({formatAreaValue(valuation.sqm, areaUnit, true)}):</span>
            <strong
              className={`tabular-nums ${
                valuation.diffTotalMillion > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : valuation.diffTotalMillion < 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-800 dark:text-slate-200'
              }`}
            >
              {valuation.diffTotalMillion > 0 ? '+' : ''}
              {toPersianNum(valuation.diffTotalMillion.toLocaleString())} میلیون تومان
              {intlCurrency !== 'IRT' ? ` (${valuation.diffTotalMillion > 0 ? '+' : ''}${formatMillionTomanAsIntlCurrency(valuation.diffTotalMillion, intlCurrency, radarLocale)})` : ''}
            </strong>
          </div>
        </div>

        {/* Hedonic Factor Breakdown Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2">
          <div className="text-xs font-extrabold text-slate-900 dark:text-white pb-1 border-b border-slate-100 dark:border-slate-800">
            کالبدشکافی ضرایب هدونیک (چرا این قیمت؟)
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
            {valuation.factors.map((f) => (
              <div key={f.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {f.label}: <span className="font-normal text-slate-500 dark:text-slate-400">{f.valueLabel}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">{f.explanation}</div>
                </div>
                <div className="text-left shrink-0 tabular-nums">
                  <span
                    className={`font-extrabold ${
                      f.impactPercent > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : f.impactPercent < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {f.impactPercent > 0 ? `+${toPersianNum(f.impactPercent)}٪` : `${toPersianNum(f.impactPercent)}٪`}
                  </span>
                  <div className="text-[10px] text-slate-400">
                    {f.impactPerSqmMillion > 0 ? '+' : ''}
                    {toPersianNum(convertPricePerSqmToUnit(f.impactPerSqmMillion, areaUnit))} م/{areaUnit === 'sqft' ? 'ft²' : 'متر'}
                    {intlCurrency !== 'IRT' && f.impactPerSqmMillion !== 0 ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(convertPricePerSqmToUnit(f.impactPerSqmMillion, areaUnit)), intlCurrency, radarLocale)})` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onCopyValuation}
          className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
        >
          {copiedReport ? (
            <>
              <Check className="w-4 h-4" />
              <span>گزارش کپی شد</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>کپی متن کارشناسی</span>
            </>
          )}
        </button>
        <button
          type="button"
          disabled={downloadingPng}
          onClick={async () => {
            setDownloadingPng(true);
            await downloadHedonicValuationCardPng(valuation);
            setDownloadingPng(false);
          }}
          className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 dark:bg-white hover:opacity-90 text-white dark:text-slate-900 text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-60"
        >
          <Download className="w-4 h-4" />
          <span>{downloadingPng ? 'در حال ساخت تصویر...' : 'دانلود تصویر برگه کارشناسی (PNG)'}</span>
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="py-2.5 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
        >
          <Printer className="w-4 h-4 stroke-[1.75]" />
          <span>چاپ / PDF</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
        >
          بستن
        </button>
      </div>
    </div>
  );
}
