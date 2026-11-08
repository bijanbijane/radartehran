/**
 * @file server/modules/dispute-resolution/disputeValidator.ts
 * @description Input validation, text sanitization, and lifecycle state machine for Dispute Resolution.
 */

import type { CaseStatus, DisputeCategory } from './disputeTypes';

export function sanitizeTextFa(raw?: string, maxLength = 2000): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[<>'"&]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function validateDisputeCaseInput(params: {
  category: DisputeCategory;
  titleFa: string;
  descriptionFa: string;
  claimantUid: string;
  respondentUid: string;
  propertyReferenceId?: string;
}): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  const validCategories: DisputeCategory[] = [
    'SALE_PURCHASE',
    'RENTAL_LEASE',
    'DEPOSIT_REFUND',
    'PROPERTY_DEFECT',
    'MISREPRESENTATION',
    'COMMISSION_BROKERAGE',
    'VIEWING_ACCESS',
    'PROPERTY_MANAGEMENT',
    'CONSTRUCTION_DEFECT',
    'OWNERSHIP_AUTHORITY',
    'CONTRACT_PERFORMANCE',
    'COMMERCIAL_DISPUTE',
  ];

  if (!validCategories.includes(params.category)) {
    errors.push('INVALID_DISPUTE_CATEGORY: دسته‌بندی اختلاف نامعتبر است.');
  }

  const title = sanitizeTextFa(params.titleFa, 120);
  if (title.length < 5) {
    errors.push('TITLE_TOO_SHORT: عنوان پرونده اختلاف باید حداقل ۵ کاراکتر باشد.');
  }

  const desc = sanitizeTextFa(params.descriptionFa, 2000);
  if (desc.length < 15) {
    errors.push('DESCRIPTION_TOO_SHORT: شرح اختلاف باید حداقل ۱۵ کاراکتر باشد.');
  }

  if (!params.claimantUid || params.claimantUid.trim().length === 0) {
    errors.push('CLAIMANT_UID_REQUIRED: شناسه شاکی الزامی است.');
  }

  if (!params.respondentUid || params.respondentUid.trim().length === 0) {
    errors.push('RESPONDENT_UID_REQUIRED: شناسه طرف مقابل الزامی است.');
  }

  if (params.claimantUid === params.respondentUid) {
    errors.push('SELF_DISPUTE_FORBIDDEN: شاکی و طرف مقابل نمی‌توانند حساب یکسانی باشند.');
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

const ALLOWED_DISPUTE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['AWAITING_PARTIES', 'AWAITING_RESPONSE', 'UNDER_REVIEW', 'NEGOTIATION', 'MEDIATION', 'WITHDRAWN', 'CLOSED'],
  AWAITING_PARTIES: ['AWAITING_RESPONSE', 'UNDER_REVIEW', 'WITHDRAWN', 'SUSPENDED'],
  AWAITING_RESPONSE: ['UNDER_REVIEW', 'NEGOTIATION', 'INFORMATION_REQUESTED', 'WITHDRAWN', 'SUSPENDED'],
  INFORMATION_REQUESTED: ['AWAITING_RESPONSE', 'UNDER_REVIEW', 'SUSPENDED'],
  UNDER_REVIEW: ['NEGOTIATION', 'MEDIATION', 'SETTLEMENT_PROPOSED', 'RESOLVED', 'CLOSED', 'SUSPENDED'],
  NEGOTIATION: ['SETTLEMENT_PROPOSED', 'MEDIATION', 'RESOLVED', 'CLOSED', 'WITHDRAWN', 'SUSPENDED'],
  MEDIATION: ['SETTLEMENT_PROPOSED', 'NEGOTIATION', 'RESOLVED', 'CLOSED', 'SUSPENDED'],
  SETTLEMENT_PROPOSED: ['SETTLEMENT_ACCEPTED', 'NEGOTIATION', 'MEDIATION', 'CLOSED'],
  SETTLEMENT_ACCEPTED: ['RESOLUTION_PENDING', 'RESOLVED'],
  RESOLUTION_PENDING: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  WITHDRAWN: ['CLOSED', 'REOPENED'],
  SUSPENDED: ['UNDER_REVIEW', 'NEGOTIATION', 'CLOSED'],
  REOPENED: ['UNDER_REVIEW', 'NEGOTIATION'],
};

export function validateDisputeTransition(
  currentState: CaseStatus,
  targetState: CaseStatus,
): { allowed: boolean; reasonFa?: string } {
  if (currentState === targetState) {
    return { allowed: false, reasonFa: 'وضعیت هدف با وضعیت فعلی یکسان است.' };
  }

  const allowedTargets = ALLOWED_DISPUTE_TRANSITIONS[currentState] ?? [];
  if (!allowedTargets.includes(targetState)) {
    return {
      allowed: false,
      reasonFa: `انتقال پرونده از ${currentState} به ${targetState} غیرمجاز است.`,
    };
  }

  return { allowed: true };
}
