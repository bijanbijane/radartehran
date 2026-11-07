import { CoreApiError } from '../core';
import type {
  BargainLifecycleStatus,
  BargainModerationRecord,
  BargainOwnershipRecord,
  OwnerBargainView,
  PublicBargainProjection,
  StoredBargainDocument,
} from './types';

export type BargainTransitionActor = 'owner' | 'admin' | 'system_expiry';

export interface StateTransitionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Canonical state transition table governed by actor role:
 * - `owner`:
 *   - `pending -> pending` (edit pending submission)
 *   - `approved -> pending` (editing an approved listing resets status to `pending` for re-moderation)
 *   - `rejected -> pending` (revising a rejected listing resubmits it to `pending`)
 *   - `pending | approved | rejected -> withdrawn` (owner withdrawal)
 * - `admin`:
 *   - `pending -> approved`
 *   - `pending -> rejected`
 *   - `approved -> rejected` (admin revocation of previously approved listing)
 *   - `rejected -> approved` (admin re-evaluation override)
 * - `system_expiry`:
 *   - `pending | approved -> expired`
 */
const ALLOWED_TRANSITIONS_BY_ACTOR: Readonly<
  Record<BargainTransitionActor, Readonly<Record<BargainLifecycleStatus, readonly BargainLifecycleStatus[]>>>
> = {
  owner: {
    pending: ['pending', 'withdrawn'],
    approved: ['pending', 'withdrawn'],
    rejected: ['pending', 'withdrawn'],
    withdrawn: [],
    expired: [],
  },
  admin: {
    pending: ['approved', 'rejected'],
    approved: ['rejected'],
    rejected: ['approved'],
    withdrawn: [],
    expired: [],
  },
  system_expiry: {
    pending: ['expired'],
    approved: ['expired'],
    rejected: [],
    withdrawn: [],
    expired: [],
  },
};

export function validateBargainStateTransition(
  currentStoredStatus: BargainLifecycleStatus,
  targetStatus: BargainLifecycleStatus,
  actor: BargainTransitionActor,
): StateTransitionCheckResult {
  const actorTransitions = ALLOWED_TRANSITIONS_BY_ACTOR[actor];
  const allowedTargets = actorTransitions?.[currentStoredStatus] ?? [];

  if (!allowedTargets.includes(targetStatus)) {
    return {
      allowed: false,
      reason: `Transition from "${currentStoredStatus}" to "${targetStatus}" is not permitted for actor "${actor}".`,
    };
  }
  return { allowed: true };
}

export function assertExpectedRevision(
  currentRevision: number,
  expectedRevision: number | undefined,
  operationLabel: string,
): void {
  if (expectedRevision === undefined) return;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `expectedRevision for ${operationLabel} must be a positive integer.`,
    );
  }
  if (currentRevision !== expectedRevision) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Stale revision for ${operationLabel}: stored revision is ${currentRevision}, but request expected ${expectedRevision}.`,
    );
  }
}

export function isBargainExpired(
  doc: Pick<StoredBargainDocument, 'status' | 'expiresAtIso'>,
  nowEpochMs = Date.now(),
): boolean {
  if (doc.status === 'expired') return true;
  if (!doc.expiresAtIso) return false;
  const expiresMs = Date.parse(doc.expiresAtIso);
  if (!Number.isFinite(expiresMs)) return false;
  return nowEpochMs >= expiresMs;
}

/**
 * Projects a stored bargain into a strictly sanitized public listing.
 * Returns `null` if the bargain is not `'approved'` or if it has expired.
 * Never includes ownership UID, moderation notes, moderator UID, or revision numbers.
 */
export function toPublicBargainProjection(
  doc: StoredBargainDocument | null | undefined,
  nowEpochMs = Date.now(),
): PublicBargainProjection | null {
  if (!doc || doc.status !== 'approved') {
    return null;
  }
  if (isBargainExpired(doc, nowEpochMs)) {
    return null;
  }

  const projection: PublicBargainProjection = {
    id: doc.id,
    hoodId: doc.hoodId,
    title: doc.title,
    type: doc.type,
    sqm: doc.sqm,
    priceText: doc.priceText,
    discountPercent: doc.discountPercent,
    buyerProfitText: doc.buyerProfitText,
    street: doc.street,
    createdAtIso: doc.createdAtIso,
  };

  if (doc.approvedAtIso) projection.approvedAtIso = doc.approvedAtIso;
  if (doc.expiresAtIso) projection.expiresAtIso = doc.expiresAtIso;
  if (doc.imageUrl) projection.imageUrl = doc.imageUrl;
  if (Array.isArray(doc.imageUrls) && doc.imageUrls.length > 0) {
    projection.imageUrls = [...doc.imageUrls];
  }
  if (doc.videoUrl) projection.videoUrl = doc.videoUrl;
  if (doc.objectStorageBucket) projection.objectStorageBucket = doc.objectStorageBucket;
  if (Array.isArray(doc.objectStorageKeys) && doc.objectStorageKeys.length > 0) {
    projection.objectStorageKeys = [...doc.objectStorageKeys];
  }
  if (Array.isArray(doc.objectStorageObjectIds) && doc.objectStorageObjectIds.length > 0) {
    projection.objectStorageObjectIds = [...doc.objectStorageObjectIds];
  }

  return projection;
}

/**
 * Combines the stored document, verified ownership record, and moderation feedback
 * into an owner-authorized view (still redacting internal administrator identities).
 */
export function toOwnerBargainView(
  doc: StoredBargainDocument,
  ownership: BargainOwnershipRecord,
  moderation?: BargainModerationRecord | null,
): OwnerBargainView {
  const view: OwnerBargainView = {
    ...doc,
    ownerUid: ownership.userId,
  };
  if (moderation?.rejectionReason && doc.status === 'rejected') {
    view.rejectionReason = moderation.rejectionReason;
  }
  if (moderation?.moderatedAtIso) {
    view.moderatedAtIso = moderation.moderatedAtIso;
  }
  return view;
}
