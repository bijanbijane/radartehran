/** @file src/features/onboarding/services/urbanRiskEngine.ts — Stage 58 Pure Urban Risk & Resilience Epistemic Guard Engine */
import type { NeighborhoodRiskProfile } from './urbanRiskTypes';

export interface SeismicAndBuildingGuardResult {
  hazardVsVulnerabilitySeparationFa: string;
  buildingAssessmentRuleFa: string;
  unifiedSingleScoreGuardFa: string;
  structuralDisplayModeFa: string;
}

export function evaluateHazardVsBuildingSeismicGuard(
  profile: NeighborhoodRiskProfile,
  attemptSingleUnifiedScore: boolean,
): SeismicAndBuildingGuardResult {
  const hazardVsVulnerabilitySeparationFa =
    `تفکیک لایه زمین از بنا: پهنه خطر لرزه‌ای («${profile.seismicHazardClassFa}») جدا از آسیب‌پذیری کالبدی ساختمان نمایش داده می‌شود؛ خطر بالا به معنای ریسک یکسان برای همه بناها نیست.`;

  const hasFormalEval = profile.structuralTier === 'ارزیابی تخصصی موجود';
  const buildingAssessmentRuleFa = hasFormalEval
    ? 'ارزیابی مهندسی تخصصی با مستندات معتبر ثبت شده است؛ نمایش نتیجه همراه با منبع و تاریخ ارزیابی.'
    : `وضعیت داده بنا: «${profile.structuralTier}» — صرف سال ساخت (${
        profile.buildingYearBuilt ?? 'نامشخص'
      })، ظاهر یا تعداد طبقات برای صدور حکم قطعی ایمنی یا آسیب‌پذیری سازه کافی نیست و جایگزین بررسی مهندسی نمی‌شود.`;

  const unifiedSingleScoreGuardFa = attemptSingleUnifiedScore
    ? 'مسدودشدن امتیاز واحد ترکیبی: ادغام زلزله، سیلاب، فرونشست و آتش‌سوزی در یک نمره کلی مبهم ممنوع است؛ مدل محاسبه ریسک هر مخاطره مستقل است.'
    : 'ارائه ماتریس تفکیکی مخاطره، مواجهه، آسیب‌پذیری و ظرفیت پاسخ‌گویی بدون ادغام گمراه‌کننده در یک عدد واحد.';

  const structuralDisplayModeFa =
    profile.structuralTier === 'فاقد داده'
      ? 'عدم تولید امتیاز قطعی (فاقد داده سازه‌ای)'
      : profile.structuralTier === 'اطلاعات ناقص'
        ? 'نمایش صریح محدودیت ارزیابی به‌دلیل نقص مدارک سازه‌ای'
        : profile.structuralTier === 'برآورد مدل'
          ? 'نمایش با برچسب صریح «تخمینی / مدل تحلیلی»'
          : profile.structuralTier === 'مشخصات ساختمانی ثبت‌شده'
            ? 'نمایش اطلاعات توصیفی بدون حکم قطعی مقاومت'
            : 'نمایش نتیجه همراه با مستندات مهندسی';

  return {
    hazardVsVulnerabilitySeparationFa,
    buildingAssessmentRuleFa,
    unifiedSingleScoreGuardFa,
    structuralDisplayModeFa,
  };
}

export interface MultiHazardDomainGuardResult {
  subsidenceBuildingGuardFa: string;
  floodNonRecordGuardFa: string;
  firePrivacyAndMissingSystemGuardFa: string;
  slopeInstabilityGuardFa: string;
  otherEventsVerificationGuardFa: string;
}

export function evaluateSubsidenceFloodFireSlopeAndEventsGuards(
  profile: NeighborhoodRiskProfile,
  publicRoleView: boolean,
): MultiHazardDomainGuardResult {
  const subsidenceBuildingGuardFa =
    profile.subsidenceRateMmPerYear !== null
      ? `نرخ تغییر سطح زمین پیرامونی: ${profile.subsidenceRateMmPerYear} میلی‌متر در سال (${profile.subsidenceConfidenceFa}). داده تغییر شکل سطح زمین را نباید با تشخیص قطعی نشست یا آسیب یک ساختمان خاص یکی دانست.`
      : 'داده معتبر سنجش از دور برای نرخ فرونشست در این نقطه ثبت نشده یا نیازمند تکمیل است.';

  const floodNonRecordGuardFa = profile.hasRecordedFloodHistory
    ? `دارای سابقه آب‌گرفتگی/سیلاب ثبت‌شده + وضعیت مدل: ${profile.floodModeledSusceptibilityFa} (خروجی مدل پیش‌بینی قطعی نیست).`
    : `نبود سابقه سیلاب در پایگاه داده هرگز به‌معنای «ایمن قطعی» نیست؛ استعداد مدل‌شده (${profile.floodModeledSusceptibilityFa}) جدا از رخداد واقعی نمایش داده می‌شود.`;

  const fireSystemNote = profile.fireSuppressionRegisteredInDb
    ? 'اطلاعات عمومی سامانه ایمنی در پرونده ثبت شده است.'
    : 'نبود ثبت سامانه اطفای حریق در سامانه به‌معنای نبود واقعی آن در ساختمان نیست.';
  const firePrivacyNote = publicRoleView
    ? 'نمای عمومی: جزئیات حساس و نقاط ضعف عملیاتی مراکز/تأسیسات مخفی و به داده‌های تجمیعی مجاز محدود شده است.'
    : 'نمای مدیر/ارزیاب مجاز: بررسی کنترل‌دسترسی با ثبت رویداد ممیزی فعال است.';

  const slopeInstabilityGuardFa = `وضعیت ناپایداری شیب: «${profile.slopeClass}» — هرگز صرفاً به‌دلیل زیاد بودن شیب، وقوع رانش قطعی اعلام نمی‌شود.`;

  const otherEventsVerificationGuardFa = profile.hasUnverifiedCitizenEvent
    ? 'شامل گزارش تأییدنشده: رخداد رسمی و گزارش مردمی با برچسب کاملاً متفاوت تفکیک می‌شوند تا بانک رخدادها به سامانه شایعات تبدیل نشود.'
    : 'تمامی رخدادهای نمایش‌داده‌شده در این محدوده دارای مرجع رسمی و تاریخ مستند هستند.';

  return {
    subsidenceBuildingGuardFa,
    floodNonRecordGuardFa,
    firePrivacyAndMissingSystemGuardFa: `${fireSystemNote} ${firePrivacyNote}`,
    slopeInstabilityGuardFa,
    otherEventsVerificationGuardFa,
  };
}

export interface EmergencyResilienceAndTimelineGuardResult {
  emergencyAccessScenarioGuardFa: string;
  responseCapacityCaveatFa: string;
  fourDateSeparationFa: string;
  sourceConflictResolutionFa: string;
  crisisScenarioDisclaimerFa: string;
}

export function evaluateEmergencyAccessInfrastructureAndTimelineGuards(
  profile: NeighborhoodRiskProfile,
  simulateRoadClosure: boolean,
): EmergencyResilienceAndTimelineGuardResult {
  const emergencyAccessScenarioGuardFa = simulateRoadClosure
    ? `تحلیل سناریو / شبیه‌سازی (انسداد مسیر فرضی): زمان تردد عادی (${profile.normalDriveMinutes} دقیقه) معادل زمان امدادرسانی واقعی نیست؛ بازه تخمینی بحران در مدل: ${profile.emergencyScenarioRangeMinutes}.`
    : `تردد عادی مدل‌شده: ${profile.normalDriveMinutes} دقیقه — در تحلیل بحران، خروجی با برچسب «شبیه‌سازی / تحلیل سناریو» ارائه می‌شود و معادل وضعیت لحظه‌ای عملیات نیست.`;

  const responseCapacityCaveatFa = `${profile.nearbyFireStationNoteFa} — نزدیکی مکانی مرکز امدادی به‌تنهایی تضمین‌کننده دریافت خدمت در زمان مناسب نیست (ظرفیت لحظه‌ای متفاوت است).`;

  const fourDateSeparationFa = `تفکیک ۴ تاریخ مستقل: وقوع رخداد (${profile.eventOccurredDateFa}) | انتشار گزارش (${profile.reportPublishedDateFa}) | ورود به رادار (${profile.radarIngestedDateFa}) | ارزیابی مدل (${profile.modelEvaluatedDateFa}).`;

  const sourceConflictResolutionFa = profile.hasSourceConflict
    ? `تعارض منابع فعال: ${profile.sourceConflictDetailFa} — هر دو منبع با تاریخ و روش تولید حفظ شده و مبنای انتخاب ثبت گردیده است.`
    : `منشأ داده: «${profile.provenanceKind}» — تعارض فعالی میان منابع ثبت‌شده برای این محدوده گزارش نشده است.`;

  const crisisScenarioDisclaimerFa =
    'مرزبندی حیاتی: سناریوساز ریسک ابزار پژوهش و تحلیل است، نه سامانه فرماندهی بحران، هشدار اضطراری لحظه‌ای یا مرجع تعیین مسیر تخلیه قطعی.';

  return {
    emergencyAccessScenarioGuardFa,
    responseCapacityCaveatFa,
    fourDateSeparationFa,
    sourceConflictResolutionFa,
    crisisScenarioDisclaimerFa,
  };
}
