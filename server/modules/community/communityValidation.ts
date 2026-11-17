/** @file server/modules/community/communityValidation.ts — Role Separation, Input Validation & Server-Side PII Stripping (Stages 76–78) */
import { sanitizeInput } from '../../../src/utils/security';
import {
  sanitizePublicProfile,
  validateCommunityTextSafety,
} from '../../../src/features/community/services/communityTrustService';
import type {
  CommunityAbuseReason,
  CommunityGovernanceRole,
  CommunityProfile,
  DataCorrectionCategory,
  DataCorrectionModerationStatus,
  ModerationActionRecord,
  ProfessionalCredentialRecord,
  ReactionType,
} from '../../../src/features/community/types/community.types';

export const VALID_REACTION_TYPES = new Set<ReactionType>(['helpful', 'agree', 'needs_source', 'disagree']);

export const VALID_CORRECTION_CATEGORIES = new Set<DataCorrectionCategory>([
  'metro_transit',
  'urban_facility',
  'price_anomaly',
  'map_boundary',
  'air_noise',
]);

export const VALID_ABUSE_REASONS = new Set<CommunityAbuseReason>([
  'spam_promo',
  'harassment',
  'fake_price_shill',
  'pii_leak',
  'misinformation',
  'off_topic',
  'conflict_of_interest',
  'impersonation',
  'copyright_violation',
  'abuse_of_reporting',
]);

const ALLOWED_CORRECTION_TRANSITIONS: Record<DataCorrectionModerationStatus, DataCorrectionModerationStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  pending: ['initial_validation', 'under_review', 'needs_evidence', 'approved', 'rejected', 'withdrawn'],
  submitted: ['initial_validation', 'under_review', 'needs_evidence', 'approved', 'rejected', 'withdrawn'],
  initial_validation: ['under_review', 'needs_evidence', 'approved', 'rejected', 'withdrawn'],
  under_review: ['needs_evidence', 'approved', 'rejected', 'withdrawn'],
  needs_evidence: ['under_review', 'approved', 'rejected', 'withdrawn'],
  approved: ['applied', 'rejected'],
  verified: ['applied', 'rejected'],
  applied: [],
  rejected: ['under_review'],
  withdrawn: [],
};

export function isAllowedCorrectionStatusTransition(
  current: DataCorrectionModerationStatus,
  next: DataCorrectionModerationStatus,
): boolean {
  if (current === next) return true;
  return (ALLOWED_CORRECTION_TRANSITIONS[current] ?? []).includes(next);
}

export function resolveCommunityGovernanceRole(params: {
  uid?: string | null;
  isAdminAuthorized?: boolean;
  requestedRoleHeader?: string;
  hasVerifiedCredential?: boolean;
  isOwner?: boolean;
}): CommunityGovernanceRole {
  if (params.isAdminAuthorized) {
    const requested = (params.requestedRoleHeader || '').trim();
    if (requested === 'content_moderator' || requested === 'data_steward' || requested === 'super_admin') {
      return requested;
    }
    return 'super_admin';
  }
  if (!params.uid) return 'guest';
  if (params.isOwner) return 'content_owner';
  if (params.hasVerifiedCredential) return 'verified_contributor';
  return 'member';
}

export function canRolePerformModerationAction(
  role: CommunityGovernanceRole,
  actionType: ModerationActionRecord['actionType'],
): boolean {
  if (role === 'super_admin') return true;
  if (role === 'data_steward') {
    return [
      'initial_validation',
      'under_review',
      'needs_evidence',
      'approve_data',
      'apply_data_version',
      'reject_data',
    ].includes(actionType);
  }
  if (role === 'content_moderator') {
    return ['hide', 'lock', 'warn', 'suspend_7d', 'restore', 'initial_validation', 'under_review', 'needs_evidence', 'approve_data', 'reject_data'].includes(actionType);
  }
  return false;
}

/** Stage 77.5: Separation of duties — appeal reviewer must not be the initial moderator unless super_admin override is explicitly set */
export function canReviewerResolveAppeal(params: {
  reviewerUid: string;
  reviewerRole: CommunityGovernanceRole;
  initialModeratorUid?: string | null;
  allowSuperAdminSelfReviewOverride?: boolean;
}): { ok: boolean; errorFa?: string; code?: string } {
  if (params.reviewerRole !== 'content_moderator' && params.reviewerRole !== 'data_steward' && params.reviewerRole !== 'super_admin') {
    return { ok: false, code: 'FORBIDDEN_ROLE', errorFa: 'شما مجوز بررسی درخواست بازبینی را ندارید.' };
  }
  if (
    params.initialModeratorUid &&
    params.reviewerUid === params.initialModeratorUid &&
    !(params.reviewerRole === 'super_admin' && params.allowSuperAdminSelfReviewOverride)
  ) {
    return {
      ok: false,
      code: 'SEPARATION_OF_DUTIES_VIOLATION',
      errorFa: 'بررسی‌کننده اعتراض نباید همان ناظر صادرکننده تصمیم اولیه باشد (تفکیک وظایف ممیزی).',
    };
  }
  return { ok: true };
}

/** Stage 78.3: Active professional credential verification with expiration check */
export function filterActiveProfessionalCredentials(
  credentials: ProfessionalCredentialRecord[] | undefined,
  nowMs: number = Date.now(),
): ProfessionalCredentialRecord[] {
  if (!Array.isArray(credentials)) return [];
  return credentials.filter((cred) => {
    if (cred.status !== 'active') return false;
    const expMs = Date.parse(cred.expiresAtIso);
    if (!Number.isNaN(expMs) && expMs < nowMs) return false;
    return true;
  });
}

/** Stage 78.1 & 78.2: Server-side PII & sensitive field stripping before returning any profile */
export function stripSensitiveMemberProfileServerSide(
  rawProfile: CommunityProfile & Record<string, unknown>,
  isViewerMember: boolean,
  isOwner: boolean,
): CommunityProfile | null {
  const sanitized = sanitizePublicProfile(rawProfile, isViewerMember, isOwner);
  if (!sanitized) return null;

  const activeCreds = filterActiveProfessionalCredentials(sanitized.credentials);
  const canShowBadges = (sanitized.privacy?.showBadges ?? sanitized.showBadges) || isOwner;
  const clone = {
    ...sanitized,
    credentials: canShowBadges ? activeCreds : [],
    verifiedCredentialFa: canShowBadges && activeCreds.length > 0 ? sanitized.verifiedCredentialFa : null,
  } as CommunityProfile & Record<string, unknown>;

  // Strictly strip any private/internal keys that might exist on raw server objects
  delete clone.phone;
  delete clone.phoneNumber;
  delete clone.email;
  delete clone.authUid;
  delete clone.token;
  delete clone.abuseReportsAgainst;
  delete clone.moderationHistoryInternal;
  delete clone.rawCredentialDocuments;

  return clone;
}

export function validateSanitizedTitleAndBody(
  rawTitle: unknown,
  rawBody: unknown,
  minTitleLen: number,
  maxTitleLen: number,
  maxBodyLen: number,
): { ok: boolean; titleFa: string; bodyFa: string; errorFa?: string } {
  const titleFa = sanitizeInput(String(rawTitle || ''), maxTitleLen).trim();
  const bodyFa = sanitizeInput(String(rawBody || ''), maxBodyLen).trim();
  if (titleFa.length < minTitleLen) {
    return { ok: false, titleFa, bodyFa, errorFa: `عنوان باید حداقل ${minTitleLen} کاراکتر باشد.` };
  }
  const safety = validateCommunityTextSafety(bodyFa);
  if (!safety.ok) {
    return { ok: false, titleFa, bodyFa, errorFa: safety.errorFa || 'متن واردشده معتبر نیست.' };
  }
  return { ok: true, titleFa, bodyFa };
}
