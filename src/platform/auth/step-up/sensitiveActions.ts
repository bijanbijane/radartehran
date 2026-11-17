export type SensitiveActionId =
  | 'settlement:withdraw'
  | 'escrow:release'
  | 'account:change_phone'
  | 'account:change_email'
  | 'agency:remove_member'
  | 'agency:transfer_ownership'
  | 'admin:override_commission'
  | 'property:delete_verified';

export interface SensitiveActionPolicy {
  actionId: SensitiveActionId;
  maxVerificationAgeMs: number;
  requiresOtpOrPassword: boolean;
  blockedDuringImpersonation: boolean;
  descriptionFa: string;
}

export const SENSITIVE_ACTION_POLICIES: Record<SensitiveActionId, SensitiveActionPolicy> = {
  'settlement:withdraw': {
    actionId: 'settlement:withdraw',
    maxVerificationAgeMs: 5 * 60 * 1000,
    requiresOtpOrPassword: true,
    blockedDuringImpersonation: true,
    descriptionFa: 'برداشت وجه و تسویه حساب مالی',
  },
  'escrow:release': {
    actionId: 'escrow:release',
    maxVerificationAgeMs: 5 * 60 * 1000,
    requiresOtpOrPassword: true,
    blockedDuringImpersonation: true,
    descriptionFa: 'آزادسازی وجه امانی (Escrow)',
  },
  'account:change_phone': {
    actionId: 'account:change_phone',
    maxVerificationAgeMs: 5 * 60 * 1000,
    requiresOtpOrPassword: true,
    blockedDuringImpersonation: true,
    descriptionFa: 'تغییر شماره موبایل حساب کاربری',
  },
  'account:change_email': {
    actionId: 'account:change_email',
    maxVerificationAgeMs: 10 * 60 * 1000,
    requiresOtpOrPassword: true,
    blockedDuringImpersonation: true,
    descriptionFa: 'تغییر ایمیل حساب کاربری',
  },
  'agency:remove_member': {
    actionId: 'agency:remove_member',
    maxVerificationAgeMs: 10 * 60 * 1000,
    requiresOtpOrPassword: true,
    blockedDuringImpersonation: true,
    descriptionFa: 'حذف مشاور از آژانس املاک',
  },
  'agency:transfer_ownership': {
    actionId: 'agency:transfer_ownership',
    maxVerificationAgeMs: 5 * 60 * 1000,
    requiresOtpOrPassword: true,
    blockedDuringImpersonation: true,
    descriptionFa: 'انتقال مالکیت آژانس',
  },
  'admin:override_commission': {
    actionId: 'admin:override_commission',
    maxVerificationAgeMs: 5 * 60 * 1000,
    requiresOtpOrPassword: true,
    blockedDuringImpersonation: true,
    descriptionFa: 'تغییر دستی نرخ کمیسیون سیستمی',
  },
  'property:delete_verified': {
    actionId: 'property:delete_verified',
    maxVerificationAgeMs: 10 * 60 * 1000,
    requiresOtpOrPassword: true,
    blockedDuringImpersonation: true,
    descriptionFa: 'حذف آگهی تاییدشده ملکی',
  },
};

export function isSensitiveAction(actionId: string): actionId is SensitiveActionId {
  return actionId in SENSITIVE_ACTION_POLICIES;
}
