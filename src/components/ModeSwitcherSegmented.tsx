/**
 * @file src/components/ModeSwitcherSegmented.tsx
 * @description سوییچر مدرن حالت معامله (رهن و اجاره / خرید ملک) با افکت پالس هوشمند (Visual Highlight Effect)
 * در زمان نامتناسب بودن معیار کاربر با حالت انتخابی (مانند پس‌انداز بالا در حالت رهن).
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { toPersianNum } from '../data/neighborhoods';
import {
  AreaUnit,
  IntlCurrencyCode,
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
} from '../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

export interface ModeSwitcherSegmentedProps {
  mode: 'rent' | 'buy';
  setMode: (m: 'rent' | 'buy') => void;
  deposit: number;
  monthlyRent: number;
  buyTotalBudget: number;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}

export function ModeSwitcherSegmented({
  mode,
  setMode,
  deposit,
  monthlyRent,
  buyTotalBudget,
  areaUnit: areaUnitProp,
  intlCurrency: intlCurrencyProp,
}: ModeSwitcherSegmentedProps): React.ReactElement {
  const [hookUnit] = useAreaUnit();
  const [hookCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const areaUnit = areaUnitProp ?? hookUnit;
  const intlCurrency = intlCurrencyProp ?? hookCurrency;
  const impliedUnitBuy80m = convertPricePerSqmToUnit(
    Math.max(10, Math.round(buyTotalBudget / 80)),
    areaUnit
  );
  // Logic: When user is in 'rent' mode, but has high cash/savings (deposit >= 2000m or deposit >= 1500m & monthlyRent >= 25m),
  // they could easily qualify for buying property (especially with housing loans).
  const shouldSuggestBuy = mode === 'rent' && (deposit >= 2000 || (deposit >= 1500 && monthlyRent >= 25));

  // Logic: When user is in 'buy' mode, but total budget is very low (e.g. <= 1400m),
  // outright purchasing in quality zones is constrained, so luxury long-term rent/rahn is recommended.
  const shouldSuggestRent = mode === 'buy' && buyTotalBudget > 0 && buyTotalBudget <= 1400;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5 apple-segmented p-1 rounded-[10px]">
        <button
          type="button"
          onClick={() => setMode('rent')}
          title={shouldSuggestRent ? 'پیشنهاد هوشمند: با این بودجه، بررسی گزینه‌های رهن کامل توصیه می‌شود' : undefined}
          className={`relative py-1.5 rounded-[8px] text-xs font-bold transition cursor-pointer ${
            mode === 'rent'
              ? 'apple-segmented-pill-active text-slate-900 dark:text-[var(--color-text-primary)] font-bold'
              : shouldSuggestRent
              ? 'bg-blue-50/90 dark:bg-blue-950/60 text-[#007AFF] dark:text-blue-400 font-bold ring-2 ring-[#007AFF]/70 shadow-[0_0_12px_rgba(0,122,255,0.35)] animate-pulse'
              : 'text-slate-600 dark:text-[var(--color-text-muted)] hover:text-slate-900 dark:hover:text-[var(--color-text-primary)]'
          }`}
        >
          <span>رهن و اجاره</span>
          {shouldSuggestRent && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#007AFF]" />
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMode('buy')}
          title={shouldSuggestBuy ? 'پیشنهاد هوشمند: با پس‌انداز بالای ۲ میلیارد، فرصت‌های خرید نقلی یا با تسهیلات را بررسی کنید' : undefined}
          className={`relative py-1.5 rounded-[8px] text-xs font-bold transition cursor-pointer ${
            mode === 'buy'
              ? 'apple-segmented-pill-active text-slate-900 dark:text-[var(--color-text-primary)] font-bold'
              : shouldSuggestBuy
              ? 'bg-emerald-50/90 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold ring-2 ring-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.35)] animate-pulse'
              : 'text-slate-600 dark:text-[var(--color-text-muted)] hover:text-slate-900 dark:hover:text-[var(--color-text-primary)]'
          }`}
        >
          <span>خرید ملک</span>
          {shouldSuggestBuy && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-brand-600)]" />
            </span>
          )}
        </button>
      </div>

      {shouldSuggestBuy && (
        <button
          type="button"
          onClick={() => setMode('buy')}
          className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-[8px] bg-emerald-50/90 dark:bg-emerald-950/40 hover:bg-emerald-100/90 dark:hover:bg-emerald-950/60 border border-emerald-200/90 dark:border-emerald-800/70 text-[10.5px] font-bold text-emerald-800 dark:text-emerald-300 text-right transition cursor-pointer animate-in fade-in-0 duration-300"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
            <span>
              با پس‌انداز {toPersianNum(deposit.toLocaleString('en-US'))} م ({formatMillionTomanAsIntlCurrency(deposit, intlCurrency, locale)}) و اجاره ماهانه {toPersianNum(monthlyRent)} م ({formatMillionTomanAsIntlCurrency(monthlyRent, intlCurrency, locale)})، گزینه‌های خرید نقلی ({formatAreaShort(80, areaUnit)}) یا با وام در دسترس شماست!
            </span>
          </span>
          <span className="shrink-0 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 underline">سوییچ به خرید</span>
        </button>
      )}

      {shouldSuggestRent && (
        <button
          type="button"
          onClick={() => setMode('rent')}
          className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-[8px] bg-blue-50/90 dark:bg-blue-950/40 hover:bg-blue-100/90 dark:hover:bg-blue-950/60 border border-blue-200/90 dark:border-blue-800/70 text-[10.5px] font-bold text-blue-800 dark:text-blue-300 text-right transition cursor-pointer animate-in fade-in-0 duration-300"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              با بودجه {toPersianNum(buyTotalBudget.toLocaleString('en-US'))} م ({formatMillionTomanAsIntlCurrency(buyTotalBudget, intlCurrency, locale)} · معادل هر {areaUnit === 'sqft' ? 'ft²' : 'متر'} {toPersianNum(impliedUnitBuy80m)} م برای واحد {formatAreaShort(80, areaUnit)})، رهن کامل واحدهای لوکس و نوساز می‌تواند گزینه مناسب‌تری باشد!
            </span>
          </span>
          <span className="shrink-0 text-[10px] font-bold text-blue-700 dark:text-blue-400 underline">سوییچ به رهن</span>
        </button>
      )}
    </div>
  );
}
