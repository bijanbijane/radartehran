/** @file src/features/onboarding/components/Stage77SupplyOutliersConversionPanel.tsx — Stage 77 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import { evaluateRentalSupplyOutliersAndConversion } from '../services/rentalMarketStage77Engine';
import {
  STAGE77_FILTERS_16,
  STAGE77_KPI_CARDS_12,
  STAGE77_MAP_LAYERS_10,
  STAGE77_SECTIONS_16,
  type Stage77RentalZoneProfile,
} from '../services/rentalMarketStage77Types';

interface Props {
  section: 'overview_supply_dedup' | 'price_outliers_rahn_conversion';
  profiles: ReadonlyArray<Stage77RentalZoneProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage77SupplyOutliersConversionPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [monthlyRentRm, setMonthlyRentRm] = useState<number>(8);
  const [depositD, setDepositD] = useState<number>(600);
  const [annualRatePct, setAnnualRatePct] = useState<number>(30);
  const [excludeOutliers, setExcludeOutliers] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateRentalSupplyOutliersAndConversion(
    profile,
    monthlyRentRm,
    depositD,
    annualRatePct,
    excludeOutliers,
  );

  if (section === 'overview_supply_dedup') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage77-overview-supply-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(
                    `محله «${p.zoneNameFa}» (${p.districtFa}) با پوشش داده ${p.sampleCoveragePct}% انتخاب شد.`,
                  );
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-teal-400 bg-teal-500/20 text-teal-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            پوشش داده: {profile.sampleCoveragePct}% • اطمینان: {profile.confidenceLevelFa}
          </span>
        </div>

        <div className="rounded-lg border border-teal-500/30 bg-teal-950/20 p-3 space-y-1 text-teal-100">
          <div className="font-bold text-teal-300">
            قیمت آگهی ≠ قرارداد | ودیعه و اجاره مستقل | تشخیص تکرار ۳وضعیتی
          </div>
          <p>{result.askingVsContractAndDedupGuardFa}</p>
          <p className="text-[11px] text-slate-400">
            {profile.referencePeriodFa} • منبع: {profile.dataSourceFa}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-teal-300">
            ۱۶ بخش، ۱۲ کارت KPI، ۱۰ لایه نقشه و ۱۶ فیلتر مشترک
          </div>
          <div className="text-[11px] text-slate-300">
            ۱۲ KPI: {STAGE77_KPI_CARDS_12.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۰ لایه نقشه: {STAGE77_MAP_LAYERS_10.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۶ فیلتر: {STAGE77_FILTERS_16.join(' • ')} | ۱۶ بخش: {STAGE77_SECTIONS_16.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage77-price-conversion-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center gap-3 text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeOutliers}
              onChange={(e) => setExcludeOutliers(e.target.checked)}
            />
            <span>حذف نمونه‌های پرت قیمت با روش IQR و نمایش مقایسه</span>
          </label>
          <label className="flex items-center gap-1.5">
            <span>نرخ تبدیل سالانه r (%):</span>
            <NumericDraftInput
              allowDecimal
              min={5}
              max={100}
              fallback={30}
              value={annualRatePct}
              onValueChange={setAnnualRatePct}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>ودیعه (م.ت):</span>
            <NumericDraftInput
              allowDecimal
              min={0}
              max={10000}
              fallback={0}
              value={depositD}
              onValueChange={setDepositD}
              className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>اجاره (م.ت):</span>
            <NumericDraftInput
              allowDecimal
              min={0}
              max={500}
              fallback={0}
              value={monthlyRentRm}
              onValueChange={setMonthlyRentRm}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            setMonthlyRentRm(8);
            setDepositD(600);
            setAnnualRatePct(30);
            onFeedbackFa('مقادیر مثال آزمایشی تبدیل ودیعه (۶۰۰م ودیعه، ۸م اجاره، ۳۰٪) بازنشانی شد.');
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-200 cursor-pointer"
        >
          بازنشانی مثال
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-teal-500/30 bg-teal-950/20 p-3 space-y-1 text-teal-100">
          <div className="font-bold text-teal-300">میانگین هم‌زمان با میانه، چارک‌ها و کنترل پرت</div>
          <p>{result.distributionAndOutliersComparisonFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1 text-slate-200">
          <div className="font-bold text-cyan-300">فرمول معادل اجاره ماهانه (مثال آموزشی، نه نرخ واقعی)</div>
          <p>{result.rahnEquivalentFormulaAndSandboxFa}</p>
        </div>
      </div>
    </div>
  );
};
