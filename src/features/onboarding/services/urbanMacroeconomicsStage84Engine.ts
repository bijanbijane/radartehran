/** @file src/features/onboarding/services/urbanMacroeconomicsStage84Engine.ts — Stage 84 Pure Macroeconomics, Real vs Nominal, Installment & Lag Engine (Zero React Imports) */
import type { Stage84MacroRegionProfile } from './urbanMacroeconomicsStage84Types';

export interface Stage84InflationFxCyclesResult {
  realPriceGrowthPct: number;
  estimatedConstructionShockPct: number;
  monthlyInstallmentMillion: number;
  geoSeparationAndRealVsNominalGuardFa: string;
  fxPassThroughAndAsyncCyclesGuardFa: string;
  mortgageCalculatorGuardFa: string;
}

export interface Stage84LagScenariosGovernanceResult {
  lagCorrelationAndCausationGuardFa: string;
  scenarioAndForecastUncertaintyGuardFa: string;
  conflictingSourcesAndTelemetryPrivacyGuardFa: string;
}

export function calculateRealGrowth(nominalGrowthPct: number, inflationPct: number): number {
  return ((1 + nominalGrowthPct / 100) / Math.max(0.1, 1 + inflationPct / 100) - 1) * 100;
}

export function calculateMonthlyInstallment(
  loanBillion: number,
  annualRatePct: number,
  years: number,
): number {
  const principalMillion = Math.max(0, loanBillion * 1000);
  const n = Math.max(1, Math.round(years * 12));
  const monthlyRate = Math.max(0, annualRatePct) / 100 / 12;
  if (monthlyRate === 0) return principalMillion / n;
  const factor = Math.pow(1 + monthlyRate, n);
  return (principalMillion * monthlyRate * factor) / (factor - 1);
}

export function evaluateInflationFxAndCycles(
  profile: Stage84MacroRegionProfile,
  hypotheticalFxShockPct: number,
  loanBillion: number,
  annualInterestPct: number,
  termYears: number,
): Stage84InflationFxCyclesResult {
  const realPriceGrowthPct = calculateRealGrowth(
    profile.nominalHousingGrowthPct,
    profile.generalInflationPct,
  );
  const estimatedConstructionShockPct =
    hypotheticalFxShockPct * (profile.fxPassThroughSharePct / 100);
  const monthlyInstallmentMillion = calculateMonthlyInstallment(
    loanBillion,
    annualInterestPct,
    termYears,
  );

  const geoSeparationAndRealVsNominalGuardFa =
    `تفکیک سطح ملی (${profile.generalInflationPct}% تورم کل) از شهری (${profile.housingInflationPct}% تورم مسکن) | رشد اسمی (${profile.nominalHousingGrowthPct}%) ≠ رشد واقعی تعدیل‌شده (${realPriceGrowthPct.toFixed(1)}%) — ۳ لایه مستقل: داده مشاهده‌شده / تحلیل آماری / تفسیر اقتصادی.`;

  const asyncNote =
    profile.salesCyclePhase !== profile.rentalCyclePhase
      ? `ناهم‌زمانی چرخه‌ها: بازار خرید («${profile.salesCyclePhase}») ≠ بازار اجاره («${profile.rentalCyclePhase}») — برچسب واحد برای کل بازار ممنوع.`
      : `هم‌جهتی موقت چرخه خرید و اجاره («${profile.salesCyclePhase}») بدون تعمیم یکسان به همه کاربری‌ها.`;

  const fxPassThroughAndAsyncCyclesGuardFa =
    `برآورد سناریویی انتقال ارز به هزینه ساخت (سهم نهاده ارزی ${profile.fxPassThroughSharePct}%): +${estimatedConstructionShockPct.toFixed(1)}% تغییر هزینه | ${asyncNote}`;

  const mortgageCalculatorGuardFa =
    `محاسبه‌گر اقساط (نه توصیه‌گر اعتباری): وام ${loanBillion} م.م.ت با نرخ ${annualInterestPct}% برای ${termYears} سال => قسط ماهانه ${monthlyInstallmentMillion.toFixed(1)} م.ت.`;

  return {
    realPriceGrowthPct,
    estimatedConstructionShockPct,
    monthlyInstallmentMillion,
    geoSeparationAndRealVsNominalGuardFa,
    fxPassThroughAndAsyncCyclesGuardFa,
    mortgageCalculatorGuardFa,
  };
}

export function evaluateLagScenariosAndGovernance(
  profile: Stage84MacroRegionProfile,
  lagMonths: number,
  redactPrivateScenariosAndPii: boolean,
): Stage84LagScenariosGovernanceResult {
  const lagCorrelationAndCausationGuardFa =
    profile.observationMonthsCount < 12
      ? `محدودیت داده (${profile.observationMonthsCount} مشاهده): دوره کوتاه است؛ نمایش نتیجه قطعی همبستگی یا رگرسیون در تأخیر ${lagMonths}ماهه متوقف شد (همبستگی ≠ علیت).`
      : `تحلیل تأخیر زمانی (${lagMonths} ماه با ${profile.observationMonthsCount} مشاهده): همبستگی مشاهده‌شده به معنای اثبات علیت قطعی نیست و متغیرهای مداخله‌گر لحاظ می‌شوند.`;

  const scenarioAndForecastUncertaintyGuardFa =
    `تفاوت سناریوسازی (فرضیات کاربر: پایه/فشار/بهبود) از پیش‌بینی مدل: پیش‌بینی همواره همراه بازه عدم‌قطعیت و خطای تاریخی مدل است (هرگز خط قطعی تک‌عددی نمایش داده نمی‌شود).`;

  const conflictText = profile.hasConflictingInflationSources
    ? `هشدار تناقض منابع (برچسب کیفیت: «${profile.dataQualityLabel}»): اختلاف دو مرجع آماری بدون پنهان‌کاری نمایش داده شد.`
    : `برچسب کیفیت داده: «${profile.dataQualityLabel}» با سابقه اصلاح و تازگی داده.`;

  const privacyText = redactPrivateScenariosAndPii
    ? 'سناریوهای خصوصی، مقادیر حساس مالی خانوار و هویت کاربران در Telemetry عمومی ذخیره نمی‌شوند.'
    : 'هشدار امنیتی: انتشار عمومی سناریوهای خصوصی یا داده‌های خانوار در سطح فردی مجاز نیست.';

  return {
    lagCorrelationAndCausationGuardFa,
    scenarioAndForecastUncertaintyGuardFa,
    conflictingSourcesAndTelemetryPrivacyGuardFa: `${conflictText} | ${privacyText}`,
  };
}
