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
  generateCasperRentVsBuyDossier,
  simulateRentVsBuyEquivalence,
  RentVsBuyComparisonResult
} from '../../cells/decision-epistemology/rentVsBuyArbitrageEngine';
import { toPersianNum, type Neighborhood } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

export interface RentVsBuyArbitrageCardProps {
  hoodId?: number;
  hoodName?: string;
  cityKey?: string;
  basePriceSqm?: number;
  initialTargetSqm?: number;
  onTargetSqmChange?: (sqm: number) => void;
  intlCurrency?: IntlCurrencyCode;
  hood?: Neighborhood;
}

export const RentVsBuyArbitrageCard: React.FC<RentVsBuyArbitrageCardProps> = ({
  hoodId = 1,
  hoodName = 'پونک',
  cityKey = 'tehran',
  basePriceSqm = 120,
  initialTargetSqm = 80,
  onTargetSqmChange,
  intlCurrency = 'USD',
  hood,
}) => {
  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [alternativeReturnPct, setAlternativeReturnPct] = useState<number>(42);
  const [targetSqm, setTargetSqm] = useState<number>(initialTargetSqm);
  const [showRealPurchasingPower, setShowRealPurchasingPower] = useState<boolean>(true);

  React.useEffect(() => {
    setTargetSqm(initialTargetSqm);
  }, [initialTargetSqm]);

  const handleSqmSelect = (sqm: number) => {
    setTargetSqm(sqm);
    onTargetSqmChange?.(sqm);
  };

  const dossier = useMemo(
    () => generateCasperRentVsBuyDossier(hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency, targetSqm),
    [hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency, targetSqm]
  );
  const totalUnitCostMillion = Math.round(dossier.basePriceSqm * targetSqm);
  const rahn80m = dossier.rahn80m;
  const scaledRahnMillion = Math.round(rahn80m * (targetSqm / 80));

  const analysis: RentVsBuyComparisonResult = useMemo(() => {
    return simulateRentVsBuyEquivalence({
      horizonYears,
      buyerEquityMillion: totalUnitCostMillion,
      pricePerSqm: dossier.basePriceSqm,
      rahn80m,
      targetSqm,
      alternativeReturnNominalPct: alternativeReturnPct,
    });
  }, [horizonYears, alternativeReturnPct, totalUnitCostMillion, dossier.basePriceSqm, rahn80m, targetSqm]);

  const isBuyWinner = analysis.winner === 'BUY';
  const isRentWinner = analysis.winner === 'RENT_AND_INVEST';
  const displayedBuyWealth = showRealPurchasingPower ? analysis.buyScenario.realTerminalNetWealthMillion : analysis.buyScenario.terminalNetWealthMillion;
  const displayedRentWealth = showRealPurchasingPower ? analysis.rentScenario.realTerminalNetWealthMillion : analysis.rentScenario.terminalNetWealthMillion;
  const displayedDiff = showRealPurchasingPower ? analysis.realNetWealthDifferenceMillion : analysis.netWealthDifferenceMillion;
  const wealthGapFx = intlCurrency !== 'IRT'
    ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(displayedDiff), intlCurrency, 'fa')})`
    : '';

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
              <span>مدل تعادلی خرید در برابر «اجاره + سرمایه‌گذاری مازاد»</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">{dossier.hoodName}</span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">نقد دوگانه باور سنتی «اجاره‌نشینی هدر دادن پول است» و «توهم پولی فیشر در اعداد اسمی»</p>
          </div>
        </div>

        {/* Horizon, Area & Fisher Deflator Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            data-testid="toggle-fisher-real-wealth-btn"
            onClick={() => setShowRealPurchasingPower((p) => !p)}
            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition cursor-pointer ${
              showRealPurchasingPower
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            {showRealPurchasingPower ? '✓ قدرت خرید واقعی (به قیمت امروز)' : 'نمایش اسمی (تورمی)'}
          </button>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {[65, 85, 110, 135].map((sqm) => (
              <button
                key={sqm}
                type="button"
                onClick={() => handleSqmSelect(sqm)}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all cursor-pointer ${
                  targetSqm === sqm ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {toPersianNum(sqm)} متر
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
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
      </div>

      {/* Alternative Yield Controller + Exact Break-Even Solver Button */}
      <div className="p-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-600 shrink-0" />
          <div>
            <span className="font-extrabold text-slate-800 dark:text-slate-200 block">نرخ بازده سبد سرمایه‌گذاری جایگزین:</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">میانگین بازده سالانه سبد طلا، دلار یا صندوق‌ها (تامین‌کننده مابه‌التفاوت تمدید سالانه ودیعه)</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="snap-breakeven-alt-return-btn"
            onClick={() => setAlternativeReturnPct(analysis.breakEvenAlternativeReturnPct)}
            className="px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer"
          >
            نرخ سربه‌سر دقیق: ٪{toPersianNum(analysis.breakEvenAlternativeReturnPct)} (اعمال)
          </button>
          <input
            type="range"
            aria-label="نرخ بازده جایگزین"
            min={25}
            max={65}
            step={0.1}
            value={alternativeReturnPct}
            onChange={(e) => setAlternativeReturnPct(Number(e.target.value))}
            className="w-32 accent-indigo-600 h-1.5 cursor-pointer"
          />
          <strong className="text-indigo-700 dark:text-indigo-400 font-black tabular-nums min-w-[44px] text-left">٪{toPersianNum(alternativeReturnPct)}</strong>
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
              <span>سناریوی اول: خرید قطعی {toPersianNum(targetSqm)} متر ({dossier.hoodName})</span>
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
              <span>{showRealPurchasingPower ? `ثروت حقیقی (به قیمت امروز) در سال ${toPersianNum(horizonYears)}:` : `ثروت اسمی در پایان ${toPersianNum(horizonYears)} سال:`}</span>
              <strong className="text-base font-black text-indigo-700 dark:text-indigo-400 tabular-nums">{toPersianNum(displayedBuyWealth)} م.ت</strong>
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>نرخ بازده داخلی اسمی سالانه (IRR):</span>
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
              <span>سناریوی دوم: «اجاره {toPersianNum(targetSqm)} متر + سرمایه‌گذاری مازاد»</span>
            </span>
            {isRentWinner && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">برنده مالی ✓</span>}
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>ودیعه رهن اولیه ({toPersianNum(Math.round((scaledRahnMillion / Math.max(1, totalUnitCostMillion)) * 100))}٪ ارزش) + مازاد نقد:</span>
              <strong className="text-slate-800 dark:text-slate-200 tabular-nums">{toPersianNum(analysis.rentScenario.initialRahnOutlayMillion)} + {toPersianNum(analysis.rentScenario.initialInvestedSurplusMillion)} م.ت</strong>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>تزریق تمدید سالانه ودیعه + اصطکاک جابه‌جایی:</span>
              <span className="text-amber-700 dark:text-amber-400 tabular-nums">-{toPersianNum(analysis.rentScenario.cumulativeRahnTopUpsMillion + analysis.rentScenario.movingAndRenewalFrictionMillion)} م.ت</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1.5">
              <span>{showRealPurchasingPower ? `ثروت حقیقی (به قیمت امروز) در سال ${toPersianNum(horizonYears)}:` : `ثروت اسمی در پایان ${toPersianNum(horizonYears)} سال:`}</span>
              <strong className="text-base font-black text-amber-700 dark:text-amber-400 tabular-nums">{toPersianNum(displayedRentWealth)} م.ت</strong>
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>نرخ بازده داخلی اسمی سالانه (IRR):</span>
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
            {showRealPurchasingPower ? 'شکاف ثروت حقیقی:' : 'شکاف ثروت اسمی:'} {toPersianNum(Math.abs(displayedDiff))} م.ت{wealthGapFx}
          </span>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          {analysis.strategicExplanationFa} <strong>نرخ سربه‌سر اجاره‌داری:</strong> در صورتی که نسبت اجاره سالانه به قیمت ملک بالاتر از ٪{toPersianNum(analysis.indifferenceCapRatePct)} باشد، خرید ملک در این افق زمانی به صرفه‌تر خواهد بود.
        </p>
      </div>
    </div>
  );
};
