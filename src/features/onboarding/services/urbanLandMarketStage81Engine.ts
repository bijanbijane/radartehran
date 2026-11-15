/** @file src/features/onboarding/services/urbanLandMarketStage81Engine.ts — Stage 81 Pure Urban Land, RLV & Entity-Separation Engine (Zero React Imports) */
import type { Stage81LandParcelProfile } from './urbanLandMarketStage81Types';

export interface Stage81ParcelUseCapacityResult {
  fourEntitiesAndPriceBasisGuardFa: string;
  threeUsesAndThreeCapacitiesGuardFa: string;
  areaMismatchAndHypotheticalSubdivisionGuardFa: string;
}

export interface Stage81VacantRlvInfraPrivacyResult {
  landSharePctSl: number;
  residualLandValueRlvBillion: number;
  vacantVsUnderutilizedAndParkGuardFa: string;
  landShareAndRlvFormulaGuardFa: string;
  infraCausality3DAndPiiPrivacyGuardFa: string;
}

export function calculateLandSharePct(vl: number, vp: number): number {
  return (vl / Math.max(0.1, vp)) * 100;
}

export function calculateResidualLandValue(
  gdv: number,
  cd: number,
  cf: number,
  co: number,
  profitP: number,
): number {
  return gdv - cd - cf - co - profitP;
}

export function evaluateParcelUseAndCapacity(
  profile: Stage81LandParcelProfile,
): Stage81ParcelUseCapacityResult {
  const fourEntitiesAndPriceBasisGuardFa =
    `۴ موجودیت مستقل: قطعه زمین ≠ کاربری ≠ مالکیت ≠ ارزش اقتصادی | مبنای قیمت: «${profile.landValuationBasis}» (${profile.landValueBillion} م.م.ت زمین از ${profile.totalPropertyValueBillion} م.م.ت کل ملک — زمین خام ≠ زمین با بنای قابل استفاده).`;

  const threeUsesAndThreeCapacitiesGuardFa =
    `کاربری موجود («${profile.existingUseFa}») ≠ مصوب («${profile.approvedUseFa}») ≠ سناریو («${profile.proposedScenarioUseFa}») | ظرفیت نظری (${profile.theoreticalCapacityFar}%) ≠ قانونی (${profile.legalCapacityFar}%) ≠ اقتصادی (${profile.economicCapacityFar}%).`;

  const subText = profile.isHypotheticalSubdivisionScenario
    ? 'سناریوی «تفکیک فرضی» تحلیلی فعال است (تفکیک فرضی ≠ افراز و تفکیک ثبتی قانونی).'
    : 'تطبیق مساحت انجام شد بدون تفکیک ثبتی.';

  const areaMismatchAndHypotheticalSubdivisionGuardFa =
    `مساحت سند (${profile.deededAreaSqm} م²) ≠ نقشه‌برداری (${profile.mappedAreaSqm} م²) ≠ قابل استفاده پس از عقب‌نشینی (${profile.usableAreaSqm} م²) | ${subText}`;

  return {
    fourEntitiesAndPriceBasisGuardFa,
    threeUsesAndThreeCapacitiesGuardFa,
    areaMismatchAndHypotheticalSubdivisionGuardFa,
  };
}

export function evaluateVacantRlvInfraAndPrivacy(
  profile: Stage81LandParcelProfile,
  gdvBillion: number,
  cdBillion: number,
  cfBillion: number,
  coBillion: number,
  developerProfitBillion: number,
  redactOwnerPiiAndDeedIds: boolean,
): Stage81VacantRlvInfraPrivacyResult {
  const landSharePctSl = calculateLandSharePct(profile.landValueBillion, profile.totalPropertyValueBillion);
  const residualLandValueRlvBillion = calculateResidualLandValue(
    gdvBillion,
    cdBillion,
    cfBillion,
    coBillion,
    developerProfitBillion,
  );

  const vacantVsUnderutilizedAndParkGuardFa =
    `طبقه‌بندی دقیق زمین: «${profile.vacantCategory}» — پارکینگ روباز و کارگاه فعال زمین بایر نیستند و بوستان/عرصه اکولوژیک زمین ناکارآمد تلقی نمی‌شود.`;

  const landShareAndRlvFormulaGuardFa =
    `سهم زمین SL = (VL/VP)×100 = ${landSharePctSl.toFixed(1)}% (کسر ساده هزینه ساخت کافی نیست) | ارزش باقیمانده زمین RLV = GDV − Cd − Cf − Co − P = ${residualLandValueRlvBillion.toFixed(1)} م.م.ت (حساس به مفروضات بازار).`;

  const infraText = profile.nearMetroStation
    ? 'مجاورت با ایستگاه مترو ثبت شده؛ همبستگی رشد قیمت زمین با توسعه زیرساخت الزاماً علیت قطعی نیست.'
    : 'فاقد دسترسی مستقیم مترو در شعاع پیاده.';

  const privacyText = redactOwnerPiiAndDeedIds
    ? 'حفاظت حریم خصوصی: هویت اشخاص حقیقی، پلاک ثبتی و اسناد خصوصی از اطلس عمومی و Telemetry حذف شده و مدل‌های سه‌بعدی مرجع رسمی ثبتی نیستند.'
    : 'هشدار امنیتی: نمایش PII اشخاص حقیقی و شماره پلاک ثبتی خصوصی در اطلس عمومی ممنوع است.';

  return {
    landSharePctSl,
    residualLandValueRlvBillion,
    vacantVsUnderutilizedAndParkGuardFa,
    landShareAndRlvFormulaGuardFa,
    infraCausality3DAndPiiPrivacyGuardFa: `${infraText} | ${privacyText}`,
  };
}
