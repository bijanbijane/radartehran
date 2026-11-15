/** @file src/features/onboarding/services/urbanMobilityTypes.ts — Stage 64 Types, 17 Sections, 12 Layers, UI-MOB-001..030 & Stage 65 Preview */

export type MobilityTemporalState =
  | 'وضعیت برنامه‌ریزی‌شده'
  | 'وضعیت مشاهده‌شده'
  | 'وضعیت تاریخی'
  | 'برآورد مدل'
  | 'وضعیت لحظه‌ای با منبع عملیاتی';

export type TransitNetworkChangeStatus =
  | 'شبکه فعلی'
  | 'تغییر فرضی'
  | 'طرح پیشنهادی'
  | 'طرح مصوب'
  | 'پروژه در حال اجرا'
  | 'تغییر اجراشده و مشاهده‌شده';

export interface MultimodalRouteOption {
  optionId: string;
  labelFa: string;
  inVehicleMinutes: number;
  walkMinutes: number;
  waitMinutes: number;
  transferWalkMinutes: number;
  transfersCount: number;
  rankingCriterionFa: 'کوتاه‌ترین زمان کل' | 'کمترین پیاده‌روی' | 'کمترین تعویض وسیله';
  isWheelchairFriendly: boolean;
}

export interface MobilityZoneProfile {
  zoneId: string;
  corridorOrHubNameFa: string;
  straightLineToStationMeters: number;
  realPedestrianWalkMinutes: number;
  stationAccessBarrierFa: string;
  nominalInterchangeNoteFa: string;
  operationalTransferNoteFa: string;
  scheduledHeadwayMinutes: number;
  observedHeadwayMinutes: number;
  temporalState: MobilityTemporalState;
  hasLiveTrafficSource: boolean;
  parkingTotalCapacity: number;
  hasLiveParkingOccupancy: boolean;
  freightGeometryOk: boolean;
  freightLegalPermitNoteFa: string;
  odAggregatedTripsCount: number;
  minOdAnonymityThreshold: number;
  networkScenarioStatus: TransitNetworkChangeStatus;
  routes: ReadonlyArray<MultimodalRouteOption>;
}

export const STAGE64_SECTIONS_17: ReadonlyArray<{ id: string; titleFa: string }> = [
  { id: '01', titleFa: 'نمای کلی تحرک شهری' },
  { id: '02', titleFa: 'شبکه معابر و حرکت خودرو' },
  { id: '03', titleFa: 'حمل‌ونقل عمومی' },
  { id: '04', titleFa: 'تحلیل مسیر چندوجهی' },
  { id: '05', titleFa: 'الگوهای سفر و جریان جمعیت' },
  { id: '06', titleFa: 'ترافیک و ازدحام' },
  { id: '07', titleFa: 'پیاده‌روی و دوچرخه' },
  { id: '08', titleFa: 'گره‌ها و مراکز تبادل سفر' },
  { id: '09', titleFa: 'پارکینگ و مدیریت حاشیه معبر' },
  { id: '10', titleFa: 'لجستیک و حمل‌ونقل بار' },
  { id: '11', titleFa: 'دسترسی به فرصت‌ها' },
  { id: '12', titleFa: 'تحلیل زمانی جابه‌جایی' },
  { id: '13', titleFa: 'تاب‌آوری شبکه تحرک' },
  { id: '14', titleFa: 'پروفایل تحرک محله و ملک' },
  { id: '15', titleFa: 'مقایسه مناطق و مسیرها' },
  { id: '16', titleFa: 'سناریوسازی حمل‌ونقل' },
  { id: '17', titleFa: 'گزارش و مستندات' },
];

export const STAGE64_MAP_LAYERS_12: ReadonlyArray<string> = [
  'شبکه معابر',
  'مترو',
  'اتوبوس',
  'تاکسی و خدمات مشابه',
  'پایانه‌ها',
  'مسیرهای پیاده',
  'مسیرهای دوچرخه',
  'وضعیت ترافیک',
  'گره‌های تبادل سفر',
  'محدوده‌های دسترسی زمانی',
  'نقاط گلوگاهی',
  'مسیرهای دارای محدودیت',
];

export const STAGE64_TEMPORAL_STATES_5: ReadonlyArray<MobilityTemporalState> = [
  'وضعیت برنامه‌ریزی‌شده',
  'وضعیت مشاهده‌شده',
  'وضعیت تاریخی',
  'برآورد مدل',
  'وضعیت لحظه‌ای با منبع عملیاتی',
];

const UI_MOB_LABELS: ReadonlyArray<string> = [
  'نمایش نمای کلی تحرک و حمل‌ونقل شهری',
  'تفکیک ۵ وضعیت زمانی (برنامه‌ای، مشاهده‌شده، تاریخی، مدل، لحظه‌ای معتبر)',
  'تفکیک فاصله مستقیم تا ایستگاه از زمان پیاده‌روی واقعی و موانع دسترسی',
  'نمایش عملکرد شبکه معابر با تعریف متنی وضعیت (نه رنگ قرمز/سبز صرف)',
  'نمایش مشخصات خطوط و ایستگاه‌های حمل‌ونقل عمومی',
  'تفکیک برنامه رسمی حرکت از سرفاصله مشاهده‌شده واقعی',
  'محاسبه مسیر چندوجهی با نمایش اجزای پیاده‌روی، حرکت، انتظار و انتقال',
  'ممنوعیت حذف پنهان زمان انتظار و انتقال از زمان کل سفر',
  'الزام درج معیار مرتب‌سازی در معرفی گزینه‌های مسیر چندوجهی',
  'حفظ حریم خصوصی مبدأ و مقصد مسیریابی بدون ساخت تاریخچه دائمی کاربر',
  'نمایش جریان تجمیعی مبدأ ـ مقصد با آستانه حداقل تعداد سفر',
  'ممانعت از ترکیب فیلترهای بازشناسایی‌کننده و داده قابل انتساب به خانوار',
  'نمایش ترافیک، گلوگاه‌ها و اثر انسداد بر شبکه واقعی معابر',
  'دریافت کیفیت پیاده‌رو از مرحله ۶۳ و اتصال با شبکه دوچرخه',
  'تفکیک اتصال اسمی گره تبادل از زمان و موانع انتقال عملیاتی',
  'تفکیک ظرفیت اعلام‌شده پارکینگ از اشغال لحظه‌ای (در نبود داده زنده)',
  'تفکیک مناسب‌بودن هندسی مسیر بار از مجوز قانونی و زمانی تردد',
  'محاسبه ایزوکرون دسترسی شبکه‌ای (۱۰ تا ۶۰ دقیقه) به اشتغال و خدمات',
  'تحلیل عدالت دسترسی همراه با تعداد فرصت‌های قابل دسترس (نه صرف زمان)',
  'مقایسه بازه‌های زمانی هم‌نوع و هشدار مقایسه روز کاری با تعطیل',
  'اجرای سناریوی اختلال مسیر متصل به مخاطرات مرحله ۵۸ بدون نقش فرماندهی بحران',
  'نمایش پروفایل تحرک محله و خلاصه دسترسی ملک متصل به روش محاسبه',
  'ممانعت از تغییر خودکار ارزش ملک صرفاً به دلیل نزدیکی به مترو یا بزرگراه',
  'مقایسه مناطق و مسیرها با دوره زمانی و روش محاسبه هم‌سنخ',
  'جداسازی خط پیشنهادی یا فرضی از خط فعال شبکه در نقشه و سناریو',
  'مدیریت داده قدیمی و حفظ هم‌زمان رکوردهای متعارض با دلیل انتخاب',
  'نمایش نماد ثابت وسیله نقلیه در کنار رنگ برای دسترس‌پذیری',
  'کنترل دسترسی مبتنی بر نقش برای داده‌های تفصیلی سفر',
  'طراحی ساده موبایل برای انتخاب مبدأ/مقصد و بازگشت بدون حذف مسیر',
  'ثبت رویدادهای ارزیابی تجربه کاربری در سطح محصول بدون ردیابی افراد',
];

export const STAGE64_ACCEPTANCE_TESTS_30: ReadonlyArray<{ id: string; checkFa: string }> = UI_MOB_LABELS.map(
  (checkFa, idx) => ({
    id: `UI-MOB-${String(idx + 1).padStart(3, '0')}`,
    checkFa,
  }),
);

export const STAGE64_UX_EVENTS_16: ReadonlyArray<string> = [
  'mobility_hub_opened',
  'origin_selected',
  'destination_selected',
  'travel_mode_changed',
  'multimodal_routing_executed',
  'alternative_route_viewed',
  'departure_time_changed',
  'station_details_viewed',
  'wait_transfer_time_inspected',
  'isochrone_accessibility_executed',
  'mobility_zones_compared',
  'od_flow_inspected',
  'traffic_bottleneck_inspected',
  'network_scenario_executed',
  'mobility_provenance_viewed',
  'mobility_report_exported',
];

export const STAGE65_REGENERATION_PREVIEW_AXES_16: ReadonlyArray<string> = [
  '۱. شناسایی و نمایش پروژه‌های توسعه شهری',
  '۲. تحلیل پروژه‌های عمرانی و زیرساختی',
  '۳. بررسی پروژه‌های نوسازی و بازآفرینی شهری',
  '۴. تحلیل محدوده‌های دارای اولویت مداخله شهری',
  '۵. بررسی پروژه‌های حمل‌ونقل و اثر آن‌ها بر دسترسی',
  '۶. تحلیل پروژه‌های خدمات عمومی، فضای سبز و امکانات شهری',
  '۷. بررسی تغییرات کالبدی ناشی از پروژه‌های توسعه‌ای',
  '۸. تحلیل وضعیت پیشرفت پروژه‌ها در طول زمان',
  '۹. تفکیک پروژه پیشنهادی، مصوب، در حال اجرا و تکمیل‌شده',
  '۱۰. بررسی ارتباط پروژه‌های شهری با تغییرات بازار املاک',
  '۱۱. تحلیل اثر پروژه‌ها بر کاربری زمین، جمعیت و اقتصاد محله',
  '۱۲. شناسایی محدوده‌های مستعد بازآفرینی و بهسازی',
  '۱۳. مقایسه پروژه‌ها و محدوده‌های توسعه‌ای',
  '۱۴. طراحی پروفایل پروژه عمرانی و توسعه شهری',
  '۱۵. طراحی نقشه فرصت‌ها، محدودیت‌ها و مداخلات مکانی',
  '۱۶. طراحی سناریوهای توسعه و گزارش اثرات مکانی',
];
