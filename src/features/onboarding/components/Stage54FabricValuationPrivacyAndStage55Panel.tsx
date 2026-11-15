/** @file src/features/onboarding/components/Stage54FabricValuationPrivacyAndStage55Panel.tsx — Stage 54 Fabric, Valuation Bridge, Quality, Privacy & Stage 55 Preview */
import React, { useState } from 'react';
import {
  evaluateUrbanFabricDensityAndValuationBridge,
  runBuildingQualityAndPrivacyCheck,
} from '../services/builtEnvironmentEngine';
import {
  STAGE54_BE_COMPONENT_IDS_50,
  STAGE54_FORBIDDEN_ERRORS_25,
  STAGE54_UI_BE_TASK_IDS_46,
  STAGE54_UX_EVENTS_19,
  STAGE55_LIVABILITY_PREVIEW_AXES_25,
  type AreaDenominatorKind,
  type BuildingRecord,
  type BuiltEnvironmentViewerRole,
} from '../services/builtEnvironmentTypes';

interface Props {
  section: 'fabric_density_and_valuation' | 'quality_privacy_and_stage55';
  building: BuildingRecord;
  onFeedbackFa: (message: string) => void;
}

const DENOMINATORS: ReadonlyArray<AreaDenominatorKind> = [
  'مساحت کل محدوده (Gross Block Area)',
  'مساحت مجموع قطعات (Parcel Sum Area)',
  'مساحت خالص زمین ساختمانی (Net Plot Area)',
];

const ROLES: ReadonlyArray<BuiltEnvironmentViewerRole> = [
  'کاربر عمومی',
  'خریدار یا مستأجر',
  'تحلیل‌گر بازار',
  'شهرساز و متخصص',
  'مدیر داده و سامانه',
];

export const Stage54FabricValuationPrivacyAndStage55Panel: React.FC<Props> = ({
  section,
  building,
  onFeedbackFa,
}) => {
  const [denomA, setDenomA] = useState<AreaDenominatorKind>(DENOMINATORS[0]);
  const [denomB, setDenomB] = useState<AreaDenominatorKind>(DENOMINATORS[1]);

  const [role, setRole] = useState<BuiltEnvironmentViewerRole>('کاربر عمومی');
  const [facesAndPlatesRedacted, setFacesAndPlatesRedacted] = useState<boolean>(false);

  if (section === 'fabric_density_and_valuation') {
    const fabricResult = evaluateUrbanFabricDensityAndValuationBridge(denomA, denomB, 2.4, 3.1);

    return (
      <div className="space-y-4" data-testid="stage54-fabric-valuation-panel">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
          <h4 className="text-xs font-bold text-amber-300">کنترل همگنی مخرج مساحت در تحلیل بافت و اتصال به ارزش‌گذاری مرحله ۲۰</h4>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
            <label className="space-y-1">
              <span className="text-slate-400">مخرج محاسبه تراکم محله/بلوک الف:</span>
              <select
                value={denomA}
                onChange={(e) => {
                  setDenomA(e.target.value as AreaDenominatorKind);
                  onFeedbackFa('مخرج محاسبه محدوده الف تغییر کرد.');
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                {DENOMINATORS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-slate-400">مخرج محاسبه تراکم محله/بلوک ب:</span>
              <select
                value={denomB}
                onChange={(e) => {
                  setDenomB(e.target.value as AreaDenominatorKind);
                  onFeedbackFa('مخرج محاسبه محدوده ب تغییر کرد.');
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                {DENOMINATORS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>

          <div
            className={`rounded-lg border p-3 text-xs ${
              fabricResult.comparisonAllowed
                ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/25 text-rose-200'
            }`}
            data-testid="stage54-denominator-verdict"
          >
            {fabricResult.verdictFa}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">
            {fabricResult.indicatorDefinitionsFa}
          </div>

          <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-3 text-xs text-indigo-200">
            {fabricResult.stage20ValuationBridgeFa}
          </div>
        </div>
      </div>
    );
  }

  const audit = runBuildingQualityAndPrivacyCheck(building, role, facesAndPlatesRedacted);

  return (
    <div className="space-y-4" data-testid="stage54-quality-privacy-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-amber-300">ممیزی کیفیت ۴بخشی، کنترل نقش و حریم خصوصی تصاویر میدانی</h4>
          <select
            aria-label="انتخاب نقش کاربری مرحله ۵۴"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as BuiltEnvironmentViewerRole);
              onFeedbackFa(`سطح دسترسی برای نقش «${e.target.value}» ارزیابی شد.`);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-xs rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
          <input
            type="checkbox"
            checked={facesAndPlatesRedacted}
            onChange={(e) => setFacesAndPlatesRedacted(e.target.checked)}
          />
          <span>چهره افراد و پلاک‌های خصوصی در عکس میدانی پنهان‌سازی (Redact) شده‌اند</span>
        </label>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-slate-200" data-testid="stage54-role-privacy">
            {audit.roleAccessSummaryFa}
          </div>
          <div
            className={`rounded-lg border p-2.5 ${
              audit.fieldPhotoPublishAllowed
                ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/25 text-rose-200'
            }`}
            data-testid="stage54-photo-privacy"
          >
            {audit.fieldPhotoPublishAllowed
              ? 'انتشار تصویر میدانی مجاز است (پوشش چهره و پلاک تأیید شد).'
              : 'انتشار عمومی تصویر میدانی مسدود است تا چهره‌ها و پلاک‌ها محو/بررسی شوند.'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {audit.qualityAxes.map((axis) => (
            <div key={axis.axisFa} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-200">{axis.axisFa}</span>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  {axis.outcome}
                </span>
              </div>
              <div className="mt-1 text-slate-400">{axis.detailFa}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2 text-xs">
          <h5 className="font-bold text-rose-300">خطاهای ممنوعه مرحله ۵۴ ({STAGE54_FORBIDDEN_ERRORS_25.length} مورد کلیدی ثبت‌شده)</h5>
          <div className="text-slate-400 text-[11px]">
            شناسه کامپوننت‌ها: {STAGE54_BE_COMPONENT_IDS_50[0]} تا {STAGE54_BE_COMPONENT_IDS_50[STAGE54_BE_COMPONENT_IDS_50.length - 1]} ({STAGE54_BE_COMPONENT_IDS_50.length}) • رویداد UX: {STAGE54_UX_EVENTS_19.length} • نقشه اجرا: {STAGE54_UI_BE_TASK_IDS_46.length}
          </div>
          <ul className="list-disc pr-4 space-y-1 text-[11px] text-slate-300 max-h-36 overflow-y-auto">
            {STAGE54_FORBIDDEN_ERRORS_25.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3 space-y-2 text-xs" data-testid="stage55-preview-box">
          <div className="flex items-center justify-between">
            <span className="font-bold text-teal-300">پیش‌نمایش مرحله ۵۵: RT-UI-URBAN-LIVABILITY-001</span>
            <span className="rounded bg-teal-500/20 px-2 py-0.5 text-[10px] text-teal-200">۲۵ محور زیست‌پذیری</span>
          </div>
          <p className="text-[11px] text-teal-100/90 leading-5">
            کیفیت محیط مسکونی چندبعدی است و نباید با یک امتیاز کلی مبهم خلاصه شود؛ میان «وجود امکان»، «دسترسی واقعی» و «کیفیت خدمت» تمایز برقرار می‌شود.
          </p>
          <ul className="space-y-1 text-[11px] text-slate-300 max-h-28 overflow-y-auto">
            {STAGE55_LIVABILITY_PREVIEW_AXES_25.map((axis) => (
              <li key={axis}>{axis}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
