/** @file src/features/onboarding/services/rentalMarketStage77Engine.ts — Stage 77 Pure Rental Market & Affordability Engine (Zero React Imports) */
import type {
  Stage77BurdenTier,
  Stage77RentalZoneProfile,
} from './rentalMarketStage77Types';

export interface Stage77SupplyOutliersConversionResult {
  askingVsContractAndDedupGuardFa: string;
  distributionAndOutliersComparisonFa: string;
  rahnEquivalentFormulaAndSandboxFa: string;
}

export interface Stage77HbrTenurePrivacyResult {
  hbrAndResidualIncomeGuardFa: string;
  nuancedBudgetMessageAndCostVsCommuteFa: string;
  tenureSecurityAndAntiPiiTelemetryGuardFa: string;
}

export function classifyCostBurdenTier(hbrPct: number): Stage77BurdenTier {
  if (hbrPct <= 25) return 'مناسب';
  if (hbrPct <= 35) return 'متعادل';
  if (hbrPct <= 50) return 'فشار بالا';
  return 'فشار شدید';
}

export function evaluateRentalSupplyOutliersAndConversion(
  profile: Stage77RentalZoneProfile,
  monthlyRentRmMillion: number,
  depositDMillion: number,
  annualRatePct: number,
  excludeOutliers: boolean,
): Stage77SupplyOutliersConversionResult {
  const askingVsContractAndDedupGuardFa =
    `قیمت آگهی ≠ قیمت نهایی قرارداد (شکاف متوسط ${profile.askingVsContractGapPct}%) | تشخیص تکرار: ${profile.uniqueRentalUnits.toLocaleString('fa-IR')} واحد یکتا از ${profile.activeListingsRaw.toLocaleString('fa-IR')} آگهی خام (وضعیت‌های سه‌گانه: یکتا/تکراری/نیازمند بررسی، حذف خودکار ممنوع) | قراردادهای ثبت‌شده: ${profile.registeredContractsCount.toLocaleString('fa-IR')}.`;

  const activeMean = excludeOutliers ? profile.meanWithoutOutliersMillion : profile.meanMonthlyRentMillion;
  const distributionAndOutliersComparisonFa =
    `میانگین (${activeMean} م.ت ${excludeOutliers ? 'بدون پرت' : 'با پرت'}) هم‌زمان با میانه (${profile.medianMonthlyRentMillion} م.ت) و چارک‌ها (Q1=${profile.q1RentMillion} / Q3=${profile.q3RentMillion}) | نمونه‌های پرت حذف‌شده با روش IQR: ${profile.outlierExcludedCount} مورد.`;

  const depositEquivalent = (depositDMillion * (annualRatePct / 100)) / 12;
  const rEq = monthlyRentRmMillion + depositEquivalent;

  const rahnEquivalentFormulaAndSandboxFa =
    `فرمول Req = Rm + (D × r) / 12 با نرخ شفاف و تاریخ‌دار (${annualRatePct}٪ قابل تغییر): اجاره ${monthlyRentRmMillion.toFixed(1)} م.ت + معادل ودیعه ${depositEquivalent.toFixed(1)} م.ت = ${rEq.toFixed(1)} میلیون تومان (ودیعه و اجاره جداگانه نیز ثبت می‌شوند).`;

  return {
    askingVsContractAndDedupGuardFa,
    distributionAndOutliersComparisonFa,
    rahnEquivalentFormulaAndSandboxFa,
  };
}

export function evaluateHbrResidualTenureAndPrivacy(
  profile: Stage77RentalZoneProfile,
  householdIncomeYhMillion: number,
  monthlyHousingCostChMillion: number,
  includeAncillaryInCh: boolean,
  redactIndividualIncomeAndPii: boolean,
): Stage77HbrTenurePrivacyResult {
  const effectiveCh = includeAncillaryInCh
    ? monthlyHousingCostChMillion + profile.monthlyAncillaryMillion
    : monthlyHousingCostChMillion;
  const safeIncome = Math.max(1, householdIncomeYhMillion);
  const hbrPct = (effectiveCh / safeIncome) * 100;
  const residualYr = safeIncome - effectiveCh;
  const tier = classifyCostBurdenTier(hbrPct);

  const hbrAndResidualIncomeGuardFa =
    `HBR = (Ch / Yh) × 100 = ${hbrPct.toFixed(1)}% («${tier}» — آستانه تحلیلی پیشنهادی، نه حکم قطعی) | درآمد باقیمانده Yr = Yh − Ch = ${residualYr.toFixed(1)} م.ت (${includeAncillaryInCh ? 'شامل هزینه جانبی' : 'بدون هزینه جانبی'}).`;

  const nuancedBudgetMessageAndCostVsCommuteFa =
    `در گروه درآمدی مورد بررسی، بخش محدودی از واحدهای عرضه‌شده در محدوده بودجه ماهانه قرار دارند؛ بخش عمده گزینه‌ها از ظرفیت مالی این گروه فراتر می‌روند (جایگزین عبارت ساده‌انگارانه «این محله گران است») | «ارزان‌تر» ≠ «مقرون‌به‌صرفه‌تر»: اجاره میانه ${profile.medianMonthlyRentMillion} م.ت در برابر رفت‌وآمد ماهانه ${profile.monthlyCommuteMillion} م.ت.`;

  const tenureSecurityAndAntiPiiTelemetryGuardFa = redactIndividualIncomeAndPii
    ? `پایداری سکونت تجمیعی: ${profile.forcedVsVoluntaryWarningFa} (افزایش اجاره و جابه‌جایی هم‌زمان ≠ علیت قطعی؛ منبع تجمیعی بدون افشای تماس/درآمد فردی یا ثبت مبالغ کاربر در Telemetry).`
    : 'هشدار امنیتی: افشای درآمد یا تماس مستأجر/مالک در نقشه عمومی یا Telemetry ممنوع است.';

  return {
    hbrAndResidualIncomeGuardFa,
    nuancedBudgetMessageAndCostVsCommuteFa,
    tenureSecurityAndAntiPiiTelemetryGuardFa,
  };
}
