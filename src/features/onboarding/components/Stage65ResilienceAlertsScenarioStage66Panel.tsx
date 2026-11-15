/** @file src/features/onboarding/components/Stage65ResilienceAlertsScenarioStage66Panel.tsx — Stage 65 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateEmergencyAccessCapacityAlertAndIndexGuards } from '../services/urbanRiskStage65Engine';
import {
  STAGE65_ACCEPTANCE_TESTS_23,
  STAGE65_UX_EVENTS_12,
  STAGE66_ENVIRONMENT_PREVIEW_AXES_17,
  type Stage65RiskResilienceProfile,
} from '../services/urbanRiskStage65Types';

interface Props {
  section: 'emergency_access_and_resilience' | 'alerts_scenarios_and_stage66';
  profile: Stage65RiskResilienceProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage65ResilienceAlertsScenarioStage66Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [allowIncompleteComposite, setAllowIncompleteComposite] = useState<boolean>(false);
  const [scenarioMode, setScenarioMode] = useState<'hypothetical_bridge' | 'baseline'>('hypothetical_bridge');

  const guard = evaluateEmergencyAccessCapacityAlertAndIndexGuards(
    profile,
    allowIncompleteComposite,
    scenarioMode === 'hypothetical_bridge',
  );

  if (section === 'emergency_access_and_resilience') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage65-emergency-resilience-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <span className="font-bold text-rose-300">مواجهه جمعیتی، دسترسی اضطراری، ظرفیت فضای باز و کارت تاب‌آوری</span>
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={allowIncompleteComposite}
              onChange={(e) => setAllowIncompleteComposite(e.target.checked)}
            />
            <span>نمایش شناسنامه محاسبه با پوشش داده ({profile.dataCoveragePercent}٪)</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-sky-300">جمعیت تجمیعی با سال مرجع و دسترسی اضطراری</div>
            <p className="text-slate-200">{guard.populationAndEmergencyRouteGuardFa}</p>
            <p className="text-[11px] text-amber-300">{guard.openSpaceTheoreticalCapacityGuardFa}</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-amber-200">
            <div className="font-bold text-amber-300">ممانعت از امتیازسازی گمراه‌کننده تاب‌آوری</div>
            <p>{guard.resilienceScoreCompletenessGuardFa}</p>
            <p className="text-[11px] text-rose-200">{guard.antiAlarmistPublicationGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage65-alerts-scenarios-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <span className="font-bold text-rose-300">مرز هشدار رسمی بحران، سناریوی فرضی و پیش‌نمایش مرحله ۶۶</span>
        <select
          value={scenarioMode}
          onChange={(e) => {
            const next = e.target.value as 'hypothetical_bridge' | 'baseline';
            setScenarioMode(next);
            onFeedbackFa(
              next === 'hypothetical_bridge'
                ? 'سناریوی فرضی انسداد پل/مسیر با برچسب غیرواقعی و جدول مفروضات مدل فعال شد.'
                : 'نمای وضعیت پایه غیرسناریویی فعال شد.',
            );
          }}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-100"
        >
          <option value="hypothetical_bridge">سناریوی فرضی (انسداد پل و اختلال شبکه)</option>
          <option value="baseline">وضعیت پایه ثبت‌شده</option>
        </select>
      </div>

      <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-rose-200">
        {guard.officialAlertAndScenarioBoundaryFa}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-rose-300">
            معیارهای پذیرش UI-RISK65 ({STAGE65_ACCEPTANCE_TESTS_23.length}) • رویداد UX ({STAGE65_UX_EVENTS_12.length})
          </div>
          {STAGE65_ACCEPTANCE_TESTS_23.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-rose-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-emerald-300">
            پیش‌نمایش مرحله ۶۶: RT-UI-URBAN-ENVIRONMENTAL-SUSTAINABILITY-001
          </div>
          <p className="text-[11px] text-slate-300">
            اصل محوری: توزیع عادلانه، پیوستگی اکولوژیک، نفوذپذیری و تغییرات بلندمدت فراتر از تکرار داده‌های آلودگی (۱۷ محور).
          </p>
          {STAGE66_ENVIRONMENT_PREVIEW_AXES_17.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
