/** @file src/features/onboarding/services/populationMobilityStage73Engine.ts — Stage 73 Pure Population Mobility Engine (Zero React Imports) */
import type { Stage73MobilityZoneProfile } from './populationMobilityStage73Types';

export interface Stage73FlowsAndDemographicsResult {
  threeWayConceptAndNetMigrationFa: string;
  flowLinesAndInterCityGuardFa: string;
  householdAndHousingCorrelationGuardFa: string;
}

export interface Stage73StabilityScenariosPrivacyResult {
  tenureAndNewBuildCapacityGuardFa: string;
  historicalBoundaryAndScenarioLabelFa: string;
  antiSurveillanceAndListingNotPopulationGuardFa: string;
}

export function evaluateFlowsAndDemographicStructure(
  profile: Stage73MobilityZoneProfile,
  hasOdSourceData: boolean,
  groupAgeFilterStrict: boolean,
): Stage73FlowsAndDemographicsResult {
  const netMigration = profile.inflowCount - profile.outflowCount;
  const totalDelta = profile.currentPopulation - profile.basePopulation;

  const threeWayConceptAndNetMigrationFa =
    `تفکیک سه‌گانه: تغییر کل (${totalDelta.toLocaleString('fa-IR')} نفر) ≠ جابه‌جایی خالص NM = I − O = ${(netMigration).toLocaleString('fa-IR')} (ورود ${profile.inflowCount.toLocaleString('fa-IR')} − خروج ${profile.outflowCount.toLocaleString('fa-IR')}) + تغییر طبیعی ${profile.naturalBalanceCount.toLocaleString('fa-IR')} | تغییر ترکیب سنی/خانوار مستقل از حجم کل است.`;

  const odStatusFa = hasOdSourceData
    ? 'داده مبدأ-مقصد تجمیعی موجود است؛ توجه: خطوط جریان مبدأ-مقصد ≠ مسیر فیزیکی حرکت اشخاص.'
    : 'در نبود داده مبدأ-مقصد معتبر، استنتاج انتقال مستقیم جمعیت بین دو محله ممنوع است.';

  const interCityFa = profile.interCitySourceAvailable
    ? 'مهاجرت بین‌شهری با منبع تجمیعی مجاز فعال است.'
    : 'مهاجرت بین‌شهری: غیرفعال / داده ناکافی (تخمین بی‌منبع نمایش داده نمی‌شود).';

  const flowLinesAndInterCityGuardFa = `${odStatusFa} | ${interCityFa}`;

  const ageNote = groupAgeFilterStrict
    ? 'هرم سنی برای تحلیل ساختار تجمیعی فیلتر شد (استنباط رفتار/شخصیت فردی ساکنان ممنوع).'
    : 'نمای کلی گروه سنی در کل محدوده.';

  const householdAndHousingCorrelationGuardFa =
    `متوسط اندازه خانوار ${profile.avgHouseholdSize} نفر و ارتباط آن با تقاضای واحدهای کوچک/متوسط/بزرگ صرفاً «تحلیل آماری» است (نه رابطه علت‌ومعلولی قطعی) | ${ageNote}`;

  return {
    threeWayConceptAndNetMigrationFa,
    flowLinesAndInterCityGuardFa,
    householdAndHousingCorrelationGuardFa,
  };
}

export function evaluateStabilityScenariosAndPrivacy(
  profile: Stage73MobilityZoneProfile,
  minimumGroupThreshold: number,
  excludeListingsAsPopulation: boolean,
): Stage73StabilityScenariosPrivacyResult {
  const tenureAndNewBuildCapacityGuardFa =
    `ماندگاری متوسط ${profile.avgTenureYears} سال (جابهجایی مستأجران ${profile.renterTurnoverPct}% در برابر مالکان ${profile.ownerTurnoverPct}% — بدون فرض کلیشه‌ای درباره هر مستأجر یا مالک) | توسعه شهری: ${profile.newHousingUnitsBuilt.toLocaleString('fa-IR')} واحد ساخته‌شده ≠ ${profile.housingUnitsOccupiedDelta.toLocaleString('fa-IR')} خانوار ساکن‌شده.`;

  const boundaryNoteFa = profile.boundaryShiftedWarningFa
    ? profile.boundaryShiftedWarningFa
    : 'مرز آماری بین دوره‌ها همسان است؛ برچسب «کاهش جمعیت» به‌تنهایی به معنای بحران تلقی نمی‌شود.';

  const historicalBoundaryAndScenarioLabelFa =
    `${boundaryNoteFa} | سناریوها با برچسب صریح «سناریو / برآورد مدل (نه آمار قطعی آینده)» ارائه می‌شوند.`;

  const listingNoteFa = excludeListingsAsPopulation
    ? 'تعداد آگهی‌ها/معاملات مسکن جایگزین آمار واقعی جمعیت ساکن نمی‌شود.'
    : 'هشدار: جایگزینی آگهی مسکن با آمار جمعیت خطای تحلیلی ایجاد می‌کند.';

  const antiSurveillanceAndListingNotPopulationGuardFa =
    `ضدنظارت فردی: حداقل آستانه انتشار آماری ${minimumGroupThreshold} خانوار، ممنوعیت ردیابی مسیر خانوار و Anti-Inference در فیلترهای متوالی | ${listingNoteFa}`;

  return {
    tenureAndNewBuildCapacityGuardFa,
    historicalBoundaryAndScenarioLabelFa,
    antiSurveillanceAndListingNotPopulationGuardFa,
  };
}
