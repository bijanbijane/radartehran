/** @file src/features/onboarding/components/Stage59DensityHouseholdAndPrivacyPanel.tsx — Stage 59 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import {
  evaluateDensityAndHouseholdGuards,
  evaluatePrivacyMigrationDayNightAndSocialGuards,
} from '../services/urbanDemographicsEngine';
import {
  STAGE59_GLOSSARY_12,
  STAGE59_MAP_LAYERS_10,
  STAGE59_SECTIONS_15,
  type NeighborhoodDemographicsProfile,
} from '../services/urbanDemographicsTypes';

interface Props {
  section: 'overview_density_household' | 'migration_daynight_privacy';
  profiles: ReadonlyArray<NeighborhoodDemographicsProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage59DensityHouseholdAndPrivacyPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [attemptExtrapolation, setAttemptExtrapolation] = useState<boolean>(true);
  const [combineSmallFilters, setCombineSmallFilters] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const densityGuard = evaluateDensityAndHouseholdGuards(
    profile,
    profile.districtAvgRefYearFa,
    attemptExtrapolation,
  );
  const privacyGuard = evaluatePrivacyMigrationDayNightAndSocialGuards(profile, combineSmallFilters);

  if (section === 'overview_density_household') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage59-density-household-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`واحد آماری «${p.neighborhoodNameFa}» انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.neighborhoodNameFa}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={attemptExtrapolation}
              onChange={(e) => setAttemptExtrapolation(e.target.checked)}
            />
            <span>آزمون تعمیم آمار کلان منطقه به محله</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage59-density-separation">
            <div className="font-bold text-indigo-300">تفکیک تراکم ناخالص، خالص سکونتی و ساختمانی</div>
            <p className="text-slate-200">{densityGuard.densitySeparationFa}</p>
            <p className="text-[11px] text-sky-300">ترکیب سنی: {profile.ageSharesFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage59-household-separation">
            <div className="font-bold text-amber-300">تفکیک ساختمان، واحد مسکونی، خانوار و جمعیت</div>
            <p className="text-slate-200">{densityGuard.householdVsUnitDistinctionFa}</p>
            <p className="text-[11px] text-slate-400">تعریف واحد خالی: {profile.vacancyDefinitionSourceFa}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200" data-testid="stage59-year-mismatch">
            {densityGuard.yearMismatchGuardFa}
          </div>
          <div
            className={`rounded-lg border p-3 ${
              attemptExtrapolation
                ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
            }`}
            data-testid="stage59-extrapolation-guard"
          >
            {densityGuard.districtExtrapolationGuardFa}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
          <div className="font-bold text-indigo-300">۱۵ بخش مرکز جمعیت، ۱۰ لایه نقشه و ۱۲ واژه استاندارد</div>
          <div className="text-[11px] text-slate-300">
            بخش‌ها: {STAGE59_SECTIONS_15.map((s) => `${s.id}.${s.titleFa}`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            لایه‌ها: {STAGE59_MAP_LAYERS_10.join(' • ')} | واژه‌نامه: {STAGE59_GLOSSARY_12.join('، ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage59-privacy-migration-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <h4 className="font-bold text-indigo-300">محرمانگی بازشناسایی، مهاجرت تجمیعی، جمعیت روز/شب و منع برچسب‌گذاری</h4>
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={combineSmallFilters}
            onChange={(e) => setCombineSmallFilters(e.target.checked)}
          />
          <span>آزمون ترکیب چند فیلتر برای استخراج گروه خرد</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/25 p-3 space-y-1 text-rose-200" data-testid="stage59-privacy-guard">
          <div className="font-bold text-rose-300">حریم خصوصی و حداقل آستانه واحد آماری</div>
          <p>{privacyGuard.privacyThresholdGuardFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage59-daynight-guard">
          <div className="font-bold text-sky-300">جمعیت روزانه و شبانه (برآوردی ≠ شمارش موبایل)</div>
          <p className="text-slate-200">{privacyGuard.dayNightAccuracyGuardFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage59-migration-boundary">
          <div className="font-bold text-amber-300">تغییر جمعیت ≠ مهاجرت مستقیم + تغییر مرز آماری</div>
          <p className="text-slate-200">{privacyGuard.migrationCausalityGuardFa}</p>
          <p className="text-[11px] text-amber-200">{privacyGuard.boundaryHistoryGuardFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage59-antistigma-guard">
          <div className="font-bold text-emerald-300">جلوگیری از برچسب‌گذاری اجتماعی محله‌ها</div>
          <p className="text-slate-200">{privacyGuard.antiStigmatizationRuleFa}</p>
        </div>
      </div>
    </div>
  );
};
