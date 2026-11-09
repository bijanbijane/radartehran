/**
 * @file RentVsBuyArbitrageCard.tsx
 * @module components/stage2
 * @description CASPER Rent vs. Buy Equivalence & Lifetime Wealth Arbitrage Card.
 * Challenges common real-estate assumptions with rigorous financial NPV comparison.
 */

import React, { useState, useMemo } from 'react';
import {
  Scale,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Home,
  TrendingUp,
  Percent,
  Sliders
} from 'lucide-react';
import {
  simulateRentVsBuyEquivalence,
  RentVsBuyComparisonResult
} from '../../cells/decision-epistemology/rentVsBuyArbitrageEngine';
import { toPersianNum } from '../../data/neighborhoods';
import type { IntlCurrencyCode } from '../../utils/areaUnit';

export interface RentVsBuyArbitrageCardProps {
  hoodId?: number;
  hoodName?: string;
  cityKey?: string;
  basePriceSqm?: number;
  intlCurrency?: IntlCurrencyCode;
}

export const RentVsBuyArbitrageCard: React.FC<RentVsBuyArbitrageCardProps> = ({
  hoodName = 'پونک',
  basePriceSqm = 120,
}) => {
  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [alternativeReturnPct, setAlternativeReturnPct] = useState<number>(42);

  const totalUnitCostMillion = Math.round(basePriceSqm * 80);
  const rahn80m = Math.round(totalUnitCostMillion * 0.16);

  const analysis: RentVsBuyComparisonResult = useMemo(() => {
    return simulateRentVsBuyEquivalence({
      horizonYears,
      buyerEquityMillion: totalUnitCostMillion,
      pricePerSqm: basePriceSqm,
      rahn80m,
      alternativeReturnNominalPct: alternativeReturnPct,
    });
  }, [horizonYears, alternativeReturnPct, totalUnitCostMillion, basePriceSqm, rahn80m]);

  const isBuyWinner = analysis.winner === 'BUY';
  const isRentWinner = analysis.winner === 'RENT_AND_INVEST';

  return (
    <div className="rounded-xl border border-indigo-200/90 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-4 text-slate-800 dark:text-slate-200" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>مدل تعادلی خرید در برابر «اجاره + سرمایه‌گذاری مازاد» (کسپر)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">{hoodName}</span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">به چالش کشیدن باور سنتی «اجاره‌نشینی یعنی پول دور ریختن» با فرمول‌های ارزش فعلی خالص (NPV)</p>
          </div>
        </div>

        {/* Horizon Buttons */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
          {[
            { years: 3, label: 'افق ۳ ساله' },
            { years: 5, label: 'افق ۵ ساله' },
            { years: 10, label: 'افق ۱۰ ساله' },
          ].map((h) => (
            <button
              key={h.years}
              type="button"
              onClick={() => setHorizonYears(h.years)}
              className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                horizonYears === h.years ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alternative Yield Controller */}
      <div className="p-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-600 shrink-0" />
          <div>
            <span className="font-extrabold text-slate-800 dark:text-slate-200 block">نرخ بازده سبد سرمایه‌گذاری جایگزین:</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">میانگین بازده سالانه سبد طلا، دلار یا صندوق‌ها</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            aria-label="نرخ بازده جایگزین"
            min={25}
            max={60}
            value={alternativeReturnPct}
            onChange={(e) => setAlternativeReturnPct(Number(e.target.value))}
            className="w-36 accent-indigo-600 h-1.5 cursor-pointer"
          />
          <strong className="text-indigo-700 dark:text-indigo-400 font-black tabular-nums min-w-[50px] text-left">٪{toPersianNum(alternativeReturnPct)}</strong>
        </div>
      </div>

      {/* Side-by-Side Wealth Comparison Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Scenario 1: Buy */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          isBuyWinner
            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 ring-1 ring-emerald-500/20'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <Home className="w-4 h-4 text-indigo-600" />
              <span>سناریوی اول: خرید قطعی ملک ({hoodName})</span>
            </span>
            {isBuyWinner && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">برنده مالی ✓</span>}
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>خواب اولیه سرمایه:</span>
              <strong className="text-slate-800 dark:text-slate-200 tabular-nums">{toPersianNum(analysis.buyScenario.initialOutlayMillion)} م.ت</strong>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>هزینه استهلاک و اصطکاک معاملات:</span>
              <span className="text-rose-600 dark:text-rose-400 tabular-nums">-{toPersianNum(analysis.buyScenario.transactionCostsMillion + analysis.buyScenario.maintenanceCumulativeMillion)} م.ت</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1.5">
              <span>ثروت نهایی در پایان {toPersianNum(horizonYears)} سال:</span>
              <strong className="text-base font-black text-indigo-700 dark:text-indigo-400 tabular-nums">{toPersianNum(analysis.buyScenario.terminalNetWealthMillion)} م.ت</strong>
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>نرخ بازده داخلی سالانه (IRR):</span>
              <span className="font-bold tabular-nums">٪{toPersianNum(analysis.buyScenario.irrAnnualPct)}</span>
            </div>
          </div>
        </div>

        {/* Scenario 2: Rent & Invest */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          isRentWinner
            ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 ring-1 ring-amber-500/20'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              <span>سناریوی دوم: «اجاره + سرمایه‌گذاری مازاد»</span>
            </span>
            {isRentWinner && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">برنده مالی ✓</span>}
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>ودیعه رهن اولیه (۱۶٪ ارزش):</span>
              <strong className="text-slate-800 dark:text-slate-200 tabular-nums">{toPersianNum(analysis.rentScenario.initialRahnOutlayMillion)} م.ت</strong>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>مازاد سرمایه‌گذاری‌شده در دارایی‌های نقد:</span>
              <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">{toPersianNum(analysis.rentScenario.initialInvestedSurplusMillion)} م.ت</strong>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1.5">
              <span>ثروت نهایی در پایان {toPersianNum(horizonYears)} سال:</span>
              <strong className="text-base font-black text-amber-700 dark:text-amber-400 tabular-nums">{toPersianNum(analysis.rentScenario.terminalNetWealthMillion)} م.ت</strong>
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>نرخ بازده داخلی سالانه (IRR):</span>
              <span className="font-bold tabular-nums">٪{toPersianNum(analysis.rentScenario.irrAnnualPct)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Decision Summary & Verdict */}
      <div className="p-3 rounded-lg border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/50 via-white to-slate-50/50 dark:from-slate-900 dark:to-indigo-950/20 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>حکم نهایی تصمیم‌یار: {analysis.verdictFa}</span>
          </span>
          <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 tabular-nums">
            شکاف ثروت: {toPersianNum(Math.abs(analysis.netWealthDifferenceMillion))} میلیون تومان
          </span>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          {analysis.strategicExplanationFa} <strong>سربه‌سر اجاره‌داری (Indifference Cap Rate):</strong> در صورتی که نسبت اجاره سالانه به قیمت ملک بالاتر از ٪{toPersianNum(analysis.indifferenceCapRatePct)} باشد، خرید ملک همواره به صرفه‌تر خواهد بود.
        </p>
      </div>
    </div>
  );
};
