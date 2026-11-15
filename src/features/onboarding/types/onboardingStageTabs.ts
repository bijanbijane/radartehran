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
  | 'stage46';

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
];
