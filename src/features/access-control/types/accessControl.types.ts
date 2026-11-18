/**
 * @file src/features/access-control/types/accessControl.types.ts
 * @description Contracts for the 12-Part Permission Management UI and Workspace Access Audit (Stage 25).
 */

import type { CanonicalBaseRole } from '../../../platform/authorization/core/AccessContext';
import type { CanonicalPermissionCode, PermissionResourceGroup } from '../../../platform/authorization/core/Permission';

export interface WorkspaceMemberAccessProfile {
  userId: string;
  displayNameFa: string;
  emailOrPhone: string;
  workspaceId: string;
  role: CanonicalBaseRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_INVITE';
  explicitAllow: CanonicalPermissionCode[];
  explicitDeny: CanonicalPermissionCode[];
  temporaryGrants: Array<{
    permission: CanonicalPermissionCode;
    expiresAtMs: number;
    reasonFa: string;
  }>;
  updatedAtIso: string;
}

export interface PermissionChangeAuditItem {
  id: string;
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
  actionType: 'ROLE_CHANGE' | 'EXPLICIT_ALLOW' | 'EXPLICIT_DENY' | 'TEMP_GRANT' | 'REVOKE';
  summaryFa: string;
  createdAtIso: string;
}

export interface PermissionMatrixFilterState {
  searchQuery: string;
  selectedResource: PermissionResourceGroup | 'all';
  selectedRole: CanonicalBaseRole | 'all';
  onlySensitive: boolean;
}
