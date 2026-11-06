/**
 * @file src/components/CleanupProgressSummary.tsx
 * @description کامپوننت بصری CleanupProgressSummary برای پنل مدیریت جهت نمایش نوار پیشرفت و کارت‌های خلاصهٔ
 * عملیات‌های تکمیل‌شده (deletedCount)، در انتظار/ردشده (skippedCount) و ناموفق (failedCount) پاکسازی رسانه.
 */

import React from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
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

export interface CleanupReconciliationMetrics {
  deletedCount: number;
  skippedCount: number;
  failedCount: number;
  morePendingRecords?: boolean;
  scannedPendingCount?: number;
  journalSyncedCount?: number;
}

export interface CleanupProgressSummaryProps {
  metrics: CleanupReconciliationMetrics | null;
  error?: string | null;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}

export function CleanupProgressSummary({
  metrics,
  error = null,
  areaUnit: propAreaUnit,
  intlCurrency: propIntlCurrency,
}: CleanupProgressSummaryProps): React.ReactElement | null {
  const [hookAreaUnit] = useAreaUnit();
  const [hookIntlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const areaUnit = propAreaUnit ?? hookAreaUnit;
  const intlCurrency = propIntlCurrency ?? hookIntlCurrency;
  const sampleUnitPrice = convertPricePerSqmToUnit(120, areaUnit);
  const sample85mTotalMillions = 120 * 85;
  const sampleMonthlyRentMillions = 45;

  if (!metrics && !error) {
    return null;
  }

  const completedCount = metrics?.deletedCount ?? 0;
  const pendingCount = metrics?.skippedCount ?? 0;
  const failedCount = metrics?.failedCount ?? 0;
  const totalOperations = completedCount + pendingCount + failedCount;

  const completedPct =
    totalOperations > 0 ? Math.round((completedCount / totalOperations) * 100) : 0;
  const pendingPct =
    totalOperations > 0 ? Math.round((pendingCount / totalOperations) * 100) : 0;
  const failedPct =
    totalOperations > 0 ? Math.max(0, 100 - completedPct - pendingPct) : 0;

  return (
    <div
      data-testid="cleanup-progress-summary"
      className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3.5 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
            خلاصهٔ پیشرفت پاکسازی و بازیابی فایل‌های رسانه
          </div>
          {metrics && (
            <div className="text-slate-500 dark:text-slate-400 text-[11px] flex flex-wrap items-center gap-1.5 mt-0.5 tabular-nums">
              <span>بررسی‌شده: {toPersianNum(metrics.scannedPendingCount ?? totalOperations)} پرونده</span>
              <span aria-hidden="true">·</span>
              <span>مجموع عملیات: {toPersianNum(totalOperations)} مورد</span>
              <span aria-hidden="true">·</span>
              <span>واحد ({formatAreaUnitLabel(areaUnit)}): {toPersianNum(sampleUnitPrice)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sampleUnitPrice, intlCurrency, locale)})` : ''} · {formatAreaShort(85, areaUnit)}: {toPersianNum(sample85mTotalMillions)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sample85mTotalMillions, intlCurrency, locale)})` : ''} · اجاره: {toPersianNum(sampleMonthlyRentMillions)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sampleMonthlyRentMillions, intlCurrency, locale)})` : ''}</span>
              {typeof metrics.journalSyncedCount === 'number' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>همگام‌شده با ژورنال: {toPersianNum(metrics.journalSyncedCount)} عملیات</span>
                </>
              )}
            </div>
          )}
        </div>
        {metrics?.morePendingRecords && (
          <span className="text-amber-700 dark:text-amber-400 text-[11px] font-bold">
            رکوردهای بیشتری در صف انتظار باقی مانده است
          </span>
        )}
      </div>

      {error ? (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 font-bold">
          {error}
        </div>
      ) : metrics ? (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
              <span>نوار پیشرفت عملیات پاکسازی فایل‌ها</span>
              <span>
                {toPersianNum(completedPct)}٪ تکمیل‌شده · {toPersianNum(pendingPct)}٪ در انتظار/ردشده · {toPersianNum(failedPct)}٪ ناموفق
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, totalOperations)}
              aria-valuenow={completedCount}
              aria-label="پیشرفت عملیات پاکسازی فایل‌های رسانه"
              className="h-2.5 w-full rounded-lg bg-slate-200 dark:bg-slate-700 overflow-hidden flex"
            >
              {totalOperations === 0 ? (
                <div className="h-full w-full bg-emerald-500/40" />
              ) : (
                <>
                  {completedCount > 0 && (
                    <div
                      style={{ width: `${(completedCount / totalOperations) * 100}%` }}
                      className="h-full bg-emerald-600 transition-all duration-300"
                      title={`تکمیل‌شده (حذف شد): ${completedCount}`}
                    />
                  )}
                  {pendingCount > 0 && (
                    <div
                      style={{ width: `${(pendingCount / totalOperations) * 100}%` }}
                      className="h-full bg-amber-500 transition-all duration-300"
                      title={`در انتظار / رد شد: ${pendingCount}`}
                    />
                  )}
                  {failedCount > 0 && (
                    <div
                      style={{ width: `${(failedCount / totalOperations) * 100}%` }}
                      className="h-full bg-rose-600 transition-all duration-300"
                      title={`ناموفق: ${failedCount}`}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>حذف شد: {toPersianNum(completedCount)} مورد</span>
                </span>
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {toPersianNum(completedPct)}٪
                </span>
              </div>
              <div className="text-[10.5px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                عملیات پاکسازی کامل شده و رکورد از ایندکس و فضای ذخیره‌سازی خارج شده است.
              </div>
            </div>

            <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>رد شد: {toPersianNum(pendingCount)} مورد</span>
                </span>
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                  {toPersianNum(pendingPct)}٪
                </span>
              </div>
              <div className="text-[10.5px] text-amber-800 dark:text-amber-300 leading-relaxed">
                رکورد در انتظار بررسی یا متصل به آگهی فعال است و از حذف خودکار محافظت شد.
              </div>
            </div>

            <div className="bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-black text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>ناموفق: {toPersianNum(failedCount)} مورد</span>
                </span>
                <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                  {toPersianNum(failedPct)}٪
                </span>
              </div>
              <div className="text-[10.5px] text-rose-800 dark:text-rose-300 leading-relaxed">
                عملیات حذف با خطا مواجه شده و برای تلاش مجدد بعدی در صف باقی مانده است.
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
