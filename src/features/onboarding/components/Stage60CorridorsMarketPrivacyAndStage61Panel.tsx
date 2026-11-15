/** @file src/features/onboarding/components/Stage60CorridorsMarketPrivacyAndStage61Panel.tsx — Stage 60 Tabs 3 & 4 + Stage 61 Preview */
import React, { useState } from 'react';
import { evaluateCorridorAccessMarketAndDynamicGuards } from '../services/urbanEconomyEngine';
import {
  STAGE60_ACCEPTANCE_TESTS_28,
  STAGE60_UX_EVENTS_12,
  STAGE61_LANDUSE_PREVIEW_AXES_15,
  type EconomicScenarioLifecycleKind,
  type NeighborhoodEconomyProfile,
} from '../services/urbanEconomyTypes';

interface Props {
  section: 'corridors_access_and_market' | 'scenarios_uieco_and_stage61';
  profile: NeighborhoodEconomyProfile;
  onFeedbackFa: (message: string) => void;
}

const SCENARIO_KINDS: ReadonlyArray<EconomicScenarioLifecycleKind> = [
  'وضعیت مشاهده‌شده',
  'روند تاریخی',
  'برآورد مدل',
  'سناریوی فرضی',
  'برنامه مصوب',
  'پروژه در حال اجرا',
  'نتیجه مشاهده‌شده پس از اجرا',
];

export const Stage60CorridorsMarketPrivacyAndStage61Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [scenarioKind, setScenarioKind] = useState<EconomicScenarioLifecycleKind>('سناریوی فرضی');
  const [publicPrivacyMode, setPublicPrivacyMode] = useState<boolean>(true);

  const guard = evaluateCorridorAccessMarketAndDynamicGuards(profile, scenarioKind, publicPrivacyMode);

  if (section === 'corridors_access_and_market') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage60-corridors-market-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <h4 className="font-bold text-amber-300">
            محورهای تجاری، دسترسی شبکه‌ای، پویایی داده، بازار املاک و حریم خصوصی
          </h4>
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={publicPrivacyMode}
              onChange={(e) => setPublicPrivacyMode(e.target.checked)}
            />
            <span>حالت نمای عمومی (منع پرونده‌سازی اشخاص و داده‌های مالی محرمانه)</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage60-coverage-guard">
            <div className="font-bold text-amber-300">تفکیک تغییر پوشش داده از رشد واقعی بازار</div>
            <p className="text-slate-200">{guard.coverageVsRealGrowthGuardFa}</p>
            <p className="text-[11px] text-sky-300">{profile.corridorType}: {profile.corridorSegmentsNoteFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage60-access-guard">
            <div className="font-bold text-emerald-300">دسترسی شبکه‌ای و مرز مکان‌یابی (≠ تضمین سود/مجوز)</div>
            <p className="text-slate-200">{guard.networkAccessibilityAndPlacementGuardFa}</p>
          </div>
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-200" data-testid="stage60-market-causal">
            <div className="font-bold text-rose-300">اقتصاد و بازار املاک (همبستگی ≠ علیت)</div>
            <p>{guard.propertyMarketCausalGuardFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage60-privacy-boundary">
            <div className="font-bold text-indigo-300">حریم خصوصی و مرزبندی با بازار خدمات حرفه‌ای (۴۳)</div>
            <p className="text-slate-200">{guard.moduleSeparationAndPrivacyGuardFa}</p>
            {profile.hasSourceConflict && (
              <p className="text-[11px] text-amber-300">تعارض منبع ثبت‌شده: {profile.sourceConflictDetailFa}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage60-scenarios-stage61-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-amber-300">مرزبندی سناریوسازی اقتصادی و آزمون‌های پذیرش UI-ECO</h4>
          <select
            aria-label="نوع وضعیت سناریوی اقتصادی"
            value={scenarioKind}
            onChange={(e) => {
              const kind = e.target.value as EconomicScenarioLifecycleKind;
              setScenarioKind(kind);
              onFeedbackFa(`برچسب وضعیت سناریوی اقتصادی روی «${kind}» تنظیم شد.`);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
          >
            {SCENARIO_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200" data-testid="stage60-scenario-guard">
          {guard.scenarioLifecycleGuardFa}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-amber-300">
            آزمون‌های پذیرش UI-ECO ({STAGE60_ACCEPTANCE_TESTS_28.length}) • رویداد UX: {STAGE60_UX_EVENTS_12.length}
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] text-slate-300">
            {STAGE60_ACCEPTANCE_TESTS_28.map((item) => (
              <div key={item.id}>
                <span className="font-mono text-amber-400">{item.id}:</span> {item.checkFa}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-2" data-testid="stage61-preview-box">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-cyan-300">پیش‌نمایش مرحله ۶۱: RT-UI-URBAN-LANDUSE-FUNCTIONAL-001</span>
            <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-200">۱۵ محور کاربری زمین</span>
          </div>
          <p className="text-[11px] text-cyan-100/90">
            اصل محوری مرحله ۶۱: کاربری مصوب، کاربری ثبت‌شده و استفاده واقعی از زمین سه لایه مستقل‌اند و اختلاف میان آن‌ها باید بدون جایگزینی یک‌جانبه به‌عنوان موضوع تحلیل نمایش داده شود.
          </p>
          <ul className="space-y-1 text-[11px] text-slate-200 max-h-28 overflow-y-auto">
            {STAGE61_LANDUSE_PREVIEW_AXES_15.map((axis) => (
              <li key={axis}>{axis}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
