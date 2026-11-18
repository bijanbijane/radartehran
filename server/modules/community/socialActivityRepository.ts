/**
 * @file server/modules/community/socialActivityRepository.ts
 * @description RT-SOCIAL-IMPL-004 & RT-SOCIAL-IMPL-005 — Transactional Social Activity Ledger Writer.
 * Appends immutable, PII-free activity records inside the caller's Firestore transaction.
 */
import crypto from 'node:crypto';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityTransaction,
} from './communityFirestoreAdapter';
import type {
  AppendSocialActivityInput,
  SocialActivityContextSnapshot,
  SocialActivityEventType,
  SocialActivityRecord,
} from './socialActivityTypes';

const RELATIONSHIP_EVENTS = new Set<SocialActivityEventType>([
  'social.follow.created.v1',
  'social.follow.removed.v1',
  'social.reaction.created.v1',
  'social.reaction.removed.v1',
]);

const EMAIL_OR_PHONE_REGEX = /(?:^09\d{9}$|[^\s@]+@[^\s@]+\.[^\s@]+)/i;

let simulateActivityWriteFailure = false;

export function setSimulateActivityWriteFailureForTests(shouldFail: boolean): void {
  simulateActivityWriteFailure = shouldFail;
}

export function computeSocialActivityId(input: {
  eventType: SocialActivityEventType;
  objectId: string;
  actorUid?: string;
  objectType?: string;
  reactionType?: string;
  operationId?: string;
}): string {
  if (RELATIONSHIP_EVENTS.has(input.eventType)) {
    const opId = (input.operationId || '').trim();
    if (!opId) {
      throw new CommunityHttpError(
        400,
        'ACTIVITY_OPERATION_ID_REQUIRED',
        'شناسه یکتای عملیات (operationId) برای ثبت رویداد Follow/Reaction الزامی است.',
      );
    }
    const rawKey = `${input.eventType}:${input.actorUid || ''}:${input.objectType || ''}:${input.objectId}:${input.reactionType || ''}:${opId}`;
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }
  return crypto
    .createHash('sha256')
    .update(`${input.eventType}:${input.objectId}`)
    .digest('hex');
}

function sanitizeContextForActivity(
  ctx?: AppendSocialActivityInput['socialContext'],
): SocialActivityContextSnapshot | undefined {
  if (!ctx) return undefined;
  return {
    primary: ctx.primary
      ? {
          entityType: String(ctx.primary.entityType),
          entityId: String(ctx.primary.entityId),
        }
      : null,
    related: Array.isArray(ctx.related)
      ? ctx.related.slice(0, 4).map((r) => ({
          entityType: String(r.entityType),
          entityId: String(r.entityId),
        }))
      : [],
    schemaVersion: 1,
  };
}

export function buildSocialActivityRecord(
  input: AppendSocialActivityInput,
): SocialActivityRecord {
  if (simulateActivityWriteFailure) {
    throw new CommunityHttpError(
      500,
      'ACTIVITY_WRITE_FAILED',
      'خطا در ثبت رویداد در دفتر فعالیت‌های اجتماعی (Rollback Transaction).',
    );
  }

  const actorUid = typeof input.actorUid === 'string' ? input.actorUid.trim() : '';
  if (!actorUid || actorUid.length > 128 || EMAIL_OR_PHONE_REGEX.test(actorUid)) {
    throw new CommunityHttpError(
      403,
      'INVALID_ACTIVITY_ACTOR',
      'شناسه عامل رویداد اجتماعی نامعتبر است یا حاوی داده حساس است.',
    );
  }

  if (
    input.verifiedActorUid !== undefined &&
    input.verifiedActorUid.trim() !== actorUid
  ) {
    throw new CommunityHttpError(
      403,
      'ACTOR_IDENTITY_MISMATCH',
      'عدم تطابق هویت عامل رویداد با کاربر احرازشده سرور.',
    );
  }

  const objectId = typeof input.objectId === 'string' ? input.objectId.trim() : '';
  if (!objectId || objectId.length > 128) {
    throw new CommunityHttpError(
      400,
      'INVALID_ACTIVITY_OBJECT',
      'شناسه موضوع رویداد اجتماعی نامعتبر است.',
    );
  }

  const id = computeSocialActivityId({
    eventType: input.eventType,
    objectId,
    actorUid,
    objectType: input.objectType,
    reactionType: input.reactionType,
    operationId: input.operationId,
  });

  const isRelationship = RELATIONSHIP_EVENTS.has(input.eventType);
  const defaultVisibility =
    isRelationship || input.objectType === 'correction' ? 'restricted' : 'public';

  const record: SocialActivityRecord = {
    id,
    eventType: input.eventType,
    actorUid,
    objectType: input.objectType,
    objectId,
    ...(input.parentObjectId ? { parentObjectId: input.parentObjectId.trim() } : {}),
    ...(input.reactionType ? { reactionType: input.reactionType } : {}),
    ...(input.followScope ? { followScope: input.followScope } : {}),
    ...(input.followTargetId ? { followTargetId: input.followTargetId.trim() } : {}),
    ...(input.operationId ? { operationId: input.operationId.trim() } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.socialContext ? { socialContext: sanitizeContextForActivity(input.socialContext) } : {}),
    visibility: input.visibility ?? defaultVisibility,
    createdAtIso: input.createdAtIso || new Date().toISOString(),
    schemaVersion: 1,
  };

  return record;
}

/**
 * Stages a SocialActivityRecord write inside the caller's existing Firestore transaction.
 * Does NOT open a separate transaction. If this throws, the caller's transaction rolls back atomically.
 */
export function appendSocialActivity(
  tx: CommunityTransaction,
  input: AppendSocialActivityInput,
): SocialActivityRecord {
  const record = buildSocialActivityRecord(input);
  tx.set(SOCIAL_COLLECTIONS.activities, record.id, record);
  return record;
}
