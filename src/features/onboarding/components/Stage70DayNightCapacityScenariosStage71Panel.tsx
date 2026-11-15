/** @file src/features/onboarding/components/Stage70DayNightCapacityScenariosStage71Panel.tsx — Stage 70 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateDayNightCapacityScenariosAndPrivacy } from '../services/demographicAnalysisStage70Engine';
import {
  STAGE70_ACCEPTANCE_TESTS_40,
  STAGE70_COMPOSITE_INDEXES_8,
  STAGE70_HOURLY_SLOTS_6,
  STAGE70_REPORT_TYPES_15,
  STAGE71_SPATIAL_EQUITY_PREVIEW_AXES_15,
  type Stage70DemographicZoneProfile,
} from '../services/demographicAnalysisStage70Types';

interface Props {
  section: 'daynight_capacity_housing' | 'scenarios_privacy_reports_stage71';
  profile: Stage70DemographicZoneProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage70DayNightCapacityScenariosStage71Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [selectedSlotFa, setSelectedSlotFa] = useState<string>(STAGE70_HOURLY_SLOTS_6[1]);
  const [inspectComposite, setInspectComposite] = useState<boolean>(true);
  const [antiInference, setAntiInference] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE70_REPORT_TYPES_15[0]);

  const guard = evaluateDayNightCapacityScenariosAndPrivacy(
    profile,
    selectedSlotFa,
    inspectComposite,
    antiInference,
  );

  if (section === 'daynight_capacity_housing') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage70-daynight-capacity-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <span className="font-bold text-cyan-300">بازه ساعتی تخمین جمعیت حاضر (ΔP = P_day − P_night)</span>
          <select
            aria-label="بازه ساعتی جمعیت"
            value={selectedSlotFa}
            onChange={(e) => {
              setSelectedSlotFa(e.target.value);
              onFeedbackFa(`نمای ساعتی «${e.target.value}» به‌صورت «تخمین جمعیت حاضر» تفکیک‌شده از جمعیت ساکن تنظیم شد.`);
            }}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          >
            {STAGE70_HOURLY_SLOTS_6.map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-1.5 text-cyan-100">
            <div className="font-bold text-cyan-300">جمعیت روز/شب، ساعات ۶گانه و ارتفاع ساختمان ≠ جمعیت</div>
            <p>{guard.dayNightDeltaAndBuildingHeightGuardFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
            <div className="font-bold text-emerald-300">تفکیک ۳ ظرفیت (نظری/قانونی/عملیاتی) و همبستگی مسکن</div>
            <p className="text-slate-200">{guard.threeCapacitiesAndHousingCausalityGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage70-scenarios-privacy-stage71-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center gap-3 text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={inspectComposite}
              onChange={(e) => setInspectComposite(e.target.checked)}
            />
            <span>نمایش اجزا، فرمول و مخرج در ۸ شاخص ترکیبی</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={antiInference}
              onChange={(e) => setAntiInference(e.target.checked)}
            />
            <span>حذف گروه‌های کوچک و کنترل افشای ترکیب گزارش‌ها</span>
          </label>
        </div>

        <select
          aria-label="قالب گزارش جمعیتی"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`«${e.target.value}» با سال مرجع مجزا از سال انتشار و کنترل محرمانگی آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE70_REPORT_TYPES_15.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 text-cyan-100 space-y-1">
        <div>{guard.microGroupSuppressionCompositeAndDisclosureGuardFa}</div>
        <div className="text-[11px] text-slate-300">
          شاخص‌های ترکیبی ({STAGE70_COMPOSITE_INDEXES_8.length}): {STAGE70_COMPOSITE_INDEXES_8.join(' • ')}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-cyan-300">
            آزمونهای پذیرش RT-UI-DEMOGRAPHIC-ACCEPTANCE-001 ({STAGE70_ACCEPTANCE_TESTS_40.length} آزمون)
          </div>
          {STAGE70_ACCEPTANCE_TESTS_40.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-cyan-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-violet-300">
            پیش‌نمایش مرحله ۷۱: RT-UI-SPATIAL-EQUITY-URBAN-JUSTICE-001
          </div>
          {STAGE71_SPATIAL_EQUITY_PREVIEW_AXES_15.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
