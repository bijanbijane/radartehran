/** @file src/features/onboarding/components/Stage73StabilityScenariosPrivacyStage74Panel.tsx — Stage 73 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateStabilityScenariosAndPrivacy } from '../services/populationMobilityStage73Engine';
import {
  STAGE73_ACCEPTANCE_TESTS_40,
  STAGE73_REPORT_TYPES_10,
  STAGE73_UX_METRICS_10,
  STAGE74_MARKET_EQUILIBRIUM_PREVIEW_AXES_11,
  type Stage73MobilityZoneProfile,
} from '../services/populationMobilityStage73Types';

interface Props {
  section: 'stability_housing_development' | 'scenarios_privacy_reports_stage74';
  profile: Stage73MobilityZoneProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage73StabilityScenariosPrivacyStage74Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [minThreshold, setMinThreshold] = useState<number>(30);
  const [excludeListings, setExcludeListings] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE73_REPORT_TYPES_10[0]);

  const result = evaluateStabilityScenariosAndPrivacy(
    profile,
    minThreshold,
    excludeListings,
  );

  if (section === 'stability_housing_development') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage73-stability-development-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <span className="font-bold text-indigo-300">ماندگاری مالک/مستأجر، نوسازی و همسان‌سازی مرز تاریخی</span>
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={excludeListings}
              onChange={(e) => setExcludeListings(e.target.checked)}
            />
            <span>منع جایگزینی آگهی مسکن به‌جای جمعیت ساکن</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-1 text-indigo-100">
            <div className="font-bold text-indigo-300">الگوی مالک/مستأجر و ظرفیت نوسازی ≠ جمعیت واقعی</div>
            <p>{result.tenureAndNewBuildCapacityGuardFa}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
            <div className="font-bold text-sky-300">هشدار تغییر مرز تاریخی و برچسب برآورد سناریو</div>
            <p>{result.historicalBoundaryAndScenarioLabelFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage73-scenarios-privacy-stage74-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 text-slate-300">
          <span>حداقل آستانه انتشار آماری (خانوار):</span>
          <input
            type="number"
            min={10}
            max={200}
            value={minThreshold}
            onChange={(e) => setMinThreshold(Number(e.target.value) || 30)}
            className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          />
        </label>

        <select
          aria-label="گزارش جابه‌جایی جمعیت"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با دوره آماری، منبع و کنترل ضدنظارت آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE73_REPORT_TYPES_10.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-3 text-indigo-100 space-y-1">
        <div>{result.antiSurveillanceAndListingNotPopulationGuardFa}</div>
        <div className="text-[11px] text-slate-300">
          ۱۰ معیار UX: {STAGE73_UX_METRICS_10.join(' • ')}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-indigo-300">
            آزمونهای پذیرش RT-UI-URBAN-POPULATION-MOBILITY-ACCEPTANCE-001 ({STAGE73_ACCEPTANCE_TESTS_40.length} آزمون)
          </div>
          {STAGE73_ACCEPTANCE_TESTS_40.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-indigo-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-amber-300">
            پیش‌نمایش مرحله ۷۴: RT-UI-HOUSING-DEMAND-SUPPLY-MARKET-EQUILIBRIUM-001
          </div>
          {STAGE74_MARKET_EQUILIBRIUM_PREVIEW_AXES_11.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
