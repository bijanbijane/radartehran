/** @file src/platform/error-handling/errorCodes.ts — Canonical Error Codes & Persian User Messages */
import type { FrontendErrorCategory } from './errorTypes';

export const ERROR_USER_MESSAGES_FA: Record<FrontendErrorCategory, string> = {
  NETWORK_OFFLINE: 'اتصال اینترنت برقرار نیست؛ داده‌های کش محلی نمایش داده می‌شوند.',
  REQUEST_TIMEOUT: 'پاسخ سرور بیش از حد انتظار طول کشید؛ لطفاً دوباره تلاش کنید.',
  UNAUTHORIZED_401: 'نشست کاربری منقضی شده است؛ در حال بازیابی نشست یا هدایت به ورود مجدد.',
  FORBIDDEN_403: 'شما مجوز دسترسی به این بخش یا انجام این عملیات را ندارید.',
  NOT_FOUND_404: 'منبع یا مسیر درخواستی یافت نشد.',
  RESOURCE_LOCKED_423: 'این منبع در حال حاضر قفل است و امکان تغییر آن وجود ندارد.',
  RATE_LIMITED_429: 'تعداد درخواست‌ها بیش از حد مجاز است؛ لطفاً چند لحظه صبر کنید.',
  SERVER_ERROR_5XX: 'سرویس با خطای موقت مواجه شد؛ امکان تلاش مجدد وجود دارد.',
  FEATURE_DISABLED: 'این قابلیت در حال حاضر در پیکربندی سامانه غیرفعال است.',
  VALIDATION_ERROR: 'اطلاعات واردشده معتبر نیست؛ لطفاً فیلدها را بررسی کنید.',
  STORAGE_QUOTA: 'فضای ذخیره‌سازی مرورگر پر شده است؛ داده‌های موقت پاک‌سازی شدند.',
  CHUNK_LOAD_ERROR: 'نسخه جدیدی از برنامه منتشر شده است؛ صفحه را تازه‌سازی کنید.',
  UNKNOWN_ERROR: 'خطای غیرمنتظره‌ای رخ داد؛ لطفاً دوباره تلاش کنید.',
};
