/**
 * @file src/platform/identity/index.ts
 * @description Stage 11 (RT-FE-REBUILD-PROFILE-IDENTITY-011) — Identity, Profile, Role, Permission,
 * Verification State Machine, Public vs Private Field Stripping & Organization Workspace Isolation.
 */

export const RT_FE_REBUILD_STAGE_11_SPEC_ID = 'RT-FE-REBUILD-PROFILE-IDENTITY-011' as const;

export const EIGHT_IDENTITY_CONCEPTS = [
  'Identity',
  'Profile',
  'Role',
  'Permission',
  'Credential',
  'Verification',
  'Reputation',
  'Membership',
] as const;

export type VerificationLifecycleStatus =
  | 'NOT_SUBMITTED'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'RESUBMISSION_REQUIRED'
  | 'EXPIRED'
  | 'SUSPENDED';

export type OrganizationMembershipState = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

const PRIVATE_PROFILE_FIELDS = new Set([
  'phone',
  'mobile',
  'email',
  'nationalId',
  'identityDocumentUrl',
  'recoveryCodes',
  'reviewHistoryInternal',
  'exactHomeAddress',
  'authSubjectUid',
]);

export function stripPrivateFieldsForPublicProfile(
  rawProfile: Record<string, unknown>,
): {
  readonly publicPayload: Record<string, unknown>;
  readonly strippedPrivateKeys: readonly string[];
} {
  const publicPayload: Record<string, unknown> = {};
  const strippedPrivateKeys: string[] = [];

  for (const [key, value] of Object.entries(rawProfile)) {
    if (PRIVATE_PROFILE_FIELDS.has(key)) {
      strippedPrivateKeys.push(key);
    } else {
      publicPayload[key] = value;
    }
  }

  return { publicPayload, strippedPrivateKeys };
}

export function resolveTrustBadgeDisplay(input: {
  verificationStatus: VerificationLifecycleStatus;
  issuedByAuthorityId?: string | null;
  expiresAtMs?: number | null;
  nowMs?: number;
}): {
  readonly showVerifiedBadge: boolean;
  readonlyeffectiveStatus: VerificationLifecycleStatus;
  readonly badgeLabelFa: string;
} {
  const nowMs = input.nowMs ?? Date.now();
  if (input.expiresAtMs != null && nowMs > input.expiresAtMs) {
    return {
      showVerifiedBadge: false,
      readonlyeffectiveStatus: 'EXPIRED',
      badgeLabelFa: 'مدرک منقضی‌شده (نیاز به تمدید)',
    };
  }
  if (
    (input.verificationStatus === 'VERIFIED' || input.verificationStatus === 'APPROVED') &&
    Boolean(input.issuedByAuthorityId && input.issuedByAuthorityId.trim().length > 0)
  ) {
    return {
      showVerifiedBadge: true,
      readonlyeffectiveStatus: 'VERIFIED',
      badgeLabelFa: 'هویت حرفه‌ای تأییدشده توسط مرجع رسمی',
    };
  }
  return {
    showVerifiedBadge: false,
    readonlyeffectiveStatus: input.verificationStatus,
    badgeLabelFa: 'تأییدنشده یا در انتظار بررسی مرجع',
  };
}

export function evaluateOrganizationActionPermission(input: {
  membershipState: OrganizationMembershipState;
  organizationId: string;
  activeWorkspaceOrganizationId: string;
  grantedPermissions: readonly string[];
  requiredPermission: string;
}): {
  readonly allowed: boolean;
  readonly reasonCode: 'ALLOWED' | 'CROSS_ORGANIZATION_ISOLATION_BLOCKED' | 'MEMBERSHIP_NOT_ACTIVE' | 'MISSING_PERMISSION';
} {
  if (input.organizationId !== input.activeWorkspaceOrganizationId) {
    return { allowed: false, reasonCode: 'CROSS_ORGANIZATION_ISOLATION_BLOCKED' };
  }
  if (input.membershipState !== 'ACTIVE') {
    return { allowed: false, reasonCode: 'MEMBERSHIP_NOT_ACTIVE' };
  }
  if (!input.grantedPermissions.includes(input.requiredPermission)) {
    return { allowed: false, reasonCode: 'MISSING_PERMISSION' };
  }
  return { allowed: true, reasonCode: 'ALLOWED' };
}
