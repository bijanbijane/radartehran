/** @file src/features/valuation/components/SavedValuationsPanel.tsx — Stage 93 Saved Valuation Snapshots with Account vs Device Scope Badges */
import React from 'react';
import { Cloud, HardDrive, RotateCcw, Trash2 } from 'lucide-react';
import { MULTI_CITY_CONFIGS } from '../../../data/multiCityData';
import { toPersianNum } from '../../../data/neighborhoods';
import { VALUATION_PURPOSE_LABELS_FA, type SavedValuationReport } from '../types/valuation.types';

export interface SavedValuationsPanelProps {
  reports: SavedValuationReport[];
  onLoadReport: (report: SavedValuationReport) => void;
  onDeleteReport: (id: string) => void;
}

export const SavedValuationsPanel: React.FC<SavedValuationsPanelProps> = ({
  reports,
  onLoadReport,
  onDeleteReport,
}) => {
  if (reports.length === 0) return null;

  return (
    <section className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-2.5 text-xs" data-testid="saved-valuations-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black text-[var(--color-text-primary)] dark:text-white">گزارش‌های ارزش‌گذاری ذخیره‌شده ({toPersianNum(reports.length)})</h3>
        <span className="text-xs text-[var(--color-text-muted)]">تفکیک ذخیره‌سازی حساب کاربری و حافظه محلی دستگاه</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 tabular-nums">
        {reports.slice(0, 6).map((r) => {
          const cityName = MULTI_CITY_CONFIGS[r.cityId]?.nameFa || 'تهران';
          const isSynced = r.storageScope === 'account_synced';
          return (
            <div key={r.id} className="p-3 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800/70 border border-[var(--color-border-subtle)] dark:border-slate-700 flex items-center justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] text-xs font-bold ${
                      isSynced
                        ? 'bg-[#EAF3F0] text-[var(--color-brand-700)] dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-[#EEF5FC] text-[#1D4E89] dark:bg-sky-950/60 dark:text-sky-300'
                    }`}
                  >
                    {isSynced ? <Cloud className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
                    <span>{isSynced ? 'ذخیره‌شده در حساب' : 'ذخیره‌شده روی این دستگاه'}</span>
                  </span>
                  {r.isHypotheticalScenario && (
                    <span className="px-1.5 py-0.5 rounded-[5px] bg-[#FFF4E5] text-[#875000] text-xs font-bold">
                      سناریوی فرضی
                    </span>
                  )}
                </div>
                <div className="font-bold text-[var(--color-text-primary)] dark:text-white truncate">
                  {cityName} · {r.hoodName} · {toPersianNum(r.input.sqm)} متر (ساخت {toPersianNum(r.input.buildYear)})
                </div>
                <div className="text-xs font-black text-[var(--color-brand-600)] dark:text-emerald-400">
                  {r.purpose === 'rent' && r.estimatedRahnMillion
                    ? `${toPersianNum(r.estimatedRahnMillion)} میلیون رهن کامل`
                    : `${toPersianNum((r.hedonicTotalMillion / 1000).toFixed(2))} میلیارد تومان`}
                  <span className="text-xs font-normal text-[var(--color-text-muted)] mr-1">
                    ({VALUATION_PURPOSE_LABELS_FA[r.purpose || 'sale']})
                  </span>
                </div>
                <div className="text-xs text-[var(--color-text-muted)] truncate">
                  {new Date(r.savedAtIso).toLocaleDateString('fa-IR')} · {r.dataSnapshotId}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onLoadReport(r)}
                  title="بازخوانی در فرم و محاسبه مجدد"
                  className="p-1.5 rounded-[7px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-700 text-[var(--color-brand-600)] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteReport(r.id)}
                  title="حذف گزارش"
                  className="p-1.5 rounded-[7px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-700 text-[#B3261E] dark:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
