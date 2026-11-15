/** @file src/features/onboarding/components/Stage80CostIndexMaterialsEquipmentPanel.tsx — Stage 80 Tabs 1 & 2 Panel */
import React from 'react';
import { evaluateConstructionCostMaterialsAndSafety } from '../services/constructionEconomicsStage80Engine';
import {
  STAGE80_FILTERS_14,
  STAGE80_KPI_CARDS_14,
  STAGE80_PHASES_16,
  STAGE80_SECTIONS_22,
  type Stage80ConstructionProfile,
} from '../services/constructionEconomicsStage80Types';

interface Props {
  section: 'overview_floor_basis' | 'materials_safety_duplicates';
  profiles: ReadonlyArray<Stage80ConstructionProfile>;
  selectedProjectId: string;
  onSelectProjectId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage80CostIndexMaterialsEquipmentPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedProjectId,
  onSelectProjectId,
  onFeedbackFa,
}) => {
  const profile = profiles.find((p) => p.projectId === selectedProjectId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateConstructionCostMaterialsAndSafety(profile);

  if (section === 'overview_floor_basis') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage80-overview-floor-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.projectId}
                type="button"
                onClick={() => {
                  onSelectProjectId(p.projectId);
                  onFeedbackFa(`پروژه «${p.projectNameFa}» (${p.districtFa}) انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.projectId === profile.projectId
                    ? 'border-orange-400 bg-orange-500/20 text-orange-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.projectNameFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            مبنای متراژ: {profile.floorAreaBasisFa} • ناخالص: {profile.grossAreaSqm} م²
          </span>
        </div>

        <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-3 space-y-1 text-orange-100">
          <div className="font-bold text-orange-300">
            قلم هزینه ≠ فعالیت ≠ پروژه | زیربنای ناخالص ≠ زیربنای مفید
          </div>
          <p>{result.entitiesAndFloorAreaBasisGuardFa}</p>
          <p className="text-[11px] text-slate-400">منبع: {profile.dataSourceFa}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-orange-300">
            ۲۲ بخش، ۱۴ کارت KPI، ۱۴ فیلتر و ۱۶ فاز اجرایی
          </div>
          <div className="text-[11px] text-slate-300">
            ۱۴ KPI: {STAGE80_KPI_CARDS_14.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۶ فاز اجرایی: {STAGE80_PHASES_16.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۴ فیلتر: {STAGE80_FILTERS_14.join(' • ')} | ۲۲ بخش: {STAGE80_SECTIONS_22.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage80-materials-safety-panel">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-3 space-y-1 text-orange-100">
          <div className="font-bold text-orange-300">نقل‌قول فروشنده ≠ خرید پیمانکار و دستمزد ≠ کارمزد</div>
          <p>{result.materialQuoteVsContractorAndStage93GuardFa}</p>
        </div>
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-100">
          <div className="font-bold text-rose-300">فاکتورهای تکراری (منع حذف خودکار) و ایمنی گودبرداری</div>
          <p>{result.excavationSafetyAndDuplicateInvoiceGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
