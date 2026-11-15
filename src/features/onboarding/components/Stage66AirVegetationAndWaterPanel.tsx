/** @file src/features/onboarding/components/Stage66AirVegetationAndWaterPanel.tsx — Stage 66 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateEnvMeasurementAndEcosystemGuards } from '../services/environmentalSustainabilityEngine';
import {
  STAGE66_DATA_PROVENANCE_TAGS_8,
  STAGE66_KEY_INDICATORS_8,
  STAGE66_LAYER_GROUPS_8,
  STAGE66_MAP_LAYERS_10,
  STAGE66_MODULES_17,
  type Stage66AccessRadiusMeters,
  type Stage66ComparisonPeriod,
  type Stage66EnvironmentProfile,
} from '../services/environmentalSustainabilityTypes';

interface Props {
  section: 'overview_air_vegetation' | 'trees_parks_corridors_water';
  profiles: ReadonlyArray<Stage66EnvironmentProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage66AirVegetationAndWaterPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [periodFrom, setPeriodFrom] = useState<Stage66ComparisonPeriod>('۱۳۹۵');
  const [periodTo, setPeriodTo] = useState<Stage66ComparisonPeriod>('۱۴۰۵');
  const [radiusMeters, setRadiusMeters] = useState<Stage66AccessRadiusMeters>(500);
  const [dualLayerPair, setDualLayerPair] = useState<string>('پوشش گیاهی + دمای سطح (LST)');

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const guard = evaluateEnvMeasurementAndEcosystemGuards(
    profile,
    periodFrom,
    periodTo,
    radiusMeters,
  );

  if (section === 'overview_air_vegetation') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage66-overview-air-vegetation-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`محدوده فعال با نقشه و تمام شاخص‌های «${p.zoneNameFa}» همگام‌سازی شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded bg-slate-950 px-2 py-0.5 text-emerald-300 border border-slate-800">
              منشأ: {profile.provenanceTag}
            </span>
            <span className="rounded bg-slate-950 px-2 py-0.5 text-amber-300 border border-slate-800">
              کیفیت: {profile.qualityBadge} ({profile.lastUpdatedFa})
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1.5">
            <div className="font-bold text-emerald-300">کیفیت هوا: تفکیک مستقیم از برآورد مدل مکانی</div>
            <p className="text-slate-200">{guard.airQualityOriginGuardFa}</p>
            <div className="text-[11px] text-slate-400">
              آلاینده‌ها: PM2.5={profile.pm25UgM3 ?? '--'} • PM10={profile.pm10UgM3 ?? '--'} • NO2={profile.no2Ppb ?? '-- (مفقود)'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-teal-300">مقایسه زمانی پوشش گیاهی و NDVI ({profile.ndviMean})</span>
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-slate-400" htmlFor="stage66-period-from">از:</label>
                <select
                  id="stage66-period-from"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value as Stage66ComparisonPeriod)}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-100"
                >
                  <option value="۱۳۹۵">۱۳۹۵</option>
                  <option value="۱۴۰۰">۱۴۰۰</option>
                  <option value="۱۴۰۵">۱۴۰۵</option>
                </select>
                <label className="text-[11px] text-slate-400" htmlFor="stage66-period-to">تا:</label>
                <select
                  id="stage66-period-to"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value as Stage66ComparisonPeriod)}
                  className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-100"
                >
                  <option value="۱۳۹۵">۱۳۹۵</option>
                  <option value="۱۴۰۰">۱۴۰۰</option>
                  <option value="۱۴۰۵">۱۴۰۵</option>
                </select>
              </div>
            </div>
            <p className="text-slate-200">{guard.vegetationSeasonalAndTreeSurveyGuardFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-emerald-300">
              ساختار ۱۷بخشی، ۸ شاخص کلیدی، ۱۰ لایه نقشه و مقایسه دو لایه هم‌زمان
            </span>
            <select
              aria-label="جفت لایه مقایسه هم‌زمان"
              value={dualLayerPair}
              onChange={(e) => {
                setDualLayerPair(e.target.value);
                onFeedbackFa(`مقایسه دو لایه «${e.target.value}» روی نقشه محیط‌زیستی فعال شد.`);
              }}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
            >
              <option value="پوشش گیاهی + دمای سطح (LST)">پوشش گیاهی + دمای سطح (LST)</option>
              <option value="تراکم ساختمانی + نفوذپذیری زمین">تراکم ساختمانی + نفوذپذیری زمین</option>
              <option value="فضای سبز + تراکم جمعیت">فضای سبز + تراکم جمعیت</option>
              <option value="تغییرات ساخت‌وساز + کاهش پوشش گیاهی">تغییرات ساخت‌وساز + کاهش پوشش گیاهی</option>
            </select>
          </div>
          <div className="text-[11px] text-slate-300">
            ۸ کارت کلیدی: {STAGE66_KEY_INDICATORS_8.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۸ گروه لایه: {STAGE66_LAYER_GROUPS_8.join(' • ')} | ۱۰ لایه: {STAGE66_MAP_LAYERS_10.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۷ بخش معماری: {STAGE66_MODULES_17.map((m) => `${m.id}.${m.titleFa}`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۸ برچسب منشأ داده: {STAGE66_DATA_PROVENANCE_TAGS_8.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage66-trees-parks-corridors-water-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <span className="font-bold text-emerald-300">
          شعاع دسترسی به فضای سبز (تفکیک فاصله هندسی از دسترسی شبکه‌ای پیاده):
        </span>
        <div className="flex flex-wrap gap-1.5">
          {([300, 500, 800, 1000] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRadiusMeters(r);
                onFeedbackFa(`شعاع تحلیل دسترسی فضای سبز روی ${r} متر تنظیم شد (تفکیک فاصله مستقیم و پیاده شبکه‌ای).`);
              }}
              className={`rounded-lg border px-2.5 py-1 cursor-pointer ${
                radiusMeters === r
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold'
                  : 'border-slate-700 bg-slate-950 text-slate-300'
              }`}
            >
              {r} متر
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-teal-300">درختان شهری، دسترسی پیاده و صفحه عدالت محیطی</div>
          <p className="text-slate-200">{guard.parkAccessAndJusticeGuardFa}</p>
          <p className="text-[11px] text-slate-400">
            درختان ثبت‌شده: {profile.recordedTreeCount.toLocaleString('fa-IR')} اصله ({profile.treeDensityPerHectare}/هکتار، پوشش {profile.treeSurveyCoveragePercent}٪)
          </p>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1.5 text-amber-200">
          <div className="font-bold text-amber-300">پیوستگی اکولوژیک و محدودیت تحلیل منابع آب</div>
          <p>{guard.corridorAndWaterEvidenceGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
