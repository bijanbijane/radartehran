/**
 * @file src/platform/authorization/catalog/permissionRegistry.ts
 * @description Canonical 66 Permissions across 12 Resource Groups in resource:action:scope format.
 */

import {
  isValidPermissionFormat,
  type CanonicalPermissionCode,
  type PermissionAction,
  type PermissionDefinition,
  type PermissionResourceGroup,
  type PermissionScope,
} from '../core/Permission';

function def(
  resource: PermissionResourceGroup,
  action: PermissionAction,
  scope: PermissionScope,
  titleFa: string,
  opts?: { sensitive?: boolean; requiresStepUp?: boolean; requiresConfirmation?: boolean }
): PermissionDefinition {
  const code = `${resource}:${action}:${scope}` as CanonicalPermissionCode;
  return {
    code,
    resource,
    action,
    scope,
    titleFa,
    descriptionFa: `${titleFa} (${code})`,
    sensitive: Boolean(opts?.sensitive),
    requiresStepUp: Boolean(opts?.requiresStepUp),
    requiresConfirmation: Boolean(opts?.requiresConfirmation),
  };
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  // RES-001: property (6)
  def('property', 'read', 'global', 'مشاهده اطلاعات عمومی املاک و ساختمان‌ها'),
  def('property', 'read', 'workspace', 'مشاهده پرونده املاک فضای کاری'),
  def('property', 'create', 'own', 'ثبت ملک جدید توسط مالک'),
  def('property', 'update', 'own', 'ویرایش مشخصات ملک شخصی'),
  def('property', 'delete', 'own', 'حذف پرونده ملک شخصی', { sensitive: true, requiresConfirmation: true }),
  def('property', 'verify', 'city', 'تأیید اصالت سند و مشخصات ملک در شهر'),

  // RES-002: listing (9)
  def('listing', 'read', 'global', 'مشاهده آگهی‌های عمومی بازار'),
  def('listing', 'create', 'own', 'ایجاد پیش‌نویس آگهی شخصی'),
  def('listing', 'create', 'agency', 'ثبت آگهی در کارتابل آژانس املاک'),
  def('listing', 'update', 'own', 'ویرایش آگهی شخصی'),
  def('listing', 'update', 'assigned', 'ویرایش آگهی‌های ارجاع‌شده به مشاور'),
  def('listing', 'publish', 'own', 'انتشار عمومی آگهی شخصی'),
  def('listing', 'publish', 'agency', 'انتشار آگهی تاییدشده آژانس'),
  def('listing', 'archive', 'own', 'بایگانی کردن آگهی شخصی'),
  def('listing', 'delete', 'agency', 'حذف آگهی از کارتابل آژانس', { sensitive: true, requiresConfirmation: true }),

  // RES-003: neighborhood (5)
  def('neighborhood', 'read', 'global', 'مشاهده پروفایل و شاخص‌های محله‌ها'),
  def('neighborhood', 'update', 'city', 'به‌روزرسانی شاخص‌های محلی شهر'),
  def('neighborhood', 'verify', 'city', 'تأیید داده‌های میدانی محله'),
  def('neighborhood', 'manage', 'workspace', 'مدیریت رزرو اسپانسرینگ محله در آژانس', { sensitive: true }),
  def('neighborhood', 'export', 'global', 'دریافت خروجی داده‌های مقایسه‌ای محله‌ها'),

  // RES-004: market (5)
  def('market', 'read', 'global', 'مشاهده نبض بازار و شاخص‌های کلان'),
  def('market', 'create', 'workspace', 'تولید گزارش تحلیلی اختصاصی بازار'),
  def('market', 'update', 'global', 'به‌روزرسانی پارامترهای موتور نبض بازار', { sensitive: true }),
  def('market', 'export', 'workspace', 'خروجی گرفتن از سری‌های زمانی بازار'),
  def('market', 'manage', 'global', 'مدیریت منابع داده و پایپ‌لاین بازار', { sensitive: true, requiresStepUp: true }),

  // RES-005: valuation (5)
  def('valuation', 'read', 'global', 'مشاهده برآورد قیمت هدونیک'),
  def('valuation', 'create', 'own', 'اجرای محاسبه ارزش‌گذاری هدونیک ملک'),
  def('valuation', 'update', 'assigned', 'اصلاح ضرایب کارشناسی پرونده ارجاع‌شده'),
  def('valuation', 'approve', 'workspace', 'تأیید نهایی گزارش کارشناسی قیمت در آژانس', { sensitive: true }),
  def('valuation', 'export', 'own', 'دریافت گواهی ارزش‌گذاری هدونیک'),

  // RES-006: service (6)
  def('service', 'read', 'global', 'مشاهده کاتالوگ خدمات ملکی و حقوقی'),
  def('service', 'create', 'own', 'ثبت سفارش خدمات ملکی یا کارشناسی'),
  def('service', 'update', 'own', 'ویرایش درخواست خدمات شخصی'),
  def('service', 'delete', 'own', 'لغو درخواست خدمات شخصی', { requiresConfirmation: true }),
  def('service', 'assign', 'provider', 'تخصیص کارشناس به سفارش خدمات'),
  def('service', 'approve', 'provider', 'تأیید تکمیل سفارش خدمات'),

  // RES-007: provider (5)
  def('provider', 'read', 'global', 'مشاهده فهرست ارائه‌دهندگان خدمات مجاز'),
  def('provider', 'read', 'provider', 'مشاهده داشبورد عملیاتی ارائه‌دهنده'),
  def('provider', 'update', 'provider', 'ویرایش تعرفه و ظرفیت ارائه‌دهنده خدمات'),
  def('provider', 'verify', 'global', 'اعتبارسنجی مدارک حرفه‌ای ارائه‌دهنده', { sensitive: true }),
  def('provider', 'export', 'provider', 'دریافت گزارش مالی و تسویه ارائه‌دهنده', { sensitive: true }),

  // RES-008: community (5)
  def('community', 'read', 'global', 'مشاهده نظرات ساکنان و ادعاهای محلی'),
  def('community', 'create', 'own', 'ثبت دیدگاه ساکنان و رأی محله‌ای'),
  def('community', 'update', 'own', 'ویرایش دیدگاه ثبت‌شده شخصی'),
  def('community', 'delete', 'own', 'حذف دیدگاه شخصی', { requiresConfirmation: true }),
  def('community', 'verify', 'city', 'تأیید صحت گزارش‌های مردمی محله'),

  // RES-009: moderation (6)
  def('moderation', 'read', 'assigned', 'مشاهده صف بررسی گزارش‌های ارجاع‌شده'),
  def('moderation', 'read', 'global', 'مشاهده کل صف ممیزی و تخلفات سامانه'),
  def('moderation', 'verify', 'assigned', 'بررسی اصالت آگهی یا گزارش مردمی'),
  def('moderation', 'approve', 'assigned', 'تأیید انتشار محتوای بررسی‌شده'),
  def('moderation', 'reject', 'assigned', 'رد محتوای متخلف یا جعلی', { requiresConfirmation: true }),
  def('moderation', 'manage', 'global', 'مدیریت قوانین ممیزی و مسدودسازی', { sensitive: true, requiresStepUp: true }),

  // RES-010: user (5)
  def('user', 'read', 'own', 'مشاهده پروفایل، نشست‌ها و هشدارهای شخصی'),
  def('user', 'update', 'own', 'ویرایش اطلاعات حساب و تنظیمات امنیتی شخصی'),
  def('user', 'export', 'own', 'دریافت آرشیو کامل اطلاعات شخصی (GDPR)', { sensitive: true, requiresStepUp: true }),
  def('user', 'delete', 'own', 'درخواست حذف کامل حساب کاربری', { sensitive: true, requiresStepUp: true, requiresConfirmation: true }),
  def('user', 'manage', 'global', 'مدیریت وضعیت حساب کاربران سامانه', { sensitive: true, requiresStepUp: true, requiresConfirmation: true }),

  // RES-011: workspace (6)
  def('workspace', 'read', 'workspace', 'مشاهده اطلاعات و اعضای فضای کاری فعال'),
  def('workspace', 'create', 'own', 'ایجاد فضای کاری یا آژانس جدید'),
  def('workspace', 'update', 'workspace', 'ویرایش تنظیمات فضای کاری'),
  def('workspace', 'assign', 'workspace', 'تغییر نقش و سطح دسترسی اعضای فضای کاری', { sensitive: true, requiresStepUp: true, requiresConfirmation: true }),
  def('workspace', 'delete', 'workspace', 'حذف عضو یا بستن فضای کاری', { sensitive: true, requiresStepUp: true, requiresConfirmation: true }),
  def('workspace', 'export', 'workspace', 'خروجی گزارش عملکرد و ممیزی فضای کاری', { sensitive: true }),

  // RES-012: admin (5)
  def('admin', 'read', 'global', 'مشاهده کنسول سلامت، ممیزی و وضعیت سامانه'),
  def('admin', 'update', 'global', 'تغییر تنظیمات زمان اجرا و متغیرهای عملیاتی', { sensitive: true, requiresStepUp: true, requiresConfirmation: true }),
  def('admin', 'manage', 'global', 'مدیریت کلان امنیت، پشتیبان‌گیری و نقش‌های سامانه', { sensitive: true, requiresStepUp: true, requiresConfirmation: true }),
  def('admin', 'export', 'global', 'دریافت لاگ‌های ممیزی و گزارش‌های امنیتی', { sensitive: true, requiresStepUp: true }),
  def('admin', 'impersonate', 'global', 'مشاهده سامانه از دید کاربر جهت پشتیبانی (فقط خواندنی)', { sensitive: true, requiresStepUp: true, requiresConfirmation: true }),
] as const;

export const ACCESS_PERMISSION_CATALOG = PERMISSION_CATALOG;

export const PERMISSION_REGISTRY_MAP: ReadonlyMap<CanonicalPermissionCode, PermissionDefinition> = new Map(
  PERMISSION_CATALOG.map((item) => [item.code, item])
);

export function verifyPermissionCatalogIntegrity(): {
  totalCount: number;
  duplicateCount: number;
  invalidFormatCount: number;
  valid: boolean;
} {
  const seen = new Set<string>();
  let duplicateCount = 0;
  let invalidFormatCount = 0;
  for (const item of PERMISSION_CATALOG) {
    if (seen.has(item.code)) duplicateCount++;
    seen.add(item.code);
    if (!isValidPermissionFormat(item.code)) invalidFormatCount++;
  }
  return {
    totalCount: PERMISSION_CATALOG.length,
    duplicateCount,
    invalidFormatCount,
    valid: PERMISSION_CATALOG.length >= 60 && duplicateCount === 0 && invalidFormatCount === 0,
  };
}
