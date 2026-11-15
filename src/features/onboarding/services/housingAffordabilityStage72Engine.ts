/** @file src/features/onboarding/services/housingAffordabilityStage72Engine.ts — Stage 72 Pure Housing Affordability Engine (Zero React Imports) */
import type {
  Stage72AffordabilityZoneProfile,
  Stage72ScenarioPreset,
} from './housingAffordabilityStage72Types';

export interface Stage72BuyRentCostResult {
  ptiFormulaAndSavingsWarningFa: string;
  buyThreeScenariosFa: string;
  hcrHousingVsCommuteAndMissingGuardFa: string;
}

export interface Stage72GapScenarioPrivacyResult {
  nominalVsRealGapAndOutOfRangeLabelFa: string;
  scenarioProjectionAndProbabilityGuardFa: string;
  subIndicesSplitAndPrivacyGuardFa: string;
}

export function evaluateBuyRentAndCostPressure(
  profile: Stage72AffordabilityZoneProfile,
  userMonthlyIncomeMillion: number,
  conversionRatePer100M: number,
  separateCommuteFromHousing: boolean,
): Stage72BuyRentCostResult {
  const effectiveMonthlyIncome =
    userMonthlyIncomeMillion > 0
      ? userMonthlyIncomeMillion
      : profile.referenceMonthlyIncomeMillionToman;

  const annualIncomeMillion =
    effectiveMonthlyIncome !== null ? effectiveMonthlyIncome * 12 : null;

  const ptiValue =
    annualIncomeMillion && annualIncomeMillion > 0
      ? ((profile.medianBuyPriceBillionToman * 1000) / annualIncomeMillion).toFixed(1)
      : null;

  const ptiFormulaAndSavingsWarningFa =
    ptiValue !== null
      ? `نسبت قیمت به درآمد (PTI = ${ptiValue} برابر | قیمت ${profile.medianBuyPriceBillionToman} میلیارد ÷ درآمد سالانه ${annualIncomeMillion} میلیون) — این شاخص مستقیماً معادل تعداد سال‌های واقعی پس‌انداز نیست و هزینه زندگی/بدهی/وام در آن لحاظ نشده است.`
      : 'درآمد مرجع محله: اطلاعات کافی موجود نیست (مقدار صفر جایگزین نمی‌شود؛ برای محاسبه از درآمد نشست خود استفاده کنید).';

  const cashBudget = effectiveMonthlyIncome ? Math.round(effectiveMonthlyIncome * 75) : 0;
  const comboBudget = effectiveMonthlyIncome ? Math.round(effectiveMonthlyIncome * 125) : 0;
  const highLoanBudget = effectiveMonthlyIncome ? Math.round(effectiveMonthlyIncome * 165) : 0;
  const buyThreeScenariosFa =
    effectiveMonthlyIncome !== null
      ? `۳ وضعیت مستقل قدرت خرید: ۱) منابع شخصی (~${cashBudget.toLocaleString('fa-IR')} م.ت)، ۲) ترکیب پس‌انداز+تسهیلات (~${comboBudget.toLocaleString('fa-IR')} م.ت)، ۳) تأمین مالی بالاتر (~${highLoanBudget.toLocaleString('fa-IR')} م.ت) • با نرخ تبدیل ودیعه ${conversionRatePer100M.toFixed(1)} م.ت/۱۰۰م (${profile.rahnToRentRateValidUntilFa}).`
      : 'قدرت خرید سه‌گانه: اطلاعات کافی موجود نیست.';

  const rahnEquivalent = (profile.medianRahnMillionToman / 100) * conversionRatePer100M;
  const directHousingCost =
    profile.medianMonthlyRentMillionToman + rahnEquivalent + profile.monthlyAncillaryCostMillionToman;
  const totalWithCommute = directHousingCost + profile.monthlyCommutingCostMillionToman;

  const hcrNumerator = separateCommuteFromHousing ? directHousingCost : totalWithCommute;
  const hcrPct =
    effectiveMonthlyIncome && effectiveMonthlyIncome > 0
      ? ((hcrNumerator / effectiveMonthlyIncome) * 100).toFixed(1)
      : null;

  const hcrHousingVsCommuteAndMissingGuardFa =
    hcrPct !== null
      ? `HCR = ${hcrPct}% (صورت: هزینه ماهانه مسکن ${directHousingCost.toFixed(1)} م.ت شامل اجاره، ودیعه و شارژ/نگهداری ÷ مخرج: درآمد ${effectiveMonthlyIncome} م.ت) | رفت‌وآمد (${profile.monthlyCommutingCostMillionToman} م.ت) ${separateCommuteFromHousing ? 'در شاخص جداگانه نمایش داده شد' : 'هشدار: مخلوط‌کردن رفت‌وآمد با مسکن غیرمجاز است'}.`
      : 'نسبت HCR: اطلاعات کافی موجود نیست (هیچ عدد فرضی جایگزین نمی‌شود).';

  return {
    ptiFormulaAndSavingsWarningFa,
    buyThreeScenariosFa,
    hcrHousingVsCommuteAndMissingGuardFa,
  };
}

export function evaluateGapScenariosAndPrivacy(
  profile: Stage72AffordabilityZoneProfile,
  preset: Stage72ScenarioPreset,
  priceChangePct: number,
  incomeChangePct: number,
  sessionOnlyNoPersist: boolean,
): Stage72GapScenarioPrivacyResult {
  const nominalVsRealGapAndOutOfRangeLabelFa =
    `وضعیت محله: «${profile.affordableStatusFa}» (برچسب تحقیرآمیز «غیرقابل سکونت/نامناسب» ممنوع است؛ قرمزرنگ فقط تابع نسبت هزینه به توان است) | رشد اسمی ${profile.nominalPriceGrowthPct}% در برابر رشد واقعی پس از تعدیل تورم ${profile.realInflationAdjustedGrowthPct}%.`;

  const factor = (1 + priceChangePct / 100) / Math.max(0.2, 1 + incomeChangePct / 100);
  const adjustedBuy = (profile.medianBuyPriceBillionToman * (1 + priceChangePct / 100)).toFixed(2);
  const scenarioProjectionAndProbabilityGuardFa =
    `سناریوی «${preset}» (صرفاً نام سناریو؛ اعلام احتمال وقوع بدون مدل معتبر ممنوع): با تغییر قیمت ${priceChangePct}% و درآمد ${incomeChangePct}%، قیمت شبیه‌سازی‌شده ${adjustedBuy} میلیارد تومان و ضریب فشار نسبی ${factor.toFixed(2)} است.`;

  const subIndicesSplitAndPrivacyGuardFa = sessionOnlyNoPersist
    ? 'امتیاز استطاعت به ۳ زیرشاخص مستقل «خرید»، «اجاره» و «فشار هزینه» تفکیک شد | حریم خصوصی: درآمد شخصی صرفاً در همین نشست پردازش می‌شود و وارد نقشه عمومی نمی‌گردد.'
    : 'هشدار حریم خصوصی: ذخیره درآمد یا ساخت پروفایل مالی کاربر بدون رضایت صریح غیرمجاز است.';

  return {
    nominalVsRealGapAndOutOfRangeLabelFa,
    scenarioProjectionAndProbabilityGuardFa,
    subIndicesSplitAndPrivacyGuardFa,
  };
}
