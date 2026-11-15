/** @file src/features/onboarding/services/spatialEquityUrbanJusticeStage71Engine.ts — Stage 71 Pure Spatial Equity Engine (Zero React Imports) */
import type { Stage71EquityZoneProfile } from './spatialEquityUrbanJusticeStage71Types';

export interface Stage71ServicesAccessDeprivationResult {
  networkAccessAndMissingNotZeroGuardFa: string;
  targetAgeGreenAndInfraSeparationGuardFa: string;
  multiFactorDeprivationAndCostBarrierGuardFa: string;
}

export interface Stage71CompositeEquityScenarioPrivacyResult {
  compositeWeightsSensitivityResultFa: string;
  riskThreeWayAndProjectSpendGuardFa: string;
  simulationAndAntiDiscriminationPrivacyGuardFa: string;
}

export function evaluateServicesAccessAndDeprivation(
  profile: Stage71EquityZoneProfile,
  excludePrivateGreen: boolean,
  separateUserInfraReports: boolean,
): Stage71ServicesAccessDeprivationResult {
  const walkText =
    profile.networkWalkMinutes === null
      ? 'داده ناموجود (هرگز به‌عنوان مقدار ۰ نمایش داده نمی‌شود)'
      : `${profile.networkWalkMinutes} دقیقه پیاده‌روی شبکه‌ای`;

  const bedsText =
    profile.clinicAvailableBeds === null
      ? 'داده ناموجود ≠ ۰ تخت'
      : `${profile.clinicAvailableBeds} تخت فعال (ظرفیت پذیرش مجزا از نزدیکی ساختمان)`;

  const networkAccessAndMissingNotZeroGuardFa =
    `فاصله مستقیم ${profile.directDistanceMeters} متر ≠ زمان واقعی دسترسی شبکه‌ای (${walkText}) | وضعیت درمان: ${bedsText} | شاخص‌های فاقد داده: ${profile.missingIndicatorsCount} (مقدار صفر ≠ داده ناموجود).`;

  const greenPolicyFa = excludePrivateGreen
    ? `فقط فضاهای قابل استفاده عمومی (${profile.publicParkAccessSharePct}٪ دسترسی پیاده) لحاظ شد؛ ${(profile.privateGardenExcludedSqm / 10000).toFixed(2)} هکتار باغ/فضای سبز خصوصی حذف گردید.`
    : 'هشدار خطا: ترکیب باغ خصوصی غیرقابل دسترس با پارک عمومی شاخص عدالت سبز را منحرف می‌کند.';

  const infraPolicyFa = separateUserInfraReports
    ? `تفکیک زیرساخت: ارزیابی رسمی (${profile.infraQualityOfficialScore}/۱۰) مجزا از گزارش کاربران (${profile.infraUserReportScore}/۱۰).`
    : 'هشدار: ادغام گزارش کاربران با ممیزی رسمی زیرساخت مجاز نیست.';

  const targetAgeGreenAndInfraSeparationGuardFa =
    `عدالت آموزشی: ظرفیت ${profile.schoolCapacitySeats.toLocaleString('fa-IR')} صندلی در برابر جمعیت دانش‌آموز هدف ${profile.primarySchoolAgeTargetPop.toLocaleString('fa-IR')} نفر (نه کل جمعیت ${profile.populationTotal.toLocaleString('fa-IR')}) | ${greenPolicyFa} | ${infraPolicyFa}`;

  const multiFactorDeprivationAndCostBarrierGuardFa =
    `برچسب «${profile.deprivationLevel}» با روش چندمؤلفه‌ای و آستانه‌های مستند تعیین شد (یک شاخص نامطلوب به‌تنهایی محرومیت تلقی نمی‌شود) | مانع هزینه استفاده: «${profile.culturalUsageFeeBarrierFa}».`;

  return {
    networkAccessAndMissingNotZeroGuardFa,
    targetAgeGreenAndInfraSeparationGuardFa,
    multiFactorDeprivationAndCostBarrierGuardFa,
  };
}

export function evaluateCompositeEquityScenariosAndPrivacy(
  profile: Stage71EquityZoneProfile,
  weights: { service: number; infra: number; env: number },
  publicExportSanitized: boolean,
): Stage71CompositeEquityScenarioPrivacyResult {
  const weightSum = Number((weights.service + weights.infra + weights.env).toFixed(4));
  const weightsValid = Math.abs(weightSum - 1) <= 0.001;
  const normalizedService = weightsValid ? weights.service : weights.service / (weightSum || 1);
  const normalizedInfra = weightsValid ? weights.infra : weights.infra / (weightSum || 1);
  const normalizedEnv = weightsValid ? weights.env : weights.env / (weightSum || 1);

  const serviceComp = (profile.publicParkAccessSharePct / 10 + profile.transitScore) / 2;
  const infraComp = profile.infraQualityOfficialScore;
  const envComp = Math.max(0, 10 - profile.environmentalExposureScore);
  const compositeEi =
    normalizedService * serviceComp + normalizedInfra * infraComp + normalizedEnv * envComp;

  const compositeWeightsSensitivityResultFa = weightsValid
    ? `شاخص ترکیبی Ei = Σ wj·Sij = ${compositeEi.toFixed(2)}/۱۰ (Σ wj = ${weightSum.toFixed(2)}، وزن‌ها: خدمت ${normalizedService.toFixed(2)} / زیرساخت ${normalizedInfra.toFixed(2)} / محیط ${normalizedEnv.toFixed(2)}، داده مفقود: ${profile.missingIndicatorsCount}، حساسیت قابل بازبینی).`
    : `خطای جمع وزن‌ها (Σ wj = ${weightSum} ≠ 1): نرمال‌سازی شفاف انجام شد و Ei = ${compositeEi.toFixed(2)}/۱۰ با سابقه تغییر وزن ثبت گردید.`;

  const riskThreeWayAndProjectSpendGuardFa =
    `تفکیک سه‌گانه ریسک محیطی: مواجهه (${profile.environmentalExposureScore}/۱۰) ≠ آسیب‌پذیری (${profile.vulnerabilityScore}/۱۰) ≠ مخاطره فیزیکی | پروژه‌ها («${profile.publicProjectsSpendFa}»): هزینه پروژه ≠ اثر واقعی بر عدالت شهری (اثر با تغییر قابل سنجش دسترسی ارزیابی می‌شود).`;

  const privacyLabelFa = publicExportSanitized
    ? 'گزارش عمومی پاکسازی‌شده و ضدتبعیض: محرومیت خدماتی از ویژگی اجتماعی ساکنان تفکیک شد، رتبه‌بندی تحقیرآمیز ممنوع و افشای ترکیبی (Anti-Inference) کنترل می‌شود.'
    : 'حالت بازبینی کارشناسی با ثبت سابقه دسترسی (هویت افراد همچنان مخفی).';

  const simulationAndAntiDiscriminationPrivacyGuardFa =
    `برچسب سناریو: نتیجه شبیه‌سازی است نه تضمین تحقق پروژه | ${privacyLabelFa}`;

  return {
    compositeWeightsSensitivityResultFa,
    riskThreeWayAndProjectSpendGuardFa,
    simulationAndAntiDiscriminationPrivacyGuardFa,
  };
}
