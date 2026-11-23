import React, { useState, useMemo } from 'react';
import {
  Hourglass,
  Clock,
  TrendingUp,
  ShieldCheck,
  Coins,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Sliders,
  DollarSign
} from 'lucide-react';
import {
  generateCasperLiquidityReport,
  computeDixitPindyckRealOption,
} from '../../cells/decision-epistemology/realOptionsLiquidityEngine';
import { toPersianNum, type Neighborhood } from '../../data/neighborhoods';
import type { IntlCurrencyCode } from '../../utils/areaUnit';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';

export interface RealOptionsLiquidityCardProps {
  hoodId?: number;
  hoodName?: string;
  cityKey?: string;
  basePriceSqm?: number;
  intlCurrency?: IntlCurrencyCode;
  hood?: Neighborhood;
  targetSqm?: number;
}

export const RealOptionsLiquidityCard: React.FC<RealOptionsLiquidityCardProps> = ({
  hoodId = 1,
  hoodName = 'پونک',
  cityKey = 'tehran',
  basePriceSqm = 120,
  intlCurrency = 'USD',
  hood,
  targetSqm = 85,
}) => {
  const [horizonMonths, setHorizonMonths] = useState<number>(6);

  const report = useMemo(() => {
    return generateCasperLiquidityReport(hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency, targetSqm);
  }, [hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency, targetSqm]);

  // Recalculate Dixit-Pindyck with user-selected horizon
  const customRealOptions = useMemo(() => {
    return computeDixitPindyckRealOption(
      report.basePriceSqm,
      report.realOptions.dividendYieldDelta,
      report.realOptions.volatilitySigma,
      0.22,
      horizonMonths,
      targetSqm
    );
  }, [report.basePriceSqm, report.realOptions.dividendYieldDelta, report.realOptions.volatilitySigma, horizonMonths, targetSqm]);

  const valueWaitingFx = intlCurrency !== 'IRT'
    ? ` (${formatMillionTomanAsIntlCurrency(customRealOptions.valueOfWaitingTomanMln, intlCurrency, 'fa')})`
    : '';

  return (
    <div className="space-y-4" dir="rtl">
      {/* Title & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <Hourglass className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span>زمان‌بندی معامله و سرعت فروش: الان بخرم، چانه بزنم یا صبر کنم؟</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-normal">
                {report.hoodName}
              </span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              محاسبه ارزش صبر کردن (مدل اختیارات واقعی Dixit-Pindyck)، سرعت نقدشوندگی و حساسیت به دلار و طلا
            </p>
          </div>
        </div>

        {/* Action Badge */}
        <div className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800 font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>استراتژی بهینه: {customRealOptions.optimalAction === 'EXECUTE_IMMEDIATELY' ? 'معامله فوری' : customRealOptions.optimalAction === 'RENEGOTIATE_TO_HURDLE' ? 'چانه‌زنی تا آستانه سود' : 'حفظ اختیار و تعویق'}</span>
        </div>
      </div>

      {/* Grid of 3 Analytical Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Pillar 1: Real Options Timing */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
            <span className="flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-amber-500" />
              <span>ارزش اختیار صبر (Option to Wait)</span>
            </span>
            <span className="text-amber-600 dark:text-amber-400 font-extrabold text-[11px]">
              {toPersianNum(horizonMonths)} ماهه
            </span>
          </div>

          {/* Horizon Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>افق تحلیل صبر:</span>
              <span className="font-bold text-slate-600 dark:text-slate-300">{toPersianNum(horizonMonths)} ماه</span>
            </div>
            <input
              type="range"
              min={3}
              max={24}
              step={3}
              value={horizonMonths}
              onChange={(e) => setHorizonMonths(Number(e.target.value))}
              aria-label="افق ماه‌های اختیار صبر"
              className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
            />
          </div>

          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-900/40 space-y-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">ارزش خالص اختیار تعویق (برای {toPersianNum(targetSqm)} متر):</div>
            <div className="text-sm font-black text-amber-600 dark:text-amber-400">
              {toPersianNum(customRealOptions.valueOfWaitingTomanMln)} میلیون تومان
              <span className="text-[10px] font-normal text-slate-400">{valueWaitingFx}</span>
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold flex justify-between pt-0.5" data-testid="buyer-reservation-ceiling">
              <span>سقف ورود فوری خریدار: متری {toPersianNum(customRealOptions.buyerReservationPricePerSqm)} م.ت</span>
              <span>(-{toPersianNum(customRealOptions.requiredBuyerDiscountPct)}٪)</span>
            </div>
            <div className="text-[9.5px] text-slate-500 dark:text-slate-400 flex justify-between">
              <span>ضریب آستانه: {toPersianNum(customRealOptions.hurdleRateMultiplier)}x</span>
              <span>ارزش بنیادی لازم: متری {toPersianNum(customRealOptions.hurdlePricePerSqm)} م.ت</span>
            </div>
          </div>

          <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {customRealOptions.actionReasonFa}
          </p>
        </div>

        {/* Pillar 2: Liquidity & Survival Half-Life */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              <span>تابع بقای نقدشوندگی (DOM)</span>
            </span>
            <span className="text-indigo-600 dark:text-indigo-400 font-extrabold text-[10px]">
              {report.liquidity.liquidityTierFa}
            </span>
          </div>

          {/* Days on Market KPIs */}
          <div className="grid grid-cols-2 gap-1.5 text-center">
            <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700">
              <div className="text-[10px] text-slate-400">میانگین روزهای عرضه:</div>
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{toPersianNum(report.liquidity.expectedDaysOnMarket)} روز</div>
            </div>
            <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700">
              <div className="text-[10px] text-slate-400">نیمه‌عمر جذب فایل:</div>
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{toPersianNum(report.liquidity.absorptionHalfLifeDays)} روز</div>
            </div>
          </div>

          {/* Probability Bars */}
          <div className="space-y-1.5 text-[10px]">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>احتمال فروش ۳۰ روزه:</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{toPersianNum(report.liquidity.probSaleWithin30DaysPct)}٪</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.min(100, report.liquidity.probSaleWithin30DaysPct)}%` }} />
            </div>

            <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>احتمال فروش ۹۰ روزه:</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{toPersianNum(report.liquidity.probSaleWithin90DaysPct)}٪</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(100, report.liquidity.probSaleWithin90DaysPct)}%` }} />
            </div>
          </div>

          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            تخفیف الزامی فروش اضطراری ۷ روزه: <span className="font-bold text-rose-600 dark:text-rose-400">{toPersianNum(report.liquidity.emergencyFastSaleDiscountPct)}٪</span>
          </div>
        </div>

        {/* Pillar 3: Macro Elasticity & Betas */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span>بتای سرریز کلان (Macro Beta)</span>
            </span>
            <span className="text-[var(--color-brand-600)] dark:text-emerald-400 font-extrabold text-[10px]">
              تأخیر {toPersianNum(report.elasticity.lagMonthsToFullPassThrough)} ماهه
            </span>
          </div>

          {/* Asset Role Tag */}
          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/40 text-[10px]">
            <div className="text-slate-400">ماهیت ساختاری دارایی:</div>
            <div className="font-bold text-slate-800 dark:text-slate-100">{report.elasticity.assetRoleFa}</div>
          </div>

          {/* Betas Breakdown */}
          <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
            <div className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700">
              <div className="text-slate-400">بتای دلار:</div>
              <div className="font-extrabold text-slate-800 dark:text-slate-100">{toPersianNum(report.elasticity.usdExchangeRateBeta)}</div>
            </div>
            <div className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700">
              <div className="text-slate-400">بتای طلا:</div>
              <div className="font-extrabold text-slate-800 dark:text-slate-100">{toPersianNum(report.elasticity.goldCoinBeta)}</div>
            </div>
            <div className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700">
              <div className="text-slate-400">بتای تورم:</div>
              <div className="font-extrabold text-slate-800 dark:text-slate-100">{toPersianNum(report.elasticity.cpiInflationBeta)}</div>
            </div>
          </div>

          <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {report.elasticity.strategicRecommendationFa}
          </p>
        </div>
      </div>
    </div>
  );
};
