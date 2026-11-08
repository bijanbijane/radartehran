import type {
  DigitalDocumentRecord,
  DocumentCategory,
  DocumentConfidentialityLevel,
  DocumentLifecycleState,
  DocumentSharingGrantRecord,
} from './types';

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
]);

export function validateStorageObjectKeySafety(storageObjectKey: string): {
  valid: boolean;
  reason?: string;
} {
  const trimmed = storageObjectKey.trim();
  if (!trimmed || trimmed.length > 256) {
    return { valid: false, reason: 'storageObjectKey must be a non-empty string up to 256 chars.' };
  }
  if (trimmed.includes('..') || trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.includes('\0')) {
    return { valid: false, reason: 'Path traversal or unsafe path characters detected in storageObjectKey.' };
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed)) {
    return { valid: false, reason: 'storageObjectKey contains unsupported characters.' };
  }
  return { valid: true };
}

export function resolveCategoryClassificationDefaults(category: DocumentCategory): {
  labelFa: string;
  labelEn: string;
  defaultConfidentiality: DocumentConfidentialityLevel;
  mandatoryRetentionDays: number;
  requiresExplicitVerification: boolean;
} {
  switch (category) {
    case 'OWNERSHIP_TITLE':
      return {
        labelFa: 'سند مالکیت و بنچاق',
        labelEn: 'Ownership Title & Deed',
        defaultConfidentiality: 'RESTRICTED_LEGAL_IDENTITY',
        mandatoryRetentionDays: 3650, // 10 years
        requiresExplicitVerification: true,
      };
    case 'IDENTITY_VERIFICATION_REF':
      return {
        labelFa: 'مدرک احراز هویت قانونی',
        labelEn: 'Identity Verification Reference',
        defaultConfidentiality: 'RESTRICTED_LEGAL_IDENTITY',
        mandatoryRetentionDays: 1825, // 5 years
        requiresExplicitVerification: true,
      };
    case 'SALE_PURCHASE_AGREEMENT':
    case 'FINANCIAL_SETTLEMENT':
      return {
        labelFa: 'قرارداد مبایعه‌نامه و تسویه مالی',
        labelEn: 'Sale Agreement & Financial Settlement',
        defaultConfidentiality: 'PARTICIPANT_CONFIDENTIAL',
        mandatoryRetentionDays: 3650, // 10 years
        requiresExplicitVerification: true,
      };
    case 'RENTAL_LEASE_AGREEMENT':
      return {
        labelFa: 'قرارداد اجاره‌نامه رسمی',
        labelEn: 'Rental & Lease Agreement',
        defaultConfidentiality: 'PARTICIPANT_CONFIDENTIAL',
        mandatoryRetentionDays: 1825, // 5 years
        requiresExplicitVerification: true,
      };
    case 'AUTHORIZATION_REPRESENTATION':
    case 'BROKERAGE_AGREEMENT':
      return {
        labelFa: 'وکالت‌نامه و قرارداد کارگزاری',
        labelEn: 'Representation & Brokerage Agreement',
        defaultConfidentiality: 'OWNER_AND_BROKER_ONLY',
        mandatoryRetentionDays: 1825,
        requiresExplicitVerification: true,
      };
    case 'ADMINISTRATIVE_RECORD':
      return {
        labelFa: 'سند اداری و نظارتی',
        labelEn: 'Administrative Record',
        defaultConfidentiality: 'ADMIN_ONLY',
        mandatoryRetentionDays: 2555,
        requiresExplicitVerification: false,
      };
    default:
      return {
        labelFa: 'مستندات فنی و پیوست ملک',
        labelEn: 'Property Technical & Supporting Document',
        defaultConfidentiality: 'OWNER_AND_BROKER_ONLY',
        mandatoryRetentionDays: 1095, // 3 years
        requiresExplicitVerification: false,
      };
  }
}

const ALLOWED_LIFECYCLE_TRANSITIONS: Record<DocumentLifecycleState, readonly DocumentLifecycleState[]> = {
  UPLOADING: ['PROCESSING', 'QUARANTINED', 'PENDING_REVIEW', 'ACTIVE'],
  QUARANTINED: ['REJECTED', 'REVOKED', 'PENDING_REVIEW'],
  PROCESSING: ['PENDING_REVIEW', 'ACTIVE', 'QUARANTINED', 'REJECTED'],
  PENDING_REVIEW: ['VERIFIED', 'ACTIVE', 'REJECTED', 'QUARANTINED', 'SUPERSEDED'],
  ACTIVE: ['PENDING_REVIEW', 'VERIFIED', 'EXPIRED', 'SUPERSEDED', 'REVOKED', 'ARCHIVED'],
  VERIFIED: ['EXPIRED', 'SUPERSEDED', 'REVOKED', 'ARCHIVED'],
  REJECTED: ['PENDING_REVIEW', 'ARCHIVED', 'DELETION_PENDING'],
  EXPIRED: ['PENDING_REVIEW', 'ARCHIVED', 'SUPERSEDED'],
  SUPERSEDED: ['ARCHIVED'],
  REVOKED: ['ARCHIVED'],
  ARCHIVED: ['DELETION_PENDING'],
  DELETION_PENDING: [],
};

export function validateDocumentLifecycleTransition(params: {
  fromState: DocumentLifecycleState;
  toState: DocumentLifecycleState;
  isAdmin: boolean;
  viaExplicitVerificationReview?: boolean;
}): { allowed: boolean; reason?: string } {
  const { fromState, toState, isAdmin, viaExplicitVerificationReview } = params;
  const nextAllowed = ALLOWED_LIFECYCLE_TRANSITIONS[fromState] ?? [];
  if (!nextAllowed.includes(toState)) {
    return {
      allowed: false,
      reason: `Lifecycle transition from '${fromState}' to '${toState}' is not permitted.`,
    };
  }

  if (toState === 'VERIFIED' && !viaExplicitVerificationReview) {
    return {
      allowed: false,
      reason: 'A document cannot transition to VERIFIED without an explicit verification review decision.',
    };
  }

  if ((fromState === 'REJECTED' || fromState === 'REVOKED' || fromState === 'QUARANTINED') && toState === 'PENDING_REVIEW' && !isAdmin) {
    return {
      allowed: false,
      reason: `Restoring a '${fromState}' document requires administrative authorization.`,
    };
  }

  return { allowed: true };
}

export function canActorAccessDocument(params: {
  doc: DigitalDocumentRecord;
  versionNumber?: number;
  actorUid?: string;
  isAdmin: boolean;
  requireDownloadPermission: boolean;
  isPublicListingEndpoint?: boolean;
  activeGrants: DocumentSharingGrantRecord[];
  nowIso: string;
}): { allowed: boolean; reason?: string; viaGrant?: DocumentSharingGrantRecord } {
  const { doc, versionNumber, actorUid, isAdmin, requireDownloadPermission, isPublicListingEndpoint, activeGrants, nowIso } = params;
  const targetVer = versionNumber ?? doc.currentVersionNumber;

  // Public listing endpoints must NEVER expose private legal, financial, identity, or ownership documents
  if (isPublicListingEndpoint) {
    if (
      doc.confidentiality !== 'PUBLIC_LISTING_ATTACHMENT' ||
      doc.category === 'OWNERSHIP_TITLE' ||
      doc.category === 'IDENTITY_VERIFICATION_REF' ||
      doc.category === 'FINANCIAL_SETTLEMENT' ||
      doc.category === 'SALE_PURCHASE_AGREEMENT' ||
      doc.category === 'RENTAL_LEASE_AGREEMENT'
    ) {
      return {
        allowed: false,
        reason: 'Private legal, financial, identity, or ownership documents cannot be exposed on public endpoints.',
      };
    }
    return { allowed: true };
  }

  if (isAdmin) {
    return { allowed: true };
  }

  if (!actorUid) {
    return { allowed: false, reason: 'Authentication required to access document.' };
  }

  if (doc.confidentiality === 'ADMIN_ONLY') {
    return { allowed: false, reason: 'Document is restricted to administrative personnel.' };
  }

  if (doc.ownerUid === actorUid) {
    return { allowed: true };
  }

  if (
    doc.authorizedParticipantUids.includes(actorUid) &&
    doc.confidentiality !== 'RESTRICTED_LEGAL_IDENTITY'
  ) {
    return { allowed: true };
  }

  // Check explicit version-specific sharing grants
  const nowMs = Date.parse(nowIso);
  const matchingGrant = activeGrants.find(
    (g) =>
      g.documentId === doc.documentId &&
      g.versionNumber === targetVer &&
      g.recipientUid === actorUid &&
      !g.revoked &&
      Date.parse(g.expiresAtIso) > nowMs,
  );

  if (matchingGrant) {
    if (requireDownloadPermission && !matchingGrant.canDownload) {
      return {
        allowed: false,
        reason: 'Sharing grant allows metadata view only and does not permit file download.',
      };
    }
    return { allowed: true, viaGrant: matchingGrant };
  }

  return {
    allowed: false,
    reason: 'Access denied (IDOR protection): actor is not owner, authorized participant, or valid grant recipient.',
  };
}
