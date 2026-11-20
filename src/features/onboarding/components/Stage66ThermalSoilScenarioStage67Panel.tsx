/** @file src/features/onboarding/components/Stage66ThermalSoilScenarioStage67Panel.tsx — Stage 66 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import { evaluateThermalUrbanPressureScenarioAndIndexGuards } from '../services/environmentalSustainabilityEngine';
import {
  STAGE66_ACCEPTANCE_TESTS_24,
  STAGE66_COMPOSITE_INDICES_9,
  STAGE66_QUALITY_BADGES_5,
  STAGE66_REPORT_TYPES_11,
  STAGE66_UX_METRICS_10,
  STAGE67_DEMOGRAPHIC_PREVIEW_AXES_11,
  type Stage66EnvironmentProfile,
} from '../services/environmentalSustainabilityTypes';

interface Props {
  section: 'thermal_soil_pressure_compare' | 'scenarios_reports_quality_stage67';
  profiles: ReadonlyArray<Stage66EnvironmentProfile>;
  profile: Stage66EnvironmentProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage66ThermalSoilScenarioStage67Panel: React.FC<Props> = ({
  section,
  profiles,
  profile,
  onFeedbackFa,
}) => {
  const [discloseMissingComponent, setDiscloseMissingComponent] = useState<boolean>(false);
  const [isHypotheticalScenario, setIsHypotheticalScenario] = useState<boolean>(true);
  const [publicExportMode, setPublicExportMode] = useState<boolean>(true);
  const [interventionType, setInterventionType] = useState<string>('توسعه فضای سبز محلهای');
  const [proposedGreenAreaSqm, setProposedGreenAreaSqm] = useState<number>(3500);
  const [selectedReportType, setSelectedReportType] = useState<string>(STAGE66_REPORT_TYPES_11[0]);

  const guard = evaluateThermalUrbanPressureScenarioAndIndexGuards(
    profile,
    profiles.length,
    discloseMissingComponent,
    isHypotheticalScenario,
    publicExportMode,
  );

  if (section === 'thermal_soil_pressure_compare') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage66-thermal-soil-compare-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <span className="font-bold text-emerald-300">
            جزیره حرارتی (LST ≠ دمای هوا)، خاک، نفوذپذیری، فشار توسعه و مقایسه چندبعدی محله‌ها
          </span>
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={discloseMissingComponent}
              onChange={(e) => setDiscloseMissingComponent(e.target.checked)}
            />
            <span>افشای صریح مؤلفه مفقود در ۹ شاخص ترکیبی</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-200">
            <div className="font-bold text-rose-300">هشدار علمی جزیره حرارتی (LST) و محدودیت ماهواره در خاک</div>
            <p>{guard.thermalLstAndSoilLimitGuardFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-amber-300">نفوذپذیری و هم‌زمانی غیرعلّی فشار توسعه</div>
            <p className="text-slate-200">{guard.imperviousAndDevelopmentCausalityGuardFa}</p>
          </div>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1.5">
          <div className="font-bold text-emerald-300">
            مقایسه حداکثر ۴ محله و ممانعت از رتبه‌بندی کلی گمراه‌کننده
          </div>
          <p className="text-slate-200">{guard.neighborhoodCompareAndCompositeIndexGuardFa}</p>
          <div className="overflow-x-auto pt-1">
            <table className="w-full text-right text-[11px] text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-emerald-300">
                  <th className="py-1 px-2">محله</th>
                  <th className="py-1 px-2">PM2.5</th>
                  <th className="py-1 px-2">پوشش سبز ۱۴۰۵</th>
                  <th className="py-1 px-2">نفوذناپذیر</th>
                  <th className="py-1 px-2">LST</th>
                  <th className="py-1 px-2">داده ناقص / وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {profiles.slice(0, 4).map((row) => (
                  <tr key={row.zoneId} className="border-b border-slate-800/60">
                    <td className="py-1 px-2 font-bold text-white">{row.zoneNameFa}</td>
                    <td className="py-1 px-2">{row.pm25UgM3 ?? '--'}</td>
                    <td className="py-1 px-2">{row.vegetationPercentByYear['۱۴۰۵']}٪</td>
                    <td className="py-1 px-2">{row.imperviousSurfacePercent}٪</td>
                    <td className="py-1 px-2">{row.landSurfaceTempCelsius}°C</td>
                    <td className="py-1 px-2 text-amber-300">
                      {row.missingCompositeComponentNameFa ?? row.qualityBadge}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-300">
          ۹ شاخص ترکیبی شفاف: {STAGE66_COMPOSITE_INDICES_9.map((i) => `${i.titleFa} (${i.scaleFa})`).join(' • ')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage66-scenarios-reports-stage67-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="نوع مداخله سبز"
            value={interventionType}
            onChange={(e) => {
              setInterventionType(e.target.value);
              onFeedbackFa(`سناریوی فرضی «${e.target.value}» در محدوده ${profile.zoneNameFa} تنظیم شد.`);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          >
            <option value="توسعه فضای سبز محلهای">توسعه فضای سبز محله‌ای</option>
            <option value="افزایش پوشش درختی">افزایش پوشش درختی</option>
            <option value="اتصال لکههای سبز">اتصال لکه‌های سبز</option>
            <option value="احیای آبراههها">احیای آبراهه‌ها</option>
            <option value="افزایش سطوح نفوذپذیر">افزایش سطوح نفوذپذیر</option>
          </select>
          <NumericDraftInput
            aria-label="مساحت پیشنهادی فضای سبز (متر مربع)"
            value={proposedGreenAreaSqm}
            min={500}
            max={1000000}
            step={500}
            fallback={500}
            onValueChange={setProposedGreenAreaSqm}
            className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          />
          <select
            aria-label="قالب گزارش محیط‌زیستی"
            value={selectedReportType}
            onChange={(e) => {
              setSelectedReportType(e.target.value);
              onFeedbackFa(`قالب «${e.target.value}» با حفظ منشأ داده آماده خروجی است.`);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          >
            {STAGE66_REPORT_TYPES_11.map((rep) => (
              <option key={rep} value={rep}>
                {rep}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3 text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isHypotheticalScenario}
              onChange={(e) => setIsHypotheticalScenario(e.target.checked)}
            />
            <span>حفظ برچسب «سناریوی فرضی»</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={publicExportMode}
              onChange={(e) => setPublicExportMode(e.target.checked)}
            />
            <span>خروجی عمومی (حذف نقاط حساس)</span>
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-emerald-200 space-y-1">
        <div>{guard.hypotheticalScenarioAndPrivacyExportGuardFa}</div>
        <div className="text-[11px] text-slate-300">
          مداخله آزمایشی: «{interventionType}» به مساحت {proposedGreenAreaSqm.toLocaleString('fa-IR')} متر مربع | ۵ نشانگر کیفیت: {STAGE66_QUALITY_BADGES_5.join(' • ')} | معیار UX: {STAGE66_UX_METRICS_10.length}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-emerald-300">
            آزمون‌های پذیرش UI-ENV66 ({STAGE66_ACCEPTANCE_TESTS_24.length} معیار)
          </div>
          {STAGE66_ACCEPTANCE_TESTS_24.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-emerald-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-indigo-300">
            پیش‌نمایش مرحله ۶۷: RT-UI-URBAN-DEMOGRAPHIC-SOCIAL-INTELLIGENCE-001
          </div>
          {STAGE67_DEMOGRAPHIC_PREVIEW_AXES_11.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
