/** @file src/features/onboarding/components/Stage78SalesGapDomLiquidityPanel.tsx — Stage 78 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import { evaluateSalesGapDomAndLiquidity } from '../services/salesLiquidityStage78Engine';
import {
  STAGE78_FILTERS_17,
  STAGE78_KPI_CARDS_14,
  STAGE78_MAP_LAYERS_10,
  STAGE78_SECTIONS_18,
  type Stage78SalesLiquidityProfile,
} from '../services/salesLiquidityStage78Types';

interface Props {
  section: 'overview_entities_gap' | 'dom_survival_liquidity';
  profiles: ReadonlyArray<Stage78SalesLiquidityProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage78SalesGapDomLiquidityPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [askingBillionPa, setAskingBillionPa] = useState<number>(12);
  const [dealBillionPt, setDealBillionPt] = useState<number>(11);
  const [monthlyHoldMillion, setMonthlyHoldMillion] = useState<number>(12);
  const [waitMonths, setWaitMonths] = useState<number>(6);
  const [includeUnsoldSurvival, setIncludeUnsoldSurvival] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateSalesGapDomAndLiquidity(
    profile,
    askingBillionPa,
    dealBillionPt,
    monthlyHoldMillion,
    waitMonths,
    includeUnsoldSurvival,
  );

  if (section === 'overview_entities_gap') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage78-overview-gap-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(
                    `محله «${p.zoneNameFa}» (${p.districtFa}) با پوشش داده ${p.dataCoveragePct}% انتخاب شد.`,
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
          <span className="text-[11px] text-slate-400">
            پوشش داده: {profile.dataCoveragePct}% • سطح اعتبار: {profile.priceQualityTier}
          </span>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-amber-100">
          <div className="font-bold text-amber-300">
            تمایز ۳ موجودیت مستقل (آگهی ≠ ملک ≠ معامله) و کنترل نبود داده
          </div>
          <p>{result.entitiesSeparationAndQualityGuardFa}</p>
          <p className="text-[11px] text-slate-400">
            {profile.referencePeriodFa} • منبع: {profile.dataSourceFa}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap items-center gap-3 text-slate-300">
            <label className="flex items-center gap-1.5">
              <span>قیمت پیشنهادی Pa (م.م.ت):</span>
              <NumericDraftInput
                allowDecimal
                min={0.5}
                max={100000}
                step={0.5}
                fallback={12}
                value={askingBillionPa}
                onValueChange={setAskingBillionPa}
                className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span>معامله Pt (م.م.ت):</span>
              <NumericDraftInput
                allowDecimal
                min={0.5}
                max={100000}
                step={0.5}
                fallback={11}
                value={dealBillionPt}
                onValueChange={setDealBillionPt}
                className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span>نگهداری ماهانه (م.ت):</span>
              <NumericDraftInput
                allowDecimal
                min={0}
                max={100000}
                fallback={0}
                value={monthlyHoldMillion}
                onValueChange={setMonthlyHoldMillion}
                className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span>انتظار (ماه):</span>
              <NumericDraftInput
                min={1}
                max={240}
                fallback={1}
                value={waitMonths}
                onValueChange={setWaitMonths}
                className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setAskingBillionPa(12);
              setDealBillionPt(11);
              setMonthlyHoldMillion(12);
              setWaitMonths(6);
              onFeedbackFa('نمونه آزمایشی شکاف قیمت (۱۲ به ۱۱ => ۸.۳٪) و هزینه انتظار (۷۲ م.ت) بازنشانی شد.');
            }}
            className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-200 cursor-pointer"
          >
            بازنشانی مثال
          </button>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1 text-slate-200">
          <div className="font-bold text-amber-300">شکاف قیمت پیشنهادی/معامله و هزینه انتظار</div>
          <p>{result.askingGapAndWaitingCostSandboxFa}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-amber-300">
            ۱۸ بخش، ۱۴ کارت KPI، ۱۰ لایه نقشه و ۱۷ فیلتر هماهنگ
          </div>
          <div className="text-[11px] text-slate-300">
            ۱۴ KPI: {STAGE78_KPI_CARDS_14.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۰ لایه: {STAGE78_MAP_LAYERS_10.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۷ فیلتر: {STAGE78_FILTERS_17.join(' • ')} | ۱۸ بخش: {STAGE78_SECTIONS_18.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage78-dom-liquidity-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={includeUnsoldSurvival}
            onChange={(e) => setIncludeUnsoldSurvival(e.target.checked)}
          />
          <span>لحاظ فایل‌های «هنوز فروخته نشده» در تحلیل بقا (جلوگیری از سوگیری بقا)</span>
        </label>
        <span className="text-[11px] text-slate-400">
          DOM={profile.medianDaysOnMarket} روز • تکمیل={profile.medianClosingDurationDays} روز
        </span>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-amber-100">
        <div className="font-bold text-amber-300">
          شاخص نقدشوندگی (L) با پوشش داده + تفکیک DOM از زمان تکمیل معامله
        </div>
        <p>{result.domSurvivalAndLiquidityConfidenceGuardFa}</p>
      </div>
    </div>
  );
};
