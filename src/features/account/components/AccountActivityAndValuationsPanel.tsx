/** @file src/features/account/components/AccountActivityAndValuationsPanel.tsx — Valuation History, Visit Log & Unified Activity */
import React from 'react';
import { ArrowUpLeft, Calculator, History, Trash2 } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import type { SavedValuationReport } from '../../valuation/types/valuation.types';
import type { AccountActivityTimelineItem } from '../types/account.types';

export interface AccountActivityAndValuationsPanelProps {
  savedValuations: SavedValuationReport[];
  timeline: AccountActivityTimelineItem[];
  visitedHomesCount: number;
  onOpenVisitedModal: () => void;
  onDeleteValuation: (reportId: string) => void;
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export const AccountActivityAndValuationsPanel: React.FC<AccountActivityAndValuationsPanelProps> = ({
  savedValuations,
  timeline,
  visitedHomesCount,
  onOpenVisitedModal,
  onDeleteValuation,
  onNavigateView,
}) => {
  const handleReloadValuation = (reportId: string) => {
    try {
      window.sessionStorage.setItem('radar_pending_valuation_reload_id', reportId);
    } catch { /* ignore */ }
    onNavigateView?.('tools', 'valuation');
  };

  return (
    <div className="space-y-4 text-xs" data-testid="account-activity-valuations">
      {/* Visit Log Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">دفترچه بازدیدهای میدانی</h2>
          <p className="text-slate-500 mt-1 tabular-nums">تاکنون {toPersianNum(visitedHomesCount)} بازدید ملکی ثبت کرده‌اید.</p>
        </div>
        <button type="button" onClick={onOpenVisitedModal} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer">
          مشاهده و ثبت بازدید
        </button>
      </div>

      {/* Saved Valuation Reports History */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Calculator className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>تاریخچه گزارش‌های ارزش‌گذاری ملک ({toPersianNum(savedValuations.length)})</span>
          </h2>
          <button type="button" onClick={() => onNavigateView?.('tools', 'valuation')} className="px-3 py-1.5 rounded-xl bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
            ارزش‌گذاری جدید
          </button>
        </div>

        {savedValuations.length === 0 ? (
          <p className="text-slate-500 py-3">هنوز گزارش ارزش‌گذاری ذخیره نکرده‌اید. در بخش «ابزارها ← ارزش‌گذاری» خروجی هر ملک را ذخیره کنید.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {savedValuations.map((rep) => (
              <div key={rep.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      محله {rep.hoodName} · {toPersianNum(rep.input.sqm)} متر
                    </div>
                    <div className="text-[10.5px] text-slate-500 tabular-nums">
                      {rep.modelVersion} · {rep.input.purpose === 'rent' ? 'اجاره/رهن' : 'فروش'}
                    </div>
                  </div>
                  <strong className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {toPersianNum((rep.hedonicTotalMillion / 1000).toFixed(2))} م.ت (میلیارد)
                  </strong>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleReloadValuation(rep.id)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>بازکردن در ابزار ارزش‌گذاری</span>
                    <ArrowUpLeft className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => onDeleteValuation(rep.id)} aria-label={`حذف ارزش‌گذاری ${rep.hoodName}`} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unified Activity Stream */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
          <History className="w-4 h-4 text-[var(--color-brand-600)]" />
          <span>خط زمانی فعالیت‌های حساب</span>
        </h2>
        {timeline.length === 0 ? (
          <p className="text-slate-500">فعالیتی ثبت نشده است.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {timeline.map((t) => (
              <div key={t.id} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{t.titleFa}</div>
                  <div className="text-[11px] text-slate-500">{t.metaFa}</div>
                </div>
                {t.targetView && (
                  <button type="button" onClick={() => onNavigateView?.(t.targetView!, t.targetSubTab)} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer">
                    مشاهده
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
