/**
 * @file src/platform/authorization/catalog/resourceRegistry.ts
 * @description Canonical 12 Resource Groups (RES-001..RES-012) for Stage 25 (RT-FE-USER-ACCESS-CONTROL-025).
 */

import type { PermissionAction, PermissionResourceGroup, PermissionScope } from '../core/Permission';

export interface ResourceGroupDefinition {
  id: string;
  resource: PermissionResourceGroup;
  titleFa: string;
  descriptionFa: string;
  supportedActions: PermissionAction[];
  supportedScopes: PermissionScope[];
  supportsOwnership: boolean;
  supportsWorkspaceBoundary: boolean;
}

export const RESOURCE_GROUP_REGISTRY: readonly ResourceGroupDefinition[] = [
  {
    id: 'RES-001',
    resource: 'property',
    titleFa: 'ملک و پروفایل ساختمان',
    descriptionFa: 'اطلاعات پایه ملک، پرونده فنی ساختمان و سوابق مالکیت',
    supportedActions: ['read', 'create', 'update', 'delete', 'verify', 'export'],
    supportedScopes: ['own', 'assigned', 'workspace', 'city', 'global'],
    supportsOwnership: true,
    supportsWorkspaceBoundary: true,
  },
  {
    id: 'RES-002',
    resource: 'listing',
    titleFa: 'آگهی‌های فروش و اجاره',
    descriptionFa: 'مدیریت پیش‌نویس، انتشار، بایگانی و اعتبارسنجی آگهی‌های ملکی',
    supportedActions: ['read', 'create', 'update', 'delete', 'publish', 'archive', 'verify', 'approve', 'reject'],
    supportedScopes: ['own', 'assigned', 'agency', 'workspace', 'city', 'global'],
    supportsOwnership: true,
    supportsWorkspaceBoundary: true,
  },
  {
    id: 'RES-003',
    resource: 'neighborhood',
    titleFa: 'محله‌ها و پروفایل مکانی',
    descriptionFa: 'داده‌های محله، شاخص‌های کیفیت زندگی، نظرات ساکنان و اسپانسرینگ محله',
    supportedActions: ['read', 'update', 'verify', 'manage', 'export'],
    supportedScopes: ['city', 'workspace', 'global'],
    supportsOwnership: false,
    supportsWorkspaceBoundary: true,
  },
  {
    id: 'RES-004',
    resource: 'market',
    titleFa: 'تحلیل بازار و شاخص‌های کلان',
    descriptionFa: 'نبض بازار، روندهای قیمتی، داده‌های معاملاتی و گزارش‌های تحلیلی',
    supportedActions: ['read', 'create', 'update', 'export', 'manage'],
    supportedScopes: ['workspace', 'city', 'global'],
    supportsOwnership: false,
    supportsWorkspaceBoundary: true,
  },
  {
    id: 'RES-005',
    resource: 'valuation',
    titleFa: 'ارزش‌گذاری هدونیک و کارشناسی',
    descriptionFa: 'موتور قیمت‌گذاری هدونیک، شبیه‌ساز مذاکره و گواهی برآورد قیمت',
    supportedActions: ['read', 'create', 'update', 'approve', 'export'],
    supportedScopes: ['own', 'assigned', 'workspace', 'global'],
    supportsOwnership: true,
    supportsWorkspaceBoundary: true,
  },
  {
    id: 'RES-006',
    resource: 'service',
    titleFa: 'خدمات ملکی، حقوقی و جابه‌جایی',
    descriptionFa: 'درخواست‌های کارشناسی، مشاوره قراردادی، بازسازی و اسباب‌کشی',
    supportedActions: ['read', 'create', 'update', 'delete', 'assign', 'approve'],
    supportedScopes: ['own', 'assigned', 'provider', 'workspace', 'global'],
    supportsOwnership: true,
    supportsWorkspaceBoundary: true,
  },
  {
    id: 'RES-007',
    resource: 'provider',
    titleFa: 'پنل ارائه‌دهندگان خدمات و پیمانکاران',
    descriptionFa: 'مدیریت ظرفیت، تعرفه‌ها، سفارش‌های ارجاع‌شده و تسویه‌حساب ارائه‌دهندگان',
    supportedActions: ['read', 'create', 'update', 'verify', 'manage', 'export'],
    supportedScopes: ['own', 'provider', 'workspace', 'global'],
    supportsOwnership: true,
    supportsWorkspaceBoundary: true,
  },
  {
    id: 'RES-008',
    resource: 'community',
    titleFa: 'مشارکت محلی و دیدگاه‌های شهروندان',
    descriptionFa: 'ثبت تجربه سکونت، رأی‌دهی محله‌ای، گزارش شکارها و ادعاهای میدانی',
    supportedActions: ['read', 'create', 'update', 'delete', 'verify'],
    supportedScopes: ['own', 'city', 'global'],
    supportsOwnership: true,
    supportsWorkspaceBoundary: false,
  },
  {
    id: 'RES-009',
    resource: 'moderation',
    titleFa: 'پایش، ممیزی و رسیدگی به گزارش‌ها',
    descriptionFa: 'بررسی آگهی‌های مشکوک، تایید یا رد محتوا و مدیریت صف بررسی',
    supportedActions: ['read', 'verify', 'approve', 'reject', 'assign', 'manage'],
    supportedScopes: ['assigned', 'city', 'global'],
    supportsOwnership: false,
    supportsWorkspaceBoundary: true,
  },
  {
    id: 'RES-010',
    resource: 'user',
    titleFa: 'حساب کاربری، نشست‌ها و حریم خصوصی',
    descriptionFa: 'پروفایل شخصی، هشدارهای خریدار، خروجی داده GDPR و نشست‌های فعال',
    supportedActions: ['read', 'update', 'delete', 'export', 'manage'],
    supportedScopes: ['own', 'global'],
    supportsOwnership: true,
    supportsWorkspaceBoundary: false,
  },
  {
    id: 'RES-011',
    resource: 'workspace',
    titleFa: 'فضای کاری، آژانس و مدیریت تیم',
    descriptionFa: 'اعضای تیم، دعوت‌نامه‌ها، تخصیص نقش سازمانی و تفکیک محیط کاری',
    supportedActions: ['read', 'create', 'update', 'delete', 'assign', 'manage', 'export'],
    supportedScopes: ['own', 'agency', 'provider', 'workspace', 'global'],
    supportsOwnership: true,
    supportsWorkspaceBoundary: true,
  },
  {
    id: 'RES-012',
    resource: 'admin',
    titleFa: 'حاکمیت سامانه، امنیت و پیکربندی کلان',
    descriptionFa: 'تنظیمات محیطی، پشتیبان‌گیری، ممیزی امنیتی و مشاهده پشتیبانی (Impersonation)',
    supportedActions: ['read', 'update', 'manage', 'export', 'impersonate'],
    supportedScopes: ['global'],
    supportsOwnership: false,
    supportsWorkspaceBoundary: false,
  },
] as const;

export const RESOURCE_GROUP_BY_NAME: ReadonlyMap<PermissionResourceGroup, ResourceGroupDefinition> = new Map(
  RESOURCE_GROUP_REGISTRY.map((item) => [item.resource, item])
);
