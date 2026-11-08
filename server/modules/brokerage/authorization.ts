/**
 * @file server/modules/brokerage/authorization.ts
 * @description Agency-Specific Role-Based Access Control (RBAC), Delegation, and Invariant Guards.
 */

import type {
  InternalAgencyRole,
  AgencyMembershipRecord,
  AgencyRecord,
} from './types';

export type AgencyPermission =
  | 'agency.manage_settings'
  | 'agency.manage_branches'
  | 'agency.manage_memberships'
  | 'agency.manage_teams'
  | 'agency.manage_mandates'
  | 'agency.assign_listings'
  | 'agency.view_commission_agreements'
  | 'agency.manage_commission_agreements'
  | 'agency.view_reports'
  | 'agency.submit_credentials';

export interface AuthorizationContext {
  principalUid: string;
  isPlatformAdmin?: boolean;
  membership?: AgencyMembershipRecord | null;
  agency?: AgencyRecord | null;
  targetBranchId?: string | null;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
  failureCode?:
    | 'UNAUTHENTICATED'
    | 'NOT_A_MEMBER'
    | 'MEMBERSHIP_SUSPENDED'
    | 'AGENCY_SUSPENDED'
    | 'INSUFFICIENT_ROLE'
    | 'BRANCH_SCOPE_MISMATCH'
    | 'UNAUTHORIZED_ROLE_ESCALATION';
}

const ROLE_PERMISSIONS_MAP: Record<InternalAgencyRole, ReadonlySet<AgencyPermission>> = {
  agency_owner: new Set<AgencyPermission>([
    'agency.manage_settings',
    'agency.manage_branches',
    'agency.manage_memberships',
    'agency.manage_teams',
    'agency.manage_mandates',
    'agency.assign_listings',
    'agency.view_commission_agreements',
    'agency.manage_commission_agreements',
    'agency.view_reports',
    'agency.submit_credentials',
  ]),
  agency_director: new Set<AgencyPermission>([
    'agency.manage_settings',
    'agency.manage_branches',
    'agency.manage_memberships',
    'agency.manage_teams',
    'agency.manage_mandates',
    'agency.assign_listings',
    'agency.view_commission_agreements',
    'agency.manage_commission_agreements',
    'agency.view_reports',
    'agency.submit_credentials',
  ]),
  general_manager: new Set<AgencyPermission>([
    'agency.manage_branches',
    'agency.manage_memberships',
    'agency.manage_teams',
    'agency.manage_mandates',
    'agency.assign_listings',
    'agency.view_commission_agreements',
    'agency.manage_commission_agreements',
    'agency.view_reports',
    'agency.submit_credentials',
  ]),
  branch_manager: new Set<AgencyPermission>([
    'agency.manage_memberships',
    'agency.manage_teams',
    'agency.manage_mandates',
    'agency.assign_listings',
    'agency.view_commission_agreements',
    'agency.view_reports',
    'agency.submit_credentials',
  ]),
  senior_consultant: new Set<AgencyPermission>([
    'agency.manage_mandates',
    'agency.view_commission_agreements',
    'agency.view_reports',
  ]),
  real_estate_consultant: new Set<AgencyPermission>([
    'agency.manage_mandates',
    'agency.view_commission_agreements',
    'agency.view_reports',
  ]),
  listing_coordinator: new Set<AgencyPermission>([
    'agency.assign_listings',
    'agency.manage_mandates',
    'agency.view_reports',
  ]),
  operations_employee: new Set<AgencyPermission>([
    'agency.view_reports',
  ]),
  administrative_employee: new Set<AgencyPermission>([
    'agency.view_reports',
  ]),
};

export const ROLE_HIERARCHY_LEVEL: Record<InternalAgencyRole, number> = {
  agency_owner: 100,
  agency_director: 90,
  general_manager: 80,
  branch_manager: 70,
  senior_consultant: 50,
  listing_coordinator: 45,
  real_estate_consultant: 40,
  operations_employee: 30,
  administrative_employee: 20,
};

/**
 * Validates whether an actor with an active membership can perform an action within an agency and branch.
 */
export function authorizeAgencyAction(
  permission: AgencyPermission,
  ctx: AuthorizationContext,
): AuthorizationDecision {
  if (ctx.isPlatformAdmin) {
    return { allowed: true };
  }

  if (!ctx.principalUid) {
    return { allowed: false, reason: 'Principal not authenticated', failureCode: 'UNAUTHENTICATED' };
  }

  if (ctx.agency) {
    if (ctx.agency.operatingStatus === 'suspended' || ctx.agency.operatingStatus === 'restricted' || ctx.agency.operatingStatus === 'closed') {
      return {
        allowed: false,
        reason: `Agency operations are currently ${ctx.agency.operatingStatus}.`,
        failureCode: 'AGENCY_SUSPENDED',
      };
    }
  }

  const membership = ctx.membership;
  if (!membership || membership.status !== 'active') {
    return {
      allowed: false,
      reason: 'Active membership required for this agency.',
      failureCode: membership?.status === 'suspended' ? 'MEMBERSHIP_SUSPENDED' : 'NOT_A_MEMBER',
    };
  }

  // Branch manager scope check
  if (membership.role === 'branch_manager' && ctx.targetBranchId && membership.branchId) {
    if (ctx.targetBranchId !== membership.branchId) {
      return {
        allowed: false,
        reason: 'Branch managers can only perform operations within their assigned branch.',
        failureCode: 'BRANCH_SCOPE_MISMATCH',
      };
    }
  }

  const allowedPermissions = ROLE_PERMISSIONS_MAP[membership.role];
  if (!allowedPermissions || !allowedPermissions.has(permission)) {
    return {
      allowed: false,
      reason: `Role '${membership.role}' does not hold permission '${permission}'.`,
      failureCode: 'INSUFFICIENT_ROLE',
    };
  }

  return { allowed: true };
}

/**
 * Prevents unauthorized role escalation:
 * - No user can assign `agency_owner` unless they are already `agency_owner`.
 * - Actor's hierarchy level must be strictly greater than target role hierarchy level.
 */
export function validateRoleAssignmentPermission(
  actorRole: InternalAgencyRole,
  targetRole: InternalAgencyRole,
  actorUid: string,
  targetUserUid: string,
): AuthorizationDecision {
  if (actorUid === targetUserUid && targetRole === 'agency_owner' && actorRole !== 'agency_owner') {
    return {
      allowed: false,
      reason: 'Users cannot self-assign agency owner privileges.',
      failureCode: 'UNAUTHORIZED_ROLE_ESCALATION',
    };
  }

  if (targetRole === 'agency_owner' && actorRole !== 'agency_owner') {
    return {
      allowed: false,
      reason: 'Only the current agency owner can transfer or assign the agency_owner role.',
      failureCode: 'UNAUTHORIZED_ROLE_ESCALATION',
    };
  }

  const actorLevel = ROLE_HIERARCHY_LEVEL[actorRole] ?? 0;
  const targetLevel = ROLE_HIERARCHY_LEVEL[targetRole] ?? 0;

  if (actorLevel <= targetLevel && actorRole !== 'agency_owner') {
    return {
      allowed: false,
      reason: `Role '${actorRole}' (level ${actorLevel}) cannot assign or escalate to role '${targetRole}' (level ${targetLevel}).`,
      failureCode: 'UNAUTHORIZED_ROLE_ESCALATION',
    };
  }

  return { allowed: true };
}
