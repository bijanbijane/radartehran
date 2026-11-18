/**
 * @file src/platform/authorization/cache/accessQueryKeys.ts
 * @description Canonical Workspace-isolated Access Cache Key generator.
 * Format: access:{userId}:{workspaceId}:{permissionVersion}:{resource}:{action}
 */

import type { AccessContext } from '../core/AccessContext';
import type { PermissionAction, PermissionResourceGroup } from '../core/Permission';

export interface AccessCacheKeyParams {
  userId: string | null | undefined;
  workspaceId: string | null | undefined;
  permissionVersion: number;
  resource: PermissionResourceGroup | string;
  action: PermissionAction | string;
}

export function buildAccessCacheKey(params: AccessCacheKeyParams): string {
  const safeUser = (params.userId || 'guest').trim() || 'guest';
  const safeWorkspace = (params.workspaceId || 'personal').trim() || 'personal';
  const safeVersion = Number.isFinite(params.permissionVersion) ? Math.max(0, Math.floor(params.permissionVersion)) : 0;
  const safeResource = String(params.resource || 'unknown').trim();
  const safeAction = String(params.action || 'read').trim();
  return `access:${safeUser}:${safeWorkspace}:${safeVersion}:${safeResource}:${safeAction}`;
}

export function buildAccessCacheKeyFromContext(
  context: AccessContext,
  resource: PermissionResourceGroup | string,
  action: PermissionAction | string
): string {
  return buildAccessCacheKey({
    userId: context.userId,
    workspaceId: context.activeWorkspaceId,
    permissionVersion: context.permissionVersion,
    resource,
    action,
  });
}

export function buildAccessWorkspacePrefix(userId: string | null | undefined, workspaceId: string | null | undefined): string {
  const safeUser = (userId || 'guest').trim() || 'guest';
  const safeWorkspace = (workspaceId || 'personal').trim() || 'personal';
  return `access:${safeUser}:${safeWorkspace}:`;
}
