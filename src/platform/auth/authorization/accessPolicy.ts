/** @file src/platform/auth/authorization/accessPolicy.ts — Unified 3-Level Access Policy (Route, Component, Action) */
import type { WorkspaceType } from '../core/authState';
import type { RadarPermissionId, PermissionKey } from './permissionResolver';
import type { AppRole } from './roleResolver';

export type AccessTargetLevel = 'route' | 'component' | 'action';

export interface AccessPolicyRule {
  readonly id: string;
  readonly level: AccessTargetLevel;
  readonly target: string;
  readonly requiresAuth: boolean;
  readonly allowedWorkspaceTypes?: readonly WorkspaceType[];
  readonly requiredPermissions: readonly RadarPermissionId[];
  readonly requiresStepUpReauth?: boolean;
  readonly blockedDuringImpersonation?: boolean;
  readonly featureFlagKey?: string;
}

export const RADAR_ACCESS_POLICY_REGISTRY: readonly AccessPolicyRule[] = [
  {
    id: 'ROUTE_ACCOUNT',
    level: 'route',
    target: '/account',
    requiresAuth: true,
    requiredPermissions: ['personal:shortlist:read'],
  },
  {
    id: 'ROUTE_WORKSPACE_PERSONAL',
    level: 'route',
    target: '/workspace/personal',
    requiresAuth: true,
    allowedWorkspaceTypes: ['personal'],
    requiredPermissions: ['personal:shortlist:read'],
  },
  {
    id: 'ROUTE_WORKSPACE_AGENCY',
    level: 'route',
    target: '/workspace/agency',
    requiresAuth: true,
    allowedWorkspaceTypes: ['agency'],
    requiredPermissions: ['agency:workspace:view'],
  },
  {
    id: 'ROUTE_WORKSPACE_SERVICES',
    level: 'route',
    target: '/workspace/services',
    requiresAuth: true,
    allowedWorkspaceTypes: ['service'],
    requiredPermissions: ['service:workspace:view'],
  },
  {
    id: 'ROUTE_PROFESSIONAL_DASHBOARD',
    level: 'route',
    target: '/professional/dashboard',
    requiresAuth: true,
    allowedWorkspaceTypes: ['agency', 'service'],
    requiredPermissions: [],
  },
  {
    id: 'ROUTE_ADMIN',
    level: 'route',
    target: '/admin',
    requiresAuth: true,
    requiredPermissions: ['admin:dashboard:view'],
  },
  {
    id: 'COMPONENT_APPROVE_LISTING_BTN',
    level: 'component',
    target: 'agency.approve_listing_button',
    requiresAuth: true,
    allowedWorkspaceTypes: ['agency'],
    requiredPermissions: ['agency:listing:approve'],
  },
  {
    id: 'COMPONENT_ADMIN_MODERATION_PANEL',
    level: 'component',
    target: 'admin.moderation_panel',
    requiresAuth: true,
    requiredPermissions: ['admin:moderation:approve'],
  },
  {
    id: 'ACTION_DELETE_ACCOUNT',
    level: 'action',
    target: 'account.delete',
    requiresAuth: true,
    requiredPermissions: ['personal:account:delete'],
    requiresStepUpReauth: true,
    blockedDuringImpersonation: true,
  },
  {
    id: 'ACTION_CHANGE_PHONE',
    level: 'action',
    target: 'account.change_phone',
    requiresAuth: true,
    requiredPermissions: ['personal:shortlist:write'],
    requiresStepUpReauth: true,
    blockedDuringImpersonation: true,
  },
  {
    id: 'ACTION_CHANGE_RECOVERY_METHOD',
    level: 'action',
    target: 'account.change_recovery',
    requiresAuth: true,
    requiredPermissions: ['personal:shortlist:write'],
    requiresStepUpReauth: true,
    blockedDuringImpersonation: true,
  },
  {
    id: 'ACTION_TRANSFER_OWNERSHIP',
    level: 'action',
    target: 'property.transfer_ownership',
    requiresAuth: true,
    requiredPermissions: ['personal:listing:submit'],
    requiresStepUpReauth: true,
    blockedDuringImpersonation: true,
  },
  {
    id: 'ACTION_FINANCIAL_WITHDRAWAL',
    level: 'action',
    target: 'finance.settlement_withdraw',
    requiresAuth: true,
    requiredPermissions: ['agency:settlement:withdraw'],
    requiresStepUpReauth: true,
    blockedDuringImpersonation: true,
  },
  {
    id: 'ACTION_MANAGE_ADMIN_PERMISSIONS',
    level: 'action',
    target: 'admin.manage_permissions',
    requiresAuth: true,
    requiredPermissions: ['admin:permissions:manage'],
    requiresStepUpReauth: true,
    blockedDuringImpersonation: true,
  },
  {
    id: 'ACTION_START_IMPERSONATION',
    level: 'action',
    target: 'admin.start_impersonation',
    requiresAuth: true,
    requiredPermissions: ['admin:impersonation:start'],
    requiresStepUpReauth: true,
    blockedDuringImpersonation: true,
  },
] as const;

export function findAccessPolicyRule(level: AccessTargetLevel, target: string): AccessPolicyRule | null {
  const cleanTarget = target.trim();
  for (const rule of RADAR_ACCESS_POLICY_REGISTRY) {
    if (rule.level !== level) continue;
    if (level === 'route' && (cleanTarget === rule.target || cleanTarget.startsWith(`${rule.target}/`))) {
      return rule;
    }
    if (rule.target === cleanTarget) return rule;
  }
  return null;
}

export interface SimpleAccessEvalContext {
  readonly isAuthenticated: boolean;
  readonly activeRole: AppRole;
  readonly permissions: readonly PermissionKey[];
  readonly workspaceId: string;
  readonly isStepUpVerified?: boolean;
}

export function evaluateRouteAccess(
  path: string,
  ctx: SimpleAccessEvalContext
): { allowed: boolean; reason?: string; fallbackRoute?: string } {
  if (path.startsWith('/admin')) {
    if (!ctx.isAuthenticated) return { allowed: false, reason: 'UNAUTHENTICATED', fallbackRoute: '/login' };
    if (ctx.activeRole !== 'admin' && ctx.activeRole !== 'platform_admin' && !ctx.permissions.includes('admin:governance')) {
      return { allowed: false, reason: 'FORBIDDEN_ADMIN_ROUTE', fallbackRoute: '/' };
    }
  }
  if (path.startsWith('/agency')) {
    if (!ctx.isAuthenticated) return { allowed: false, reason: 'UNAUTHENTICATED', fallbackRoute: '/login' };
    if (!['agency_agent', 'agency_admin', 'agency_consultant', 'agency_manager', 'admin'].includes(ctx.activeRole)) {
      return { allowed: false, reason: 'FORBIDDEN_AGENCY_ROUTE', fallbackRoute: '/' };
    }
  }
  if (path.startsWith('/service')) {
    if (!ctx.isAuthenticated) return { allowed: false, reason: 'UNAUTHENTICATED', fallbackRoute: '/login' };
    if (!['service_provider', 'admin'].includes(ctx.activeRole)) {
      return { allowed: false, reason: 'FORBIDDEN_SERVICE_ROUTE', fallbackRoute: '/' };
    }
  }
  if (path.startsWith('/escrow') || path.startsWith('/profile') || path.startsWith('/saved-searches')) {
    if (!ctx.isAuthenticated) return { allowed: false, reason: 'UNAUTHENTICATED', fallbackRoute: '/login' };
  }
  return { allowed: true };
}

export function evaluateComponentAccess(
  requiredPermissions: readonly PermissionKey[],
  ctx: SimpleAccessEvalContext
): { allowed: boolean; reason?: string } {
  for (const perm of requiredPermissions) {
    if (!ctx.permissions.includes(perm)) {
      return { allowed: false, reason: 'MISSING_COMPONENT_PERMISSION' };
    }
  }
  return { allowed: true };
}

export function evaluateActionAccess(
  _actionId: string,
  requiredPermissions: readonly PermissionKey[],
  ctx: SimpleAccessEvalContext,
  requiresStepUp = false
): { allowed: boolean; requiresStepUp: boolean; reason?: string } {
  for (const perm of requiredPermissions) {
    if (!ctx.permissions.includes(perm)) {
      return { allowed: false, requiresStepUp: false, reason: 'MISSING_ACTION_PERMISSION' };
    }
  }
  if (requiresStepUp && !ctx.isStepUpVerified) {
    return { allowed: false, requiresStepUp: true, reason: 'STEP_UP_REQUIRED' };
  }
  return { allowed: true, requiresStepUp: false };
}
