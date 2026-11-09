import React, { useMemo, useState } from 'react';
import { Compass, Trophy, ArrowLeftRight, TrendingUp, ShieldAlert, CheckCircle2, Sliders } from 'lucide-react';
import { toPersianNum } from '../../data/neighborhoods';
import type { IntlCurrencyCode } from '../../utils/areaUnit';
import {
  computeSavageMinimaxRegretMatrix,
  type MacroRegimeId,
} from '../../cells/decision-epistemology/paretoRegretEngine';

export interface ParetoRegretSimulatorCardProps {
  hoodId: number;
  hoodName: string;
  cityKey: string;
  basePriceSqm: number;
  intlCurrency?: IntlCurrencyCode;
  onSelectCompareHood?: (hoodName: string) => void;
}

export const ParetoRegretSimulatorCard: React.FC<ParetoRegretSimulatorCardProps> = ({
  hoodId,
  hoodName,
  cityKey,
  basePriceSqm,
  intlCurrency = 'USD',
  onSelectCompareHood,
}) => {
  const [targetSqm, setTargetSqm] = useState<number>(85);
  const [selectedRegime, setSelectedRegime] = useState<MacroRegimeId>('STAGFLATION_LOCK');
  const [optimismAlpha, setOptimismAlpha] = useState<number>(0.35);

  const analysis = useMemo(
    () =>
      computeSavageMinimaxRegretMatrix({
        cityId: cityKey,
        hoodId,
        hoodName,
        basePriceSqm,
        targetSqm,
        intlCurrency,
        optimismAlpha,
      }),
    [cityKey, hoodId, hoodName, basePriceSqm, targetSqm, intlCurrency, optimismAlpha]
  );

  const activeRegimeSpec = analysis.regimes.find((r) => r.regimeId === selectedRegime) ?? analysis.regimes[0];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-4" dir="rtl">
      {/* Header & Area + Hurwicz Alpha Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              ماتریس پشیمانی ساواج، معیار هورwicz و بهینگی غیرجبرانی پارتو ({hoodName})
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              نظریه تصمیم تحت عدم قطعیت کلان (افق ۳۶ ماهه) با جریمه وتوی گلوگاه‌های زیست‌پذیری
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/70 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700" data-testid="hurwicz-alpha-controls">
            <Sliders className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">ضریب خوش‌بینی هورwicz (α):</span>
            {[
              { val: 0.15, label: 'محافظه‌کار (۱۵٪)' },
              { val: 0.35, label: 'متعادل (۳۵٪)' },
              { val: 0.75, label: 'جسورانه (۷۵٪)' },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setOptimismAlpha(opt.val)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                  optimismAlpha === opt.val
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label htmlFor="pareto-sqm-select" className="text-slate-600 dark:text-slate-300 font-semibold">متراژ هدف:</label>
          <select
            id="pareto-sqm-select"
            aria-label="متراژ هدف برای ماتریس پشیمانی ساواج"
            value={targetSqm}
            onChange={(e) => setTargetSqm(Number(e.target.value))}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100"
          >
            {[65, 85, 105, 135].map((sqm) => (
              <option key={sqm} value={sqm}>{toPersianNum(sqm)} مترمربع</option>
            ))}
          </select>
        </div>
      </div>

      {/* Minimax Winner Callout */}
      <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-start gap-2.5">
        <Trophy className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-950 dark:text-emerald-200 leading-relaxed font-medium">
          {analysis.minimaxSummaryFa}
        </p>
      </div>

      {/* Macroeconomic Regime Selector */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>انتخاب سناریوی کلان اقتصادی (آزمون استرس ۳ ساله):</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {analysis.regimes.map((reg) => (
            <button
              key={reg.regimeId}
              type="button"
              onClick={() => setSelectedRegime(reg.regimeId)}
              className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                selectedRegime === reg.regimeId
                  ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/50 dark:border-indigo-400'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-400'
              }`}
            >
              <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100">{reg.titleFa}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                رشد مسکن: {toPersianNum(reg.annualPropertyGrowthPct)}٪/سال • سپر نقدشونده: {toPersianNum(reg.annualLiquidShieldReturnPct)}٪/سال
              </div>
            </button>
          ))}
        </div>
        <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-200/70 dark:border-slate-700">
          {activeRegimeSpec.descriptionFa}
        </div>
      </div>

      {/* 3-Strategy Minimax Regret & Hurwicz Table */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
          مقایسه پیامد راهبردها در سناریوی انتخابی، حداکثر پشیمانی (Max Regret) و امتیاز هورwicz:
        </div>
        <div className="space-y-2">
          {analysis.strategies.map((st) => {
            const activeCell = st.cells[selectedRegime];
            return (
              <div
                key={st.strategyId}
                className={`p-3 rounded-xl border transition ${
                  st.isMinimaxOptimal
                    ? 'border-emerald-500 dark:border-emerald-500/80 bg-emerald-50/30 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">{st.titleFa}</span>
                      {st.isMinimaxOptimal && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>بهینه ساواج (Minimax)</span>
                        </span>
                      )}
                      {st.isHurwiczOptimal && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white">
                          <span>برنده هورwicz (α={toPersianNum(Math.round(analysis.optimismAlpha * 100))}٪)</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{st.subtitleFa}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <div className="text-left">
                      <div className="text-[10px] text-slate-400">ثروت سال سوم (این سناریو)</div>
                      <div className="font-black text-slate-900 dark:text-white">
                        {toPersianNum(activeCell.terminalWealthMillion)} م‌ت{' '}
                        <span className="text-[10px] font-normal text-indigo-600 dark:text-indigo-400">({activeCell.terminalWealthIntlText})</span>
                      </div>
                    </div>
                    <div className="text-left border-r border-slate-200 dark:border-slate-700 pr-3">
                      <div className="text-[10px] text-slate-400">امتیاز هورwicz / پشیمانی</div>
                      <div className={`font-black ${st.maxRegretMillion === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {toPersianNum(st.hurwiczScoreMillion)} م‌ت / {st.maxRegretMillion === 0 ? '۰ پشیمانی' : `-${toPersianNum(st.maxRegretMillion)} م‌ت`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pareto Spatial Arbitrage Candidates */}
      <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <ArrowLeftRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>جایگزین‌های بهینه پارتو (محلات هم‌کیفیت بدون گلوگاه بحرانی با قیمت پایین‌تر)</span>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            مطلوبیت غیرجبرانی {hoodName}: {toPersianNum(analysis.targetUtilityScore)} از ۱۰۰
          </span>
        </div>

        {analysis.paretoAlternatives.length === 0 ? (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>محله {hoodName} هم‌اکنون روی مرز کارایی پارتو (Pareto Frontier) در بازه قیمتی خود قرار دارد و محله ارزان‌تر با مطلوبیت بالاتر یافت نشد.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {analysis.paretoAlternatives.map((cand) => (
              <div
                key={cand.hoodId}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => onSelectCompareHood?.(cand.hoodName)}
                      className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300 hover:underline text-right cursor-pointer"
                    >
                      محله {cand.hoodName}
                    </button>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                      {toPersianNum(cand.priceSavingsPct)}٪ ارزان‌تر
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1">
                    معامله v6.4: متری {toPersianNum(cand.estimatedDealPriceSqm)} م‌ت ({cand.dealPriceIntlText})
                  </div>
                  <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {cand.rationaleFa}
                  </p>
                </div>
                <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <span>مطلوبیت: {toPersianNum(cand.utilityScore)}/۱۰۰</span>
                  <span>آزادسازی: +{toPersianNum(cand.capitalFreed85mMillion)} م‌ت</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
