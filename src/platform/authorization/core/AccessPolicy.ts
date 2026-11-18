/**
 * @file src/platform/authorization/core/AccessPolicy.ts
 * @description 7-Step Deterministic Access Policy Engine (Explicit Deny > Allow, zero role===admin shortcuts).
 */

import type { AccessContext, ResourceTargetContext } from './AccessContext';
import type { AccessDecision, ActionUiVisibilityState } from './AccessDecision';
import { parsePermissionCode, type CanonicalPermissionCode, type PermissionScope } from './Permission';
import { PERMISSION_REGISTRY_MAP } from '../catalog/permissionRegistry';
import { getEffectiveRolePermissions } from '../policies/rolePolicy';

export interface EvaluateAccessOptions {
  permission: CanonicalPermissionCode | string;
  context: AccessContext;
  resource?: ResourceTargetContext;
  featureFlagKey?: string;
  confirmedByUser?: boolean;
  defaultDeniedUiState?: Exclude<ActionUiVisibilityState, 'Visible'>;
}

function matchesResourceScope(scope: PermissionScope, ctx: AccessContext, target?: ResourceTargetContext): boolean {
  if (scope === 'global' || !target) return true;
  if (scope === 'own') return Boolean(ctx.userId && target.ownerUserId && ctx.userId === target.ownerUserId);
  if (scope === 'assigned') {
    if (ctx.userId && target.ownerUserId === ctx.userId) return true;
    return Boolean(ctx.userId && target.assignedUserIds?.includes(ctx.userId));
  }
  if (scope === 'workspace' || scope === 'agency' || scope === 'provider') {
    const targetWs = target.workspaceId || target.agencyId || target.providerId;
    return targetWs ? Boolean(ctx.activeWorkspaceId && ctx.activeWorkspaceId === targetWs) : Boolean(ctx.activeWorkspaceId);
  }
  if (scope === 'city') {
    if (!target.cityId || !ctx.assignedCityIds || ctx.assignedCityIds.length === 0) return true;
    return ctx.assignedCityIds.includes(target.cityId);
  }
  return false;
}

const SCOPE_RANK: Record<PermissionScope, number> = {
  own: 1,
  assigned: 2,
  provider: 3,
  agency: 3,
  workspace: 3,
  city: 4,
  global: 5,
};

export function evaluateAccessPolicy(options: EvaluateAccessOptions): AccessDecision {
  const nowMs = options.context.nowMs ?? Date.now();
  const deniedUi = options.defaultDeniedUiState ?? 'Hidden';
  const parsed = parsePermissionCode(String(options.permission));

  if (!parsed.valid || !parsed.code) {
    return {
      allowed: false,
      reason: 'INVALID_PERMISSION_FORMAT',
      decidedAtStep: 'STEP_1_AUTHENTICATION_AND_ACCOUNT_STATE',
      permission: String(options.permission),
      uiState: 'Hidden',
      requiresStepUp: false,
      requiresConfirmation: false,
      userMessageFa: 'شناسه مجوز نامعتبر است (ساختار استاندارد resource:action:scope رعایت نشده است).',
      evaluatedAtMs: nowMs,
    };
  }

  const code = parsed.code;
  const permDef = PERMISSION_REGISTRY_MAP.get(code);
  const { context, resource } = options;

  // STEP 2: Feature Availability check
  if (options.featureFlagKey && context.featureFlags && context.featureFlags[options.featureFlagKey] === false) {
    return {
      allowed: false,
      reason: 'FEATURE_DISABLED',
      decidedAtStep: 'STEP_2_FEATURE_AVAILABILITY',
      permission: code,
      uiState: 'Disabled',
      requiresStepUp: false,
      requiresConfirmation: false,
      userMessageFa: 'این قابلیت در حال حاضر در پیکربندی سامانه غیرفعال است.',
      evaluatedAtMs: nowMs,
    };
  }

  // STEP 1: Authentication & Account Security State
  const guestReadAllowed =
    !context.isAuthenticated &&
    context.activeRole === 'guest' &&
    parsed.action === 'read' &&
    parsed.scope === 'global' &&
    ['property', 'listing', 'neighborhood', 'market', 'valuation', 'service', 'provider', 'community'].includes(parsed.resource);

  if (!context.isAuthenticated && !guestReadAllowed) {
    return {
      allowed: false,
      reason: 'UNAUTHENTICATED',
      decidedAtStep: 'STEP_1_AUTHENTICATION_AND_ACCOUNT_STATE',
      permission: code,
      uiState: 'Restricted',
      requiresStepUp: false,
      requiresConfirmation: false,
      userMessageFa: 'برای انجام این عملیات ابتدا وارد حساب کاربری خود شوید.',
      ctaLabelFa: 'ورود به حساب کاربری',
      evaluatedAtMs: nowMs,
    };
  }

  if (context.accountStatus === 'LOCKED' || context.accountStatus === 'SUSPENDED') {
    return {
      allowed: false,
      reason: 'ACCOUNT_LOCKED_OR_SUSPENDED',
      decidedAtStep: 'STEP_1_AUTHENTICATION_AND_ACCOUNT_STATE',
      permission: code,
      uiState: 'Disabled',
      requiresStepUp: false,
      requiresConfirmation: false,
      userMessageFa: 'حساب کاربری شما موقتاً مسدود یا تعلیق شده است.',
      ctaLabelFa: 'تماس با پشتیبانی',
      evaluatedAtMs: nowMs,
    };
  }

  // STEP 3: Workspace Boundary
  if (
    ['workspace', 'agency', 'provider'].includes(parsed.scope) &&
    (!context.activeWorkspaceId || (context.activeWorkspaceStatus && context.activeWorkspaceStatus !== 'ACTIVE'))
  ) {
    return {
      allowed: false,
      reason: 'WORKSPACE_INACTIVE_OR_MISMATCH',
      decidedAtStep: 'STEP_3_WORKSPACE_BOUNDARY',
      permission: code,
      uiState: deniedUi,
      requiresStepUp: false,
      requiresConfirmation: false,
      userMessageFa: 'فضای کاری فعال و معتبری برای این عملیات انتخاب نشده است.',
      ctaLabelFa: 'انتخاب فضای کاری',
      evaluatedAtMs: nowMs,
    };
  }

  // STEP 4: Explicit Deny > Allow (No role bypasses Explicit Deny)
  const globalDenyCode = `${parsed.resource}:${parsed.action}:global` as CanonicalPermissionCode;
  if (context.explicitDenyPermissions.includes(code) || context.explicitDenyPermissions.includes(globalDenyCode)) {
    return {
      allowed: false,
      reason: 'EXPLICIT_DENY',
      decidedAtStep: 'STEP_4_EXPLICIT_DENY_OVERRIDE',
      permission: code,
      uiState: deniedUi,
      requiresStepUp: false,
      requiresConfirmation: false,
      userMessageFa: 'دسترسی به این عملیات به صورت صریح محدود شده است.',
      evaluatedAtMs: nowMs,
    };
  }

  // STEP 5: Role + Workspace + Explicit Allow + Non-expired Temporary Grants
  const wsRoles =
    context.activeWorkspaceId && context.workspaceRoles?.[context.activeWorkspaceId]
      ? context.workspaceRoles[context.activeWorkspaceId]
      : [];
  const activeRolesToEvaluate = Array.from(new Set([context.activeRole, ...wsRoles]));
  const candidatePermissions = new Set<CanonicalPermissionCode>([
    ...getEffectiveRolePermissions(activeRolesToEvaluate),
    ...context.explicitAllowPermissions,
  ]);

  let hasExpiredTempGrant = false;
  for (const grant of context.temporaryGrants || []) {
    if (grant.workspaceId && grant.workspaceId !== context.activeWorkspaceId) continue;
    if (grant.expiresAtMs <= nowMs) {
      if (grant.permission === code) hasExpiredTempGrant = true;
      continue;
    }
    candidatePermissions.add(grant.permission);
  }

  let matchedGrant: CanonicalPermissionCode | null = candidatePermissions.has(code) ? code : null;
  if (!matchedGrant) {
    for (const cand of candidatePermissions) {
      const p = parsePermissionCode(cand);
      if (p.valid && p.resource === parsed.resource && p.action === parsed.action && p.scope && SCOPE_RANK[p.scope] >= SCOPE_RANK[parsed.scope!]) {
        matchedGrant = cand;
        break;
      }
    }
  }

  if (!matchedGrant) {
    return {
      allowed: false,
      reason: hasExpiredTempGrant ? 'TEMPORARY_GRANT_EXPIRED' : 'MISSING_PERMISSION',
      decidedAtStep: 'STEP_5_PERMISSION_AND_TEMPORARY_GRANT',
      permission: code,
      uiState: deniedUi,
      requiresStepUp: false,
      requiresConfirmation: false,
      userMessageFa: hasExpiredTempGrant
        ? 'مهلت مجوز موقت شما برای این عملیات به پایان رسیده است.'
        : 'سطح دسترسی فعلی شما مجوز انجام این عملیات را ندارد.',
      evaluatedAtMs: nowMs,
    };
  }

  // STEP 6: Resource Scope Ownership & Workspace Match
  const matchedParsed = parsePermissionCode(matchedGrant);
  const effectiveScopeToVerify = matchedParsed.scope === 'global' ? 'global' : parsed.scope!;
  if (!matchesResourceScope(effectiveScopeToVerify, context, resource)) {
    return {
      allowed: false,
      reason: 'SCOPE_OWNERSHIP_MISMATCH',
      decidedAtStep: 'STEP_6_RESOURCE_SCOPE_OWNERSHIP',
      permission: code,
      uiState: deniedUi,
      requiresStepUp: false,
      requiresConfirmation: false,
      userMessageFa: 'این مورد خارج از مالکیت یا فضای کاری مجاز شما قرار دارد.',
      evaluatedAtMs: nowMs,
    };
  }

  // STEP 7: Impersonation & Step-Up Verification & Explicit Confirmation
  if (context.isImpersonating && (permDef?.sensitive || parsed.action !== 'read')) {
    return {
      allowed: false,
      reason: 'IMPERSONATION_RESTRICTED',
      decidedAtStep: 'STEP_7_SENSITIVE_ACTION_AND_IMPERSONATION',
      permission: code,
      uiState: 'Disabled',
      requiresStepUp: false,
      requiresConfirmation: false,
      userMessageFa: 'در حالت مشاهده پشتیبانی (Impersonation)، اجرای عملیات تغییردهنده یا حساس مجاز نیست.',
      evaluatedAtMs: nowMs,
    };
  }

  if (permDef?.requiresStepUp) {
    const maxAge = context.stepUpMaxAgeMs ?? 5 * 60 * 1000;
    const isStepUpFresh =
      typeof context.stepUpVerifiedAtMs === 'number' &&
      nowMs - context.stepUpVerifiedAtMs >= 0 &&
      nowMs - context.stepUpVerifiedAtMs <= maxAge;
    if (!isStepUpFresh) {
      return {
        allowed: false,
        reason: 'STEP_UP_VERIFICATION_REQUIRED',
        decidedAtStep: 'STEP_7_SENSITIVE_ACTION_AND_IMPERSONATION',
        permission: code,
        uiState: 'Restricted',
        requiresStepUp: true,
        requiresConfirmation: Boolean(permDef.requiresConfirmation),
        userMessageFa: 'برای اجرای این عملیات حساس، تأیید هویت مجدد (Step-Up Verification) الزامی است.',
        ctaLabelFa: 'تأیید هویت مجدد',
        evaluatedAtMs: nowMs,
      };
    }
  }

  if (permDef?.requiresConfirmation && options.confirmedByUser === false) {
    return {
      allowed: false,
      reason: 'CONFIRMATION_REQUIRED',
      decidedAtStep: 'STEP_7_SENSITIVE_ACTION_AND_IMPERSONATION',
      permission: code,
      uiState: 'Restricted',
      requiresStepUp: false,
      requiresConfirmation: true,
      userMessageFa: 'این عملیات نیازمند تأیید صریح نهایی توسط شما است.',
      ctaLabelFa: 'تأیید و ادامه',
      evaluatedAtMs: nowMs,
    };
  }

  return {
    allowed: true,
    reason: 'ALLOWED',
    decidedAtStep: 'STEP_7_SENSITIVE_ACTION_AND_IMPERSONATION',
    permission: code,
    uiState: 'Visible',
    requiresStepUp: Boolean(permDef?.requiresStepUp),
    requiresConfirmation: Boolean(permDef?.requiresConfirmation),
    userMessageFa: 'دسترسی مجاز است.',
    evaluatedAtMs: nowMs,
  };
}
