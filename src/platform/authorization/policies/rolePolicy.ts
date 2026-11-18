/**
 * @file src/platform/authorization/policies/rolePolicy.ts
 * @description Canonical 12 Base Roles with inheritance and effective permission resolution.
 */

import type { CanonicalBaseRole } from '../core/AccessContext';
import type { CanonicalPermissionCode } from '../core/Permission';
import { PERMISSION_CATALOG } from '../catalog/permissionRegistry';

export interface RoleDefinition {
  role: CanonicalBaseRole;
  titleFa: string;
  category: 'personal' | 'organizational' | 'governance';
  inheritsFrom: CanonicalBaseRole[];
  directPermissions: CanonicalPermissionCode[];
}

export const ROLE_DEFINITIONS: Record<CanonicalBaseRole, RoleDefinition> = {
  guest: {
    role: 'guest',
    titleFa: 'مهمان (بدون ورود)',
    category: 'personal',
    inheritsFrom: [],
    directPermissions: [
      'property:read:global',
      'listing:read:global',
      'neighborhood:read:global',
      'market:read:global',
      'valuation:read:global',
      'service:read:global',
      'provider:read:global',
      'community:read:global',
    ],
  },
  user: {
    role: 'user',
    titleFa: 'کاربر عمومی احراز هویت‌شده',
    category: 'personal',
    inheritsFrom: ['guest'],
    directPermissions: [
      'user:read:own',
      'user:update:own',
      'user:export:own',
      'user:delete:own',
      'valuation:create:own',
      'valuation:export:own',
      'community:create:own',
      'community:update:own',
      'community:delete:own',
      'service:create:own',
      'service:update:own',
      'service:delete:own',
      'workspace:create:own',
    ],
  },
  buyer: {
    role: 'buyer',
    titleFa: 'خریدار / سرمایه‌گذار ملکی',
    category: 'personal',
    inheritsFrom: ['user'],
    directPermissions: [
      'neighborhood:export:global',
    ],
  },
  seller: {
    role: 'seller',
    titleFa: 'مالک / فروشنده ملک',
    category: 'personal',
    inheritsFrom: ['user'],
    directPermissions: [
      'property:create:own',
      'property:update:own',
      'property:delete:own',
      'listing:create:own',
      'listing:update:own',
      'listing:publish:own',
      'listing:archive:own',
    ],
  },
  tenant: {
    role: 'tenant',
    titleFa: 'مستأجر / متقاضی اجاره',
    category: 'personal',
    inheritsFrom: ['user'],
    directPermissions: [
      'listing:create:own',
      'listing:update:own',
    ],
  },
  agent: {
    role: 'agent',
    titleFa: 'مشاور املاک سازمانی',
    category: 'organizational',
    inheritsFrom: ['user'],
    directPermissions: [
      'property:read:workspace',
      'listing:create:agency',
      'listing:update:assigned',
      'listing:publish:agency',
      'valuation:update:assigned',
      'workspace:read:workspace',
    ],
  },
  agency_manager: {
    role: 'agency_manager',
    titleFa: 'مدیر آژانس املاک',
    category: 'organizational',
    inheritsFrom: ['agent'],
    directPermissions: [
      'listing:delete:agency',
      'neighborhood:manage:workspace',
      'market:create:workspace',
      'market:export:workspace',
      'valuation:approve:workspace',
      'workspace:update:workspace',
      'workspace:assign:workspace',
      'workspace:delete:workspace',
      'workspace:export:workspace',
    ],
  },
  service_provider: {
    role: 'service_provider',
    titleFa: 'ارائه‌دهنده خدمات تخصصی ملکی',
    category: 'organizational',
    inheritsFrom: ['user'],
    directPermissions: [
      'provider:read:provider',
      'provider:update:provider',
      'provider:export:provider',
      'service:assign:provider',
      'service:approve:provider',
      'workspace:read:workspace',
    ],
  },
  analyst: {
    role: 'analyst',
    titleFa: 'تحلیلگر داده و اقتصاد مسکن',
    category: 'organizational',
    inheritsFrom: ['user'],
    directPermissions: [
      'property:read:workspace',
      'neighborhood:export:global',
      'market:create:workspace',
      'market:export:workspace',
      'workspace:read:workspace',
      'workspace:export:workspace',
    ],
  },
  moderator: {
    role: 'moderator',
    titleFa: 'ناظر کیفی و ممیز محتوا',
    category: 'governance',
    inheritsFrom: ['user'],
    directPermissions: [
      'property:verify:city',
      'neighborhood:update:city',
      'neighborhood:verify:city',
      'community:verify:city',
      'moderation:read:assigned',
      'moderation:verify:assigned',
      'moderation:approve:assigned',
      'moderation:reject:assigned',
    ],
  },
  support: {
    role: 'support',
    titleFa: 'پشتیبان عملیات و کاربران',
    category: 'governance',
    inheritsFrom: ['user'],
    directPermissions: [
      'moderation:read:assigned',
      'moderation:read:global',
      'admin:read:global',
      'admin:impersonate:global',
    ],
  },
  admin: {
    role: 'admin',
    titleFa: 'مدیر کل حاکمیت سامانه',
    category: 'governance',
    inheritsFrom: ['agency_manager', 'moderator', 'support', 'analyst'],
    directPermissions: PERMISSION_CATALOG.map((p) => p.code),
  },
};

export const ALL_CANONICAL_ROLES: readonly CanonicalBaseRole[] = Object.keys(
  ROLE_DEFINITIONS
) as CanonicalBaseRole[];

export function getEffectiveRolePermissions(roles: readonly CanonicalBaseRole[]): Set<CanonicalPermissionCode> {
  const resolved = new Set<CanonicalPermissionCode>();
  const visited = new Set<CanonicalBaseRole>();

  function visit(role: CanonicalBaseRole): void {
    if (visited.has(role)) return;
    visited.add(role);
    const def = ROLE_DEFINITIONS[role];
    if (!def) return;
    for (const parent of def.inheritsFrom) {
      visit(parent);
    }
    for (const perm of def.directPermissions) {
      resolved.add(perm);
    }
  }

  for (const r of roles) {
    visit(r);
  }
  return resolved;
}
