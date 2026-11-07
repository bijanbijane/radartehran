/**
 * @fileoverview Employee 6 — Media Domain Service (`server/modules/media/mediaDomainService.ts`).
 *
 * Implements:
 * 1. Media upload authorization (`authorizeUpload`)
 * 2. Media object registration (`registerUploadedObject`)
 * 3. File ownership and association with Bargains & Sponsors (`attachMediaToTarget`)
 * 4. File metadata management (`getPublicMetadata`, `listOwnerMedia`)
 * 5. Secure retrieval authorization (`retrieveAuthorizedMediaBytes`)
 * 6. Retryable & idempotent object deletion (`deleteMediaObject`)
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { validateCityNeighborhoodScope } from '../../../src/utils/marketDataIntegrity';
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  buildListingObjectKey,
} from '../../../src/utils/objectStorage';
import {
  MAX_BYTES_PER_OWNER,
  MAX_OBJECTS_PER_OWNER,
  validateMediaMagicBytesAndExtension,
} from '../../../src/utils/serverObjectStorageHelpers';
import {
  assertAuthenticatedMediaActor,
  type MediaMetadataPersistenceStore,
  toPublicMediaDescriptor,
} from './metadataStore';
import { assertScopedInternalObjectKey, computeSha256Hex } from './storageProvider';
import {
  type AttachMediaToTargetRequest,
  type AttachMediaToTargetResult,
  type ByteObjectGetResult,
  type MediaActorContext,
  type MediaByteStorageProvider,
  type MediaDeleteOperationResult,
  MediaDomainError,
  type MediaMetadataRecord,
  type MediaTargetEntityVerifier,
  type MediaUploadAuthorizationRequest,
  type MediaUploadGrant,
  type PublicMediaObjectDescriptor,
} from './types';

const GRANT_TTL_MS = 15 * 60 * 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export class MediaDomainService {
  private readonly metadataStore: MediaMetadataPersistenceStore;
  private readonly byteStorage: MediaByteStorageProvider;

  constructor(
    metadataStore: MediaMetadataPersistenceStore,
    byteStorage: MediaByteStorageProvider
  ) {
    this.metadataStore = metadataStore;
    this.byteStorage = byteStorage;
  }

  public async authorizeUpload(
    actorInput: MediaActorContext | null | undefined,
    request: MediaUploadAuthorizationRequest,
    nowMs = Date.now()
  ): Promise<MediaUploadGrant> {
    const actor = assertAuthenticatedMediaActor(actorInput);
    const health = this.byteStorage.getHealthStatus();
    if (!health.isConfigured || health.durabilityTier === 'UNCONFIGURED_DISABLED') {
      throw new MediaDomainError(
        'PRODUCTION_DURABLE_STORAGE_NOT_CONFIGURED',
        health.reason,
        503,
        false
      );
    }

    const idempotencyKey = String(request.idempotencyKey || '').trim();
    if (idempotencyKey.length < 4 || idempotencyKey.length > 128) {
      throw new MediaDomainError('INVALID_MEDIA_PAYLOAD', 'Valid idempotencyKey (4..128 chars) is required.');
    }

    const existingGrant = await this.metadataStore.findUploadGrantByIdempotencyKey(actor.uid, idempotencyKey);
    if (existingGrant && Date.parse(existingGrant.expiresAtIso) > nowMs) {
      return existingGrant;
    }

    const scopeCheck = validateCityNeighborhoodScope(request.cityId, request.hoodId);
    if (!scopeCheck.valid) {
      throw new MediaDomainError(
        'INVALID_MEDIA_PAYLOAD',
        `Invalid city/neighborhood scope (${request.cityId}, ${request.hoodId}): ${scopeCheck.reason}`
      );
    }

    const cleanMime = String(request.mimeType || '').trim().toLowerCase();
    const allowedMimes = request.mediaType === 'video' ? ALLOWED_VIDEO_MIMES : ALLOWED_IMAGE_MIMES;
    if (!allowedMimes.includes(cleanMime)) {
      throw new MediaDomainError('INVALID_MEDIA_PAYLOAD', `Unsupported MIME type '${cleanMime}' for ${request.mediaType}.`);
    }

    const maxBytes = request.mediaType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (!Number.isSafeInteger(request.declaredSizeBytes) || request.declaredSizeBytes <= 0 || request.declaredSizeBytes > maxBytes) {
      throw new MediaDomainError('INVALID_MEDIA_PAYLOAD', `Declared file size ${request.declaredSizeBytes} is outside allowed bounds.`, 413);
    }

    const sha256 = String(request.expectedSha256 || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new MediaDomainError('INVALID_MEDIA_PAYLOAD', 'expectedSha256 must be a 64-character hex SHA-256 digest.');
    }

    const ownerRecords = (await this.metadataStore.listOwnerMetadataRecords(actor.uid)).filter(
      (r) => r.state === 'ACTIVE' || r.state === 'PENDING_DELETE'
    );
    const ownerUsedBytes = ownerRecords.reduce((acc, r) => acc + r.sizeBytes, 0);
    if (
      ownerRecords.length >= MAX_OBJECTS_PER_OWNER ||
      ownerUsedBytes + request.declaredSizeBytes > MAX_BYTES_PER_OWNER
    ) {
      throw new MediaDomainError('STORAGE_QUOTA_EXCEEDED', 'Owner media object count or byte quota exceeded.', 507);
    }

    const objectId = `obj-${nowMs}-${crypto.randomBytes(4).toString('hex')}`;
    const grant: MediaUploadGrant = {
      grantId: `grant_${objectId}`,
      idempotencyKey,
      objectId,
      ownerUid: actor.uid,
      cityId: request.cityId,
      hoodId: request.hoodId,
      mediaType: request.mediaType,
      mimeType: cleanMime,
      declaredSizeBytes: request.declaredSizeBytes,
      expectedSha256: sha256,
      visibilityPolicy: request.visibilityPolicy ?? 'PUBLIC_WHEN_ATTACHED',
      issuedAtIso: new Date(nowMs).toISOString(),
      expiresAtIso: new Date(nowMs + GRANT_TTL_MS).toISOString(),
      consumed: false,
    };

    return this.metadataStore.saveUploadGrant(grant);
  }

  public async registerUploadedObject(
    actorInput: MediaActorContext | null | undefined,
    grantId: string,
    payloadBytes: Buffer,
    nowMs = Date.now()
  ): Promise<{ descriptor: PublicMediaObjectDescriptor; idempotentReplay: boolean }> {
    const actor = assertAuthenticatedMediaActor(actorInput);
    const grant = await this.metadataStore.getUploadGrant(grantId);
    if (!grant) {
      throw new MediaDomainError('UPLOAD_GRANT_EXPIRED_OR_INVALID', 'Upload grant does not exist.', 404);
    }
    if (grant.ownerUid !== actor.uid) {
      throw new MediaDomainError('FORBIDDEN_NOT_OWNER', 'Actor does not own this upload grant.', 403);
    }

    const existingMeta = await this.metadataStore.findMetadataByIdempotencyKey(actor.uid, grant.idempotencyKey);
    if (existingMeta && existingMeta.state === 'ACTIVE') {
      return { descriptor: toPublicMediaDescriptor(existingMeta), idempotentReplay: true };
    }

    if (Date.parse(grant.expiresAtIso) < nowMs) {
      throw new MediaDomainError('UPLOAD_GRANT_EXPIRED_OR_INVALID', 'Upload grant has expired.', 410);
    }
    if (!Buffer.isBuffer(payloadBytes) || payloadBytes.length !== grant.declaredSizeBytes) {
      throw new MediaDomainError(
        'INVALID_MEDIA_PAYLOAD',
        `Uploaded byte length (${payloadBytes?.length ?? 0}) does not match grant (${grant.declaredSizeBytes}).`
      );
    }

    const actualSha256 = computeSha256Hex(payloadBytes);
    if (actualSha256 !== grant.expectedSha256) {
      throw new MediaDomainError('CHECKSUM_MISMATCH', 'Uploaded payload SHA-256 does not match authorized digest.', 422);
    }

    const internalObjectKey = assertScopedInternalObjectKey(
      buildListingObjectKey({
        city: grant.cityId,
        hoodId: grant.hoodId,
        mediaType: grant.mediaType,
        mimeType: grant.mimeType,
        objectId: grant.objectId,
      })
    );
    const ext = path.extname(internalObjectKey).toLowerCase();
    const magicCheck = validateMediaMagicBytesAndExtension({
      buffer: payloadBytes,
      mimeType: grant.mimeType,
      mediaType: grant.mediaType,
      extension: ext,
    });
    if (!magicCheck.valid) {
      throw new MediaDomainError(
        'MAGIC_BYTES_MISMATCH',
        `Payload binary signature rejected: ${magicCheck.reason || 'magic bytes mismatch'}`
      );
    }

    const putResult = await this.byteStorage.putObjectBytes(internalObjectKey, payloadBytes, grant.mimeType);
    const health = this.byteStorage.getHealthStatus();
    const nowIso = new Date(nowMs).toISOString();

    const record: MediaMetadataRecord = {
      objectId: grant.objectId,
      ownerUid: actor.uid,
      cityId: grant.cityId,
      hoodId: grant.hoodId,
      mediaType: grant.mediaType,
      mimeType: grant.mimeType,
      sizeBytes: putResult.sizeBytes,
      sha256: putResult.sha256,
      state: 'ACTIVE',
      visibilityPolicy: grant.visibilityPolicy,
      providerId: health.providerId,
      durabilityTier: putResult.durabilityTier,
      internalObjectKey: putResult.storedKey,
      byteStorageVerified: true,
      association: {
        targetType: 'UNATTACHED',
        targetId: null,
        attachedByUid: null,
        attachedAtIso: null,
      },
      uploadGrantId: grant.grantId,
      idempotencyKey: grant.idempotencyKey,
      deletionAttemptCount: 0,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      revision: 1,
    };

    try {
      const saved = await this.metadataStore.saveMetadataRecord(record);
      await this.metadataStore.markUploadGrantConsumed(grant.grantId);
      return { descriptor: toPublicMediaDescriptor(saved), idempotentReplay: false };
    } catch (err) {
      await this.byteStorage.deleteObjectBytes(internalObjectKey).catch(() => {});
      throw err;
    }
  }

  /**
   * Verifies ownership of both the media objects AND the target Bargain/Sponsor entity
   * via `MediaTargetEntityVerifier` before attaching. Idempotent on repeated calls for the same target.
   */
  public async attachMediaToTarget(
    actorInput: MediaActorContext | null | undefined,
    request: AttachMediaToTargetRequest,
    targetVerifier: MediaTargetEntityVerifier,
    nowMs = Date.now()
  ): Promise<AttachMediaToTargetResult> {
    const actor = assertAuthenticatedMediaActor(actorInput);
    if (!Array.isArray(request.objectIds) || request.objectIds.length === 0 || request.objectIds.length > 6) {
      throw new MediaDomainError('INVALID_MEDIA_PAYLOAD', 'Between 1 and 6 media objectIds must be provided.');
    }

    const targetVerification = await targetVerifier.verifyTargetEntity(request.targetType, request.targetId);
    if (!targetVerification.exists || targetVerification.ownerUid !== actor.uid) {
      throw new MediaDomainError(
        'TARGET_OWNERSHIP_VERIFICATION_FAILED',
        `Actor '${actor.uid}' does not own ${request.targetType} '${request.targetId}' or target does not exist.`,
        403
      );
    }

    const records: MediaMetadataRecord[] = [];
    for (const objectId of request.objectIds) {
      const meta = await this.metadataStore.getMetadataRecord(objectId);
      if (!meta || meta.state !== 'ACTIVE') {
        throw new MediaDomainError('OBJECT_NOT_FOUND', `Active media object '${objectId}' not found.`, 404);
      }
      if (meta.ownerUid !== actor.uid) {
        throw new MediaDomainError('FORBIDDEN_NOT_OWNER', `Actor '${actor.uid}' does not own media '${objectId}'.`, 403);
      }
      if (
        meta.association.targetType !== 'UNATTACHED' &&
        (meta.association.targetType !== request.targetType || meta.association.targetId !== request.targetId)
      ) {
        throw new MediaDomainError(
          'MEDIA_ALREADY_ATTACHED',
          `Media '${objectId}' is already attached to ${meta.association.targetType}:${meta.association.targetId}.`,
          409
        );
      }
      const bytesExist = await this.byteStorage.headObjectExists(meta.internalObjectKey);
      if (!bytesExist) {
        throw new MediaDomainError('STORAGE_BYTES_MISSING', `Underlying object bytes for '${objectId}' are missing.`, 422);
      }
      records.push(meta);
    }

    const allAlreadyAttached = records.every(
      (r) => r.association.targetType === request.targetType && r.association.targetId === request.targetId
    );
    if (allAlreadyAttached) {
      return {
        targetType: request.targetType,
        targetId: request.targetId,
        attachedObjects: records.map(toPublicMediaDescriptor),
        idempotentReplay: true,
      };
    }

    const nowIso = new Date(nowMs).toISOString();
    const updatedDescriptors: PublicMediaObjectDescriptor[] = [];
    for (const meta of records) {
      if (meta.association.targetType === request.targetType && meta.association.targetId === request.targetId) {
        updatedDescriptors.push(toPublicMediaDescriptor(meta));
        continue;
      }
      const updated = await this.metadataStore.updateMetadataAtomically(meta.objectId, meta.revision, (curr) => ({
        ...curr,
        association: {
          targetType: request.targetType,
          targetId: request.targetId,
          attachedByUid: actor.uid,
          attachedAtIso: nowIso,
        },
        updatedAtIso: nowIso,
        revision: curr.revision + 1,
      }));
      updatedDescriptors.push(toPublicMediaDescriptor(updated));
    }

    return {
      targetType: request.targetType,
      targetId: request.targetId,
      attachedObjects: updatedDescriptors,
      idempotentReplay: false,
    };
  }

  public async retrieveAuthorizedMediaBytes(
    actorInput: MediaActorContext | null | undefined,
    objectId: string,
    rangeHeader?: string
  ): Promise<{ descriptor: PublicMediaObjectDescriptor; payload: ByteObjectGetResult }> {
    const meta = await this.metadataStore.getMetadataRecord(objectId);
    if (!meta || meta.state !== 'ACTIVE') {
      throw new MediaDomainError('OBJECT_NOT_FOUND', `Active media object '${objectId}' not found.`, 404);
    }

    const isAttachedPublic =
      meta.visibilityPolicy === 'PUBLIC_WHEN_ATTACHED' && meta.association.targetType !== 'UNATTACHED';

    if (!isAttachedPublic) {
      const actor = assertAuthenticatedMediaActor(actorInput);
      if (actor.uid !== meta.ownerUid && !actor.isAdmin) {
        throw new MediaDomainError('FORBIDDEN_NOT_OWNER', 'Not authorized to retrieve this private/unattached media.', 403);
      }
    }

    const payload = await this.byteStorage.getObjectBytes(meta.internalObjectKey, rangeHeader);
    if (!payload) {
      throw new MediaDomainError(
        'STORAGE_BYTES_MISSING',
        `Metadata exists for '${objectId}', but object bytes are missing in storage provider.`,
        404
      );
    }

    return { descriptor: toPublicMediaDescriptor(meta), payload };
  }

  /**
   * Two-phase retryable and idempotent media deletion.
   */
  public async deleteMediaObject(
    actorInput: MediaActorContext | null | undefined,
    objectId: string,
    options?: { allowAttachedTargetCleanup?: boolean; nowMs?: number }
  ): Promise<MediaDeleteOperationResult> {
    const actor = assertAuthenticatedMediaActor(actorInput);
    const nowMs = options?.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const meta = await this.metadataStore.getMetadataRecord(objectId);
    if (!meta) {
      throw new MediaDomainError('OBJECT_NOT_FOUND', `Media object '${objectId}' not found.`, 404);
    }
    if (meta.ownerUid !== actor.uid && !actor.isAdmin) {
      throw new MediaDomainError('FORBIDDEN_NOT_OWNER', `Actor '${actor.uid}' cannot delete '${objectId}'.`, 403);
    }
    if (meta.state === 'DELETED') {
      return {
        objectId,
        status: 'DELETED',
        idempotentReplay: true,
        retryable: false,
        deletionAttemptCount: meta.deletionAttemptCount,
      };
    }
    if (meta.association.targetType !== 'UNATTACHED' && !options?.allowAttachedTargetCleanup) {
      throw new MediaDomainError(
        'MEDIA_ATTACHED_CANNOT_DELETE_DIRECTLY',
        `Media '${objectId}' is attached to ${meta.association.targetType}:${meta.association.targetId}.`,
        409
      );
    }

    // Phase 1: Record durable PENDING_DELETE intent before touching byte storage
    const pendingMeta = await this.metadataStore.updateMetadataAtomically(objectId, undefined, (curr) => ({
      ...curr,
      state: 'PENDING_DELETE',
      deletionAttemptCount: curr.deletionAttemptCount + 1,
      updatedAtIso: nowIso,
      revision: curr.revision + 1,
    }));

    // Phase 2: Delete bytes from storage provider (missing bytes treated as idempotent success)
    try {
      await this.byteStorage.deleteObjectBytes(pendingMeta.internalObjectKey);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.metadataStore.updateMetadataAtomically(objectId, undefined, (curr) => ({
        ...curr,
        lastDeleteError: errMsg,
        updatedAtIso: nowIso,
        revision: curr.revision + 1,
      }));
      return {
        objectId,
        status: 'PENDING_RETRY',
        idempotentReplay: false,
        retryable: true,
        deletionAttemptCount: pendingMeta.deletionAttemptCount,
        errorReason: errMsg,
      };
    }

    // Phase 3: Mark metadata DELETED
    const finalized = await this.metadataStore.updateMetadataAtomically(objectId, undefined, (curr) => ({
      ...curr,
      state: 'DELETED',
      byteStorageVerified: false,
      lastDeleteError: undefined,
      deletedAtIso: nowIso,
      updatedAtIso: nowIso,
      revision: curr.revision + 1,
    }));

    return {
      objectId,
      status: 'DELETED',
      idempotentReplay: false,
      retryable: false,
      deletionAttemptCount: finalized.deletionAttemptCount,
    };
  }

  public async getPublicMetadata(objectId: string): Promise<PublicMediaObjectDescriptor | null> {
    const meta = await this.metadataStore.getMetadataRecord(objectId);
    return meta ? toPublicMediaDescriptor(meta) : null;
  }
}
