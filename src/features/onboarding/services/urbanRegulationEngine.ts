/** @file src/features/onboarding/services/urbanRegulationEngine.ts — Stage 55 Pure Compliance, Density & Guard Engine */
import type {
  DevelopmentScenarioInput,
  ParcelRegulationProfile,
  RegulationConstraintItem,
  RegulationDocumentRecord,
  RegulationNatureKind,
  RegulationViewerRole,
} from './urbanRegulationTypes';

export interface ThreeWayComplianceVerdict {
  approvedRuleSummaryFa: string;
  observedRealitySummaryFa: string;
  analyticalEstimateSummaryFa: string;
  landUseDivergenceNoteFa: string;
  warningsFa: string[];
  confirmedFactsFa: string[];
  calculatedValuesFa: string[];
  unknownRequiresInquiryFa: string[];
}

export function evaluateThreeWaySeparationAndParcelCompliance(
  parcel: ParcelRegulationProfile,
  constraints: ReadonlyArray<RegulationConstraintItem>,
  hasOfficialMunicipalInquiry: boolean,
): ThreeWayComplianceVerdict {
  const approvedRuleSummaryFa = `[${'ضابطه مصوب' as RegulationNatureKind}] پهنه ${parcel.zoneCode} (${parcel.zoneTitleFa}) — تراکم مجاز مرجع: ${
    parcel.approvedMaxFarPercent !== null ? `${parcel.approvedMaxFarPercent}٪` : 'نیازمند استعلام سند'
  } | حداکثر طبقات: ${parcel.approvedMaxFloors !== null ? `${parcel.approvedMaxFloors} طبقه` : 'نامشخص'}`;

  const observedRealitySummaryFa = `[${'وضعیت موجود' as RegulationNatureKind}] ${parcel.observedFloors} طبقه ساخته‌شده | تراکم موجود: ${parcel.observedFarPercent}٪ | کاربری مشاهده‌شده: ${parcel.observedUseFa} (وجود بنای ${parcel.observedFloors} طبقه به‌تنهایی مجازبودن آن را اثبات نمی‌کند).`;

  const estimatedCapacityRatio =
    parcel.approvedMaxFarPercent !== null && parcel.approvedMaxFarPercent > 0
      ? Math.round((parcel.observedFarPercent / parcel.approvedMaxFarPercent) * 100)
      : null;

  const analyticalEstimateSummaryFa = `[${'برآورد تحلیلی' as RegulationNatureKind}] ${
    estimatedCapacityRatio !== null
      ? `نسبت بهره‌برداری فعلی از ظرفیت مبنا حدود ${estimatedCapacityRatio}٪ برآورد می‌شود؛ این رقم جایگزین پروانه یا استعلام شهرداری نیست.`
      : 'به دلیل نبود ضابطه کامل، امکان برآورد دقیق ظرفیت وجود ندارد.'
  }`;

  const landUseDivergenceNoteFa =
    parcel.approvedPrimaryUseFa !== parcel.observedUseFa
      ? `تفاوت کاربری مصوب («${parcel.approvedPrimaryUseFa}») و کاربری مشاهده‌شده («${parcel.observedUseFa}»): این اختلاف صرفاً گزارش می‌شود و سامانه بدون استعلام حقوقی درباره قانونی یا غیرقانونی‌بودن بهره‌برداری حکم نمی‌دهد.`
      : `کاربری مشاهده‌شده («${parcel.observedUseFa}») هم‌راستا با کاربری اصلی مصوب پهنه است.`;

  const warningsFa: string[] = [];
  if (parcel.parcelBoundaryUncertain) warningsFa.push('مرز قطعه نامطمئن یا تطبیق‌یافته با دقت تقریبی است.');
  if (!parcel.lotAreaOfficialConfirmed) warningsFa.push('مساحت زمین از منبع ثبتی رسمی تأیید نشده است.');
  if (parcel.conflictingZoningSources) warningsFa.push('پهنه‌بندی این قطعه بین دو منبع رسمی/نقشه‌ای تعارض دارد.');
  if (!hasOfficialMunicipalInquiry) warningsFa.push('این تحلیل جایگزین استعلام رسمی و نظر حقوقی قطعی شهرداری نیست.');
  if (parcel.overlappingConstraintIds.length > 0) {
    const matched = constraints.filter((c) => parcel.overlappingConstraintIds.includes(c.id));
    warningsFa.push(
      `تداخل احتمالی با ${matched.length} محدودیت (${matched.map((m) => m.titleFa).join('، ')}) — قرارگیری در محدوده الزاماً به‌معنای ممنوعیت قطعی ساخت نیست و نیازمند استعلام است.`,
    );
  }

  return {
    approvedRuleSummaryFa,
    observedRealitySummaryFa,
    analyticalEstimateSummaryFa,
    landUseDivergenceNoteFa,
    warningsFa,
    confirmedFactsFa: [
      `منبع ضابطه: ${parcel.sourceDocTitleFa} (${parcel.sourceDocNumberFa})`,
      `مرجع: ${parcel.sourceAuthorityFa} | تاریخ بررسی: ${parcel.lastVerifiedDateFa}`,
    ],
    calculatedValuesFa: [
      `مبنای محاسبه: ${parcel.calculationBasisFa}`,
      estimatedCapacityRatio !== null
        ? `نسبت تراکم موجود به مبنا: ${estimatedCapacityRatio}٪ (محاسبه تحلیلی)`
        : 'نسبت تراکم: غیرقابل محاسبه به علت کمبود ضابطه',
    ],
    unknownRequiresInquiryFa: [
      parcel.streetWidthMeters === null ? 'عرض گذر مجاور نامشخص (مؤثر بر طبقات نهایی)' : `عرض گذر ثبت‌شده: ${parcel.streetWidthMeters} متر (نیازمند تطبیق طرح تفصیلی)`,
      'اصلاحیه بر و کف، وضعیت سند تفکیکی و استعلام حقوقی مراجع ذی‌صلاح',
    ],
  };
}

export interface ParcelComparisonResult {
  comparable: boolean;
  verdictFa: string;
  farGapPercent: number | null;
}

export function compareTwoParcelsCompliance(
  parcelA: ParcelRegulationProfile,
  parcelB: ParcelRegulationProfile,
): ParcelComparisonResult {
  const sameBasis = parcelA.calculationBasisFa === parcelB.calculationBasisFa;
  if (!sameBasis) {
    return {
      comparable: false,
      verdictFa: `مقایسه دقیق مسدود شد: مبنای محاسبه ملک الف («${parcelA.calculationBasisFa}») با ملک ب («${parcelB.calculationBasisFa}») هم‌تعریف نیست.`,
      farGapPercent: null,
    };
  }

  const gap =
    parcelA.approvedMaxFarPercent !== null && parcelB.approvedMaxFarPercent !== null
      ? Math.abs(parcelA.approvedMaxFarPercent - parcelB.approvedMaxFarPercent)
      : null;

  return {
    comparable: true,
    verdictFa:
      gap !== null
        ? `مقایسه هم‌مبنا انجام شد (${parcelA.parcelId} در برابر ${parcelB.parcelId}): اختلاف تراکم مبنا ${gap}٪ با ذکر تفاوت سطح اطمینان منابع.`
        : 'مبنا یکسان است اما حداقل یکی از قطعات فاقد ضابطه رسمی تراکم برای مقایسه عددی است.',
    farGapPercent: gap,
  };
}

export interface ScenarioSimulationOutput {
  labelTagFa: string;
  scenarios: ReadonlyArray<{
    nameFa: string;
    footprintSqm: number;
    hypotheticalTotalGfaSqm: number;
    effectiveFloors: number;
    noteFa: string;
  }>;
  disclaimerFa: string;
}

export function simulateHypotheticalDevelopmentScenarios(
  input: DevelopmentScenarioInput,
): ScenarioSimulationOutput {
  const safeLot = Math.max(50, input.lotAreaSqm);
  const safeCoverage = Math.min(80, Math.max(20, input.coveragePercent));
  const minCoverage = Math.max(20, safeCoverage - 10);

  const footprintBase = Math.round((safeLot * safeCoverage) / 100);
  const footprintMin = Math.round((safeLot * minCoverage) / 100);
  const baseTotal = Math.round((safeLot * Math.max(60, input.baseFarPercent)) / 100);
  const customTotal = Math.round(footprintBase * Math.max(1, input.hypotheticalFloors));

  return {
    labelTagFa: 'محاسبه فرضی / برآورد تحلیلی (فاقد اعتبار مجوز ساخت)',
    scenarios: [
      {
        nameFa: 'سناریوی ۱: حداقل سطح اشغال و فضای باز بیشتر',
        footprintSqm: footprintMin,
        hypotheticalTotalGfaSqm: baseTotal,
        effectiveFloors: Math.max(1, Math.round(baseTotal / Math.max(1, footprintMin))),
        noteFa: `بر اساس ${minCoverage}٪ اشغال و عقب‌نشینی ${input.setbackMeters} متری`,
      },
      {
        nameFa: 'سناریوی ۲: استفاده از تراکم مبنای ورودی',
        footprintSqm: footprintBase,
        hypotheticalTotalGfaSqm: baseTotal,
        effectiveFloors: Math.max(1, Math.round(baseTotal / Math.max(1, footprintBase))),
        noteFa: `بر اساس تراکم فرضی ${input.baseFarPercent}٪ و سطح اشغال ${safeCoverage}٪`,
      },
      {
        nameFa: 'سناریوی ۳: ترکیب سطح اشغال و طبقات فرضی کاربر',
        footprintSqm: footprintBase,
        hypotheticalTotalGfaSqm: customTotal,
        effectiveFloors: input.hypotheticalFloors,
        noteFa:
          input.maxHeightMeters !== null
            ? `سقف ارتفاع ورودی: ${input.maxHeightMeters} متر (نیازمند بررسی ضابطه گذر)`
            : 'بدون داده ارتفاع مستند',
      },
    ],
    disclaimerFa:
      'این ابزار با تغییر اعداد ظرفیت قطعی ساخت تعیین نمی‌کند؛ ظرفیت واقعی وابسته به ضوابط خاص، عرض گذر، هندسه زمین، وضعیت سند و استعلام رسمی است.',
  };
}

export interface DocumentAndPrivacyAuditResult {
  mustKeepPrimaryTextAccessible: boolean;
  displayedTextFa: string;
  ownerPrivacyNoticeFa: string;
  auditTrailEnabled: boolean;
  reportSectionsCount: number;
}

export function auditDocumentAndPrivacyAccess(
  doc: RegulationDocumentRecord,
  role: RegulationViewerRole,
  showAiSummaryInsteadOfFullTextAttempt: boolean,
): DocumentAndPrivacyAuditResult {
  const isAdmin = role === 'مدیر سامانه';
  return {
    mustKeepPrimaryTextAccessible: true,
    displayedTextFa: showAiSummaryInsteadOfFullTextAttempt
      ? `هشدار منع جایگزینی: خلاصه کمکی جای متن سند را نمی‌گیرد. متن مرجع اصلی: «${doc.primaryTextExcerptFa}» | خلاصه کمکی مجزا: «${doc.aiHelperSummaryFa}»`
      : `متن اصلی سند (${doc.versionFa}): «${doc.primaryTextExcerptFa}»`,
    ownerPrivacyNoticeFa: isAdmin
      ? 'نقش مدیر سامانه: مشاهده ضوابط عمومی، تاریخچه ممیزی تغییرات و سطوح دسترسی اسناد (اطلاعات مالکیت خصوصی همچنان ثبت و کنترل‌شده است).'
      : `نقش «${role}»: اطلاعات عمومی شهرسازی قابل مشاهده است؛ داده‌های شخصی/ثبتی مالکان خصوصی بدون مجوز قانونی مخفی شده‌اند.`,
    auditTrailEnabled: true,
    reportSectionsCount: 12,
  };
}
