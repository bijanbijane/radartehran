/** @file src/platform/auth/authorization/permissionResolver.ts — Explicit Permission Resolver (Role !== Automatic Full Permission) */
import type { RadarRoleId, AppRole } from './roleResolver';
import type { IdentityRecord } from '../identity/identityResolver';
import type { ProfileRecord } from '../identity/profileResolver';

export type RadarPermissionId =
  | 'map:view'
  | 'neighborhood:read'
  | 'property:read'
  | 'property:write'
  | 'valuation:calculate'
  | 'escrow:initiate'
  | 'lead:manage'
  | 'service_order:fulfill'
  | 'settlement:withdraw'
  | 'admin:governance'
  | 'personal:shortlist:read'
  | 'personal:shortlist:write'
  | 'personal:listing:submit'
  | 'personal:account:export'
  | 'personal:account:delete'
  | 'agency:workspace:view'
  | 'agency:listing:draft'
  | 'agency:listing:publish'
  | 'agency:listing:approve'
  | 'agency:settlement:withdraw'
  | 'agency:members:manage'
  | 'service:workspace:view'
  | 'service:proposal:submit'
  | 'service:deliverable:upload'
  | 'service:settlement:withdraw'
  | 'admin:dashboard:view'
  | 'admin:moderation:approve'
  | 'admin:permissions:manage'
  | 'admin:impersonation:start';

export type PermissionKey = RadarPermissionId;

export interface BackendPermissionEnvelope {
  readonly userId: string;
  readonly workspaceId: string;
  readonly permissionVersion: string;
  readonly explicitPermissions: readonly RadarPermissionId[];
  readonly revokedPermissions?: readonly RadarPermissionId[];
}

export interface ResolvedAccessContext {
  readonly activeRole: AppRole;
  readonly availableRoles: AppRole[];
  readonly permissions: PermissionKey[];
  readonly workspaceId: string;
  readonly permissionVersion: number;
}

const BASELINE_ROLE_PERMISSIONS: Record<RadarRoleId, readonly RadarPermissionId[]> = {
  guest: ['map:view', 'neighborhood:read', 'property:read', 'valuation:calculate'],
  buyer: ['map:view', 'neighborhood:read', 'property:read', 'valuation:calculate', 'escrow:initiate', 'personal:shortlist:read', 'personal:shortlist:write', 'personal:account:export', 'personal:account:delete'],
  seller: ['map:view', 'neighborhood:read', 'property:read', 'property:write', 'valuation:calculate', 'escrow:initiate', 'settlement:withdraw', 'personal:shortlist:read', 'personal:listing:submit'],
  tenant: ['map:view', 'neighborhood:read', 'property:read', 'valuation:calculate', 'personal:shortlist:read', 'personal:shortlist:write', 'personal:account:export', 'personal:account:delete'],
  owner: ['map:view', 'neighborhood:read', 'property:read', 'property:write', 'settlement:withdraw', 'personal:shortlist:read', 'personal:shortlist:write', 'personal:listing:submit', 'personal:account:export', 'personal:account:delete'],
  agency_agent: ['map:view', 'neighborhood:read', 'property:read', 'property:write', 'lead:manage', 'agency:workspace:view', 'agency:listing:draft'],
  agency_consultant: ['map:view', 'neighborhood:read', 'property:read', 'agency:workspace:view', 'agency:listing:draft'],
  agency_admin: ['map:view', 'neighborhood:read', 'property:read', 'property:write', 'lead:manage', 'settlement:withdraw', 'agency:workspace:view', 'agency:listing:draft', 'agency:listing:publish', 'agency:listing:approve', 'agency:members:manage'],
  agency_manager: ['map:view', 'neighborhood:read', 'property:read', 'property:write', 'lead:manage', 'agency:workspace:view', 'agency:listing:draft', 'agency:listing:publish', 'agency:listing:approve', 'agency:members:manage'],
  service_provider: ['map:view', 'neighborhood:read', 'property:read', 'service_order:fulfill', 'settlement:withdraw', 'service:workspace:view', 'service:proposal:submit', 'service:deliverable:upload'],
  operator_support: ['map:view', 'neighborhood:read', 'property:read', 'admin:dashboard:view'],
  platform_support: ['map:view', 'neighborhood:read', 'property:read', 'admin:dashboard:view'],
  admin: ['map:view', 'neighborhood:read', 'property:read', 'property:write', 'lead:manage', 'service_order:fulfill', 'admin:governance', 'admin:dashboard:view', 'admin:moderation:approve', 'admin:permissions:manage', 'admin:impersonation:start'],
  platform_admin: ['map:view', 'neighborhood:read', 'property:read', 'property:write', 'admin:governance', 'admin:dashboard:view', 'admin:moderation:approve', 'admin:permissions:manage', 'admin:impersonation:start'],
};

export const GUEST_BASELINE_PERMISSIONS: readonly RadarPermissionId[] = BASELINE_ROLE_PERMISSIONS.guest;

export function resolveEffectivePermissions(params: {
  readonly activeRoles: readonly RadarRoleId[];
  readonly backendEnvelope?: BackendPermissionEnvelope | null;
  readonly expectedUserId: string;
  readonly expectedWorkspaceId: string;
}): {
  readonly permissions: readonly RadarPermissionId[];
  readonly permissionVersion: string;
} {
  const { activeRoles, backendEnvelope, expectedUserId, expectedWorkspaceId } = params;
  const granted = new Set<RadarPermissionId>();

  for (const role of activeRoles) {
    const base = BASELINE_ROLE_PERMISSIONS[role] ?? [];
    for (const perm of base) granted.add(perm);
  }

  let permissionVersion = 'v1';
  if (
    backendEnvelope &&
    backendEnvelope.userId === expectedUserId &&
    backendEnvelope.workspaceId === expectedWorkspaceId
  ) {
    permissionVersion = backendEnvelope.permissionVersion || 'v1';
    for (const explicitPerm of backendEnvelope.explicitPermissions) {
      granted.add(explicitPerm);
    }
    for (const revoked of backendEnvelope.revokedPermissions ?? []) {
      granted.delete(revoked);
    }
  }

  return {
    permissions: Array.from(granted),
    permissionVersion,
  };
}

export function resolveRoleAndPermissions(
  identity: IdentityRecord,
  _profile: ProfileRecord,
  requestedWorkspaceId?: string
): ResolvedAccessContext {
  const claims = identity.customClaims ?? {};
  const rawRole = (claims.role as AppRole) || (identity.uid === 'guest' ? 'guest' : 'buyer');
  const rawRoles = Array.isArray(claims.roles) ? (claims.roles as AppRole[]) : [rawRole];
  const revoked = new Set<string>(Array.isArray(claims.revokedPermissions) ? (claims.revokedPermissions as string[]) : []);
  const basePerms = BASELINE_ROLE_PERMISSIONS[rawRole] ?? BASELINE_ROLE_PERMISSIONS.guest;
  const permissions = basePerms.filter((p) => !revoked.has(p));
  const permissionVersion = typeof claims.permissionVersion === 'number' ? claims.permissionVersion : 1;
  const workspaceId = requestedWorkspaceId || `ws:${identity.uid}:${rawRole}`;

  return {
    activeRole: rawRole,
    availableRoles: rawRoles,
    permissions,
    workspaceId,
    permissionVersion,
  };
}
