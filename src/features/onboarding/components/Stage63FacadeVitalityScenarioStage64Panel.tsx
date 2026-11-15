/** @file src/features/onboarding/components/Stage63FacadeVitalityScenarioStage64Panel.tsx — Stage 63 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateSafetyShadeFacadePrivacyAndScenario } from '../services/urbanPublicRealmEngine';
import {
  STAGE63_ACCEPTANCE_TESTS_28,
  STAGE63_UX_EVENTS_15,
  STAGE64_MOBILITY_PREVIEW_AXES_16,
  type PublicRealmZoneProfile,
} from '../services/urbanPublicRealmTypes';

interface Props {
  section: 'facade_vitality_and_reports' | 'scenarios_uipr_and_stage64';
  profile: PublicRealmZoneProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage63FacadeVitalityScenarioStage64Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [scenarioLabel, setScenarioLabel] = useState<'hypothetical_ramp' | 'baseline'>('hypothetical_ramp');

  const guard = evaluateSafetyShadeFacadePrivacyAndScenario(
    profile,
    true,
    scenarioLabel === 'hypothetical_ramp',
  );

  if (section === 'facade_vitality_and_reports') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage63-facade-vitality-panel">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-emerald-300">جداره فعال، سرزندگی زمانی (روز ≠ شب) و مشارکت مردمی</div>
          <p className="text-slate-200">{guard.facadeAndVitalityGuardFa}</p>
          <p className="text-amber-300">{guard.duplicateStaleAndPrivacyGuardFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-1 text-[11px] text-slate-300">
          <div className="font-bold text-sky-300">قواعد کنترل گزارش و تفکیک فضاها</div>
          <p>{guard.scenarioAndSpaceBoundaryFa}</p>
          <p>ارزیابی کارشناسی میدانی از گزارش عمومی کاربران جداست و حذف خودکار گزارش‌های تکراری پیش از بررسی مسدود است.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage63-scenarios-uipr-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <span className="font-bold text-emerald-300">سناریوسازی بهبود فضای عمومی، UI-PR و پیش‌نمایش مرحله ۶۴</span>
        <select
          value={scenarioLabel}
          onChange={(e) => {
            const next = e.target.value as 'hypothetical_ramp' | 'baseline';
            setScenarioLabel(next);
            onFeedbackFa(
              next === 'hypothetical_ramp'
                ? 'سناریوی فرضی ایجاد رمپ و افزایش عرض مفید با برچسب غیرمصوب فعال شد.'
                : 'نمای وضعیت پایه مشاهده‌شده فعال شد.',
            );
          }}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-100"
        >
          <option value="hypothetical_ramp">سناریوی فرضی (حذف مانع و ایجاد رمپ)</option>
          <option value="baseline">وضعیت پایه مشاهده‌شده</option>
        </select>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200">
        {guard.scenarioAndSpaceBoundaryFa}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-emerald-300">
            آزمون‌های پذیرش UI-PR ({STAGE63_ACCEPTANCE_TESTS_28.length}) • رویداد UX ({STAGE63_UX_EVENTS_15.length})
          </div>
          {STAGE63_ACCEPTANCE_TESTS_28.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-emerald-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-sky-300">پیش‌نمایش مرحله ۶۴: RT-UI-URBAN-MOBILITY-TRAVEL-001</div>
          <p className="text-[11px] text-slate-300">
            اصل محوری: نزدیکی به ایستگاه معادل دسترسی واقعی چندوجهی نیست (۱۶ محور تحرک شهری).
          </p>
          {STAGE64_MOBILITY_PREVIEW_AXES_16.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
