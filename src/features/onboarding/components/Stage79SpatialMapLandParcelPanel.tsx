/** @file src/features/onboarding/components/Stage79SpatialMapLandParcelPanel.tsx — Stage 79 Tabs 1 & 2 Panel */
import React from 'react';
import { evaluateSpatialParcelOpportunity } from '../services/investmentOpportunityStage79Engine';
import {
  STAGE79_FILTERS_12,
  STAGE79_KPI_CARDS_11,
  STAGE79_MAP_LAYERS_15,
  STAGE79_SECTIONS_20,
  type Stage79InvestmentProfile,
} from '../services/investmentOpportunityStage79Types';

interface Props {
  section: 'spatial_discovery_ranking' | 'land_far_consolidation';
  profiles: ReadonlyArray<Stage79InvestmentProfile>;
  selectedOpportunityId: string;
  onSelectOpportunityId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage79SpatialMapLandParcelPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedOpportunityId,
  onSelectOpportunityId,
  onFeedbackFa,
}) => {
  const profile =
    profiles.find((p) => p.opportunityId === selectedOpportunityId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateSpatialParcelOpportunity(profile);

  if (section === 'spatial_discovery_ranking') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage79-spatial-ranking-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.opportunityId}
                type="button"
                onClick={() => {
                  onSelectOpportunityId(p.opportunityId);
                  onFeedbackFa(`فرصت «${p.titleFa}» (${p.districtFa}) با پوشش ${p.dataCoveragePct}% انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.opportunityId === profile.opportunityId
                    ? 'border-violet-400 bg-violet-500/20 text-violet-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            پوشش داده: {profile.dataCoveragePct}% • اطمینان: {profile.confidenceLevelFa}
          </span>
        </div>

        <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 space-y-1 text-violet-100">
          <div className="font-bold text-violet-300">
            مصرف‌کننده زیرسامانه‌های رادار و برچسب «تناسب با معیارهای انتخاب‌شده»
          </div>
          <p>{result.upstreamConsumerAndFitRankingGuardFa}</p>
          <p className="text-[11px] text-slate-400">منشأ: {profile.dataSourceFa}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-violet-300">
            ۲۰ بخش، ۱۱ کارت KPI، ۱۵ لایه نقشه و ۱۲ فیلتر هماهنگ
          </div>
          <div className="text-[11px] text-slate-300">
            ۱۱ KPI: {STAGE79_KPI_CARDS_11.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۵ لایه نقشه: {STAGE79_MAP_LAYERS_15.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۲ فیلتر: {STAGE79_FILTERS_12.join(' • ')} | ۲۰ بخش: {STAGE79_SECTIONS_20.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage79-land-consolidation-panel">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 space-y-1 text-violet-100">
          <div className="font-bold text-violet-300">تفکیک ۳ قیمت زمین و ظرفیت قانونی ≠ اقتصادی</div>
          <p>{result.landPriceAndFarCapacityGuardFa}</p>
        </div>
        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
          <div className="font-bold text-sky-300">تجمیع پلاک و بازآفرینی دومتغیره (اقتصادی + ارزش عمومی)</div>
          <p>{result.consolidationAndRegenerationDualAxisGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
