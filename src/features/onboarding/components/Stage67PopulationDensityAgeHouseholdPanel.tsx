/** @file src/features/onboarding/components/Stage67PopulationDensityAgeHouseholdPanel.tsx — Stage 67 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluatePopulationDensityAgeHouseholdAndMigrationGuards } from '../services/demographicIntelligenceStage67Engine';
import {
  STAGE67_AGE_GROUPS_8,
  STAGE67_KEY_INDICATORS_8,
  STAGE67_LAYER_GROUPS_6,
  STAGE67_MAP_LAYERS_10,
  STAGE67_SECTIONS_18,
  STAGE67_SPATIAL_SCALES_7,
  type Stage67CensusPeriod,
  type Stage67DemographicProfile,
  type Stage67SpatialScale,
} from '../services/demographicIntelligenceStage67Types';

interface Props {
  section: 'overview_and_spatial_density' | 'age_household_change_migration';
  profiles: ReadonlyArray<Stage67DemographicProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage67PopulationDensityAgeHouseholdPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [spatialScale, setSpatialScale] = useState<Stage67SpatialScale>('محله');
  const [selectedYear, setSelectedYear] = useState<Stage67CensusPeriod>('۱۴۰۰');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>(STAGE67_AGE_GROUPS_8[7]);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const guard = evaluatePopulationDensityAgeHouseholdAndMigrationGuards(
    profile,
    spatialScale,
    selectedYear,
  );

  if (section === 'overview_and_spatial_density') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage67-overview-density-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`نقشه، کارت‌ها و نمودارها با محدوده «${p.zoneNameFa}» همگام‌سازی شدند.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-violet-400 bg-violet-500/20 text-violet-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="stage67-scale-select" className="text-[11px] text-slate-400">مقیاس مکانی:</label>
            <select
              id="stage67-scale-select"
              value={spatialScale}
              onChange={(e) => setSpatialScale(e.target.value as Stage67SpatialScale)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            >
              {STAGE67_SPATIAL_SCALES_7.map((sc) => (
                <option key={sc} value={sc}>{sc}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 space-y-1.5">
            <div className="font-bold text-violet-300">تفکیک جمعیت کل، تراکم ناخالص، خالص مسکونی و FAR</div>
            <p className="text-slate-200">{guard.totalVsThreeDensitiesGuardFa}</p>
            <p className="text-[11px] text-slate-400">
              منبع: {profile.dataType} • وضعیت: {profile.qualityStatus} • مرجع: {profile.referenceYearFa}
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1.5 text-amber-200">
            <div className="font-bold text-amber-300">کنترل سطح دقت مقیاس و ممنوعیت مقدار جعلی صفر</div>
            <p>{guard.missingDataAndScalePermissionGuardFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
          <div className="font-bold text-violet-300">۱۸ بخش معماری، ۸ شاخص کلیدی، ۶ گروه لایه و ۱۰ لایه نقشه</div>
          <div className="text-[11px] text-slate-300">
            ۸ شاخص: {STAGE67_KEY_INDICATORS_8.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۶ گروه: {STAGE67_LAYER_GROUPS_6.join(' • ')} | ۱۰ لایه: {STAGE67_MAP_LAYERS_10.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۸ بخش: {STAGE67_SECTIONS_18.map((s) => `${s.id}.${s.titleFa}`).join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage67-age-household-migration-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-violet-300">انتخاب گروه سنی روی نقشه (تجمیعی):</span>
          <select
            aria-label="گروه سنی برای نمایش روی نقشه"
            value={selectedAgeGroup}
            onChange={(e) => {
              setSelectedAgeGroup(e.target.value);
              onFeedbackFa(`توزیع مکانی تجمیعی گروه سنی «${e.target.value}» بدون شناسایی افراد روی نقشه فعال شد.`);
            }}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          >
            {STAGE67_AGE_GROUPS_8.map((ag) => (
              <option key={ag} value={ag}>{ag}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          {(['۱۳۹۰', '۱۳۹۵', '۱۴۰۰', '۱۴۰۵'] as const).map((yr) => (
            <button
              key={yr}
              type="button"
              onClick={() => setSelectedYear(yr)}
              className={`rounded-lg border px-2.5 py-1 cursor-pointer ${
                selectedYear === yr
                  ? 'border-violet-400 bg-violet-500/20 text-violet-200 font-bold'
                  : 'border-slate-700 bg-slate-950 text-slate-300'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-sky-300">ساختار خانوار و رابطه غیرعلّی با بازار مسکن</div>
          <p className="text-slate-200">{guard.householdHousingCausalityGuardFa}</p>
          <p className="text-[11px] text-slate-400">
            سهم جوان: {profile.youthSharePercent}٪ • سهم سالمند: {profile.elderlySharePercent}٪ • تغییر ۱۰ساله: {profile.populationChange10YrPercent}٪
          </p>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1.5 text-emerald-200">
          <div className="font-bold text-emerald-300">مهاجرت و جریان‌های OD (تجمیعی و تفکیک‌شده از حمل‌ونقل)</div>
          <p>{guard.migrationAndMobilityBoundaryGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
