/**
 * @file MacroPortfolioArbitrageCard.tsx
 * @module components/stage2
 * @description CASPER Multi-Asset Macro Portfolio & Inflation-Hedging Arbitrage Card.
 * Allows interactive Markowitz asset allocation and swap evaluation across Housing, Gold, USD, and Bonds.
 */

import React, { useState, useMemo } from 'react';
import { Wallet, Sliders, ArrowRightLeft } from 'lucide-react';
import {
  generateCasperMacroPortfolioDossier,
  evaluatePortfolioAllocation,
  evaluateAssetSwapToHousing,
  PortfolioAllocationWeights
} from '../../cells/decision-epistemology/macroPortfolioArbitrageEngine';
import { toPersianNum } from '../../data/neighborhoods';
import type { IntlCurrencyCode } from '../../utils/areaUnit';

export interface MacroPortfolioArbitrageCardProps {
  hoodId?: number;
  hoodName?: string;
  cityKey?: string;
  basePriceSqm?: number;
  intlCurrency?: IntlCurrencyCode;
}

export const MacroPortfolioArbitrageCard: React.FC<MacroPortfolioArbitrageCardProps> = ({
  hoodId = 1,
  hoodName = 'پونک',
  cityKey = 'tehran',
  basePriceSqm = 120,
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<'optimal' | 'inflation' | 'defensive' | 'custom'>('optimal');
  const [customWeights, setCustomWeights] = useState<PortfolioAllocationWeights>({
    housingWeightPct: 50,
    goldWeightPct: 25,
    usdWeightPct: 15,
    fixedIncomeWeightPct: 10,
  });

  const dossier = useMemo(() => {
    return generateCasperMacroPortfolioDossier(hoodId, hoodName, cityKey, basePriceSqm);
  }, [hoodId, hoodName, cityKey, basePriceSqm]);

  const activeEvaluation = useMemo(() => {
    if (selectedStrategy === 'defensive') return dossier.canonicalPortfolios.defensive;
    if (selectedStrategy === 'inflation') return dossier.canonicalPortfolios.inflationHedge;
    if (selectedStrategy === 'optimal') return dossier.canonicalPortfolios.optimalSharpe;
    return evaluatePortfolioAllocation(customWeights, dossier.assets);
  }, [selectedStrategy, customWeights, dossier]);

  const swapAnalysis = useMemo(() => {
    const totalUnitCost = Math.round(dossier.basePriceSqm * 80);
    return evaluateAssetSwapToHousing('GOLD_COIN', dossier.hoodName, totalUnitCost, dossier.assets.HOUSING.cashflowYieldPct);
  }, [dossier]);

  const updateCustomWeight = (field: keyof PortfolioAllocationWeights, value: number) => {
    setCustomWeights((prev) => ({ ...prev, [field]: Math.max(0, Math.min(100, value)) }));
  };

  return (
    <div className="rounded-xl border border-indigo-200/90 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-4 text-slate-800 dark:text-slate-200" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>تخصیص بهینه دارایی مارکوویتز و پوشش ریسک ابرتورم (کسپر)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">{dossier.hoodName}</span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">ماتریس همبستگی ۴ دارایی کلان (مسکن، سکه، دلار و درآمد ثابت ۳۰٪) در اقتصاد ایران</p>
          </div>
        </div>

        {/* Strategy Buttons */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
          {[
            { id: 'optimal' as const, label: 'بهینه شارپ (Tangency)', activeCls: 'text-indigo-700 dark:text-indigo-300' },
            { id: 'inflation' as const, label: 'سپر ابرتورمی', activeCls: 'text-amber-700 dark:text-amber-300' },
            { id: 'defensive' as const, label: 'تدافعی و باثبات', activeCls: 'text-emerald-700 dark:text-emerald-300' },
            { id: 'custom' as const, label: 'وزن‌دهی دستی', activeCls: 'text-purple-700 dark:text-purple-300' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStrategy(tab.id)}
              className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                selectedStrategy === tab.id ? `bg-white dark:bg-slate-900 shadow-xs ${tab.activeCls}` : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">بازده اسمی سالانه (E[R])</span>
          <span className="text-base font-black text-indigo-700 dark:text-indigo-300 tabular-nums">٪{toPersianNum(activeEvaluation.expectedAnnualReturnNominalPct)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">بازده واقعی: {toPersianNum(activeEvaluation.expectedAnnualReturnRealPct)}٪</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">نوسان سالانه سبد (σ)</span>
          <span className="text-base font-black text-slate-800 dark:text-slate-200 tabular-nums">٪{toPersianNum(activeEvaluation.annualVolatilityPct)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">ریسک انحراف معیار</span>
        </div>
        <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">ضریب شارپ (Sharpe)</span>
          <span className="text-base font-black text-emerald-700 dark:text-emerald-300 tabular-nums">{toPersianNum(activeEvaluation.sharpeRatio)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">با نرخ بدون ریسک ۲۴٪</span>
        </div>
        <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">رشد ثروت ۳ ساله</span>
          <span className="text-base font-black text-amber-700 dark:text-amber-300 tabular-nums">{toPersianNum(activeEvaluation.threeYearWealthMultiplier)} برابر</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">افق مرکب ۳۶ ماهه</span>
        </div>
      </div>

      {/* Asset Weights & Custom Sliders */}
      <div className="p-3.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5"><Sliders className="w-3.5 h-3.5 text-indigo-600" /><span>ترکیب تخصیص دارایی در سبد انتخابی</span></span>
          <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-extrabold">{activeEvaluation.portfolioTierFa}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Housing */}
          <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-extrabold text-indigo-700 dark:text-indigo-400">🏠 مسکن ({dossier.hoodName})</span>
              <span className="font-bold tabular-nums">٪{toPersianNum(activeEvaluation.weights.housingWeightPct)}</span>
            </div>
            {selectedStrategy === 'custom' && (
              <input type="range" aria-label="سهم مسکن" min={0} max={100} value={customWeights.housingWeightPct} onChange={(e) => updateCustomWeight('housingWeightPct', Number(e.target.value))} className="w-full accent-indigo-600 h-1.5 cursor-pointer" />
            )}
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>جریان اجاره: {toPersianNum(dossier.assets.HOUSING.cashflowYieldPct)}٪ سالانه</span>
              <span>نقدشوندگی: ۷۵ روز</span>
            </div>
          </div>

          {/* Gold */}
          <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-extrabold text-amber-600 dark:text-amber-400">🥇 سکه بهار آزادی و طلا</span>
              <span className="font-bold tabular-nums">٪{toPersianNum(activeEvaluation.weights.goldWeightPct)}</span>
            </div>
            {selectedStrategy === 'custom' && (
              <input type="range" aria-label="سهم طلا و سکه" min={0} max={100} value={customWeights.goldWeightPct} onChange={(e) => updateCustomWeight('goldWeightPct', Number(e.target.value))} className="w-full accent-amber-500 h-1.5 cursor-pointer" />
            )}
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>همبستگی با دلار: ۸۸٪</span>
              <span>نقدشوندگی: ۱ روز (لحظه‌ای)</span>
            </div>
          </div>

          {/* USD */}
          <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">💵 اسکناس دلار / تتر</span>
              <span className="font-bold tabular-nums">٪{toPersianNum(activeEvaluation.weights.usdWeightPct)}</span>
            </div>
            {selectedStrategy === 'custom' && (
              <input type="range" aria-label="سهم دلار و تتر" min={0} max={100} value={customWeights.usdWeightPct} onChange={(e) => updateCustomWeight('usdWeightPct', Number(e.target.value))} className="w-full accent-emerald-500 h-1.5 cursor-pointer" />
            )}
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>پوشش مستقیم شوک ارزی</span>
              <span>بدون درآمد سود دوره‌ای</span>
            </div>
          </div>

          {/* Fixed Income */}
          <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-extrabold text-sky-600 dark:text-sky-400">🏦 درآمد ثابت و سپرده ۳۰٪</span>
              <span className="font-bold tabular-nums">٪{toPersianNum(activeEvaluation.weights.fixedIncomeWeightPct)}</span>
            </div>
            {selectedStrategy === 'custom' && (
              <input type="range" aria-label="سهم صندوق با درآمد ثابت" min={0} max={100} value={customWeights.fixedIncomeWeightPct} onChange={(e) => updateCustomWeight('fixedIncomeWeightPct', Number(e.target.value))} className="w-full accent-sky-500 h-1.5 cursor-pointer" />
            )}
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>نوسان ناچیز: ۲٫۵٪</span>
              <span>ریسک فرسایش با تورم بالا</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-900 p-2.5 rounded-md border border-slate-100 dark:border-slate-800">
          💡 <strong>تحلیل کسپر:</strong> {activeEvaluation.strategicGuidanceFa}
        </p>
      </div>

      {/* Asset-Swap Arbitrage Panel */}
      <div className="p-3.5 rounded-lg border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/50 via-white to-slate-50/50 dark:from-slate-900 dark:to-indigo-950/20 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
          <span className="flex items-center gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" /><span>آربیتراژ و هزینه فرصت تبدیل طلا/دلار به مسکن ({dossier.hoodName})</span></span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-extrabold">سربه‌سر: {toPersianNum(swapAnalysis.breakEvenMonths)} ماه</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
          <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 block text-[10px]">هزینه اصطکاک ورود (کمیسیون+مالیات):</span>
            <strong className="text-slate-700 dark:text-slate-200 tabular-nums">{toPersianNum(swapAnalysis.transactionFrictionCostMillion)} میلیون تومان (۱٫۵٪)</strong>
          </div>
          <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 block text-[10px]">جریان نقدی اجاره سالانه مسکن:</span>
            <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">+{toPersianNum(swapAnalysis.annualRentalYieldMillion)} میلیون تومان/سال</strong>
          </div>
          <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 block text-[10px]">مزیت خالص ریالی دو ساله:</span>
            <strong className="text-indigo-600 dark:text-indigo-400 tabular-nums">+{toPersianNum(swapAnalysis.twoYearNetArbitrageAdvantageMillion)} م.ت برتری نسبت به طلا</strong>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          ✓ {swapAnalysis.verdictFa} برخلاف طلا و دلار که فاقد بازده نقدی دوره‌ای هستند، ملک مسکونی به واسطه جریان نقدینگی اجاره، در یک دوره ۲۴ ماهه زیان ناشی از اصطکاک اولیه معامله را جبران نموده و پوشش تورمی پایداری ایجاد می‌کند.
        </p>
      </div>
    </div>
  );
};
