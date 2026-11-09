import React, { useState, useMemo } from 'react';
import {
  Activity,
  ShieldAlert,
  TrendingDown,
  BarChart2,
  Sliders,
  CheckCircle2,
  AlertOctagon,
  Percent,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import {
  generateCasperMonteCarloRiskReport,
  simulateMertonJumpDiffusionVaR,
} from '../../cells/decision-epistemology/monteCarloRiskDensityEngine';
import { toPersianNum } from '../../data/neighborhoods';
import type { IntlCurrencyCode } from '../../utils/areaUnit';

export interface MonteCarloRiskDensityCardProps {
  hoodId?: number;
  hoodName?: string;
  cityKey?: string;
  basePriceSqm?: number;
  intlCurrency?: IntlCurrencyCode;
}

export const MonteCarloRiskDensityCard: React.FC<MonteCarloRiskDensityCardProps> = ({
  hoodId = 1,
  hoodName = 'پونک',
  cityKey = 'tehran',
  basePriceSqm = 120,
}) => {
  const [horizonMonths, setHorizonMonths] = useState<number>(12);
  const [jumpIntensity, setJumpIntensity] = useState<number>(0.45);
  const [seedOffset, setSeedOffset] = useState<number>(1);

  const report = useMemo(() => {
    const base = generateCasperMonteCarloRiskReport(hoodId, hoodName, cityKey, basePriceSqm, horizonMonths);
    // Apply user-modified jump intensity and re-simulate
    const customResult = simulateMertonJumpDiffusionVaR(
      base.basePriceSqm,
      {
        ...base.config,
        horizonMonths,
        jumpIntensityLambda: jumpIntensity,
      },
      (hoodId * 101) + seedOffset
    );

    return {
      ...base,
      metrics: customResult.metrics,
      distributionBuckets: customResult.distributionBuckets,
    };
  }, [hoodId, hoodName, cityKey, basePriceSqm, horizonMonths, jumpIntensity, seedOffset]);

  const maxDensity = Math.max(...report.distributionBuckets.map((b) => b.densityPercent), 1);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Title & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span>شبیه‌ساز مونت‌کارلو جهش-نفوذ مرتون (Merton Jump-Diffusion VaR)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-normal">
                {report.hoodName}
              </span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ارزیابی ۱٬۰۰۰ سناریوی شبیه‌سازی‌شده ارزش در معرض خطر (VaR 95%)، ریسک دم‌بلند و ضریب سورتینو
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSeedOffset((prev) => prev + 1)}
            aria-label="اجرای مجدد شبیه‌سازی ۱۰۰۰ سناریو"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>شبیه‌سازی مجدد</span>
          </button>
          <div className="text-[11px] px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800 font-bold">
            <span>{report.metrics.riskVerdictFa}</span>
          </div>
        </div>
      </div>

      {/* Interactive Controls Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
        {/* Horizon Toggle */}
        <div className="space-y-1">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">افق شبیه‌سازی سرمایه‌گذاری:</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setHorizonMonths(12)}
              className={`flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                horizonMonths === 12
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              افق ۱۲ ماهه (کوتاه‌مدت)
            </button>
            <button
              type="button"
              onClick={() => setHorizonMonths(36)}
              className={`flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                horizonMonths === 36
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              افق ۳۶ ماهه (میان‌مدت)
            </button>
          </div>
        </div>

        {/* Jump Intensity Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-purple-500" />
              <span>شدت شوک ارزی/جهش قیمت (λ):</span>
            </span>
            <span className="font-extrabold text-purple-600 dark:text-purple-400 text-xs">
              {toPersianNum(Math.round(jumpIntensity * 100))}٪ در سال
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={jumpIntensity}
            onChange={(e) => setJumpIntensity(Number(e.target.value))}
            aria-label="شدت جهش ارزی"
            className="w-full accent-purple-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
          />
        </div>
      </div>

      {/* Key Metric Pillars Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <div className="text-[10px] text-slate-400">میانه بازده واقعی (تعدیل تورم):</div>
          <div className={`text-sm font-black mt-0.5 ${report.metrics.realMedianReturnPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {report.metrics.realMedianReturnPct >= 0 ? '+' : ''}{toPersianNum(report.metrics.realMedianReturnPct)}٪
          </div>
          <div className="text-[9px] text-slate-400">اسمی: {toPersianNum(report.metrics.nominalMedianReturnPct)}٪</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <div className="text-[10px] text-slate-400">ارزش در معرض خطر (VaR 95%):</div>
          <div className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">
            -{toPersianNum(report.metrics.var95RealPct)}٪
          </div>
          <div className="text-[9px] text-slate-400">سقف زیان در ۹۵٪ سناریوها</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <div className="text-[10px] text-slate-400">زیان مشروط دم (CVaR 95%):</div>
          <div className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">
            -{toPersianNum(report.metrics.cvar95RealPct)}٪
          </div>
          <div className="text-[9px] text-slate-400">میانگین ۵٪ بدترین سناریوها</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <div className="text-[10px] text-slate-400">ضریب سورتینو (Sortino):</div>
          <div className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
            {toPersianNum(report.metrics.sortinoRatio)}
          </div>
          <div className="text-[9px] text-slate-400">شارپ: {toPersianNum(report.metrics.sharpeRatio)}</div>
        </div>
      </div>

      {/* Histogram Density Distribution Visualization */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
          <span className="flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-purple-500" />
            <span>توزیع فراوانی احتمالاتی بازده در ۱٬۰۰۰ سناریو</span>
          </span>
          <span className="text-[10px] text-slate-400">
            احتمال افت قدرت خرید واقعی: <strong className="text-rose-600 dark:text-rose-400">{toPersianNum(report.metrics.probRealCapitalLossPct)}٪</strong>
          </span>
        </div>

        {/* Histogram Bars */}
        <div className="grid grid-cols-7 gap-1.5 items-end h-28 pt-2">
          {report.distributionBuckets.map((bucket, idx) => {
            const heightPercent = Math.max(10, Math.round((bucket.densityPercent / maxDensity) * 100));
            const isNegativeReal = bucket.realReturnPercent < 0;

            return (
              <div key={idx} className="flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                  {toPersianNum(bucket.densityPercent)}٪
                </span>
                <div
                  className={`w-full rounded-t-md transition-all duration-300 ${
                    isNegativeReal
                      ? 'bg-rose-500/80 dark:bg-rose-500/70 hover:bg-rose-600'
                      : 'bg-purple-600/80 dark:bg-purple-500/80 hover:bg-purple-600'
                  }`}
                  style={{ height: `${heightPercent}%` }}
                />
                <span className="text-[8px] font-bold text-slate-600 dark:text-slate-400 truncate max-w-full text-center">
                  {toPersianNum(bucket.nominalReturnPercent)}٪
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
          {report.metrics.strategicAdviceFa}
        </p>
      </div>
    </div>
  );
};
