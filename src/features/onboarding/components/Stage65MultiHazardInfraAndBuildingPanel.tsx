/** @file src/features/onboarding/components/Stage65MultiHazardInfraAndBuildingPanel.tsx — Stage 65 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateMultiHazardVulnerabilityAndResilience } from '../services/urbanRiskStage65Engine';
import {
  STAGE65_MAP_LAYERS_13,
  STAGE65_RESILIENCE_DIMENSIONS_5,
  STAGE65_SECTIONS_18,
  type Stage65RiskResilienceProfile,
} from '../services/urbanRiskStage65Types';

interface Props {
  section: 'overview_and_geohazards' | 'buildings_and_critical_infra';
  profiles: ReadonlyArray<Stage65RiskResilienceProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage65MultiHazardInfraAndBuildingPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [publicAccessMode, setPublicAccessMode] = useState<boolean>(true);
  const [attemptUnsafeByAgeLabel, setAttemptUnsafeByAgeLabel] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const guard = evaluateMultiHazardVulnerabilityAndResilience(
    profile,
    publicAccessMode,
    attemptUnsafeByAgeLabel,
  );

  if (section === 'overview_and_geohazards') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage65-overview-geohazards-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`محدوده «${p.zoneNameFa}» برای تحلیل ۱۸بخشی مخاطرات و تاب‌آوری انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-rose-400 bg-rose-500/20 text-rose-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-rose-300">وضعیت داده: {profile.statusKind}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-rose-300">مخاطره ≠ آسیب‌پذیری ≠ تاب‌آوری | نبود داده ≠ نبود خطر</div>
            <p className="text-slate-200">{guard.hazardVsResilienceAndMissingDataFa}</p>
            <p className="text-[11px] text-sky-300">{guard.subsidenceAndFloodModelGuardFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-emerald-300">۵ بُعد تاب‌آوری محله (به‌جای یک عدد واحد)</div>
            <ul className="space-y-0.5 text-[11px] text-slate-300">
              {STAGE65_RESILIENCE_DIMENSIONS_5.map((d) => (
                <li key={d.titleFa}>
                  <span className="font-bold text-slate-100">{d.titleFa}:</span> {d.scopeFa}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
          <div className="font-bold text-rose-300">۱۸ بخش و ۱۳ لایه نقشه مرکز مخاطرات و تاب‌آوری</div>
          <div className="text-[11px] text-slate-300">
            بخش‌ها: {STAGE65_SECTIONS_18.map((s) => `${s.id}.${s.titleFa}`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">لایه‌ها: {STAGE65_MAP_LAYERS_13.join(' • ')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage65-buildings-infra-panel">
      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={attemptUnsafeByAgeLabel}
            onChange={(e) => setAttemptUnsafeByAgeLabel(e.target.checked)}
          />
          <span>آزمون برچسب‌گذاری «ناایمن» بر اساس سال ساخت</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={publicAccessMode}
            onChange={(e) => setPublicAccessMode(e.target.checked)}
          />
          <span>حالت انتشار عمومی (محدودسازی مختصات حساس زیرساخت حیاتی)</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-200">
          <div className="font-bold text-rose-300">آسیب‌پذیری ساختمان (منع برچسب ناایمن از روی سن بنا)</div>
          <p>{guard.buildingSafetyLabelGuardFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
          <div className="font-bold text-amber-300">وابستگی متقابل شبکه‌های حیاتی و محدودیت انتشار</div>
          <p className="text-slate-200">{guard.infrastructureDependencyAndPrivacyFa}</p>
        </div>
      </div>
    </div>
  );
};
