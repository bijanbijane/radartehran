import React, { useState, useMemo } from 'react';
import {
  Compass,
  Briefcase,
  Wallet,
  Clock,
  Car,
  Wind,
  CheckCircle2,
  ArrowRightLeft,
  ChevronDown,
  ArrowUpLeft,
} from 'lucide-react';
import {
  generateCasperUrbanAffordabilityReport,
} from '../../cells/decision-epistemology/urbanAffordabilityIsochroneEngine';
import { toPersianNum, WORK_HUBS, type Neighborhood } from '../../data/neighborhoods';
import { MULTI_CITY_CONFIGS, CityId } from '../../data/multiCityData';
import type { IntlCurrencyCode } from '../../utils/areaUnit';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';

export interface UrbanAffordabilityIsochroneCardProps {
  hoodId?: number;
  hoodName?: string;
  cityKey?: string;
  basePriceSqm?: number;
  targetSqm?: number;
  intlCurrency?: IntlCurrencyCode;
  onSelectCompareHood?: (hoodName: string) => void;
  hood?: Neighborhood;
}

export const UrbanAffordabilityIsochroneCard: React.FC<UrbanAffordabilityIsochroneCardProps> = ({
  hoodId = 1,
  hoodName = 'پونک',
  cityKey = 'tehran',
  basePriceSqm = 120,
  targetSqm = 80,
  intlCurrency = 'USD',
  onSelectCompareHood,
  hood,
}) => {
  const [monthlyIncomeMillion, setMonthlyIncomeMillion] = useState<number>(45);
  const [selectedHubId, setSelectedHubId] = useState<string>('vanak');

  const availableHubs = useMemo(() => {
    const safeCity = (cityKey in MULTI_CITY_CONFIGS ? cityKey : 'tehran') as CityId;
    return MULTI_CITY_CONFIGS[safeCity]?.workHubs ?? WORK_HUBS;
  }, [cityKey]);
  const effectiveHubId = useMemo(() => {
    return availableHubs.some((h) => h.id === selectedHubId) ? selectedHubId : (availableHubs[0]?.id || 'vanak');
  }, [availableHubs, selectedHubId]);

  const report = useMemo(() => {
    return generateCasperUrbanAffordabilityReport(
      hoodId,
      hoodName,
      cityKey,
      basePriceSqm,
      effectiveHubId,
      monthlyIncomeMillion,
      hood,
      intlCurrency,
      targetSqm
    );
  }, [hoodId, hoodName, cityKey, basePriceSqm, effectiveHubId, monthlyIncomeMillion, hood, intlCurrency, targetSqm]);

  const tcohFx = intlCurrency !== 'IRT'
    ? ` (${formatMillionTomanAsIntlCurrency(report.arbitrage.totalCostOfHousingMillion, intlCurrency, 'fa')})`
    : '';
  const sub = report.optimalIsochroneSubstitute;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span>تنش استطاعت مسکن (PIR/RIR) و مرز هزینه تردد آلونسو-میلز (TCOH)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-normal">
                {report.hoodName}
              </span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              محاسبه هزینه جامع اقتصادی سکونت (اجاره + اتلاف ساعات در ترافیک + استهلاک رفت‌وآمد + عارضه آلودگی هوا)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800 font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{report.arbitrage.arbitrageVerdictFa}</span>
        </div>
      </div>

      {/* Interactive Controls Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-emerald-500" />
              <span>درآمد ماهانه خانوار:</span>
            </span>
            <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">
              {toPersianNum(monthlyIncomeMillion)} میلیون تومان
            </span>
          </div>
          <input
            type="range"
            min={20}
            max={150}
            step={5}
            value={monthlyIncomeMillion}
            onChange={(e) => setMonthlyIncomeMillion(Number(e.target.value))}
            aria-label="درآمد ماهانه خانوار"
            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
              <span>قطب اداری/شغلی مقصد:</span>
            </span>
            <span className="text-[11px] text-slate-400">
              فاصله: {toPersianNum(report.commute.distanceKm)} ک‌م
            </span>
          </div>
          <div className="relative">
            <select
              value={effectiveHubId}
              onChange={(e) => setSelectedHubId(e.target.value)}
              aria-label="انتخاب قطب اشتغال"
              className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500"
            >
              {availableHubs.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hub.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 3 Analytics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
            <span>شاخص استطاعت مسکن</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-bold">
              {report.affordability.affordabilityTierFa}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-center">
            <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700">
              <div className="text-[10px] text-slate-400">سال‌های درآمد (PIR):</div>
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                {toPersianNum(report.affordability.priceToIncomeRatio)} سال
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700">
              <div className="text-[10px] text-slate-400">سهم اجاره (RIR):</div>
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                {toPersianNum(report.affordability.rentToIncomeRatioPct)}٪
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            اجاره ماهانه معادل رهن {toPersianNum(targetSqm)} متر: <span className="font-bold text-slate-700 dark:text-slate-200">{toPersianNum(report.effectiveRentPerMonthMillion)} م.ت</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
            <span>اصطکاک تردد تا {report.commute.workHubName}</span>
            <span className="text-indigo-600 dark:text-indigo-400 text-[10px] font-extrabold">
              {toPersianNum(report.commute.estimatedOneWayMinutes)} دقیقه رفت
            </span>
          </div>

          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>اتلاف وقت ماهانه ({toPersianNum(report.commute.monthlyCommuteHours)} ساعت):</span>
              </span>
              <span className="font-bold">{toPersianNum(report.commute.monthlyTimeOpportunityCostMillion)} م.ت</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <Car className="w-3 h-3 text-slate-400" />
                <span>بنزین و استهلاک مستقیم:</span>
              </span>
              <span className="font-bold">{toPersianNum(report.commute.monthlyDirectTransitCostMillion)} م.ت</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <Wind className="w-3 h-3 text-slate-400" />
                <span>هزینه سلامت مواجهه با آلودگی:</span>
              </span>
              <span className="font-bold">{toPersianNum(report.commute.monthlyAqiHealthBurdenMillion)} م.ت</span>
            </div>
          </div>

          <div className="p-1.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-[10px] flex justify-between font-bold text-indigo-700 dark:text-indigo-300">
            <span>مجموع هزینه اصطکاک رفت‌وآمد:</span>
            <span>{toPersianNum(report.commute.totalMonthlyFrictionCostMillion)} م.ت</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
            <span>هزینه کل اقتصادی (TCOH)</span>
            <span className="text-[10px] text-slate-400">آلونسو-میلز</span>
          </div>

          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 space-y-0.5">
            <div className="text-[10px] text-slate-400">هزینه نهایی واقعی ماهانه (اجاره + تردد):</div>
            <div className="text-sm font-black text-slate-900 dark:text-white">
              {toPersianNum(report.arbitrage.totalCostOfHousingMillion)} میلیون تومان
              <span className="text-[10px] font-normal text-slate-400">{tcohFx}</span>
            </div>
          </div>

          <div className="text-[10px] text-slate-600 dark:text-slate-300">
            آستانه سربه‌سر سفر: <span className="font-bold text-indigo-600 dark:text-indigo-400">{toPersianNum(report.arbitrage.breakEvenCommuteMinutes)} دقیقه</span>
          </div>

          <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {report.arbitrage.strategicAdviceFa}
          </p>
        </div>
      </div>

      {/* Actionable Isochrone Spatial Substitute Recommendation */}
      {sub && (
        <div data-testid="stage2-isochrone-substitute-banner" className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="space-y-0.5">
            <div className="font-extrabold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>پیشنهاد آربیتراژ ایزوکرون کسپر برای شاغلان «{report.commute.workHubName}»: محله {sub.hoodName}</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              صرفه‌جویی خالص <strong>{toPersianNum(sub.monthlyTcohSavingsMillion)} م.ت در ماه</strong> در هزینه کل سکونت و تردد + آزادسازی <strong>{toPersianNum(sub.capitalFreed80mMillion)} م.ت</strong> سرمایه خرید {toPersianNum(targetSqm)} متر (زمان تردد: {toPersianNum(sub.oneWayMinutes)} دقیقه).
            </p>
          </div>
          {onSelectCompareHood && (
            <button
              type="button"
              data-testid="isochrone-substitute-btn"
              onClick={() => onSelectCompareHood(sub.hoodName)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs transition cursor-pointer shrink-0"
            >
              <span>بررسی محله {sub.hoodName}</span>
              <ArrowUpLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

