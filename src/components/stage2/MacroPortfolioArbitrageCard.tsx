/**
 * @file MacroPortfolioArbitrageCard.tsx
 * @module components/stage2
 * @description CASPER Multi-Asset Macro Portfolio & Inflation-Hedging Arbitrage Card.
 * Allows interactive Markowitz asset allocation and swap evaluation across Housing, Gold, USD, and Bonds.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Wallet, Sliders, ArrowRightLeft } from 'lucide-react';
import {
  generateCasperMacroPortfolioDossier,
  evaluatePortfolioAllocation,
  evaluateAssetSwapToHousing,
  PortfolioAllocationWeights
} from '../../cells/decision-epistemology/macroPortfolioArbitrageEngine';
import { toPersianNum, type Neighborhood } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

export interface MacroPortfolioArbitrageCardProps {
  hoodId?: number;
  hoodName?: string;
  cityKey?: string;
  basePriceSqm?: number;
  intlCurrency?: IntlCurrencyCode;
  hood?: Neighborhood;
  targetSqm?: number;
}

export const MacroPortfolioArbitrageCard: React.FC<MacroPortfolioArbitrageCardProps> = ({
  hoodId = 1,
  hoodName = 'پونک',
  cityKey = 'tehran',
  basePriceSqm = 120,
  intlCurrency = 'USD',
  hood,
  targetSqm = 80,
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<'optimal' | 'inflation' | 'defensive' | 'custom'>('optimal');
  const [swapSourceAsset, setSwapSourceAsset] = useState<'GOLD_COIN' | 'US_DOLLAR' | 'FIXED_INCOME'>('GOLD_COIN');
  const [capitalBillion, setCapitalBillion] = useState<number>(() => Math.max(2, Math.round((basePriceSqm * targetSqm) / 1000)));
  const [customWeights, setCustomWeights] = useState<PortfolioAllocationWeights>({
    housingWeightPct: 50,
    goldWeightPct: 25,
    usdWeightPct: 15,
    fixedIncomeWeightPct: 10,
  });

  const dossier = useMemo(() => {
    return generateCasperMacroPortfolioDossier(hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency, targetSqm);
  }, [hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency, targetSqm]);

  useEffect(() => {
    setCapitalBillion(Math.max(2, Math.round((dossier.basePriceSqm * targetSqm) / 1000)));
  }, [dossier.basePriceSqm, targetSqm, hoodId, cityKey]);

  const activeEvaluation = useMemo(() => {
    if (selectedStrategy === 'defensive') return dossier.canonicalPortfolios.defensive;
    if (selectedStrategy === 'inflation') return dossier.canonicalPortfolios.inflationHedge;
    if (selectedStrategy === 'optimal') return dossier.canonicalPortfolios.optimalSharpe;
    return evaluatePortfolioAllocation(customWeights, dossier.assets);
  }, [selectedStrategy, customWeights, dossier]);

  const capitalMillion = capitalBillion * 1000;
  const allocMillion = (pct: number) => Math.round((capitalMillion * pct) / 100);

  const swapAnalysis = useMemo(() => {
    return evaluateAssetSwapToHousing(swapSourceAsset, dossier.hoodName, capitalMillion, dossier.assets.HOUSING.cashflowYieldPct);
  }, [swapSourceAsset, dossier, capitalMillion]);
  const swapAdvantageFx = intlCurrency !== 'IRT'
    ? ` (${formatMillionTomanAsIntlCurrency(swapAnalysis.twoYearNetArbitrageAdvantageMillion, intlCurrency, 'fa')})`
    : '';

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
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>تخصیص بهینه دارایی مارکوویتز و پوشش ریسک ابرتورم</span>
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
          <span className="text-base font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">٪{toPersianNum(activeEvaluation.expectedAnnualReturnNominalPct)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">بازده واقعی: {toPersianNum(activeEvaluation.expectedAnnualReturnRealPct)}٪</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">نوسان (σ) و نقدشوندگی سبد</span>
          <span className="text-base font-bold text-slate-800 dark:text-slate-200 tabular-nums">٪{toPersianNum(activeEvaluation.annualVolatilityPct)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">نقدشوندگی وزنی: {toPersianNum(activeEvaluation.weightedLiquidityDays)} روز</span>
        </div>
        <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">ضریب شارپ (Sharpe)</span>
          <span className="text-base font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{toPersianNum(activeEvaluation.sharpeRatio)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">با نرخ بدون ریسک ۲۴٪</span>
        </div>
        <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">ثروت ۳ ساله ({toPersianNum(capitalBillion)} میلیارد)</span>
          <span className="text-base font-bold text-amber-700 dark:text-amber-300 tabular-nums">{toPersianNum(activeEvaluation.threeYearWealthMultiplier)} برابر</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">معادل {toPersianNum(Math.round(capitalMillion * activeEvaluation.threeYearWealthMultiplier))} م.ت</span>
        </div>
      </div>

      {/* Asset Weights, Capital Budget Selector & Custom Sliders */}
      <div className="p-3.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-600" />
            <span>تخصیص ریالی و درصدی سرمایه در سبد ({activeEvaluation.portfolioTierFa})</span>
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[10.5px] text-slate-500">بودجه کل:</span>
            {[6, 10, 15, 25].map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setCapitalBillion(b)}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold tabular-nums cursor-pointer ${
                  capitalBillion === b ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {toPersianNum(b)} میلیارد
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-bold text-indigo-700 dark:text-indigo-400">🏠 مسکن ({dossier.hoodName})</span>
              <span className="font-bold tabular-nums">{toPersianNum(allocMillion(activeEvaluation.weights.housingWeightPct))} م.ت (٪{toPersianNum(activeEvaluation.weights.housingWeightPct)})</span>
            </div>
            {selectedStrategy === 'custom' && (
              <input type="range" aria-label="سهم مسکن" min={0} max={100} value={customWeights.housingWeightPct} onChange={(e) => updateCustomWeight('housingWeightPct', Number(e.target.value))} className="w-full accent-indigo-600 h-1.5 cursor-pointer" />
            )}
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>جریان اجاره: {toPersianNum(dossier.assets.HOUSING.cashflowYieldPct)}٪ سالانه</span>
              <span>نقدشوندگی: {toPersianNum(dossier.assets.HOUSING.liquidityDays)} روز</span>
            </div>
          </div>

          <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-bold text-amber-600 dark:text-amber-400">🥇 سکه بهار آزادی و طلا</span>
              <span className="font-bold tabular-nums">{toPersianNum(allocMillion(activeEvaluation.weights.goldWeightPct))} م.ت (٪{toPersianNum(activeEvaluation.weights.goldWeightPct)})</span>
            </div>
            {selectedStrategy === 'custom' && (
              <input type="range" aria-label="سهم طلا و سکه" min={0} max={100} value={customWeights.goldWeightPct} onChange={(e) => updateCustomWeight('goldWeightPct', Number(e.target.value))} className="w-full accent-amber-500 h-1.5 cursor-pointer" />
            )}
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>همبستگی با دلار: ۸۸٪</span>
              <span>نقدشوندگی: ۱ روز (لحظه‌ای)</span>
            </div>
          </div>

          <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[var(--color-brand-600)] dark:text-emerald-400">💵 اسکناس دلار / تتر</span>
              <span className="font-bold tabular-nums">{toPersianNum(allocMillion(activeEvaluation.weights.usdWeightPct))} م.ت (٪{toPersianNum(activeEvaluation.weights.usdWeightPct)})</span>
            </div>
            {selectedStrategy === 'custom' && (
              <input type="range" aria-label="سهم دلار و تتر" min={0} max={100} value={customWeights.usdWeightPct} onChange={(e) => updateCustomWeight('usdWeightPct', Number(e.target.value))} className="w-full accent-emerald-500 h-1.5 cursor-pointer" />
            )}
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>پوشش مستقیم شوک ارزی</span>
              <span>بدون درآمد سود دوره‌ای</span>
            </div>
          </div>

          <div className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-bold text-sky-600 dark:text-sky-400">🏦 درآمد ثابت و سپرده ۳۰٪</span>
              <span className="font-bold tabular-nums">{toPersianNum(allocMillion(activeEvaluation.weights.fixedIncomeWeightPct))} م.ت (٪{toPersianNum(activeEvaluation.weights.fixedIncomeWeightPct)})</span>
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
          💡 <strong>تحلیل رادار:</strong> {activeEvaluation.strategicGuidanceFa}
        </p>
      </div>

      {/* Asset-Swap Arbitrage Panel */}
      <div className="p-3.5 rounded-lg border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/50 via-white to-slate-50/50 dark:from-slate-900 dark:to-indigo-950/20 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
          <span className="flex items-center gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" /><span>آربیتراژ و هزینه فرصت تبدیل دارایی به مسکن ({dossier.hoodName})</span></span>
          <div className="flex flex-wrap items-center gap-1.5" data-testid="swap-source-asset-selector">
            {[
              { id: 'GOLD_COIN' as const, label: 'از طلا و سکه' },
              { id: 'US_DOLLAR' as const, label: 'از دلار و تتر' },
              { id: 'FIXED_INCOME' as const, label: 'از درآمد ثابت ۳۰٪' },
            ].map((src) => (
              <button
                key={src.id} type="button" onClick={() => setSwapSourceAsset(src.id)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                  swapSourceAsset === src.id ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {src.label}
              </button>
            ))}
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">سربه‌سر: {toPersianNum(swapAnalysis.breakEvenMonths)} ماه</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
          <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 block text-[10px]">اصطکاک خروج {swapAnalysis.sourceAssetLabelFa} + ورود ملک:</span>
            <strong className="text-slate-700 dark:text-slate-200 tabular-nums">{toPersianNum(swapAnalysis.transactionFrictionCostMillion)} م.ت ({toPersianNum(swapAnalysis.totalFrictionRatePct)}٪)</strong>
          </div>
          <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 block text-[10px]">جریان نقدی اجاره سالانه مسکن:</span>
            <strong className="text-[var(--color-brand-600)] dark:text-emerald-400 tabular-nums">+{toPersianNum(swapAnalysis.annualRentalYieldMillion)} میلیون تومان/سال</strong>
          </div>
          <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-400 block text-[10px]">مزیت خالص ریالی دو ساله:</span>
            <strong className="text-indigo-600 dark:text-indigo-400 tabular-nums">+{toPersianNum(swapAnalysis.twoYearNetArbitrageAdvantageMillion)} م.ت{swapAdvantageFx}</strong>
          </div>
        </div>
        <p className="text-[10.5px] text-slate-600 dark:text-slate-300">{toPersianNum(swapAnalysis.verdictFa)}</p>
      </div>
    </div>
  );
};

