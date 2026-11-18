/**
 * @file src/platform/authorization/core/AccessContext.ts
 * @description Canonical AccessContext separating Identity, Role, Workspace, Resource Ownership & Verification state.
 */

import type { CanonicalPermissionCode } from './Permission';

export type CanonicalBaseRole =
  | 'guest'
  | 'user'
  | 'buyer'
  | 'seller'
  | 'tenant'
  | 'agent'
  | 'agency_manager'
  | 'service_provider'
  | 'analyst'
  | 'moderator'
  | 'support'
  | 'admin';

export type WorkspaceStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | 'PENDING_INVITE';
export type AccountSecurityStatus = 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'UNVERIFIED';

export interface TemporaryPermissionGrant {
  permission: CanonicalPermissionCode;
  grantedBy: string;
  expiresAtMs: number;
  workspaceId?: string;
}

export interface AccessContext {
  userId: string | null;
  isAuthenticated: boolean;
  accountStatus: AccountSecurityStatus;
  personalRoles: CanonicalBaseRole[];
  activeRole: CanonicalBaseRole;
  activeWorkspaceId: string | null;
  activeWorkspaceType?: 'personal' | 'agency' | 'provider' | 'analyst' | 'admin';
  activeWorkspaceStatus?: WorkspaceStatus;
  workspaceRoles?: Record<string, CanonicalBaseRole[]>;
  explicitAllowPermissions: CanonicalPermissionCode[];
  explicitDenyPermissions: CanonicalPermissionCode[];
  temporaryGrants: TemporaryPermissionGrant[];
  permissionVersion: number;
  stepUpVerifiedAtMs?: number | null;
  stepUpMaxAgeMs?: number;
  isImpersonating?: boolean;
  impersonatorOperatorId?: string | null;
  featureFlags?: Record<string, boolean>;
  assignedCityIds?: string[];
  nowMs?: number;
}

export interface ResourceTargetContext {
  resourceId?: string;
  ownerUserId?: string;
  assignedUserIds?: string[];
  workspaceId?: string;
  agencyId?: string;
  providerId?: string;
  cityId?: string;
  isLocked?: boolean;
  version?: number;
}
