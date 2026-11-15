/** @file src/features/onboarding/components/Stage84DashboardInflationFxCyclesPanel.tsx — Stage 84 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateInflationFxAndCycles } from '../services/urbanMacroeconomicsStage84Engine';
import {
  STAGE84_ATLAS_LAYERS_9,
  STAGE84_SECTIONS_21,
  STAGE84_STATUS_KPIS_10,
  STAGE84_UI_STATES_7,
  type Stage84MacroRegionProfile,
} from '../services/urbanMacroeconomicsStage84Types';

interface Props {
  section: 'macro_dashboard_inflation' | 'fx_interest_cycles';
  profiles: ReadonlyArray<Stage84MacroRegionProfile>;
  selectedProfileId: string;
  onSelectProfileId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage84DashboardInflationFxCyclesPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedProfileId,
  onSelectProfileId,
  onFeedbackFa,
}) => {
  const [fxShockPct, setFxShockPct] = useState<number>(20);
  const [loanBillion, setLoanBillion] = useState<number>(2);
  const [annualInterestPct, setAnnualInterestPct] = useState<number>(24);
  const [termYears, setTermYears] = useState<number>(10);

  const profile = profiles.find((p) => p.profileId === selectedProfileId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateInflationFxAndCycles(
    profile,
    fxShockPct,
    loanBillion,
    annualInterestPct,
    termYears,
  );

  if (section === 'macro_dashboard_inflation') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage84-dashboard-inflation-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.profileId}
                type="button"
                onClick={() => {
                  onSelectProfileId(p.profileId);
                  onFeedbackFa(`پروفایل کلان «${p.regionLabelFa}» انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.profileId === profile.profileId
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.regionLabelFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            کیفیت داده: {profile.dataQualityLabel} • مشاهدات: {profile.observationMonthsCount} ماه
          </span>
        </div>

        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-1 text-cyan-100">
          <div className="font-bold text-cyan-300">
            تفکیک اقتصاد ملی از شهری + قیمت اسمی در برابر واقعی (۳ سطح داده/تحلیل/تفسیر)
          </div>
          <p>{result.geoSeparationAndRealVsNominalGuardFa}</p>
          <p className="text-[11px] text-slate-400">
            {profile.referencePeriodFa} • منبع: {profile.dataSourceFa}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-cyan-300">
            ۲۱ بخش ماژول، ۱۰ کارت وضعیت، ۹ لایه اطلس و ۷ وضعیت سیستمی
          </div>
          <div className="text-[11px] text-slate-300">
            ۱۰ کارت وضعیت: {STAGE84_STATUS_KPIS_10.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۹ لایه اطلس: {STAGE84_ATLAS_LAYERS_9.join(' • ')} | ۷ وضعیت رابط: {STAGE84_UI_STATES_7.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۲۱ بخش: {STAGE84_SECTIONS_21.map((s) => `${s.titleFa} (${s.id})`).join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage84-fx-cycles-panel">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300">
        <label className="flex items-center gap-1.5">
          <span>شوک فرضی ارز (%):</span>
          <input
            type="number"
            min={0}
            max={200}
            value={fxShockPct}
            onChange={(e) => setFxShockPct(Number(e.target.value) || 0)}
            className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span>مبلغ وام (م.م.ت):</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={loanBillion}
            onChange={(e) => setLoanBillion(Number(e.target.value) || 1)}
            className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span>نرخ تسهیلات (%):</span>
          <input
            type="number"
            min={1}
            max={60}
            value={annualInterestPct}
            onChange={(e) => setAnnualInterestPct(Number(e.target.value) || 24)}
            className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span>مدت (سال):</span>
          <input
            type="number"
            min={1}
            max={30}
            value={termYears}
            onChange={(e) => setTermYears(Number(e.target.value) || 10)}
            className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-1 text-cyan-100">
          <div className="font-bold text-cyan-300">انتقال سناریویی ارز به هزینه ساخت و چرخه‌های ناهم‌زمان</div>
          <p>{result.fxPassThroughAndAsyncCyclesGuardFa}</p>
        </div>
        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
          <div className="font-bold text-sky-300">ماشین‌حساب اقساط (محاسبه‌گر، نه توصیه‌گر اعتباری)</div>
          <p>{result.mortgageCalculatorGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
