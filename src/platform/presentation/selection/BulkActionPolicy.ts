/**
 * @file src/platform/presentation/selection/BulkActionPolicy.ts
 * @description Evaluates Bulk Actions against Stage 3/25 permissions, selection limits, and explicit confirmation rules.
 */

import { RESULT_ACTION_REGISTRY, type ResultActionDefinition, type ResultActionId } from '../registry/ActionRegistry';
import type { ResultEntityType } from '../core/ResultTypes';

export interface BulkActionEvaluationInput {
  actionId: ResultActionId;
  selectedIds: readonly string[];
  entityType: ResultEntityType;
  grantedPermissions: ReadonlySet<string>;
  confirmedByUser?: boolean;
  apiSupportsSelectAll?: boolean;
}

export interface BulkActionEvaluationResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason:
    | 'ALLOWED'
    | 'NO_SELECTION'
    | 'EXCEEDS_MAX_LIMIT'
    | 'UNSUPPORTED_ACTION_OR_ENTITY'
    | 'MISSING_PERMISSION'
    | 'CONFIRMATION_REQUIRED';
  messageFa: string;
  action?: ResultActionDefinition;
}

export function evaluateBulkActionPolicy(input: BulkActionEvaluationInput): BulkActionEvaluationResult {
  if (input.selectedIds.length === 0) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: 'NO_SELECTION',
      messageFa: 'هیچ موردی برای انجام عملیات گروهی انتخاب نشده است.',
    };
  }

  if (input.selectedIds.length > 500) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: 'EXCEEDS_MAX_LIMIT',
      messageFa: 'حداکثر تعداد مجاز برای عملیات گروهی در رابط کاربری ۵۰۰ مورد است.',
    };
  }

  const action = RESULT_ACTION_REGISTRY.find((a) => a.id === input.actionId);
  if (!action || !action.bulkSupported || !action.supportedEntities.includes(input.entityType)) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: 'UNSUPPORTED_ACTION_OR_ENTITY',
      messageFa: 'این عملیات گروهی برای نوع موجودیت انتخاب‌شده پشتیبانی نمی‌شود.',
    };
  }

  if (!input.grantedPermissions.has(action.requiredPermissionCode)) {
    return {
      allowed: false,
      requiresConfirmation: action.requiresExplicitConfirmation,
      reason: 'MISSING_PERMISSION',
      messageFa: 'شما مجوز لازم برای اجرای این عملیات گروهی را ندارید.',
      action,
    };
  }

  if (action.requiresExplicitConfirmation && !input.confirmedByUser) {
    return {
      allowed: false,
      requiresConfirmation: true,
      reason: 'CONFIRMATION_REQUIRED',
      messageFa: `عملیات «${action.labelFa}» نیازمند تأیید صریح نهایی است.`,
      action,
    };
  }

  return {
    allowed: true,
    requiresConfirmation: action.requiresExplicitConfirmation,
    reason: 'ALLOWED',
    messageFa: 'اجرای عملیات گروهی مجاز است.',
    action,
  };
}
