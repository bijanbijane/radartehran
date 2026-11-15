/** @file src/features/onboarding/services/demographicAnalysisStage70Engine.ts — Stage 70 Pure Demographic & Epistemic Engine (Zero React Imports) */
import type { Stage70DemographicZoneProfile } from './demographicAnalysisStage70Types';

export interface Stage70DensityAgeHouseholdMigrationResult {
  grossVsNetDensityAndReferenceYearGuardFa: string;
  absVsPctChangeCagrAndLaborGuardFa: string;
  householdHousingAndMigrationPrivacyGuardFa: string;
}

export interface Stage70DayNightCapacityScenarioPrivacyResult {
  dayNightDeltaAndBuildingHeightGuardFa: string;
  threeCapacitiesAndHousingCausalityGuardFa: string;
  microGroupSuppressionCompositeAndDisclosureGuardFa: string;
}

export function evaluateDensityChangeHouseholdAndMigration(
  profile: Stage70DemographicZoneProfile,
  compareMismatchedReferenceYears: boolean,
  suppressSmallMigrationCells: boolean,
): Stage70DensityAgeHouseholdMigrationResult {
  const yearCheckFa = compareMismatchedReferenceYears
    ? 'هشدار ناسازگاری سال آماری: مقایسه دو محدوده با سال مرجع متفاوت بدون تعدیل مجاز نیست.'
    : `تطبیق سال مرجع (${profile.referenceYearFa}) مجزا از سال انتشار (${profile.publicationYearFa}).`;

  const grossVsNetDensityAndReferenceYearGuardFa =
    `تراکم ناخالص ${profile.grossDensityPerHa.toFixed(1)} نفر/هکتار (بر ${profile.grossAreaHa} هکتار کل) ≠ تراکم خالص سکونتی ${profile.netDensityPerHa.toFixed(1)} نفر/هکتار (بر ${profile.netResidentialAreaHa} هکتار سکونت) | ${yearCheckFa}`;

  const absSign = profile.absChangeCount >= 0 ? '+' : '';
  const absVsPctChangeCagrAndLaborGuardFa =
    `تفکیک تغییرات: تغییر مطلق ${absSign}${profile.absChangeCount.toLocaleString('fa-IR')} نفر ≠ تغییر درصدی ${profile.pctChangeRate}٪ (CAGR=${profile.cagrAnnualPct}٪) | تفکیک بازار کار: نرخ بیکاری (${profile.unemployedShareOfActivePct}٪ از نیروی کار فعال) ≠ سهم بیکاران از کل جمعیت (${profile.unemployedShareOfTotalPopPct}٪).`;

  const migrationRuleFa = suppressSmallMigrationCells
    ? `محدودیت مهاجرت (${profile.migrationScopeLevelFa}): تعمیم داده منطقه‌ای به قطعه/خانوار و نمایش مسیر فردی ممنوع است.`
    : 'هشدار حریم خصوصی: انتشار جریانات مهاجرت خرد بدون تجمیع ریسک شناسایی افراد دارد.';

  const householdHousingAndMigrationPrivacyGuardFa =
    `متوسط بعد خانوار ${profile.avgHouseholdSize} در برابر ${profile.housingUnitsCount.toLocaleString('fa-IR')} واحد مسکونی (${profile.vacantUnitsEstimatePct}٪ برآورد خالی) — استنتاج کمبود مسکن بهتنهایی از تعداد خانوار مجاز نیست | ${migrationRuleFa}`;

  return {
    grossVsNetDensityAndReferenceYearGuardFa,
    absVsPctChangeCagrAndLaborGuardFa,
    householdHousingAndMigrationPrivacyGuardFa,
  };
}

export function evaluateDayNightCapacityScenariosAndPrivacy(
  profile: Stage70DemographicZoneProfile,
  selectedHourlySlotFa: string,
  inspectCompositeComponents: boolean,
  enforceAntiInferenceDisclosure: boolean,
): Stage70DayNightCapacityScenarioPrivacyResult {
  const deltaP = profile.dayPopulationEst - profile.nightPopulationEst;
  const dayNightDeltaAndBuildingHeightGuardFa =
    `بازه ساعتی «${selectedHourlySlotFa}»: ΔP = P_day (${profile.dayPopulationEst.toLocaleString('fa-IR')}) − P_night (${profile.nightPopulationEst.toLocaleString('fa-IR')}) = ${deltaP >= 0 ? '+' : ''}${deltaP.toLocaleString('fa-IR')} نفر [تخمین جمعیت حاضر، تفکیک‌شده از جمعیت ساکن] | تعداد مراکز اداری یا ارتفاع ساختمان ≠ جمعیت واقعی.`;

  const threeCapacitiesAndHousingCausalityGuardFa =
    `تفکیک سه‌گانه جمعیت‌پذیری (عدم ادغام در یک عدد): ظرفیت نظری ${profile.theoreticalCapacity.toLocaleString('fa-IR')} نفر ≠ ظرفیت قانونی ضوابط ${profile.legalZoningCapacity.toLocaleString('fa-IR')} نفر ≠ ظرفیت عملیاتی زیرساختی ${profile.operationalInfraCapacity.toLocaleString('fa-IR')} نفر | همبستگی رشد جمعیت با قیمت مسکن ≠ علیت قطعی (منع عنوان «اثر جمعیت بر قیمت» بدون مدل علی).`;

  const compositePolicyFa = inspectCompositeComponents
    ? 'شاخص ترکیبی با نمایش کامل فرمول، متغیرهای ورودی، مخرج و محدودیت تفسیر (منع امتیاز مبهم).'
    : 'هشدار شفافیت: نمایش امتیاز کلی شاخص ترکیبی بدون مشاهده اجزای تشکیل‌دهنده قابل قبول نیست.';

  const privacyPolicyFa = enforceAntiInferenceDisclosure
    ? 'حذف/ادغام گروه‌های بسیار کوچک آماری، منع برچسب‌گذاری ارزشی محله‌ها و کنترل افشای ترکیب گزارش‌ها (Anti-Inference) فعال است.'
    : 'هشدار افشا: ترکیب چند گزارش محدوده کوچک می‌تواند به استنتاج اطلاعات خانوار منجر شود.';

  return {
    dayNightDeltaAndBuildingHeightGuardFa,
    threeCapacitiesAndHousingCausalityGuardFa,
    microGroupSuppressionCompositeAndDisclosureGuardFa: `${compositePolicyFa} | ${privacyPolicyFa}`,
  };
}
