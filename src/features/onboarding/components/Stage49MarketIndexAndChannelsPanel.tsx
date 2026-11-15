/** @file src/features/onboarding/components/Stage49MarketIndexAndChannelsPanel.tsx — Stage 49 Market Index, Source Outage, Quiet Hours & Delivery Fallback */
import React, { useState } from 'react';
import {
  evaluateNeighborhoodIndexMonitor,
  evaluateQuietHoursAndDelivery,
  resolveMonitorSourceOutageState,
} from '../services/marketMonitoringEngine';
import {
  STAGE49_MM_COMPONENT_IDS_45,
  STAGE49_UI_MM_TASKS_35,
  STAGE49_UX_EVENTS_20,
  STAGE50_REPORTING_AXES_16,
} from '../services/marketMonitoringTypes';

export const Stage49MarketIndexAndChannelsPanel: React.FC<{
  section: 'market_index_timeline' | 'channels_quiet_hours_admin';
  onFeedbackFa: (msg: string) => void;
}> = ({ section, onFeedbackFa }) => {
  const [lowPriceRemoved, setLowPriceRemoved] = useState(true);
  const [sourceReachable, setSourceReachable] = useState(false);
  const [isQuietHours, setIsQuietHours] = useState(true);
  const [externalFailed, setExternalFailed] = useState(true);

  const indexEval = evaluateNeighborhoodIndexMonitor({
    hoodNameFa: 'سعادت‌آباد',
    periodFa: 'ماهانه',
    previousMedianM: 185,
    newMedianM: 212,
    observationCount: 64,
    lowPriceListingsRemovedRecently: lowPriceRemoved,
  });

  const outageCheck = resolveMonitorSourceOutageState(sourceReachable, false);
  const deliveryCheck = evaluateQuietHoursAndDelivery({
    isWithinQuietHours: isQuietHours,
    isUrgentUserException: false,
    externalChannelFailed: externalFailed,
  });

  if (section === 'market_index_timeline') {
    return (
      <div className="space-y-3" data-testid="stage49-market-index-panel">
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-emerald-300 text-xs">
              ۴۹.۹ و ۴۹.۱۰ پایش شاخص محله، ۳ مفهوم قیمت و بررسی ترکیب نمونه (MM-15, MM-16 · Tests 7–8)
            </h4>
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={lowPriceRemoved}
                onChange={(e) => {
                  setLowPriceRemoved(e.target.checked);
                  onFeedbackFa('وضعیت تغییر ترکیب نمونه محله به‌روزرسانی شد.');
                }}
              />
              شبیه‌سازی حذف آگهی‌های ارزان‌تر از نمونه
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10.5px]">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
              <div className="font-bold text-cyan-300">۱. قیمت آگهی (Asking Price)</div>
              <p className="text-slate-300 mt-0.5">مبلغ اعلامی فروشنده در آگهی؛ تغییر آن به معنی تغییر قیمت معامله قطعی نیست.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
              <div className="font-bold text-amber-300">۲. قیمت پیشنهادی (Offered Price)</div>
              <p className="text-slate-300 mt-0.5">مبلغ پیشنهادی در مذاکره؛ مستقل از آگهی اولیه و سند رسمی.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
              <div className="font-bold text-emerald-300">۳. قیمت معامله (Transaction Price)</div>
              <p className="text-slate-300 mt-0.5">مبلغ قطعی ثبت‌شده؛ هرگز نباید با تغییر قیمت آگهی خلط شود.</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3 space-y-1.5" data-testid="mm-neighborhood-index-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-white">
                محله {indexEval.hoodNameFa} — دوره {indexEval.periodFa} ({indexEval.methodFa})
              </span>
              <span className="rounded bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300">
                تغییر: {indexEval.changePercent > 0 ? `+${indexEval.changePercent}٪` : `${indexEval.changePercent}٪`} · تعداد مشاهده: {indexEval.observationCount}
              </span>
            </div>
            <p className="text-amber-200">{indexEval.limitationNoticeFa}</p>
            <div className="text-[10px] text-slate-400">
              نیازمند بررسی ترکیب نمونه و کیفیت داده؟ <strong>{indexEval.requiresCompositionAndQualityCheck ? 'بله (هشدار تغییر ترکیب نمونه فعال)' : 'خیر'}</strong>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2 text-[11px]" data-testid="mm-source-outage-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-cyan-300 text-xs">
              ۴۹.۱۳ و ۴۹.۱۸ تفکیک «بررسی ناموفق منبع» از «بدون تغییر» (MM-21, MM-40 · Test 12)
            </h4>
            <button
              type="button"
              data-testid="mm-toggle-source-reachable"
              onClick={() => {
                setSourceReachable((prev) => !prev);
                onFeedbackFa('وضعیت دسترسی به منبع داده تغییر کرد.');
              }}
              className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white font-bold cursor-pointer"
            >
              {sourceReachable ? 'شبیه‌سازی قطع ارتباط با منبع' : 'شبیه‌سازی برقراری مجدد منبع'}
            </button>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
            <div>
              وضعیت ثبت‌شده: <strong className="text-amber-300">{outageCheck.checkStatus}</strong> · گزارش کاذب به‌عنوان «بدون تغییر»؟{' '}
              <strong>{outageCheck.reportedAsNoChange ? 'بله' : 'خیر (تفکیک صریح عدم دسترسی)'}</strong>
            </div>
            <p className="mt-1 text-slate-300">{outageCheck.messageFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="stage49-channels-admin-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
        <h4 className="font-bold text-emerald-300 text-xs">
          ۴۹.۱۶ و ۴۹.۱۷ کانال‌های ارسال، ساعت سکوت و پایداری در خطای کانال بیرونی (MM-26..MM-29 · Tests 11, 18)
        </h4>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
            <input type="checkbox" checked={isQuietHours} onChange={(e) => setIsQuietHours(e.target.checked)} />
            قرارگیری در بازه ساعت سکوت (۲۲:۰۰ تا ۰۸:۰۰)
          </label>
          <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
            <input type="checkbox" checked={externalFailed} onChange={(e) => setExternalFailed(e.target.checked)} />
            شبیه‌سازی خطا در کانال بیرونی (پیامک/ایمیل)
          </label>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 space-y-1" data-testid="mm-quiet-hours-delivery-card">
          <div>
            ذخیره قطعی در مرکز هشدار داخل سامانه: <strong className="text-emerald-300">{deliveryCheck.storedInInAppCenter ? 'بله (تضمین عدم فقدان هشدار)' : 'خیر'}</strong>
          </div>
          <div>
            وضعیت تحویل اعلان: <strong className="text-amber-300">{deliveryCheck.deliveryStatus}</strong> · ارسال فوری بیرونی:{' '}
            <strong>{deliveryCheck.externalPushSentImmediately ? 'بله' : 'خیر (تجمیع یا حفظ در مرکز هشدار داخلی)'}</strong>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5 text-[11px]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10.5px]">
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">کامپوننت‌های MM: <strong>{STAGE49_MM_COMPONENT_IDS_45.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">رویدادهای UX: <strong>{STAGE49_UX_EVENTS_20.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">تسک‌های اجرایی: <strong>{STAGE49_UI_MM_TASKS_35.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">محورهای مرحله ۵۰: <strong>{STAGE50_REPORTING_AXES_16.length}</strong></div>
        </div>

        <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-2.5" data-testid="mm-stage50-preview-box">
          <div className="font-bold text-indigo-300 mb-1">
            پیش‌نمایش مرحله ۵۰ (RT-UI-MARKET-REPORTING-001) — {STAGE50_REPORTING_AXES_16.length} محور گزارش‌های تحلیلی بازار:
          </div>
          <div className="text-[10.5px] text-slate-300">{STAGE50_REPORTING_AXES_16.join(' • ')}</div>
        </div>
      </div>
    </div>
  );
};
