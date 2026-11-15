/** @file src/features/onboarding/components/RadarMotionLabSubpanel.tsx — Stage 35 (RT-UI-MOTION-001) Interactive Radar Motion Lab */
import React, { useState } from 'react';
import { Activity, Layers, Navigation, Play, RotateCcw, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  DOMAIN_HONEST_FEEDBACK_CONTRACTS,
  MapMotionArbitrator,
  RADAR_MOTION_EASING,
  RADAR_MOTION_TOKENS,
  resolveEffectiveTokenDuration,
  resolveMapLayerTransitionFeedback,
  resolveMotionPolicy,
  transitionSaveButtonState,
  type MotionPreferenceMode,
  type SaveButtonFeedbackState,
} from '../services/motionSystemEngine';

export interface RadarMotionLabSubpanelProps {
  onAnnounceStatus: (msgFa: string) => void;
}

export const RadarMotionLabSubpanel: React.FC<RadarMotionLabSubpanelProps> = ({ onAnnounceStatus }) => {
  const [motionMode, setMotionMode] = useState<MotionPreferenceMode>('standard');
  const [osReduced, setOsReduced] = useState(false);
  const [saveState, setSaveState] = useState<SaveButtonFeedbackState>({
    phase: 'idle',
    isSavedConfirmed: false,
    labelFa: 'ذخیره',
    preventDuplicateClick: false,
    toastFeedbackFa: null,
  });
  const [arbitrator] = useState(() => new MapMotionArbitrator());
  const [flightRecord, setFlightRecord] = useState(() =>
    arbitrator.requestNeighborhoodPan({
      neighborhoodId: 'saadat-abad',
      nameFa: 'سعادت‌آباد',
      userIsDraggingMap: false,
      dataReady: true,
      policy: resolveMotionPolicy('standard', false),
    }),
  );
  const [layerPhase, setLayerPhase] = useState<'loading' | 'loaded_with_data' | 'loaded_empty' | 'error'>('loaded_with_data');

  const policy = resolveMotionPolicy(motionMode, osReduced);
  const layerFeedback = resolveMapLayerTransitionFeedback({
    layerId: 'sqm_price_heatmap',
    layerTitleFa: 'پهنه قیمت هر مترمربع بازار',
    phase: layerPhase,
    updatedAtFa: 'پاییز ۱۴۰۵',
  });

  const handleSaveLifecycle = (step: 'click_request' | 'server_confirm_success' | 'server_fail_error') => {
    const next = transitionSaveButtonState(saveState.isSavedConfirmed, step);
    setSaveState(next);
    onAnnounceStatus(next.toastFeedbackFa ?? `وضعیت دکمه ذخیره: ${next.labelFa}`);
  };

  const triggerMapPan = (hoodId: string, nameFa: string) => {
    const rec = arbitrator.requestNeighborhoodPan({
      neighborhoodId: hoodId,
      nameFa,
      userIsDraggingMap: false,
      dataReady: true,
      policy,
    });
    setFlightRecord(rec);
    onAnnounceStatus(
      rec.cancelledPreviousRequestId
        ? `حرکت قبلی (#${toPersianNum(rec.cancelledPreviousRequestId)}) لغو شد؛ انتقال نقشه به «${nameFa}» در ${toPersianNum(rec.durationMs)}ms.`
        : `انتقال مرکز نقشه به «${nameFa}» در ${toPersianNum(rec.durationMs)}ms.`,
    );
  };

  return (
    <div className="space-y-4" data-testid="stage-35-motion-lab-panel">
      {/* Motion Policy & OS Reduced Motion Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-[10px] bg-[#F6F8F6] dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-[#182522] dark:text-white">سیاست حرکت (`/account/preferences/display`):</span>
          {(['standard', 'no_decorative', 'reduced'] as const).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`motion-mode-${m}`}
              onClick={() => {
                setMotionMode(m);
                onAnnounceStatus(`حالت سیستم حرکت به «${m}» تغییر یافت.`);
              }}
              className={`px-3 py-1.5 min-h-[40px] rounded-[8px] font-bold cursor-pointer ${
                motionMode === m ? 'bg-[#176B63] text-white' : 'bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700'
              }`}
            >
              {m === 'standard' ? 'حرکت عادی' : m === 'no_decorative' ? 'بدون حرکت تزئینی' : 'حرکت محدود (Reduced)'}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-testid="toggle-os-reduced-motion"
          aria-pressed={osReduced}
          onClick={() => {
            const next = !osReduced;
            setOsReduced(next);
            onAnnounceStatus(next ? 'کاهش حرکت سیستم‌عامل (prefers-reduced-motion) فعال شد.' : 'کاهش حرکت سیستم‌عامل غیرفعال شد.');
          }}
          className={`px-3 py-1.5 min-h-[40px] rounded-[8px] font-bold cursor-pointer ${
            osReduced ? 'bg-amber-700 text-white' : 'bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700'
          }`}
        >
          شبیه‌ساز سیستم‌عامل (`prefers-reduced-motion`: {osReduced ? 'فعال' : 'خاموش'})
        </button>
      </div>

      {/* Motion Tokens Table + Save Button Server-Confirmed State Machine */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-2.5">
          <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-[#176B63]" />
            <span>توکن‌های استاندارد زمان‌بندی و منحنی حرکت (Compositor-Only)</span>
          </h3>
          <table className="w-full text-right border-collapse">
            <caption className="sr-only">جدول توکن‌های حرکت و زمان‌بندی رادار تهران</caption>
            <thead>
              <tr className="border-b border-[#DCE3DF] dark:border-slate-700 text-[#586760]">
                <th scope="col" className="py-1.5">توکن حرکت</th>
                <th scope="col" className="py-1.5">مدت مؤثر</th>
                <th scope="col" className="py-1.5">ویژگی مجاز CSS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE3DF]/60 dark:divide-slate-800 tabular-nums">
              {RADAR_MOTION_TOKENS.map((tok) => {
                const effMs = resolveEffectiveTokenDuration(tok, policy);
                return (
                  <tr key={tok.id}>
                    <td className="py-1.5 font-bold text-[#182522] dark:text-white">{tok.purposeFa}</td>
                    <td className="py-1.5 font-mono">{toPersianNum(effMs)}ms</td>
                    <td className="py-1.5 font-mono text-[11px]">{tok.cssPropertiesAllowed.join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-[11px] text-[#586760] font-mono" dir="ltr">
            standard: {RADAR_MOTION_EASING.standard} · enter: {RADAR_MOTION_EASING.enter}
          </div>
        </div>

        <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#176B63]" />
            <span>ماشین وضعیت دکمه ذخیره (ممنوعیت جعل موفقیت پیش از تأیید سرور)</span>
          </h3>
          <div className="p-3 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-bold text-[#182522] dark:text-white">
                برچسب فعلی دکمه: <span data-testid="motion-save-btn-label" className="text-[#176B63] dark:text-emerald-400">«{saveState.labelFa}»</span>
              </div>
              <div className="text-[11px] text-[#586760]">
                مرحله: <strong>{saveState.phase}</strong> · قفل ارسال تکراری: <strong>{saveState.preventDuplicateClick ? 'فعال' : 'آزاد'}</strong>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                data-testid="sim-save-request-btn"
                disabled={saveState.preventDuplicateClick}
                onClick={() => handleSaveLifecycle('click_request')}
                className="px-2.5 py-1.5 rounded bg-[#176B63] text-white font-bold disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-3 h-3 inline ml-1" />۱. ارسال درخواست
              </button>
              <button
                type="button"
                data-testid="sim-save-confirm-btn"
                onClick={() => handleSaveLifecycle('server_confirm_success')}
                className="px-2.5 py-1.5 rounded bg-emerald-700 text-white font-bold cursor-pointer"
              >
                ۲. تأیید سرور (Success)
              </button>
              <button
                type="button"
                data-testid="sim-save-error-btn"
                onClick={() => handleSaveLifecycle('server_fail_error')}
                className="px-2.5 py-1.5 rounded bg-rose-700 text-white font-bold cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 inline ml-1" />خطای سرور (بازگشت)
              </button>
            </div>
          </div>
          {saveState.toastFeedbackFa && (
            <div className="p-2 rounded bg-[#EAF3F0] dark:bg-emerald-950/40 text-[#14534E] dark:text-emerald-200 font-bold">
              پیام بازخورد: {saveState.toastFeedbackFa}
            </div>
          )}
          <div className="text-[11px] text-[#586760] space-y-0.5">
            <div>• بازخورد اصلاح داده جامعه: «{DOMAIN_HONEST_FEEDBACK_CONTRACTS.communityCorrectionSubmittedFa}»</div>
            <div>• بازخورد خطای ترسیم محدوده: «{DOMAIN_HONEST_FEEDBACK_CONTRACTS.invalidSpatialPolygonFa}»</div>
          </div>
        </div>
      </div>

      {/* Scenario 44 & 46: Map Camera Race Cancellation + Layer Empty/Active Feedback */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-2.5">
          <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-[#176B63]" />
            <span>جلوگیری از رقابت حرکت‌های نقشه (لغو خودکار مقصد قبلی)</span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'saadat-abad', nameFa: 'سعادت‌آباد' },
              { id: 'punak', nameFa: 'پونک' },
              { id: 'narmak', nameFa: 'نارمک' },
            ].map((h) => (
              <button
                key={h.id}
                type="button"
                data-testid={`pan-hood-${h.id}`}
                onClick={() => triggerMapPan(h.id, h.nameFa)}
                className="px-3 py-1.5 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 font-bold cursor-pointer"
              >
                انتخاب سریع «{h.nameFa}»
              </button>
            ))}
          </div>
          <div className="p-2.5 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 tabular-nums">
            مقصد معتبر فعلی: <strong>{flightRecord.targetNameFa}</strong> (درخواست #{toPersianNum(flightRecord.requestId)}) · مدت انتقال: <strong>{toPersianNum(flightRecord.durationMs)}ms</strong> · لغو درخواست قبلی: <strong>{flightRecord.cancelledPreviousRequestId ? `#${toPersianNum(flightRecord.cancelledPreviousRequestId)}` : 'ندارد'}</strong>
          </div>
        </div>

        <div className="p-4 rounded-[12px] border border-[#DCE3DF] dark:border-slate-800 space-y-2.5">
          <h3 className="text-sm font-black text-[#182522] dark:text-white flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[#176B63]" />
            <span>سناریوی تغییر لایه بازار و وضعیت بدون داده (بند ۴۶)</span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {(['loading', 'loaded_with_data', 'loaded_empty', 'error'] as const).map((ph) => (
              <button
                key={ph}
                type="button"
                data-testid={`layer-phase-${ph}`}
                onClick={() => {
                  setLayerPhase(ph);
                  onAnnounceStatus(resolveMapLayerTransitionFeedback({ layerId: 'sqm_price_heatmap', layerTitleFa: 'پهنه قیمت بازار', phase: ph }).statusMessageFa);
                }}
                className={`px-2.5 py-1.5 rounded-[8px] font-bold cursor-pointer ${
                  layerPhase === ph ? 'bg-[#176B63] text-white' : 'bg-[#F6F8F6] dark:bg-slate-800'
                }`}
              >
                {ph === 'loading' ? 'در حال دریافت' : ph === 'loaded_with_data' ? 'داده معتبر' : ph === 'loaded_empty' ? 'بدون داده' : 'خطای شبکه'}
              </button>
            ))}
          </div>
          <div className="p-2.5 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 font-bold text-[#182522] dark:text-white">
            وضعیت لایه: {layerFeedback.statusMessageFa} · نمایش Legend: {layerFeedback.legendVisible ? 'فعال' : 'مخفی (جلوگیری از رنگ قدیمی)'}
          </div>
        </div>
      </div>
    </div>
  );
};
