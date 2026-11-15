/** @file src/features/onboarding/components/Stage81LandIndexParcelUseCapacityPanel.tsx — Stage 81 Tabs 1 & 2 Panel */
import React from 'react';
import { evaluateParcelUseAndCapacity } from '../services/urbanLandMarketStage81Engine';
import {
  STAGE81_ATLAS_LAYERS_15,
  STAGE81_FILTERS_14,
  STAGE81_KPI_CARDS_16,
  STAGE81_SECTIONS_24,
  type Stage81LandParcelProfile,
} from '../services/urbanLandMarketStage81Types';

interface Props {
  section: 'overview_entities_atlas' | 'use_capacity_areas';
  profiles: ReadonlyArray<Stage81LandParcelProfile>;
  selectedParcelId: string;
  onSelectParcelId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage81LandIndexParcelUseCapacityPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedParcelId,
  onSelectParcelId,
  onFeedbackFa,
}) => {
  const profile = profiles.find((p) => p.parcelId === selectedParcelId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateParcelUseAndCapacity(profile);

  if (section === 'overview_entities_atlas') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage81-overview-atlas-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.parcelId}
                type="button"
                onClick={() => {
                  onSelectParcelId(p.parcelId);
                  onFeedbackFa(`قطعه «${p.parcelLabelFa}» (${p.districtFa}) انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.parcelId === profile.parcelId
                    ? 'border-lime-400 bg-lime-500/20 text-lime-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.parcelLabelFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            مبنای قیمت: {profile.landValuationBasis}
          </span>
        </div>

        <div className="rounded-lg border border-lime-500/30 bg-lime-950/20 p-3 space-y-1 text-lime-100">
          <div className="font-bold text-lime-300">
            ۴ موجودیت مستقل (قطعه زمین ≠ کاربری ≠ مالکیت ≠ ارزش) و ۳ مبنای قیمت
          </div>
          <p>{result.fourEntitiesAndPriceBasisGuardFa}</p>
          <p className="text-[11px] text-slate-400">منبع: {profile.dataSourceFa}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-lime-300">
            ۲۴ بخش، ۱۶ کارت KPI، ۱۵ لایه اطلس و ۱۴ فیلتر
          </div>
          <div className="text-[11px] text-slate-300">
            ۱۶ KPI: {STAGE81_KPI_CARDS_16.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۵ لایه اطلس: {STAGE81_ATLAS_LAYERS_15.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۴ فیلتر: {STAGE81_FILTERS_14.join(' • ')} | ۲۴ بخش: {STAGE81_SECTIONS_24.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage81-use-capacity-panel">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-lime-500/30 bg-lime-950/20 p-3 space-y-1 text-lime-100">
          <div className="font-bold text-lime-300">کاربری موجود/مصوب/سناریو و ظرفیت نظری/قانونی/اقتصادی</div>
          <p>{result.threeUsesAndThreeCapacitiesGuardFa}</p>
        </div>
        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
          <div className="font-bold text-sky-300">تفاوت مساحت سندی/قابل استفاده و تفکیک فرضی ≠ ثبتی</div>
          <p>{result.areaMismatchAndHypotheticalSubdivisionGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
