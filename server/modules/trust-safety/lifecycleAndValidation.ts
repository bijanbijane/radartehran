import {
  requireEnumValue,
  requireNonEmptyString,
  requireSafeFirestoreId,
  validateObjectSchema,
  type ValidationResult,
} from '../core';
import type {
  AppealStatus,
  EnforcementActionType,
  EnforcementExecutionStatus,
  EvidenceAccessLevel,
  EvidenceType,
  ModerationCaseStatus,
  PlatformSafetyPolicy,
  ReportCategory,
  ReportLifecycleStatus,
  ReportableEntityType,
  RiskSeverity,
} from './types';

export const VALID_REPORTABLE_ENTITIES: readonly ReportableEntityType[] = [
  'listing',
  'user',
  'agency',
  'professional',
  'service_provider',
  'review',
  'lead',
  'advertisement',
  'payment_transaction',
];

export const VALID_REPORT_CATEGORIES: readonly ReportCategory[] = [
  'fake_photos',
  'misleading_price',
  'duplicate_listing',
  'unauthorized_representation',
  'suspicious_agent',
  'fake_review',
  'harassment',
  'spam',
  'impersonation',
  'payment_fraud',
  'policy_violation_other',
];

export const VALID_RISK_SEVERITIES: readonly RiskSeverity[] = [
  'informational',
  'low',
  'medium',
  'high',
  'critical',
];

export const VALID_EVIDENCE_TYPES: readonly EvidenceType[] = [
  'screenshot',
  'listing_snapshot',
  'communication_log',
  'credential_document',
  'payment_reference',
  'system_signal',
  'external_url',
];

export const VALID_EVIDENCE_ACCESS_LEVELS: readonly EvidenceAccessLevel[] = [
  'public',
  'reporter_only',
  'target_and_reporter',
  'internal_moderator_only',
  'restricted_admin',
];

export const VALID_ENFORCEMENT_ACTIONS: readonly EnforcementActionType[] = [
  'warning',
  'request_for_correction',
  'temporary_content_restriction',
  'content_removal_request',
  'temporary_account_restriction',
  'publishing_restriction',
  'profile_suspension_request',
  'referral_for_review',
  'account_termination_request',
];

const REPORT_TRANSITIONS: Record<ReportLifecycleStatus, readonly ReportLifecycleStatus[]> = {
  submitted: ['under_triage', 'dismissed', 'escalated_to_case'],
  under_triage: ['escalated_to_case', 'dismissed', 'resolved'],
  escalated_to_case: ['resolved', 'dismissed'],
  dismissed: ['under_triage'],
  resolved: ['under_triage'],
};

const CASE_TRANSITIONS: Record<ModerationCaseStatus, readonly ModerationCaseStatus[]> = {
  open: ['awaiting_triage', 'under_review', 'dismissed'],
  awaiting_triage: ['under_review', 'dismissed'],
  under_review: ['awaiting_evidence', 'escalated', 'resolved', 'dismissed'],
  awaiting_evidence: ['under_review', 'dismissed', 'escalated'],
  escalated: ['under_review', 'resolved', 'dismissed'],
  resolved: ['closed', 'reopened'],
  dismissed: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['under_review', 'escalated'],
};

const ENFORCEMENT_TRANSITIONS: Record<EnforcementExecutionStatus, readonly EnforcementExecutionStatus[]> = {
  requested: ['accepted', 'rejected', 'failed'],
  accepted: ['applied', 'failed'],
  applied: ['reversed', 'expired'],
  rejected: [],
  failed: ['requested'],
  reversed: [],
  expired: [],
};

const APPEAL_TRANSITIONS: Record<AppealStatus, readonly AppealStatus[]> = {
  submitted: ['under_review', 'withdrawn'],
  under_review: ['awaiting_additional_evidence', 'accepted', 'rejected'],
  awaiting_additional_evidence: ['under_review', 'rejected'],
  accepted: ['closed'],
  rejected: ['closed'],
  withdrawn: ['closed'],
  closed: [],
};

export function validateReportTransition(
  current: ReportLifecycleStatus,
  target: ReportLifecycleStatus,
): { allowed: boolean; reason?: string } {
  if (current === target) return { allowed: true };
  const allowed = REPORT_TRANSITIONS[current] ?? [];
  if (!allowed.includes(target)) {
    return { allowed: false, reason: `Cannot transition report from "${current}" to "${target}".` };
  }
  return { allowed: true };
}

export function validateCaseTransition(
  current: ModerationCaseStatus,
  target: ModerationCaseStatus,
): { allowed: boolean; reason?: string } {
  if (current === target) return { allowed: true };
  const allowed = CASE_TRANSITIONS[current] ?? [];
  if (!allowed.includes(target)) {
    return { allowed: false, reason: `Cannot transition case from "${current}" to "${target}".` };
  }
  return { allowed: true };
}

export function validateEnforcementTransition(
  current: EnforcementExecutionStatus,
  target: EnforcementExecutionStatus,
): { allowed: boolean; reason?: string } {
  if (current === target) return { allowed: true };
  const allowed = ENFORCEMENT_TRANSITIONS[current] ?? [];
  if (!allowed.includes(target)) {
    return { allowed: false, reason: `Cannot transition enforcement from "${current}" to "${target}".` };
  }
  return { allowed: true };
}

export function validateAppealTransition(
  current: AppealStatus,
  target: AppealStatus,
): { allowed: boolean; reason?: string } {
  if (current === target) return { allowed: true };
  const allowed = APPEAL_TRANSITIONS[current] ?? [];
  if (!allowed.includes(target)) {
    return { allowed: false, reason: `Cannot transition appeal from "${current}" to "${target}".` };
  }
  return { allowed: true };
}

export interface SubmitUserReportInput {
  targetType: ReportableEntityType;
  targetId: string;
  category: ReportCategory;
  description: string;
  evidenceReferences?: string[];
  [key: string]: unknown;
}

export function validateSubmitUserReportInput(raw: unknown): ValidationResult<SubmitUserReportInput> {
  return validateObjectSchema<SubmitUserReportInput>(
    raw,
    {
      targetType: requireEnumValue(VALID_REPORTABLE_ENTITIES),
      targetId: requireSafeFirestoreId(),
      category: requireEnumValue(VALID_REPORT_CATEGORIES),
      description: requireNonEmptyString({ minLength: 10, maxLength: 2000 }),
    },
    {
      allowUnknownFields: false,
      rejectUntrustedIdentityFields: true,
    },
  );
}

export interface CreateModerationCaseInput {
  originatingType: 'user_report' | 'system_signal' | 'admin_referral';
  originatingReferenceId: string;
  targetType: ReportableEntityType;
  targetId: string;
  caseCategory: ReportCategory;
  severity?: RiskSeverity;
  initialNote?: string;
  [key: string]: unknown;
}

export function validateCreateModerationCaseInput(raw: unknown): ValidationResult<CreateModerationCaseInput> {
  return validateObjectSchema<CreateModerationCaseInput>(
    raw,
    {
      originatingType: requireEnumValue(['user_report', 'system_signal', 'admin_referral'] as const),
      originatingReferenceId: requireSafeFirestoreId(),
      targetType: requireEnumValue(VALID_REPORTABLE_ENTITIES),
      targetId: requireSafeFirestoreId(),
      caseCategory: requireEnumValue(VALID_REPORT_CATEGORIES),
      severity: requireEnumValue(VALID_RISK_SEVERITIES),
      initialNote: requireNonEmptyString({ minLength: 3, maxLength: 2000 }),
    },
    {
      optionalFields: ['severity', 'initialNote'],
      allowUnknownFields: false,
      rejectUntrustedIdentityFields: true,
    },
  );
}

export interface AttachEvidenceInput {
  type: EvidenceType;
  sourceModule: string;
  sourceRef: string;
  accessClassification?: EvidenceAccessLevel;
  description: string;
  sha256Hash?: string;
  [key: string]: unknown;
}

export function validateAttachEvidenceInput(raw: unknown): ValidationResult<AttachEvidenceInput> {
  return validateObjectSchema<AttachEvidenceInput>(
    raw,
    {
      type: requireEnumValue(VALID_EVIDENCE_TYPES),
      sourceModule: requireNonEmptyString({ minLength: 2, maxLength: 64 }),
      sourceRef: requireSafeFirestoreId(),
      accessClassification: requireEnumValue(VALID_EVIDENCE_ACCESS_LEVELS),
      description: requireNonEmptyString({ minLength: 3, maxLength: 500 }),
      sha256Hash: requireNonEmptyString({ minLength: 64, maxLength: 64 }),
    },
    {
      optionalFields: ['accessClassification', 'sha256Hash'],
      allowUnknownFields: false,
      rejectUntrustedIdentityFields: true,
    },
  );
}

export interface CreateEnforcementDecisionInput {
  caseId: string;
  actionType: EnforcementActionType;
  reason: string;
  policyVersion: string;
  evidenceReferences?: string[];
  expiresAtIso?: string;
  [key: string]: unknown;
}

export function validateCreateEnforcementDecisionInput(raw: unknown): ValidationResult<CreateEnforcementDecisionInput> {
  return validateObjectSchema<CreateEnforcementDecisionInput>(
    raw,
    {
      caseId: requireSafeFirestoreId(),
      actionType: requireEnumValue(VALID_ENFORCEMENT_ACTIONS),
      reason: requireNonEmptyString({ minLength: 10, maxLength: 1000 }),
      policyVersion: requireNonEmptyString({ minLength: 2, maxLength: 32 }),
      expiresAtIso: requireNonEmptyString({ minLength: 10, maxLength: 40 }),
    },
    {
      optionalFields: ['expiresAtIso'],
      allowUnknownFields: false,
      rejectUntrustedIdentityFields: true,
    },
  );
}

export interface SubmitAppealInput {
  enforcementId: string;
  reason: string;
  supportingEvidenceIds?: string[];
  [key: string]: unknown;
}

export function validateSubmitAppealInput(raw: unknown): ValidationResult<SubmitAppealInput> {
  return validateObjectSchema<SubmitAppealInput>(
    raw,
    {
      enforcementId: requireSafeFirestoreId(),
      reason: requireNonEmptyString({ minLength: 10, maxLength: 2000 }),
    },
    {
      allowUnknownFields: false,
      rejectUntrustedIdentityFields: true,
    },
  );
}

export const CANONICAL_SAFETY_POLICIES: Record<ReportCategory, PlatformSafetyPolicy> = {
  fake_photos: {
    policyId: 'pol_fake_photos',
    version: '1.0',
    category: 'fake_photos',
    nameFa: 'عکس‌های جعلی یا رندر غیرواقعی',
    descriptionFa: 'استفاده از تصاویر املاک دیگر، عکس‌های غیرمرتبط یا رندرهای فریب‌دهنده بدون اطلاع‌رسانی صریح ممنوع است.',
    applicableEntityTypes: ['listing', 'advertisement'],
    defaultSeverity: 'medium',
    evidenceRequired: true,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
  misleading_price: {
    policyId: 'pol_misleading_price',
    version: '1.0',
    category: 'misleading_price',
    nameFa: 'قیمت‌گذاری غیرواقعی یا صوری',
    descriptionFa: 'درج قیمت‌های غیرواقعی، متناقض با متن آگهی یا با هدف فریب الگوریتم‌های کشف قیمت ممنوع است.',
    applicableEntityTypes: ['listing'],
    defaultSeverity: 'medium',
    evidenceRequired: false,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
  duplicate_listing: {
    policyId: 'pol_duplicate_listing',
    version: '1.0',
    category: 'duplicate_listing',
    nameFa: 'ثبت مکرر آگهی تکراری',
    descriptionFa: 'ثبت همزمان چندین آگهی با مشخصات یکسان برای یک ملک در محله واحد مجاز نمی‌باشد.',
    applicableEntityTypes: ['listing'],
    defaultSeverity: 'low',
    evidenceRequired: false,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
  unauthorized_representation: {
    policyId: 'pol_unauthorized_representation',
    version: '1.0',
    category: 'unauthorized_representation',
    nameFa: 'آگهی بدون اجازه یا نمایندگی معتبر مالک',
    descriptionFa: 'انتشار آگهی ملکی بدون کسب اجازه مستقیم از مالک یا قرارداد انحصاری/معرفی‌نامه معتبر ممنوع است.',
    applicableEntityTypes: ['listing', 'professional', 'agency'],
    defaultSeverity: 'high',
    evidenceRequired: true,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
  suspicious_agent: {
    policyId: 'pol_suspicious_agent',
    version: '1.0',
    category: 'suspicious_agent',
    nameFa: 'مشاور املاک نامعتبر یا بدون پروانه کسب',
    descriptionFa: 'معرفی خود به عنوان مشاور رسمی اتحادیه املاک بدون داشتن پروانه یا وابستگی به آژانس مجاز ممنوع است.',
    applicableEntityTypes: ['professional', 'agency'],
    defaultSeverity: 'high',
    evidenceRequired: true,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
  fake_review: {
    policyId: 'pol_fake_review',
    version: '1.0',
    category: 'fake_review',
    nameFa: 'نظر یا امتیاز غیرواقعی و دست‌کاری شده',
    descriptionFa: 'ایجاد حساب‌های ساختگی جهت افزایش غیرواقعی امتیاز یا تخریب رقبا تخلف تلقی می‌شود.',
    applicableEntityTypes: ['review', 'user'],
    defaultSeverity: 'low',
    evidenceRequired: false,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
  harassment: {
    policyId: 'pol_harassment',
    version: '1.0',
    category: 'harassment',
    nameFa: 'مزاحمت، توهین یا ارتباط نامناسب',
    descriptionFa: 'ارسال پیام‌های توهین‌آمیز، تماس‌های مکرر آزاردهنده یا تهدید کاربران در پیام‌رسان یا تماس مستقیم ممنوع است.',
    applicableEntityTypes: ['user', 'professional', 'lead'],
    defaultSeverity: 'high',
    evidenceRequired: true,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
  spam: {
    policyId: 'pol_spam',
    version: '1.0',
    category: 'spam',
    nameFa: 'ارسال هرزنامه یا پیام‌های تبلیغاتی انبوه',
    descriptionFa: 'ارسال خودکار، پیام‌های نامربوط به حوزه املاک و تلاش برای فیشینگ خارج از پلتفرم ممنوع است.',
    applicableEntityTypes: ['user', 'lead', 'advertisement'],
    defaultSeverity: 'medium',
    evidenceRequired: false,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
  impersonation: {
    policyId: 'pol_impersonation',
    version: '1.0',
    category: 'impersonation',
    nameFa: 'جعل هویت اشخاص یا آژانس‌های املاک',
    descriptionFa: 'سوءاستفاده از نام تجاری، برند، لوگو یا هویت مشاوران و آژانس‌های دیگر برای فریب متقاضیان ممنوع است.',
    applicableEntityTypes: ['user', 'professional', 'agency'],
    defaultSeverity: 'critical',
    evidenceRequired: true,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
  payment_fraud: {
    policyId: 'pol_payment_fraud',
    version: '1.0',
    category: 'payment_fraud',
    nameFa: 'درخواست وجه نامتعارف، بیعانه مشکوک یا کلاهبرداری',
    descriptionFa: 'درخواست بیعانه پیش از بازدید حضوری، ارسال لینک‌های پرداخت جعلی یا عدم استرداد وجوه قانونی امانت ممنوع است.',
    applicableEntityTypes: ['user', 'professional', 'agency', 'payment_transaction'],
    defaultSeverity: 'critical',
    evidenceRequired: true,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
  policy_violation_other: {
    policyId: 'pol_other',
    version: '1.0',
    category: 'policy_violation_other',
    nameFa: 'سایر موارد نقض قوانین پلتفرم',
    descriptionFa: 'سایر رفتارهای مغایر با شرایط استفاده از خدمات رادار تهران.',
    applicableEntityTypes: ['listing', 'user', 'agency', 'professional', 'service_provider'],
    defaultSeverity: 'medium',
    evidenceRequired: false,
    appealPermitted: true,
    isActive: true,
    effectiveFromIso: '2026-01-01T00:00:00Z',
  },
};
