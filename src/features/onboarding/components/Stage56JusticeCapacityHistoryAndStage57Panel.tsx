/** @file src/features/onboarding/components/Stage56JusticeCapacityHistoryAndStage57Panel.tsx — Stage 56 Justice, Capacity, History, Scenarios & Stage 57 Preview */
import React, { useState } from 'react';
import {
  evaluateCapacityJusticeAndHistory,
  simulateInfrastructureScenario,
} from '../services/urbanInfrastructureEngine';
import {
  STAGE56_ACCEPTANCE_TESTS_18,
  STAGE56_UX_EVENTS_10,
  STAGE57_ENVIRONMENT_PREVIEW_AXES_10,
  type NeighborhoodInfrastructureProfile,
} from '../services/urbanInfrastructureTypes';

interface Props {
  section: 'justice_and_capacity' | 'history_scenarios_and_stage57';
  profiles: ReadonlyArray<NeighborhoodInfrastructureProfile>;
  onFeedbackFa: (message: string) => void;
}

export const Stage56JusticeCapacityHistoryAndStage57Panel: React.FC<Props> = ({
  section,
  profiles,
  onFeedbackFa,
}) => {
  const [popDelta, setPopDelta] = useState<number>(15);
  const [addedClinics, setAddedClinics] = useState<number>(1);
  const [addedTransit, setAddedTransit] = useState<number>(1);

  const primary = profiles[0];
  const secondary = profiles[1] ?? profiles[0];
  if (!primary) return null;

  if (section === 'justice_and_capacity') {
    const cap1 = evaluateCapacityJusticeAndHistory(primary);
    const cap2 = evaluateCapacityJusticeAndHistory(secondary);

    return (
      <div className="space-y-4" data-testid="stage56-justice-capacity-panel">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
          <h4 className="font-bold text-emerald-300">عدالت فضایی چندبعدی و مقایسه عرضه در برابر تقاضا</h4>

          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 text-sky-200" data-testid="stage56-justice-breakdown">
            {cap1.spatialJusticeBreakdownFa}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              { p: primary, c: cap1 },
              { p: secondary, c: cap2 },
            ].map(({ p, c }) => (
              <div key={p.neighborhoodId} className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{p.neighborhoodNameFa} ({p.districtFa})</span>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    {c.sufficiencyLevel}
                  </span>
                </div>
                <div className="text-slate-300">{c.supplyDemandNoteFa}</div>
                <div className="text-amber-200/90 text-[11px]">{c.educationLimitNoteFa}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const cap1 = evaluateCapacityJusticeAndHistory(primary);
  const scenario = simulateInfrastructureScenario(primary, {
    populationDeltaPercent: popDelta,
    addedHealthCenters: addedClinics,
    addedTransitLines: addedTransit,
    addedCapacityPercent: 10,
  });

  return (
    <div className="space-y-4" data-testid="stage56-history-scenarios-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-emerald-300">شبیه‌ساز سناریوی زیرساختی و تفکیک تاریخ تغییر واقعی</h4>
          <span className="rounded bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-300" data-testid="stage56-scenario-badge">
            {scenario.badgeFa}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-slate-400">تغییر جمعیت فرضی (٪):</span>
            <input
              type="number"
              value={popDelta}
              onChange={(e) => {
                setPopDelta(Number(e.target.value) || 0);
                onFeedbackFa('پارامتر جمعیت در شبیه‌ساز فرضی زیرساخت به‌روزرسانی شد.');
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400">افزودن مرکز درمانی فرضی:</span>
            <input
              type="number"
              min={0}
              value={addedClinics}
              onChange={(e) => setAddedClinics(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400">افزودن خط حمل‌ونقل فرضی:</span>
            <input
              type="number"
              min={0}
              value={addedTransit}
              onChange={(e) => setAddedTransit(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-emerald-200">
            {scenario.estimatedAccessDeltaFa} • {scenario.estimatedCapacityDeltaFa}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-sky-200">
            {cap1.historicalDateIntegrityFa}
          </div>
        </div>
        <p className="text-[11px] text-amber-200/90">{scenario.boundaryNoticeFa}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 text-xs">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
          <div className="font-bold text-emerald-300">
            آزمون‌های پذیرش UI-INF ({STAGE56_ACCEPTANCE_TESTS_18.length} مورد) • رویداد UX: {STAGE56_UX_EVENTS_10.length}
          </div>
          <div className="space-y-1 max-h-36 overflow-y-auto text-[11px] text-slate-300">
            {STAGE56_ACCEPTANCE_TESTS_18.map((item) => (
              <div key={item.id}>
                <span className="font-mono text-emerald-400">{item.id}:</span> {item.checkFa}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3 space-y-2" data-testid="stage57-preview-box">
          <div className="flex items-center justify-between">
            <span className="font-bold text-teal-300">پیش‌نمایش مرحله ۵۷: RT-UI-URBAN-ENVIRONMENT-001</span>
            <span className="rounded bg-teal-500/20 px-2 py-0.5 text-[10px] text-teal-200">۱۰ محور محیط‌زیست</span>
          </div>
          <p className="text-[11px] text-teal-100/90">
            کیفیت محیط‌زیست ویژگی ثابت کل محله نیست؛ دو خیابان در یک محله ممکن است شرایط کاملاً متفاوتی داشته باشند.
          </p>
          <ul className="space-y-1 text-[11px] text-slate-200 max-h-28 overflow-y-auto">
            {STAGE57_ENVIRONMENT_PREVIEW_AXES_10.map((axis) => (
              <li key={axis}>{axis}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
