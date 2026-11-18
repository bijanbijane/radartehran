/**
 * @file src/platform/authorization/adapters/backendAccessAdapter.ts
 * @description Normalizes Backend / Auth session payloads into canonical AccessContext without upward feature imports.
 */

import type { AccessContext, AccountSecurityStatus, CanonicalBaseRole, WorkspaceStatus } from '../core/AccessContext';
import { isValidPermissionFormat, type CanonicalPermissionCode } from '../core/Permission';
import { ALL_CANONICAL_ROLES } from '../policies/rolePolicy';

export interface RawBackendAccessPayload {
  userId?: string | null;
  isAuthenticated?: boolean;
  accountStatus?: string;
  roles?: string[];
  activeRole?: string;
  activeWorkspaceId?: string | null;
  activeWorkspaceType?: 'personal' | 'agency' | 'provider' | 'analyst' | 'admin';
  activeWorkspaceStatus?: string;
  workspaceRoles?: Record<string, string[]>;
  allowPermissions?: string[];
  denyPermissions?: string[];
  temporaryGrants?: Array<{
    permission: string;
    grantedBy?: string;
    expiresAtMs: number;
    workspaceId?: string;
  }>;
  permissionVersion?: number;
  stepUpVerifiedAtMs?: number | null;
  isImpersonating?: boolean;
  impersonatorOperatorId?: string | null;
  featureFlags?: Record<string, boolean>;
  assignedCityIds?: string[];
}

const VALID_ROLE_SET = new Set<string>(ALL_CANONICAL_ROLES);

function normalizeRole(raw?: string): CanonicalBaseRole {
  if (!raw) return 'guest';
  const normalized = raw.trim().toLowerCase();
  if (VALID_ROLE_SET.has(normalized)) return normalized as CanonicalBaseRole;
  if (normalized === 'agency_owner' || normalized === 'manager') return 'agency_manager';
  if (normalized === 'provider') return 'service_provider';
  if (normalized === 'super_admin') return 'admin';
  return 'user';
}

function normalizePermissions(rawList?: string[]): CanonicalPermissionCode[] {
  if (!Array.isArray(rawList)) return [];
  const valid: CanonicalPermissionCode[] = [];
  for (const item of rawList) {
    if (isValidPermissionFormat(item)) {
      valid.push(item);
    }
  }
  return Array.from(new Set(valid));
}

export function adaptBackendAccessPayload(payload?: RawBackendAccessPayload | null): AccessContext {
  if (!payload || !payload.isAuthenticated || !payload.userId) {
    return {
      userId: null,
      isAuthenticated: false,
      accountStatus: 'ACTIVE',
      personalRoles: ['guest'],
      activeRole: 'guest',
      activeWorkspaceId: null,
      activeWorkspaceType: 'personal',
      activeWorkspaceStatus: 'ACTIVE',
      workspaceRoles: {},
      explicitAllowPermissions: [],
      explicitDenyPermissions: [],
      temporaryGrants: [],
      permissionVersion: 1,
      isImpersonating: false,
      impersonatorOperatorId: null,
      featureFlags: payload?.featureFlags ?? {},
      assignedCityIds: payload?.assignedCityIds ?? [],
    };
  }

  const personalRoles = Array.isArray(payload.roles) && payload.roles.length > 0
    ? Array.from(new Set(payload.roles.map((r) => normalizeRole(r))))
    : (['user'] as CanonicalBaseRole[]);

  const activeRole = payload.activeRole ? normalizeRole(payload.activeRole) : personalRoles[0];

  const workspaceRoles: Record<string, CanonicalBaseRole[]> = {};
  if (payload.workspaceRoles && typeof payload.workspaceRoles === 'object') {
    for (const [wsId, roleArr] of Object.entries(payload.workspaceRoles)) {
      if (Array.isArray(roleArr)) {
        workspaceRoles[wsId] = Array.from(new Set(roleArr.map((r) => normalizeRole(r))));
      }
    }
  }

  const accountStatus: AccountSecurityStatus =
    payload.accountStatus === 'LOCKED' ||
    payload.accountStatus === 'SUSPENDED' ||
    payload.accountStatus === 'UNVERIFIED'
      ? payload.accountStatus
      : 'ACTIVE';

  const activeWorkspaceStatus: WorkspaceStatus =
    payload.activeWorkspaceStatus === 'SUSPENDED' ||
    payload.activeWorkspaceStatus === 'ARCHIVED' ||
    payload.activeWorkspaceStatus === 'PENDING_INVITE'
      ? payload.activeWorkspaceStatus
      : 'ACTIVE';

  return {
    userId: payload.userId,
    isAuthenticated: true,
    accountStatus,
    personalRoles,
    activeRole,
    activeWorkspaceId: payload.activeWorkspaceId ?? `ws-personal-${payload.userId}`,
    activeWorkspaceType: payload.activeWorkspaceType ?? 'personal',
    activeWorkspaceStatus,
    workspaceRoles,
    explicitAllowPermissions: normalizePermissions(payload.allowPermissions),
    explicitDenyPermissions: normalizePermissions(payload.denyPermissions),
    temporaryGrants: (payload.temporaryGrants || [])
      .filter((g) => isValidPermissionFormat(g.permission) && Number.isFinite(g.expiresAtMs))
      .map((g) => ({
        permission: g.permission as CanonicalPermissionCode,
        grantedBy: g.grantedBy || 'system',
        expiresAtMs: g.expiresAtMs,
        workspaceId: g.workspaceId,
      })),
    permissionVersion: typeof payload.permissionVersion === 'number' ? Math.max(1, payload.permissionVersion) : 1,
    stepUpVerifiedAtMs: payload.stepUpVerifiedAtMs ?? null,
    isImpersonating: Boolean(payload.isImpersonating),
    impersonatorOperatorId: payload.impersonatorOperatorId ?? null,
    featureFlags: payload.featureFlags ?? {},
    assignedCityIds: payload.assignedCityIds ?? [],
  };
}
