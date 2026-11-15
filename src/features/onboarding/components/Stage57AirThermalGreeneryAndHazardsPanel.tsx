/** @file src/features/onboarding/components/Stage57AirThermalGreeneryAndHazardsPanel.tsx — Stage 57 Air, Thermal, Greenery & Water/Soil Panel */
import React, { useState } from 'react';
import {
  evaluateAirThermalAndNoiseGuards,
  evaluateGreeneryHazardsModerationAndMarketGuard,
} from '../services/urbanEnvironmentEngine';
import {
  STAGE57_MAP_LAYERS_10,
  STAGE57_SECTIONS_13,
  type StreetEnvironmentProfile,
} from '../services/urbanEnvironmentTypes';

interface Props {
  section: 'air_noise_and_thermal' | 'greenery_water_and_soil';
  profiles: ReadonlyArray<StreetEnvironmentProfile>;
  onFeedbackFa: (message: string) => void;
}

export const Stage57AirThermalGreeneryAndHazardsPanel: React.FC<Props> = ({
  section,
  profiles,
  onFeedbackFa,
}) => {
  const [selectedId, setSelectedId] = useState<string>(profiles[0]?.streetZoneId ?? 'yousefabad-highway-edge');
  const [citizenApproved, setCitizenApproved] = useState<boolean>(false);
  const [attemptOpaqueScore, setAttemptOpaqueScore] = useState<boolean>(true);

  const profile = profiles.find((p) => p.streetZoneId === selectedId) ?? profiles[0];
  if (!profile) return null;

  const airGuard = evaluateAirThermalAndNoiseGuards(profile);
  const greenHazardGuard = evaluateGreeneryHazardsModerationAndMarketGuard(
    profile,
    citizenApproved,
    attemptOpaqueScore,
  );

  if (section === 'air_noise_and_thermal') {
    return (
      <div className="space-y-4" data-testid="stage57-air-thermal-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.streetZoneId}
                type="button"
                onClick={() => {
                  setSelectedId(p.streetZoneId);
                  onFeedbackFa(`کریدور/معبر نمونه «${p.streetCorridorFa}» در محله ${p.neighborhoodNameFa} انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs cursor-pointer ${
                  p.streetZoneId === profile.streetZoneId
                    ? 'border-lime-400 bg-lime-500/20 text-lime-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.streetCorridorFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">دو معبر در یک محله می‌توانند شرایط محیطی متفاوت داشته باشند</span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage57-air-status">
            <div className="font-bold text-lime-300">کیفیت هوا و تفکیک نوع داده</div>
            <p className="text-slate-200">{airGuard.airStatusTextFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage57-thermal-status">
            <div className="font-bold text-amber-300">دمای هوا در برابر دمای سطح زمین (LST)</div>
            <p className="text-slate-200">{airGuard.thermalSeparationFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-sky-300">صدا و محدودیت فاصله بزرگراه</div>
            <p className="text-slate-200">{airGuard.noiseCaveatFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage57-temporal-status">
            <div className="font-bold text-indigo-300">تمایز زمان اندازه‌گیری از ورود داده</div>
            <p className="text-slate-200">{airGuard.temporalIntegrityFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
          <div className="font-bold text-lime-300 mb-1.5">۱۳ بخش ماژول و ۱۰ لایه نقشه محیط‌زیست</div>
          <div className="text-[11px] text-slate-300 mb-1">
            بخش‌ها: {STAGE57_SECTIONS_13.map((s) => `${s.id}.${s.titleFa}`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            لایه‌های نقشه: {STAGE57_MAP_LAYERS_10.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="stage57-greenery-hazards-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-lime-300">فضای سبز، آب و روان‌آب، خاک، پسماند و ممیزی گزارش مردمی</h4>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={citizenApproved}
                onChange={(e) => setCitizenApproved(e.target.checked)}
              />
              <span>گزارش مردمی تأیید و خصوصی‌زدایی شده است</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={attemptOpaqueScore}
                onChange={(e) => setAttemptOpaqueScore(e.target.checked)}
              />
              <span>آزمون امتیاز تک‌رقمی مبهم</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-slate-200">
            {greenHazardGuard.greeneryVsParkPublicAccessFa}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-amber-200">
            {greenHazardGuard.floodNoRecordSafetyGuardFa}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-sky-200">
            {greenHazardGuard.soilConfidenceBadgeFa}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-emerald-200">
            {greenHazardGuard.citizenModerationRuleFa}
          </div>
        </div>

        <div
          className={`rounded-lg border p-3 ${
            attemptOpaqueScore
              ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
              : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
          }`}
          data-testid="stage57-opaque-score-guard"
        >
          {greenHazardGuard.opaqueSingleScoreBlockedFa}
        </div>
      </div>
    </div>
  );
};
