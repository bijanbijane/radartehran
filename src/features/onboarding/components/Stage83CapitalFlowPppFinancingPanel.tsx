/** @file src/features/onboarding/components/Stage83CapitalFlowPppFinancingPanel.tsx — Stage 83 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateCapitalFlowAndPpp } from '../services/urbanInvestmentStage83Engine';
import {
  STAGE83_FILTERS_12,
  STAGE83_KPI_CARDS_14,
  STAGE83_SECTIONS_28,
  type Stage83CapitalProjectProfile,
} from '../services/urbanInvestmentStage83Types';

interface Props {
  section: 'overview_funnels_atlas' | 'ppp_wacc_jv';
  profiles: ReadonlyArray<Stage83CapitalProjectProfile>;
  selectedProjectId: string;
  onSelectProjectId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage83CapitalFlowPppFinancingPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedProjectId,
  onSelectProjectId,
  onFeedbackFa,
}) => {
  const [debtSharePct, setDebtSharePct] = useState<number>(40);

  const profile = profiles.find((p) => p.projectId === selectedProjectId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateCapitalFlowAndPpp(profile, debtSharePct);

  if (section === 'overview_funnels_atlas') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage83-overview-funnels-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.projectId}
                type="button"
                onClick={() => {
                  onSelectProjectId(p.projectId);
                  onFeedbackFa(`پروژه «${p.projectTitleFa}» (${p.districtFa}) انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.projectId === profile.projectId
                    ? 'border-rose-400 bg-rose-500/20 text-rose-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.projectTitleFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            مدل: {profile.financingModelFa}
          </span>
        </div>

        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-100">
          <div className="font-bold text-rose-300">
            ۵ موجودیت مستقل و ۴ قیف سرمایه (اعلام‌شده ≠ تعهدشده ≠ تأمین‌شده ≠ مصرف‌شده)
          </div>
          <p>{result.fiveEntitiesAndFourFunnelsGuardFa}</p>
          <p className="text-[11px] text-slate-400">منبع: {profile.dataSourceFa}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-rose-300">
            ۲۸ بخش، ۱۴ کارت KPI و ۱۲ فیلتر هماهنگ
          </div>
          <div className="text-[11px] text-slate-300">
            ۱۴ KPI: {STAGE83_KPI_CARDS_14.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۲ فیلتر: {STAGE83_FILTERS_12.join(' • ')} | ۲۸ بخش: {STAGE83_SECTIONS_28.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage83-ppp-wacc-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 text-slate-300">
          <span>نسبت بدهی در ساختار سرمایه (%):</span>
          <input
            type="number"
            min={0}
            max={100}
            value={debtSharePct}
            onChange={(e) => setDebtSharePct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          />
        </label>
        <span className="text-[11px] text-slate-400">
          بدهی {profile.costOfDebtPct}% • آورده {profile.costOfEquityPct}%
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-100">
          <div className="font-bold text-rose-300">تمرکز فضایی سرمایه و تعهدات بلندمدت PPP</div>
          <p>{result.spatialConcentrationAndPppFiscalGuardFa}</p>
        </div>
        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
          <div className="font-bold text-sky-300">WACC (متمایز از نرخ سود بانکی) و مشارکت در ساخت</div>
          <p>{result.waccVsBankRateAndJointVentureGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
