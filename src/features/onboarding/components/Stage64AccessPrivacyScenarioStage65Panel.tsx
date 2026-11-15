/** @file src/features/onboarding/components/Stage64AccessPrivacyScenarioStage65Panel.tsx — Stage 64 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateTrafficParkingOdPrivacyAndValuationGuards } from '../services/urbanMobilityEngine';
import {
  STAGE64_ACCEPTANCE_TESTS_30,
  STAGE64_UX_EVENTS_16,
  STAGE65_REGENERATION_PREVIEW_AXES_16,
  type MobilityZoneProfile,
} from '../services/urbanMobilityTypes';

interface Props {
  section: 'od_parking_freight_and_valuation' | 'scenarios_uimob_and_stage65';
  profile: MobilityZoneProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage64AccessPrivacyScenarioStage65Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [attemptWeekdayVsHolidayCompare, setAttemptWeekdayVsHolidayCompare] = useState<boolean>(true);
  const [attemptAutoMetroValuationBoost, setAttemptAutoMetroValuationBoost] = useState<boolean>(true);

  const guard = evaluateTrafficParkingOdPrivacyAndValuationGuards(
    profile,
    attemptWeekdayVsHolidayCompare,
    attemptAutoMetroValuationBoost,
  );

  if (section === 'od_parking_freight_and_valuation') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage64-od-parking-panel">
        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={attemptWeekdayVsHolidayCompare}
              onChange={(e) => setAttemptWeekdayVsHolidayCompare(e.target.checked)}
            />
            <span>آزمون مقایسه روز کاری با تعطیل</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={attemptAutoMetroValuationBoost}
              onChange={(e) => setAttemptAutoMetroValuationBoost(e.target.checked)}
            />
            <span>آزمون افزایش خودکار قیمت با نزدیکی به مترو</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-indigo-300">پارکینگ (ظرفیت ≠ اشغال) و بار (هندسه ≠ مجوز)</div>
            <p className="text-slate-200">{guard.parkingAndFreightBoundaryFa}</p>
            <p className="text-[11px] text-amber-300">{guard.odPrivacyAndNoRouteHistoryFa}</p>
          </div>
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-200">
            <div className="font-bold text-rose-300">هم‌سنخی زمانی، تاب‌آوری و مرز ارزش‌گذاری ملک</div>
            <p>{guard.dayTypeComparisonAndResilienceFa}</p>
            <p className="text-[11px] text-amber-200">{guard.propertyValuationBoundaryFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage64-scenarios-uimob-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <span className="font-bold text-indigo-300">سناریوهای شبکه تحرک، UI-MOB و پیش‌نمایش مرحله ۶۵</span>
        <button
          type="button"
          onClick={() =>
            onFeedbackFa(
              `وضعیت خط/سناریو روی نقشه به‌صورت مستقل با برچسب «${profile.networkScenarioStatus}» ثبت شد و با خطوط فعال مخلوط نمی‌شود.`,
            )
          }
          className="rounded-lg border border-indigo-400/50 bg-indigo-500/20 px-3 py-1 text-indigo-200 cursor-pointer"
        >
          تأیید تفکیک طرح پیشنهادی از شبکه فعال
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-indigo-300">
            آزمون‌های پذیرش UI-MOB ({STAGE64_ACCEPTANCE_TESTS_30.length}) • رویداد UX ({STAGE64_UX_EVENTS_16.length})
          </div>
          {STAGE64_ACCEPTANCE_TESTS_30.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-indigo-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-violet-300">پیش‌نمایش مرحله ۶۵: RT-UI-URBAN-DEVELOPMENT-REGENERATION-001</div>
          <p className="text-[11px] text-slate-300">
            اصل محوری: تفکیک پروژه پیشنهادی، مصوب، تأمین اعتبار، در حال اجرا و بهره‌برداری (۱۶ محور).
          </p>
          {STAGE65_REGENERATION_PREVIEW_AXES_16.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
