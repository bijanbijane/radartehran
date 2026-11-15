/** @file src/features/onboarding/components/Stage74SupplyDemandSeparationPanel.tsx — Stage 74 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateFiveConceptsAndSupplyDemand } from '../services/housingDemandSupplyStage74Engine';
import {
  STAGE74_AREA_BRACKETS_5,
  STAGE74_KPI_CARDS_8,
  STAGE74_VACANCY_CLASSES_4,
  type Stage74MarketEquilibriumProfile,
} from '../services/housingDemandSupplyStage74Types';

interface Props {
  section: 'overview_five_concepts' | 'vacancies_pipeline_motive';
  profiles: ReadonlyArray<Stage74MarketEquilibriumProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage74SupplyDemandSeparationPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [deduplicateListings, setDeduplicateListings] = useState<boolean>(true);
  const [excludeNonMarketVacancies, setExcludeNonMarketVacancies] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateFiveConceptsAndSupplyDemand(
    profile,
    deduplicateListings,
    excludeNonMarketVacancies,
  );

  if (section === 'overview_five_concepts') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage74-overview-five-concepts-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(
                    `محله «${p.zoneNameFa}» (${p.districtFa}) انتخاب شد — وضعیت تعادل: ${p.equilibriumStatusFa}.`,
                  );
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
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
              checked={deduplicateListings}
              onChange={(e) => setDeduplicateListings(e.target.checked)}
            />
            <span>حذف دوباره-شماری آگهی‌ها و تفکیک واحد یکتا</span>
          </label>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-amber-100">
          <div className="font-bold text-amber-300">
            تفکیک ۵ مفهوم کلیدی و ۴ سطح عرضه فعال (آگهی خام تا واحد تأییدشده)
          </div>
          <p>{result.fiveConceptsAndDeduplicationGuardFa}</p>
          <p className="text-[11px] text-slate-400">
            {profile.referencePeriodFa} • منبع: {profile.dataSourceFa} • اطمینان: {profile.confidenceLevelFa}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-amber-300">
            ۸ کارت KPI تعادل بازار و ۵ گروه متراژی قابل تنظیم
          </div>
          <div className="text-[11px] text-slate-300">
            ۸ KPI: {STAGE74_KPI_CARDS_8.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۵ رده متراژ: {STAGE74_AREA_BRACKETS_5.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage74-vacancies-pipeline-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={excludeNonMarketVacancies}
            onChange={(e) => setExcludeNonMarketVacancies(e.target.checked)}
          />
          <span>تفکیک واحدهای خالی غیرقابل‌عرضه از عرضه فعال بازار</span>
        </label>
        <span className="text-[11px] text-slate-400">
          ۴ رده خالی: {STAGE74_VACANCY_CLASSES_4.join(' / ')}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-amber-100">
          <div className="font-bold text-amber-300">واحدهای خالی و پروانه‌های ساخت ≠ عرضه قطعی</div>
          <p>{result.vacantAndPipelineNotGuaranteedSupplyGuardFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1 text-slate-200">
          <div className="font-bold text-emerald-300">تقاضای مصرفی/سرمایه‌ای، بازدید ≠ خریدار و آزادی متراژ</div>
          <p>{result.motiveViewsAndNeedsFreedomGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
