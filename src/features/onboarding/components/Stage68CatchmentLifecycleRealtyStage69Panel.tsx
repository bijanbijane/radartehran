/** @file src/features/onboarding/components/Stage68CatchmentLifecycleRealtyStage69Panel.tsx — Stage 68 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateCatchmentLifecycleRealtyCapacityAndGovernance } from '../services/economicIntelligenceStage68Engine';
import {
  STAGE68_ACCEPTANCE_TESTS_25,
  STAGE68_REPORT_TYPES_15,
  STAGE68_UX_METRICS_10,
  STAGE69_LANDUSE_PREVIEW_AXES_20,
  type Stage68EconomicZoneProfile,
} from '../services/economicIntelligenceStage68Types';

interface Props {
  section: 'catchment_lifecycle_realty_capacity' | 'compare_reports_privacy_stage69';
  profiles: ReadonlyArray<Stage68EconomicZoneProfile>;
  profile: Stage68EconomicZoneProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage68CatchmentLifecycleRealtyStage69Panel: React.FC<Props> = ({
  section,
  profiles,
  profile,
  onFeedbackFa,
}) => {
  const [discloseFormula, setDiscloseFormula] = useState<boolean>(false);
  const [publicExportMode, setPublicExportMode] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE68_REPORT_TYPES_15[0]);

  const guard = evaluateCatchmentLifecycleRealtyCapacityAndGovernance(
    profile,
    profiles.length,
    discloseFormula,
    publicExportMode,
  );

  if (section === 'catchment_lifecycle_realty_capacity') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage68-catchment-lifecycle-panel">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1.5 text-amber-100">
            <div className="font-bold text-amber-300">محدوده جذب شبکه‌ای و تفکیک مراجعه واقعی از برآوردی</div>
            <p>{guard.catchmentNetworkAndFootfallGuardFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
            <div className="font-bold text-sky-300">چرخه حیات کسب‌وکار (تغییر نام ≠ افتتاح / گزارش کاربر ≠ تعطیلی قطعی)</div>
            <p className="text-slate-200">{guard.lifecycleVerificationAndDedupGuardFa}</p>
          </div>
        </div>

        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-200">
          <div className="font-bold text-rose-300">همبستگی قیمت املاک تجاری و جداسازی «ظرفیت اقتصادی» از «مجوز ضوابط»</div>
          <p>{guard.realtyCausalityAndZoningPermitGuardFa}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage68-compare-privacy-stage69-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center gap-3 text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={discloseFormula}
              onChange={(e) => setDiscloseFormula(e.target.checked)}
            />
            <span>افشای فرمول، وزن و دامنه در شاخص ترکیبی</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={publicExportMode}
              onChange={(e) => setPublicExportMode(e.target.checked)}
            />
            <span>حذف داده محرمانه تجاری و هویت مالک در خروجی عمومی</span>
          </label>
        </div>

        <select
          aria-label="قالب گزارش اقتصادی"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با حفظ منشأ داده و محدودیت انتشار آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE68_REPORT_TYPES_15.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-100 space-y-1">
        <div>{guard.compareTransparentCompositeAndPrivacyGuardFa}</div>
        <div className="text-[11px] text-slate-300">
          قالب گزارش: «{selectedReport}» ({STAGE68_REPORT_TYPES_15.length} گزارش) • معیار UX: {STAGE68_UX_METRICS_10.length}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-amber-300">
            آزمون‌های پذیرش UI-ECO68 ({STAGE68_ACCEPTANCE_TESTS_25.length} معیار)
          </div>
          {STAGE68_ACCEPTANCE_TESTS_25.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-amber-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-teal-300">
            پیش‌نمایش مرحله ۶۹: RT-UI-URBAN-LANDUSE-FUNCTIONAL-STRUCTURE-001
          </div>
          {STAGE69_LANDUSE_PREVIEW_AXES_20.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
