/**
 * @file src/platform/authorization/adapters/legacyPermissionAdapter.ts
 * @description Maps legacy Stage 3 / Stage 24 permission strings to canonical resource:action:scope permissions.
 */

import { isValidPermissionFormat, type CanonicalPermissionCode } from '../core/Permission';

const LEGACY_PERMISSION_MAP: Record<string, CanonicalPermissionCode> = {
  'listing:create': 'listing:create:own',
  'listing:edit:own': 'listing:update:own',
  'listing:edit:agency': 'listing:update:assigned',
  'listing:delete:own': 'listing:archive:own',
  'listing:delete:agency': 'listing:delete:agency',
  'listing:publish': 'listing:publish:own',
  'valuation:execute': 'valuation:create:own',
  'valuation:export': 'valuation:export:own',
  'neighborhood:review': 'community:create:own',
  'neighborhood:override': 'neighborhood:update:city',
  'sponsor:reserve': 'neighborhood:manage:workspace',
  'agency:manage_team': 'workspace:assign:workspace',
  'agency:crm_access': 'property:read:workspace',
  'service:provide': 'provider:update:provider',
  'service:request': 'service:create:own',
  'analytics:deep_intelligence': 'market:create:workspace',
  'moderation:approve_bargain': 'moderation:approve:assigned',
  'moderation:reject_bargain': 'moderation:reject:assigned',
  'support:view_user_tickets': 'moderation:read:assigned',
  'support:impersonate_readonly': 'admin:impersonate:global',
  'admin:system_config': 'admin:update:global',
  'admin:security_audit': 'admin:export:global',
  'admin:backup_restore': 'admin:manage:global',
  'ADMIN_PANEL': 'admin:read:global',
};

export function mapLegacyPermissionToCanonical(legacyCode: string): CanonicalPermissionCode | null {
  if (!legacyCode || typeof legacyCode !== 'string') return null;
  const trimmed = legacyCode.trim();
  if (isValidPermissionFormat(trimmed)) {
    return trimmed;
  }
  return LEGACY_PERMISSION_MAP[trimmed] ?? null;
}

export function mapLegacyPermissionsList(legacyList: readonly string[]): CanonicalPermissionCode[] {
  const result = new Set<CanonicalPermissionCode>();
  for (const item of legacyList) {
    const mapped = mapLegacyPermissionToCanonical(item);
    if (mapped) result.add(mapped);
  }
  return Array.from(result);
}
