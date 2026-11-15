/** @file src/features/onboarding/services/professionalVerificationEngine.ts — Stage 42 (RT-UI-VERIFICATION-001) Pure Engine */
export type TrustDimensionKind = 'identity' | 'credential' | 'track_record' | 'reputation';
export type ProfessionalProfileKind = 'individual_pro' | 'company' | 'branch' | 'independent_specialist';
export type BadgeScopeKind = 'phone' | 'identity' | 'credential_license' | 'company_registry' | 'branch_office';
export type CredentialStatusKind =
  | 'valid'
  | 'expiring_soon'
  | 'expired'
  | 'pending_renewal'
  | 'suspended'
  | 'revoked'
  | 'unverified';
export type VerificationCaseStatus =
  | 'draft'
  | 'submitted'
  | 'queued'
  | 'in_review'
  | 'needs_more_info'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'paused';

export interface ScopedVerificationBadge {
  badgeId: string;
  scope: BadgeScopeKind;
  titleFa: string;
  meaningFa: string;
  limitationFa: string;
  authorityFa: string;
  reviewedAtLabelFa: string;
  expiresAtLabelFa?: string;
  status: CredentialStatusKind;
  historyNotesFa: string[];
}

export interface ProfessionalProfileRecord {
  profileId: string;
  kind: ProfessionalProfileKind;
  displayNameFa: string;
  specialtyFa: string;
  parentCompanyNameFa?: string;
  claimedExperienceYears: number;
  verifiedExperienceYears: number;
  reputationScore: number;
  verifiedInteractionReviewsCount: number;
  unverifiedReviewsCount: number;
  badges: ScopedVerificationBadge[];
  pendingComplaintsCount: number;
  confirmedViolationsCount: number;
  publiclyShowViolationLabel: boolean;
}

export interface VerificationCaseRecord {
  caseId: string;
  targetProfileId: string;
  requestScope: BadgeScopeKind;
  status: VerificationCaseStatus;
  rejectionReasonFa?: string;
  submittedDocSummaryFa: string;
  isSensitiveDualReviewRequired: boolean;
  firstReviewerId?: string;
  secondReviewerId?: string;
  appeals: Array<{ appealId: string; parentCaseId: string; reasonFa: string; extraDocFa: string; status: 'pending' | 'reviewed' }>;
}

export const STAGE42_DESIGN_COMPONENT_IDS = [
  'VRF-01', 'VRF-02', 'VRF-03', 'VRF-04', 'VRF-05', 'VRF-06', 'VRF-07', 'VRF-08', 'VRF-09', 'VRF-10',
  'VRF-11', 'VRF-12', 'VRF-13', 'VRF-14', 'VRF-15', 'VRF-16', 'VRF-17', 'VRF-18', 'VRF-19', 'VRF-20',
  'VRF-21', 'VRF-22', 'VRF-23', 'VRF-24', 'VRF-25', 'VRF-26', 'VRF-27', 'VRF-28',
] as const;

export const STAGE42_UX_EVENTS = [
  'verification_started', 'verification_type_selected', 'verification_document_uploaded', 'verification_submitted',
  'verification_additional_info_requested', 'verification_approved', 'verification_rejected', 'verification_appeal_submitted',
  'verification_renewal_started', 'verification_expired', 'verification_suspended', 'verification_revoked',
  'verification_badge_viewed', 'professional_profile_viewed', 'credential_reported',
] as const;

export const TRUST_DIMENSIONS_SEPARATION: Array<{
  kind: TrustDimensionKind;
  titleFa: string;
  provesFa: string;
  doesNotProveFa: string;
}> = [
  { kind: 'identity', titleFa: 'احراز هویت', provesFa: 'ارتباط حساب با هویت بررسی‌شده', doesNotProveFa: 'صلاحیت حرفه‌ای یا مجوز فعالیت' },
  { kind: 'credential', titleFa: 'تأیید مدرک / مجوز', provesFa: 'اصالت یا اعتبار مدرک مشخص در تاریخ بررسی', doesNotProveFa: 'کیفیت عملکرد یا رضایت مشتریان' },
  { kind: 'track_record', titleFa: 'سابقه حرفه‌ای', provesFa: 'وجود سوابق قابل‌بررسی (جدا از ادعای کاربر)', doesNotProveFa: 'تأیید همه پروژه‌های آتی' },
  { kind: 'reputation', titleFa: 'اعتبار رفتاری', provesFa: 'تجربه گزارش‌شده کاربران (تأیید تعامل ≠ مثبت بودن)', doesNotProveFa: 'قانونی بودن فعالیت یا جایگزین مجوز' },
];

export function completePhoneVerificationOnly(profile: ProfessionalProfileRecord): ProfessionalProfileRecord {
  const updatedBadges = profile.badges.map((b) =>
    b.scope === 'phone'
      ? { ...b, status: 'valid' as const, reviewedAtLabelFa: '۱۴ آبان ۱۴۰۵', historyNotesFa: [...b.historyNotesFa, 'تأیید شماره تماس در ۱۴ آبان ۱۴۰۵'] }
      : b,
  );
  return { ...profile, badges: updatedBadges };
}

export function expireSpecificBadgeOnly(profile: ProfessionalProfileRecord, badgeId: string): ProfessionalProfileRecord {
  return {
    ...profile,
    badges: profile.badges.map((b) =>
      b.badgeId === badgeId
        ? { ...b, status: 'expired', historyNotesFa: [...b.historyNotesFa, `انقضای مدرک در ۱۴ آبان ۱۴۰۵ (سابقه قبلی: ${b.reviewedAtLabelFa} حفظ شد)`] }
        : b,
    ),
  };
}

export function revokeSpecificBadgeOnly(profile: ProfessionalProfileRecord, badgeId: string, reasonFa: string): ProfessionalProfileRecord {
  return {
    ...profile,
    badges: profile.badges.map((b) =>
      b.badgeId === badgeId
        ? { ...b, status: 'revoked', historyNotesFa: [...b.historyNotesFa, `لغو در ۱۴ آبان ۱۴۰۵: ${reasonFa}`] }
        : b,
    ),
  };
}

export function submitVerificationAppealPreservingCase(
  reqCase: VerificationCaseRecord,
  reasonFa: string,
  extraDocFa: string,
): VerificationCaseRecord {
  return {
    ...reqCase,
    appeals: [
      ...reqCase.appeals,
      { appealId: `APL-${reqCase.appeals.length + 1}`, parentCaseId: reqCase.caseId, reasonFa, extraDocFa, status: 'pending' },
    ],
  };
}

export function recordUnverifiedAbuseComplaint(profile: ProfessionalProfileRecord): {
  updatedProfile: ProfessionalProfileRecord;
  noticeFa: string;
} {
  return {
    updatedProfile: {
      ...profile,
      pendingComplaintsCount: profile.pendingComplaintsCount + 1,
      // Complaint alone NEVER labels profile as confirmed violator (Test 7)
      publiclyShowViolationLabel: profile.confirmedViolationsCount > 0,
    },
    noticeFa: 'گزارش با وضعیت «در انتظار بررسی» ثبت شد. تا پیش از بررسی شواهد، برچسب تخلف روی پروفایل عمومی نمایش داده نمی‌شود.',
  };
}

export function evaluateSensitiveDocumentAccess(viewerRole: 'public_user' | 'profile_owner' | 'assigned_reviewer'): {
  allowed: boolean;
  reasonFa: string;
} {
  if (viewerRole === 'public_user') {
    return { allowed: false, reasonFa: 'دسترسی مسدود شد: مدارک هویتی در فضای محافظت‌شده نگهداری می‌شوند و در پروفایل عمومی قابل بازیابی نیستند.' };
  }
  return { allowed: true, reasonFa: 'دسترسی مجاز مطابق سطح دسترسی پرونده و ثبت در تاریخچه ممیزی.' };
}

export function evaluateReviewerDecision(params: {
  reqCase: VerificationCaseRecord;
  reviewerId: string;
  hasConflictOfInterest: boolean;
  evidenceVerifiedBySource: boolean;
  decision: 'approve' | 'reject' | 'needs_more_info';
}): { accepted: boolean; nextStatus: VerificationCaseStatus; messageFa: string; updatedCase: VerificationCaseRecord } {
  if (params.hasConflictOfInterest) {
    return {
      accepted: false,
      nextStatus: 'in_review',
      messageFa: 'به دلیل تعارض منافع ثبت‌شده، تصمیم توسط این بازبین مسدود شد و پرونده به بازبین مستقل ارجاع می‌گردد.',
      updatedCase: { ...params.reqCase, status: 'in_review' },
    };
  }
  if (params.decision === 'approve' && !params.evidenceVerifiedBySource) {
    return {
      accepted: false,
      nextStatus: 'in_review',
      messageFa: 'تأیید صرفاً بر اساس ظاهر تصویر مجاز نیست؛ استعلام یا بررسی شواهد مرجع الزامی است.',
      updatedCase: params.reqCase,
    };
  }
  if (params.decision === 'approve' && params.reqCase.isSensitiveDualReviewRequired && !params.reqCase.secondReviewerId) {
    return {
      accepted: false,
      nextStatus: 'in_review',
      messageFa: 'پرونده حساس ثبت شد (نیازمند تأیید بازبین دوم مستقل پیش از صدور نهایی).',
      updatedCase: { ...params.reqCase, firstReviewerId: params.reviewerId, status: 'in_review' },
    };
  }
  const nextStatus: VerificationCaseStatus =
    params.decision === 'approve' ? 'approved' : params.decision === 'reject' ? 'rejected' : 'needs_more_info';
  return {
    accepted: true,
    nextStatus,
    messageFa: `تصمیم بازبین (${nextStatus}) در تاریخچه پرونده ثبت شد.`,
    updatedCase: { ...params.reqCase, status: nextStatus, firstReviewerId: params.reviewerId },
  };
}
