/** @file src/features/onboarding/types/onboardingStageTabs.ts — Stage Tabs Registry for Help Center */
export type OnboardingHelpStageTabId =
  | 'rt_fe_arch_001'
  | 'rt_fe_ia_002'
  | 'rt_fe_shell_003'
  | 'rt_fe_ds_004'
  | 'rt_fe_sc_005'
  | 'rt_fe_layout_006'
  | 'rt_fe_ia_nav_007'
  | 'rt_fe_vds_008'
  | 'rt_fe_ids_009'
  | 'rt_fe_ia_011'
  | 'rt_fe_fda_012'
  | 'rt_fe_fpa_013'
  | 'rt_fe_feat_013'
  | 'rt_fe_nav_014'
  | 'rt_fe_page_015'
  | 'rt_fe_int_016'
  | 'rt_fe_form_017'
  | 'rt_fe_search_018'
  | 'rt_fe_results_019'
  | 'rt_fe_vis_020'
  | 'rt_fe_entity_021'
  | 'rt_fe_engagement_022'
  | 'rt_fe_notification_023'
  | 'rt_fe_account_024'
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
  | 'stage75'
  | 'stage77'
  | 'stage78'
  | 'stage79'
  | 'stage80'
  | 'stage81'
  | 'stage82'
  | 'stage83'
  | 'stage84';

export const ONBOARDING_STAGE_TABS: ReadonlyArray<{
  id: OnboardingHelpStageTabId;
  testId: string;
  labelFa: string;
}> = [
  { id: 'rt_fe_arch_001', testId: 'switch-rt-fe-arch-001-tab', labelFa: 'نقشه راه ۱/۲۸: معماری ماژولار (RT-FE-ARCH-001)' },
  { id: 'rt_fe_ia_002', testId: 'switch-rt-fe-ia-002-tab', labelFa: 'نقشه راه ۲/۲۸: معماری اطلاعات، مسیریابی و Cloudflare (RT-FE-IA-002)' },
  { id: 'rt_fe_shell_003', testId: 'switch-rt-fe-shell-003-tab', labelFa: 'نقشه راه ۳/۲۸: پوسته اصلی، Layoutها و ناوبری (RT-FE-SHELL-003)' },
  { id: 'rt_fe_ds_004', testId: 'switch-rt-fe-ds-004-tab', labelFa: 'نقشه راه ۴/۲۸: سیستم طراحی بصری و توکن‌ها (RT-FE-DESIGN-SYSTEM-004)' },
  { id: 'rt_fe_sc_005', testId: 'switch-rt-fe-sc-005-tab', labelFa: 'نقشه راه ۵/۲۸: کتابخانه کامپوننت‌های مشترک (RT-FE-SHARED-COMPONENTS-005)' },
  { id: 'rt_fe_layout_006', testId: 'switch-rt-fe-layout-006-tab', labelFa: 'نقشه راه ۶/۲۸: سیستم Layout، Page Shell و الگوهای فضایی (RT-FE-LAYOUT-006)' },
  { id: 'rt_fe_ia_nav_007', testId: 'switch-rt-fe-ia-nav-007-tab', labelFa: 'نقشه راه ۷/۲۸: معماری اطلاعات، موجودیت‌ها و نقشه سایت (RT-FE-IA-007)' },
  { id: 'rt_fe_vds_008', testId: 'switch-rt-fe-vds-008-tab', labelFa: 'نقشه راه ۸/۲۸: سیستم طراحی بصری، تراکم و زبان نقشه/نمودار (RT-FE-VDS-008)' },
  { id: 'rt_fe_ids_009', testId: 'switch-rt-fe-ids-009-tab', labelFa: 'نقشه راه ۹/۲۸: نظام تعامل و رفتار رابط کاربری (RT-FE-IDS-009)' },
  { id: 'rt_fe_ia_011', testId: 'switch-rt-fe-ia-011-tab', labelFa: 'نقشه راه ۱۰ و ۱۱/۲۸: الگوهای صفحات و معماری محتوا (RT-FE-IA-011)' },
  { id: 'rt_fe_fda_012', testId: 'switch-rt-fe-fda-012-tab', labelFa: 'نقشه راه ۱۲/۲۸: معماری داده فرانت‌اند و مدیریت وضعیت (RT-FE-DATA-012)' },
  { id: 'rt_fe_fpa_013', testId: 'switch-rt-fe-fpa-013-tab', labelFa: 'نقشه راه ۱۳/۲۸: معماری عملکرد و بهینه‌سازی فرانت‌اند (RT-FE-FPA-013)' },
  { id: 'rt_fe_feat_013', testId: 'switch-rt-fe-feat-013-tab', labelFa: 'نقشه راه ۱۳ب/۲۸: نظام ماژول‌بندی و قابلیت‌ها (RT-FE-FEATURE-013)' },
  { id: 'rt_fe_nav_014', testId: 'switch-rt-fe-nav-014-tab', labelFa: 'نقشه راه ۱۴/۲۸: نظام ناوبری، کشف و فضای کاری (RT-FE-NAV-014)' },
  { id: 'rt_fe_page_015', testId: 'switch-rt-fe-page-015-tab', labelFa: 'نقشه راه ۱۵/۲۸: ترکیب صفحات، Layoutها و نواحی محتوایی (RT-FE-PAGE-015)' },
  { id: 'rt_fe_int_016', testId: 'switch-rt-fe-int-016-tab', labelFa: 'نقشه راه ۱۶/۲۸: الگوهای تعامل، رفتار کنترل‌ها و ریزتعامل (RT-FE-INT-016)' },
  { id: 'rt_fe_form_017', testId: 'switch-rt-fe-form-017-tab', labelFa: 'نقشه راه ۱۷/۲۸: نظام فرم‌ها، اعتبارسنجی و گردش‌کار (RT-FE-FORM-017)' },
  { id: 'rt_fe_search_018', testId: 'switch-rt-fe-search-018-tab', labelFa: 'نقشه راه ۱۸/۲۸: جست‌وجو، فیلترگذاری و Query Builder (RT-FE-SEARCH-018)' },
  { id: 'rt_fe_results_019', testId: 'switch-rt-fe-results-019-tab', labelFa: 'نقشه راه ۱۹/۲۸: نمایش نتایج، جدول‌ها و مقایسه (RT-FE-RESULTS-019)' },
  { id: 'rt_fe_vis_020', testId: 'switch-rt-fe-vis-020-tab', labelFa: 'نقشه راه ۲۰/۲۸: بصری‌سازی داده، نمودارها و داشبوردها (RT-FE-VIS-020)' },
  { id: 'rt_fe_entity_021', testId: 'switch-rt-fe-entity-021-tab', labelFa: 'نقشه راه ۲۱/۲۸: صفحات جزئیات موجودیت، ملک، ساختمان و محله (RT-FE-ENTITY-DETAIL-021)' },
  { id: 'rt_fe_engagement_022', testId: 'switch-rt-fe-engagement-022-tab', labelFa: 'نقشه راه ۲۲/۲۸: علاقه‌مندی‌ها، دنبال‌کردن، مجموعه‌ها و پایش تغییرات (RT-FE-ENGAGEMENT-022)' },
  { id: 'rt_fe_notification_023', testId: 'switch-rt-fe-notification-023-tab', labelFa: 'نقشه راه ۲۳/۲۸: مرکز اعلان‌ها، ارتباطات چندکاناله و ترجیحات (RT-FE-NOTIFICATION-023)' },
  { id: 'rt_fe_account_024', testId: 'switch-rt-fe-account-024-tab', labelFa: 'نقشه راه ۲۴/۲۸: حساب کاربری، پروفایل، هویت دیجیتال و اطلاعات شخصی (RT-FE-USER-ACCOUNT-024)' },
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
  { id: 'stage77', testId: 'switch-stage-77-tab', labelFa: 'مرحله ۷۷: تحلیل عرضه مسکن استیجاری، بازار اجاره و فشار هزینه' },
  { id: 'stage78', testId: 'switch-stage-78-tab', labelFa: 'مرحله ۷۸: تحلیل بازار خرید و فروش، نقدشوندگی و پویایی معاملات' },
  { id: 'stage79', testId: 'switch-stage-79-tab', labelFa: 'مرحله ۷۹: تحلیل سرمایه‌گذاری ملکی، فرصت‌یابی مکانی و پروژه‌ها' },
  { id: 'stage80', testId: 'switch-stage-80-tab', labelFa: 'مرحله ۸۰: تحلیل اقتصاد ساخت‌وساز، پایش هزینه‌ها و توسعه بنا' },
  { id: 'stage81', testId: 'switch-stage-81-tab', labelFa: 'مرحله ۸۱: تحلیل بازار زمین شهری، مالکیت، کاربری و اقتصاد زمین' },
  { id: 'stage82', testId: 'switch-stage-82-tab', labelFa: 'مرحله ۸۲: تحلیل توسعه شهری، بازآفرینی بافت‌ها و نوسازی محله‌ها' },
  { id: 'stage83', testId: 'switch-stage-83-tab', labelFa: 'مرحله ۸۳: تحلیل سرمایه‌گذاری شهری، تأمین مالی و مشارکت PPP' },
  { id: 'stage84', testId: 'switch-stage-84-tab', labelFa: 'مرحله ۸۴: تحلیل اقتصاد کلان شهری، چرخه‌ها و اثر بر بازار املاک' },
];
