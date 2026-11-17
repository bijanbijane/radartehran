import { isSensitiveAction } from '../step-up/sensitiveActions';
import { getImpersonationManager, ImpersonationManager } from './impersonationState';

export interface ImpersonationGuardDecision {
  allowed: boolean;
  reason?: string;
}

const BLOCKED_IMPERSONATION_ACTIONS = new Set<string>([
  'settlement:withdraw',
  'escrow:release',
  'account:change_phone',
  'account:change_email',
  'account:change_password',
  'agency:transfer_ownership',
  'payment:submit',
]);

export function evaluateImpersonationGuard(
  actionId: string,
  manager: ImpersonationManager = getImpersonationManager()
): ImpersonationGuardDecision {
  const session = manager.getActiveSession();
  if (!session) {
    return { allowed: true };
  }

  if (BLOCKED_IMPERSONATION_ACTIONS.has(actionId) || isSensitiveAction(actionId)) {
    return {
      allowed: false,
      reason: 'عملیات مالی و امنیتی حساس در حالت مشاهده اپراتور (Impersonation) غیرفعال است.',
    };
  }

  return { allowed: true };
}
