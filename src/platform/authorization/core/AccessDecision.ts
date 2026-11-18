/**
 * @file src/platform/authorization/core/AccessDecision.ts
 * @description Canonical 7-step Precedence AccessDecision & 4-state UI Action Visibility contracts.
 */

import type { CanonicalPermissionCode } from './Permission';

export type AccessDenialReason =
  | 'ALLOWED'
  | 'INVALID_PERMISSION_FORMAT'
  | 'FEATURE_DISABLED'
  | 'UNAUTHENTICATED'
  | 'ACCOUNT_LOCKED_OR_SUSPENDED'
  | 'WORKSPACE_INACTIVE_OR_MISMATCH'
  | 'EXPLICIT_DENY'
  | 'TEMPORARY_GRANT_EXPIRED'
  | 'MISSING_PERMISSION'
  | 'SCOPE_OWNERSHIP_MISMATCH'
  | 'IMPERSONATION_RESTRICTED'
  | 'STEP_UP_VERIFICATION_REQUIRED'
  | 'CONFIRMATION_REQUIRED'
  | 'LAST_ACTIVE_MANAGER_PROTECTED';

export type PrecedenceStepName =
  | 'STEP_1_AUTHENTICATION_AND_ACCOUNT_STATE'
  | 'STEP_2_FEATURE_AVAILABILITY'
  | 'STEP_3_WORKSPACE_BOUNDARY'
  | 'STEP_4_EXPLICIT_DENY_OVERRIDE'
  | 'STEP_5_PERMISSION_AND_TEMPORARY_GRANT'
  | 'STEP_6_RESOURCE_SCOPE_OWNERSHIP'
  | 'STEP_7_SENSITIVE_ACTION_AND_IMPERSONATION';

export type ActionUiVisibilityState = 'Visible' | 'Disabled' | 'Hidden' | 'Restricted';

export interface AccessDecision {
  allowed: boolean;
  reason: AccessDenialReason;
  decidedAtStep: PrecedenceStepName;
  permission?: CanonicalPermissionCode | string;
  uiState: ActionUiVisibilityState;
  requiresStepUp: boolean;
  requiresConfirmation: boolean;
  userMessageFa: string;
  ctaLabelFa?: string;
  evaluatedAtMs: number;
}

export type AccessHttpErrorCategory =
  | 'AUTH_REQUIRED_401'
  | 'FORBIDDEN_403'
  | 'NOT_FOUND_OR_MASKED_404'
  | 'VERSION_CONFLICT_409'
  | 'ACCOUNT_OR_RESOURCE_LOCKED_423'
  | 'RATE_LIMITED_429'
  | 'SERVER_ERROR_5XX'
  | 'FEATURE_DISABLED'
  | 'VERIFICATION_REQUIRED';

export interface AccessErrorResolution {
  category: AccessHttpErrorCategory;
  statusCode: number;
  titleFa: string;
  messageFa: string;
  retryable: boolean;
  requiresReauth: boolean;
  requiresPermissionRefresh: boolean;
  ctaLabelFa: string;
}
