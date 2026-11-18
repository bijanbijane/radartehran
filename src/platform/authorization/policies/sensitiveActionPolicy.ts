/**
 * @file src/platform/authorization/policies/sensitiveActionPolicy.ts
 * @description Step-up verification, explicit confirmation & HTTP/Error status resolution matrix (401/403/404/409/423/429/5xx).
 */

import type { AccessErrorResolution, AccessHttpErrorCategory } from '../core/AccessDecision';

export interface ResolveAccessErrorInput {
  statusCode?: number;
  errorCode?: string;
  maskForbiddenAsNotFound?: boolean;
}

export function resolveAccessErrorStatus(input: ResolveAccessErrorInput): AccessErrorResolution {
  const code = input.statusCode ?? 500;
  const errCode = (input.errorCode || '').toUpperCase();

  if (errCode === 'FEATURE_DISABLED') {
    return {
      category: 'FEATURE_DISABLED',
      statusCode: 403,
      titleFa: 'قابلیت غیرفعال است',
      messageFa: 'این قابلیت در حال حاضر در پیکربندی سامانه فعال نیست.',
      retryable: false,
      requiresReauth: false,
      requiresPermissionRefresh: false,
      ctaLabelFa: 'بازگشت به داشبورد',
    };
  }

  if (errCode === 'STEP_UP_REQUIRED' || errCode === 'VERIFICATION_REQUIRED') {
    return {
      category: 'VERIFICATION_REQUIRED',
      statusCode: 403,
      titleFa: 'نیازمند تأیید هویت مجدد',
      messageFa: 'برای انجام این عملیات حساس، لطفاً هویت خود را مجدداً تأیید کنید.',
      retryable: true,
      requiresReauth: true,
      requiresPermissionRefresh: false,
      ctaLabelFa: 'تأیید هویت مجدد',
    };
  }

  if (code === 401) {
    return {
      category: 'AUTH_REQUIRED_401',
      statusCode: 401,
      titleFa: 'نشست کاربری منقضی شده است',
      messageFa: 'برای ادامه کار و حفظ اطلاعات فعلی، دوباره وارد حساب کاربری خود شوید.',
      retryable: true,
      requiresReauth: true,
      requiresPermissionRefresh: true,
      ctaLabelFa: 'ورود مجدد',
    };
  }

  if (code === 403) {
    if (input.maskForbiddenAsNotFound) {
      return {
        category: 'NOT_FOUND_OR_MASKED_404',
        statusCode: 404,
        titleFa: 'مورد درخواستی یافت نشد',
        messageFa: 'پرونده یا صفحه مورد نظر وجود ندارد یا در دسترس نیست.',
        retryable: false,
        requiresReauth: false,
        requiresPermissionRefresh: false,
        ctaLabelFa: 'بازگشت به فهرست',
      };
    }
    return {
      category: 'FORBIDDEN_403',
      statusCode: 403,
      titleFa: 'محدودیت سطح دسترسی',
      messageFa: 'نقش یا فضای کاری فعلی شما مجوز انجام این عملیات را ندارد.',
      retryable: false,
      requiresReauth: false,
      requiresPermissionRefresh: true,
      ctaLabelFa: 'بررسی سطح دسترسی',
    };
  }

  if (code === 404) {
    return {
      category: 'NOT_FOUND_OR_MASKED_404',
      statusCode: 404,
      titleFa: 'مورد درخواستی یافت نشد',
      messageFa: 'اطلاعات مورد نظر حذف شده یا نشانی آن تغییر کرده است.',
      retryable: false,
      requiresReauth: false,
      requiresPermissionRefresh: false,
      ctaLabelFa: 'بازگشت',
    };
  }

  if (code === 409) {
    return {
      category: 'VERSION_CONFLICT_409',
      statusCode: 409,
      titleFa: 'تداخل نسخه مجوزها یا داده‌ها',
      messageFa: 'مجوزها یا اطلاعات این بخش توسط مدیر دیگری تغییر کرده است. در حال همگام‌سازی مجدد...',
      retryable: true,
      requiresReauth: false,
      requiresPermissionRefresh: true,
      ctaLabelFa: 'بارگذاری مجدد مجوزها',
    };
  }

  if (code === 423) {
    return {
      category: 'ACCOUNT_OR_RESOURCE_LOCKED_423',
      statusCode: 423,
      titleFa: 'حساب یا پرونده قفل شده است',
      messageFa: 'این مورد به دلایل امنیتی یا بررسی مدیریتی موقتاً قفل شده است.',
      retryable: false,
      requiresReauth: false,
      requiresPermissionRefresh: true,
      ctaLabelFa: 'ارتباط با پشتیبانی',
    };
  }

  if (code === 429) {
    return {
      category: 'RATE_LIMITED_429',
      statusCode: 429,
      titleFa: 'تعداد درخواست‌ها بیش از حد مجاز است',
      messageFa: 'لطفاً چند لحظه صبر کنید و سپس دوباره تلاش نمایید.',
      retryable: true,
      requiresReauth: false,
      requiresPermissionRefresh: false,
      ctaLabelFa: 'تلاش مجدد پس از مکث',
    };
  }

  return {
    category: 'SERVER_ERROR_5XX' as AccessHttpErrorCategory,
    statusCode: code >= 500 ? code : 500,
    titleFa: 'خطای موقت در سرویس کنترل دسترسی',
    messageFa: 'پاسخ معتبری از سرور دریافت نشد. عملیات تغییردهنده تا تأیید مجدد متوقف شد.',
    retryable: true,
    requiresReauth: false,
    requiresPermissionRefresh: false,
    ctaLabelFa: 'تلاش مجدد',
  };
}
