/**
 * @file src/features/access-control/services/permissionManagementService.ts
 * @description Service for inspecting, mutating, and auditing workspace member roles and permissions (Stage 25).
 */

import {
  PERMISSION_CATALOG,
  RESOURCE_GROUP_REGISTRY,
  ROLE_DEFINITIONS,
  evaluateAccessPolicy,
  getEffectiveRolePermissions,
  triggerPermissionInvalidation,
  validateWorkspaceMemberMutation,
  type AccessContext,
  type CanonicalBaseRole,
  type CanonicalPermissionCode,
  type PermissionDefinition,
} from '../../../platform/authorization';
import type {
  PermissionChangeAuditItem,
  PermissionMatrixFilterState,
  WorkspaceMemberAccessProfile,
} from '../types/accessControl.types';

export function filterPermissionCatalog(filter: PermissionMatrixFilterState): PermissionDefinition[] {
  const q = (filter.searchQuery || '').trim().toLowerCase();
  const rolePerms =
    filter.selectedRole !== 'all' ? getEffectiveRolePermissions([filter.selectedRole]) : null;

  return PERMISSION_CATALOG.filter((perm) => {
    if (filter.selectedResource !== 'all' && perm.resource !== filter.selectedResource) {
      return false;
    }
    if (filter.onlySensitive && !perm.sensitive) {
      return false;
    }
    if (rolePerms && !rolePerms.has(perm.code)) {
      return false;
    }
    if (q) {
      return (
        perm.code.toLowerCase().includes(q) ||
        perm.titleFa.toLowerCase().includes(q) ||
        perm.descriptionFa.toLowerCase().includes(q)
      );
    }
    return true;
  });
}

export function applyWorkspaceMemberRoleChange(params: {
  actorContext: AccessContext;
  members: readonly WorkspaceMemberAccessProfile[];
  targetUserId: string;
  nextRole: CanonicalBaseRole;
  confirmedByUser: boolean;
}): {
  ok: boolean;
  reason: string;
  messageFa: string;
  updatedMembers: WorkspaceMemberAccessProfile[];
  auditEntry?: PermissionChangeAuditItem;
} {
  const { actorContext, members, targetUserId, nextRole, confirmedByUser } = params;

  const accessDecision = evaluateAccessPolicy({
    permission: 'workspace:assign:workspace',
    context: actorContext,
    confirmedByUser,
  });

  if (!accessDecision.allowed) {
    return {
      ok: false,
      reason: accessDecision.reason,
      messageFa: accessDecision.userMessageFa,
      updatedMembers: [...members],
    };
  }

  const safety = validateWorkspaceMemberMutation({
    actorContext,
    workspaceId: actorContext.activeWorkspaceId || 'ws-default',
    targetUserId,
    nextRole,
    currentMembers: members.map((m) => ({
      userId: m.userId,
      workspaceId: m.workspaceId,
      role: m.role,
      status: m.status,
    })),
  });

  if (!safety.allowed) {
    return {
      ok: false,
      reason: safety.reason,
      messageFa: safety.messageFa,
      updatedMembers: [...members],
    };
  }

  const nowIso = new Date().toISOString();
  const updatedMembers = members.map((m) =>
    m.userId === targetUserId
      ? {
          ...m,
          role: nextRole,
          updatedAtIso: nowIso,
        }
      : m
  );

  triggerPermissionInvalidation({
    reason: 'ROLE_CHANGED',
    userId: targetUserId,
    workspaceId: actorContext.activeWorkspaceId,
    currentPermissionVersion: actorContext.permissionVersion,
  });

  return {
    ok: true,
    reason: 'ROLE_UPDATED',
    messageFa: `نقش کاربر با موفقیت به «${ROLE_DEFINITIONS[nextRole].titleFa}» تغییر یافت.`,
    updatedMembers,
    auditEntry: {
      id: `aud-${Date.now()}`,
      workspaceId: actorContext.activeWorkspaceId || 'ws-default',
      actorUserId: actorContext.userId || 'unknown',
      targetUserId,
      actionType: 'ROLE_CHANGE',
      summaryFa: `تغییر نقش عضو ${targetUserId} به ${ROLE_DEFINITIONS[nextRole].titleFa}`,
      createdAtIso: nowIso,
    },
  };
}

export function buildPermissionManagementSummary(context: AccessContext): {
  totalResourceGroups: number;
  totalPermissions: number;
  activeRoleTitleFa: string;
  effectivePermissionCount: number;
  explicitDenyCount: number;
  activeTempGrantsCount: number;
} {
  const nowMs = context.nowMs ?? Date.now();
  const rolePerms = getEffectiveRolePermissions([context.activeRole]);
  return {
    totalResourceGroups: RESOURCE_GROUP_REGISTRY.length,
    totalPermissions: PERMISSION_CATALOG.length,
    activeRoleTitleFa: ROLE_DEFINITIONS[context.activeRole]?.titleFa || context.activeRole,
    effectivePermissionCount: rolePerms.size + context.explicitAllowPermissions.length,
    explicitDenyCount: context.explicitDenyPermissions.length,
    activeTempGrantsCount: (context.temporaryGrants || []).filter((g) => g.expiresAtMs > nowMs).length,
  };
}
