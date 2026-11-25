/**
 * @file src/components/NeighborhoodLoadingSkeletons.tsx
 * @description کامپوننت‌های اسکلت بارگذاری (Loading Skeleton) برای نوار فهرست محلات و پنل کالبدشکافی
 * با انیمیشن ملایم نبض (pulse)، هماهنگی با تم روشن و تاریک، و بهینه‌سازی ادراک سرعت لود داده‌ها.
 */

import React from 'react';
import { toPersianNum } from '../data/neighborhoods';
import {
  AreaUnit,
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  IntlCurrencyCode,
} from '../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

/**
 * اسکلت بارگذاری نوار رتبه‌بندی سریع افقی محلات
 */
export function NeighborhoodRankingStripSkeleton({
  itemCount = 5,
  className = '',
  areaUnit: propAreaUnit,
  intlCurrency: propIntlCurrency,
}: {
  itemCount?: number;
  className?: string;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}): React.ReactElement {
  const [hookAreaUnit] = useAreaUnit();
  const [hookIntlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const areaUnit = propAreaUnit ?? hookAreaUnit;
  const intlCurrency = propIntlCurrency ?? hookIntlCurrency;
  const sampleUnitBuy = convertPricePerSqmToUnit(120, areaUnit);
  const sample80mTotalMillions = 120 * 80;
  const sampleMonthlyRentMillions = 45;

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="در حال بارگذاری فهرست محلات..."
      className={`space-y-2 select-none pointer-events-none ${className}`}
    >
      <span className="sr-only">
        در حال بارگذاری فهرست محلات ({formatAreaUnitLabel(areaUnit)} · {toPersianNum(sampleUnitBuy)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(sampleUnitBuy, intlCurrency, locale)}` : ''} · معیار {formatAreaShort(80, areaUnit)}: {toPersianNum(sample80mTotalMillions)} م · اجاره ماهانه: {toPersianNum(sampleMonthlyRentMillions)} م)...
      </span>

      {/* منوی شبیه‌سازی فیلتر تب‌ها */}
      <div className="flex items-center gap-1.5 overflow-hidden apple-segmented p-1 rounded-[10px] opacity-80">
        {[80, 68, 92, 74].map((width, idx) => (
          <div
            key={idx}
            className="h-6 rounded-[8px] bg-slate-200/80 dark:bg-[var(--color-bg-elevated)] animate-pulse shrink-0"
            style={{ width: `${width}px` }}
          />
        ))}
      </div>

      {/* کارت‌های افقی محلات */}
      <div className="flex items-center gap-1.5 overflow-hidden">
        {Array.from({ length: itemCount }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-[10px] border border-slate-200/80 dark:border-[var(--color-border-subtle)] bg-white/90 dark:bg-[var(--color-bg-surface)] p-2 flex items-center gap-2 whitespace-nowrap shrink-0 shadow-2xs"
            style={{ width: '138px' }}
          >
            <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-[var(--color-border-strong)] animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-16 bg-slate-200 dark:bg-[var(--color-bg-elevated)] rounded animate-pulse" />
              <div className="h-2.5 w-11 bg-slate-100 dark:bg-[var(--color-bg-muted)] rounded animate-pulse" />
            </div>
            <div className="w-6 h-5 rounded-[6px] bg-slate-100 dark:bg-[var(--color-bg-muted)] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * اسکلت بارگذاری کامل بدنه پنل کالبدشکافی محله (Neighborhood Inspector Drawer)
 */
export function InspectorDrawerSkeleton({
  className = '',
  areaUnit: propAreaUnit,
  intlCurrency: propIntlCurrency,
}: {
  className?: string;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}): React.ReactElement {
  const [hookAreaUnit] = useAreaUnit();
  const [hookIntlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const areaUnit = propAreaUnit ?? hookAreaUnit;
  const intlCurrency = propIntlCurrency ?? hookIntlCurrency;
  const sampleUnitBuy = convertPricePerSqmToUnit(120, areaUnit);
  const sample80mTotalMillions = 120 * 80;
  const sampleMonthlyRentMillions = 45;

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="در حال بارگذاری اطلاعات تفصیلی محله..."
      className={`space-y-4 select-none pointer-events-none ${className}`}
    >
      <span className="sr-only">
        در حال بارگذاری جزئیات کارنامه و کالبدشکافی محله ({formatAreaUnitLabel(areaUnit)} · {toPersianNum(sampleUnitBuy)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(sampleUnitBuy, intlCurrency, locale)}` : ''} · معیار {formatAreaShort(80, areaUnit)}: {toPersianNum(sample80mTotalMillions)} م · اجاره ماهانه: {toPersianNum(sampleMonthlyRentMillions)} م)...
      </span>

      {/* نوار سربرگ محله و امتیاز */}
      <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-200/70 dark:border-[var(--color-border-subtle)]">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-3 w-14 bg-slate-200 dark:bg-[var(--color-bg-elevated)] rounded animate-pulse" />
            <div className="h-3 w-20 bg-emerald-100/70 dark:bg-emerald-950/40 rounded animate-pulse" />
          </div>
          <div className="h-6 w-36 bg-slate-200 dark:bg-[var(--color-bg-elevated)] rounded-[8px] animate-pulse" />
          <div className="flex items-center gap-2 pt-1">
            <div className="h-4 w-18 bg-slate-100 dark:bg-[var(--color-bg-muted)] rounded animate-pulse" />
            <div className="h-4 w-24 bg-slate-100 dark:bg-[var(--color-bg-muted)] rounded animate-pulse" />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-[10px] bg-slate-100 dark:bg-[var(--color-bg-muted)] border border-slate-200/80 dark:border-[var(--color-border-strong)] animate-pulse" />
          <div className="w-8 h-8 rounded-[10px] bg-slate-100 dark:bg-[var(--color-bg-muted)] border border-slate-200/80 dark:border-[var(--color-border-strong)] animate-pulse" />
          <div className="w-12 h-8 rounded-[10px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/40 animate-pulse" />
        </div>
      </div>

      {/* اسکلت نوار رتبه‌بندی سریع */}
      <NeighborhoodRankingStripSkeleton itemCount={4} areaUnit={areaUnit} intlCurrency={intlCurrency} />

      {/* دو کارت برجسته قیمت و رهن */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="apple-grouped-card p-3 space-y-2">
          <div className="h-3 w-16 bg-slate-200/80 dark:bg-[var(--color-bg-elevated)] rounded animate-pulse" />
          <div className="h-6 w-28 bg-slate-300/80 dark:bg-[var(--color-border-strong)] rounded-[6px] animate-pulse" />
          <div className="h-2.5 w-20 bg-slate-100 dark:bg-[var(--color-bg-muted)] rounded animate-pulse" />
        </div>
        <div className="apple-grouped-card p-3 space-y-2">
          <div className="h-3 w-20 bg-slate-200/80 dark:bg-[var(--color-bg-elevated)] rounded animate-pulse" />
          <div className="h-6 w-24 bg-emerald-200/70 dark:bg-emerald-800/40 rounded-[6px] animate-pulse" />
          <div className="h-2.5 w-28 bg-slate-100 dark:bg-[var(--color-bg-muted)] rounded animate-pulse" />
        </div>
      </div>

      {/* نوار ۴ تب کالبدشکافی */}
      <div className="grid grid-cols-4 gap-1 apple-segmented p-1 rounded-[10px]">
        {[1, 2, 3, 4].map((tabIdx) => (
          <div
            key={tabIdx}
            className="h-7 rounded-[8px] bg-slate-200/70 dark:bg-[var(--color-bg-elevated)] animate-pulse"
          />
        ))}
      </div>

      {/* محتوای شاخص‌های کارنامه محله */}
      <div className="space-y-3 pt-1">
        <div className="p-3.5 rounded-[12px] bg-slate-50 dark:bg-[var(--color-bg-surface)] border border-slate-200/80 dark:border-[var(--color-border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-24 bg-slate-200 dark:bg-[var(--color-bg-elevated)] rounded animate-pulse" />
            <div className="h-3.5 w-12 bg-slate-200 dark:bg-[var(--color-bg-elevated)] rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[1, 2, 3].map((cellIdx) => (
              <div
                key={cellIdx}
                className="p-2.5 rounded-[9px] bg-white dark:bg-[var(--color-bg-muted)] border border-slate-200/60 dark:border-[var(--color-border-strong)] space-y-1.5"
              >
                <div className="h-2.5 w-10 bg-slate-200 dark:bg-[var(--color-bg-elevated)] rounded animate-pulse" />
                <div className="h-4 w-12 bg-slate-300 dark:bg-[var(--color-border-strong)] rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* جعبه نمودار یا تحلیل روند */}
        <div className="p-3.5 rounded-[12px] bg-slate-50 dark:bg-[var(--color-bg-surface)] border border-slate-200/80 dark:border-[var(--color-border-subtle)] space-y-2">
          <div className="h-3 w-32 bg-slate-200 dark:bg-[var(--color-bg-elevated)] rounded animate-pulse" />
          <div className="h-28 w-full rounded-[8px] bg-slate-200/60 dark:bg-[var(--color-bg-muted)] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/**
 * اسکلت عمودی برای فهرست‌های ستونی محلات
 */
export function NeighborhoodListSkeleton({
  count = 5,
  className = '',
  areaUnit: propAreaUnit,
  intlCurrency: propIntlCurrency,
}: {
  count?: number;
  className?: string;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}): React.ReactElement {
  const [hookAreaUnit] = useAreaUnit();
  const [hookIntlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const areaUnit = propAreaUnit ?? hookAreaUnit;
  const intlCurrency = propIntlCurrency ?? hookIntlCurrency;
  const sampleUnitBuy = convertPricePerSqmToUnit(120, areaUnit);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="در حال بارگذاری لیست محلات..."
      className={`divide-y divide-slate-100 dark:divide-[var(--color-border-subtle)] select-none pointer-events-none ${className}`}
    >
      <span className="sr-only">
        در حال بارگذاری لیست محلات ({formatAreaUnitLabel(areaUnit)} · {toPersianNum(sampleUnitBuy)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(sampleUnitBuy, intlCurrency, locale)}` : ''})...
      </span>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-[8px] bg-slate-200/80 dark:bg-[var(--color-bg-elevated)] animate-pulse shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="h-3 w-24 bg-slate-200 dark:bg-[var(--color-bg-elevated)] rounded animate-pulse" />
              <div className="h-2.5 w-32 bg-slate-100 dark:bg-[var(--color-bg-muted)] rounded animate-pulse" />
            </div>
          </div>
          <div className="w-12 h-6 rounded-[6px] bg-slate-100 dark:bg-[var(--color-bg-muted)] animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}
