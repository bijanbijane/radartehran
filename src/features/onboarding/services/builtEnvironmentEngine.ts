/** @file src/features/onboarding/services/builtEnvironmentEngine.ts — Stage 54 Pure Guard & Analysis Engine */
import type {
  AreaDenominatorKind,
  BuildingRecord,
  BuiltEnvironmentViewerRole,
  DetectedPhysicalChangeRecord,
  QualityCheckOutcome,
} from './builtEnvironmentTypes';

export interface BuildingGuardReport {
  entitySeparationNoteFa: string;
  uniqueBuildingsVsListingsFa: string;
  heightEvaluationFa: string;
  isHeightEstimatedWarning: boolean;
  yearProvenanceFa: string;
  ageVsSafetyBlocked: boolean;
  ageVsSafetyMessageFa: string;
  threeDModeLabelFa: string;
  permitVsPhysicalSeparationFa: string;
}

export function evaluateBuildingProfileAndPhysicalGuards(
  building: BuildingRecord,
  attemptedFormulaHeightEstimate: boolean,
  attemptedAgeOnlyDilapidationLabel: boolean,
): BuildingGuardReport {
  const uniqueBuildingsVsListingsFa =
    `تعداد ساختمان مستقل: ۱ (${building.id}) | آگهی‌های متصل: ${building.activeListingsCount} (آگهی چندواحدی هرگز معادل چند ساختمان شمارش نمی‌شود).`;

  const hasMeasuredHeight = building.measuredHeightMeters !== null && !attemptedFormulaHeightEstimate;
  const heightEvaluationFa = hasMeasuredHeight
    ? `ارتفاع اندازه‌گیری‌شده مستند: ${building.measuredHeightMeters} متر (${building.floorsCount ?? 'نامشخص'} طبقه)`
    : attemptedFormulaHeightEstimate
      ? `مسدودشدن تبدیل قطعی طبقه به ارتفاع: تعداد طبقات (${building.floorsCount ?? 'نامشخص'}) به‌صورت عدد ثابت در ارتفاع ضرب نمی‌شود؛ حداکثر برچسب «برآورد تقریبی مبتنی بر طبقه» بدون رسمیت.`
      : `ارتفاع: نیازمند داده مستند (${building.floorsCount ?? 'نامشخص'} طبقه ثبت‌شده؛ جایگزینی تخمینی به‌عنوان داده رسمی ممنوع).`;

  const yearParts: string[] = [];
  if (building.officialRecordYear !== null) {
    yearParts.push(`سال ساخت ثبت‌شده در سند/مرجع (${building.yearSourceLabel}): ${building.officialRecordYear}`);
  } else {
    yearParts.push('سال ساخت رسمی: ثبت‌نشده / نامشخص');
  }
  if (building.declaredListingYear !== null) {
    yearParts.push(`سال ساخت اعلام‌شده در آگهی: ${building.declaredListingYear} (جدا از داده رسمی و غیرقابل رسمی‌شدن با تکرار آگهی)`);
  }

  const ageVsSafetyBlocked = attemptedAgeOnlyDilapidationLabel && !building.hasStructuralSafetyInspection;
  const ageVsSafetyMessageFa = ageVsSafetyBlocked
    ? 'خطا/مسدود: برچسب «ساختمان فرسوده» یا قضاوت ایمنی سازه‌ای صرفاً از روی سن بنا ممنوع است؛ ارزیابی سازه‌ای مستقل و ممیزی فنی ثبت نشده است.'
    : building.hasStructuralSafetyInspection
      ? 'ممیزی فنی سازه‌ای مستقل با ذکر منبع ثبت شده است.'
      : 'نمایش صرفاً دوره ساخت با ذکر منشأ؛ بدون نسبت‌دادن خودکار فرسودگی یا ناایمنی.';

  return {
    entitySeparationNoteFa: `ساختمان (${building.id}) ← روی قطعه (${building.parcelId}) ← بلوک (${building.blockId}) — موجودیت‌ها تفکیک‌شده‌اند.`,
    uniqueBuildingsVsListingsFa,
    heightEvaluationFa,
    isHeightEstimatedWarning: !hasMeasuredHeight,
    yearProvenanceFa: yearParts.join(' | '),
    ageVsSafetyBlocked,
    ageVsSafetyMessageFa,
    threeDModeLabelFa: building.is3dSchematicOnly
      ? 'نمای حجمی سه‌بعدی نمایشی/تخمینی (بدون داده مهندسی دقیق؛ فقط برای درک کلی ارتفاع)'
      : 'مدل سه‌بعدی دارای مشخصات مکانی مستند',
    permitVsPhysicalSeparationFa: `وضعیت کالبدی بنا: «${building.physicalStatus}» | وضعیت پرونده/مجوز: «${building.permitStatus}» (صدور مجوز ≠ شروع ساخت؛ پایان عملیات ≠ بهره‌برداری).`,
  };
}

export interface PhysicalChangeAiGuardResult {
  classificationLabelFa: string;
  isCatalogImportNotNewConstruction: boolean;
  demolitionLinkNoteFa: string;
  aiStatusBadgeFa: string;
  blocksAutoSafetyOrYearFromPhoto: boolean;
}

export function evaluatePhysicalChangeDemolitionAndAiGuard(
  change: DetectedPhysicalChangeRecord,
  isNewRecordFromCatalogImportOnly: boolean,
  hasHumanVerification: boolean,
  newBuildingIdAfterDemolition: string | null,
): PhysicalChangeAiGuardResult {
  const isCatalogImport = isNewRecordFromCatalogImportOnly || change.changeType === 'تغییر ثبت داده (Import)';
  const classificationLabelFa = isCatalogImport
    ? 'تغییر در ورود/تطبیق پایگاه داده (Catalog Import) — به‌عنوان ساخت جدید واقعی محله شمارش نمی‌شود.'
    : change.linkedConstructionCaseId
      ? `${change.observationStage} (${change.changeType}) — متصل به پرونده ساخت‌وساز ${change.linkedConstructionCaseId}`
      : `${change.observationStage} (${change.changeType}) — تغییر مشاهده‌شده بدون انتساب قطعی به پروژه`;

  const demolitionLinkNoteFa =
    change.changeType === 'تخریب'
      ? newBuildingIdAfterDemolition && newBuildingIdAfterDemolition !== change.buildingId
        ? `زنجیره تاریخی ثبت شد: بنای قبلی (${change.buildingId}) تخریب و به بنای جدید (${newBuildingIdAfterDemolition}) متصل شد (شناسه فیزیکی قبلی بازاستفاده نشد).`
        : newBuildingIdAfterDemolition === change.buildingId
          ? 'خطا: بازاستفاده از شناسه ساختمان تخریب‌شده برای بنای نوساز ممنوع است؛ باید شناسه جدید ساخته و پیوند تاریخی برقرار شود.'
          : `پیگیری تغییر در بنای (${change.buildingId}) بدون انتساب ساخت‌وساز جدید تا زمان تأیید.`
      : 'تحول غیرتخریبی با حفظ شناسه پایدار ساختمان.';

  const aiBadge =
    change.aiSuggestedConfidencePercent !== null
      ? hasHumanVerification
        ? `تأییدشده توسط بررسی‌گر انسانی (پیشنهاد اولیه سامانه: ${change.aiSuggestedConfidencePercent}٪؛ معیار قضاوت، سند/بازبینی انسانی است)`
        : `«تشخیص پیشنهادی سامانه، نیازمند بررسی» (${change.aiSuggestedConfidencePercent}٪ احتمال الگوریتمی؛ فاقد قطعیت تخریب، سن بنا یا ایمنی سازه)`
      : 'ثبت‌شده از منبع مستند/میدانی بدون برچسب خودکار AI';

  return {
    classificationLabelFa,
    isCatalogImportNotNewConstruction: isCatalogImport,
    demolitionLinkNoteFa,
    aiStatusBadgeFa: aiBadge,
    blocksAutoSafetyOrYearFromPhoto: true,
  };
}

export interface FabricDensityComparisonResult {
  comparisonAllowed: boolean;
  verdictFa: string;
  indicatorDefinitionsFa: string;
  stage20ValuationBridgeFa: string;
}

export function evaluateUrbanFabricDensityAndValuationBridge(
  areaADenominator: AreaDenominatorKind,
  areaBDenominator: AreaDenominatorKind,
  densityIndexA: number,
  densityIndexB: number,
): FabricDensityComparisonResult {
  const comparisonAllowed = areaADenominator === areaBDenominator;
  const verdictFa = comparisonAllowed
    ? `مقایسه مجاز با مخرج یکسان (${areaADenominator}): شاخص الف (${densityIndexA}) در برابر شاخص ب (${densityIndexB}).`
    : `مقایسه گمراه‌کننده مسدود شد: مخرج محدوده الف («${areaADenominator}») با مخرج محدوده ب («${areaBDenominator}») متفاوت است و نباید در یک نمودار مقایسه شوند.`;

  return {
    comparisonAllowed,
    verdictFa,
    indicatorDefinitionsFa:
      'تفکیک الزامی: (۱) تراکم ساختمانی (FAR: زیربنا به قطعه)، (۲) سطح اشغال (Coverage: اثر بنا به زمین)، (۳) تراکم قطعات/تعداد بنا در هکتار.',
    stage20ValuationBridgeFa:
      'اتصال یک‌طرفه به موتور ارزش‌گذاری مرجع مرحله ۲۰ (hedonicPricingEngine): داده‌های کالبدی دارای منبع و تاریخ به‌عنوان ورودی ارسال می‌شوند؛ بدون ایجاد موتور قیمت‌گذاری موازی در مرحله ۵۴.',
  };
}

export interface QualityAndPrivacyAuditResult {
  roleAccessSummaryFa: string;
  ownerUnitPiiVisible: boolean;
  fieldPhotoPublishAllowed: boolean;
  qualityAxes: ReadonlyArray<{ axisFa: string; outcome: QualityCheckOutcome; detailFa: string }>;
}

export function runBuildingQualityAndPrivacyCheck(
  building: BuildingRecord,
  role: BuiltEnvironmentViewerRole,
  fieldPhotoFacesAndPlatesRedacted: boolean,
): QualityAndPrivacyAuditResult {
  const isPrivileged = role === 'مدیر داده و سامانه';
  const ownerUnitPiiVisible = !building.hasRestrictedUnitPii || isPrivileged;

  const qualityAxes: Array<{ axisFa: string; outcome: QualityCheckOutcome; detailFa: string }> = [
    {
      axisFa: '۱. بررسی هندسه (بسته‌بودن، نبود همپوشانی، دقت)',
      outcome: building.geometryAccuracy === 'دقیق' ? 'موفق' : 'نیازمند بررسی',
      detailFa: `دقت هندسه: ${building.geometryAccuracy}`,
    },
    {
      axisFa: '۲. بررسی فیزیکی (طبقات، مساحت و ارتفاع منطقی)',
      outcome: building.floorsCount !== null && building.measuredHeightMeters !== null ? 'موفق' : 'دارای محدودیت',
      detailFa: building.measuredHeightMeters === null ? 'ارتفاع مستند ندارد (تخمین قطعی ممنوع)' : 'مقادیر فیزیکی سازگار',
    },
    {
      axisFa: '۳. بررسی زمانی (نبود تخریب پیش از تاریخ ساخت)',
      outcome: building.hasDemolitionBeforeCreationAnomaly ? 'ناموفق' : 'موفق',
      detailFa: building.hasDemolitionBeforeCreationAnomaly
        ? 'خطای زمانی: تاریخ تخریب پیش از ساخت ثبت شده است (نیاز به بازبینی مدیر داده)'
        : 'توالی زمانی ساخت تا وضعیت فعلی منطقی است',
    },
    {
      axisFa: '۴. بررسی ارتباط موجودیت‌ها (ساختمان، قطعه، آگهی، پرونده)',
      outcome: building.officialRecordYear === null && building.declaredListingYear !== null ? 'نیازمند بررسی' : 'موفق',
      detailFa: building.officialRecordYear === null ? 'فقط سال اعلامی آگهی موجود است (محدودیت منشأ)' : 'پیوند مستند برقرار است',
    },
  ];

  return {
    roleAccessSummaryFa: ownerUnitPiiVisible
      ? `نقش «${role}»: دسترسی به جزئیات کامل مجاز ساختمان؛ داده‌های مالکیت خصوصی همچنان مشمول قواعد انتشار است.`
      : `نقش «${role}»: پلاک‌های حساس، اطلاعات هویتی مالکان و مختصات اختصاصی واحدها مخفی/ماسک شدند.`,
    ownerUnitPiiVisible,
    fieldPhotoPublishAllowed: fieldPhotoFacesAndPlatesRedacted,
    qualityAxes,
  };
}
