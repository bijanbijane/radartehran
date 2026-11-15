/** @file src/features/onboarding/services/urbanRiskStage65Types.ts — Stage 65 Types, 18 Sections, 13 Layers, 5 Resilience Dimensions & Stage 66 Preview */

export type Stage65RiskStatusKind =
  | 'خطر ثبت‌شده'
  | 'محدوده مستعد خطر'
  | 'محدوده دارای برآورد مدل'
  | 'حادثه تاریخی'
  | 'گزارش تأییدشده'
  | 'هشدار رسمی'
  | 'سناریوی فرضی';

export type Stage65BuildingInfoTier =
  | 'دارای ارزیابی تخصصی'
  | 'دارای اطلاعات کالبدی پایه'
  | 'دارای اطلاعات ناقص'
  | 'فاقد اطلاعات قابل اتکا'
  | 'دارای گزارش نیازمند بررسی';

export interface Stage65InfrastructureDependencyNode {
  sectorFa: 'برق' | 'آب' | 'گاز' | 'فاضلاب' | 'مخابرات' | 'درمان' | 'معابر';
  dependsOnFa: string;
  cascadeImpactNoteFa: string;
  isSensitivePublicRestricted: boolean;
}

export interface Stage65RiskResilienceProfile {
  zoneId: string;
  zoneNameFa: string;
  hazardLevelLabelFa: string;
  resilienceOverallLabelFa: string;
  hasMissingHazardZoneData: boolean;
  buildingYearBuilt: number;
  buildingInfoTier: Stage65BuildingInfoTier;
  subsidenceCumulativeMm: number;
  subsidenceRateMmPerYear: number;
  subsidenceUncertaintyNoteFa: string;
  floodScenarioRainMmPerHour: number;
  populationExposedCount: number | null;
  populationReferenceYearFa: string;
  normalRouteMinutes: number;
  blockedBridgeScenarioMinutes: number;
  openSpaceAreaSqm: number;
  openSpaceTheoreticalCapacity: number;
  isOpenSpaceFieldVerified: boolean;
  dataCoveragePercent: number;
  statusKind: Stage65RiskStatusKind;
  hasOfficialAlert: boolean;
  officialAlertAgencyFa: string | null;
  infraDependencies: ReadonlyArray<Stage65InfrastructureDependencyNode>;
}

export const STAGE65_SECTIONS_18: ReadonlyArray<{ id: string; titleFa: string }> = [
  { id: '01', titleFa: 'نمای کلی ریسک' },
  { id: '02', titleFa: 'زلزله' },
  { id: '03', titleFa: 'سیلاب' },
  { id: '04', titleFa: 'فرونشست زمین' },
  { id: '05', titleFa: 'رانش و ناپایداری زمین' },
  { id: '06', titleFa: 'مخاطرات اقلیمی' },
  { id: '07', titleFa: 'آلودگی و مخاطرات محیطی' },
  { id: '08', titleFa: 'آسیب‌پذیری ساختمان‌ها' },
  { id: '09', titleFa: 'زیرساخت‌های حیاتی' },
  { id: '10', titleFa: 'مواجهه جمعیتی' },
  { id: '11', titleFa: 'دسترسی اضطراری' },
  { id: '12', titleFa: 'ظرفیت امدادرسانی' },
  { id: '13', titleFa: 'فضاهای امن و باز' },
  { id: '14', titleFa: 'تاب‌آوری محله‌ها' },
  { id: '15', titleFa: 'هشدار و پایش' },
  { id: '16', titleFa: 'سناریوسازی' },
  { id: '17', titleFa: 'گزارش و مستندات' },
  { id: '18', titleFa: 'کیفیت و اعتبار داده' },
];

export const STAGE65_MAP_LAYERS_13: ReadonlyArray<string> = [
  'پهنه‌های خطر لرزه‌ای',
  'گسل‌ها و محدوده‌های مرتبط',
  'پهنه‌های سیلاب',
  'مسیرهای جریان رواناب',
  'محدوده‌های فرونشست',
  'مناطق مستعد رانش',
  'نقاط حادثه‌خیز ثبت‌شده',
  'ساختمان‌های ارزیابی‌شده',
  'زیرساخت‌های حیاتی',
  'مراکز درمانی و امدادی',
  'مسیرهای اضطراری',
  'فضاهای باز عمومی',
  'محدوده‌های دارای داده ناقص',
];

export const STAGE65_RESILIENCE_DIMENSIONS_5: ReadonlyArray<{ titleFa: string; scopeFa: string }> = [
  { titleFa: '۱. تاب‌آوری کالبدی', scopeFa: 'کیفیت ساختمان‌ها، وضعیت معابر، زیرساخت‌ها و فضاهای باز' },
  { titleFa: '۲. تاب‌آوری خدماتی', scopeFa: 'دسترسی به درمان، خدمات امدادی، خدمات عمومی و پشتیبانی شهری' },
  { titleFa: '۳. تاب‌آوری اجتماعی', scopeFa: 'دسترسی عمومی، توزیع امکانات و ظرفیت حمایت اجتماعی تجمیعی' },
  { titleFa: '۴. تاب‌آوری عملکردی', scopeFa: 'حفظ عملکرد شبکه‌ها، مسیرهای جایگزین و وابستگی متقابل زیرساخت‌ها' },
  { titleFa: '۵. تاب‌آوری محیطی', scopeFa: 'پوشش گیاهی، مدیریت رواناب، شرایط اقلیمی و کیفیت محیطی' },
];

const UI_RISK65_LABELS: ReadonlyArray<string> = [
  'نمایش مرکز هوشمندی مخاطرات و تاب‌آوری شهری (۱۸ بخش)',
  'تفکیک صریح مخاطره، مواجهه، آسیب‌پذیری و تاب‌آوری در تمام نماها',
  'نمایش مرزبندی رادار با سامانه‌های رسمی مدیریت بحران و فرماندهی عملیات',
  'تفکیک ۷ وضعیت (خطر ثبت‌شده، مستعد، برآورد مدل، حادثه تاریخی، گزارش تأییدشده، هشدار رسمی، سناریو)',
  'نمایش خطر زلزله و گسل‌ها همراه با هشدار عدم کفایت سال ساخت برای ناایمن خواندن بنا',
  'نمایش سیلاب و رواناب همراه با معرفی خروجی بارش به‌عنوان مدل سناریویی',
  'تفکیک مقدار نشست، نرخ سالانه فرونشست و عدم قطعیت InSAR',
  'نمایش پروفایل دامنه و مناطق فاقد داده کافی رانش زمین',
  'تحلیل هم‌زمانی موج گرما، تراکم، کمبود فضای سبز و آسیب‌پذیری تجمیعی',
  'نمایش محدودیت تحلیل آلودگی (لحاظ جهت باد و شرایط جوی فراتر از فاصله)',
  'ممانعت از برچسب‌گذاری «ناایمن» یا «غیرقابل سکونت» بدون ارزیابی سازه‌ای معتبر',
  'نمایش گراف وابستگی متقابل زیرساخت‌های حیاتی (برق ← آب/درمان/مخابرات)',
  'محدودسازی نمایش مختصات دقیق و جزئیات عملیاتی تجهیزات حساس در نمای عمومی',
  'نمایش جمعیت در معرض در سطح تجمیعی با ذکر سال مرجع و روش برآورد',
  'تحلیل دسترسی اضطراری و شبیه‌سازی انسداد مسیر/پل بدون ادعای زمان پاسخ واقعی',
  'نمایش شکاف خدماتی مراکز امدادی علاوه بر تعداد مراکز',
  'تفکیک ظرفیت نظری فضای باز عمومی از ظرفیت قطعی پذیرش بدون بررسی میدانی',
  'نگهداری وضعیت «-- / فاقد داده کافی» در کارت تاب‌آوری تا زمان تکمیل داده‌ها',
  'ممانعت از مقایسه نادرست امتیاز کلی محله‌ها هنگام نابرابری پوشش داده',
  'جداسازی بصری و مرجعی هشدار رسمی سازمان بحران از برآورد داخلی رادار',
  'تضمین اصل «نبود داده به معنی نبود خطر نیست» در تمام نقشه‌ها و شاخص‌ها',
  'انتشار شناسنامه شاخص ترکیبی (روش، ورودی، وزن و عدم قطعیت)',
  'ثبت رویدادهای ارزیابی محصول بدون ردیابی فردی یا موقعیت دائمی کاربران',
];

export const STAGE65_ACCEPTANCE_TESTS_23: ReadonlyArray<{ id: string; checkFa: string }> = UI_RISK65_LABELS.map(
  (checkFa, idx) => ({
    id: `UI-RISK65-${String(idx + 1).padStart(3, '0')}`,
    checkFa,
  }),
);

export const STAGE65_UX_EVENTS_12: ReadonlyArray<string> = [
  'risk_resilience_hub_opened',
  'risk_zone_selected',
  'hazard_type_selected',
  'risk_map_inspected',
  'building_vulnerability_viewed',
  'infrastructure_dependency_viewed',
  'emergency_route_disruption_checked',
  'neighborhood_resilience_compared',
  'hypothetical_risk_scenario_executed',
  'risk_data_provenance_viewed',
  'risk_report_exported',
  'official_crisis_alert_viewed',
];

export const STAGE66_ENVIRONMENT_PREVIEW_AXES_17: ReadonlyArray<string> = [
  '۱. تحلیل کیفیت هوا و توزیع مکانی آلاینده‌ها',
  '۲. بررسی پوشش گیاهی و سلامت اکوسیستم شهری',
  '۳. تحلیل درختان شهری و زیرساخت سبز',
  '۴. ارزیابی پیوستگی زیستگاهی و کریدورهای اکولوژیک',
  '۵. تحلیل کیفیت منابع آب و وضعیت آب‌های سطحی',
  '۶. بررسی نفوذپذیری زمین و سطوح غیرقابل نفوذ',
  '۷. تحلیل جزیره حرارتی شهری',
  '۸. بررسی وضعیت خاک و کیفیت محیط طبیعی',
  '۹. تحلیل توزیع فضاهای سبز در سطح محله‌ها',
  '۱۰. بررسی دسترسی عادلانه به خدمات اکوسیستمی',
  '۱۱. تحلیل مصرف منابع و فشار محیطی ناشی از توسعه شهری',
  '۱۲. بررسی تغییرات پوشش زمین و تخریب محیط طبیعی',
  '۱۳. تحلیل ارتباط توسعه ساختمانی با پایداری محیطی',
  '۱۴. طراحی شاخص‌های پایداری محیط‌زیستی محله‌ها',
  '۱۵. مقایسه مناطق از نظر کیفیت محیطی',
  '۱۶. طراحی سناریوهای توسعه سبز و احیای اکولوژیک',
  '۱۷. طراحی گزارش پایداری محیط‌زیستی و مستندات داده',
];
