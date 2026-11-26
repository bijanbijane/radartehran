import React from 'react';
import { Info } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode, type RadarLocale } from '../../../utils/areaUnit';
import {
  INDICATOR_STATUS_LABELS_FA,
  RENT_CONVERSION_EFFECTIVE_VERSION,
} from '../indicators/IndicatorRegistry';
import type { RentRawBreakdown } from '../types/indicator.types';

export interface RentAnalyticsSectionProps {
  rentBreakdown: RentRawBreakdown;
  geoScopeFa: string;
  intlCurrency: IntlCurrencyCode;
  radarLocale: RadarLocale;
  includeConverted: boolean;
  onToggleConverted: (next: boolean) => void;
}

export const RentAnalyticsSection: React.FC<RentAnalyticsSectionProps> = ({
  rentBreakdown,
  geoScopeFa,
  intlCurrency,
  radarLocale,
  includeConverted,
  onToggleConverted,
}) => {
  return (
    <section
      aria-label="سنجش ساختار رهن و اجاره"
      data-testid="market-rent-breakdown"
      className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-4 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-subtle)]/80 dark:border-[var(--color-border-subtle)] pb-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white">
            تحلیل تفکیکی ودیعه، اجاره ماهانه و بازده اجاره در {geoScopeFa}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] mt-0.5">
            مقادیر خام ودیعه و اجاره بدون مخلوط‌کردن نمایش داده می‌شوند · وضعیت:{' '}
            {INDICATOR_STATUS_LABELS_FA[rentBreakdown.status]}
          </p>
        </div>

        <label className="inline-flex items-center gap-2 font-semibold text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={includeConverted}
            onChange={(e) => onToggleConverted(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-brand-600)]"
          />
          <span>نمایش معادل اجاره تبدیل‌شده (نرخ {toPersianNum(Math.round(rentBreakdown.conversionRateAnnual * 100))}٪)</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
        <div className="p-3.5 rounded-lg bg-[var(--color-bg-canvas)] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)]">
          <span className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] block">شاخص خام رهن کامل (۸۰ متر)</span>
          <strong className="text-lg font-bold text-[var(--color-text-primary)] dark:text-white mt-1 block">
            {toPersianNum(rentBreakdown.deposit80mMillion)} م.ت
          </strong>
          {intlCurrency !== 'IRT' && (
            <span className="text-xs text-[var(--color-brand-600)] dark:text-emerald-400">
              {formatMillionTomanAsIntlCurrency(rentBreakdown.deposit80mMillion, intlCurrency, radarLocale)}
            </span>
          )}
        </div>

        <div className="p-3.5 rounded-lg bg-[var(--color-bg-canvas)] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)]">
          <span className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] block">بخش اجاره ماهانه (قرارداد ترکیبی ۶۰٪ رهن)</span>
          <strong className="text-lg font-bold text-[var(--color-text-primary)] dark:text-white mt-1 block">
            {toPersianNum(rentBreakdown.monthlyRentAtMixedMillion)} م.ت / ماه
          </strong>
          <span className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">باقی‌مانده به‌صورت ودیعه</span>
        </div>

        {includeConverted && (
          <div className="p-3.5 rounded-lg bg-[#EAF3F0]/60 dark:bg-emerald-950/20 border border-[#BBE0CA] dark:border-emerald-800">
            <span className="text-xs text-[var(--color-brand-700)] dark:text-emerald-300 font-bold block">
              معادل تمام‌اجاره ماهانه (نسخه {RENT_CONVERSION_EFFECTIVE_VERSION})
            </span>
            <strong className="text-lg font-bold text-[#103B38] dark:text-emerald-200 mt-1 block">
              {toPersianNum(rentBreakdown.convertedFullMonthlyMillion)} م.ت / ماه
            </strong>
            <span className="text-xs text-[var(--color-brand-700)] dark:text-emerald-400">
              مبنا: هر ۱۰۰ م رهن = {toPersianNum(Math.round(rentBreakdown.conversionRatioPerMillion * 100))} م اجاره
            </span>
          </div>
        )}

        <div className="p-3.5 rounded-lg bg-[var(--color-bg-canvas)] dark:bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)]">
          <span className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] block">بازده ناخالص اجاره سالانه به قیمت فروش</span>
          <strong className="text-lg font-bold text-[#155E9A] dark:text-sky-300 mt-1 block">
            {toPersianNum(rentBreakdown.grossYieldPct)}٪
          </strong>
          <span className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">نسبت سالانه اجاره معادل به ارزش واحد</span>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] pt-1">
        <Info className="w-3.5 h-3.5 text-[var(--color-brand-600)] shrink-0 mt-0.5" />
        <span>
          فرمول تبدیل رهن به اجاره: <code>R_eq = R_m + (D × 0.36) / 12</code>. برای قراردادهای واقعی، نرخ توافقی مالک و مستأجر ممکن است متفاوت باشد.
        </span>
      </div>
    </section>
  );
};
