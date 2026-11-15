/** @file src/features/onboarding/services/constructionEconomicsStage80Engine.ts — Stage 80 Pure Construction Economics & CV/LCC Engine (Zero React Imports) */
import type { Stage80ConstructionProfile } from './constructionEconomicsStage80Types';

export interface Stage80CostMaterialsEquipmentResult {
  entitiesAndFloorAreaBasisGuardFa: string;
  materialQuoteVsContractorAndStage93GuardFa: string;
  excavationSafetyAndDuplicateInvoiceGuardFa: string;
}

export interface Stage80BudgetCvLccPrivacyResult {
  totalDevCdBillion: number;
  costVarianceCvBillion: number;
  costVariancePct: number;
  lccBillion: number;
  budgetVarianceAndProgressGapFa: string;
  lccAndBoundaryWithStage79Fa: string;
  contractorAndInvoicePrivacyGuardFa: string;
}

export function calculateLcc(
  c0: number,
  annualOpCosts: ReadonlyArray<number>,
  discountRatePct: number,
): number {
  const r = Math.max(0.01, discountRatePct / 100);
  return annualOpCosts.reduce((sum, ct, idx) => sum + ct / Math.pow(1 + r, idx + 1), c0);
}

export function evaluateConstructionCostMaterialsAndSafety(
  profile: Stage80ConstructionProfile,
): Stage80CostMaterialsEquipmentResult {
  const perSqmGross = (profile.initialCostCiBillion * 1000) / Math.max(1, profile.grossAreaSqm);
  const perSqmUseful = (profile.initialCostCiBillion * 1000) / Math.max(1, profile.usefulAreaSqm);

  const entitiesAndFloorAreaBasisGuardFa =
    `تمایز ۳ موجودیت: قلم هزینه ≠ فعالیت اجرایی ≠ پروژه | هزینه مستقیم هر متر زیربنای ناخالص (${perSqmGross.toFixed(1)} م.ت) ≠ زیربنای مفید (${perSqmUseful.toFixed(1)} م.ت) | هزینه زمین و تخریب جداگانه ثبت می‌شوند.`;

  const materialQuoteVsContractorAndStage93GuardFa =
    `نقل‌قول فروشنده میلگرد (${profile.sellerQuotedSteelPerKgToman.toLocaleString('fa-IR')} تومان در ${profile.materialQuoteDateFa}) ≠ قیمت خرید واقعی پیمانکار (${profile.contractorActualSteelPerKgToman.toLocaleString('fa-IR')} تومان) | دستمزد کارگر ≠ کارمزد پیمانکار.`;

  const dupText =
    profile.duplicateInvoiceSuspectedCount > 0
      ? `هشدار کنترل فاکتور: ${profile.duplicateInvoiceSuspectedCount} فاکتور مشکوک به تکرار پرچم‌گذاری شد (حذف خودکار ممنوع؛ نیازمند بررسی حسابرسی).`
      : 'فاکتور تکراری مشکوک ثبت نشده است.';

  const excavationText = profile.hasExcavationSoilAndNeighborDocs
    ? 'مدارک ژئوتکنیک و وضعیت املاک مجاور برای گودبرداری پیوست شده است.'
    : 'هشدار ایمنی حیاتی: اطلاعات مکانیک خاک و پلاک‌های مجاور ثبت نشده؛ گودبرداری و سازه نگهبان با ریسک ایمنی بالا.';

  return {
    entitiesAndFloorAreaBasisGuardFa,
    materialQuoteVsContractorAndStage93GuardFa,
    excavationSafetyAndDuplicateInvoiceGuardFa: `${dupText} | ${excavationText}`,
  };
}

export function evaluateBudgetCvLccAndPrivacy(
  profile: Stage80ConstructionProfile,
  approvedBudgetBillion: number,
  actualSpentBillion: number,
  annualMaintenanceBillion: number,
  lccDiscountRatePct: number,
  redactContractorWagesAndInvoices: boolean,
): Stage80BudgetCvLccPrivacyResult {
  const totalDevCdBillion =
    profile.initialCostCiBillion + profile.financingCostCfBillion + profile.operatingPrepCoBillion;
  const costVarianceCvBillion = approvedBudgetBillion - actualSpentBillion;
  const costVariancePct =
    ((actualSpentBillion - approvedBudgetBillion) / Math.max(0.1, approvedBudgetBillion)) * 100;

  const lccBillion = calculateLcc(
    profile.initialCostCiBillion,
    [annualMaintenanceBillion, annualMaintenanceBillion, annualMaintenanceBillion, annualMaintenanceBillion, annualMaintenanceBillion],
    lccDiscountRatePct,
  );

  const budgetVarianceAndProgressGapFa =
    `Cd = ${totalDevCdBillion} م.م.ت (ساخت+تأمین مالی+بهره‌برداری) | CV = B − A = ${costVarianceCvBillion.toFixed(1)} م.م.ت | CV% = ${costVariancePct.toFixed(1)}% | پیشرفت فیزیکی (${profile.physicalProgressPct}%) ≠ پیشرفت مالی (${profile.financialProgressPct}%).`;

  const lccAndBoundaryWithStage79Fa =
    `LCC ۵ساله تنزیل‌شده: ${lccBillion.toFixed(1)} م.م.ت | برآورد اولیه ≠ بودجه مصوب نسخه‌بندی‌شده ≠ هزینه واقعی | هزینه ساخت ≠ قیمت فروش نهایی (مرز مرحله ۷۹ و ۸۰).`;

  const contractorAndInvoicePrivacyGuardFa = redactContractorWagesAndInvoices
    ? 'حفاظت اسناد: دستمزد افراد، مبلغ فاکتورهای محرمانه و PII پیمانکاران از نمای عمومی و Telemetry حذف شده‌اند.'
    : 'هشدار امنیتی: افشای اطلاعات مالی خصوصی پیمانکاران و فاکتورها در نمای عمومی مجاز نیست.';

  return {
    totalDevCdBillion,
    costVarianceCvBillion,
    costVariancePct,
    lccBillion,
    budgetVarianceAndProgressGapFa,
    lccAndBoundaryWithStage79Fa,
    contractorAndInvoicePrivacyGuardFa,
  };
}
