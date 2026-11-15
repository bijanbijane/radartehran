/** @file src/features/onboarding/components/Stage75AgePhysicalStructuralMepPanel.tsx — Stage 75 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateAgeVisibleAndStructural } from '../services/buildingLifecycleStage75Engine';
import {
  STAGE75_FILTER_FIELDS_13,
  STAGE75_KPI_CARDS_8,
  STAGE75_SECTIONS_12,
  type Stage75BuildingLifecycleProfile,
} from '../services/buildingLifecycleStage75Types';

interface Props {
  section: 'overview_age_deterioration' | 'structural_quality_mep';
  profiles: ReadonlyArray<Stage75BuildingLifecycleProfile>;
  selectedBuildingId: string;
  onSelectBuildingId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage75AgePhysicalStructuralMepPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedBuildingId,
  onSelectBuildingId,
  onFeedbackFa,
}) => {
  const [compareQualityExplicitly, setCompareQualityExplicitly] = useState<boolean>(true);
  const [separateMepDates, setSeparateMepDates] = useState<boolean>(true);

  const profile = profiles.find((p) => p.buildingId === selectedBuildingId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateAgeVisibleAndStructural(
    profile,
    compareQualityExplicitly,
    separateMepDates,
  );

  if (section === 'overview_age_deterioration') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage75-overview-age-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.buildingId}
                type="button"
                onClick={() => {
                  onSelectBuildingId(p.buildingId);
                  onFeedbackFa(
                    `پرونده «${p.titleFa}» با حفظ تاریخ ارزیابی (${p.evaluationDateFa}) و اولویت «${p.inspectionPriorityFa}» باز شد.`,
                  );
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.buildingId === profile.buildingId
                    ? 'border-rose-400 bg-rose-500/20 text-rose-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.titleFa}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-400">
            آخرین به‌روزرسانی: {profile.lastUpdatedFa}
          </span>
        </div>

        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-100">
          <div className="font-bold text-rose-300">
            سن تقویمی ≠ فرسودگی | ظاهر مناسب ≠ تأیید ایمنی | ناموجود ≠ صفر
          </div>
          <p>{result.ageVsDeteriorationAndMissingZeroGuardFa}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-rose-300">
            ۱۲ بخش نظام چرخه عمر، ۸ کارت KPI و ۱۳ فیلتر مشترک
          </div>
          <div className="text-[11px] text-slate-300">
            ۸ KPI: {STAGE75_KPI_CARDS_8.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۳ فیلتر: {STAGE75_FILTER_FIELDS_13.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۲ بخش: {STAGE75_SECTIONS_12.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage75-structural-mep-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center gap-3 text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={compareQualityExplicitly}
              onChange={(e) => setCompareQualityExplicitly(e.target.checked)}
            />
            <span>تفکیک ۳ وضعیت تأیید کیفیت (منع یک رنگ/امتیاز کلی)</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={separateMepDates}
              onChange={(e) => setSeparateMepDates(e.target.checked)}
            />
            <span>جداسازی «تاریخ نصب» از «تاریخ آخرین تعمیر» تأسیسات</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-100">
          <div className="font-bold text-rose-300">وضعیت سازه‌ای (منع برچسب سالم/ناایمن در نبود مستند)</div>
          <p>{result.structuralSafetyMandatedGuardFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1 text-slate-200">
          <div className="font-bold text-cyan-300">تأسیسات (۱۵ رده) و وضعیت ثبت سابقه نگهداری</div>
          <p>{result.mepAndMaintenanceRecordGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
