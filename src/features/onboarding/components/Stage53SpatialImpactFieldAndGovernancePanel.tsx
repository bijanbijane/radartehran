/** @file src/features/onboarding/components/Stage53SpatialImpactFieldAndGovernancePanel.tsx — Stage 53 Spatial Footprint, Market Causality Guard, Field Reports & Stage 54 Preview */
import React, { useState } from 'react';
import {
  evaluateSpatialFootprintImpactAndMarketGuard,
  submitFieldReportAndPrivacyGate,
} from '../services/urbanProjectsEngine';
import {
  STAGE53_CRITICAL_CONTROLS_5,
  STAGE53_UP_COMPONENT_IDS_50,
  STAGE53_UX_EVENTS_18,
  STAGE54_BUILT_ENV_AXES_25,
  type UrbanProjectRecord,
} from '../services/urbanProjectsTypes';

export const Stage53SpatialImpactFieldAndGovernancePanel: React.FC<{
  section: 'spatial_footprint_market_and_physical' | 'field_reports_privacy_and_stage54';
  projects: UrbanProjectRecord[];
  onFeedbackFa: (msg: string) => void;
}> = ({ section, projects, onFeedbackFa }) => {
  const [hasAttributionEvidence, setHasAttributionEvidence] = useState(false);
  const [facesRedacted, setFacesRedacted] = useState(true);
  const [userRole, setUserRole] = useState<'visitor' | 'logged_in_user' | 'data_admin'>('logged_in_user');

  const active = projects[0];
  const spatialGuard = evaluateSpatialFootprintImpactAndMarketGuard({
    project: active,
    relationKind: 'داخل محدوده اثر انتخابی',
    geometryOverlapPercent: 34,
    observedBuildingChangeNearby: true,
    hasIndependentAttributionEvidence: hasAttributionEvidence,
  });

  const fieldGate = submitFieldReportAndPrivacyGate({
    project: active,
    observationFa: 'مشاهده ماشین‌آلات عمرانی و گودبرداری در ضلع شمالی تقاطع پونک',
    interpretationFa: 'به نظر می‌رسد ایستگاه جدید مترو ماه آینده آماده می‌شود',
    facesAndPlatesRedacted: facesRedacted,
    userRole,
    documentToAccess: active.documents[1], // محرمانه
  });

  if (section === 'spatial_footprint_market_and_physical') {
    return (
      <div className="space-y-3 text-[11px]" data-testid="stage53-spatial-market-panel">
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-cyan-300 text-xs">
              ۵۳.۸.۴ و ۵۳.۱۴ تفکیک «محدوده اجرای پروژه» از «محدوده اثر تحلیلی» و گارد ملک/بازار (UP-11, UP-12, UP-35)
            </h4>
            <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAttributionEvidence}
                onChange={(e) => {
                  setHasAttributionEvidence(e.target.checked);
                  onFeedbackFa('وضعیت شواهد انتساب تغییر کالبدی به‌روزرسانی شد.');
                }}
              />
              شواهد مستقل انتساب ساخت‌وساز به پروژه (§۱۶.۴)
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="font-bold text-emerald-300">محدوده واقعی عملیات (Execution Footprint)</div>
              <div className="text-slate-200 mt-1">{active.executionFootprintFa}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="font-bold text-amber-300">محدوده اثر تحلیلی (Analytical Effect Zone)</div>
              <div className="text-slate-200 mt-1">{active.analyticalEffectZoneFa}</div>
            </div>
          </div>

          <div className="rounded border border-amber-500/30 bg-amber-950/20 p-2.5 text-[10.5px] text-amber-200 space-y-1" data-testid="up-market-disclaimer-box">
            <div><strong>هشدار تفسیری ملک (§۱۴.۵ و §۲۰.۳):</strong> {spatialGuard.interpretiveDisclaimerFa}</div>
            <div><strong>تطبیق کالبدی (§۱۶):</strong> {spatialGuard.physicalChangeNoteFa}</div>
            <div className="text-slate-300">
              ادعای قطعی رشد قیمت: <strong>{spatialGuard.claimsGuaranteedPriceIncrease ? 'بله' : 'خیر (ممنوع)'}</strong> ·
              تغییر خودکار کاربری با وجود طرح: <strong>{spatialGuard.zoningAutoChangedByNearbyPlan ? 'بله' : 'خیر'}</strong> ·
              برابری انطباق هندسی با پیشرفت فیزیکی: <strong>{spatialGuard.geometricAlignmentRepresentsPhysicalProgress ? 'بله' : 'خیر'}</strong>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-1.5">
          <div className="font-bold text-orange-300 text-xs">پنج کنترل حیاتی مرحله ۵۳ (§۳۳.۱)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[10px] text-slate-300">
            {STAGE53_CRITICAL_CONTROLS_5.map((ctrl, idx) => (
              <div key={ctrl} className="rounded border border-slate-800 bg-slate-900/60 p-2">
                {idx + 1}. {ctrl}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-[11px]" data-testid="stage53-field-stage54-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-emerald-300 text-xs">
            ۵۳.۱۳ و ۵۳.۲۹ گزارش میدانی شهروندان (مشاهده ≠ برداشت) و کنترل دسترسی اسناد محرمانه (UP-26..UP-29, UP-46)
          </h4>
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <label className="flex items-center gap-1 cursor-pointer text-slate-300">
              <input type="checkbox" checked={facesRedacted} onChange={(e) => setFacesRedacted(e.target.checked)} />
              پوشاندن چهره و پلاک
            </label>
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value as typeof userRole)}
              aria-label="نقش برای دسترسی به سند قرارداد"
              className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-white"
            >
              <option value="visitor">بازدیدکننده</option>
              <option value="logged_in_user">کاربر عادی</option>
              <option value="data_admin">مدیر داده</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
          <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5 space-y-1">
            <div className="font-bold text-white">تفکیک مشاهده و برداشت و اثر بر وضعیت رسمی</div>
            <div>تغییر خودکار وضعیت رسمی: <strong className="text-emerald-300">{fieldGate.mutatesOfficialStatusDirectly ? 'بله' : 'خیر (مسدود)'}</strong></div>
            <div className="text-slate-300">{fieldGate.privacyNoticeFa}</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5 space-y-1" data-testid="up-document-gate-box">
            <div className="font-bold text-white">کنترل دانلود سند محدود ({active.documents[1].docId})</div>
            <div>مجوز دریافت سند قرارداد محرمانه: <strong className={fieldGate.canDownloadDocument ? 'text-emerald-300' : 'text-rose-300'}>{fieldGate.canDownloadDocument ? 'مجاز' : 'مسدود'}</strong></div>
            <div className="text-slate-300">{fieldGate.documentAccessNoteFa}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-[10.5px]">
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">کامپوننت‌های UP: <strong>{STAGE53_UP_COMPONENT_IDS_50.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">رویدادهای UX: <strong>{STAGE53_UX_EVENTS_18.length}</strong></div>
          <div className="rounded border border-slate-800 bg-slate-900/60 p-2">کنترل حیاتی / تسک: <strong>5 / 40</strong></div>
        </div>

        <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-2.5" data-testid="up-stage54-preview-box">
          <div className="font-bold text-orange-300 mb-1">
            پیش‌نمایش مرحله ۵۴ (RT-UI-BUILT-ENVIRONMENT-MONITORING-001) — رصد ساختمان‌ها و بافت کالبدی:
          </div>
          <div className="text-[10.5px] text-slate-300">{STAGE54_BUILT_ENV_AXES_25.join(' • ')}</div>
        </div>
      </div>
    </div>
  );
};
