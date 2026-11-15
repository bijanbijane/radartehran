/** @file src/features/onboarding/components/Stage73FlowsAndDemographicsPanel.tsx — Stage 73 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateFlowsAndDemographicStructure } from '../services/populationMobilityStage73Engine';
import {
  STAGE73_FILTER_FIELDS_16,
  STAGE73_KPI_CARDS_8,
  STAGE73_MAP_LAYERS_11,
  STAGE73_TENURE_BUCKETS_5,
  type Stage73MobilityZoneProfile,
} from '../services/populationMobilityStage73Types';

interface Props {
  section: 'overview_flows_od' | 'age_household_intercity';
  profiles: ReadonlyArray<Stage73MobilityZoneProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage73FlowsAndDemographicsPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [hasOdSourceData, setHasOdSourceData] = useState<boolean>(true);
  const [groupAgeFilterStrict, setGroupAgeFilterStrict] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateFlowsAndDemographicStructure(
    profile,
    hasOdSourceData,
    groupAgeFilterStrict,
  );

  if (section === 'overview_flows_od') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage73-overview-flows-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(
                    `محله «${p.zoneNameFa}» (${p.districtFa}) انتخاب شد — وضعیت: ${p.trajectoryStatusFa}.`,
                  );
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={hasOdSourceData}
              onChange={(e) => setHasOdSourceData(e.target.checked)}
            />
            <span>داده مبدأ-مقصد تجمیعی معتبر (خط جریان ≠ مسیر فیزیکی)</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-1 text-indigo-100">
            <div className="font-bold text-indigo-300">تفکیک سه‌گانه و خالص جابه‌جایی (NM = I − O)</div>
            <p>{result.threeWayConceptAndNetMigrationFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1 text-slate-200">
            <div className="font-bold text-cyan-300">خطوط مبدأ-مقصد و مرز مهاجرت بین‌شهری</div>
            <p>{result.flowLinesAndInterCityGuardFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-indigo-300">
            ۸ کارت KPI، ۱۱ لایه نقشه و ۱۶ فیلتر مستقل
          </div>
          <div className="text-[11px] text-slate-300">
            ۸ KPI: {STAGE73_KPI_CARDS_8.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۱ لایه نقشه: {STAGE73_MAP_LAYERS_11.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۶ فیلتر: {STAGE73_FILTER_FIELDS_16.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage73-age-household-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={groupAgeFilterStrict}
            onChange={(e) => setGroupAgeFilterStrict(e.target.checked)}
          />
          <span>به‌روزرسانی متقابل هرم سنی بدون استنباط فردی/هویتی</span>
        </label>
        <span className="text-[11px] text-slate-400">منبع: {profile.dataSourceFa}</span>
      </div>

      <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-1.5 text-indigo-100">
        <div className="font-bold text-indigo-300">اندازه خانوار، تقاضای مسکن (تحلیل آماری ≠ علیت) و هرم سنی</div>
        <p>{result.householdAndHousingCorrelationGuardFa}</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
        <div className="text-[11px] text-slate-300">
          ۵ بازه ماندگاری سکونت: {STAGE73_TENURE_BUCKETS_5.join(' • ')}
        </div>
        <div className="text-[11px] text-slate-400">
          بازه مرجع: {profile.referencePeriodFa} • اطمینان: {profile.confidenceLevelFa}
        </div>
      </div>
    </div>
  );
};
