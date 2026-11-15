/** @file src/features/onboarding/components/Stage49AlertsAndMonitorsPanel.tsx — Stage 49 Alert Center, Deduplication, Rule Builder & Active Monitors */
import React, { useState } from 'react';
import {
  classifyDuplicateOrRepostedListing,
  deduplicateAndGroupRelatedEvents,
  evaluateSavedSearchAndFilterIsolation,
  filterEventsByMapPolygonMonitor,
  manageAlertCorrectionAndMonitorLifecycle,
} from '../services/marketMonitoringEngine';
import {
  STAGE49_BOUNDARIES_8,
  type AlertFeedbackReport,
  type MarketAlertItemRecord,
  type MarketMonitorRuleRecord,
} from '../services/marketMonitoringTypes';

export const Stage49AlertsAndMonitorsPanel: React.FC<{
  section: 'alerts_center_detail' | 'active_monitors_rules';
  alerts: MarketAlertItemRecord[];
  monitors: MarketMonitorRuleRecord[];
  feedbacks: AlertFeedbackReport[];
  onUpdateAlert: (next: MarketAlertItemRecord) => void;
  onUpdateMonitor: (next: MarketMonitorRuleRecord) => void;
  onAddFeedback: (fb: AlertFeedbackReport) => void;
  onFeedbackFa: (msg: string) => void;
}> = ({ section, alerts, monitors, feedbacks, onUpdateAlert, onUpdateMonitor, onAddFeedback, onFeedbackFa }) => {
  const [correctionNoteFa, setCorrectionNoteFa] = useState('اصلاح مبلغ به ۲۲٬۱۰۰ م.ت پس از بررسی مجدد منبع');
  const [candidateLat, setCandidateLat] = useState(35.782);
  const [candidateLng, setCandidateLng] = useState(51.375);

  const grouped = deduplicateAndGroupRelatedEvents(alerts);
  const dupCheck = classifyDuplicateOrRepostedListing({
    newListingId: 'LIST-992',
    priorListingId: 'LIST-840',
    sameAreaAndFloor: true,
    sameGeoBlock: true,
  });
  const savedSearchIsolation = evaluateSavedSearchAndFilterIsolation({
    savedMonitor: monitors[1] || monitors[0],
    candidateListing: { areaSqm: 115, priceM: 21900, hoodFa: 'سعادت‌آباد' },
    requiredHoodFa: 'سعادت‌آباد',
    minSqm: 95,
    maxPriceM: 23000,
    userChangedMainSearchFilters: true,
    userChoseAction: 'none',
  });
  const polygonMonitor = monitors.find((m) => m.targetType === 'محدوده مکانی ترسیمی') || monitors[0];
  const polyCheck = filterEventsByMapPolygonMonitor({
    monitor: polygonMonitor,
    candidateEventLat: candidateLat,
    candidateEventLng: candidateLng,
    boundaryEditedByUser: false,
  });

  if (section === 'alerts_center_detail') {
    return (
      <div className="space-y-3" data-testid="mm-alerts-center-panel">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]" data-testid="mm-boundaries-strip">
          {STAGE49_BOUNDARIES_8.map((b) => (
            <div key={b.prevStageFa} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
              <div className="font-bold text-amber-300">{b.prevStageFa}</div>
              <div className="text-slate-300">{b.roleFa}</div>
            </div>
          ))}
        </div>

        {/* Grouped Alert Cards with Separated Change Time vs Observed Time & Asking !== Deal Price (MM-02..MM-11 · Tests 2, 3, 10) */}
        <div className="space-y-2.5" data-testid="mm-grouped-alerts-list">
          {grouped.groupedAlerts.map((alt) => (
            <div key={alt.alertId} className="rounded-xl border border-amber-500/40 bg-slate-950/90 p-3.5 space-y-2 text-[11px]" data-testid={`mm-alert-card-${alt.alertId}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-amber-900/70 px-2 py-0.5 font-bold text-amber-200">{alt.eventTypeFa}</span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-cyan-300">نوع معرفتی: {alt.epistemicKind}</span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-emerald-300">مفهوم قیمت: {alt.priceConcept}</span>
                  <span className="rounded bg-indigo-950/80 border border-indigo-700/50 px-2 py-0.5 text-indigo-200 font-bold">
                    {grouped.summaryBannerFa(alt.eventId)}
                  </span>
                </div>
                <span className="text-slate-400">وضعیت: <strong className="text-white">{alt.handlingStatus}</strong> · کیفیت: {alt.dataQualityStatus}</span>
              </div>

              <div className="font-bold text-white text-xs">{alt.subjectTitleFa}</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-[10.5px]">
                <div>مقدار قبلی: <strong className="text-slate-200">{alt.previousValueFa}</strong></div>
                <div>مقدار جدید: <strong className="text-emerald-300">{alt.newValueFa}</strong></div>
                <div>زمان تغییر در منبع: <strong className="text-amber-300">{alt.changeTimeFa}</strong></div>
                <div>زمان مشاهده در رادار: <strong className="text-cyan-300">{alt.observedTimeFa}</strong></div>
              </div>

              <div className="text-[10.5px] text-slate-300">{alt.triggerRuleReasonFa} · منبع: {alt.sourceNameFa}</div>

              {alt.correctionHistoryFa && alt.correctionHistoryFa.length > 0 && (
                <div data-testid="mm-correction-history-box" className="rounded border border-teal-500/40 bg-teal-950/30 p-2 text-[10px] text-teal-200">
                  سابقه اصلاح هشدار (بدون حذف سابقه قبلی — Test 14): {alt.correctionHistoryFa.join(' | ')}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input aria-label="توضیح اصلاح هشدار" value={correctionNoteFa} onChange={(e) => setCorrectionNoteFa(e.target.value)} className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white text-[10.5px]" />
                <button
                  type="button"
                  data-testid={`mm-confirm-correction-${alt.alertId}`}
                  onClick={() => {
                    const res = manageAlertCorrectionAndMonitorLifecycle({
                      alert: alt,
                      monitor: monitors[0],
                      confirmErrorCorrectionTextFa: correctionNoteFa,
                      feedbackCount: feedbacks.length,
                    });
                    onUpdateAlert(res.updatedAlert);
                    onAddFeedback(res.feedback);
                    onFeedbackFa(`گزارش خطای ${res.feedback.feedbackId} تأیید شد؛ هشدار اصلاح گردید و مقدار قبلی در تاریخچه حفظ شد.`);
                  }}
                  className="rounded bg-teal-700 px-2.5 py-1 font-bold text-white cursor-pointer"
                >
                  تأیید گزارش خطا و ثبت اصلاح (Tests 13–14)
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Duplicate Listing Detection Notice (MM-24 · Test 4) */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-[11px] flex flex-wrap items-center justify-between gap-2" data-testid="mm-duplicate-listing-card">
          <div>
            <span className="font-bold text-white">تشخیص آگهی تکراری و بازنشر احتمالی (MM-24 · Test 4): </span>
            <span className="text-amber-300 font-bold">{dupCheck.classification}</span> — <span className="text-slate-300">{dupCheck.noticeFa}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="mm-active-monitors-panel">
      {/* Active Monitors List with Pause vs Delete Rule Separation (MM-12..MM-20 · Tests 1, 5, 6, 16) */}
      <div className="space-y-2" data-testid="mm-monitors-list">
        {monitors.map((mon) => (
          <div key={mon.monitorId} className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 space-y-2 text-[11px]" data-testid={`mm-monitor-card-${mon.monitorId}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-white">{mon.titleFa}</span>
                <div className="text-[10px] text-slate-400">
                  نوع: {mon.targetType} · مرز: {mon.boundaryType} · حساسیت: {mon.sensitivity} · هیسترزیس غیرفعال‌سازی: {mon.hysteresisDeactivatePercent}٪
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-slate-800 px-2 py-0.5 font-bold text-amber-300">{mon.status}</span>
                <button
                  type="button"
                  data-testid={`mm-toggle-pause-${mon.monitorId}`}
                  onClick={() => {
                    const nextStatus = mon.status === 'متوقف‌شده' ? 'فعال' : 'متوقف‌شده';
                    onUpdateMonitor({ ...mon, status: nextStatus });
                    onFeedbackFa(`وضعیت پایش ${mon.monitorId} به «${nextStatus}» تغییر یافت (تاریخچه هشدارهای قبلی کاملاً حفظ شد — Test 16).`);
                  }}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white font-bold cursor-pointer"
                >
                  {mon.status === 'متوقف‌شده' ? 'فعال‌سازی مجدد' : 'توقف موقت (حفظ تاریخچه)'}
                </button>
              </div>
            </div>
            <div className="text-[10px] text-slate-300">
              آخرین بررسی منبع: {mon.lastCheckedAtFa} · وضعیت بررسی: <strong className="text-emerald-300">{mon.lastSourceCheckStatus}</strong>
            </div>
          </div>
        ))}
      </div>

      {/* Saved Search Filter Isolation (Test 6) & Drawn Map Polygon Boundary Guard (Test 9) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5" data-testid="mm-saved-search-isolation-card">
          <div className="font-bold text-white">حفاظت جست‌وجوی ذخیره‌شده از تغییر فیلتر اصلی (MM-20 · Tests 5–6):</div>
          <div className="text-emerald-300">{savedSearchIsolation.matchReasonFa}</div>
          <div className="text-[10px] text-slate-400">
            تغییر خودکار پایش قبلی بدون اطلاع کاربر: <strong>{savedSearchIsolation.existingMonitorMutatedSilently ? 'بله' : 'خیر (نیازمند انتخاب صریح بین به‌روزرسانی پایش فعلی یا ساخت پایش جدید)'}</strong>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5" data-testid="mm-map-polygon-monitor-card">
          <div className="font-bold text-white">پایش محدوده ترسیمی روی نقشه (MM-19 · Test 9):</div>
          <div className="flex items-center gap-2 text-[10px]">
            <label className="flex items-center gap-1 text-slate-300">
              <span>عرض جغرافیایی رویداد:</span>
              <input type="number" step="0.005" value={candidateLat} onChange={(e) => setCandidateLat(Number(e.target.value))} className="w-20 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-white" />
            </label>
            <button type="button" onClick={() => setCandidateLat(35.72)} className="rounded bg-slate-800 px-2 py-0.5 text-amber-300 cursor-pointer">تست نقطه خارج از چندضلعی</button>
          </div>
          <div className="text-[10.5px] text-cyan-200">
            داخل چندضلعی ترسیمی؟ <strong>{polyCheck.isInsideMonitoredPolygon ? 'بله (هشدار مجاز)' : 'خیر (خارج از محدوده — عدم ارسال هشدار اشتباه)'}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
