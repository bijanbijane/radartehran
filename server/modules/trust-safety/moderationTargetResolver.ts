/**
 * @file server/modules/trust-safety/moderationTargetResolver.ts
 * @description RT-TS-CRITICAL-028 — Authoritative Moderation Target Type Validator & Collection Resolver.
 * Maps discussion_post, question, comment, and user targets to their exact canonical Community Domain
 * collection, owner UID, supported actions, and feed projection strategy.
 */
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityTransaction,
  type SocialCollectionName,
} from '../community/communityFirestoreAdapter';

export const VALID_MODERATION_TARGET_TYPES = [
  'discussion_post',
  'question',
  'comment',
  'user',
] as const;

export type ModerationTargetType = (typeof VALID_MODERATION_TARGET_TYPES)[number];

export type SocialModerationDecision =
  | 'dismiss'
  | 'hide'
  | 'lock'
  | 'soft_delete'
  | 'warn_author'
  | 'escalate';

export type TargetProjectionStrategy = 'FEED_INDEX' | 'NONE';

export interface ModerationTargetDescriptor {
  targetType: ModerationTargetType;
  targetId: string;
  targetCollection: SocialCollectionName;
  targetDoc: Record<string, unknown> & { id: string };
  targetOwnerUid: string | null;
  currentVisibility: string;
  currentModerationStatus: string;
  supportedActions: readonly SocialModerationDecision[];
  projectionStrategy: TargetProjectionStrategy;
}

export interface TargetMutationPlan {
  collection: SocialCollectionName;
  docId: string;
  patch: Record<string, unknown>;
  feedProjectionAction: 'NONE' | 'HIDE' | 'UPSERT';
  projectedDoc?: Record<string, unknown>;
}

const VALID_TARGET_TYPE_SET = new Set<string>(VALID_MODERATION_TARGET_TYPES);

const TARGET_CAPABILITIES: Record<
  ModerationTargetType,
  {
    collection: SocialCollectionName;
    supportedActions: readonly SocialModerationDecision[];
    projectionStrategy: TargetProjectionStrategy;
  }
> = {
  discussion_post: {
    collection: SOCIAL_COLLECTIONS.posts,
    supportedActions: ['dismiss', 'hide', 'lock', 'soft_delete', 'warn_author', 'escalate'],
    projectionStrategy: 'FEED_INDEX',
  },
  question: {
    collection: SOCIAL_COLLECTIONS.posts,
    supportedActions: ['dismiss', 'hide', 'lock', 'soft_delete', 'warn_author', 'escalate'],
    projectionStrategy: 'FEED_INDEX',
  },
  comment: {
    collection: SOCIAL_COLLECTIONS.comments,
    supportedActions: ['dismiss', 'hide', 'soft_delete', 'warn_author', 'escalate'],
    projectionStrategy: 'NONE',
  },
  user: {
    collection: SOCIAL_COLLECTIONS.profiles,
    supportedActions: ['dismiss', 'warn_author', 'escalate'],
    projectionStrategy: 'NONE',
  },
};

export function assertValidModerationTargetType(raw: unknown): ModerationTargetType {
  if (typeof raw !== 'string' || !VALID_TARGET_TYPE_SET.has(raw.trim())) {
    throw new CommunityHttpError(
      400,
      'INVALID_MODERATION_TARGET_TYPE',
      'نوع هدف گزارش نامعتبر است. مقادیر مجاز: discussion_post، question، comment، user.',
    );
  }
  return raw.trim() as ModerationTargetType;
}

export function validateModerationTargetId(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new CommunityHttpError(400, 'INVALID_MODERATION_TARGET_ID', 'شناسه هدف گزارش معتبر نیست.');
  }
  const trimmed = raw.trim();
  if (
    trimmed.length < 2 ||
    trimmed.length > 128 ||
    /[\s\r\n\u0000/]/.test(trimmed) ||
    trimmed.includes('..')
  ) {
    throw new CommunityHttpError(
      400,
      'INVALID_MODERATION_TARGET_ID',
      'ساختار یا طول شناسه هدف گزارش نامعتبر است.',
    );
  }
  return trimmed;
}

export function getTargetCollectionForType(targetType: ModerationTargetType): SocialCollectionName {
  return TARGET_CAPABILITIES[targetType].collection;
}

export function isActionSupportedForTargetType(
  targetType: ModerationTargetType,
  decision: SocialModerationDecision,
): boolean {
  return TARGET_CAPABILITIES[targetType].supportedActions.includes(decision);
}

function extractOwnerUid(targetType: ModerationTargetType, doc: Record<string, unknown> & { id: string }): string | null {
  if (targetType === 'user') {
    const uid = typeof doc.userId === 'string' && doc.userId.trim() ? doc.userId.trim() : doc.id;
    return uid || null;
  }
  const candidates = [doc.ownerUserId, doc.authorUserId, doc.authorUid, doc.userId];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

/**
 * Pure READ-PHASE resolver: reads only via `tx.get` and validates real entity existence and type match.
 */
export async function resolveModerationTargetInTx(
  tx: CommunityTransaction,
  targetType: ModerationTargetType,
  targetId: string,
): Promise<ModerationTargetDescriptor> {
  const cap = TARGET_CAPABILITIES[targetType];
  const doc = await tx.get<Record<string, unknown>>(cap.collection, targetId);
  if (!doc) {
    throw new CommunityHttpError(
      404,
      'MODERATION_TARGET_NOT_FOUND',
      'موجودیت هدف برای نظارت در پایگاه‌داده یافت نشد.',
      { targetType, targetId, targetCollection: cap.collection },
    );
  }

  // Verify entity kind matches targetType when stored in shared socialPosts collection
  if (targetType === 'question' && doc.recordKind !== undefined && doc.recordKind !== 'question') {
    throw new CommunityHttpError(
      400,
      'MODERATION_TARGET_TYPE_MISMATCH',
      'نوع موجودیت ثبت‌شده با targetType=question مطابقت ندارد.',
    );
  }
  if (targetType === 'discussion_post' && doc.recordKind === 'question') {
    throw new CommunityHttpError(
      400,
      'MODERATION_TARGET_TYPE_MISMATCH',
      'این شناسه متعلق به پرسش (question) است نه discussion_post.',
    );
  }

  const currentVisibility =
    typeof doc.visibility === 'string'
      ? doc.visibility
      : doc.isDeleted === true || doc.status === 'hidden'
        ? 'hidden'
        : 'discoverable';

  const currentModerationStatus =
    typeof doc.moderationStatus === 'string'
      ? doc.moderationStatus
      : typeof doc.status === 'string'
        ? doc.status
        : 'active';

  return {
    targetType,
    targetId,
    targetCollection: cap.collection,
    targetDoc: doc,
    targetOwnerUid: extractOwnerUid(targetType, doc),
    currentVisibility,
    currentModerationStatus,
    supportedActions: cap.supportedActions,
    projectionStrategy: cap.projectionStrategy,
  };
}

export function buildTargetModerationMutation(
  descriptor: ModerationTargetDescriptor,
  decision: SocialModerationDecision,
  nowIso: string,
): TargetMutationPlan | null {
  if (!descriptor.supportedActions.includes(decision)) {
    throw new CommunityHttpError(
      409,
      'UNSUPPORTED_ACTION_FOR_TARGET_TYPE',
      `تصمیم «${decision}» برای موجودیت از نوع «${descriptor.targetType}» پشتیبانی نمی‌شود.`,
      {
        targetType: descriptor.targetType,
        decision,
        supportedActions: [...descriptor.supportedActions],
      },
    );
  }

  if (decision === 'dismiss' || decision === 'escalate') {
    return null;
  }

  if (decision === 'warn_author') {
    if (descriptor.targetType === 'user') {
      const prevWarnings = Number(descriptor.targetDoc.moderationWarningCount ?? 0);
      return {
        collection: descriptor.targetCollection,
        docId: descriptor.targetId,
        patch: {
          moderationWarningCount: prevWarnings + 1,
          lastModerationWarningAtIso: nowIso,
          updatedAtIso: nowIso,
        },
        feedProjectionAction: 'NONE',
      };
    }
    return null;
  }

  // Content mutations (hide, lock, soft_delete)
  if (descriptor.targetType === 'comment') {
    const nextStatus = decision === 'soft_delete' ? 'removed' : 'hidden';
    const patch: Record<string, unknown> = {
      status: nextStatus,
      moderationStatus: nextStatus,
      visibility: 'hidden',
      ...(decision === 'soft_delete' ? { isDeleted: true, deletedAtIso: nowIso } : {}),
      updatedAtIso: nowIso,
    };
    return {
      collection: SOCIAL_COLLECTIONS.comments,
      docId: descriptor.targetId,
      patch,
      feedProjectionAction: 'NONE',
    };
  }

  // discussion_post or question (stored in socialPosts + synced to socialFeedIndex)
  const nextStatus = decision === 'lock' ? 'locked' : 'hidden';
  const nextModStatus =
    decision === 'soft_delete' ? 'removed' : decision === 'hide' ? 'hidden' : 'locked';
  const patch: Record<string, unknown> = {
    status: nextStatus,
    moderationStatus: nextModStatus,
    ...(decision === 'soft_delete' ? { isDeleted: true, deletedAtIso: nowIso } : {}),
    updatedAtIso: nowIso,
  };
  return {
    collection: SOCIAL_COLLECTIONS.posts,
    docId: descriptor.targetId,
    patch,
    feedProjectionAction: decision === 'hide' || decision === 'soft_delete' ? 'HIDE' : 'UPSERT',
    projectedDoc: {
      ...descriptor.targetDoc,
      ...patch,
    },
  };
}

export function buildTargetRestoreMutation(
  descriptor: ModerationTargetDescriptor,
  nowIso: string,
): TargetMutationPlan | null {
  if (descriptor.targetType === 'user') {
    return null;
  }
  if (descriptor.targetType === 'comment') {
    return {
      collection: SOCIAL_COLLECTIONS.comments,
      docId: descriptor.targetId,
      patch: {
        status: 'published',
        moderationStatus: 'approved',
        visibility: 'discoverable',
        isDeleted: false,
        deletedAtIso: null,
        updatedAtIso: nowIso,
      },
      feedProjectionAction: 'NONE',
    };
  }
  const patch: Record<string, unknown> = {
    status: 'published',
    moderationStatus: 'approved',
    isDeleted: false,
    deletedAtIso: null,
    updatedAtIso: nowIso,
  };
  return {
    collection: SOCIAL_COLLECTIONS.posts,
    docId: descriptor.targetId,
    patch,
    feedProjectionAction: 'UPSERT',
    projectedDoc: {
      ...descriptor.targetDoc,
      ...patch,
    },
  };
}
