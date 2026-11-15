/** @file src/features/onboarding/types/onboardingStageTabs.ts — Stage Tabs Registry for Help Center */
export type OnboardingHelpStageTabId =
  | 'stage32'
  | 'stage33'
  | 'stage34'
  | 'stage35'
  | 'stage36'
  | 'stage37'
  | 'stage38'
  | 'stage39'
  | 'stage40'
  | 'stage41'
  | 'stage42'
  | 'stage43'
  | 'stage44'
  | 'stage45'
  | 'stage46'
  | 'stage47'
  | 'stage48'
  | 'stage49'
  | 'stage50'
  | 'stage51'
  | 'stage52'
  | 'stage53'
  | 'stage54'
  | 'stage55'
  | 'stage56'
  | 'stage57'
  | 'stage58'
  | 'stage59'
  | 'stage60'
  | 'stage61'
  | 'stage63'
  | 'stage64'
  | 'stage65'
  | 'stage66'
  | 'stage67'
  | 'stage68'
  | 'stage69'
  | 'stage70'
  | 'stage71'
  | 'stage72'
  | 'stage73'
  | 'stage74'
  | 'stage75';

export const ONBOARDING_STAGE_TABS: ReadonlyArray<{
  id: OnboardingHelpStageTabId;
  testId: string;
  labelFa: string;
}> = [
  { id: 'stage32', testId: 'switch-stage-32-tab', labelFa: 'مرحله ۳۲: راهنما و ورود' },
  { id: 'stage33', testId: 'switch-stage-33-tab', labelFa: 'مرحله ۳۳: واکنش‌گرایی' },
  { id: 'stage34', testId: 'switch-stage-34-tab', labelFa: 'مرحله ۳۴: دسترس‌پذیری (AA)' },
  { id: 'stage35', testId: 'switch-stage-35-tab', labelFa: 'مرحله ۳۵: سیستم حرکت (Motion Lab)' },
  { id: 'stage36', testId: 'switch-stage-36-tab', labelFa: 'مرحله ۳۶: نمایش داده و نمودارها' },
  { id: 'stage37', testId: 'switch-stage-37-tab', labelFa: 'مرحله ۳۷: منشأ و اعتماد داده' },
  { id: 'stage38', testId: 'switch-stage-38-tab', labelFa: 'مرحله ۳۸: مقایسه و تصمیم‌سازی' },
  { id: 'stage39', testId: 'switch-stage-39-tab', labelFa: 'مرحله ۳۹: پایش و هشدارها' },
  { id: 'stage40', testId: 'switch-stage-40-tab', labelFa: 'مرحله ۴۰: گزارش‌ها و اسناد' },
  { id: 'stage41', testId: 'switch-stage-41-tab', labelFa: 'مرحله ۴۱: فضای همکاری' },
  { id: 'stage42', testId: 'switch-stage-42-tab', labelFa: 'مرحله ۴۲: اعتبار و تأیید هویت' },
  { id: 'stage43', testId: 'switch-stage-43-tab', labelFa: 'مرحله ۴۳: بازار خدمات و متخصصان' },
  { id: 'stage44', testId: 'switch-stage-44-tab', labelFa: 'مرحله ۴۴: توافق و شفافیت مالی' },
  { id: 'stage45', testId: 'switch-stage-45-tab', labelFa: 'مرحله ۴۵: مدیریت اجرا و تحویل' },
  { id: 'stage46', testId: 'switch-stage-46-tab', labelFa: 'مرحله ۴۶: کنترل کیفیت و اختلافات' },
  { id: 'stage47', testId: 'switch-stage-47-tab', labelFa: 'مرحله ۴۷: دانش حرفه‌ای و استانداردها' },
  { id: 'stage48', testId: 'switch-stage-48-tab', labelFa: 'مرحله ۴۸: ابزارهای تصمیم‌یار تعاملی' },
  { id: 'stage49', testId: 'switch-stage-49-tab', labelFa: 'مرحله ۴۹: پایش بازار و هشدارهای هوشمند' },
  { id: 'stage50', testId: 'switch-stage-50-tab', labelFa: 'مرحله ۵۰: گزارش‌های تحلیلی و روایت تغییرات' },
  { id: 'stage51', testId: 'switch-stage-51-tab', labelFa: 'مرحله ۵۱: تحلیل مکانی پیشرفته و هوشمندی جغرافیایی' },
  { id: 'stage52', testId: 'switch-stage-52-tab', labelFa: 'مرحله ۵۲: اطلس داده‌های شهری و لایه‌های مرجع' },
  { id: 'stage53', testId: 'switch-stage-53-tab', labelFa: 'مرحله ۵۳: پروژه‌های شهری و تحولات کالبدی شهر' },
  { id: 'stage54', testId: 'switch-stage-54-tab', labelFa: 'مرحله ۵۴: رصد ساختمان‌ها، بافت کالبدی و تغییرات ساخت‌وساز' },
  { id: 'stage55', testId: 'switch-stage-55-tab', labelFa: 'مرحله ۵۵: ضوابط شهرسازی، تراکم و انطباق پروژه‌ها' },
  { id: 'stage56', testId: 'switch-stage-56-tab', labelFa: 'مرحله ۵۶: زیرساخت‌های شهری، ظرفیت خدمات و دسترسی محله‌ها' },
  { id: 'stage57', testId: 'switch-stage-57-tab', labelFa: 'مرحله ۵۷: محیط‌زیست شهری، آلودگی، اقلیم و کیفیت زیست‌محیطی' },
  { id: 'stage58', testId: 'switch-stage-58-tab', labelFa: 'مرحله ۵۸: مخاطرات شهری، ایمنی مکانی و تاب‌آوری محله‌ها' },
  { id: 'stage59', testId: 'switch-stage-59-tab', labelFa: 'مرحله ۵۹: جمعیت، ساختار اجتماعی و پویایی سکونت شهری' },
  { id: 'stage60', testId: 'switch-stage-60-tab', labelFa: 'مرحله ۶۰: اقتصاد شهری، اشتغال، فعالیت‌های تجاری و پویایی محله‌ها' },
  { id: 'stage61', testId: 'switch-stage-61-tab', labelFa: 'مرحله ۶۱: کاربری زمین، ساختار عملکردی شهر و تحولات فضایی' },
  { id: 'stage63', testId: 'switch-stage-63-tab', labelFa: 'مرحله ۶۳: فضای عمومی، خیابان‌ها، منظر شهری و تجربه پیاده' },
  { id: 'stage64', testId: 'switch-stage-64-tab', labelFa: 'مرحله ۶۴: حمل‌ونقل شهری، الگوهای سفر و یکپارچگی شبکه تحرک' },
  { id: 'stage65', testId: 'switch-stage-65-tab', labelFa: 'مرحله ۶۵: مخاطرات شهری، تاب‌آوری مکانی و آسیب‌پذیری زیرساخت‌ها' },
  { id: 'stage66', testId: 'switch-stage-66-tab', labelFa: 'مرحله ۶۶: محیط‌زیست شهری، اکوسیستم طبیعی و پایداری مکانی' },
  { id: 'stage67', testId: 'switch-stage-67-tab', labelFa: 'مرحله ۶۷: تحلیل جمعیت، ساختار اجتماعی و پویایی‌های جمعیتی شهری' },
  { id: 'stage68', testId: 'switch-stage-68-tab', labelFa: 'مرحله ۶۸: اقتصاد شهری، فعالیت‌های اقتصادی و پویایی‌های تجاری' },
  { id: 'stage69', testId: 'switch-stage-69-tab', labelFa: 'مرحله ۶۹: تحلیل کاربری زمین، ساختار عملکردی شهر و سازگاری فضایی' },
  { id: 'stage70', testId: 'switch-stage-70-tab', labelFa: 'مرحله ۷۰: نظام تحلیل جمعیت، ساختار اجتماعی و پراکندگی سکونت' },
  { id: 'stage71', testId: 'switch-stage-71-tab', labelFa: 'مرحله ۷۱: تحلیل نابرابری‌های فضایی، عدالت شهری و محرومیت مکانی' },
  { id: 'stage72', testId: 'switch-stage-72-tab', labelFa: 'مرحله ۷۲: تحلیل اقتصاد مسکن خانوار، استطاعت‌پذیری خرید و اجاره' },
  { id: 'stage73', testId: 'switch-stage-73-tab', labelFa: 'مرحله ۷۳: تحلیل جابه‌جایی جمعیت، مهاجرت درون‌شهری و پویایی سکونت' },
  { id: 'stage74', testId: 'switch-stage-74-tab', labelFa: 'مرحله ۷۴: تحلیل تقاضای مسکن، ظرفیت عرضه و تعادل بازار محله' },
  { id: 'stage75', testId: 'switch-stage-75-tab', labelFa: 'مرحله ۷۵: تحلیل چرخه عمر ساختمان، کیفیت سازه‌ای و ریسک فرسودگی' },
];
