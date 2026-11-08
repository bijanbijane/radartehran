import crypto from 'crypto';
import { CoreApiError } from '../core';
import {
  ALLOWED_MIME_TYPES,
  canActorAccessDocument,
  resolveCategoryClassificationDefaults,
  validateDocumentLifecycleTransition,
  validateStorageObjectKeySafety,
} from './lifecycleAndAccessEngine';
import type {
  DigitalDocumentRecord,
  DocumentCategory,
  DocumentConfidentialityLevel,
  DocumentDomainEvent,
  DocumentIntegrityCheckReport,
  DocumentLifecycleState,
  DocumentManagementDependencies,
  DocumentObservabilityMetrics,
  DocumentSharingGrantRecord,
  DocumentVersionRecord,
  MachineExtractionSuggestion,
  RelatedEntityReferences,
} from './types';

export function createDocumentManagementService(deps: DocumentManagementDependencies) {
  const nowFn = deps.now ?? (() => new Date());

  const documentStore = new Map<string, DigitalDocumentRecord>();
  const sharingGrants = new Map<string, DocumentSharingGrantRecord>();
  const domainEvents: DocumentDomainEvent[] = [];
  const consumedEventIds = new Set<string>();
  const retentionJobRuns = new Map<string, { jobId: string; expiredCount: number; archivedCount: number }>();

  const metrics: DocumentObservabilityMetrics = {
    registrationsCount: 0,
    uploadValidationFailuresCount: 0,
    processingFailuresCount: 0,
    integrityFailuresCount: 0,
    unauthorizedAccessAttemptsCount: 0,
    signedUrlsIssuedCount: 0,
    retentionJobsExecutedCount: 0,
    lifecycleTransitionsCount: 0,
  };

  function emitDomainEvent(
    eventType: DocumentDomainEvent['eventType'],
    documentId: string,
    versionNumber: number,
    actorUid: string,
  ): DocumentDomainEvent {
    const ev: DocumentDomainEvent = {
      eventId: `doc_ev_${crypto.randomBytes(6).toString('hex')}`,
      eventType,
      documentId,
      versionNumber,
      actorUid,
      occurredAtIso: nowFn().toISOString(),
    };
    domainEvents.push(ev);
    return ev;
  }

  async function registerDocument(params: {
    actorUid: string;
    isAdmin?: boolean;
    documentId?: string;
    category: DocumentCategory;
    subcategory?: string;
    documentType: string;
    storageObjectKey: string;
    originalFilename: string;
    relatedEntities?: RelatedEntityReferences;
    authorizedParticipantUids?: string[];
    requestedConfidentiality?: DocumentConfidentialityLevel;
    expiresAtIso?: string;
  }): Promise<DigitalDocumentRecord> {
    const keySafety = validateStorageObjectKeySafety(params.storageObjectKey);
    if (!keySafety.valid) {
      metrics.uploadValidationFailuresCount += 1;
      throw new CoreApiError('VALIDATION_FAILED', 400, keySafety.reason ?? 'Unsafe storageObjectKey.');
    }

    const storageObj = await deps.storageAdapter.inspectObject(params.storageObjectKey);
    if (!storageObj || !storageObj.exists) {
      metrics.uploadValidationFailuresCount += 1;
      throw new CoreApiError('NOT_FOUND', 404, `Referenced storage object '${params.storageObjectKey}' does not exist.`);
    }

    if (storageObj.uploadedByUid !== params.actorUid && !params.isAdmin) {
      metrics.unauthorizedAccessAttemptsCount += 1;
      throw new CoreApiError('FORBIDDEN', 403, 'Storage object does not belong to the uploading actor.');
    }

    if (!ALLOWED_MIME_TYPES.has(storageObj.validatedMimeType)) {
      metrics.uploadValidationFailuresCount += 1;
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Validated MIME type '${storageObj.validatedMimeType}' is not permitted.`,
      );
    }

    const defaults = resolveCategoryClassificationDefaults(params.category);
    const nowIso = nowFn().toISOString();
    const nowMs = Date.parse(nowIso);

    // Ordinary users cannot downgrade protected confidentiality on restricted categories
    let confidentiality = defaults.defaultConfidentiality;
    if (params.requestedConfidentiality) {
      if (
        (defaults.defaultConfidentiality === 'RESTRICTED_LEGAL_IDENTITY' ||
          defaults.defaultConfidentiality === 'ADMIN_ONLY') &&
        !params.isAdmin
      ) {
        confidentiality = defaults.defaultConfidentiality;
      } else {
        confidentiality = params.requestedConfidentiality;
      }
    }

    // A document NEVER becomes VERIFIED merely because it was uploaded
    const initialLifecycle: DocumentLifecycleState = storageObj.quarantined
      ? 'QUARANTINED'
      : defaults.requiresExplicitVerification
        ? 'PENDING_REVIEW'
        : 'ACTIVE';

    const documentId = params.documentId ?? `doc_${crypto.randomBytes(6).toString('hex')}`;
    const version1: DocumentVersionRecord = {
      versionId: `${documentId}_v1`,
      versionNumber: 1,
      storageObjectKey: storageObj.storageObjectKey,
      originalFilename: params.originalFilename.trim().slice(0, 180),
      validatedMimeType: storageObj.validatedMimeType,
      validatedSizeBytes: storageObj.sizeBytes,
      contentSha256: storageObj.sha256Hex,
      uploadedByUid: params.actorUid,
      uploadedAtIso: nowIso,
      status: storageObj.quarantined ? 'QUARANTINED' : 'CURRENT',
      verificationStatus: defaults.requiresExplicitVerification ? 'PENDING_REVIEW' : 'UNVERIFIED',
    };

    const retainUntilIso = new Date(nowMs + defaults.mandatoryRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const archiveEligibleAtIso = new Date(nowMs + 365 * 24 * 60 * 60 * 1000).toISOString();

    const record: DigitalDocumentRecord = {
      documentId,
      category: params.category,
      subcategory: params.subcategory,
      documentType: params.documentType.trim(),
      labelFa: defaults.labelFa,
      labelEn: defaults.labelEn,
      relatedEntities: { ...(params.relatedEntities ?? {}) },
      ownerUid: params.actorUid,
      authorizedParticipantUids: Array.from(new Set(params.authorizedParticipantUids ?? [])),
      confidentiality,
      lifecycleState: initialLifecycle,
      currentVersionNumber: 1,
      versions: [version1],
      retention: {
        policyId: `ret_${params.category.toLowerCase()}`,
        mandatoryRetentionDays: defaults.mandatoryRetentionDays,
        retainUntilIso,
        expiresAtIso: params.expiresAtIso,
        legalHoldActive: false,
        archiveEligibleAtIso,
      },
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      lifecycleHistory: [
        {
          fromState: 'INITIAL',
          toState: initialLifecycle,
          actorUid: params.actorUid,
          reason: 'Initial document registration',
          timestampIso: nowIso,
        },
      ],
      verificationHistory: [],
    };

    documentStore.set(documentId, record);
    metrics.registrationsCount += 1;
    emitDomainEvent('DOCUMENT_REGISTERED', documentId, 1, params.actorUid);
    return structuredClone(record);
  }

  async function createDocumentVersion(params: {
    actorUid: string;
    isAdmin?: boolean;
    documentId: string;
    storageObjectKey: string;
    originalFilename: string;
    replacementReason: string;
  }): Promise<DigitalDocumentRecord> {
    const doc = documentStore.get(params.documentId);
    if (!doc) {
      throw new CoreApiError('NOT_FOUND', 404, `Document '${params.documentId}' not found.`);
    }
    if (doc.ownerUid !== params.actorUid && !params.isAdmin) {
      metrics.unauthorizedAccessAttemptsCount += 1;
      throw new CoreApiError('FORBIDDEN', 403, 'Only document owner or admin can upload a replacement version.');
    }
    if (params.replacementReason.trim().length < 3) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'replacementReason is required.');
    }

    const keySafety = validateStorageObjectKeySafety(params.storageObjectKey);
    if (!keySafety.valid) {
      metrics.uploadValidationFailuresCount += 1;
      throw new CoreApiError('VALIDATION_FAILED', 400, keySafety.reason ?? 'Unsafe storageObjectKey.');
    }

    const storageObj = await deps.storageAdapter.inspectObject(params.storageObjectKey);
    if (!storageObj || !storageObj.exists) {
      metrics.uploadValidationFailuresCount += 1;
      throw new CoreApiError('NOT_FOUND', 404, `Referenced storage object '${params.storageObjectKey}' does not exist.`);
    }

    const nowIso = nowFn().toISOString();
    const nextVerNum = doc.currentVersionNumber + 1;
    const nextVersionId = `${doc.documentId}_v${nextVerNum}`;

    // Mark previous current version as SUPERSEDED without deleting or overwriting it
    const prevVersion = doc.versions.find((v) => v.versionNumber === doc.currentVersionNumber);
    if (prevVersion) {
      prevVersion.status = 'SUPERSEDED';
      prevVersion.supersededByVersionId = nextVersionId;
    }

    // Replacing a verified document MUST NOT silently transfer verification to the new version!
    const newVersion: DocumentVersionRecord = {
      versionId: nextVersionId,
      versionNumber: nextVerNum,
      storageObjectKey: storageObj.storageObjectKey,
      originalFilename: params.originalFilename.trim(),
      validatedMimeType: storageObj.validatedMimeType,
      validatedSizeBytes: storageObj.sizeBytes,
      contentSha256: storageObj.sha256Hex,
      uploadedByUid: params.actorUid,
      uploadedAtIso: nowIso,
      replacementReason: params.replacementReason.trim(),
      previousVersionId: prevVersion?.versionId,
      status: storageObj.quarantined ? 'QUARANTINED' : 'CURRENT',
      verificationStatus: 'PENDING_REVIEW',
    };

    doc.versions.push(newVersion);
    doc.currentVersionNumber = nextVerNum;
    const prevLifecycle = doc.lifecycleState;
    doc.lifecycleState = storageObj.quarantined ? 'QUARANTINED' : 'PENDING_REVIEW';
    doc.updatedAtIso = nowIso;
    doc.lifecycleHistory.push({
      fromState: prevLifecycle,
      toState: doc.lifecycleState,
      actorUid: params.actorUid,
      reason: `Uploaded v${nextVerNum}: ${params.replacementReason.trim()}`,
      timestampIso: nowIso,
    });

    documentStore.set(doc.documentId, doc);
    emitDomainEvent('DOCUMENT_VERSION_CREATED', doc.documentId, nextVerNum, params.actorUid);
    return structuredClone(doc);
  }

  function verifyDocumentVersion(params: {
    reviewerUid: string;
    isAdminOrAuthorizedVerifier: boolean;
    documentId: string;
    versionNumber: number;
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_REVISION';
    verificationScope: 'MANUAL_ADMIN' | 'AUTHORIZED_PROFESSIONAL' | 'LEGAL_COMPLIANCE';
    reason: string;
  }): DigitalDocumentRecord {
    if (!params.isAdminOrAuthorizedVerifier) {
      metrics.unauthorizedAccessAttemptsCount += 1;
      throw new CoreApiError('FORBIDDEN', 403, 'Authorized verifier or admin privilege is required.');
    }
    const doc = documentStore.get(params.documentId);
    if (!doc) {
      throw new CoreApiError('NOT_FOUND', 404, `Document '${params.documentId}' not found.`);
    }
    const targetVer = doc.versions.find((v) => v.versionNumber === params.versionNumber);
    if (!targetVer) {
      throw new CoreApiError('NOT_FOUND', 404, `Document version v${params.versionNumber} not found.`);
    }
    if (targetVer.status === 'QUARANTINED') {
      throw new CoreApiError('CONFLICT', 409, 'Quarantined document version cannot be approved.');
    }

    const nowIso = nowFn().toISOString();
    targetVer.verifiedByUid = params.reviewerUid;
    targetVer.verifiedAtIso = nowIso;
    targetVer.verificationScope = params.verificationScope;
    targetVer.verificationDecisionReason = params.reason;

    if (params.decision === 'APPROVE') {
      targetVer.verificationStatus = 'VERIFIED';
      if (params.versionNumber === doc.currentVersionNumber) {
        const prev = doc.lifecycleState;
        doc.lifecycleState = 'VERIFIED';
        doc.lifecycleHistory.push({
          fromState: prev,
          toState: 'VERIFIED',
          actorUid: params.reviewerUid,
          reason: params.reason,
          timestampIso: nowIso,
        });
      }
      emitDomainEvent('DOCUMENT_VERIFIED', doc.documentId, params.versionNumber, params.reviewerUid);
    } else if (params.decision === 'REJECT') {
      targetVer.verificationStatus = 'REJECTED';
      if (params.versionNumber === doc.currentVersionNumber) {
        const prev = doc.lifecycleState;
        doc.lifecycleState = 'REJECTED';
        doc.lifecycleHistory.push({
          fromState: prev,
          toState: 'REJECTED',
          actorUid: params.reviewerUid,
          reason: params.reason,
          timestampIso: nowIso,
        });
      }
      emitDomainEvent('DOCUMENT_REJECTED', doc.documentId, params.versionNumber, params.reviewerUid);
    } else {
      targetVer.verificationStatus = 'REVISION_REQUESTED';
    }

    doc.verificationHistory.push({
      versionNumber: params.versionNumber,
      decision: params.decision,
      reviewerUid: params.reviewerUid,
      verificationScope: params.verificationScope,
      reason: params.reason,
      timestampIso: nowIso,
    });
    doc.updatedAtIso = nowIso;
    documentStore.set(doc.documentId, doc);
    return structuredClone(doc);
  }

  function transitionDocumentLifecycle(params: {
    actorUid: string;
    isAdmin: boolean;
    documentId: string;
    toState: DocumentLifecycleState;
    reason: string;
  }): DigitalDocumentRecord {
    const doc = documentStore.get(params.documentId);
    if (!doc) {
      throw new CoreApiError('NOT_FOUND', 404, `Document '${params.documentId}' not found.`);
    }
    const check = validateDocumentLifecycleTransition({
      fromState: doc.lifecycleState,
      toState: params.toState,
      isAdmin: params.isAdmin,
      viaExplicitVerificationReview: false,
    });
    if (!check.allowed) {
      throw new CoreApiError('FORBIDDEN', 403, check.reason ?? 'Lifecycle transition not permitted.');
    }

    const nowIso = nowFn().toISOString();
    const prev = doc.lifecycleState;
    doc.lifecycleState = params.toState;
    doc.updatedAtIso = nowIso;
    doc.lifecycleHistory.push({
      fromState: prev,
      toState: params.toState,
      actorUid: params.actorUid,
      reason: params.reason,
      timestampIso: nowIso,
    });
    documentStore.set(doc.documentId, doc);
    metrics.lifecycleTransitionsCount += 1;
    if (params.toState === 'REVOKED') {
      emitDomainEvent('DOCUMENT_REVOKED', doc.documentId, doc.currentVersionNumber, params.actorUid);
    }
    return structuredClone(doc);
  }

  function getDocumentMetadata(params: {
    documentId: string;
    actorUid?: string;
    isAdmin?: boolean;
    isPublicListingEndpoint?: boolean;
  }): DigitalDocumentRecord {
    const doc = documentStore.get(params.documentId);
    if (!doc) {
      throw new CoreApiError('NOT_FOUND', 404, `Document '${params.documentId}' not found.`);
    }
    const access = canActorAccessDocument({
      doc,
      actorUid: params.actorUid,
      isAdmin: Boolean(params.isAdmin),
      requireDownloadPermission: false,
      isPublicListingEndpoint: params.isPublicListingEndpoint,
      activeGrants: Array.from(sharingGrants.values()),
      nowIso: nowFn().toISOString(),
    });
    if (!access.allowed) {
      metrics.unauthorizedAccessAttemptsCount += 1;
      throw new CoreApiError('FORBIDDEN', 403, access.reason ?? 'Access denied.');
    }
    return structuredClone(doc);
  }

  async function generateSignedDownloadUrl(params: {
    documentId: string;
    versionNumber?: number;
    actorUid?: string;
    isAdmin?: boolean;
    expiresInSeconds?: number;
  }) {
    const doc = documentStore.get(params.documentId);
    if (!doc) {
      throw new CoreApiError('NOT_FOUND', 404, `Document '${params.documentId}' not found.`);
    }
    if (doc.lifecycleState === 'QUARANTINED' || doc.lifecycleState === 'REVOKED') {
      throw new CoreApiError('FORBIDDEN', 403, `Document in state '${doc.lifecycleState}' cannot be downloaded.`);
    }

    const verNum = params.versionNumber ?? doc.currentVersionNumber;
    const access = canActorAccessDocument({
      doc,
      versionNumber: verNum,
      actorUid: params.actorUid,
      isAdmin: Boolean(params.isAdmin),
      requireDownloadPermission: true,
      activeGrants: Array.from(sharingGrants.values()),
      nowIso: nowFn().toISOString(),
    });
    if (!access.allowed) {
      metrics.unauthorizedAccessAttemptsCount += 1;
      throw new CoreApiError('FORBIDDEN', 403, access.reason ?? 'Download access denied.');
    }

    const ver = doc.versions.find((v) => v.versionNumber === verNum);
    if (!ver || ver.status === 'QUARANTINED' || ver.status === 'REVOKED') {
      throw new CoreApiError('NOT_FOUND', 404, `Requested document version v${verNum} is unavailable.`);
    }

    // Bound TTL between 30s and 900s (15 min max)
    const boundedTtl = Math.max(30, Math.min(900, params.expiresInSeconds ?? 300));
    const signed = await deps.storageAdapter.generateSignedDownloadUrl({
      storageObjectKey: ver.storageObjectKey,
      filename: ver.originalFilename,
      mimeType: ver.validatedMimeType,
      expiresInSeconds: boundedTtl,
    });
    metrics.signedUrlsIssuedCount += 1;
    return {
      documentId: doc.documentId,
      versionNumber: ver.versionNumber,
      validatedMimeType: ver.validatedMimeType,
      ...signed,
    };
  }

  function createSharingGrant(params: {
    actorUid: string;
    isAdmin?: boolean;
    documentId: string;
    versionNumber?: number;
    recipientUid: string;
    purpose: string;
    accessScope?: DocumentSharingGrantRecord['accessScope'];
    canDownload?: boolean;
    canReshare?: boolean;
    expiresInHours?: number;
  }): DocumentSharingGrantRecord {
    const doc = documentStore.get(params.documentId);
    if (!doc) {
      throw new CoreApiError('NOT_FOUND', 404, `Document '${params.documentId}' not found.`);
    }

    const nowIso = nowFn().toISOString();
    const isOwnerOrAdmin = doc.ownerUid === params.actorUid || Boolean(params.isAdmin);
    if (!isOwnerOrAdmin) {
      // Check if actor has an active grant that explicitly permits onward resharing
      const callerGrant = Array.from(sharingGrants.values()).find(
        (g) =>
          g.documentId === doc.documentId &&
          g.recipientUid === params.actorUid &&
          !g.revoked &&
          Date.parse(g.expiresAtIso) > Date.parse(nowIso) &&
          g.canReshare,
      );
      if (!callerGrant) {
        metrics.unauthorizedAccessAttemptsCount += 1;
        throw new CoreApiError('FORBIDDEN', 403, 'Actor is not authorized to share this document onward.');
      }
    }

    const hours = Math.max(1, Math.min(720, params.expiresInHours ?? 48));
    const expiresAtIso = new Date(Date.parse(nowIso) + hours * 60 * 60 * 1000).toISOString();
    const verNum = params.versionNumber ?? doc.currentVersionNumber;

    const grant: DocumentSharingGrantRecord = {
      grantId: `shg_${crypto.randomBytes(6).toString('hex')}`,
      documentId: doc.documentId,
      versionNumber: verNum,
      grantedByUid: params.actorUid,
      recipientUid: params.recipientUid,
      purpose: params.purpose.trim(),
      accessScope: params.accessScope ?? 'PREVIEW_AND_DOWNLOAD',
      canDownload: params.canDownload ?? true,
      canReshare: Boolean(params.canReshare && isOwnerOrAdmin),
      expiresAtIso,
      revoked: false,
      createdAtIso: nowIso,
    };

    sharingGrants.set(grant.grantId, grant);
    emitDomainEvent('DOCUMENT_ACCESS_GRANTED', doc.documentId, verNum, params.actorUid);
    return structuredClone(grant);
  }

  function revokeSharingGrant(params: {
    actorUid: string;
    isAdmin?: boolean;
    grantId: string;
  }): DocumentSharingGrantRecord {
    const grant = sharingGrants.get(params.grantId);
    if (!grant) {
      throw new CoreApiError('NOT_FOUND', 404, `Sharing grant '${params.grantId}' not found.`);
    }
    const doc = documentStore.get(grant.documentId);
    if (grant.grantedByUid !== params.actorUid && doc?.ownerUid !== params.actorUid && !params.isAdmin) {
      metrics.unauthorizedAccessAttemptsCount += 1;
      throw new CoreApiError('FORBIDDEN', 403, 'Not authorized to revoke this sharing grant.');
    }

    grant.revoked = true;
    grant.revokedByUid = params.actorUid;
    grant.revokedAtIso = nowFn().toISOString();
    sharingGrants.set(grant.grantId, grant);
    emitDomainEvent('DOCUMENT_ACCESS_REVOKED', grant.documentId, grant.versionNumber, params.actorUid);
    return structuredClone(grant);
  }

  function placeOrReleaseLegalHold(params: {
    actorUid: string;
    isAdmin: boolean;
    documentId: string;
    legalHoldActive: boolean;
    reason: string;
  }): DigitalDocumentRecord {
    if (!params.isAdmin) {
      throw new CoreApiError('FORBIDDEN', 403, 'Admin authorization required to manage legal holds.');
    }
    const doc = documentStore.get(params.documentId);
    if (!doc) {
      throw new CoreApiError('NOT_FOUND', 404, `Document '${params.documentId}' not found.`);
    }
    doc.retention.legalHoldActive = params.legalHoldActive;
    doc.retention.legalHoldReason = params.reason;
    doc.retention.legalHoldPlacedByUid = params.actorUid;
    doc.retention.legalHoldPlacedAtIso = nowFn().toISOString();
    documentStore.set(doc.documentId, doc);
    return structuredClone(doc);
  }

  function requestDocumentDeletion(params: {
    actorUid: string;
    isAdmin: boolean;
    documentId: string;
    reason: string;
  }): DigitalDocumentRecord {
    const doc = documentStore.get(params.documentId);
    if (!doc) {
      throw new CoreApiError('NOT_FOUND', 404, `Document '${params.documentId}' not found.`);
    }
    if (doc.ownerUid !== params.actorUid && !params.isAdmin) {
      throw new CoreApiError('FORBIDDEN', 403, 'Not authorized to request deletion of this document.');
    }
    if (doc.retention.legalHoldActive) {
      throw new CoreApiError('CONFLICT', 409, 'Document is under an active legal hold and cannot be scheduled for deletion.');
    }
    const nowMs = Date.parse(nowFn().toISOString());
    if (Date.parse(doc.retention.retainUntilIso) > nowMs) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `Mandatory retention period applies until ${doc.retention.retainUntilIso}; deletion is prohibited.`,
      );
    }

    const prev = doc.lifecycleState;
    doc.lifecycleState = 'DELETION_PENDING';
    doc.updatedAtIso = nowFn().toISOString();
    doc.lifecycleHistory.push({
      fromState: prev,
      toState: 'DELETION_PENDING',
      actorUid: params.actorUid,
      reason: params.reason,
      timestampIso: doc.updatedAtIso,
    });
    documentStore.set(doc.documentId, doc);
    return structuredClone(doc);
  }

  function runRetentionAndExpirationJob(params: {
    actorUid: string;
    idempotencyKey: string;
  }): { jobId: string; expiredCount: number; archivedCount: number } {
    if (retentionJobRuns.has(params.idempotencyKey)) {
      return structuredClone(retentionJobRuns.get(params.idempotencyKey)!);
    }

    const nowIso = nowFn().toISOString();
    const nowMs = Date.parse(nowIso);
    let expiredCount = 0;
    let archivedCount = 0;

    for (const doc of documentStore.values()) {
      if (
        doc.retention.expiresAtIso &&
        Date.parse(doc.retention.expiresAtIso) <= nowMs &&
        (doc.lifecycleState === 'ACTIVE' || doc.lifecycleState === 'VERIFIED')
      ) {
        const prev = doc.lifecycleState;
        doc.lifecycleState = 'EXPIRED';
        doc.updatedAtIso = nowIso;
        doc.lifecycleHistory.push({
          fromState: prev,
          toState: 'EXPIRED',
          actorUid: params.actorUid,
          reason: 'Automated expiration policy check',
          timestampIso: nowIso,
        });
        expiredCount++;
        emitDomainEvent('DOCUMENT_EXPIRED', doc.documentId, doc.currentVersionNumber, params.actorUid);
      } else if (
        doc.lifecycleState === 'SUPERSEDED' &&
        Date.parse(doc.retention.archiveEligibleAtIso) <= nowMs
      ) {
        doc.lifecycleState = 'ARCHIVED';
        doc.updatedAtIso = nowIso;
        archivedCount++;
        emitDomainEvent('DOCUMENT_ARCHIVED', doc.documentId, doc.currentVersionNumber, params.actorUid);
      }
      documentStore.set(doc.documentId, doc);
    }

    metrics.retentionJobsExecutedCount += 1;
    const res = {
      jobId: `ret_job_${crypto.randomBytes(5).toString('hex')}`,
      expiredCount,
      archivedCount,
    };
    retentionJobRuns.set(params.idempotencyKey, res);
    return structuredClone(res);
  }

  async function verifyDocumentIntegrity(params: {
    documentId: string;
    versionNumber?: number;
  }): Promise<DocumentIntegrityCheckReport> {
    const doc = documentStore.get(params.documentId);
    if (!doc) {
      throw new CoreApiError('NOT_FOUND', 404, `Document '${params.documentId}' not found.`);
    }
    const verNum = params.versionNumber ?? doc.currentVersionNumber;
    const ver = doc.versions.find((v) => v.versionNumber === verNum);
    if (!ver) {
      throw new CoreApiError('NOT_FOUND', 404, `Version v${verNum} not found.`);
    }

    const storageObj = await deps.storageAdapter.inspectObject(ver.storageObjectKey);
    const nowIso = nowFn().toISOString();

    const duplicateContentDocumentIds: string[] = [];
    for (const other of documentStore.values()) {
      if (other.documentId === doc.documentId) continue;
      if (other.versions.some((v) => v.contentSha256 === ver.contentSha256)) {
        duplicateContentDocumentIds.push(other.documentId);
      }
    }

    if (!storageObj || !storageObj.exists) {
      metrics.integrityFailuresCount += 1;
      emitDomainEvent('DOCUMENT_INTEGRITY_FAILURE', doc.documentId, verNum, 'system_integrity_checker');
      return {
        documentId: doc.documentId,
        versionNumber: verNum,
        checkedAtIso: nowIso,
        intact: false,
        storageObjectExists: false,
        quarantined: false,
        checksumMatched: false,
        sizeMatched: false,
        duplicateContentDocumentIds,
        failureReason: 'Storage object is missing from object storage.',
      };
    }

    const checksumMatched = storageObj.sha256Hex === ver.contentSha256;
    const sizeMatched = storageObj.sizeBytes === ver.validatedSizeBytes;
    const intact = checksumMatched && sizeMatched && !storageObj.quarantined;

    if (!intact) {
      metrics.integrityFailuresCount += 1;
      emitDomainEvent('DOCUMENT_INTEGRITY_FAILURE', doc.documentId, verNum, 'system_integrity_checker');
    }

    return {
      documentId: doc.documentId,
      versionNumber: verNum,
      checkedAtIso: nowIso,
      intact,
      storageObjectExists: true,
      quarantined: storageObj.quarantined,
      checksumMatched,
      sizeMatched,
      duplicateContentDocumentIds,
      failureReason: !intact ? 'Storage checksum, size mismatch, or quarantine flag detected.' : undefined,
    };
  }

  function attachProcessingSuggestions(params: {
    documentId: string;
    versionNumber: number;
    ocrTextSummary?: string;
    suggestedCategory?: DocumentCategory;
    malwareScanClean: boolean;
  }): DigitalDocumentRecord {
    const doc = documentStore.get(params.documentId);
    if (!doc) {
      throw new CoreApiError('NOT_FOUND', 404, `Document '${params.documentId}' not found.`);
    }
    const ver = doc.versions.find((v) => v.versionNumber === params.versionNumber);
    if (!ver) {
      throw new CoreApiError('NOT_FOUND', 404, `Version v${params.versionNumber} not found.`);
    }

    const suggestion: MachineExtractionSuggestion = {
      extractedAtIso: nowFn().toISOString(),
      ocrTextSummary: params.ocrTextSummary,
      suggestedCategory: params.suggestedCategory,
      malwareScanClean: params.malwareScanClean,
      unverifiedMachineSuggestion: true,
    };
    ver.machineSuggestions = suggestion;

    if (!params.malwareScanClean) {
      ver.status = 'QUARANTINED';
      doc.lifecycleState = 'QUARANTINED';
    }
    // Machine extraction NEVER automatically sets verificationStatus to VERIFIED
    documentStore.set(doc.documentId, doc);
    return structuredClone(doc);
  }

  function searchAccessibleDocuments(params: {
    actorUid?: string;
    isAdmin?: boolean;
    category?: DocumentCategory;
    propertyId?: string;
    transactionId?: string;
    tenancyId?: string;
    brokerageAgreementId?: string;
    lifecycleState?: DocumentLifecycleState;
  }): DigitalDocumentRecord[] {
    const nowIso = nowFn().toISOString();
    const activeGrants = Array.from(sharingGrants.values());

    return Array.from(documentStore.values())
      .filter((doc) => {
        if (params.category && doc.category !== params.category) return false;
        if (params.propertyId && doc.relatedEntities.propertyId !== params.propertyId) return false;
        if (params.transactionId && doc.relatedEntities.transactionId !== params.transactionId) return false;
        if (params.tenancyId && doc.relatedEntities.tenancyId !== params.tenancyId) return false;
        if (
          params.brokerageAgreementId &&
          doc.relatedEntities.brokerageAgreementId !== params.brokerageAgreementId
        ) {
          return false;
        }
        if (params.lifecycleState && doc.lifecycleState !== params.lifecycleState) return false;

        const access = canActorAccessDocument({
          doc,
          actorUid: params.actorUid,
          isAdmin: Boolean(params.isAdmin),
          requireDownloadPermission: false,
          activeGrants,
          nowIso,
        });
        return access.allowed;
      })
      .map((d) => structuredClone(d));
  }

  function consumeDomainEventIdempotently(
    eventId: string,
    handler: (ev: DocumentDomainEvent) => void,
  ): { processed: boolean } {
    if (consumedEventIds.has(eventId)) {
      return { processed: false };
    }
    const ev = domainEvents.find((e) => e.eventId === eventId);
    if (!ev) {
      throw new CoreApiError('NOT_FOUND', 404, `Event '${eventId}' not found.`);
    }
    handler(structuredClone(ev));
    consumedEventIds.add(eventId);
    return { processed: true };
  }

  return {
    registerDocument,
    createDocumentVersion,
    verifyDocumentVersion,
    transitionDocumentLifecycle,
    getDocumentMetadata,
    generateSignedDownloadUrl,
    createSharingGrant,
    revokeSharingGrant,
    placeOrReleaseLegalHold,
    requestDocumentDeletion,
    runRetentionAndExpirationJob,
    verifyDocumentIntegrity,
    attachProcessingSuggestions,
    searchAccessibleDocuments,
    listDomainEvents: () => structuredClone(domainEvents),
    consumeDomainEventIdempotently,
    getObservabilityMetrics: (): DocumentObservabilityMetrics => structuredClone(metrics),
  };
}

export type DocumentManagementService = ReturnType<typeof createDocumentManagementService>;
