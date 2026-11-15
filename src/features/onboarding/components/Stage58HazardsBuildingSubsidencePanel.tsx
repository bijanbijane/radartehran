/** @file src/features/onboarding/components/Stage58HazardsBuildingSubsidencePanel.tsx — Stage 58 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import {
  evaluateHazardVsBuildingSeismicGuard,
  evaluateSubsidenceFloodFireSlopeAndEventsGuards,
} from '../services/urbanRiskEngine';
import {
  STAGE58_CONCEPTUAL_PILLARS_5,
  STAGE58_MAP_LAYERS_10,
  STAGE58_SECTIONS_14,
  type NeighborhoodRiskProfile,
} from '../services/urbanRiskTypes';

interface Props {
  section: 'overview_and_seismic' | 'multi_hazard_matrix';
  profiles: ReadonlyArray<NeighborhoodRiskProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage58HazardsBuildingSubsidencePanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [attemptUnifiedScore, setAttemptUnifiedScore] = useState<boolean>(true);
  const [publicRoleView, setPublicRoleView] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const seismicGuard = evaluateHazardVsBuildingSeismicGuard(profile, attemptUnifiedScore);
  const multiGuard = evaluateSubsidenceFloodFireSlopeAndEventsGuards(profile, publicRoleView);

  if (section === 'overview_and_seismic') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage58-overview-seismic-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`محدوده نمونه «${p.neighborhoodNameFa}» برای تحلیل ریسک انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-teal-400 bg-teal-500/20 text-teal-200 font-bold'
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
              checked={attemptUnifiedScore}
              onChange={(e) => setAttemptUnifiedScore(e.target.checked)}
            />
            <span>آزمون ادغام همه مخاطرات در یک نمره واحد</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" data-testid="stage58-five-pillars">
          {STAGE58_CONCEPTUAL_PILLARS_5.map((pillar) => (
            <div key={pillar.titleFa} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 space-y-1">
              <div className="font-bold text-teal-300">{pillar.titleFa}</div>
              <p className="text-[11px] text-slate-300 leading-5">{pillar.roleFa}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage58-hazard-vs-building">
            <div className="font-bold text-amber-300">تفکیک خطر لرزه‌ای زمین از آسیب‌پذیری ساختمان</div>
            <p className="text-slate-200">{seismicGuard.hazardVsVulnerabilitySeparationFa}</p>
            <p className="text-[11px] text-sky-300">نحوه نمایش در جدول: {seismicGuard.structuralDisplayModeFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage58-building-rule">
            <div className="font-bold text-indigo-300">قاعده داده سازه‌ای بنا ({profile.structuralTier})</div>
            <p className="text-slate-200">{seismicGuard.buildingAssessmentRuleFa}</p>
            <p className="text-[11px] text-slate-400">منشأ داده: {profile.provenanceKind}</p>
          </div>
        </div>

        <div
          className={`rounded-lg border p-3 ${
            attemptUnifiedScore
              ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
              : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
          }`}
          data-testid="stage58-unified-score-guard"
        >
          {seismicGuard.unifiedSingleScoreGuardFa}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
          <div className="font-bold text-teal-300">۱۴ بخش مرکز مخاطرات و ۱۰ لایه نقشه ریسک</div>
          <div className="text-[11px] text-slate-300">
            بخش‌ها: {STAGE58_SECTIONS_14.map((s) => `${s.id}.${s.titleFa}`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            لایه‌ها: {STAGE58_MAP_LAYERS_10.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage58-multi-hazard-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <h4 className="font-bold text-teal-300">فرونشست، سیلاب، آتش‌سوزی، ناپایداری شیب و رخدادهای انسان‌ساخت</h4>
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={publicRoleView}
            onChange={(e) => setPublicRoleView(e.target.checked)}
          />
          <span>حالت نمای عمومی (محدودیت انتشار جزئیات حساس زیرساخت/مراکز)</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage58-subsidence-guard">
          <div className="font-bold text-amber-300">تحلیل زمانی فرونشست (InSAR / پایش)</div>
          <p className="text-slate-200">{multiGuard.subsidenceBuildingGuardFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage58-flood-guard">
          <div className="font-bold text-sky-300">سیلاب، آب‌گرفتگی و مواجهه</div>
          <p className="text-slate-200">{multiGuard.floodNonRecordGuardFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage58-fire-guard">
          <div className="font-bold text-rose-300">آتش‌سوزی شهری و محدودیت انتشار امنیتی</div>
          <p className="text-slate-200">{multiGuard.firePrivacyAndMissingSystemGuardFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage58-slope-events-guard">
          <div className="font-bold text-emerald-300">رانش شیب و مرزبندی گزارش مردمی (ضد شایعه)</div>
          <p className="text-slate-200">{multiGuard.slopeInstabilityGuardFa}</p>
          <p className="text-[11px] text-amber-200">{multiGuard.otherEventsVerificationGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
