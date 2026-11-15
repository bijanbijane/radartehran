/** @file src/features/onboarding/components/Stage67DayNightHousingJusticeScenarioPanel.tsx — Stage 67 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateDayNightFloatingJusticeScenarioAndPrivacyGuards } from '../services/demographicIntelligenceStage67Engine';
import {
  STAGE67_ACCEPTANCE_TESTS_22,
  STAGE67_DATA_TYPES_8,
  STAGE67_QUALITY_STATUSES_6,
  STAGE67_REPORT_TYPES_14,
  STAGE67_SERVICE_GROUPS_9,
  STAGE67_TIME_WINDOWS_7,
  STAGE68_ECONOMY_PREVIEW_AXES_13,
  type Stage67DemographicProfile,
} from '../services/demographicIntelligenceStage67Types';

interface Props {
  section: 'day_night_floating_services_justice' | 'compare_scenarios_privacy_stage68';
  profiles: ReadonlyArray<Stage67DemographicProfile>;
  profile: Stage67DemographicProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage67DayNightHousingJusticeScenarioPanel: React.FC<Props> = ({
  section,
  profiles,
  profile,
  onFeedbackFa,
}) => {
  const [timeWindow, setTimeWindow] = useState<string>(STAGE67_TIME_WINDOWS_7[2]);
  const [serviceGroup, setServiceGroup] = useState<string>(STAGE67_SERVICE_GROUPS_9[0]);
  const [isScenarioMode, setIsScenarioMode] = useState<boolean>(true);
  const [combinedLayersPrivacyCheck, setCombinedLayersPrivacyCheck] = useState<boolean>(true);

  const guard = evaluateDayNightFloatingJusticeScenarioAndPrivacyGuards(
    profile,
    profiles.length,
    isScenarioMode,
    combinedLayersPrivacyCheck,
  );

  if (section === 'day_night_floating_services_justice') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage67-daynight-justice-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-violet-300">بازه شبانه‌روزی:</span>
            <select
              aria-label="بازه ساعتی جمعیت روز و شب"
              value={timeWindow}
              onChange={(e) => {
                setTimeWindow(e.target.value);
                onFeedbackFa(`تحلیل جمعیت روز/شب و شناور برای بازه «${e.target.value}» به‌روزرسانی شد.`);
              }}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            >
              {STAGE67_TIME_WINDOWS_7.map((tw) => (
                <option key={tw} value={tw}>{tw}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sky-300">گروه خدماتی:</span>
            <select
              aria-label="گروه خدمات شهری برای تطبیق جمعیت"
              value={serviceGroup}
              onChange={(e) => setServiceGroup(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            >
              {STAGE67_SERVICE_GROUPS_9.map((sg) => (
                <option key={sg} value={sg}>{sg}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 space-y-1.5">
            <div className="font-bold text-violet-300">جمعیت روز و شب و تفکیک سه‌گانه جمعیت شناور</div>
            <p className="text-slate-200">{guard.dayNightAndFloatingSeparationGuardFa}</p>
          </div>
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1.5 text-rose-200">
            <div className="font-bold text-rose-300">نابرابری فضایی و منع تبدیل واحد تجاری به فرصت شغلی</div>
            <p>{guard.inequalityAndCommercialJobsGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage67-compare-scenarios-stage68-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap gap-3 text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isScenarioMode}
              onChange={(e) => setIsScenarioMode(e.target.checked)}
            />
            <span>حالت «سناریو» (متمایز از «پیش‌بینی»)</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={combinedLayersPrivacyCheck}
              onChange={(e) => setCombinedLayersPrivacyCheck(e.target.checked)}
            />
            <span>کنترل حداقل اندازه گروه پویا در ترکیب چندلایه</span>
          </label>
        </div>
        <span className="text-[11px] text-violet-300">
          {STAGE67_REPORT_TYPES_14.length} گزارش • {STAGE67_DATA_TYPES_8.length} نوع داده • {STAGE67_QUALITY_STATUSES_6.length} وضعیت اعتبار
        </span>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200 space-y-1">
        <div>{guard.compareAndCompositeHealthScoreGuardFa}</div>
        <div className="text-slate-200">{guard.scenarioVsForecastAndDynamicPrivacyGuardFa}</div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-violet-300">
            آزمون‌های پذیرش UI-DEM67 ({STAGE67_ACCEPTANCE_TESTS_22.length} معیار)
          </div>
          {STAGE67_ACCEPTANCE_TESTS_22.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-violet-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-sky-300">
            پیش‌نمایش مرحله ۶۸: RT-UI-URBAN-ECONOMIC-ACTIVITY-INTELLIGENCE-001
          </div>
          {STAGE68_ECONOMY_PREVIEW_AXES_13.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
