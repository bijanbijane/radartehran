/**
 * RT-FE-NAVIGATION-017 — Verified Firebase ID Token custom claims → platform AuthUserSnapshot (fail-closed).
 */
import type { User as FirebaseUser } from 'firebase/auth';
import type { AuthUserSnapshot } from '../core/authClient';
import type { PermissionKey } from '../authorization/permissionResolver';
import type { AppRole } from '../authorization/roleResolver';

const VALID_APP_ROLES = new Set<AppRole>([
  'guest',
  'buyer',
  'seller',
  'owner',
  'tenant',
  'agency_agent',
  'agency_admin',
  'agency_consultant',
  'agency_manager',
  'service_provider',
  'operator_support',
  'platform_support',
  'admin',
  'platform_admin',
]);

const VALID_PERMISSION_KEYS = new Set<PermissionKey>([
  'map:view',
  'neighborhood:read',
  'property:read',
  'property:write',
  'valuation:calculate',
  'escrow:initiate',
  'lead:manage',
  'service_order:fulfill',
  'settlement:withdraw',
  'admin:governance',
  'personal:shortlist:read',
  'personal:shortlist:write',
  'personal:listing:submit',
  'personal:account:export',
  'personal:account:delete',
  'agency:workspace:view',
  'agency:listing:draft',
  'agency:listing:publish',
  'agency:listing:approve',
  'agency:settlement:withdraw',
  'agency:members:manage',
  'service:workspace:view',
  'service:proposal:submit',
  'service:deliverable:upload',
  'service:settlement:withdraw',
  'admin:dashboard:view',
  'admin:moderation:approve',
  'admin:permissions:manage',
  'admin:impersonation:start',
]);

/**
 * Canonical JWT custom claims read by resolveRoleAndPermissions() (verified in AUTH-004/012 tests).
 * - role: AppRole
 * - roles: AppRole[]
 * - revokedPermissions: PermissionKey[]
 * - permissionVersion: number
 */
export function sanitizeFirebaseCustomClaims(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};

  const sanitized: Record<string, unknown> = {};

  if (typeof raw.role === 'string' && VALID_APP_ROLES.has(raw.role as AppRole)) {
    sanitized.role = raw.role;
  }

  if (Array.isArray(raw.roles)) {
    const roles = raw.roles.filter(
      (entry): entry is AppRole => typeof entry === 'string' && VALID_APP_ROLES.has(entry as AppRole),
    );
    if (roles.length > 0) sanitized.roles = roles;
  }

  if (Array.isArray(raw.revokedPermissions)) {
    const revoked = raw.revokedPermissions.filter(
      (entry): entry is PermissionKey =>
        typeof entry === 'string' && VALID_PERMISSION_KEYS.has(entry as PermissionKey),
    );
    if (revoked.length > 0) sanitized.revokedPermissions = revoked;
  }

  if (typeof raw.permissionVersion === 'number' && Number.isFinite(raw.permissionVersion)) {
    sanitized.permissionVersion = Math.max(1, Math.floor(raw.permissionVersion));
  }

  return sanitized;
}

export async function resolveAuthUserSnapshotFromFirebaseUser(
  fbUser: FirebaseUser,
  options?: { forceRefresh?: boolean },
): Promise<AuthUserSnapshot> {
  const tokenResult = await fbUser.getIdTokenResult(Boolean(options?.forceRefresh));
  const customClaims = sanitizeFirebaseCustomClaims(tokenResult.claims as Record<string, unknown>);
  return {
    uid: fbUser.uid,
    email: fbUser.email,
    phoneNumber: fbUser.phoneNumber,
    displayName: fbUser.displayName,
    emailVerified: fbUser.emailVerified,
    customClaims,
  };
}