/**
 * @file server/modules/trust-safety/trustSafetyValidator.ts
 * @description Input validation, moderation case state machine rules, and separation-of-duties checks.
 */

import type {
  AppealStatus,
  ModerationCaseStatus,
  ReportCategory,
  ReportTargetType,
} from './trustSafetyTypes';

export function sanitizeTextFa(raw?: string, maxLength = 2000): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[<>'"&]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function validateReportInput(params: {
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  descriptionFa: string;
}): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  const validTargetTypes: ReportTargetType[] = [
    'LISTING',
    'USER_ACCOUNT',
    'AGENCY',
    'PROFESSIONAL',
    'SERVICE_PROVIDER',
    'REVIEW',
    'LEAD_INQUIRY',
    'SPONSOR_AD',
  ];
  if (!validTargetTypes.includes(params.targetType)) {
    errors.push('INVALID_TARGET_TYPE: نوع موجودیت گزارش نامعتبر است.');
  }

  if (!params.targetId || typeof params.targetId !== 'string' || params.targetId.trim().length === 0) {
    errors.push('TARGET_ID_REQUIRED: شناسه موجودیت مورد گزارش الزامی است.');
  }

  const validCategories: ReportCategory[] = [
    'FRAUD_SCAM',
    'FAKE_PHOTOS',
    'PRICE_MISREPRESENTATION',
    'UNAUTHORIZED_REPRESENTATION',
    'DUPLICATE_LISTING',
    'UNVERIFIED_CREDENTIALS',
    'HARASSMENT_ABUSE',
    'SPAM',
    'IMPERSONATION',
    'SUSPICIOUS_PAYMENT',
  ];
  if (!validCategories.includes(params.category)) {
    errors.push('INVALID_CATEGORY: دسته‌بندی تخلف نامعتبر است.');
  }

  const cleanedDesc = sanitizeTextFa(params.descriptionFa, 2000);
  if (cleanedDesc.length < 10) {
    errors.push('DESCRIPTION_TOO_SHORT: شرح تخلف باید حداقل ۱۰ کاراکتر باشد.');
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

const ALLOWED_CASE_TRANSITIONS: Record<ModerationCaseStatus, readonly ModerationCaseStatus[]> = {
  OPEN: ['AWAITING_TRIAGE', 'UNDER_REVIEW', 'DISMISSED'],
  AWAITING_TRIAGE: ['UNDER_REVIEW', 'DISMISSED'],
  UNDER_REVIEW: ['AWAITING_EVIDENCE', 'ESCALATED', 'RESOLVED', 'DISMISSED'],
  AWAITING_EVIDENCE: ['UNDER_REVIEW', 'DISMISSED'],
  ESCALATED: ['RESOLVED', 'DISMISSED', 'UNDER_REVIEW'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  DISMISSED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['UNDER_REVIEW'],
};

export function validateCaseTransition(
  currentState: ModerationCaseStatus,
  targetState: ModerationCaseStatus,
): { allowed: boolean; reasonFa?: string } {
  if (currentState === targetState) {
    return { allowed: false, reasonFa: 'وضعیت هدف با وضعیت فعلی پرونده یکسان است.' };
  }

  const targets = ALLOWED_CASE_TRANSITIONS[currentState] ?? [];
  if (!targets.includes(targetState)) {
    return {
      allowed: false,
      reasonFa: `انتقال وضعیت پرونده از ${currentState} به ${targetState} غیرمجاز است.`,
    };
  }

  return { allowed: true };
}

export function validateAppealTransition(
  currentState: AppealStatus,
  targetState: AppealStatus,
): { allowed: boolean; reasonFa?: string } {
  if (currentState === targetState) {
    return { allowed: false, reasonFa: 'وضعیت هدف تکراری است.' };
  }

  const allowedTransitions: Record<AppealStatus, readonly AppealStatus[]> = {
    SUBMITTED: ['UNDER_REVIEW', 'AWAITING_EVIDENCE', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
    AWAITING_EVIDENCE: ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
    UNDER_REVIEW: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: ['CLOSED'],
    REJECTED: ['CLOSED'],
    WITHDRAWN: ['CLOSED'],
    CLOSED: [],
  };

  const targets = allowedTransitions[currentState] ?? [];
  if (!targets.includes(targetState)) {
    return {
      allowed: false,
      reasonFa: `انتقال وضعیت تجدیدنظر از ${currentState} به ${targetState} غیرمجاز است.`,
    };
  }

  return { allowed: true };
}
