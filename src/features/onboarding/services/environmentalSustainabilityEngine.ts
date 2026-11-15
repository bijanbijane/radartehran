/** @file src/features/onboarding/services/environmentalSustainabilityEngine.ts — Stage 66 Pure Epistemic & Scientific Guards (Zero React) */
import type {
  Stage66AccessRadiusMeters,
  Stage66ComparisonPeriod,
  Stage66EnvironmentProfile,
} from './environmentalSustainabilityTypes';

export interface EnvMeasurementAndEcosystemGuardResult {
  airQualityOriginGuardFa: string;
  vegetationSeasonalAndTreeSurveyGuardFa: string;
  parkAccessAndJusticeGuardFa: string;
  corridorAndWaterEvidenceGuardFa: string;
}

export interface ThermalPressureScenarioAndIndexGuardResult {
  thermalLstAndSoilLimitGuardFa: string;
  imperviousAndDevelopmentCausalityGuardFa: string;
  neighborhoodCompareAndCompositeIndexGuardFa: string;
  hypotheticalScenarioAndPrivacyExportGuardFa: string;
}

export function evaluateEnvMeasurementAndEcosystemGuards(
  profile: Stage66EnvironmentProfile,
  periodFrom: Stage66ComparisonPeriod,
  periodTo: Stage66ComparisonPeriod,
  selectedRadiusMeters: Stage66AccessRadiusMeters,
): EnvMeasurementAndEcosystemGuardResult {
  const missingPollutants = profile.no2Ppb === null ? 'NO2 بدون داده معتبر (عدم نمایش صفر جعلی)' : `NO2: ${profile.no2Ppb}ppb`;
  const stationState = profile.airStationIsActive ? 'فعال' : 'غیرفعال / دارای وقفه برداشت';
  const airQualityOriginGuardFa = profile.airDataIsSpatiallyModeled
    ? `برچسب الزامی «تخمینی»: داده کیفیت هوا (${profile.airStationNameFa} — ${stationState}) حاصل مدل مکانی است و نباید با اندازه‌گیری مستقیم ایستگاهی هم‌تراز نمایش داده شود | ${missingPollutants}.`
    : `اندازه‌گیری مستقیم از «${profile.airStationNameFa}» (${stationState}) | PM2.5: ${profile.pm25UgM3 ?? '--'}µg/m³ | ${missingPollutants}.`;

  const vegFrom = profile.vegetationPercentByYear[periodFrom];
  const vegTo = profile.vegetationPercentByYear[periodTo];
  const delta = Number((vegTo - vegFrom).toFixed(1));
  const trendLabel = delta > 0.3 ? 'افزایش پوشش گیاهی' : delta < -0.3 ? 'کاهش پوشش گیاهی' : 'بدون تغییر معنادار';
  const seasonWarn = profile.imagerySeasonalMatched
    ? 'تصاویر هم‌فصل و هم‌کیفیت هستند.'
    : 'هشدار مقایسه زمانی: تصاویر هم‌فصل یا هم‌کیفیت نیستند و ممکن است خطای فصلی رخ دهد.';

  const vegetationSeasonalAndTreeSurveyGuardFa = `مقایسه ${periodFrom} ← ${periodTo}: ${trendLabel} (${delta >= 0 ? '+' : ''}${delta}٪) | ${seasonWarn} | درختان ثبت‌شده (${profile.recordedTreeCount.toLocaleString('fa-IR')} اصله، پوشش برداشت ${profile.treeSurveyCoveragePercent}٪) معادل تعداد واقعی تمام درختان محدوده نیست.`;

  const withinEuclidean = profile.euclideanNearestParkMeters <= selectedRadiusMeters;
  const withinNetwork = profile.networkWalkNearestParkMeters <= selectedRadiusMeters;
  const barrierGapNote =
    withinEuclidean && !withinNetwork
      ? `شکاف دسترسی واقعی در شعاع ${selectedRadiusMeters}متر: فاصله مستقیم ${profile.euclideanNearestParkMeters}م است اما فاصله شبکه‌ای پیاده به دلیل مانع/معبر ${profile.networkWalkNearestParkMeters}م (${profile.walkMinutesNearestPark} دقیقه) است.`
      : `فاصله مستقیم ${profile.euclideanNearestParkMeters}م در برابر دسترسی شبکه‌ای پیاده ${profile.networkWalkNearestParkMeters}م (${profile.walkMinutesNearestPark} دقیقه).`;

  const parkAccessAndJusticeGuardFa = `${barrierGapNote} | عدالت محیطی (عرضه ≠ بهره‌مندی جمعیت): سرانه عرضه ${profile.greenSqmPerCapita}م² و پوشش سایه ${profile.shadeCoveredPopulationPercent}٪ در مقابل ${profile.populationWithoutGreenAccessPercent}٪ جمعیت خارج از دسترسی واقعی.`;

  const corridorLabel = profile.hasEcologicalCorridorHabitatProof
    ? 'کریدور اکولوژیک تأییدشده با مستندات زیستگاه و گونه‌های هدف'
    : `عنوان علمی مجاز: «پهنه دارای ظرفیت اتصال اکولوژیک» (${profile.isolatedGreenPatchesCount} لکه سبز جداافتاده — فاقد مستندات کامل زیستگاه برای ادعای کریدور تأییدشده)`;

  const waterLabel = profile.hasWaterLabMonitoringData
    ? 'داده آزمایشگاهی/پایش معتبر شبکه آبی ثبت شده است.'
    : 'محدودیت آب: خط رودخانه/مسیل روی نقشه نشان‌دهنده سلامت یا کیفیت شیمیایی آب نیست (داده آزمایشگاهی معتبر ثبت نشده).';

  return {
    airQualityOriginGuardFa,
    vegetationSeasonalAndTreeSurveyGuardFa,
    parkAccessAndJusticeGuardFa,
    corridorAndWaterEvidenceGuardFa: `${corridorLabel} | ${waterLabel}`,
  };
}

export function evaluateThermalUrbanPressureScenarioAndIndexGuards(
  profile: Stage66EnvironmentProfile,
  comparedZonesCount: number,
  discloseMissingComponent: boolean,
  isHypotheticalScenario: boolean,
  publicExportMode: boolean,
): ThermalPressureScenarioAndIndexGuardResult {
  const thermalLstWarning = `دمای سطح زمین (LST: ${profile.landSurfaceTempCelsius}°C، اختلاف +${profile.urbanHeatDeltaCelsius}°C) با دمای هوای ایستگاه هواشناسی یکسان نیست و مستقیم به آسایش حرارتی شهروندان تبدیل نمی‌شود.`;
  const soilWarning = profile.hasSoilChemicalLabData
    ? 'داده تخصصی آزمایش خاک ثبت شده است.'
    : 'محدودیت خاک: تصاویر ماهواره‌ای عمومی برای تشخیص ویژگی شیمیایی یا آلودگی خاک کافی نیستند.';

  const imperviousNote = `سطوح نفوذناپذیر ${profile.imperviousSurfacePercent}٪ به تنهایی معادل احتمال قطعی سیلاب نیست (نیازمند ترکیب شیب، بارش و شبکه زهکشی).`;
  const pressureNote = `هم‌زمانی فشار توسعه: تغییر ساخت‌وساز +${profile.builtUpExpansion5YrPercent}٪ و تغییر پوشش گیاهی ${profile.vegetationLoss5YrPercent >= 0 ? '-' : '+'}${Math.abs(profile.vegetationLoss5YrPercent)}٪؛ از هم‌زمانی، رابطه علت‌ومعلولی قطعی استنتاج نمی‌شود.`;

  const clampedCompareCount = Math.min(Math.max(comparedZonesCount, 1), 4);
  const compareCapPrefix =
    comparedZonesCount > 4
      ? `سقف مقایسه فعال شد (${comparedZonesCount} انتخاب ← محدود به حداکثر ۴ محله).`
      : `مقایسه چندبعدی برای ${clampedCompareCount} محله (حداکثر ۴ محله) فعال است.`;
  const compareCapNote = `${compareCapPrefix} ساخت رتبه‌بندی کلی گمراه‌کننده «بهترین محله» بدون وزن‌دهی صریح مسدود است.`;

  const compositeGuard =
    profile.missingCompositeComponentNameFa && !discloseMissingComponent
      ? `هشدار شاخص ترکیبی: مؤلفه «${profile.missingCompositeComponentNameFa}» مفقود است؛ حذف بی‌اعلام آن در حالی که عنوان و مقیاس قبلی حفظ شود مسدود شد (-- نیازمند شفاف‌سازی).`
      : `مؤلفه‌های شاخص ترکیبی همراه با روش محاسبه، وزن‌دهی، تاریخ داده و افشای شفاف وضعیت (${profile.qualityBadge}) ارائه شد.`;

  const scenarioLabel = isHypotheticalScenario
    ? 'برچسب الزامی فعال: «سناریوی فرضی — نتیجه قطعی یا پیش‌بینی تضمین‌شده نیست» (همراه با فرضیات مدل، محدودیت‌ها و سطح عدم‌قطعیت).'
    : 'حالت مشاهده وضعیت فعلی ثبت‌شده (غیرسناریویی).';

  const privacyExportLabel = publicExportMode
    ? 'حالت انتشار عمومی: موقعیت‌های حساس اکولوژیک/تجهیزات، داده‌های خصوصی شهروندان و داده خام بدون مجوز حذف و منشأ داده در پیوند/PDF حفظ شد.'
    : 'حالت پژوهشگر مجاز: دسترسی کنترل‌شده به لایه‌های تفکیکی همراه با ثبت لاگ مسئول تأیید و تاریخچه انتشار.';

  return {
    thermalLstAndSoilLimitGuardFa: `${thermalLstWarning} | ${soilWarning}`,
    imperviousAndDevelopmentCausalityGuardFa: `${imperviousNote} | ${pressureNote}`,
    neighborhoodCompareAndCompositeIndexGuardFa: `${compareCapNote} | ${compositeGuard}`,
    hypotheticalScenarioAndPrivacyExportGuardFa: `${scenarioLabel} | ${privacyExportLabel}`,
  };
}
