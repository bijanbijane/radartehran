/** @file src/features/onboarding/components/Stage69MixCompatibilityScenariosStage70Panel.tsx — Stage 69 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateLandUseMixCompatibilityConformanceAndScenarios } from '../services/landUseFunctionalStructureStage69Engine';
import {
  STAGE69_ACCEPTANCE_TESTS_40,
  STAGE69_EXPORT_FORMATS_5,
  STAGE69_MIX_BASES_4,
  STAGE69_REPORT_TYPES_10,
  STAGE69_UX_METRICS_9,
  STAGE70_DEMOGRAPHIC_PREVIEW_AXES_15,
  type Stage69LandUseDomainProfile,
  type Stage69MixCalculationBasis,
} from '../services/landUseFunctionalStructureStage69Types';

interface Props {
  section: 'mix_compatibility_conformance' | 'scenarios_realty_reports_stage70';
  profile: Stage69LandUseDomainProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage69MixCompatibilityScenariosStage70Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [mixBasis, setMixBasis] = useState<Stage69MixCalculationBasis>(profile.mixCalculationBasis);
  const [treatScenarioAsApprovedPlan, setTreatScenarioAsApprovedPlan] = useState<boolean>(false);
  const [publicExportSanitized, setPublicExportSanitized] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE69_REPORT_TYPES_10[0]);

  const guard = evaluateLandUseMixCompatibilityConformanceAndScenarios(
    profile,
    mixBasis,
    treatScenarioAsApprovedPlan,
    publicExportSanitized,
  );

  if (section === 'mix_compatibility_conformance') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage69-mix-compatibility-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <span className="font-bold text-emerald-300">انتخاب مبنای محاسبه اختلاط (۴ مبنای غیرقابل جایگزینی)</span>
          <select
            aria-label="مبنای محاسبه اختلاط کاربری"
            value={mixBasis}
            onChange={(e) => {
              const nextBasis = e.target.value as Stage69MixCalculationBasis;
              setMixBasis(nextBasis);
              onFeedbackFa(`مبنای محاسبه اختلاط روی «${nextBasis}» تنظیم شد.`);
            }}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          >
            {STAGE69_MIX_BASES_4.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1.5 text-emerald-100">
            <div className="font-bold text-emerald-300">شاخص اختلاط، Shannon Diversity و ماتریس سازگاری</div>
            <p>{guard.mixBasisDiversityAndCompatibilityGuardFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
            <div className="font-bold text-sky-300">تغییرات تاریخی بازه‌دار و اختلاف مصوب/واقعی ≠ تخلف</div>
            <p className="text-slate-200">{guard.historicalRangeAndConformanceVsViolationGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage69-scenarios-reports-stage70-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center gap-3 text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={treatScenarioAsApprovedPlan}
              onChange={(e) => setTreatScenarioAsApprovedPlan(e.target.checked)}
            />
            <span>نمایش خطای فرض سناریو به‌عنوان طرح مصوب</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={publicExportSanitized}
              onChange={(e) => setPublicExportSanitized(e.target.checked)}
            />
            <span>پاکسازی اطلاعات مالکیت و هویت اشخاص در گزارش عمومی</span>
          </label>
        </div>

        <select
          aria-label="قالب گزارش کاربری زمین"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`«${e.target.value}» با فرمتهای ${STAGE69_EXPORT_FORMATS_5.join(' / ')} آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE69_REPORT_TYPES_10.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-emerald-100 space-y-1">
        <div>{guard.threeRealtyValuesScenarioAndPrivacyGuardFa}</div>
        <div className="text-[11px] text-slate-300">
          گزارش انتخابی: «{selectedReport}» ({STAGE69_REPORT_TYPES_10.length} گزارش / {STAGE69_EXPORT_FORMATS_5.length} فرمت) • شاخص UX: {STAGE69_UX_METRICS_9.length}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-emerald-300">
            آزمونهای پذیرش RT-UI-LANDUSE-ACCEPTANCE-001 ({STAGE69_ACCEPTANCE_TESTS_40.length} آزمون)
          </div>
          {STAGE69_ACCEPTANCE_TESTS_40.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-emerald-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-cyan-300">
            پیش‌نمایش مرحله ۷۰: RT-UI-URBAN-DEMOGRAPHIC-SOCIAL-INTELLIGENCE-001
          </div>
          {STAGE70_DEMOGRAPHIC_PREVIEW_AXES_15.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
