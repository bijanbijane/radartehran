/**
 * @file src/platform/entity-engagement/monitoring/AlertEligibility.ts
 * @description Evaluates whether an EntityChangeEvent satisfies a WatchRule to produce an AlertEligibilityDecision for Stage 9 Notification Center (Stage 8).
 */

import type {
  AlertEligibilityDecision,
  EntityChangeEvent,
  FollowStatus,
  WatchRule,
} from '../core/EngagementTypes';
import { DuplicateSuppressionEngine } from './DuplicateSuppression';

export interface EvaluateAlertEligibilityInput {
  rule: WatchRule;
  event: EntityChangeEvent;
  followStatus?: FollowStatus;
  userHasEntityReadPermission?: boolean;
  suppressionEngine?: DuplicateSuppressionEngine;
  nowMs?: number;
}

export function evaluateAlertEligibility(
  input: EvaluateAlertEligibilityInput
): AlertEligibilityDecision {
  const {
    rule,
    event,
    followStatus = 'active',
    userHasEntityReadPermission = true,
    suppressionEngine,
    nowMs = Date.now(),
  } = input;
  const evaluatedAt = new Date(nowMs).toISOString();

  if (!userHasEntityReadPermission) {
    return {
      eligible: false,
      reasonCode: 'ACCESS_DENIED',
      reasonFa: 'کاربر به این موجودیت یا فضای کاری دسترسی مجاز ندارد.',
      evaluatedAt,
    };
  }

  if (!rule.enabled) {
    return {
      eligible: false,
      reasonCode: 'RULE_DISABLED',
      reasonFa: 'قاعده رصد توسط کاربر غیرفعال شده است.',
      evaluatedAt,
    };
  }

  if (followStatus === 'paused' || followStatus === 'stopped') {
    return {
      eligible: false,
      reasonCode: 'FOLLOW_PAUSED_OR_STOPPED',
      reasonFa: 'دنبال‌کردن این موجودیت متوقف یا در حالت مکث است.',
      evaluatedAt,
    };
  }

  if (
    rule.entity.entityType !== event.entity.entityType ||
    rule.entity.id !== event.entity.id
  ) {
    return {
      eligible: false,
      reasonCode: 'ENTITY_MISMATCH',
      reasonFa: 'رویداد تغییر متعلق به موجودیت دیگری است.',
      evaluatedAt,
    };
  }

  if (rule.conditionType !== event.changeType) {
    return {
      eligible: false,
      reasonCode: 'CONDITION_MISMATCH',
      reasonFa: 'نوع تغییر با شرط قاعده رصد تطابق ندارد.',
      evaluatedAt,
    };
  }

  // Reject unverified, conflicting, or unknown data confidence from triggering false alerts
  if (
    event.confidence === 'unverified' ||
    event.confidence === 'conflicting' ||
    event.confidence === 'unknown'
  ) {
    return {
      eligible: false,
      reasonCode: 'LOW_DATA_CONFIDENCE',
      reasonFa: 'اعتبار داده تغییریافته برای ارسال هشدار کافی نیست (تأییدنشده یا دارای تعارض).',
      evaluatedAt,
    };
  }

  if (rule.conditionType === 'price_drop') {
    if (
      (typeof event.deltaPercent === 'number' && event.deltaPercent >= 0) ||
      (typeof event.deltaAbsolute === 'number' && event.deltaAbsolute >= 0)
    ) {
      return {
        eligible: false,
        reasonCode: 'NOT_A_PRICE_DROP',
        reasonFa: 'تغییر قیمت ثبت‌شده کاهشی نیست.',
        evaluatedAt,
      };
    }
  }

  if (typeof rule.thresholdPercent === 'number' && rule.thresholdPercent > 0) {
    const absPct = event.deltaPercent != null ? Math.abs(event.deltaPercent) : 0;
    if (absPct < rule.thresholdPercent) {
      return {
        eligible: false,
        reasonCode: 'BELOW_PERCENT_THRESHOLD',
        reasonFa: `میزان تغییر (${absPct}٪) کمتر از آستانه تعیین‌شده (${rule.thresholdPercent}٪) است.`,
        evaluatedAt,
      };
    }
  }

  if (typeof rule.thresholdAbsolute === 'number' && rule.thresholdAbsolute > 0) {
    const absVal = event.deltaAbsolute != null ? Math.abs(event.deltaAbsolute) : 0;
    if (absVal < rule.thresholdAbsolute) {
      return {
        eligible: false,
        reasonCode: 'BELOW_ABSOLUTE_THRESHOLD',
        reasonFa: `میزان تغییر مطلق (${absVal}) کمتر از آستانه تعیین‌شده (${rule.thresholdAbsolute}) است.`,
        evaluatedAt,
      };
    }
  }

  const engine = suppressionEngine ?? new DuplicateSuppressionEngine();

  if (engine.isCooldownActive(rule, event.observedAt)) {
    return {
      eligible: false,
      reasonCode: 'COOLDOWN_ACTIVE',
      reasonFa: `فاصله زمانی حداقل (${rule.cooldownMinutes} دقیقه) از آخرین هشدار هنوز سپری نشده است.`,
      evaluatedAt,
    };
  }

  const dupCheck = engine.isDuplicateEvent(rule, event, nowMs);
  if (dupCheck.suppressed) {
    return {
      eligible: false,
      reasonCode: 'DUPLICATE_SUPPRESSED',
      reasonFa: 'این تغییر قبلاً ارزیابی و ثبت شده است (جلوگیری از هشدار تکراری).',
      dedupeKey: dupCheck.dedupeKey,
      evaluatedAt,
    };
  }

  engine.recordDispatchedAlert(dupCheck.dedupeKey, nowMs);

  return {
    eligible: true,
    reasonCode: 'ELIGIBLE_FOR_STAGE9',
    reasonFa: 'واجد شرایط تحویل به مرکز اعلان‌ها (مرحله ۹).',
    dedupeKey: dupCheck.dedupeKey,
    matchedRuleId: rule.id,
    evaluatedAt,
  };
}
