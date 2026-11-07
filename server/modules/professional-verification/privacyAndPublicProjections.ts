/**
 * @file server/modules/professional-verification/privacyAndPublicProjections.ts
 * @description Document Privacy Guards and Minimum-Disclosure Public Verification Summary Builders
 * for Radartehran Professional Identity & Credential Verification (Employee 12).
 *
 * Security & Privacy Invariants:
 * - Sensitive identity and credential documents (`VerificationEvidenceRecord`, `PrivateDocumentEvidenceItem`)
 *   must never be publicly readable.
 * - Public verification summaries expose ONLY the minimum useful verification summary:
 *   status badge, masked credential number, issuing authority name, verification method label,
 *   expiration date, and validated official portal link (when present).
 * - Internal reviewer identities, private storage object keys, SHA-256 digests, and rejection/revocation
 *   forensic notes are strictly stripped from public projections.
 */

import {
  authorizePrincipalForVerificationAction,
  getVerificationMethodLabelFa,
  OFFICIAL_VERIFICATION_AUTHORITIES,
} from './authoritiesAndStateMachine';
import {
  isCredentialExpiredAt,
  recomputeAggregateVerificationState,
} from './workflowAndExpirationEngine';
import type {
  AuthenticatedPrincipalContext,
  BusinessOrganizationProfileRecord,
  OrganizationMembershipReference,
  ProfessionalLicenseRecord,
  ProfessionalProfileRecord,
  PublicOrganizationVerificationSummary,
  PublicProfessionalVerificationSummary,
  VerificationEvidenceRecord,
  VerificationLifecycleState,
} from './types';

/**
 * Enforces strict access control before returning a private `VerificationEvidenceRecord`.
 * Public or unrelated authenticated callers receive an immediate 403 rejection.
 */
export function readProtectedEvidenceForPrincipal(params: {
  principal: AuthenticatedPrincipalContext | null | undefined;
  evidence: VerificationEvidenceRecord;
}): {
  allowed: boolean;
  statusCode: 200 | 401 | 403;
  reasonFa: string | null;
  evidence: VerificationEvidenceRecord | null;
} {
  const auth = authorizePrincipalForVerificationAction({
    principal: params.principal,
    action: 'read_private_evidence',
    resourceOwnerUid: params.evidence.ownerPrincipalUid,
  });

  if (!auth.authorized) {
    return {
      allowed: false,
      statusCode: auth.statusCode,
      reasonFa: auth.reasonFa,
      evidence: null,
    };
  }

  return {
    allowed: true,
    statusCode: 200,
    reasonFa: null,
    evidence: params.evidence,
  };
}

/**
 * Maps a `VerificationLifecycleState` to a clear, honest Persian badge label for public display.
 */
export function getPublicVerificationBadgeLabelFa(state: VerificationLifecycleState): string {
  switch (state) {
    case 'verified':
      return 'احراز هویت و پروانه تاییدشده';
    case 'under_review':
      return 'در حال بررسی مدارک توسط بازرس';
    case 'pending':
      return 'مدارک ارسال‌شده (در انتظار بررسی)';
    case 'expired':
      return 'پروانه منقضی‌شده (نیازمند تمدید)';
    case 'suspended':
      return 'گواهی حرفه‌ای تعلیق‌شده';
    case 'revoked':
      return 'گواهی حرفه‌ای ابطال‌شده';
    case 'rejected':
      return 'مدارک تاییدنشده';
    case 'unsubmitted':
    default:
      return 'احراز هویت حرفه‌ای انجام‌نشده';
  }
}

/**
 * Builds the minimum-disclosure public verification summary for an individual professional profile.
 * Never leaks private document storage keys, reviewer UIDs, or internal rejection notes.
 */
export function buildPublicProfessionalVerificationSummary(params: {
  profile: ProfessionalProfileRecord;
  credentials: ReadonlyArray<ProfessionalLicenseRecord>;
  memberships: ReadonlyArray<OrganizationMembershipReference>;
  organizationsById: ReadonlyMap<string, BusinessOrganizationProfileRecord>;
  organizationCredentialsById?: ReadonlyMap<string, ReadonlyArray<ProfessionalLicenseRecord>>;
  referenceNowIso: string;
}): PublicProfessionalVerificationSummary {
  const {
    profile,
    credentials,
    memberships,
    organizationsById,
    organizationCredentialsById,
    referenceNowIso,
  } = params;

  const effectiveOverallState = recomputeAggregateVerificationState(credentials, referenceNowIso);
  const isCurrentlyVerified = effectiveOverallState === 'verified';

  const activeVerifiedCredentials = credentials.filter(
    (c) =>
      c.status === 'verified' &&
      c.verificationMethod !== 'unverified_submission' &&
      !isCredentialExpiredAt(c, referenceNowIso)
  );

  const verifiedCredentialsSummary = activeVerifiedCredentials.map((cred) => {
    const authority = OFFICIAL_VERIFICATION_AUTHORITIES[cred.issuingAuthorityCode];
    const safeOfficialPortalUrl =
      authority?.officialPortalBaseUrl ??
      (cred.officialVerificationUrl ? new URL(cred.officialVerificationUrl).origin : null);
    return {
      credentialType: cred.credentialType,
      issuingAuthorityNameFa: cred.issuingAuthorityNameFa,
      maskedCredentialIdentifier: cred.maskedPublicIdentifier,
      verificationMethod: cred.verificationMethod,
      verificationMethodLabelFa: getVerificationMethodLabelFa(cred.verificationMethod),
      verifiedAtIso: cred.verifiedAtIso || cred.reviewedAtIso || cred.updatedAtIso,
      expiresAtIso: cred.expiresAtIso,
      officialAuthorityPortalUrl: safeOfficialPortalUrl,
    };
  });

  const affiliatedOrganizations = memberships
    .filter((m) => m.membershipStatus === 'active_confirmed')
    .map((m) => {
      const org = organizationsById.get(m.organizationId);
      if (!org) return null;
      const orgCreds = organizationCredentialsById?.get(org.organizationId);
      const orgState = orgCreds
        ? recomputeAggregateVerificationState(orgCreds, referenceNowIso)
        : org.overallVerificationState;
      return {
        organizationId: org.organizationId,
        publicBrandNameFa: org.publicBrandNameFa,
        role: m.role,
        isOrganizationVerified: orgState === 'verified',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const verificationDisclaimerFa = isCurrentlyVerified
    ? 'این نمایه بر اساس بازبینی مدارک ثبت‌شده در تاریخ درج‌شده تایید شده است؛ استعلام نهایی آخرین وضعیت پروانه از درگاه رسمی مرجع صادرکننده توصیه می‌شود.'
    : 'این نمایه در حال حاضر دارای گواهی حرفه‌ای تاییدشده و معتبر در رادار تهران نیست.';

  return {
    profileId: profile.profileId,
    displayNameFa: profile.displayNameFa,
    entityType: profile.entityType,
    primaryCityId: profile.primaryCityId,
    coveredHoodIds: [...profile.coveredHoodIds],
    specialtySummaryFa: profile.specialtySummaryFa,
    isCurrentlyVerified,
    publicVerificationStatus: effectiveOverallState,
    badgeLabelFa: getPublicVerificationBadgeLabelFa(effectiveOverallState),
    verificationDisclaimerFa,
    verifiedCredentialsSummary,
    affiliatedOrganizations,
    serviceMarketplaceProviderId:
      profile.serviceMarketplaceProviderRef?.serviceProviderId ?? null,
  };
}

/**
 * Builds the minimum-disclosure public verification summary for a business or agency organization.
 */
export function buildPublicOrganizationVerificationSummary(params: {
  organization: BusinessOrganizationProfileRecord;
  credentials: ReadonlyArray<ProfessionalLicenseRecord>;
  confirmedMemberships: ReadonlyArray<OrganizationMembershipReference>;
  memberProfilesById: ReadonlyMap<string, ProfessionalProfileRecord>;
  referenceNowIso: string;
}): PublicOrganizationVerificationSummary {
  const {
    organization,
    credentials,
    confirmedMemberships,
    memberProfilesById,
    referenceNowIso,
  } = params;

  const effectiveOverallState = recomputeAggregateVerificationState(credentials, referenceNowIso);
  const isCurrentlyVerified = effectiveOverallState === 'verified';

  const activeVerifiedCredentials = credentials.filter(
    (c) =>
      c.status === 'verified' &&
      c.verificationMethod !== 'unverified_submission' &&
      !isCredentialExpiredAt(c, referenceNowIso)
  );

  const verifiedCredentialsSummary = activeVerifiedCredentials.map((cred) => {
    const authority = OFFICIAL_VERIFICATION_AUTHORITIES[cred.issuingAuthorityCode];
    const safeOfficialPortalUrl =
      authority?.officialPortalBaseUrl ??
      (cred.officialVerificationUrl ? new URL(cred.officialVerificationUrl).origin : null);
    return {
      credentialType: cred.credentialType,
      issuingAuthorityNameFa: cred.issuingAuthorityNameFa,
      maskedCredentialIdentifier: cred.maskedPublicIdentifier,
      verificationMethod: cred.verificationMethod,
      verificationMethodLabelFa: getVerificationMethodLabelFa(cred.verificationMethod),
      verifiedAtIso: cred.verifiedAtIso || cred.reviewedAtIso || cred.updatedAtIso,
      expiresAtIso: cred.expiresAtIso,
      officialAuthorityPortalUrl: safeOfficialPortalUrl,
    };
  });

  const activeVerifiedMembersCount = confirmedMemberships.filter((m) => {
    if (m.membershipStatus !== 'active_confirmed') return false;
    const memberProfile = memberProfilesById.get(m.professionalProfileId);
    return memberProfile?.overallVerificationState === 'verified';
  }).length;

  const verificationDisclaimerFa = isCurrentlyVerified
    ? 'مجوز فعالیت این مجموعه توسط بازرس احراز هویت بررسی شده است؛ جهت استعلام برخط می‌توانید به درگاه رسمی مرجع صادرکننده مراجعه نمایید.'
    : 'مجوز فعالیت این مجموعه در حال حاضر در وضعیت تاییدشده فعال قرار ندارد.';

  return {
    organizationId: organization.organizationId,
    publicBrandNameFa: organization.publicBrandNameFa,
    organizationType: organization.organizationType,
    primaryCityId: organization.primaryCityId,
    coveredHoodIds: [...organization.coveredHoodIds],
    isCurrentlyVerified,
    publicVerificationStatus: effectiveOverallState,
    badgeLabelFa: getPublicVerificationBadgeLabelFa(effectiveOverallState),
    verificationDisclaimerFa,
    verifiedCredentialsSummary,
    activeVerifiedMembersCount,
    serviceMarketplaceProviderId:
      organization.serviceMarketplaceProviderRef?.serviceProviderId ?? null,
  };
}
