/** @file src/features/onboarding/services/salesLiquidityStage78Engine.ts — Stage 78 Pure Sales Market & Liquidity Engine (Zero React Imports) */
import type { Stage78SalesLiquidityProfile } from './salesLiquidityStage78Types';

export interface Stage78GapDomLiquidityResult {
  entitiesSeparationAndQualityGuardFa: string;
  askingGapAndWaitingCostSandboxFa: string;
  domSurvivalAndLiquidityConfidenceGuardFa: string;
}

export interface Stage78YieldRiskPrivacyResult {
  yieldRoiAndInflationRealReturnFa: string;
  motiveBehavioralAndCycleGuardFa: string;
  spatialAndTelemetryPrivacyGuardFa: string;
}

export function evaluateSalesGapDomAndLiquidity(
  profile: Stage78SalesLiquidityProfile,
  askingBillionPa: number,
  dealBillionPt: number,
  monthlyHoldMillion: number,
  waitMonths: number,
  includeUnsoldSurvival: boolean,
): Stage78GapDomLiquidityResult {
  const entitiesSeparationAndQualityGuardFa =
    `تمایز ۳ موجودیت: آگهی (${profile.activeSaleListingsCount}) ≠ ملک ≠ معامله (${profile.registeredDealsCount} ثبت‌شده / ${profile.verifiedDealsCount} تأییدشده) | سطح کیفیت: «${profile.priceQualityTier}» (اطمینان ${profile.confidenceLevelFa}، نبود داده ≠ نبود معامله).`;

  const safePa = Math.max(0.1, askingBillionPa);
  const gapPct = ((safePa - dealBillionPt) / safePa) * 100;
  const waitCostMillion = monthlyHoldMillion * waitMonths;

  const askingGapAndWaitingCostSandboxFa =
    `شکاف نسبی G = ((Pa − Pt) / Pa) × 100 = ${gapPct.toFixed(1)}% (نمونه ${askingBillionPa} به ${dealBillionPt} م.ت — تعمیم به کل محله ممنوع) | هزینه انتظار آزمایشی: ${waitCostMillion.toLocaleString('fa-IR')} م.ت (فقط نگهداری×مدت؛ بدون هزینه فرصت سرمایه و مالیات).`;

  const liquidityLabel =
    profile.liquidityScore === null
      ? `وضعیت: «${profile.liquidityBandFa}» (پوشش داده ${profile.dataCoveragePct}%)`
      : `نقدشوندگی: ${profile.liquidityScore}/۱۰۰ («${profile.liquidityBandFa}») با پوشش ${profile.dataCoveragePct}% و اطمینان ${profile.confidenceLevelFa} (امتیاز با پوشش ضعیف ≠ پوشش قوی).`;

  const domText = includeUnsoldSurvival
    ? `DOM=${profile.medianDaysOnMarket} روز ≠ تکمیل معامله=${profile.medianClosingDurationDays} روز | ${profile.unsoldActiveCount} ملک با برچسب «هنوز فروخته نشده» در تحلیل بقا لحاظ شدند.`
    : 'هشدار سوگیری بقا: حذف املاک فروخته‌نشده مدت فروش واقعی را کمتر از واقع نشان می‌دهد.';

  const domSurvivalAndLiquidityConfidenceGuardFa = `${liquidityLabel} | ${domText}`;

  return {
    entitiesSeparationAndQualityGuardFa,
    askingGapAndWaitingCostSandboxFa,
    domSurvivalAndLiquidityConfidenceGuardFa,
  };
}

export function evaluateYieldCycleAndPrivacy(
  profile: Stage78SalesLiquidityProfile,
  purchaseBillion: number,
  annualRentMillion: number,
  annualCostMillion: number,
  nominalReturnPct: number,
  inflationPct: number,
  redactPrivateDealLocations: boolean,
): Stage78YieldRiskPrivacyResult {
  const priceMillion = Math.max(1, purchaseBillion * 1000);
  const ygPct = (annualRentMillion / priceMillion) * 100;
  const ynPct = ((annualRentMillion - annualCostMillion) / priceMillion) * 100;
  const realReturnPct =
    ((1 + nominalReturnPct / 100) / Math.max(0.1, 1 + inflationPct / 100) - 1) * 100;

  const yieldRoiAndInflationRealReturnFa =
    `تحلیل سناریویی (نه وعده سود): بازده ناخالص اجاره Yg=${ygPct.toFixed(2)}% | خالص Yn=${ynPct.toFixed(2)}% | بازده واقعی تورم‌زدایی‌شده R_real = ${realReturnPct.toFixed(2)}% (فرضیات: تورم ${inflationPct}% و بازده اسمی ${nominalReturnPct}%).`;

  const motiveBehavioralAndCycleGuardFa =
    `تفکیک مصرفی/سرمایه‌ای صرفاً با شواهد کافی (نه صرفاً از قیمت یا متراژ) | تغییر قیمت فروشنده تحلیل رفتاری بازار است نه تشخیص روان‌شناختی فرد | چرخه دوبعدی محله «${profile.zoneNameFa}» اثبات‌کننده کل چرخه اقتصادی نیست.`;

  const spatialAndTelemetryPrivacyGuardFa = redactPrivateDealLocations
    ? 'حفاظت مکانی و حریم خصوصی: موقعیت دقیق معاملات خصوصی، هویت طرفین، تماس، اسناد معامله و دارایی شخصی از نقشه عمومی و Telemetry حذف شده‌اند.'
    : 'هشدار امنیتی: انتشار موقعیت دقیق معامله یا اطلاعات طرفین معامله غیرمجاز است.';

  return {
    yieldRoiAndInflationRealReturnFa,
    motiveBehavioralAndCycleGuardFa,
    spatialAndTelemetryPrivacyGuardFa,
  };
}
