/**
 * @file src/platform/authorization/catalog/capabilityRegistry.ts
 * @description Canonical Capability Registry mapping high-level product capabilities to required permissions.
 */

import type { CapabilityDescriptor, CapabilityId } from '../core/Capability';
import type { AccessContext } from '../core/AccessContext';
import { evaluateAccessPolicy } from '../core/AccessPolicy';

export const CAPABILITY_REGISTRY: readonly CapabilityDescriptor[] = [
  {
    id: 'cap:property:browse',
    titleFa: 'مرور و جست‌وجوی املاک',
    requiredPermissions: ['property:read:global'],
  },
  {
    id: 'cap:property:manage_own',
    titleFa: 'مدیریت پرونده املاک شخصی',
    requiredPermissions: ['property:create:own', 'property:update:own'],
  },
  {
    id: 'cap:listing:create_draft',
    titleFa: 'ثبت پیش‌نویس آگهی ملکی',
    requiredPermissions: ['listing:create:own'],
  },
  {
    id: 'cap:listing:publish',
    titleFa: 'انتشار عمومی آگهی',
    requiredPermissions: ['listing:publish:own'],
    requiresVerification: true,
  },
  {
    id: 'cap:listing:moderate',
    titleFa: 'پایش و تایید آگهی‌ها',
    requiredPermissions: ['moderation:verify:assigned', 'moderation:approve:assigned'],
  },
  {
    id: 'cap:neighborhood:inspect',
    titleFa: 'بررسی تحلیلی محله‌ها',
    requiredPermissions: ['neighborhood:read:global'],
  },
  {
    id: 'cap:neighborhood:curate',
    titleFa: 'به‌روزرسانی و ممیزی داده‌های محله',
    requiredPermissions: ['neighborhood:update:city', 'neighborhood:verify:city'],
  },
  {
    id: 'cap:market:analytics',
    titleFa: 'دسترسی به هوش بازار و شاخص‌ها',
    requiredPermissions: ['market:read:global'],
  },
  {
    id: 'cap:market:export',
    titleFa: 'خروجی گرفتن از داده‌های تحلیلی بازار',
    requiredPermissions: ['market:export:workspace'],
    requiresActiveWorkspace: true,
  },
  {
    id: 'cap:valuation:run',
    titleFa: 'اجرای ارزش‌گذاری هدونیک',
    requiredPermissions: ['valuation:read:global', 'valuation:create:own'],
  },
  {
    id: 'cap:valuation:approve',
    titleFa: 'تأیید رسمی کارشناسی قیمت',
    requiredPermissions: ['valuation:approve:workspace'],
    requiresActiveWorkspace: true,
  },
  {
    id: 'cap:service:request',
    titleFa: 'ثبت سفارش خدمات ملکی و کارشناسی',
    requiredPermissions: ['service:read:global', 'service:create:own'],
  },
  {
    id: 'cap:provider:fulfill',
    titleFa: 'مدیریت و انجام سفارش‌های خدمات',
    requiredPermissions: ['provider:read:provider', 'service:approve:provider'],
    requiresActiveWorkspace: true,
  },
  {
    id: 'cap:community:participate',
    titleFa: 'ثبت نظر و مشارکت محلی',
    requiredPermissions: ['community:read:global', 'community:create:own'],
  },
  {
    id: 'cap:moderation:queue',
    titleFa: 'مدیریت صف گزارش‌های مردمی و تخلفات',
    requiredPermissions: ['moderation:read:assigned'],
  },
  {
    id: 'cap:user:self_manage',
    titleFa: 'مدیریت حساب، نشست‌ها و حریم خصوصی',
    requiredPermissions: ['user:read:own', 'user:update:own'],
  },
  {
    id: 'cap:workspace:collaborate',
    titleFa: 'همکاری در فضای کاری سازمانی',
    requiredPermissions: ['workspace:read:workspace'],
    requiresActiveWorkspace: true,
  },
  {
    id: 'cap:workspace:manage_members',
    titleFa: 'مدیریت اعضا و مجوزهای فضای کاری',
    requiredPermissions: ['workspace:assign:workspace', 'workspace:update:workspace'],
    requiresActiveWorkspace: true,
  },
  {
    id: 'cap:admin:governance',
    titleFa: 'حاکمیت و پیکربندی کلان سامانه',
    requiredPermissions: ['admin:read:global', 'admin:manage:global'],
  },
  {
    id: 'cap:admin:impersonate',
    titleFa: 'مشاهده پشتیبانی با نمای کاربر (فقط خواندنی)',
    requiredPermissions: ['admin:impersonate:global'],
  },
] as const;

export const CAPABILITY_MAP: ReadonlyMap<CapabilityId, CapabilityDescriptor> = new Map(
  CAPABILITY_REGISTRY.map((cap) => [cap.id, cap])
);

export function evaluateCapability(capabilityId: CapabilityId, context: AccessContext): boolean {
  const descriptor = CAPABILITY_MAP.get(capabilityId);
  if (!descriptor) return false;
  if (descriptor.requiresActiveWorkspace && !context.activeWorkspaceId) return false;
  return descriptor.requiredPermissions.every((perm) =>
    evaluateAccessPolicy({
      permission: perm,
      context,
      featureFlagKey: descriptor.featureFlagKey,
    }).allowed
  );
}
