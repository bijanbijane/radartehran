import { AppRole } from '../authorization/roleResolver';

export type WorkspaceType = 'personal' | 'agency' | 'service' | 'admin';

export interface WorkspaceContextState {
  userId: string;
  workspaceId: string;
  workspaceType: WorkspaceType;
  organizationId: string | null;
  activeRole: AppRole;
  permissions: string[];
  permissionVersion: number;
  switchedAt: number;
}

export function createWorkspaceCacheNamespace(
  ctx: Pick<WorkspaceContextState, 'userId' | 'workspaceId' | 'permissionVersion'>
): string {
  return `ws:${ctx.userId}:${ctx.workspaceId}:v${ctx.permissionVersion}`;
}

export function inferWorkspaceTypeFromRole(role: AppRole): WorkspaceType {
  if (role === 'agency_admin' || role === 'agency_agent') return 'agency';
  if (role === 'service_provider') return 'service';
  if (role === 'admin' || role === 'operator_support') return 'admin';
  return 'personal';
}
