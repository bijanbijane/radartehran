/** @file src/features/valuation/components/SavedValuationsPanel.tsx — Saved Valuation Snapshots & Restore */
import React from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { SavedValuationReport } from '../types/valuation.types';

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
    <section className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2.5 text-xs" data-testid="saved-valuations-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-[#182522] dark:text-white">گزارش‌های ارزش‌گذاری ذخیره‌شده ({toPersianNum(reports.length)})</h3>
        <span className="text-[10.5px] text-[#586760]">امکان بازخوانی و محاسبه مجدد با شرایط جدید</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 tabular-nums">
        {reports.slice(0, 6).map((r) => (
          <div key={r.id} className="p-3 rounded-[9px] bg-[#F8F9FA] dark:bg-slate-800/70 border border-[#DCE3DF] dark:border-slate-700 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-[#182522] dark:text-white truncate">
                {r.hoodName} · {toPersianNum(r.input.sqm)} متر (ساخت {toPersianNum(r.input.buildYear)})
              </div>
              <div className="text-[11px] font-black text-[#176B63] dark:text-emerald-400">
                {toPersianNum((r.hedonicTotalMillion / 1000).toFixed(2))} میلیارد تومان
              </div>
              <div className="text-[10px] text-[#586760]">
                {new Date(r.savedAtIso).toLocaleDateString('fa-IR')} · {r.modelVersion}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onLoadReport(r)}
                title="بازخوانی در فرم و محاسبه مجدد"
                className="p-1.5 rounded-[7px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 text-[#176B63] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteReport(r.id)}
                title="حذف گزارش"
                className="p-1.5 rounded-[7px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 text-[#B3261E] cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
