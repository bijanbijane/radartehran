/** @file src/platform/auth/authorization/accessDecision.ts — Access Decision Evaluator & HTTP 401/403/423/429/5xx UI Behavior Matrix */
import type { AuthMachineSnapshot } from '../core/authState';
import { findAccessPolicyRule, type AccessTargetLevel } from './accessPolicy';

export type AccessDecisionOutcome =
  | 'ALLOW'
  | 'WAIT_FOR_AUTH_RESOLUTION'
  | 'REDIRECT_TO_LOGIN'
  | 'DENY_WRONG_WORKSPACE'
  | 'DENY_MISSING_PERMISSION'
  | 'REQUIRE_STEP_UP_REAUTH'
  | 'DENY_IMPERSONATION_RESTRICTED'
  | 'DENY_FEATURE_DISABLED';

export interface AccessEvaluationResult {
  readonly allowed: boolean;
  readonly outcome: AccessDecisionOutcome;
  readonly reasonFa: string;
}

export function evaluateAccessDecision(params: {
  readonly snapshot: AuthMachineSnapshot;
  readonly level: AccessTargetLevel;
  readonly target: string;
  readonly isStepUpVerified?: boolean;
  readonly isImpersonating?: boolean;
  readonly impersonationExplicitlyAllowsSensitive?: boolean;
  readonly featureEnabled?: boolean;
}): AccessEvaluationResult {
  const { snapshot, level, target } = params;

  if (params.featureEnabled === false) {
    return {
      allowed: false,
      outcome: 'DENY_FEATURE_DISABLED',
      reasonFa: 'این قابلیت در حال حاضر غیرفعال است (بدون جعل خطای مجوز).',
    };
  }

  const rule = findAccessPolicyRule(level, target);
  if (!rule) {
    return { allowed: true, outcome: 'ALLOW', reasonFa: 'مسیر یا عملیات عمومی مجاز است.' };
  }

  if (snapshot.status === 'INITIALIZING' || snapshot.status === 'RESOLVING_ACCESS') {
    return {
      allowed: false,
      outcome: 'WAIT_FOR_AUTH_RESOLUTION',
      reasonFa: 'در حال بررسی وضعیت نشست و مجوزهای دسترسی...',
    };
  }

  if (
    rule.requiresAuth &&
    (!snapshot.identity || snapshot.status === 'UNAUTHENTICATED' || snapshot.status === 'SESSION_EXPIRED')
  ) {
    return {
      allowed: false,
      outcome: 'REDIRECT_TO_LOGIN',
      reasonFa: 'برای دسترسی به این بخش ابتدا وارد حساب کاربری خود شوید.',
    };
  }

  if (
    rule.allowedWorkspaceTypes &&
    rule.allowedWorkspaceTypes.length > 0 &&
    (!snapshot.workspace || !rule.allowedWorkspaceTypes.includes(snapshot.workspace.workspaceType))
  ) {
    return {
      allowed: false,
      outcome: 'DENY_WRONG_WORKSPACE',
      reasonFa: 'این بخش مربوط به فضای کاری دیگری است؛ ابتدا Workspace مرتبط را انتخاب کنید.',
    };
  }

  for (const reqPerm of rule.requiredPermissions) {
    if (!snapshot.permissions.includes(reqPerm)) {
      return {
        allowed: false,
        outcome: 'DENY_MISSING_PERMISSION',
        reasonFa: `مجوز لازم (${reqPerm}) برای انجام این عملیات در نقش فعلی وجود ندارد.`,
      };
    }
  }

  if (params.isImpersonating && rule.blockedDuringImpersonation && !params.impersonationExplicitlyAllowsSensitive) {
    return {
      allowed: false,
      outcome: 'DENY_IMPERSONATION_RESTRICTED',
      reasonFa: 'در حالت مشاهده پشتیبانی (Impersonation)، انجام عملیات حساس و مالی مسدود است.',
    };
  }

  if (rule.requiresStepUpReauth && !params.isStepUpVerified) {
    return {
      allowed: false,
      outcome: 'REQUIRE_STEP_UP_REAUTH',
      reasonFa: 'برای انجام این عملیات حساس، احراز هویت مجدد (Step-Up Re-auth) الزامی است.',
    };
  }

  return { allowed: true, outcome: 'ALLOW', reasonFa: 'دسترسی تأیید شد.' };
}

export interface HttpAccessUiDirective {
  readonly statusOrCondition: 401 | 403 | 404 | 423 | 429 | 500 | 'FEATURE_DISABLED';
  readonly triggerTokenRefresh: boolean;
  readonly preserveFormDraft: boolean;
  readonly uiPresentation:
    | 'controlled_session_recovery_then_login'
    | 'access_denied_no_refresh'
    | 'resource_locked_with_backend_reason'
    | 'feature_disabled_banner'
    | 'not_found_view'
    | 'rate_limit_countdown'
    | 'service_error_recoverable';
  readonly messageFa: string;
}

export function resolveUiBehaviorForAccessResponse(params: {
  readonly status: number;
  readonly featureDisabled?: boolean;
  readonly backendLockReasonFa?: string;
  readonly retryAfterSeconds?: number;
}): HttpAccessUiDirective {
  if (params.featureDisabled) {
    return {
      statusOrCondition: 'FEATURE_DISABLED',
      triggerTokenRefresh: false,
      preserveFormDraft: true,
      uiPresentation: 'feature_disabled_banner',
      messageFa: 'این قابلیت در حال حاضر غیرفعال است.',
    };
  }
  if (params.status === 401) {
    return {
      statusOrCondition: 401,
      triggerTokenRefresh: true,
      preserveFormDraft: true,
      uiPresentation: 'controlled_session_recovery_then_login',
      messageFa: 'نشست منقضی شده است؛ در حال تلاش کنترل‌شده برای تمدید نشست.',
    };
  }
  if (params.status === 403) {
    return {
      statusOrCondition: 403,
      triggerTokenRefresh: false,
      preserveFormDraft: true,
      uiPresentation: 'access_denied_no_refresh',
      messageFa: 'عدم مجوز دسترسی (۴۰۳)؛ نقش یا Workspace فعلی اجازه این عملیات را ندارد.',
    };
  }
  if (params.status === 423) {
    return {
      statusOrCondition: 423,
      triggerTokenRefresh: false,
      preserveFormDraft: true,
      uiPresentation: 'resource_locked_with_backend_reason',
      messageFa: params.backendLockReasonFa || 'این رکورد توسط سرور قفل شده است (۴۲۳).',
    };
  }
  if (params.status === 404) {
    return {
      statusOrCondition: 404,
      triggerTokenRefresh: false,
      preserveFormDraft: false,
      uiPresentation: 'not_found_view',
      messageFa: 'منبع یا مسیر موردنظر یافت نشد (۴۰۴).',
    };
  }
  if (params.status === 429) {
    return {
      statusOrCondition: 429,
      triggerTokenRefresh: false,
      preserveFormDraft: true,
      uiPresentation: 'rate_limit_countdown',
      messageFa: `محدودیت تعداد درخواست (۴۲۹)؛ لطفاً ${params.retryAfterSeconds ?? 15} ثانیه صبر کنید.`,
    };
  }
  return {
    statusOrCondition: 500,
    triggerTokenRefresh: false,
    preserveFormDraft: true,
    uiPresentation: 'service_error_recoverable',
    messageFa: 'خطای موقت سرویس؛ امکان تلاش مجدد وجود دارد.',
  };
}

export function resolveAccessErrorMatrix(
  status: number,
  options?: { featureDisabled?: boolean; backendLockReasonFa?: string; retryAfterSeconds?: number }
): {
  category: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'LOCKED' | 'NOT_FOUND' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'FEATURE_DISABLED';
  preserveDraft: boolean;
  retryable: boolean;
  messageFa: string;
} {
  const directive = resolveUiBehaviorForAccessResponse({
    status,
    featureDisabled: options?.featureDisabled,
    backendLockReasonFa: options?.backendLockReasonFa,
    retryAfterSeconds: options?.retryAfterSeconds,
  });
  const categoryMap: Record<string | number, any> = {
    FEATURE_DISABLED: 'FEATURE_DISABLED',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    423: 'LOCKED',
    404: 'NOT_FOUND',
    429: 'RATE_LIMITED',
    500: 'SERVER_ERROR',
  };
  return {
    category: categoryMap[directive.statusOrCondition] ?? 'SERVER_ERROR',
    preserveDraft: directive.preserveFormDraft,
    retryable: directive.statusOrCondition === 429 || directive.statusOrCondition === 500,
    messageFa: directive.messageFa,
  };
}
