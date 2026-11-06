import React, { useMemo, useState } from 'react'; import { TrendingUp, TrendingDown, Sparkles, ArrowUpRight, ArrowDownRight, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react'; import type { BubbleReport, EvaluatedNeighborhood } from '../data/neighborhoods'; import { toPersianNum } from '../data/neighborhoods'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { clampNumber } from '../utils/security'; import { calculateVersionedBrokerageCommission, evaluateBuildingConditionAndSeparatedDepreciation, evaluateRentalContractAndDepositConversion, } from '../data/rentalMarketCommissionAndPreSaleAudit'; import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; export interface SmartPriceForecastCardProps { selectedHood?: EvaluatedNeighborhood; hoodName?: string; currentBuyPerSqm?: number; marketReport: BubbleReport; compact?: boolean; } export interface ThreeMonthForecastResult { increaseBiasScore: number; decreaseBiasScore: number; expectedChange3mPercent: number; projectedBuyPerSqm: number;
  signalLabel: string; signalTone: 'bullish' | 'neutral' | 'bearish'; drivers: string[]; increaseProbPercent?: number; decreaseProbPercent?: number; confidencePercent?: number; } export function calculateThreeMonthForecast( buyPerSqm: number, marketReport: BubbleReport
): ThreeMonthForecastResult { const hoodGrowth6m = Number(marketReport.hoodGrowth6mPercent) || 0; const cityGrowth6m = Number(marketReport.tehranGrowth6mPercent) || 0; const prRatio = Number(marketReport.prRatio) || 18; const trend = Array.isArray(marketReport.trendData) ? marketReport.trendData : []; const catchUpGap = cityGrowth6m - hoodGrowth6m; let recentMomentumPercent = hoodGrowth6m / 2; if (trend.length >= 3) { const recentStart = Math.max(1, trend[trend.length - 3].hoodPrice); const recentEnd = Math.max(1, trend[trend.length - 1].hoodPrice); recentMomentumPercent = ((recentEnd - recentStart) / recentStart) * 100; }
  let rawIncreaseBias = 55; if (marketReport.status === 'undervalued') { rawIncreaseBias += 18; } else if (marketReport.status === 'bubble') { rawIncreaseBias -= 22; } else { rawIncreaseBias += 3; }
  rawIncreaseBias += clampNumber(catchUpGap * 1.4, -14, 16, 0); const prDeviation = 6.35 - prRatio; rawIncreaseBias += clampNumber(prDeviation * 8.0, -12, 12, 0); rawIncreaseBias += clampNumber((recentMomentumPercent - 5) * 0.9, -8, 10, 0); const increaseBiasScore = Math.round(clampNumber(rawIncreaseBias, 14, 89, 55)); const decreaseBiasScore = 100 - increaseBiasScore; const baseQuarterlyRate = hoodGrowth6m * 0.45 + catchUpGap * 0.25;
  const statusDelta = marketReport.status === 'undervalued' ? 2.8 : marketReport.status === 'bubble' ? -3.4 : 0.4; const rawExpectedChange3m = ((increaseBiasScore - 50) / 50) * 6.5 + baseQuarterlyRate * 0.35 + statusDelta;
  const expectedChange3mPercent = Number(clampNumber(rawExpectedChange3m, -7.5, 14.5, 3.2).toFixed(1)); const safeBuySqm = Math.max(10, Number(buyPerSqm) || 100); const projectedBuyPerSqm = Math.max( 10,
    Math.round(safeBuySqm * (1 + expectedChange3mPercent / 100)) ); const signalTone: 'bullish' | 'neutral' | 'bearish' = increaseBiasScore >= 62 ? 'bullish' : increaseBiasScore <= 42 ? 'bearish' : 'neutral'; const signalLabel = signalTone === 'bullish'
      ? 'سوگیری افزایشی تحلیلی'
      : signalTone === 'bearish'
        ? 'سوگیری اصلاحی تحلیلی'
        : 'تعادل نسبی تحلیلی'; const drivers: string[] = []; if (catchUpGap > 1.5) { drivers.push(
      `جاماندگی ${toPersianNum(catchUpGap.toFixed(1))}٪ از میانگین رشد ۶ ماهه شهر (${toPersianNum(hoodGrowth6m)}٪ در برابر ${toPersianNum(cityGrowth6m)}٪)`
    ); } else if (catchUpGap < -1.5) { drivers.push(
      `سبقت ${toPersianNum(Math.abs(catchUpGap).toFixed(1))}٪ رشد محله از میانگین شهر`
    ); } else {
    drivers.push(`همگام بودن رشد ۶ ماهه محله (${toPersianNum(hoodGrowth6m)}٪) با میانگین شهر`);
  }
  if (prRatio <= 6.1) {
    drivers.push(`نسبت قیمت به رهن جذاب (${toPersianNum(prRatio)}) و حمایت بازدهی اجاره از قیمت خرید`);
  } else if (prRatio >= 6.8) {
    drivers.push(`نسبت قیمت به رهن بالا (${toPersianNum(prRatio)}) و مقاومت خریداران`);
  } else {
    drivers.push(`نسبت قیمت به رهن متعادل (${toPersianNum(prRatio)}) در محدوده استاندارد بازار`);
  }
  return { increaseBiasScore, decreaseBiasScore, expectedChange3mPercent, projectedBuyPerSqm, signalLabel, signalTone, drivers, increaseProbPercent: increaseBiasScore, decreaseProbPercent: decreaseBiasScore };
}
export function SmartPriceForecastCard({ selectedHood, hoodName, currentBuyPerSqm, marketReport, compact = false }: SmartPriceForecastCardProps): React.ReactElement | null {
  const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency();
  const effectiveName = selectedHood?.name || hoodName || '';
  const effectiveBuySqm = selectedHood?.buyPerSqm ?? currentBuyPerSqm ?? 0;
  const monthlyRent80mMillions = selectedHood ? Math.round(selectedHood.rahn80m * 0.03) : 0;
  const [showAuditBreakdown, setShowAuditBreakdown] = useState<boolean>(false);
  const forecast = useMemo(
    () => (effectiveBuySqm > 0 && marketReport ? calculateThreeMonthForecast(effectiveBuySqm, marketReport) : null),
    [effectiveBuySqm, marketReport]
  );
  const financialAuditSummary = useMemo(() => {
    if (effectiveBuySqm <= 0) return null;
    const benchmark80mPrice = effectiveBuySqm * 80;
    const comm = calculateVersionedBrokerageCommission({ mode: 'buy', salePriceMillionToman: benchmark80mPrice });
    const landDep = evaluateBuildingConditionAndSeparatedDepreciation({
      constructionYearJalali: 1396, currentYearJalali: 1404, renovationScope: 'NONE', maintenanceGrade: 'NORMAL',
      totalNewBenchmarkPropertyValueMillionToman: benchmark80mPrice, landValueShareRatio: 0.68,
    });
    const rahn80m = selectedHood?.rahn80m ?? Math.round(benchmark80mPrice * 0.14);
    const leaseAudit = evaluateRentalContractAndDepositConversion({
      contractId: `BENCH-${effectiveName}`, refundableSecurityDepositMillionToman: Math.round(rahn80m * 0.5),
      contractualMonthlyRentMillionToman: Number(((rahn80m * 0.5) * 0.03).toFixed(1)), leaseDurationMonths: 12,
      commencementJalaliDate: '1404-01-01', expirationJalaliDate: '1405-01-01',
    });
    return {
      buyerCommissionWithVat: comm.isValid ? Number(comm.statutoryAndUnionTariff.buyerSideTotalMillionToman.toFixed(1)) : 0,
      landValueMillion: Math.round(landDep.nonDepreciableLandValueMillionToman),
      structureValueMillion: Math.round(landDep.depreciatedStructureValueMillionToman),
      sampleDeposit: leaseAudit.contractualObligations.refundableDepositMillionToman,
      sampleMonthlyRent: leaseAudit.contractualObligations.monthlyRentMillionToman,
    };
  }, [effectiveBuySqm, effectiveName, selectedHood?.rahn80m]);
  if (!effectiveName || !marketReport || !forecast) return null;
  const isPositiveChange = forecast.expectedChange3mPercent >= 0;
  const projectedUnitPrice = Number(convertPricePerSqmToUnit(forecast.projectedBuyPerSqm, areaUnit).toFixed(1));
  const agg = selectedHood ? aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, effectiveBuySqm, []) : null;
  const projectedDealPerSqm = agg ? Math.round(agg.estimatedDealPricePerSqm * (1 + forecast.expectedChange3mPercent / 100)) : Math.round(forecast.projectedBuyPerSqm * 0.93);
  const projectedDealUnitPrice = Number(convertPricePerSqmToUnit(projectedDealPerSqm, areaUnit).toFixed(1));
  return (
    <div
      data-testid="smart-price-forecast-card"
      className="apple-grouped-card dark:bg-slate-900 p-3.5 mb-3.5 space-y-2.5 text-xs border border-slate-200/80 dark:border-slate-800"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-white">
          <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>پیش‌بینی هوشمند ۳ ماهه ({effectiveName})</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-[7px] text-[10.5px] font-extrabold border ${
            forecast.signalTone === 'bullish'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
              : forecast.signalTone === 'bearish'
                ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
          }`}
        >
          {forecast.signalLabel}
        </span>
      </div>
      {/* Probability Dual Meter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <TrendingUp className="w-3.5 h-3.5 stroke-[2]" />
            <span>شاخص سوگیری رشد: {toPersianNum(forecast.increaseBiasScore)} از ۱۰۰</span>
          </span>
          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <span>شاخص سوگیری اصلاح: {toPersianNum(forecast.decreaseBiasScore)} از ۱۰۰</span>
            <TrendingDown className="w-3.5 h-3.5 stroke-[2]" />
          </span>
        </div>
        <svg
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
          className="h-2.5 w-full rounded-full overflow-hidden border border-slate-200/60 dark:border-slate-800 bg-rose-500"
          role="img"
          aria-label={`شاخص سوگیری افزایش ${toPersianNum(forecast.increaseBiasScore)} در برابر کاهش ${toPersianNum(forecast.decreaseBiasScore)}`}
        >
          <rect
            x={100 - forecast.increaseBiasScore}
            y={0}
            width={forecast.increaseBiasScore}
            height={6}
            className="fill-emerald-500 transition-all duration-500"
          />
        </svg>
      </div>
      {/* 3-Month Target Price & Expected Return */}
      <div className="grid grid-cols-2 gap-2 pt-0.5 text-center bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-[10px] p-2 tabular-nums">
        <div>
          <div className="text-[10.5px] text-slate-500 dark:text-slate-400">تغییر تخمینی ۳ ماهه</div>
          <div
            className={`font-black text-xs mt-0.5 flex items-center justify-center gap-0.5 ${
              isPositiveChange ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {isPositiveChange ? <ArrowUpRight className="w-3.5 h-3.5 shrink-0" /> : <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />}
            <span>{isPositiveChange ? '+' : ''}{toPersianNum(forecast.expectedChange3mPercent)}٪</span>
          </div>
        </div>
        <div className="border-r border-slate-200/70 dark:border-slate-800 pr-2">
          <div className="text-[10.5px] text-slate-500 dark:text-slate-400">قیمت تخمینی ({areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'})</div>
          <div className="font-black text-slate-900 dark:text-white text-xs mt-0.5">
            {toPersianNum(projectedUnitPrice)} <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">م (قطعی معامله: {toPersianNum(projectedDealUnitPrice)} م)</span>
            {intlCurrency !== 'IRT' && (
              <span className="mr-1 text-[9.5px] font-bold text-emerald-700 dark:text-emerald-400" dir="ltr">
                ({formatMillionTomanAsIntlCurrency(projectedUnitPrice, intlCurrency, radarLocale)})
              </span>
            )}
          </div>
        </div>
        <div className="col-span-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 px-1">
          <span>ارزش ۳ ماه آینده ({formatAreaShort(80, areaUnit)}): <strong className="text-slate-900 dark:text-white">{toPersianNum(((forecast.projectedBuyPerSqm * 80) / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(forecast.projectedBuyPerSqm * 80, intlCurrency, radarLocale)})` : ''}</strong></span>
          <span className={isPositiveChange ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold'}>
            {isPositiveChange ? '+' : ''}{toPersianNum(Math.round((forecast.projectedBuyPerSqm - effectiveBuySqm) * 80))} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(Math.round((forecast.projectedBuyPerSqm - effectiveBuySqm) * 80)), intlCurrency, radarLocale)})` : ''}
          </span>
        </div>
      </div>
      {financialAuditSummary && (
        <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowAuditBreakdown((prev) => !prev)}
            className="w-full flex items-center justify-between text-[10.5px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-1 cursor-pointer transition"
          >
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>شفافیت کمیسیون اتحادیه، سهم عرصه و تبدیل رهن ({formatAreaShort(80, areaUnit)})</span>
            </span>
            {showAuditBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showAuditBreakdown && (
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[10px] bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-[9px] p-2 tabular-nums text-center">
              <div>
                <div className="text-slate-500 dark:text-slate-400">کمیسیون + ۱۰٪ مالیات</div>
                <div className="font-extrabold text-slate-900 dark:text-white mt-0.5">{toPersianNum(financialAuditSummary.buyerCommissionWithVat)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(financialAuditSummary.buyerCommissionWithVat, intlCurrency, radarLocale)})` : ''}</div>
              </div>
              <div className="border-x border-slate-200/70 dark:border-slate-800 px-1">
                <div className="text-slate-500 dark:text-slate-400">سهم زمین (بدون استهلاک)</div>
                <div className="font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">{toPersianNum((financialAuditSummary.landValueMillion / 1000).toFixed(1))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(financialAuditSummary.landValueMillion, intlCurrency, radarLocale)})` : ''}</div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">تبدیل ۵۰٪ رهن (نرخ ۳٪)</div>
                <div className="font-extrabold text-slate-900 dark:text-white mt-0.5">{toPersianNum(financialAuditSummary.sampleDeposit)}م + {toPersianNum(financialAuditSummary.sampleMonthlyRent)}م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(financialAuditSummary.sampleDeposit, intlCurrency, radarLocale)} + ${formatMillionTomanAsIntlCurrency(financialAuditSummary.sampleMonthlyRent, intlCurrency, radarLocale)})` : ''}</div>
              </div>
            </div>
          )}
        </div>
      )}
      {!compact && (
        <div className="space-y-1 pt-0.5">
          {forecast.drivers.map((driver, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              <span className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0">•</span>
              <span>{driver}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export interface InspectorSponsorFooterProps {
  selectedHood: EvaluatedNeighborhood;
  enableSponsorBilling: boolean;
  mode: 'rent' | 'buy';
  totalRahnEquivalent: number;
  buyTotalBudget: number;
  isSponsorActiveFn: (sponsor: any, billingEnabled: boolean) => boolean;
  buildSponsorWhatsAppUrlFn: (phone: string, hoodName: string, mode: 'rent' | 'buy', budgetLabel: string) => string;
  onTrackSponsorCall?: (hood: EvaluatedNeighborhood, sponsor: { name: string; phone: string }) => void;
  onReserveSponsorClick: () => void;
  PhoneIcon: React.ComponentType<{ className?: string }>;
  SendIcon: React.ComponentType<{ className?: string }>;
}
export function InspectorSponsorFooter({
  selectedHood,
  enableSponsorBilling,
  mode,
  totalRahnEquivalent,
  buyTotalBudget,
  isSponsorActiveFn,
  buildSponsorWhatsAppUrlFn,
  onTrackSponsorCall,
  onReserveSponsorClick,
  PhoneIcon,
  SendIcon,
}: InspectorSponsorFooterProps): React.ReactElement {
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const sponsorMonthlyRent80m = Math.round(selectedHood.rahn80m * 0.03);
  return (
    <div className="mt-4 pt-3 border-t border-slate-200/70 dark:border-slate-800">
      <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3 space-y-2">
        {isSponsorActiveFn(selectedHood.sponsor, enableSponsorBilling) && selectedHood.sponsor ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">کارشناس رسمی محله {selectedHood.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-100/90 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800 text-[9px] font-extrabold">
                  آگهی اسپانسرینگ · بدون تاثیر بر امتیاز محله
                </span>
                {!enableSponsorBilling && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[9px] font-extrabold">
                    طرح حمایت رایگان رادار
                  </span>
                )}
              </div>
              <div className="text-xs font-extrabold text-slate-900 dark:text-white mt-0.5 truncate">{selectedHood.sponsor.name}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {selectedHood.sponsor.specialty} · {toPersianNum(selectedHood.sponsor.experienceYears)} سال سابقه
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href={buildSponsorWhatsAppUrlFn(
                  selectedHood.sponsor.phone,
                  selectedHood.name,
                  mode,
                  mode === 'rent'
                    ? `رهن حدود ${toPersianNum(totalRahnEquivalent)} میلیون${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(totalRahnEquivalent, intlCurrency, radarLocale)})` : ''}`
                    : `بودجه حدود ${toPersianNum((buyTotalBudget / 1000).toFixed(1))} میلیارد${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(buyTotalBudget, intlCurrency, radarLocale)})` : ''}`
                )} target="_blank"
                rel="noopener noreferrer"
                title="ارسال پیام آماده در واتساپ"
                className="px-2.5 py-2 rounded-[10px] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <SendIcon className="w-3.5 h-3.5 stroke-[1.75]" />
                <span>واتساپ</span>
              </a>
              <a
                href={`tel:${selectedHood.sponsor.phone}`}
                onClick={() => { if (onTrackSponsorCall && selectedHood.sponsor) { onTrackSponsorCall(selectedHood, selectedHood.sponsor); } }} className="px-3 py-2 rounded-[10px] bg-slate-900 dark:bg-white hover:opacity-90 text-white dark:text-slate-900 text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <PhoneIcon className="w-3.5 h-3.5 stroke-[1.75]" />
                <span className="tabular-nums">{toPersianNum(selectedHood.sponsor.phone)}</span>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-[10px] px-3 py-2 text-center">
            تابلوی کارشناس رسمی محله {selectedHood.name} آزاد است — رزرو ویژه املاک
          </div>
        )} <button
          type="button"
          onClick={onReserveSponsorClick} className="w-full py-1.5 rounded-[9px] bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 font-medium transition cursor-pointer"
        >
          رزرو تابلوی کارشناس رسمی محله {selectedHood.name} </button>
      </div>
    </div>
  ); }