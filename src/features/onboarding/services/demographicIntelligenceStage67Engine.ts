/** @file src/features/onboarding/services/demographicIntelligenceStage67Engine.ts — Stage 67 Pure Epistemic & Privacy Guards (Zero React) */
import type {
  Stage67CensusPeriod,
  Stage67DemographicProfile,
  Stage67SpatialScale,
} from './demographicIntelligenceStage67Types';

export interface PopulationDensityHousingAndMigrationGuardResult {
  totalVsThreeDensitiesGuardFa: string;
  missingDataAndScalePermissionGuardFa: string;
  householdHousingCausalityGuardFa: string;
  migrationAndMobilityBoundaryGuardFa: string;
}

export interface DayNightJusticeScenarioAndPrivacyGuardResult {
  dayNightAndFloatingSeparationGuardFa: string;
  inequalityAndCommercialJobsGuardFa: string;
  compareAndCompositeHealthScoreGuardFa: string;
  scenarioVsForecastAndDynamicPrivacyGuardFa: string;
}

export function evaluatePopulationDensityAgeHouseholdAndMigrationGuards(
  profile: Stage67DemographicProfile,
  spatialScale: Stage67SpatialScale,
  selectedYear: Stage67CensusPeriod,
): PopulationDensityHousingAndMigrationGuardResult {
  const popText =
    profile.totalPopulation === null
      ? '«داده در دسترس نیست» (عدم نمایش صفر جعلی)'
      : `${profile.totalPopulation.toLocaleString('fa-IR')} نفر`;

  const totalVsThreeDensitiesGuardFa = `جمعیت کل: ${popText} | تفکیک سه‌گانه تراکم: ناخالص شهری ${profile.grossDensityPerKm2.toLocaleString('fa-IR')}/km² ≠ خالص مسکونی ${profile.netResidentialDensityPerKm2.toLocaleString('fa-IR')}/km² ≠ تراکم ساختمانی FAR ${profile.builtFarPercent}٪ (تراکم ساختمانی هرگز معادل تراکم جمعیت نیست).`;

  const isFineScale = spatialScale === 'بلوک آماری' || spatialScale === 'شبکه سلولی مکانی';
  const cellBlocked = isFineScale && profile.smallestCellCount < profile.minAllowedGroupThreshold;
  const missing1405Warn =
    selectedYear === '۱۴۰۵' && !profile.has1405ReliableEstimate
      ? 'هشدار سال ۱۴۰۵: برآورد معتبر در دسترس نیست و از درونیابی پنهان جلوگیری شد («داده در دسترس نیست»).'
      : `داده سال ${selectedYear} با منشأ «${profile.dataType}» و وضعیت «${profile.qualityStatus}» فعال است.`;

  const scaleMsg = cellBlocked
    ? `محدودیت مقیاس «${spatialScale}»: کوچک‌ترین سلول (${profile.smallestCellCount} نفر) زیر آستانه حریم خصوصی (${profile.minAllowedGroupThreshold}) است و تجمیع شد.`
    : `مقیاس مکانی فعال: «${spatialScale}» منطبق با سطح دقت و مجوز.`;

  const householdHousingCausalityGuardFa = `ساختار خانوار (${profile.householdsCount.toLocaleString('fa-IR')} خانوار، بُعد ${profile.avgHouseholdSize}) و بازار مسکن: همبستگی با متراژ/قیمت از علت‌ومعلول جداست؛ افزایش جمعیت به‌تنهایی اثبات‌کننده تقاضای مؤثر مسکن نیست (قدرت خرید، نرخ خالی‌بودن و تشکیل خانوار مؤثرند).`;

  const migrationAndMobilityBoundaryGuardFa =
    'مهاجرت و جابه‌جایی: صرفاً مبدأ، مقصد و حجم تجمیع‌شده (بدون استخراج مسیر حرکت یا محل سکونت اشخاص) | مرزبندی شفاف با نظام حمل‌ونقل (جمعیت ← مبدأ/مقصد/حجم؛ حمل‌ونقل ← مسیر و عملکرد شبکه).';

  return {
    totalVsThreeDensitiesGuardFa,
    missingDataAndScalePermissionGuardFa: `${scaleMsg} | ${missing1405Warn}`,
    householdHousingCausalityGuardFa,
    migrationAndMobilityBoundaryGuardFa,
  };
}

export function evaluateDayNightFloatingJusticeScenarioAndPrivacyGuards(
  profile: Stage67DemographicProfile,
  comparedZonesCount: number,
  isScenarioMode: boolean,
  includeCombinedLayersPrivacyCheck: boolean,
): DayNightJusticeScenarioAndPrivacyGuardResult {
  const dayNightText = !profile.hasCombinedDayNightModel || profile.daytimePopulationEstimate === null
    ? 'جمعیت روزانه: «داده در دسترس نیست» — منع اعلام جمعیت روزانه صرفاً از روی تعداد ساختمان‌های اداری/تجاری بدون مدل ترکیبی.'
    : `جمعیت روزانه برآوردی ${profile.daytimePopulationEstimate.toLocaleString('fa-IR')} در برابر شبانه ${profile.nighttimePopulationEstimate?.toLocaleString('fa-IR') ?? '--'} (روش: ${profile.dataType}).`;

  const dayNightAndFloatingSeparationGuardFa = `${dayNightText} | تفکیک سه‌گانه شناور: ساکن (${profile.totalPopulation?.toLocaleString('fa-IR') ?? 'نامشخص'}) ≠ ظرفیت بالقوه جذب (${profile.facilityCapacityPotential.toLocaleString('fa-IR')}) ≠ مراجعین برآوردی (${profile.estimatedDailyVisitors.toLocaleString('fa-IR')}).`;

  const incomeWarn = profile.hasIncomeDataPermission
    ? 'داده درآمد مجاز ثبت شده است.'
    : 'نبود داده درآمد/اشتغال معتبر: ادعای قطعی درباره وضعیت اقتصادی یا اجتماعی ساکنان مسدود است.';

  const jobsGuard =
    profile.verifiedJobsCount === null
      ? `تعداد واحدهای تجاری/اداری (${profile.commercialUnitsCount.toLocaleString('fa-IR')}) هرگز جایگزین تعداد فرصت‌های شغلی («داده در دسترس نیست») نمی‌شود.`
      : `فرصت‌های شغلی تأییدشده (${profile.verifiedJobsCount.toLocaleString('fa-IR')}) متمایز از واحدهای تجاری/اداری (${profile.commercialUnitsCount.toLocaleString('fa-IR')}).`;

  const clampedCompare = Math.min(Math.max(comparedZonesCount, 1), 4);
  const compareAndCompositeHealthScoreGuardFa = `مقایسه هم‌زمان (${clampedCompare} از حداکثر ۴ محدوده) تنها با هم‌سنجی سال مرجع (${profile.referenceYearFa}) معتبر است | منع تولید امتیاز دلخواه «سلامت جمعیتی محله» بدون روش علمی معتبر.`;

  const scenarioTag = isScenarioMode
    ? 'برچسب الزامی: «سناریو (آزمایش فرضیات متفاوت درباره آینده)» ≠ «پیش‌بینی (خروجی مدل با مفروضات مشخص)» — هرگز پیش‌بینی قطعی تلقی نشود.'
    : 'حالت پیش‌بینی مدلی با نمایش روش، مفروضات و دامنه عدم‌قطعیت.';

  const privacyThreshold = includeCombinedLayersPrivacyCheck
    ? `کنترل حداقل اندازه گروه پویا (${profile.minAllowedGroupThreshold} نفر) در ترکیب چند لایه فعال شد تا خطر بازشناسایی غیرمستقیم حذف شود.`
    : `حداقل اندازه گروه پایه (${profile.minAllowedGroupThreshold} نفر) بدون ترکیب چندلایه.`;

  return {
    dayNightAndFloatingSeparationGuardFa,
    inequalityAndCommercialJobsGuardFa: `${incomeWarn} | ${jobsGuard}`,
    compareAndCompositeHealthScoreGuardFa,
    scenarioVsForecastAndDynamicPrivacyGuardFa: `${scenarioTag} | ${privacyThreshold}`,
  };
}
