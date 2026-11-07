/**
 * @file server/modules/professional-verification/workflowAndExpirationEngine.ts
 * @description Pure Workflow, Evidence Integrity, Anti-Plausibility Enforcement, Expiration
 * Tracking, and Audit Trail Engine for Professional Identity & Credential Verification (Employee 12).
 */

import crypto from 'node:crypto';
import {
  authorizePrincipalForVerificationAction,
  maskCredentialIdentifierForPublic,
  OFFICIAL_VERIFICATION_AUTHORITIES,
  validateOfficialAuthorityVerificationUrl,
  validateVerificationStateTransition,
} from './authoritiesAndStateMachine';
import type {
  AuthenticatedPrincipalContext,
  CredentialCategory,
  IssuingAuthorityCode,
  PrivateDocumentEvidenceItem,
  ProfessionalLicenseRecord,
  VerificationAuditLogEntry,
  VerificationEvidenceRecord,
  VerificationLifecycleState,
  VerificationMethodType,
  VerifiedEntityType,
} from './types';
import type { CityId } from '../../../src/types/models';

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i;

/**
 * Generates a deterministic SHA-256 integrity hash for an audit log entry.
 */
export function computeAuditIntegrityHash(payload: {
  targetType: string;
  targetId: string;
  actorPrincipalUid: string;
  previousState: string | null;
  nextState: string;
  verificationMethod: string | null;
  occurredAtIso: string;
  reasonFa: string;
}): string {
  const canonical = JSON.stringify([
    payload.targetType,
    payload.targetId,
    payload.actorPrincipalUid,
    payload.previousState,
    payload.nextState,
    payload.verificationMethod,
    payload.occurredAtIso,
    payload.reasonFa,
  ]);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function createVerificationAuditRecord(params: {
  targetType: VerificationAuditLogEntry['targetType'];
  targetId: string;
  actorPrincipalUid: string;
  actorRole: string;
  previousState: VerificationLifecycleState | string | null;
  nextState: VerificationLifecycleState | string;
  verificationMethod: VerificationMethodType | null;
  reasonFa: string;
  occurredAtIso: string;
}): VerificationAuditLogEntry {
  const integrityHashHex = computeAuditIntegrityHash({
    targetType: params.targetType,
    targetId: params.targetId,
    actorPrincipalUid: params.actorPrincipalUid,
    previousState: params.previousState,
    nextState: params.nextState,
    verificationMethod: params.verificationMethod,
    occurredAtIso: params.occurredAtIso,
    reasonFa: params.reasonFa,
  });
  return {
    auditId: `vaudit-${params.targetId}-${integrityHashHex.slice(0, 12)}`,
    targetType: params.targetType,
    targetId: params.targetId,
    actorPrincipalUid: params.actorPrincipalUid,
    actorRole: params.actorRole,
    previousState: params.previousState,
    nextState: params.nextState,
    verificationMethod: params.verificationMethod,
    reasonFa: params.reasonFa,
    occurredAtIso: params.occurredAtIso,
    integrityHashHex,
  };
}

/**
 * Validates a private document evidence item before attaching it to an evidence record.
 */
export function validatePrivateDocumentEvidenceItem(
  doc: PrivateDocumentEvidenceItem,
  expectedUploaderUid: string
): { valid: boolean; reasonFa: string | null } {
  if (!doc.evidenceItemId || doc.evidenceItemId.trim().length < 3) {
    return { valid: false, reasonFa: 'شناسه یکتای فایل مدرک نامعتبر است.' };
  }
  if (!doc.privateStorageObjectKey || doc.privateStorageObjectKey.trim().length < 5) {
    return { valid: false, reasonFa: 'کلید ذخیره‌سازی خصوصی مدرک نامعتبر است.' };
  }
  if (/^https?:\/\//i.test(doc.privateStorageObjectKey) || doc.privateStorageObjectKey.includes('public')) {
    return {
      valid: false,
      reasonFa: 'مدارک هویتی و صنفی نباید در مسیر عمومی (Public URL) ذخیره شوند؛ استفاده از کلید خصوصی الزامی است.',
    };
  }
  if (!SHA256_HEX_REGEX.test(doc.sha256DigestHex)) {
    return { valid: false, reasonFa: 'هش یکپارچگی فایل مدرک (SHA-256) نامعتبر است.' };
  }
  if (doc.accessClassification !== 'restricted_reviewer_only') {
    return {
      valid: false,
      reasonFa: 'سطح دسترسی مدارک هویتی باید الزاماً «restricted_reviewer_only» باشد.',
    };
  }
  if (!Number.isFinite(doc.byteSize) || doc.byteSize <= 0 || doc.byteSize > 25 * 1024 * 1024) {
    return { valid: false, reasonFa: 'حجم فایل مدرک باید بین ۱ بایت تا ۲۵ مگابایت باشد.' };
  }
  if (doc.uploadedByUid !== expectedUploaderUid) {
    return { valid: false, reasonFa: 'شناسه بارگذاری‌کننده مدرک با مالک پرونده هم‌خوانی ندارد.' };
  }
  return { valid: true, reasonFa: null };
}

/**
 * Creates a new draft (`unsubmitted`) credential and matching private evidence record.
 * Never marks a credential verified upon creation regardless of how plausible the license number looks.
 */
export function createUnsubmittedCredentialDraft(params: {
  principal: AuthenticatedPrincipalContext;
  credentialId: string;
  profileId: string;
  entityType: VerifiedEntityType;
  credentialType: CredentialCategory;
  issuingAuthorityCode: IssuingAuthorityCode;
  credentialIdentifier: string;
  holderFullNameFa: string;
  linkedOrganizationId?: string | null;
  cityId: CityId;
  expirationDateIso?: string | null;
  createdAtIso: string;
}): {
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  audit: VerificationAuditLogEntry;
} {
  const authCheck = authorizePrincipalForVerificationAction({
    principal: params.principal,
    action: 'submit_own_credential',
    resourceOwnerUid: params.principal.uid,
  });
  if (!authCheck.authorized) {
    throw new Error(authCheck.reasonFa || 'UNAUTHORIZED_CREDENTIAL_DRAFT');
  }

  const cleanIdentifier = String(params.credentialIdentifier || '').trim();
  const cleanHolder = String(params.holderFullNameFa || '').trim();
  if (cleanIdentifier.length < 3) {
    throw new Error('شماره پروانه یا شناسه مدرک معتبر نیست (حداقل ۳ کاراکتر).');
  }
  if (cleanHolder.length < 3) {
    throw new Error('نام و نام خانوادگی صاحب امتیاز پروانه الزامی است.');
  }

  const authority = OFFICIAL_VERIFICATION_AUTHORITIES[params.issuingAuthorityCode];
  if (!authority) {
    throw new Error('مرجع صادرکننده مجوز معتبر نیست.');
  }

  const evidenceRecordId = `vevid-${params.credentialId}`;
  const license: ProfessionalLicenseRecord = {
    credentialId: params.credentialId,
    profileId: params.profileId,
    ownerPrincipalUid: params.principal.uid,
    entityType: params.entityType,
    credentialType: params.credentialType,
    issuingAuthorityCode: params.issuingAuthorityCode,
    issuingAuthorityNameFa: authority.nameFa,
    credentialIdentifier: cleanIdentifier,
    maskedPublicIdentifier: maskCredentialIdentifierForPublic(cleanIdentifier),
    holderFullNameFa: cleanHolder,
    linkedOrganizationId: params.linkedOrganizationId ?? null,
    cityId: params.cityId,
    status: 'unsubmitted',
    verificationMethod: 'unverified_submission',
    submittedAtIso: null,
    reviewedAtIso: null,
    verifiedAtIso: null,
    expiresAtIso: params.expirationDateIso ?? null,
    revokedAtIso: null,
    suspendedAtIso: null,
    evidenceRecordId,
    officialVerificationUrl: null,
    updatedAtIso: params.createdAtIso,
  };

  const evidence: VerificationEvidenceRecord = {
    evidenceRecordId,
    credentialId: params.credentialId,
    ownerPrincipalUid: params.principal.uid,
    issuingAuthorityCode: params.issuingAuthorityCode,
    issuingAuthorityNameFa: authority.nameFa,
    credentialType: params.credentialType,
    credentialIdentifier: cleanIdentifier,
    holderFullNameFa: cleanHolder,
    linkedOrganizationId: params.linkedOrganizationId ?? null,
    submissionTimestampIso: null,
    reviewTimestampIso: null,
    privateDocuments: [],
    officialVerificationUrl: null,
    officialInquiryReferenceCode: null,
    verificationMethod: 'unverified_submission',
    reviewerIdentity: null,
    expirationDateIso: params.expirationDateIso ?? null,
    currentStatus: 'unsubmitted',
    internalReviewerNotesFa: null,
    rejectionOrActionReasonFa: null,
  };

  const audit = createVerificationAuditRecord({
    targetType: 'credential',
    targetId: params.credentialId,
    actorPrincipalUid: params.principal.uid,
    actorRole: 'owner',
    previousState: null,
    nextState: 'unsubmitted',
    verificationMethod: 'unverified_submission',
    reasonFa: 'ایجاد پیش‌نویس مدرک حرفه‌ای (ارسال‌نشده).',
    occurredAtIso: params.createdAtIso,
  });

  return { license, evidence, audit };
}

/**
 * Submits a credential with private supporting documents for verification review.
 *
 * CRITICAL DOMAIN INVARIANT:
 * Submitting a license number and uploading documents ONLY transitions the credential to `'pending'`
 * with `verificationMethod: 'unverified_submission'`. It NEVER auto-verifies the credential.
 */
export function submitCredentialForReview(params: {
  principal: AuthenticatedPrincipalContext;
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  privateDocuments: ReadonlyArray<PrivateDocumentEvidenceItem>;
  expirationDateIso?: string | null;
  submittedAtIso: string;
}): {
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  audit: VerificationAuditLogEntry;
} {
  const authCheck = authorizePrincipalForVerificationAction({
    principal: params.principal,
    action: 'submit_own_credential',
    resourceOwnerUid: params.license.ownerPrincipalUid,
  });
  if (!authCheck.authorized) {
    throw new Error(authCheck.reasonFa || 'UNAUTHORIZED_CREDENTIAL_SUBMISSION');
  }

  const transition = validateVerificationStateTransition(params.license.status, 'pending');
  if (!transition.allowed) {
    throw new Error(transition.reasonFa || 'INVALID_SUBMISSION_STATE_TRANSITION');
  }

  if (!Array.isArray(params.privateDocuments) || params.privateDocuments.length === 0) {
    throw new Error(
      'صرف درج شماره پروانه کافی نیست؛ بارگذاری حداقل یک مدرک مثبته خصوصی برای ارسال به صف بررسی الزامی است.'
    );
  }

  for (const doc of params.privateDocuments) {
    const check = validatePrivateDocumentEvidenceItem(doc, params.license.ownerPrincipalUid);
    if (!check.valid) {
      throw new Error(check.reasonFa || 'INVALID_PRIVATE_DOCUMENT');
    }
  }

  const effectiveExpiration =
    params.expirationDateIso !== undefined ? params.expirationDateIso : params.license.expiresAtIso;

  if (effectiveExpiration) {
    const expMs = Date.parse(effectiveExpiration);
    const subMs = Date.parse(params.submittedAtIso);
    if (!Number.isFinite(expMs) || expMs <= subMs) {
      throw new Error('تاریخ اعتبار پروانه منقضی شده یا نامعتبر است و امکان ارسال جهت تایید وجود ندارد.');
    }
  }

  const updatedLicense: ProfessionalLicenseRecord = {
    ...params.license,
    status: 'pending',
    verificationMethod: 'unverified_submission',
    submittedAtIso: params.submittedAtIso,
    expiresAtIso: effectiveExpiration ?? null,
    updatedAtIso: params.submittedAtIso,
  };

  const updatedEvidence: VerificationEvidenceRecord = {
    ...params.evidence,
    submissionTimestampIso: params.submittedAtIso,
    privateDocuments: [...params.privateDocuments],
    expirationDateIso: effectiveExpiration ?? null,
    currentStatus: 'pending',
    verificationMethod: 'unverified_submission',
    rejectionOrActionReasonFa: null,
  };

  const audit = createVerificationAuditRecord({
    targetType: 'credential',
    targetId: params.license.credentialId,
    actorPrincipalUid: params.principal.uid,
    actorRole: 'owner',
    previousState: params.license.status,
    nextState: 'pending',
    verificationMethod: 'unverified_submission',
    reasonFa: `ارسال مدرک به همراه ${params.privateDocuments.length} سند خصوصی جهت بررسی بازرس (صرف ارسال مدرک به معنای تایید رسمی نیست).`,
    occurredAtIso: params.submittedAtIso,
  });

  return { license: updatedLicense, evidence: updatedEvidence, audit };
}

/**
 * Transitions a `pending` credential into `under_review` by an authorized reviewer.
 */
export function startCredentialVerificationReview(params: {
  reviewerPrincipal: AuthenticatedPrincipalContext;
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  startedAtIso: string;
}): {
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  audit: VerificationAuditLogEntry;
} {
  const authCheck = authorizePrincipalForVerificationAction({
    principal: params.reviewerPrincipal,
    action: 'review_credential',
    resourceOwnerUid: params.license.ownerPrincipalUid,
  });
  if (!authCheck.authorized) {
    throw new Error(authCheck.reasonFa || 'UNAUTHORIZED_REVIEW_START');
  }

  const transition = validateVerificationStateTransition(params.license.status, 'under_review');
  if (!transition.allowed) {
    throw new Error(transition.reasonFa || 'INVALID_UNDER_REVIEW_TRANSITION');
  }

  const updatedLicense: ProfessionalLicenseRecord = {
    ...params.license,
    status: 'under_review',
    updatedAtIso: params.startedAtIso,
  };

  const updatedEvidence: VerificationEvidenceRecord = {
    ...params.evidence,
    currentStatus: 'under_review',
  };

  const audit = createVerificationAuditRecord({
    targetType: 'credential',
    targetId: params.license.credentialId,
    actorPrincipalUid: params.reviewerPrincipal.uid,
    actorRole: params.reviewerPrincipal.isAdmin ? 'admin' : 'reviewer',
    previousState: params.license.status,
    nextState: 'under_review',
    verificationMethod: params.evidence.verificationMethod,
    reasonFa: 'آغاز بررسی تخصصی پرونده توسط بازرس احراز هویت.',
    occurredAtIso: params.startedAtIso,
  });

  return { license: updatedLicense, evidence: updatedEvidence, audit };
}

/**
 * Records an authorized reviewer's decision (`verified` or `rejected`) on a credential.
 *
 * Enforces:
 * - Authorized reviewer + Separation of Duties (`reviewer.uid !== ownerUid`).
 * - Cannot mark `verified` with `'unverified_submission'`.
 * - Cannot mark `verified` without at least 1 valid private evidence item.
 * - If `'official_authority_registry_cross_check'` is selected, requires either a validated
 *   HTTPS official authority URL or an explicit `officialInquiryReferenceCode`.
 * - Rejects verification if the credential is already expired at `reviewedAtIso`.
 */
export function decideCredentialVerificationReview(params: {
  reviewerPrincipal: AuthenticatedPrincipalContext;
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  decision: 'verified' | 'rejected';
  verificationMethod: VerificationMethodType;
  officialVerificationUrl?: string | null;
  officialInquiryReferenceCode?: string | null;
  expirationDateIso?: string | null;
  internalReviewerNotesFa?: string | null;
  decisionReasonFa: string;
  reviewedAtIso: string;
}): {
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  audit: VerificationAuditLogEntry;
} {
  const authCheck = authorizePrincipalForVerificationAction({
    principal: params.reviewerPrincipal,
    action: 'review_credential',
    resourceOwnerUid: params.license.ownerPrincipalUid,
  });
  if (!authCheck.authorized) {
    throw new Error(authCheck.reasonFa || 'UNAUTHORIZED_REVIEW_DECISION');
  }

  const transition = validateVerificationStateTransition(params.license.status, params.decision);
  if (!transition.allowed) {
    throw new Error(transition.reasonFa || 'INVALID_REVIEW_DECISION_TRANSITION');
  }

  const cleanReason = String(params.decisionReasonFa || '').trim();
  if (cleanReason.length < 5) {
    throw new Error('ثبت علت و شرح تصمیم بازرس (حداقل ۵ کاراکتر) برای گزارش ممیزی الزامی است.');
  }

  let validatedOfficialUrl: string | null = null;
  const effectiveExpiration =
    params.expirationDateIso !== undefined ? params.expirationDateIso : params.license.expiresAtIso;

  if (params.decision === 'verified') {
    if (params.verificationMethod === 'unverified_submission') {
      throw new Error(
        'تایید مدرک صرفاً بر اساس ادعای کاربر یا ظاهر شماره پروانه مجاز نیست؛ روش بازبینی («manual_document_review» یا «official_authority_registry_cross_check») باید مشخص شود.'
      );
    }

    if (!params.evidence.privateDocuments || params.evidence.privateDocuments.length === 0) {
      throw new Error('تایید مدرک بدون وجود اسناد مثبته در پرونده شواهد مجاز نیست.');
    }

    if (effectiveExpiration) {
      const expMs = Date.parse(effectiveExpiration);
      const revMs = Date.parse(params.reviewedAtIso);
      if (!Number.isFinite(expMs) || expMs <= revMs) {
        throw new Error('مدرک منقضی‌شده قابل تایید نیست.');
      }
    }

    const urlValidation = validateOfficialAuthorityVerificationUrl(
      params.license.issuingAuthorityCode,
      params.officialVerificationUrl
    );
    if (!urlValidation.valid) {
      throw new Error(urlValidation.reasonFa || 'INVALID_OFFICIAL_AUTHORITY_URL');
    }
    validatedOfficialUrl = urlValidation.normalizedUrl;

    if (params.verificationMethod === 'official_authority_registry_cross_check') {
      const hasInquiryCode =
        typeof params.officialInquiryReferenceCode === 'string' &&
        params.officialInquiryReferenceCode.trim().length >= 3;
      if (!validatedOfficialUrl && !hasInquiryCode) {
        throw new Error(
          'برای روش «تطبیق با درگاه رسمی مرجع صادرکننده»، ثبت نشانی معتبر درگاه رسمی یا کد پیگیری استعلام الزامی است.'
        );
      }
    }
  }

  const reviewerRole: 'reviewer' | 'compliance_officer' | 'admin' = params.reviewerPrincipal.isAdmin
    ? 'admin'
    : params.reviewerPrincipal.roles.includes('compliance_officer')
      ? 'compliance_officer'
      : 'reviewer';

  const effectiveMethod: VerificationMethodType =
    params.decision === 'verified' ? params.verificationMethod : params.evidence.verificationMethod;

  const updatedLicense: ProfessionalLicenseRecord = {
    ...params.license,
    status: params.decision,
    verificationMethod: effectiveMethod,
    reviewedAtIso: params.reviewedAtIso,
    verifiedAtIso: params.decision === 'verified' ? params.reviewedAtIso : null,
    expiresAtIso: effectiveExpiration ?? null,
    officialVerificationUrl: validatedOfficialUrl,
    updatedAtIso: params.reviewedAtIso,
  };

  const updatedEvidence: VerificationEvidenceRecord = {
    ...params.evidence,
    reviewTimestampIso: params.reviewedAtIso,
    officialVerificationUrl: validatedOfficialUrl,
    officialInquiryReferenceCode: params.officialInquiryReferenceCode?.trim() || null,
    verificationMethod: effectiveMethod,
    reviewerIdentity: {
      reviewerUid: params.reviewerPrincipal.uid,
      reviewerRole,
      reviewedAtIso: params.reviewedAtIso,
    },
    expirationDateIso: effectiveExpiration ?? null,
    currentStatus: params.decision,
    internalReviewerNotesFa: params.internalReviewerNotesFa?.trim() || null,
    rejectionOrActionReasonFa: cleanReason,
  };

  const audit = createVerificationAuditRecord({
    targetType: 'credential',
    targetId: params.license.credentialId,
    actorPrincipalUid: params.reviewerPrincipal.uid,
    actorRole: reviewerRole,
    previousState: params.license.status,
    nextState: params.decision,
    verificationMethod: effectiveMethod,
    reasonFa: cleanReason,
    occurredAtIso: params.reviewedAtIso,
  });

  return { license: updatedLicense, evidence: updatedEvidence, audit };
}

/**
 * Suspends or revokes a credential, or reinstates a suspended credential.
 */
export function applyDisciplinaryCredentialTransition(params: {
  actorPrincipal: AuthenticatedPrincipalContext;
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  targetState: 'suspended' | 'revoked' | 'verified';
  reasonFa: string;
  occurredAtIso: string;
}): {
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  audit: VerificationAuditLogEntry;
} {
  const authCheck = authorizePrincipalForVerificationAction({
    principal: params.actorPrincipal,
    action: 'revoke_or_suspend_credential',
    resourceOwnerUid: params.license.ownerPrincipalUid,
  });
  if (!authCheck.authorized) {
    throw new Error(authCheck.reasonFa || 'UNAUTHORIZED_DISCIPLINARY_ACTION');
  }

  const transition = validateVerificationStateTransition(params.license.status, params.targetState);
  if (!transition.allowed) {
    throw new Error(transition.reasonFa || 'INVALID_DISCIPLINARY_STATE_TRANSITION');
  }

  const cleanReason = String(params.reasonFa || '').trim();
  if (cleanReason.length < 5) {
    throw new Error('ثبت علت تعلیق، ابطال یا رفع تعلیق در گزارش ممیزی الزامی است.');
  }

  if (params.targetState === 'verified' && isCredentialExpiredAt(params.license, params.occurredAtIso)) {
    throw new Error('مدرک منقضی‌شده قابل رفع تعلیق به وضعیت تاییدشده نیست.');
  }

  const updatedLicense: ProfessionalLicenseRecord = {
    ...params.license,
    status: params.targetState,
    revokedAtIso: params.targetState === 'revoked' ? params.occurredAtIso : params.license.revokedAtIso,
    suspendedAtIso:
      params.targetState === 'suspended'
        ? params.occurredAtIso
        : params.targetState === 'verified'
          ? null
          : params.license.suspendedAtIso,
    updatedAtIso: params.occurredAtIso,
  };

  const updatedEvidence: VerificationEvidenceRecord = {
    ...params.evidence,
    currentStatus: params.targetState,
    rejectionOrActionReasonFa: cleanReason,
  };

  const audit = createVerificationAuditRecord({
    targetType: 'credential',
    targetId: params.license.credentialId,
    actorPrincipalUid: params.actorPrincipal.uid,
    actorRole: params.actorPrincipal.isAdmin ? 'admin' : 'compliance_officer',
    previousState: params.license.status,
    nextState: params.targetState,
    verificationMethod: params.license.verificationMethod,
    reasonFa: cleanReason,
    occurredAtIso: params.occurredAtIso,
  });

  return { license: updatedLicense, evidence: updatedEvidence, audit };
}

/**
 * Checks whether a credential's `expiresAtIso` timestamp has passed relative to `referenceNowIso`.
 */
export function isCredentialExpiredAt(
  license: Pick<ProfessionalLicenseRecord, 'expiresAtIso'>,
  referenceNowIso: string
): boolean {
  if (!license.expiresAtIso) return false;
  const expMs = Date.parse(license.expiresAtIso);
  const nowMs = Date.parse(referenceNowIso);
  if (!Number.isFinite(expMs) || !Number.isFinite(nowMs)) return false;
  return expMs <= nowMs;
}

/**
 * Evaluates a credential for expiration and transitions `verified` or `suspended` credentials to `expired`.
 */
export function evaluateAndTransitionExpiredCredential(params: {
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  referenceNowIso: string;
}): {
  didExpire: boolean;
  license: ProfessionalLicenseRecord;
  evidence: VerificationEvidenceRecord;
  audit: VerificationAuditLogEntry | null;
} {
  const { license, evidence, referenceNowIso } = params;
  if (
    (license.status !== 'verified' && license.status !== 'suspended') ||
    !isCredentialExpiredAt(license, referenceNowIso)
  ) {
    return { didExpire: false, license, evidence, audit: null };
  }

  const updatedLicense: ProfessionalLicenseRecord = {
    ...license,
    status: 'expired',
    updatedAtIso: referenceNowIso,
  };

  const updatedEvidence: VerificationEvidenceRecord = {
    ...evidence,
    currentStatus: 'expired',
    rejectionOrActionReasonFa: 'انقضای خودکار مدرک به دلیل پایان تاریخ اعتبار.',
  };

  const audit = createVerificationAuditRecord({
    targetType: 'credential',
    targetId: license.credentialId,
    actorPrincipalUid: 'system:expiration_monitor',
    actorRole: 'system',
    previousState: license.status,
    nextState: 'expired',
    verificationMethod: license.verificationMethod,
    reasonFa: `انقضای تاریخ اعتبار پروانه (${license.expiresAtIso}).`,
    occurredAtIso: referenceNowIso,
  });

  return { didExpire: true, license: updatedLicense, evidence: updatedEvidence, audit };
}

/**
 * Computes the aggregate verification state of a profile or organization from its credentials.
 * - `'verified'` ONLY if at least one credential is `'verified'` and not expired at `referenceNowIso`.
 */
export function recomputeAggregateVerificationState(
  credentials: ReadonlyArray<ProfessionalLicenseRecord>,
  referenceNowIso: string
): VerificationLifecycleState {
  if (!credentials || credentials.length === 0) {
    return 'unsubmitted';
  }

  const effectiveStates = credentials.map((c) =>
    (c.status === 'verified' || c.status === 'suspended') && isCredentialExpiredAt(c, referenceNowIso)
      ? 'expired'
      : c.status
  );

  if (effectiveStates.includes('verified')) return 'verified';
  if (effectiveStates.includes('suspended')) return 'suspended';
  if (effectiveStates.includes('revoked')) return 'revoked';
  if (effectiveStates.includes('expired')) return 'expired';
  if (effectiveStates.includes('under_review')) return 'under_review';
  if (effectiveStates.includes('pending')) return 'pending';
  if (effectiveStates.includes('rejected')) return 'rejected';
  return 'unsubmitted';
}
