/** @file src/features/onboarding/services/urbanInvestmentStage83Engine.ts — Stage 83 Pure Urban Investment, Capital Funnel, WACC & PPP Engine (Zero React Imports) */
import type { Stage83CapitalProjectProfile } from './urbanInvestmentStage83Types';

export interface Stage83CapitalFlowPppResult {
  fiveEntitiesAndFourFunnelsGuardFa: string;
  spatialConcentrationAndPppFiscalGuardFa: string;
  waccVsBankRateAndJointVentureGuardFa: string;
}

export interface Stage83ReturnsPublicImpactPrivacyResult {
  realAdjustedReturnPct: number | null;
  dualEconomyPrivateVsPublicGuardFa: string;
  missingDataAndHeterogeneousCompareGuardFa: string;
  investorConfidentialityAndTelemetryGuardFa: string;
}

export function calculateWacc(
  debtWeight: number,
  costOfDebtPct: number,
  equityWeight: number,
  costOfEquityPct: number,
): number {
  const total = Math.max(0.01, debtWeight + equityWeight);
  return (debtWeight / total) * costOfDebtPct + (equityWeight / total) * costOfEquityPct;
}

export function evaluateCapitalFlowAndPpp(
  profile: Stage83CapitalProjectProfile,
  debtSharePct: number,
): Stage83CapitalFlowPppResult {
  const equitySharePct = Math.max(0, 100 - debtSharePct);
  const dynamicWacc = calculateWacc(
    debtSharePct,
    profile.costOfDebtPct,
    equitySharePct,
    profile.costOfEquityPct,
  );

  const fiveEntitiesAndFourFunnelsGuardFa =
    `۵ موجودیت (فرصت ≠ پروژه ≠ ساختار تأمین مالی ≠ قرارداد مشارکت ≠ عملکرد) | تفکیک ۴ قیف سرمایه: اعلام‌شده (${profile.announcedCapitalBillion}) ≠ تعهدشده (${profile.committedCapitalBillion}) ≠ تأمین‌شده (${profile.fundedCapitalBillion}) ≠ مصرف‌شده (${profile.spentCapitalBillion}) م.م.ت.`;

  const concentrationWarning =
    profile.spatialConcentrationSharePct >= 40
      ? `هشدار تمرکز فضایی سرمایه (${profile.spatialConcentrationSharePct}% در محدوده) — تمرکز به‌خودی‌خود نامطلوب نیست اما نیازمند پایش توزیع فرصت‌هاست.`
      : `سهم جغرافیایی سرمایه (${profile.spatialConcentrationSharePct}%) — عدالت سرمایه‌گذاری ≠ تقسیم برابر بدون توجه به محرومیت.`;

  const pppFiscalText =
    profile.longTermPublicCommitmentBillion > 0
      ? `تعهد بلندمدت نهاد عمومی و تضمین‌ها: ${profile.longTermPublicCommitmentBillion} م.م.ت (افشای کامل هزینه آتی PPP).`
      : 'فاقد تعهد تضمین درآمد عمومی؛ تأمین مالی کاملاً خصوصی.';

  const waccVsBankRateAndJointVentureGuardFa =
    `WACC محاسبه‌شده (${debtSharePct}% بدهی / ${equitySharePct}% آورده): ${dynamicWacc.toFixed(1)}% (هزینه سرمایه ≠ نرخ سود بانکی) | مشارکت در ساخت: برآورد تحلیلی است نه قرارداد حقوقی معتبر.`;

  return {
    fiveEntitiesAndFourFunnelsGuardFa,
    spatialConcentrationAndPppFiscalGuardFa: `${concentrationWarning} | ${pppFiscalText}`,
    waccVsBankRateAndJointVentureGuardFa,
  };
}

export function evaluateReturnsPublicImpactAndPrivacy(
  profile: Stage83CapitalProjectProfile,
  compareHeterogeneousProjects: boolean,
  redactInvestorConfidentialData: boolean,
): Stage83ReturnsPublicImpactPrivacyResult {
  const realAdjustedReturnPct =
    profile.nominalReturnPct === null
      ? null
      : ((1 + profile.nominalReturnPct / 100) / Math.max(0.1, 1 + profile.inflationRatePct / 100) -
          1) *
        100;

  const returnLabel =
    realAdjustedReturnPct === null
      ? 'اطلاعات مالی برای محاسبه بازده کافی نیست («نامعتبر/محاسبه‌نشده»؛ عدد ظاهراً دقیق تولید نمی‌شود).'
      : `بازده اسمی (${profile.nominalReturnPct}%) ≠ بازده واقعی تورم‌زدایی‌شده (${realAdjustedReturnPct.toFixed(1)}%) — بازده پیش‌بینی‌شده تضمین سود نیست.`;

  const dualEconomyPrivateVsPublicGuardFa =
    `اقتصاد سرمایه‌گذاری (WACC ${profile.waccPct}%) در کنار اقتصاد عمومی: «${profile.publicBenefitSummaryFa}» | پروژه‌های تأمین مالی‌شده ≠ عملکرد نهایی موفق.`;

  const compareGuard = compareHeterogeneousProjects
    ? 'هشدار روش‌شناختی: مقایسه مستقیم نرخ بازده پروژه تجاری کوتاه‌مدت با پروژه زیرساختی بلندمدت بدون تعدیل معتبر نیست.'
    : 'کنترل مقایسه همگن: مقایسه پروژه‌ها با لحاظ دوره، اندازه، ماهیت و ریسک باقی‌مانده انجام می‌شود.';

  const investorConfidentialityAndTelemetryGuardFa = redactInvestorConfidentialData
    ? 'محرمانگی و Telemetry: اسناد مالی محرمانه، مذاکرات سرمایه‌گذاران و هویت شرکای خصوصی از خروجی عمومی، نمودارها و Telemetry حذف شده‌اند.'
    : 'هشدار امنیتی: بازسازی یا افشای اطلاعات محرمانه سرمایه‌گذاران غیرمجاز است.';

  return {
    realAdjustedReturnPct,
    dualEconomyPrivateVsPublicGuardFa,
    missingDataAndHeterogeneousCompareGuardFa: `${returnLabel} | ${compareGuard}`,
    investorConfidentialityAndTelemetryGuardFa,
  };
}
