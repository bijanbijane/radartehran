/** @file src/features/onboarding/components/Stage58AccessResilienceScenarioAndStage59Panel.tsx — Stage 58 Tabs 3 & 4 + Stage 59 Preview */
import React, { useState } from 'react';
import { evaluateEmergencyAccessInfrastructureAndTimelineGuards } from '../services/urbanRiskEngine';
import {
  STAGE58_ACCEPTANCE_TESTS_28,
  STAGE58_INTEGRATIONS_9,
  STAGE58_UX_EVENTS_12,
  STAGE59_DEMOGRAPHICS_PREVIEW_AXES_13,
  type NeighborhoodRiskProfile,
} from '../services/urbanRiskTypes';

interface Props {
  section: 'access_and_infrastructure' | 'property_scenarios_and_stage59';
  profile: NeighborhoodRiskProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage58AccessResilienceScenarioAndStage59Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [simulateClosure, setSimulateClosure] = useState<boolean>(true);
  const [scenarioRole, setScenarioRole] = useState<'کاربر عادی' | 'پژوهشگر' | 'مدیر ارزیاب'>('کاربر عادی');

  const guard = evaluateEmergencyAccessInfrastructureAndTimelineGuards(profile, simulateClosure);

  if (section === 'access_and_infrastructure') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage58-access-resilience-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <h4 className="font-bold text-teal-300">ایمنی معابر، مراکز امداد، تاب‌آوری زیرساخت‌ها و ۴ تاریخ مستقل</h4>
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={simulateClosure}
              onChange={(e) => {
                setSimulateClosure(e.target.checked);
                onFeedbackFa(
                  e.target.checked
                    ? 'شبیه‌سازی اختلال یک محور اصلی در تحلیل تاب‌آوری شبکه فعال شد.'
                    : 'حالت مقایسه مسیر عادی در برابر برچسب سناریوی بحران فعال است.',
                );
              }}
            />
            <span>شبیه‌سازی از دسترس خارج شدن یک محور اصلی</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage58-emergency-routing">
            <div className="font-bold text-amber-300">دسترسی اضطراری در برابر زمان عادی تردد</div>
            <p className="text-slate-200">{guard.emergencyAccessScenarioGuardFa}</p>
            <p className="text-[11px] text-sky-300">{guard.responseCapacityCaveatFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage58-dates-conflict">
            <div className="font-bold text-indigo-300">تفکیک ۴ تاریخ و مدیریت تعارض منابع</div>
            <p className="text-slate-200">{guard.fourDateSeparationFa}</p>
            <p className="text-[11px] text-rose-300">{guard.sourceConflictResolutionFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
          <div className="font-bold text-teal-300">ماتریس تاب‌آوری ۵گانه زیرساخت‌ها (بدون ادغام در یک نمره مبهم)</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            {profile.infrastructureMatrix.map((row) => (
              <div key={row.sectorFa} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{row.sectorFa}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-teal-300">
                    {row.isOperationalDetailRestricted ? 'عمومی محدود' : 'قابل مشاهده'}
                  </span>
                </div>
                <div className="text-[11px] text-amber-200">{row.coverageStatusFa}</div>
                <div className="text-[10px] text-slate-400">{row.dependencyNoteFa}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage58-property-stage59-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-teal-300">پروفایل ریسک، سناریوسازی بحران، کنترل دسترسی نقش‌ها و اتصال ۹گانه</h4>
          <select
            aria-label="انتخاب نقش کاربری ماژول مخاطرات"
            value={scenarioRole}
            onChange={(e) => {
              const role = e.target.value as 'کاربر عادی' | 'پژوهشگر' | 'مدیر ارزیاب';
              setScenarioRole(role);
              onFeedbackFa(`سطح نمایش ماژول مخاطرات برای نقش «${role}» تنظیم شد.`);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
          >
            <option value="کاربر عادی">کاربر عادی (مخاطرات عمومی و منشأ داده)</option>
            <option value="پژوهشگر">پژوهشگر و تحلیلگر (مقایسه منابع و سناریوساز)</option>
            <option value="مدیر ارزیاب">مدیر و ارزیاب داده (مدیریت تعارض و سطح انتشار)</option>
          </select>
        </div>

        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-rose-200" data-testid="stage58-crisis-disclaimer">
          {guard.crisisScenarioDisclaimerFa} (نقش فعال: {scenarioRole})
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-[11px] text-slate-300">
          <strong>اتصالات ۹گانه در رادار تهران: </strong>
          {STAGE58_INTEGRATIONS_9.join(' • ')}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-teal-300">
            آزمون‌های پذیرش UI-RISK ({STAGE58_ACCEPTANCE_TESTS_28.length}) • رویداد UX: {STAGE58_UX_EVENTS_12.length}
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] text-slate-300">
            {STAGE58_ACCEPTANCE_TESTS_28.map((item) => (
              <div key={item.id}>
                <span className="font-mono text-teal-400">{item.id}:</span> {item.checkFa}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-2" data-testid="stage59-preview-box">
          <div className="flex items-center justify-between">
            <span className="font-bold text-indigo-300">پیش‌نمایش مرحله ۵۹: RT-UI-URBAN-DEMOGRAPHICS-SOCIAL-001</span>
            <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-200">۱۳ محور جمعیت و اجتماع</span>
          </div>
          <p className="text-[11px] text-indigo-100/90">
            اصل محوری مرحله ۵۹: تحلیل اجتماعی و جمعیتی منحصراً متکی بر داده‌های آماری تجمیعی است و رادار هرگز به سامانه ردیابی یا پرونده‌سازی اشخاص تبدیل نمی‌شود.
          </p>
          <ul className="space-y-1 text-[11px] text-slate-200 max-h-28 overflow-y-auto">
            {STAGE59_DEMOGRAPHICS_PREVIEW_AXES_13.map((axis) => (
              <li key={axis}>{axis}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
