/** @file src/features/onboarding/components/Stage68BusinessDistributionHubsAndJobsPanel.tsx — Stage 68 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateEconomicDensityHubsEmploymentAndBoundaries } from '../services/economicIntelligenceStage68Engine';
import {
  STAGE68_HUB_TYPES_9,
  STAGE68_KEY_INDICATORS_8,
  STAGE68_LAYER_GROUPS_7,
  STAGE68_MAP_LAYERS_10,
  STAGE68_SECTIONS_20,
  type Stage68EconomicZoneProfile,
} from '../services/economicIntelligenceStage68Types';

interface Props {
  section: 'overview_density_hubs' | 'employment_jobs_commercial_industrial';
  profiles: ReadonlyArray<Stage68EconomicZoneProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage68BusinessDistributionHubsAndJobsPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [selectedHubType, setSelectedHubType] = useState<string>(STAGE68_HUB_TYPES_9[0]);
  const [isMobileSim, setIsMobileSim] = useState<boolean>(false);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const guard = evaluateEconomicDensityHubsEmploymentAndBoundaries(profile, isMobileSim);

  if (section === 'overview_density_hubs') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage68-overview-hubs-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`نقشه، کارت‌ها، نمودارها و گزارش‌های مرتبط با «${p.zoneNameFa}» همگام‌سازی شدند.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="stage68-hub-type" className="text-[11px] text-slate-400">نوع قطب:</label>
            <select
              id="stage68-hub-type"
              value={selectedHubType}
              onChange={(e) => setSelectedHubType(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            >
              {STAGE68_HUB_TYPES_9.map((ht) => (
                <option key={ht} value={ht}>{ht}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1.5 text-amber-100">
            <div className="font-bold text-amber-300">پایگاه داده رادار ≠ کل شهر | تراکم مکانی ≠ قدرت اقتصادی</div>
            <p>{guard.registeredDbVsDensityVsPowerGuardFa}</p>
            <p className="text-[11px] text-slate-400">
              هویت: {profile.identityLabelFa} • منبع: {profile.dataSourceFa} ({profile.validationStatusFa})
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
            <div className="font-bold text-sky-300">تفکیک قطب تثبیت‌شده از ظرفیت بالقوه و کارگاه از کارخانه</div>
            <p className="text-slate-200">{guard.hubEstablishedVsPotentialAndWorkshopGuardFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
          <div className="font-bold text-amber-300">۲۰ بخش معماری، ۸ شاخص کلیدی، ۷ گروه لایه و ۱۰ لایه نقشه</div>
          <div className="text-[11px] text-slate-300">
            ۸ شاخص: {STAGE68_KEY_INDICATORS_8.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۷ گروه: {STAGE68_LAYER_GROUPS_7.join(' • ')} | ۱۰ لایه: {STAGE68_MAP_LAYERS_10.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۲۰ بخش: {STAGE68_SECTIONS_20.map((s) => `${s.id}.${s.titleFa}`).join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage68-employment-jobs-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <span className="font-bold text-amber-300">ساختار اشتغال، فرصت‌های شغلی مکانی و خوشه‌بندی موبایل</span>
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={isMobileSim}
            onChange={(e) => setIsMobileSim(e.target.checked)}
          />
          <span>شبیه‌سازی محدودیت خوشه‌بندی موبایل (منع هزاران نقطه هم‌زمان)</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-emerald-300">تفکیک سه‌گانه شاغل ساکن، شاغل محدوده و فرصت شغلی</div>
          <p className="text-slate-200">{guard.employmentThreeWayAndBoundaryGuardFa}</p>
        </div>

        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1.5 text-sky-200">
          <div className="font-bold text-sky-300">رفتار خوشه‌بندی مکانی در موبایل و دسکتاپ</div>
          <p>{guard.mobileClusteringGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
