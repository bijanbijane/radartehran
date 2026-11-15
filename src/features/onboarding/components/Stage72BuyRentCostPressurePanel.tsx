/** @file src/features/onboarding/components/Stage72BuyRentCostPressurePanel.tsx — Stage 72 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateBuyRentAndCostPressure } from '../services/housingAffordabilityStage72Engine';
import {
  STAGE72_ANCILLARY_COST_CATEGORIES_7,
  STAGE72_FILTER_FIELDS_18,
  STAGE72_HOUSEHOLD_GROUPS_8,
  STAGE72_KPI_CARDS_6,
  STAGE72_MAP_LAYERS_9,
  type Stage72AffordabilityZoneProfile,
} from '../services/housingAffordabilityStage72Types';

interface Props {
  section: 'overview_buy_pti' | 'rent_hcr_ancillary_groups';
  profiles: ReadonlyArray<Stage72AffordabilityZoneProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage72BuyRentCostPressurePanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [userMonthlyIncomeMillion, setUserMonthlyIncomeMillion] = useState<number>(0);
  const [conversionRatePer100M, setConversionRatePer100M] = useState<number>(3);
  const [separateCommute, setSeparateCommute] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateBuyRentAndCostPressure(
    profile,
    userMonthlyIncomeMillion,
    conversionRatePer100M,
    separateCommute,
  );

  if (section === 'overview_buy_pti') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage72-overview-buy-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(
                    `محله «${p.zoneNameFa}» (${p.districtFa}) انتخاب شد — وضعیت: ${p.affordableStatusFa}.`,
                  );
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-slate-300">
            <span>درآمد نشست شما (م.ت، ۰=مرجع):</span>
            <input
              type="number"
              min={0}
              max={500}
              value={userMonthlyIncomeMillion}
              onChange={(e) => setUserMonthlyIncomeMillion(Number(e.target.value) || 0)}
              className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1 text-emerald-100">
            <div className="font-bold text-emerald-300">شاخص PTI و منع هم‌ارزسازی با سال‌های پس‌انداز</div>
            <p>{result.ptiFormulaAndSavingsWarningFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1 text-slate-200">
            <div className="font-bold text-cyan-300">ماشین‌حساب قدرت خرید (۳ وضعیت مستقل)</div>
            <p>{result.buyThreeScenariosFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-emerald-300">
            ۶ کارت KPI، ۹ لایه نقشه اقتصادی و ۱۸ فیلتر تخصصی
          </div>
          <div className="text-[11px] text-slate-300">
            ۶ KPI: {STAGE72_KPI_CARDS_6.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۹ لایه نقشه: {STAGE72_MAP_LAYERS_9.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۸ فیلتر: {STAGE72_FILTER_FIELDS_18.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage72-rent-hcr-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center gap-3 text-slate-300">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={separateCommute}
              onChange={(e) => setSeparateCommute(e.target.checked)}
            />
            <span>تفکیک هزینه رفت‌وآمد از هزینه مستقیم مسکن در HCR</span>
          </label>
          <label className="flex items-center gap-2">
            <span>نرخ تبدیل هر ۱۰۰ م.ت ودیعه (م.ت اجاره):</span>
            <input
              type="number"
              step={0.1}
              min={1}
              max={10}
              value={conversionRatePer100M}
              onChange={(e) => setConversionRatePer100M(Number(e.target.value) || 3)}
              className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
        </div>
        <span className="text-[11px] text-slate-400">نمونه: {profile.sampleSizeCount} مورد</span>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1.5 text-emerald-100">
        <div className="font-bold text-emerald-300">نسبت فشار هزینه مسکن (HCR) و نرخ تبدیل قابل ویرایش</div>
        <p>{result.hcrHousingVsCommuteAndMissingGuardFa}</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
        <div className="text-[11px] text-slate-300">
          ۷ رده هزینه‌های جانبی سکونت: {STAGE72_ANCILLARY_COST_CATEGORIES_7.join(' • ')}
        </div>
        <div className="text-[11px] text-slate-400">
          ۸ گروه خانوار (تنها با داده تجمیعی): {STAGE72_HOUSEHOLD_GROUPS_8.join(' • ')}
        </div>
      </div>
    </div>
  );
};
