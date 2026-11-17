/** @file src/platform/auth/authorization/roleResolver.ts — Role Resolution (Personal vs Organizational Roles, Untrusted LocalStorage Rejected) */
import type { UserIdentitySnapshot, WorkspaceType } from '../core/authState';

export type RadarRoleId =
  | 'guest'
  | 'buyer'
  | 'seller'
  | 'owner'
  | 'tenant'
  | 'agency_agent'
  | 'agency_admin'
  | 'agency_consultant'
  | 'agency_manager'
  | 'service_provider'
  | 'operator_support'
  | 'platform_support'
  | 'admin'
  | 'platform_admin';

export type AppRole = RadarRoleId;

export interface AuthoritativeRoleGrant {
  readonly userId: string;
  readonly personalRoles: readonly RadarRoleId[];
  readonly agencyRolesByWorkspace: Readonly<Record<string, readonly RadarRoleId[]>>;
  readonly serviceRolesByWorkspace: Readonly<Record<string, readonly RadarRoleId[]>>;
  readonly isVerifiedAdmin?: boolean;
  readonly isPlatformSupport?: boolean;
}

export function resolveAuthoritativeRolesForWorkspace(params: {
  readonly identity: UserIdentitySnapshot | null;
  readonly grant: AuthoritativeRoleGrant | null;
  readonly workspaceType: WorkspaceType;
  readonly workspaceId: string;
}): readonly RadarRoleId[] {
  const { identity, grant, workspaceType, workspaceId } = params;
  if (!identity || !grant || grant.userId !== identity.userId) {
    return ['guest'];
  }

  const roles = new Set<RadarRoleId>();

  if (workspaceType === 'personal') {
    const personal = grant.personalRoles.length > 0 ? grant.personalRoles : (['buyer'] as const);
    personal.forEach((r) => roles.add(r));
  } else if (workspaceType === 'agency') {
    const agencyRoles = grant.agencyRolesByWorkspace[workspaceId] ?? [];
    agencyRoles.forEach((r) => roles.add(r));
  } else if (workspaceType === 'service') {
    const serviceRoles = grant.serviceRolesByWorkspace[workspaceId] ?? [];
    serviceRoles.forEach((r) => roles.add(r));
  }

  if (grant.isVerifiedAdmin && identity.emailVerified) {
    roles.add('platform_admin');
    roles.add('admin');
  }
  if (grant.isPlatformSupport && identity.emailVerified) {
    roles.add('platform_support');
    roles.add('operator_support');
  }

  return Array.from(roles);
}
