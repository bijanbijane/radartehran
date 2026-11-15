/** @file src/features/onboarding/services/housingDemandSupplyStage74Engine.ts — Stage 74 Pure Market Equilibrium Engine (Zero React Imports) */
import type { Stage74MarketEquilibriumProfile } from './housingDemandSupplyStage74Types';

export interface Stage74FiveConceptsSupplyDemandResult {
  fiveConceptsAndDeduplicationGuardFa: string;
  vacantAndPipelineNotGuaranteedSupplyGuardFa: string;
  motiveViewsAndNeedsFreedomGuardFa: string;
}

export interface Stage74GapEquilibriumPriorityResult {
  unitGapFiveDimensionsGuardFa: string;
  structuralEquilibriumVsCountBalanceGuardFa: string;
  priorityNoAutoPermitAndPrivacyGuardFa: string;
}

export function evaluateFiveConceptsAndSupplyDemand(
  profile: Stage74MarketEquilibriumProfile,
  deduplicateListings: boolean,
  excludeNonMarketVacancies: boolean,
): Stage74FiveConceptsSupplyDemandResult {
  const activeCount = deduplicateListings
    ? profile.uniqueIdentifiedUnits
    : profile.activeMarketListingsRaw;

  const fiveConceptsAndDeduplicationGuardFa =
    `تفکیک ۵گانه: موجودی فیزیکی (${profile.physicalInventoryUnits.toLocaleString('fa-IR')}) ≠ قابل استفاده (${profile.habitableUsableUnits.toLocaleString('fa-IR')}) ≠ عرضه فعال (${deduplicateListings ? `${profile.uniqueIdentifiedUnits.toLocaleString('fa-IR')} واحد یکتا از ${profile.activeMarketListingsRaw.toLocaleString('fa-IR')} آگهی خام | تأییدشده: ${profile.verifiedSupplyUnits.toLocaleString('fa-IR')}` : `${activeCount.toLocaleString('fa-IR')} آگهی خام بدون حذف تکرار`}) ≠ تقاضای مؤثر (${profile.effectiveDemandUnits.toLocaleString('fa-IR')}) ≠ نیاز سکونتی خانوار (${profile.householdResidentialNeedUnits.toLocaleString('fa-IR')}).`;

  const vacantNote = excludeNonMarketVacancies
    ? `از ${profile.vacantTotalUnits.toLocaleString('fa-IR')} واحد خالی، فقط ${profile.vacantMarketReadyUnits.toLocaleString('fa-IR')} واحد «خالی و قابل عرضه» است (کل واحدهای خالی ≠ عرضه قابل دسترس).`
    : 'هشدار: احتساب همه واحدهای خالی به‌عنوان عرضه بازار خطای مازاد کاذب ایجاد می‌کند.';

  const vacantAndPipelineNotGuaranteedSupplyGuardFa =
    `${vacantNote} | پروانه‌ها/درحال‌ساخت (${profile.newPermitsAndPipelineUnits.toLocaleString('fa-IR')} واحد): ظرفیت بالقوه توسعه ≠ عرضه قطعی آینده.`;

  const motiveLabel = profile.hasBuyerMotiveReliableData
    ? 'تفکیک تقاضای مصرفی و سرمایه‌ای بر اساس داده تجمیعی معتبر نمایش داده شد (استنتاج از یک معامله ممنوع).'
    : '«تقاضای مصرفی/سرمایه‌ای برآوردی» (داده انگیزه خریدار قطعی نیست؛ بازدید/جست‌وجوی آگهی ≠ تعداد خریداران واقعی).';

  const motiveViewsAndNeedsFreedomGuardFa =
    `${motiveLabel} | متراژ موردنیاز خانوار با انتخاب کاربر تنظیم می‌شود (عدم تحمیل متراژ اجباری خودکار).`;

  return {
    fiveConceptsAndDeduplicationGuardFa,
    vacantAndPipelineNotGuaranteedSupplyGuardFa,
    motiveViewsAndNeedsFreedomGuardFa,
  };
}

export function evaluateGapEquilibriumAndPriority(
  profile: Stage74MarketEquilibriumProfile,
  keepFiveDimensionsSeparate: boolean,
  scenarioUnitsDeltaPct: number,
): Stage74GapEquilibriumPriorityResult {
  const dq = profile.effectiveDemandUnits;
  const sq = profile.uniqueIdentifiedUnits;
  const gq = dq - sq;

  const mergeGuard = keepFiveDimensionsSeparate
    ? 'هر ۵ بُعد شکاف (تعداد، قیمت، متراژ، مکان، کیفیت) مستقل نمایش داده شدند (ادغام کور در یک امتیاز واحد ممنوع).'
    : 'هشدار: ادغام ۵ بُعد شکاف بدون روش وزن‌دهی معتبر غیرمجاز است.';

  const unitGapFiveDimensionsGuardFa =
    `شکاف تعداد واحدها GQ = DQ − SQ = ${dq.toLocaleString('fa-IR')} − ${sq.toLocaleString('fa-IR')} = ${gq.toLocaleString('fa-IR')} | شکاف قیمتی ${profile.priceGapPct}% • شکاف متراژی ${profile.areaMismatchPct}% | ${mergeGuard}`;

  const structuralEquilibriumVsCountBalanceGuardFa =
    `وضعیت بازار: «${profile.equilibriumStatusFa}» — تعادل بازار صرفاً برابر بودن تعداد نیست و نیازمند بررسی هم‌زمان «تعادل تعدادی» و «تعادل کیفی/متراژی» است | خروجی سناریو (${scenarioUnitsDeltaPct >= 0 ? '+' : ''}${scenarioUnitsDeltaPct}% عرضه): برچسب «سناریو / برآورد مدل».`;

  const priorityNoAutoPermitAndPrivacyGuardFa =
    'نقشه اولویت توسعه صرفاً تحلیلی است (نه صدور خودکار مجوز ساخت و نه توصیه قطعی سرمایه‌گذاری) | حریم خصوصی: داده‌های مالی خانوار تجمیعی و بدون اطلاعات قابل شناسایی است.';

  return {
    unitGapFiveDimensionsGuardFa,
    structuralEquilibriumVsCountBalanceGuardFa,
    priorityNoAutoPermitAndPrivacyGuardFa,
  };
}
