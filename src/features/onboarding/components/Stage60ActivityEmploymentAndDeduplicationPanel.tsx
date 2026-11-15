/** @file src/features/onboarding/components/Stage60ActivityEmploymentAndDeduplicationPanel.tsx — Stage 60 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateActivityEmploymentAndDeduplicationGuards } from '../services/urbanEconomyEngine';
import {
  STAGE60_GLOSSARY_16,
  STAGE60_MAP_LAYERS_10,
  STAGE60_SECTIONS_16,
  type NeighborhoodEconomyProfile,
} from '../services/urbanEconomyTypes';

interface Props {
  section: 'overview_and_density' | 'classification_and_employment';
  profiles: ReadonlyArray<NeighborhoodEconomyProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage60ActivityEmploymentAndDeduplicationPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [attemptMismatchedCompare, setAttemptMismatchedCompare] = useState<boolean>(true);
  const [attemptUntaggedJobsEstimate, setAttemptUntaggedJobsEstimate] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const guard = evaluateActivityEmploymentAndDeduplicationGuards(
    profile,
    attemptMismatchedCompare,
    attemptUntaggedJobsEstimate,
  );

  if (section === 'overview_and_density') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage60-overview-density-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`محدوده اقتصادی «${p.neighborhoodNameFa}» انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
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
              checked={attemptMismatchedCompare}
              onChange={(e) => setAttemptMismatchedCompare(e.target.checked)}
            />
            <span>آزمون مقایسه ناهم‌سنخ ثبت‌شده در برابر تأییدشده</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage60-registered-active">
            <div className="font-bold text-amber-300">تفکیک واحد ثبت‌شده، فعال تأییدشده و غیرفعال</div>
            <p className="text-slate-200">{guard.registeredVsActiveGuardFa}</p>
            <p className="text-[11px] text-sky-300">
              روش شاخص تنوع: {profile.diversityIndexMethodFa}
            </p>
          </div>
          <div
            className={`rounded-lg border p-3 space-y-1 ${
              attemptMismatchedCompare
                ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
            }`}
            data-testid="stage60-cross-compare-guard"
          >
            <div className="font-bold">اعتبارسنجی مقایسه بین‌محله‌ای</div>
            <p>{guard.crossZoneComparisonGuardFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
          <div className="font-bold text-amber-300">۱۶ بخش مرکز اقتصاد شهری، ۱۰ لایه نقشه و ۱۶ واژه استاندارد</div>
          <div className="text-[11px] text-slate-300">
            بخش‌ها: {STAGE60_SECTIONS_16.map((s) => `${s.id}.${s.titleFa}`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            لایه‌ها: {STAGE60_MAP_LAYERS_10.join(' • ')} | واژه‌نامه: {STAGE60_GLOSSARY_16.join('، ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage60-classification-employment-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <h4 className="font-bold text-amber-300">طبقه‌بندی فعالیت‌ها، منع شمارش چندباره شعب و تفکیک اشتغال</h4>
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={attemptUntaggedJobsEstimate}
            onChange={(e) => setAttemptUntaggedJobsEstimate(e.target.checked)}
          />
          <span>آزمون تولید برآورد بی‌برچسب اشتغال در نبود داده</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage60-dedup-guard">
          <div className="font-bold text-emerald-300">جلوگیری از شمارش چندباره (شعبه ≠ برند ≠ واحد)</div>
          <p className="text-slate-200">{guard.deduplicationGuardFa}</p>
        </div>
        <div
          className={`rounded-lg border p-3 space-y-1 ${
            profile.employmentRegisteredCount === null && attemptUntaggedJobsEstimate
              ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
              : 'border-slate-800 bg-slate-950/80 text-slate-200'
          }`}
          data-testid="stage60-employment-guard"
        >
          <div className="font-bold text-sky-300">تفکیک اشتغال از تعداد کسب‌وکار</div>
          <p>{guard.employmentSeparationGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
