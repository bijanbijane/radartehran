/**
 * @file src/platform/authorization/policies/workspacePolicy.ts
 * @description Multi-role workspace boundary isolation and Last Active Manager protection.
 */

import type { AccessContext, CanonicalBaseRole } from '../core/AccessContext';

export interface WorkspaceMemberRecord {
  userId: string;
  workspaceId: string;
  role: CanonicalBaseRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_INVITE';
}

export interface WorkspaceMutationSafetyResult {
  allowed: boolean;
  reason: 'OK' | 'LAST_ACTIVE_MANAGER_PROTECTED' | 'CROSS_WORKSPACE_FORBIDDEN' | 'SELF_LOCKOUT_PROTECTED';
  messageFa: string;
}

const MANAGER_ROLES = new Set<CanonicalBaseRole>(['agency_manager', 'admin']);

export function validateWorkspaceMemberMutation(params: {
  actorContext: AccessContext;
  workspaceId: string;
  targetUserId: string;
  nextRole?: CanonicalBaseRole;
  removeMember?: boolean;
  currentMembers: readonly WorkspaceMemberRecord[];
}): WorkspaceMutationSafetyResult {
  const { actorContext, workspaceId, targetUserId, nextRole, removeMember, currentMembers } = params;

  if (actorContext.activeWorkspaceId !== workspaceId && actorContext.activeRole !== 'admin') {
    return {
      allowed: false,
      reason: 'CROSS_WORKSPACE_FORBIDDEN',
      messageFa: 'تغییر اعضای فضای کاری دیگر بدون تغییر محیط فعال مجاز نیست.',
    };
  }

  const activeManagers = currentMembers.filter(
    (m) => m.workspaceId === workspaceId && m.status === 'ACTIVE' && MANAGER_ROLES.has(m.role)
  );

  const targetMember = currentMembers.find(
    (m) => m.workspaceId === workspaceId && m.userId === targetUserId && m.status === 'ACTIVE'
  );

  if (targetMember && MANAGER_ROLES.has(targetMember.role)) {
    const wouldLoseManagerRole =
      Boolean(removeMember) || Boolean(nextRole && !MANAGER_ROLES.has(nextRole));
    if (wouldLoseManagerRole && activeManagers.length <= 1) {
      return {
        allowed: false,
        reason: 'LAST_ACTIVE_MANAGER_PROTECTED',
        messageFa: 'حذف یا تنزل سطح دسترسی تنها مدیر فعال فضای کاری مجاز نیست. ابتدا مدیر جایگزین تعیین کنید.',
      };
    }
  }

  return {
    allowed: true,
    reason: 'OK',
    messageFa: 'تغییر نقش عضو فضای کاری مجاز است.',
  };
}

export function switchAccessWorkspaceContext(
  current: AccessContext,
  nextWorkspaceId: string | null,
  nextRole: CanonicalBaseRole,
  nextWorkspaceType: AccessContext['activeWorkspaceType'] = 'personal'
): AccessContext {
  return {
    ...current,
    activeWorkspaceId: nextWorkspaceId,
    activeWorkspaceType: nextWorkspaceType,
    activeWorkspaceStatus: 'ACTIVE',
    activeRole: nextRole,
    // Temporary workspace-scoped grants from old workspace do not carry over
    temporaryGrants: (current.temporaryGrants || []).filter(
      (g) => !g.workspaceId || g.workspaceId === nextWorkspaceId
    ),
    permissionVersion: current.permissionVersion + 1,
  };
}
