/**
 * @file src/platform/authorization/guards/RouteAccessGuard.tsx
 * @description Canonical RouteAccessMeta Registry (100% coverage of all 55 roadmap routes) & RouteAccessGuard.
 */

import React from 'react';
import type { AccessContext, CanonicalBaseRole, ResourceTargetContext } from '../core/AccessContext';
import type { AccessDecision } from '../core/AccessDecision';
import type { CanonicalPermissionCode } from '../core/Permission';
import { evaluateAccessPolicy } from '../core/AccessPolicy';
import { useAccessController } from '../context/AccessContextProvider';

export interface RouteAccessMeta {
  routeId: string;
  pathPattern: string;
  titleFa: string;
  publicAccess: boolean;
  requiredPermission: CanonicalPermissionCode;
  allowedRoles?: CanonicalBaseRole[];
  requiresWorkspace?: boolean;
  requiresStepUp?: boolean;
  fallbackPath: string;
}

export const OFFICIAL_55_ROUTE_ACCESS_META: readonly RouteAccessMeta[] = [
  // 1..10: Public & Core Discovery Routes
  { routeId: 'RT-01', pathPattern: '/', titleFa: 'صفحه اصلی رادار مسکن', publicAccess: true, requiredPermission: 'neighborhood:read:global', fallbackPath: '/' },
  { routeId: 'RT-02', pathPattern: '/map', titleFa: 'نقشه هوشمند کلانشهرها', publicAccess: true, requiredPermission: 'neighborhood:read:global', fallbackPath: '/' },
  { routeId: 'RT-03', pathPattern: '/discover', titleFa: 'کشف و غربالگری محله‌ها', publicAccess: true, requiredPermission: 'neighborhood:read:global', fallbackPath: '/' },
  { routeId: 'RT-04', pathPattern: '/search', titleFa: 'جست‌وجوی یکپارچه ملک و محله', publicAccess: true, requiredPermission: 'property:read:global', fallbackPath: '/' },
  { routeId: 'RT-05', pathPattern: '/properties', titleFa: 'فهرست املاک و ساختمان‌ها', publicAccess: true, requiredPermission: 'property:read:global', fallbackPath: '/' },
  { routeId: 'RT-06', pathPattern: '/properties/:propertyId', titleFa: 'جزئیات پرونده ملک', publicAccess: true, requiredPermission: 'property:read:global', fallbackPath: '/properties' },
  { routeId: 'RT-07', pathPattern: '/listings', titleFa: 'فهرست آگهی‌های بازار', publicAccess: true, requiredPermission: 'listing:read:global', fallbackPath: '/' },
  { routeId: 'RT-08', pathPattern: '/listings/:listingId', titleFa: 'جزئیات آگهی ملکی', publicAccess: true, requiredPermission: 'listing:read:global', fallbackPath: '/listings' },
  { routeId: 'RT-09', pathPattern: '/buildings/:buildingId', titleFa: 'پرونده فنی ساختمان', publicAccess: true, requiredPermission: 'property:read:global', fallbackPath: '/properties' },
  { routeId: 'RT-10', pathPattern: '/neighborhoods/:neighborhoodId', titleFa: 'پروفایل جامع محله', publicAccess: true, requiredPermission: 'neighborhood:read:global', fallbackPath: '/discover' },

  // 11..20: Market Intelligence, Valuation & Tools
  { routeId: 'RT-11', pathPattern: '/intelligence', titleFa: 'هوش بازار و تحلیل کلان', publicAccess: true, requiredPermission: 'market:read:global', fallbackPath: '/' },
  { routeId: 'RT-12', pathPattern: '/valuation', titleFa: 'ماشین‌حساب ارزش‌گذاری هدونیک', publicAccess: true, requiredPermission: 'valuation:read:global', fallbackPath: '/' },
  { routeId: 'RT-13', pathPattern: '/tools', titleFa: 'جعبه ابزار مالی و حقوقی مسکن', publicAccess: true, requiredPermission: 'valuation:read:global', fallbackPath: '/' },
  { routeId: 'RT-14', pathPattern: '/compare', titleFa: 'میز کار مقایسه املاک و محله‌ها', publicAccess: true, requiredPermission: 'property:read:global', fallbackPath: '/discover' },
  { routeId: 'RT-15', pathPattern: '/services', titleFa: 'کاتالوگ خدمات تخصصی ملکی', publicAccess: true, requiredPermission: 'service:read:global', fallbackPath: '/' },
  { routeId: 'RT-16', pathPattern: '/providers', titleFa: 'فهرست کارشناسان و پیمانکاران مجاز', publicAccess: true, requiredPermission: 'provider:read:global', fallbackPath: '/services' },
  { routeId: 'RT-17', pathPattern: '/community', titleFa: 'دیدگاه‌ها و تجربه سکونت شهروندان', publicAccess: true, requiredPermission: 'community:read:global', fallbackPath: '/' },
  { routeId: 'RT-18', pathPattern: '/knowledge', titleFa: 'دانشنامه حقوقی و اقتصادی مسکن', publicAccess: true, requiredPermission: 'neighborhood:read:global', fallbackPath: '/' },
  { routeId: 'RT-19', pathPattern: '/cities/:cityId', titleFa: 'داشبورد شهر و استان', publicAccess: true, requiredPermission: 'neighborhood:read:global', fallbackPath: '/' },
  { routeId: 'RT-20', pathPattern: '/bargains', titleFa: 'رادار شکارهای قیمتی تأییدشده', publicAccess: true, requiredPermission: 'listing:read:global', fallbackPath: '/' },

  // 21..32: Authenticated Personal User Routes (Buyer, Seller, Tenant)
  { routeId: 'RT-21', pathPattern: '/account', titleFa: 'حساب کاربری و پروفایل شخصی', publicAccess: false, requiredPermission: 'user:read:own', fallbackPath: '/' },
  { routeId: 'RT-22', pathPattern: '/account/security', titleFa: 'امنیت حساب و نشست‌های فعال', publicAccess: false, requiredPermission: 'user:update:own', fallbackPath: '/account' },
  { routeId: 'RT-23', pathPattern: '/account/privacy-export', titleFa: 'خروجی داده و حریم خصوصی (GDPR)', publicAccess: false, requiredPermission: 'user:export:own', requiresStepUp: true, fallbackPath: '/account' },
  { routeId: 'RT-24', pathPattern: '/account/delete', titleFa: 'حذف حساب کاربری', publicAccess: false, requiredPermission: 'user:delete:own', requiresStepUp: true, fallbackPath: '/account' },
  { routeId: 'RT-25', pathPattern: '/account/alerts', titleFa: 'هشدارهای هوشمند قیمت خریدار', publicAccess: false, requiredPermission: 'user:read:own', fallbackPath: '/account' },
  { routeId: 'RT-26', pathPattern: '/account/saved-searches', titleFa: 'جست‌وجوهای ذخیره‌شده و دیده‌بان', publicAccess: false, requiredPermission: 'user:read:own', fallbackPath: '/account' },
  { routeId: 'RT-27', pathPattern: '/account/favorites', titleFa: 'محله‌ها و املاک منتخب', publicAccess: false, requiredPermission: 'user:read:own', fallbackPath: '/account' },
  { routeId: 'RT-28', pathPattern: '/my-properties/new', titleFa: 'ثبت ملک شخصی جدید', publicAccess: false, requiredPermission: 'property:create:own', fallbackPath: '/account' },
  { routeId: 'RT-29', pathPattern: '/my-properties/:propertyId/edit', titleFa: 'ویرایش پرونده ملک شخصی', publicAccess: false, requiredPermission: 'property:update:own', fallbackPath: '/account' },
  { routeId: 'RT-30', pathPattern: '/my-listings/new', titleFa: 'ثبت پیش‌نویس آگهی جدید', publicAccess: false, requiredPermission: 'listing:create:own', fallbackPath: '/account' },
  { routeId: 'RT-31', pathPattern: '/my-listings/:listingId/edit', titleFa: 'ویرایش آگهی شخصی', publicAccess: false, requiredPermission: 'listing:update:own', fallbackPath: '/account' },
  { routeId: 'RT-32', pathPattern: '/my-services/orders', titleFa: 'سفارش‌های خدمات ملکی من', publicAccess: false, requiredPermission: 'service:create:own', fallbackPath: '/services' },

  // 33..43: Organizational Workspace Routes (Agency, Agent, Provider, Analyst)
  { routeId: 'RT-33', pathPattern: '/workspace', titleFa: 'پیشخوان فضای کاری سازمانی', publicAccess: false, requiredPermission: 'workspace:read:workspace', requiresWorkspace: true, fallbackPath: '/account' },
  { routeId: 'RT-34', pathPattern: '/workspace/Switch', titleFa: 'تغییر فضای کاری و نقش فعال', publicAccess: false, requiredPermission: 'user:read:own', fallbackPath: '/account' },
  { routeId: 'RT-35', pathPattern: '/workspace/members', titleFa: 'مدیریت اعضای تیم و مشاوران', publicAccess: false, requiredPermission: 'workspace:assign:workspace', requiresWorkspace: true, requiresStepUp: true, fallbackPath: '/workspace' },
  { routeId: 'RT-36', pathPattern: '/workspace/permissions', titleFa: 'ماتریس مجوزها و کنترل دسترسی فضای کاری', publicAccess: false, requiredPermission: 'workspace:assign:workspace', requiresWorkspace: true, requiresStepUp: true, fallbackPath: '/workspace' },
  { routeId: 'RT-37', pathPattern: '/workspace/agency/listings', titleFa: 'کارتابل آگهی‌های آژانس املاک', publicAccess: false, requiredPermission: 'listing:create:agency', requiresWorkspace: true, fallbackPath: '/workspace' },
  { routeId: 'RT-38', pathPattern: '/workspace/agency/assigned', titleFa: 'پرونده‌های ارجاع‌شده به مشاور', publicAccess: false, requiredPermission: 'listing:update:assigned', requiresWorkspace: true, fallbackPath: '/workspace' },
  { routeId: 'RT-39', pathPattern: '/workspace/agency/sponsorship', titleFa: 'مدیریت اسپانسرینگ محله‌های آژانس', publicAccess: false, requiredPermission: 'neighborhood:manage:workspace', requiresWorkspace: true, fallbackPath: '/workspace' },
  { routeId: 'RT-40', pathPattern: '/workspace/agency/valuations', titleFa: 'تأیید کارشناسی‌های قیمت آژانس', publicAccess: false, requiredPermission: 'valuation:approve:workspace', requiresWorkspace: true, fallbackPath: '/workspace' },
  { routeId: 'RT-41', pathPattern: '/workspace/provider/orders', titleFa: 'مدیریت سفارش‌های ارائه‌دهنده خدمات', publicAccess: false, requiredPermission: 'provider:read:provider', requiresWorkspace: true, fallbackPath: '/workspace' },
  { routeId: 'RT-42', pathPattern: '/workspace/provider/catalog', titleFa: 'ویرایش تعرفه و ظرفیت ارائه‌دهنده', publicAccess: false, requiredPermission: 'provider:update:provider', requiresWorkspace: true, fallbackPath: '/workspace' },
  { routeId: 'RT-43', pathPattern: '/workspace/analyst/reports', titleFa: 'آزمایشگاه گزارش‌های تحلیلی و خروجی بازار', publicAccess: false, requiredPermission: 'market:export:workspace', requiresWorkspace: true, fallbackPath: '/workspace' },

  // 44..55: Moderation, Support & Admin Governance Routes
  { routeId: 'RT-44', pathPattern: '/moderation/queue', titleFa: 'صف بررسی و ممیزی گزارش‌ها', publicAccess: false, requiredPermission: 'moderation:read:assigned', fallbackPath: '/' },
  { routeId: 'RT-45', pathPattern: '/moderation/listings', titleFa: 'تأیید و رد آگهی‌های ثبت‌شده', publicAccess: false, requiredPermission: 'moderation:verify:assigned', fallbackPath: '/moderation/queue' },
  { routeId: 'RT-46', pathPattern: '/moderation/community', titleFa: 'بررسی نظرات و ادعاهای محلی شهروندان', publicAccess: false, requiredPermission: 'community:verify:city', fallbackPath: '/moderation/queue' },
  { routeId: 'RT-47', pathPattern: '/moderation/neighborhoods', titleFa: 'ممیزی داده‌های میدانی محله‌ها', publicAccess: false, requiredPermission: 'neighborhood:verify:city', fallbackPath: '/moderation/queue' },
  { routeId: 'RT-48', pathPattern: '/support/console', titleFa: 'میز خدمت و پشتیبانی کاربران', publicAccess: false, requiredPermission: 'moderation:read:global', fallbackPath: '/' },
  { routeId: 'RT-49', pathPattern: '/support/impersonate', titleFa: 'مشاهده پشتیبانی با نمای کاربر (فقط خواندنی)', publicAccess: false, requiredPermission: 'admin:impersonate:global', requiresStepUp: true, fallbackPath: '/support/console' },
  { routeId: 'RT-50', pathPattern: '/admin', titleFa: 'کنسول حاکمیت و سلامت سامانه', publicAccess: false, requiredPermission: 'admin:read:global', fallbackPath: '/' },
  { routeId: 'RT-51', pathPattern: '/admin/runtime-config', titleFa: 'تنظیمات محیطی و کلیدهای عملیاتی', publicAccess: false, requiredPermission: 'admin:update:global', requiresStepUp: true, fallbackPath: '/admin' },
  { routeId: 'RT-52', pathPattern: '/admin/users-roles', titleFa: 'مدیریت حساب‌ها و نقش‌های کلان سامانه', publicAccess: false, requiredPermission: 'user:manage:global', requiresStepUp: true, fallbackPath: '/admin' },
  { routeId: 'RT-53', pathPattern: '/admin/moderation-policy', titleFa: 'قوانین ممیزی و ضدتقلب سامانه', publicAccess: false, requiredPermission: 'moderation:manage:global', requiresStepUp: true, fallbackPath: '/admin' },
  { routeId: 'RT-54', pathPattern: '/admin/security-audit', titleFa: 'گزارش‌های ممیزی امنیتی و لاگ‌ها', publicAccess: false, requiredPermission: 'admin:export:global', requiresStepUp: true, fallbackPath: '/admin' },
  { routeId: 'RT-55', pathPattern: '/admin/backups', titleFa: 'پشتیبان‌گیری و بازیابی سامانه', publicAccess: false, requiredPermission: 'admin:manage:global', requiresStepUp: true, fallbackPath: '/admin' },
] as const;

export const ROUTE_ACCESS_BY_PATH: ReadonlyMap<string, RouteAccessMeta> = new Map(
  OFFICIAL_55_ROUTE_ACCESS_META.map((r) => [r.pathPattern, r])
);

export function evaluateRouteAccess(
  pathOrId: string,
  context: AccessContext,
  resource?: ResourceTargetContext
): { meta: RouteAccessMeta | null; decision: AccessDecision; redirectTo: string | null } {
  const meta =
    OFFICIAL_55_ROUTE_ACCESS_META.find((r) => r.routeId === pathOrId || r.pathPattern === pathOrId) ?? null;

  if (!meta) {
    const decision = evaluateAccessPolicy({
      permission: 'invalid:route:scope',
      context,
      resource,
    });
    return { meta: null, decision, redirectTo: '/' };
  }

  const decision = evaluateAccessPolicy({
    permission: meta.requiredPermission,
    context,
    resource,
    defaultDeniedUiState: 'Restricted',
  });

  return {
    meta,
    decision,
    redirectTo: decision.allowed ? null : meta.fallbackPath,
  };
}

export interface RouteAccessGuardProps {
  routePathOrId: string;
  resource?: ResourceTargetContext;
  children: React.ReactNode;
  fallback?: (decision: AccessDecision, meta: RouteAccessMeta | null) => React.ReactNode;
}

export const RouteAccessGuard: React.FC<RouteAccessGuardProps> = ({
  routePathOrId,
  resource,
  children,
  fallback,
}) => {
  const { context } = useAccessController();
  const { meta, decision } = evaluateRouteAccess(routePathOrId, context, resource);

  if (!decision.allowed) {
    if (fallback) return <>{fallback(decision, meta)}</>;
    return (
      <section
        role="alert"
        aria-live="polite"
        dir="rtl"
        className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-right text-sm text-slate-800 dark:text-[var(--color-text-primary)]"
      >
        <h3 className="font-bold text-amber-700 dark:text-amber-300">
          {meta ? `محدودیت دسترسی به «${meta.titleFa}»` : 'مسیر درخواستی در دسترس نیست'}
        </h3>
        <p className="mt-1 text-xs opacity-90">{decision.userMessageFa}</p>
      </section>
    );
  }

  return <>{children}</>;
};
