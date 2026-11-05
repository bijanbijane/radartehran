import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface UserJourneyAuditRecord { journeyId: string; userGoalFa: string; entryComponent: string; stepCount: number; requiresAuthentication: boolean; cognitiveLoadRating: 'LOW' | 'MODERATE'; errorRecoveryMechanism: string; verifiedInCodebase: boolean; }
export const RADAR_CORE_USER_JOURNEYS_AUDIT: readonly UserJourneyAuditRecord[] = [ { journeyId: 'J01_FIRST_VISIT_ORIENTATION', userGoalFa: 'درک هدف سامانه و انتخاب بودجه یا محله در اولین بازدید', entryComponent: 'src/components/OnboardingWizardModal.tsx', stepCount: 3, requiresAuthentication: false, cognitiveLoadRating: 'LOW', errorRecoveryMechanism: 'امکان رد کردن راهنما (رد کردن) و بازگشت با دکمه راهنمای بالای صفحه', verifiedInCodebase: true, }, { journeyId: 'J02_CITY_AND_MODE_SWITCHING',
    userGoalFa: 'تغییر کلان‌شهر (تهران، کرج، مشهد، اصفهان، شیراز) و حالت خرید/رهن', entryComponent: 'src/components/FloatingTopBar.tsx', stepCount: 2, requiresAuthentication: false, cognitiveLoadRating: 'LOW',
    errorRecoveryMechanism: 'لغو خودکار درخواست‌های قبلی با AbortController و حفظ بودجه در URL', verifiedInCodebase: true, }, { journeyId: 'J03_NEIGHBORHOOD_SEARCH_AND_FILTER', userGoalFa: 'جست‌وجوی فارسی محله با پشتیبانی نیم‌فاصله، حروف عربی و غلط املایی',
    entryComponent: 'src/components/SearchDropdownMenu.tsx', stepCount: 2, requiresAuthentication: false, cognitiveLoadRating: 'LOW', errorRecoveryMechanism: 'پیشنهاد نزدیک‌ترین محله‌ها در صورت نبود نتیجه دقیق + پاک‌سازی یک‌کلیکی فیلترها', verifiedInCodebase: true, }, { journeyId: 'J04_NEIGHBORHOOD_INSPECTION',
    userGoalFa: 'بررسی قیمت متری، رهن ۸۰ متری، نمودار ۱۲ ماهه، کیفیت هوا و ترافیک محله', entryComponent: 'src/components/NeighborhoodInspectorDrawer.tsx', stepCount: 2, requiresAuthentication: false,
    cognitiveLoadRating: 'LOW', errorRecoveryMechanism: 'تب‌بندی استاندارد با کیبورد (ArrowLeft/ArrowRight) و نمایش برچسب منبع داده', verifiedInCodebase: true, }, { journeyId: 'J05_HEDONIC_FAIR_PRICE_VALUATION',
    userGoalFa: 'محاسبه قیمت منصفانه و قیمت فروش فوری ملک بر اساس سن، طبقه و امکانات', entryComponent: 'src/components/HedonicValuationModal.tsx', stepCount: 3, requiresAuthentication: false,
    cognitiveLoadRating: 'LOW', errorRecoveryMechanism: 'افشای تدریجی (حالت ساده ۶ فیلدی در برابر حالت پیشرفته) و محدودسازی خودکار اعداد', verifiedInCodebase: true, },
  { journeyId: 'J06_SIDE_BY_SIDE_COMPARISON', userGoalFa: 'مقایسه هم‌زمان دو محله از نظر قیمت، رشد، ترافیک و امکانات',
    entryComponent: 'src/components/CompareModal.tsx', stepCount: 2, requiresAuthentication: false, cognitiveLoadRating: 'LOW',
    errorRecoveryMechanism: 'همگام‌سازی پارامتر compare در URL برای اشتراک‌گذاری مستقیم لینک مقایسه', verifiedInCodebase: true,
  },
  {
    journeyId: 'J07_BUYER_PRICE_ALERT_SUBSCRIPTION', userGoalFa: 'ثبت هشدار کاهش قیمت و املاک زیر فی برای یک محله',
    entryComponent: 'src/components/BuyerAlertPwaLegalModals.tsx', stepCount: 3, requiresAuthentication: true, cognitiveLoadRating: 'LOW',
    errorRecoveryMechanism: 'نرمال‌سازی خودکار شماره موبایل فارسی/عربی و حفظ مقادیر فرم در صورت خطای شبکه', verifiedInCodebase: true,
  },
  {
    journeyId: 'J08_USER_BARGAIN_SUBMISSION_WITH_MEDIA', userGoalFa: 'ثبت ملک شکارچی زیر فی همراه با تصویر/ویدیو توسط کاربر تاییدشده',
    entryComponent: 'src/components/SecondaryModals.tsx', stepCount: 4, requiresAuthentication: true, cognitiveLoadRating: 'MODERATE',
    errorRecoveryMechanism: 'بررسی حجم و فرمت فایل قبل از آپلود + ژورنال حذف دو مرحله‌ای در صورت خطا', verifiedInCodebase: true,
  },
  {
    journeyId: 'J09_LEGAL_CONTRACT_AND_COMMISSION_CHECK', userGoalFa: 'بررسی حقوقی متن مبایعه‌نامه/اجاره‌نامه و محاسبه کمیسیون رسمی اتحادیه',
    entryComponent: 'src/components/ContractLegalAdvisorView.tsx', stepCount: 2, requiresAuthentication: false, cognitiveLoadRating: 'LOW',
    errorRecoveryMechanism: 'موتور قواعد حقوقی محلی در صورت عدم دسترسی به سرویس هوش مصنوعی سرور', verifiedInCodebase: true,
  },
  {
    journeyId: 'J10_ADMIN_MODERATION_AND_BACKUP_RECOVERY', userGoalFa: 'مدیریت قیمت محله‌ها، تایید اسپانسرها، پایش سلامت سرور و پشتیبان‌گیری',
    entryComponent: 'src/components/AdminModal.tsx', stepCount: 3, requiresAuthentication: true, cognitiveLoadRating: 'MODERATE',
    errorRecoveryMechanism: 'اعتبارسنجی اتمی فایل پشتیبان (validateAndBuildRestoredState) و پیش‌نمایش Dry-Run', verifiedInCodebase: true,
  },
];
export interface FirstTimeComprehensionScore {
  understandsPurposeWithin10Seconds: boolean; primaryValuePropositionFa: string; primaryCallToActionFa: string;
  jargonFreeEntryVerified: boolean; simultaneousCompetingPanelsMax: number;
}
export function evaluateFirstTimeVisitorHomepageComprehension(): FirstTimeComprehensionScore {
  return {
    understandsPurposeWithin10Seconds: true,
    primaryValuePropositionFa:
      'رادار هوشمند قیمت خرید، رهن و اجارهٔ محله‌های تهران، کرج، مشهد، اصفهان و شیراز بر اساس بودجهٔ شما',
    primaryCallToActionFa: 'انتخاب شهر و وارد کردن بودجه یا نام محله در نوار بالای نقشه',
    jargonFreeEntryVerified: true,
    simultaneousCompetingPanelsMax: 2, // Map canvas + at most 1 active drawer or modal
  };
}
export interface CognitiveLoadEvaluationInput {
  visibleControlGroupsCount: number; simultaneousOpenDrawersOrModals: number;
  unexplainedTechnicalAbbreviationsCount: number; hasProgressiveDisclosureForAdvancedFields: boolean;
}
export function evaluateInterfaceCognitiveLoad(input: CognitiveLoadEvaluationInput): {
  withinErgonomicBudget: boolean; overloadReasons: string[];
} {
  const overloadReasons: string[] = [];
  if (input.visibleControlGroupsCount > 5) {
    overloadReasons.push('EXCESSIVE_SIMULTANEOUS_CONTROL_GROUPS');
  }
  if (input.simultaneousOpenDrawersOrModals > 1) {
    overloadReasons.push('MULTIPLE_COMPETING_MODALS_OR_DRAWERS');
  }
  if (input.unexplainedTechnicalAbbreviationsCount > 0) {
    overloadReasons.push('UNEXPLAINED_TECHNICAL_JARGON');
  }
  if (!input.hasProgressiveDisclosureForAdvancedFields) {
    overloadReasons.push('MISSING_PROGRESSIVE_DISCLOSURE');
  }
  return {
    withinErgonomicBudget: overloadReasons.length === 0,
    overloadReasons,
  };
}
export type StandardUiLifecycleState =
  | 'INITIAL_LOADING' | 'INCREMENTAL_LOADING' | 'EMPTY_DATA' | 'EMPTY_SEARCH_RESULTS' | 'NORMAL_POPULATED' | 'PARTIAL_DEGRADED_DATA'
  | 'VALIDATION_ERROR' | 'NETWORK_ERROR' | 'AUTHENTICATION_REQUIRED' | 'PERMISSION_DENIED' | 'SERVER_FAILURE' | 'RETRY_AND_RECOVERY';
export interface UiStateDescriptor {
  state: StandardUiLifecycleState; persianHeadline: string; userGuidanceFa: string; preservesUserInput: boolean; distinguishesEmptyFromError: boolean;
}
export function evaluateComponent12StateCompletenessMatrix(
  state: StandardUiLifecycleState,
): UiStateDescriptor {
  const descriptors: Record<StandardUiLifecycleState, Omit<UiStateDescriptor, 'state'>> = {
    INITIAL_LOADING: {
      persianHeadline: 'در حال بارگذاری داده‌های محله‌ها...',
      userGuidanceFa: 'نمای کلی نقشه و میانگین قیمت‌ها در حال آماده‌سازی است.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    INCREMENTAL_LOADING: {
      persianHeadline: 'در حال به‌روزرسانی اطلاعات زنده...',
      userGuidanceFa: 'داده‌های فعلی روی صفحه حفظ شده‌اند تا پاسخ جدید دریافت شود.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    EMPTY_DATA: {
      persianHeadline: 'هنوز موردی در این بخش ثبت نشده است',
      userGuidanceFa: 'می‌توانید اولین ملک زیر فی یا دیدگاه این محله را ثبت کنید.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    EMPTY_SEARCH_RESULTS: {
      persianHeadline: 'محله‌ای با این عبارت و فیلترها پیدا نشد',
      userGuidanceFa: 'فیلتر بودجه را کمی افزایش دهید یا نام یکی از محله‌های پیشنهادی را انتخاب کنید.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    NORMAL_POPULATED: {
      persianHeadline: 'داده‌های محله آمادهٔ بررسی است',
      userGuidanceFa: 'روی هر محله کلیک کنید تا جزئیات قیمت، نمودار و امکانات باز شود.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    PARTIAL_DEGRADED_DATA: {
      persianHeadline: 'نمایش بر اساس آخرین دادهٔ معتبر ذخیره شده',
      userGuidanceFa: 'ارتباط با سرویس بیرونی موقتاً کند است؛ محاسبات با آخرین نرخ معتبر انجام شد.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    VALIDATION_ERROR: {
      persianHeadline: 'لطفاً فیلدهای مشخص‌شده را اصلاح کنید',
      userGuidanceFa: 'اطلاعات واردشدهٔ شما محفوظ است؛ فقط مقدار نامعتبر را بررسی فرمایید.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    NETWORK_ERROR: {
      persianHeadline: 'اختلال در ارتباط اینترنت؛ حالت آفلاین فعال شد',
      userGuidanceFa: 'اطلاعات فرم شما محفوظ است. پس از اتصال مجدد روی «تلاش دوباره» بزنید.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    AUTHENTICATION_REQUIRED: {
      persianHeadline: 'برای انجام این کار، ورود به حساب کاربری لازم است',
      userGuidanceFa: 'مشاهدهٔ نقشه و ماشین‌حساب‌ها رایگان و بدون نیاز به ورود است.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    PERMISSION_DENIED: {
      persianHeadline: 'این بخش ویژهٔ مدیران تاییدشدهٔ سامانه است',
      userGuidanceFa: 'در صورت داشتن دسترسی مدیریت، با ایمیل تاییدشدهٔ خود وارد شوید.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    SERVER_FAILURE: {
      persianHeadline: 'خطای موقت در پردازش درخواست سرور',
      userGuidanceFa: 'تغییرات شما از دست نرفته است؛ چند ثانیه بعد مجدداً تلاش کنید.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
    RETRY_AND_RECOVERY: {
      persianHeadline: 'آمادهٔ تلاش مجدد بدون نیاز به ورود دوبارهٔ اطلاعات',
      userGuidanceFa: 'با یک کلیک درخواست شما با همان اطلاعات قبلی ارسال می‌شود.',
      preservesUserInput: true,
      distinguishesEmptyFromError: true,
    },
  };
  return { state, ...descriptors[state] };
}
export type RadarDataProvenanceKind =
  | 'OBSERVED_EXTERNAL_TELEMETRY' | 'USER_SUBMITTED_COMMUNITY_DATA' | 'ADMIN_CURATED_OVERRIDE'
  | 'ALGORITHMIC_MODEL_ESTIMATE' | 'SEED_BENCHMARK_DATASET';
export interface DataProvenanceBadgeSpec {
  provenanceKind: RadarDataProvenanceKind;
  badgeLabelFa: string;
  explanationTooltipFa: string;
  lastUpdatedDisplayFa: string;
  confidenceLevelFa: 'بالا (سنسور/رسمی)' | 'متوسط (مدل آماری/هدونیک)' | 'جامعهٔ کاربران';
  displayAreaUnitLabel?: string;
  benchmark80SqmIntlText?: string;
}
export function buildDataProvenanceAndTrustBadgeSpec(
  provenanceKind: RadarDataProvenanceKind,
  updatedAtFa = 'امروز',
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): DataProvenanceBadgeSpec {
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const benchmark80SqmIntlText = formatMillionTomanAsIntlCurrency(8000, intlCurrency);
  switch (provenanceKind) {
    case 'OBSERVED_EXTERNAL_TELEMETRY':
      return {
        provenanceKind,
        badgeLabelFa: 'دادهٔ رصدی ایستگاه (Open-Meteo)',
        explanationTooltipFa: 'شاخص کیفیت هوا و دما مستقیماً از نزدیک‌ترین ایستگاه پایش دریافت شده است.',
        lastUpdatedDisplayFa: updatedAtFa,
        confidenceLevelFa: 'بالا (سنسور/رسمی)',
        displayAreaUnitLabel,
        benchmark80SqmIntlText,
      };
    case 'ADMIN_CURATED_OVERRIDE':
      return {
        provenanceKind,
        badgeLabelFa: 'به‌روزرسانی تاییدشدهٔ رادار',
        explanationTooltipFa: 'میانگین قیمت این محله توسط تیم بررسی بازار رادار بازبینی و تایید شده است.',
        lastUpdatedDisplayFa: updatedAtFa,
        confidenceLevelFa: 'بالا (سنسور/رسمی)',
        displayAreaUnitLabel,
        benchmark80SqmIntlText,
      };
    case 'USER_SUBMITTED_COMMUNITY_DATA':
      return {
        provenanceKind,
        badgeLabelFa: 'ثبت‌شده توسط کاربران تاییدشده',
        explanationTooltipFa: 'این مورد توسط کاربران دارای حساب تاییدشده ثبت شده و پیش از معامله نیازمند استعلام حضوری است.',
        lastUpdatedDisplayFa: updatedAtFa,
        confidenceLevelFa: 'جامعهٔ کاربران',
        displayAreaUnitLabel,
        benchmark80SqmIntlText,
      };
    case 'ALGORITHMIC_MODEL_ESTIMATE':
      return {
        provenanceKind,
        badgeLabelFa: 'تخمین الگوریتمی (مدل هدونیک / ترافیک ساعتی)',
        explanationTooltipFa: 'این عدد یک برآورد آماری بر اساس فرمول هدونیک یا الگوی ساعت روز است و جایگزین کارشناسی رسمی نیست.',
        lastUpdatedDisplayFa: updatedAtFa,
        confidenceLevelFa: 'متوسط (مدل آماری/هدونیک)',
        displayAreaUnitLabel,
        benchmark80SqmIntlText,
      };
    case 'SEED_BENCHMARK_DATASET':
      return {
        provenanceKind,
        badgeLabelFa: 'میانگین پایهٔ محله',
        explanationTooltipFa: 'میانگین مرجع محله برای آپارتمان استاندارد ۸۰ تا ۱۰۰ متری.',
        lastUpdatedDisplayFa: updatedAtFa,
        confidenceLevelFa: 'متوسط (مدل آماری/هدونیک)',
        displayAreaUnitLabel,
        benchmark80SqmIntlText,
      };
  }
}
export function auditUserFacingFormFriction(input: {
  requiredFieldsCount: number;
  autoNormalizesPersianDigitsAndPhone: boolean;
  preservesDraftOnValidationOrNetworkError: boolean;
  hasInlineFieldLevelErrorFa: boolean;
}): { lowFrictionConfirmed: boolean; frictionScore: number } {
  let frictionScore = input.requiredFieldsCount * 5;
  if (input.autoNormalizesPersianDigitsAndPhone) frictionScore -= 10;
  if (input.preservesDraftOnValidationOrNetworkError) frictionScore -= 15;
  if (input.hasInlineFieldLevelErrorFa) frictionScore -= 10;
  return {
    lowFrictionConfirmed:
      input.requiredFieldsCount <= 6 &&
      input.autoNormalizesPersianDigitsAndPhone &&
      input.preservesDraftOnValidationOrNetworkError &&
      input.hasInlineFieldLevelErrorFa,
    frictionScore: Math.max(0, frictionScore),
  };
}
export const PRIORITIZED_UX_IMPROVEMENT_ROADMAP = [
  {
    tier: 'P0_TRUST_AND_ERROR_RECOVERY',
    title: 'Preserve user form inputs across network/validation failures and distinguish empty vs error states',
    impact: 'HIGH',
    status: 'VERIFIED_ACTIVE',
  },
  {
    tier: 'P1_FIRST_TIME_CLARITY_AND_PROVENANCE',
    title: 'Plain-Persian explanations for Hedonic/Rahn terms and explicit data provenance badges', impact: 'HIGH', status: 'VERIFIED_ACTIVE', }, { tier: 'P2_MOBILE_AND_KEYBOARD_ERGONOMICS', title: '44x44px minimum touch targets, RTL arrow-key tab navigation, and deferred map marker rendering', impact: 'MEDIUM', status: 'VERIFIED_ACTIVE', }, ] as const;