import type {
  AdminAuthorizationStoreAdapter,
  AuditLoggerAdapter,
  FirebaseIdTokenVerifier,
  RateLimiterAdapter,
  TelemetryAdapter,
  TransactionRunnerAdapter,
} from '../core';

export type DocumentCategory =
  | 'PROPERTY_DOCUMENT'
  | 'OWNERSHIP_TITLE'
  | 'AUTHORIZATION_REPRESENTATION'
  | 'SALE_PURCHASE_AGREEMENT'
  | 'RENTAL_LEASE_AGREEMENT'
  | 'TRANSACTION_ATTACHMENT'
  | 'FINANCIAL_SETTLEMENT'
  | 'PROPERTY_INSPECTION_REPORT'
  | 'BUILDING_MAINTENANCE_DOC'
  | 'TECHNICAL_PLAN_DRAWING'
  | 'CONSTRUCTION_PERMIT'
  | 'BROKERAGE_AGREEMENT'
  | 'IDENTITY_VERIFICATION_REF'
  | 'LEGAL_CORRESPONDENCE'
  | 'ADMINISTRATIVE_RECORD'
  | 'SUPPORTING_EVIDENCE';

export type DocumentLifecycleState =
  | 'UPLOADING'
  | 'QUARANTINED'
  | 'PROCESSING'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'REVOKED'
  | 'ARCHIVED'
  | 'DELETION_PENDING';

export type DocumentConfidentialityLevel =
  | 'PUBLIC_LISTING_ATTACHMENT'
  | 'PARTICIPANT_CONFIDENTIAL'
  | 'OWNER_AND_BROKER_ONLY'
  | 'RESTRICTED_LEGAL_IDENTITY'
  | 'ADMIN_ONLY';

export interface RelatedEntityReferences {
  propertyId?: string;
  buildingId?: string;
  unitId?: string;
  listingId?: string;
  transactionId?: string;
  tenancyId?: string;
  brokerageAgreementId?: string;
  representationId?: string;
  contractVersionRef?: string;
  amendmentParentDocId?: string;
}

export interface MachineExtractionSuggestion {
  extractedAtIso: string;
  ocrTextSummary?: string;
  suggestedCategory?: DocumentCategory;
  malwareScanClean: boolean;
  unverifiedMachineSuggestion: true;
}

export interface DocumentVersionRecord {
  versionId: string;
  versionNumber: number;
  storageObjectKey: string;
  originalFilename: string;
  validatedMimeType: string;
  validatedSizeBytes: number;
  contentSha256: string;
  uploadedByUid: string;
  uploadedAtIso: string;
  replacementReason?: string;
  previousVersionId?: string;
  supersededByVersionId?: string;
  status: 'CURRENT' | 'SUPERSEDED' | 'QUARANTINED' | 'REVOKED';
  verificationStatus: 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'REVISION_REQUESTED';
  verifiedByUid?: string;
  verifiedAtIso?: string;
  verificationScope?: 'MANUAL_ADMIN' | 'AUTHORIZED_PROFESSIONAL' | 'LEGAL_COMPLIANCE';
  verificationDecisionReason?: string;
  machineSuggestions?: MachineExtractionSuggestion;
}

export interface DocumentRetentionMetadata {
  policyId: string;
  mandatoryRetentionDays: number;
  retainUntilIso: string;
  expiresAtIso?: string;
  legalHoldActive: boolean;
  legalHoldReason?: string;
  legalHoldPlacedByUid?: string;
  legalHoldPlacedAtIso?: string;
  archiveEligibleAtIso: string;
}

export interface DigitalDocumentRecord {
  documentId: string;
  category: DocumentCategory;
  subcategory?: string;
  documentType: string;
  labelFa: string;
  labelEn: string;
  relatedEntities: RelatedEntityReferences;
  ownerUid: string;
  authorizedParticipantUids: string[];
  confidentiality: DocumentConfidentialityLevel;
  lifecycleState: DocumentLifecycleState;
  currentVersionNumber: number;
  versions: DocumentVersionRecord[];
  retention: DocumentRetentionMetadata;
  createdAtIso: string;
  updatedAtIso: string;
  lifecycleHistory: Array<{
    fromState: DocumentLifecycleState | 'INITIAL';
    toState: DocumentLifecycleState;
    actorUid: string;
    reason: string;
    timestampIso: string;
  }>;
  verificationHistory: Array<{
    versionNumber: number;
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_REVISION';
    reviewerUid: string;
    verificationScope: 'MANUAL_ADMIN' | 'AUTHORIZED_PROFESSIONAL' | 'LEGAL_COMPLIANCE';
    reason: string;
    timestampIso: string;
  }>;
}

export interface DocumentSharingGrantRecord {
  grantId: string;
  documentId: string;
  versionNumber: number;
  grantedByUid: string;
  recipientUid: string;
  purpose: string;
  accessScope: 'VIEW_METADATA_ONLY' | 'PREVIEW_AND_DOWNLOAD';
  canDownload: boolean;
  canReshare: boolean;
  expiresAtIso: string;
  revoked: boolean;
  revokedByUid?: string;
  revokedAtIso?: string;
  createdAtIso: string;
}

export interface DocumentIntegrityCheckReport {
  documentId: string;
  versionNumber: number;
  checkedAtIso: string;
  intact: boolean;
  storageObjectExists: boolean;
  quarantined: boolean;
  checksumMatched: boolean;
  sizeMatched: boolean;
  duplicateContentDocumentIds: string[];
  failureReason?: string;
}

export interface VerifiedStorageObjectInfo {
  storageObjectKey: string;
  exists: boolean;
  quarantined: boolean;
  validatedMimeType: string;
  sizeBytes: number;
  sha256Hex: string;
  uploadedByUid: string;
}

export interface StorageObjectInspectorAdapter {
  inspectObject(storageObjectKey: string): Promise<VerifiedStorageObjectInfo | null>;
  generateSignedDownloadUrl(params: {
    storageObjectKey: string;
    filename: string;
    mimeType: string;
    expiresInSeconds: number;
  }): Promise<{
    downloadUrl: string;
    expiresAtIso: string;
    contentDisposition: string;
  }>;
}

export interface DocumentDomainEvent {
  eventId: string;
  eventType:
    | 'DOCUMENT_REGISTERED'
    | 'DOCUMENT_VERSION_CREATED'
    | 'DOCUMENT_VERIFIED'
    | 'DOCUMENT_REJECTED'
    | 'DOCUMENT_REVOKED'
    | 'DOCUMENT_EXPIRED'
    | 'DOCUMENT_ARCHIVED'
    | 'DOCUMENT_ACCESS_GRANTED'
    | 'DOCUMENT_ACCESS_REVOKED'
    | 'DOCUMENT_INTEGRITY_FAILURE';
  documentId: string;
  versionNumber: number;
  actorUid: string;
  occurredAtIso: string;
}

export interface DocumentObservabilityMetrics {
  registrationsCount: number;
  uploadValidationFailuresCount: number;
  processingFailuresCount: number;
  integrityFailuresCount: number;
  unauthorizedAccessAttemptsCount: number;
  signedUrlsIssuedCount: number;
  retentionJobsExecutedCount: number;
  lifecycleTransitionsCount: number;
}

export interface DocumentManagementDependencies {
  storageAdapter: StorageObjectInspectorAdapter;
  txRunner?: TransactionRunnerAdapter;
  tokenVerifier?: FirebaseIdTokenVerifier;
  adminStore?: AdminAuthorizationStoreAdapter;
  auditLogger?: AuditLoggerAdapter;
  rateLimiter?: RateLimiterAdapter;
  telemetry?: TelemetryAdapter;
  primaryAdminEmails?: string[];
  now?: () => Date;
}
