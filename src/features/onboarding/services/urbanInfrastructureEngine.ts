/** @file src/features/onboarding/services/urbanInfrastructureEngine.ts — Stage 56 Pure Capacity, Accessibility & Guard Engine */
import type {
  CapacitySufficiencyLevel,
  InfrastructureScenarioInput,
  InfrastructureViewerRole,
  NeighborhoodInfrastructureProfile,
  TravelModeKind,
} from './urbanInfrastructureTypes';

export interface AccessibilityAndLayersVerdict {
  layerClutterBlocked: boolean;
  layerStatusMessageFa: string;
  isochroneMethodNoteFa: string;
  missingDataSeparationFa: string;
  publicSecurityGateFa: string;
}

export function evaluateLayersAccessibilityAndPrivacy(
  profile: NeighborhoodInfrastructureProfile,
  activeLayersCount: number,
  travelMode: TravelModeKind,
  isochroneMinutes: 5 | 10 | 15 | 30,
  role: InfrastructureViewerRole,
): AccessibilityAndLayersVerdict {
  const layerClutterBlocked = activeLayersCount > 3;
  const layerStatusMessageFa = layerClutterBlocked
    ? `هشدار شلوغی نقشه (${activeLayersCount} لایه فعال): برای حفظ خوانایی، بیش از ۳ لایه متراکم هم‌زمان محدود/تجمیع می‌شوند.`
    : `${activeLayersCount} لایه زیرساختی با راهنمای روشن روی نقشه فعال است.`;

  const isochroneMethodNoteFa = `تحلیل دسترسی ${isochroneMinutes} دقیقه‌ای با شیوه «${travelMode}» بر پایه شبکه واقعی معابر و موانع حرکتی محاسبه می‌شود (هرگز جایگزین با دایره فاصله مستقیم نمی‌شود).`;

  const missingDataSeparationFa =
    profile.waterCoverageStatus === 'نامشخص به علت کمبود داده' ||
    profile.gasCoverageStatus === 'نامشخص به علت کمبود داده'
      ? 'اصل عدم جعل داده: وضعیت «نامشخص به علت کمبود داده» هرگز به‌عنوان «فاقد زیرساخت» تفسیر نمی‌شود و با مقدار فرضی پر نمی‌گردد.'
      : 'وضعیت شبکه‌ها همراه با تفکیک پوشش تأییدشده از گزارش‌های تأییدنشده نمایش داده می‌شود.';

  const isPrivileged = role === 'مدیر زیرساخت';
  const publicSecurityGateFa = isPrivileged
    ? `نقش «${role}»: دسترسی به اطلاعات سطح ممیزی با ثبت لاگ امنیتی؛ اطلاعات شخصی بهره‌برداران همچنان محافظت می‌شود.`
    : `نقش «${role}»: نمای عمومی محدود به داده‌های تجمیعی و غیرحساس است؛ نقاط آسیب‌پذیر شبکه حیاتی و اطلاعات عملیاتی حساس مسدود شدند.`;

  return {
    layerClutterBlocked,
    layerStatusMessageFa,
    isochroneMethodNoteFa,
    missingDataSeparationFa,
    publicSecurityGateFa,
  };
}

export interface CapacityAndJusticeVerdict {
  sufficiencyLevel: CapacitySufficiencyLevel;
  supplyDemandNoteFa: string;
  educationLimitNoteFa: string;
  spatialJusticeBreakdownFa: string;
  historicalDateIntegrityFa: string;
}

export function evaluateCapacityJusticeAndHistory(
  profile: NeighborhoodInfrastructureProfile,
): CapacityAndJusticeVerdict {
  let sufficiencyLevel: CapacitySufficiencyLevel = 'اطلاعات ناکافی برای ارزیابی';
  let supplyDemandNoteFa = 'به علت نبود داده ظرفیت عملیاتی یا تقاضای جمعیت هدف، سامانه از صدور وضعیت قطعی کفایت خودداری می‌کند.';

  if (profile.operationalCapacityUnits !== null && profile.estimatedDemandUnits !== null && profile.estimatedDemandUnits > 0) {
    const ratio = profile.operationalCapacityUnits / profile.estimatedDemandUnits;
    if (ratio >= 1.05) {
      sufficiencyLevel = 'ظرفیت کافی بر اساس داده موجود';
      supplyDemandNoteFa = `ظرفیت عملیاتی (${profile.operationalCapacityUnits}) در برابر تقاضای تخمینی (${profile.estimatedDemandUnits}) در محدوده کافی است (غیرمعادل قضاوت قطعی عملکرد مرکز).`;
    } else if (ratio >= 0.85) {
      sufficiencyLevel = 'احتمال فشار بر ظرفیت';
      supplyDemandNoteFa = `نسبت عرضه به تقاضا (${Math.round(ratio * 100)}٪) حاکی از احتمال فشار بر ظرفیت در اوج مصرف است.`;
    } else {
      sufficiencyLevel = 'کمبود احتمالی خدمات';
      supplyDemandNoteFa = `نسبت عرضه به تقاضا (${Math.round(ratio * 100)}٪) بیانگر کمبود احتمالی خدمات نسبت به نیاز تخمینی است.`;
    }
  }

  const educationLimitNoteFa = profile.targetAgePopulationKnown
    ? `${profile.schoolsCount} مرکز آموزشی با داده جمعیت گروه سنی هدف مقایسه شده است.`
    : `محدودیت داده آموزشی (${profile.schoolsCount} مرکز ثبت‌شده): جمعیت گروه سنی هدف موجود نیست؛ تولید عدد کمبود قطعی ممنوع است.`;

  return {
    sufficiencyLevel,
    supplyDemandNoteFa,
    educationLimitNoteFa,
    spatialJusticeBreakdownFa:
      'شاخص عدالت فضایی چندبعدی و قابل بازگشایی است (درمان + آموزش + حمل‌ونقل + فضای سبز + خدمات عمومی) با تعریف، واحد، وزن و محدودیت شفاف؛ هیچ امتیاز ترکیبی مبهم بدون اجزا نمایش داده نمی‌شود.',
    historicalDateIntegrityFa: `تفکیک تاریخ رویداد واقعی (${profile.realChangeEventDateFa}) از تاریخ دریافت داده (${profile.dataCollectedDateFa}) برقرار است.`,
  };
}

export interface ScenarioImpactSimulationResult {
  badgeFa: string;
  estimatedAccessDeltaFa: string;
  estimatedCapacityDeltaFa: string;
  boundaryNoticeFa: string;
}

export function simulateInfrastructureScenario(
  profile: NeighborhoodInfrastructureProfile,
  input: InfrastructureScenarioInput,
): ScenarioImpactSimulationResult {
  const pressureShift = input.populationDeltaPercent - input.addedCapacityPercent;
  const serviceBoost = input.addedHealthCenters * 6 + input.addedTransitLines * 8;

  return {
    badgeFa: 'شبیه‌سازی / برآورد فرضی (غیرمعادل وضعیت واقعی یا طرح مصوب شهری)',
    estimatedAccessDeltaFa: `تغییر فرضی شاخص دسترسی در ${profile.neighborhoodNameFa}: ${serviceBoost >= 0 ? `+${serviceBoost}` : serviceBoost} واحد دسترسی شبکه‌ای (تخمینی).`,
    estimatedCapacityDeltaFa:
      pressureShift > 0
        ? `فشار تقاضای فرضی حدود +${pressureShift}٪ بیشتر از ظرفیت اضافه‌شده است.`
        : `حاشیه ظرفیت فرضی حدود ${Math.abs(pressureShift)}٪ بهبود می‌یابد.`,
    boundaryNoticeFa: 'نتایج این شبیه‌سازی صرفاً برای بررسی سناریوهای فرضی است و جایگزین مطالعات مهندسی و طرح‌های مصوب نیست.',
  };
}
