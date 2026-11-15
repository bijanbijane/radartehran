/** @file src/features/onboarding/services/investmentOpportunityStage79Engine.ts — Stage 79 Pure Investment Opportunity & NPV/IRR Engine (Zero React Imports) */
import type { Stage79InvestmentProfile } from './investmentOpportunityStage79Types';

export interface Stage79SpatialParcelResult {
  upstreamConsumerAndFitRankingGuardFa: string;
  landPriceAndFarCapacityGuardFa: string;
  consolidationAndRegenerationDualAxisGuardFa: string;
}

export interface Stage79NpvCostSensitivityResult {
  npvBillion: number | null;
  irrPct: number | null;
  npvIrrAndNoDoubleCountGuardFa: string;
  costEstimateTierAndScenarioGuardFa: string;
  antiSpeculationAndTelemetryPrivacyGuardFa: string;
}

export function calculateNpv(cashFlows: ReadonlyArray<number>, discountRatePct: number): number | null {
  if (cashFlows.length < 2) return null;
  const r = discountRatePct / 100;
  if (r <= -0.99) return null;
  return cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + r, t), 0);
}

export function estimateIrrWithGuard(cashFlows: ReadonlyArray<number>): {
  irrPct: number | null;
  statusFa: string;
} {
  if (cashFlows.length < 2) {
    return { irrPct: null, statusFa: 'جریان نقدی معتبر ثبت نشده؛ محاسبه NPV و IRR انجام نشد.' };
  }
  let signChanges = 0;
  for (let i = 1; i < cashFlows.length; i += 1) {
    if ((cashFlows[i - 1] < 0 && cashFlows[i] > 0) || (cashFlows[i - 1] > 0 && cashFlows[i] < 0)) {
      signChanges += 1;
    }
  }
  if (signChanges === 0) {
    return { irrPct: null, statusFa: 'تغییر علامت جریان نقد وجود ندارد؛ نرخ بازده داخلی (IRR) نامعتبر است.' };
  }
  if (signChanges > 1) {
    return { irrPct: null, statusFa: 'هشدار چندریشه‌ای IRR (تغییر علامت بیش از یک بار)؛ به NPV تکیه کنید.' };
  }

  let low = -0.5;
  let high = 3.0;
  const fLow = calculateNpv(cashFlows, low * 100) ?? 0;
  const fHigh = calculateNpv(cashFlows, high * 100) ?? 0;
  if (fLow * fHigh > 0) {
    return { irrPct: null, statusFa: 'ریشه IRR در بازه متعارف یافت نشد؛ جریان نقد را بازبینی کنید.' };
  }
  for (let iter = 0; iter < 50; iter += 1) {
    const mid = (low + high) / 2;
    const fMid = calculateNpv(cashFlows, mid * 100) ?? 0;
    if (Math.abs(fMid) < 1e-6) {
      low = mid;
      high = mid;
      break;
    }
    if (fLow * fMid <= 0) {
      high = mid;
    } else {
      low = mid;
    }
  }
  const irrPct = ((low + high) / 2) * 100;
  return { irrPct, statusFa: `IRR تخمینی تک‌ریشه: ${irrPct.toFixed(1)}%` };
}

export function evaluateSpatialParcelOpportunity(
  profile: Stage79InvestmentProfile,
): Stage79SpatialParcelResult {
  const upstreamConsumerAndFitRankingGuardFa =
    `مصرف‌کننده زیرسامانه‌های رادار (بدون پایگاه داده موازی) | برچسب رتبه‌بندی: «${profile.fitLabelFa}» (هرگز به‌عنوان «بهترین سرمایه‌گذاری» معرفی نمی‌شود) | قیمت پایین ≠ فرصت؛ جذابیت مکانی ≠ امکان‌پذیری مالی.`;

  const landPriceAndFarCapacityGuardFa =
    `قیمت زمین: ${profile.landPricePerSqmMillion} م.ت/متر با سطح مجزای «${profile.landPriceTier}» (پیشنهادی ≠ معامله ≠ مدل) | تراکم مجاز قانونی ${profile.legalFarMax}% ≠ ظرفیت اقتصادی بهینه ${profile.economicOptimalFar}%.`;

  const consolidationText = profile.legalConsolidationApproved
    ? `${profile.parcelConsolidationSelectedCount} پلاک با مستندات تجمیع حقوقی.`
    : `انتخاب تحلیلی ${profile.parcelConsolidationSelectedCount} پلاک برای بررسی تجمیع (انتخاب در نقشه ≠ امکان یا تأیید قانونی تجمیع).`;

  const regenerationText = profile.isRegenerationArea
    ? `بازآفرینی دومتغیره: «${profile.publicValueAxesFa}» (سود مالی جابه‌جایی اجباری را توجیه نمی‌کند).`
    : `پیوست مکانی و عمومی: «${profile.publicValueAxesFa}».`;

  return {
    upstreamConsumerAndFitRankingGuardFa,
    landPriceAndFarCapacityGuardFa,
    consolidationAndRegenerationDualAxisGuardFa: `${consolidationText} | ${regenerationText}`,
  };
}

export function evaluateNpvCostAndPrivacy(
  profile: Stage79InvestmentProfile,
  discountRatePct: number,
  constructionCostMultiplierPct: number,
  preventDoubleCountFinancing: boolean,
  redactInvestorSpeculationPii: boolean,
): Stage79NpvCostSensitivityResult {
  const adjustedFlows = profile.hasValidCashFlows
    ? profile.cashFlowsBillion.map((cf) => (cf < 0 ? cf * (constructionCostMultiplierPct / 100) : cf))
    : [];

  const npvBillion = profile.hasValidCashFlows ? calculateNpv(adjustedFlows, discountRatePct) : null;
  const irrCheck = estimateIrrWithGuard(adjustedFlows);

  const npvSummary =
    npvBillion === null
      ? 'جریان نقدی معتبر وجود ندارد؛ سیستم عدد ساختگی NPV/IRR تولید نمی‌کند.'
      : `NPV (با نرخ تنزیل ${discountRatePct}%): ${npvBillion.toFixed(1)} م.م.ت | ${irrCheck.statusFa}`;

  const financingDoubleCount = preventDoubleCountFinancing
    ? 'کنترل شمارش مضاعف فعال: سود تأمین مالی هم‌زمان در جریان نقد آزاد و نرخ تنزیل WACC دوبار لحاظ نمی‌شود.'
    : 'هشدار روش‌شناختی: احتساب هم‌زمان هزینه بهره در جریان نقد و نرخ تنزیل موجب شمارش مضاعف است.';

  const costEstimateTierAndScenarioGuardFa =
    `سطح برآورد هزینه: «${profile.costEstimateTier}» (۳ سطح مجزا بدون درصد خطای ثابت ساختگی) | ارزش آینده قطعی نیست و نتایج صرفاً سناریویی با پوشش ${profile.dataCoveragePct}% هستند.`;

  const antiSpeculationAndTelemetryPrivacyGuardFa = redactInvestorSpeculationPii
    ? 'حفاظت حریم خصوصی و ضدسفته‌بازی: مشخصات مالکان، اسناد خصوصی و مفروضات مالی شخصی در Telemetry عمومی ثبت نمی‌شود.'
    : 'هشدار امنیتی: نمایش عمومی اطلاعات مالک و اسناد خصوصی غیرمجاز است.';

  return {
    npvBillion,
    irrPct: irrCheck.irrPct,
    npvIrrAndNoDoubleCountGuardFa: `${npvSummary} | ${financingDoubleCount}`,
    costEstimateTierAndScenarioGuardFa,
    antiSpeculationAndTelemetryPrivacyGuardFa,
  };
}
