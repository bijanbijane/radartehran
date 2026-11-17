import { getAuthClient } from '../core/authClient';
import { SENSITIVE_ACTION_POLICIES, SensitiveActionId } from './sensitiveActions';
import { getVerificationStateStore } from './verificationState';

export interface StepUpCheckResult {
  allowed: boolean;
  requiresReauth: boolean;
  reason?: string;
  policy?: (typeof SENSITIVE_ACTION_POLICIES)[SensitiveActionId];
}

export function requireStepUpVerification(
  userId: string,
  actionId: SensitiveActionId,
  options?: { isImpersonating?: boolean; now?: number }
): StepUpCheckResult {
  const policy = SENSITIVE_ACTION_POLICIES[actionId];
  if (options?.isImpersonating && policy.blockedDuringImpersonation) {
    return {
      allowed: false,
      requiresReauth: false,
      reason: 'IMPERSONATION_SENSITIVE_ACTION_BLOCKED',
      policy,
    };
  }

  const verified = getVerificationStateStore().isVerifiedForAction(userId, actionId, options?.now);
  if (verified) {
    return { allowed: true, requiresReauth: false, policy };
  }

  const client = getAuthClient();
  client.transition('REAUTH_REQUIRED', { actionId, userId });
  client.emitEvent('STEP_UP_REQUIRED', { actionId, userId });

  return {
    allowed: false,
    requiresReauth: true,
    reason: 'STEP_UP_VERIFICATION_REQUIRED',
    policy,
  };
}

export function completeStepUpVerification(
  userId: string,
  method: 'otp' | 'password' | 'hardware_key',
  actionScope: SensitiveActionId | 'all' = 'all',
  now = Date.now()
): void {
  getVerificationStateStore().recordVerification({
    userId,
    verifiedAt: now,
    method,
    actionScope,
  });
  const client = getAuthClient();
  client.transition('READY', { stepUpCompleted: true, userId });
  client.emitEvent('STEP_UP_COMPLETED', { userId, method, actionScope });
}
