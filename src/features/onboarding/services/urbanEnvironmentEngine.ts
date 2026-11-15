/** @file src/features/onboarding/services/urbanEnvironmentEngine.ts — Stage 57 Pure Environmental Guard & Audit Engine */
import type { ScenarioLifecycleKind, StreetEnvironmentProfile } from './urbanEnvironmentTypes';

export interface EnvironmentAirAndThermalGuard {
  airStatusTextFa: string;
  isMissingDataNotZeroOrClean: boolean;
  thermalSeparationFa: string;
  temporalIntegrityFa: string;
  noiseCaveatFa: string;
}

export function evaluateAirThermalAndNoiseGuards(profile: StreetEnvironmentProfile): EnvironmentAirAndThermalGuard {
  const isMissing = profile.airPm25Value === null || profile.airDataType === 'داده ناقص';
  const airStatusTextFa = isMissing
    ? 'داده کافی موجود نیست (نبود داده هرگز معادل «هوای پاک» یا مقدار صفر نمایش داده نمی‌شود).'
    : `PM2.5: ${profile.airPm25Value} µg/m³ (${profile.airDataType} — فاصله تا ایستگاه سنجش: ${profile.nearestStationDistanceMeters ?? 'نامشخص'} متر؛ داده ایستگاه برابر همه نقاط نیست).`;

  const thermalSeparationFa = `تفکیک الزامی دما: دمای سطح زمین (LST ماهواره‌ای: ${
    profile.surfaceTempCelsius !== null ? `${profile.surfaceTempCelsius}°C` : 'نامشخص'
  }) ≠ دمای هوای ایستگاهی (${
    profile.airTempCelsius !== null ? `${profile.airTempCelsius}°C` : 'نامشخص'
  }). یک تصویر تک‌تاریخ وضعیت دائمی محله نیست.`;

  const temporalIntegrityFa = `تاریخ واقعی اندازه‌گیری/تصویر: ${profile.measurementDateFa} ≠ تاریخ ورود داده به رادار: ${profile.ingestionDateFa}.`;

  const noiseCaveatFa = `نزدیک‌ترین منبع صدا (${profile.nearestNoiseSourceFa}): صرف فاصله تا بزرگراه کافی نیست؛ جهت‌گیری نما، ارتفاع، موانع کالبدی و پنجره‌ها تعیین‌کننده‌اند.`;

  return {
    airStatusTextFa,
    isMissingDataNotZeroOrClean: isMissing,
    thermalSeparationFa,
    temporalIntegrityFa,
    noiseCaveatFa,
  };
}

export interface GreeneryFloodSoilAndMarketGuard {
  greeneryVsParkPublicAccessFa: string;
  floodNoRecordSafetyGuardFa: string;
  soilConfidenceBadgeFa: string;
  citizenModerationRuleFa: string;
  marketCausalBoundaryFa: string;
  opaqueSingleScoreBlockedFa: string;
}

export function evaluateGreeneryHazardsModerationAndMarketGuard(
  profile: StreetEnvironmentProfile,
  citizenReportModeratedApproved: boolean,
  requestedOpaqueSingleScoreAttempt: boolean,
): GreeneryFloodSoilAndMarketGuard {
  const greeneryVsParkPublicAccessFa = `پوشش گیاهی ماهواره‌ای (${
    profile.satelliteVegetationPercent !== null ? `${profile.satelliteVegetationPercent}٪` : 'نامشخص'
  }) با فضای سبز عمومی قابل استفاده (${
    profile.verifiedPublicGreenSqmPerCapita !== null ? `${profile.verifiedPublicGreenSqmPerCapita} م²` : 'نامشخص'
  }) تفکیک می‌شود و نیازمند بررسی موانع پیاده (بزرگراه/دیوار) است.`;

  const floodNoRecordSafetyGuardFa = profile.hasRecordedFloodEvents
    ? 'دارای سابقه آب‌گرفتگی ثبت‌شده؛ بررسی جزئیات رویداد و شیب/زهکشی الزامی است.'
    : 'نبود سابقه آب‌گرفتگی در پایگاه داده هرگز به‌معنای «ایمن قطعی» نیست؛ استعداد مدل‌شده و وضعیت نامشخص تفکیک می‌شوند.';

  const soilConfidenceBadgeFa = `وضعیت سابقه خاک: «${profile.soilConfidence}» (سابقه فعالیت صنعتی به تنهایی آلودگی قطعی را اثبات نمی‌کند و جایگزین آزمایش خاک نیست).`;

  const citizenModerationRuleFa = citizenReportModeratedApproved
    ? 'گزارش شهروندی پس از بررسی و حذف مختصات دقیق/اطلاعات شخصی، با برچسب منشأ مستقل منتشر می‌شود.'
    : `${profile.citizenReportsCountPending} گزارش در صف بررسی: گزارش تأییدنشده شهروندی هرگز به‌عنوان واقعیت رسمی با داده‌های ایستگاهی ادغام نمی‌شود.`;

  const opaqueSingleScoreBlockedFa = requestedOpaqueSingleScoreAttempt
    ? 'مسدودشدن امتیاز تک‌رقمی مبهم: ساخت «امتیاز سلامت محیطی ملک» بدون شفاف‌سازی وزن‌ها، داده‌های ناموجود، مقادیر تخمینی و بازه اعتبار ممنوع است.'
    : 'ارائه شاخص‌های چندبعدی مجزا همراه با شفاف‌سازی وزن، عدم قطعیت و مقیاس مکانی/زمانی.';

  return {
    greeneryVsParkPublicAccessFa,
    floodNoRecordSafetyGuardFa,
    soilConfidenceBadgeFa,
    citizenModerationRuleFa,
    marketCausalBoundaryFa:
      'همبستگی قیمت و شرایط محیطی معادل رابطه علت و معلولی نیست؛ هیچ ضریب ارزش‌گذاری جدید بدون پژوهش مستقل به موتور مرحله ۲۰ اضافه نمی‌شود و توصیه قطعی «بخرید/نخرید» ممنوع است.',
    opaqueSingleScoreBlockedFa,
  };
}

export function classifyEnvironmentScenarioBoundary(kind: ScenarioLifecycleKind): string {
  return `برچسب وضعیت برنامه/سناریو: «${kind}» — سناریوهای فرضی فضای سبز یا کاهش آلودگی هرگز به‌عنوان پارک موجود یا وضعیت فعلی نقشه نمایش داده نمی‌شوند.`;
}
