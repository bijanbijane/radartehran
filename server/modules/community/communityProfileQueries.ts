/** @file server/modules/community/communityProfileQueries.ts — RT-SOCIAL-IMPL-008 Direct Username Lookup, Privacy Enforcement & Merged Contribution Timeline */
import type {
  CommunityProfile,
  ProfileContributionItem,
  ProfileContributionKind,
  ProfileContributionPage,
} from '../../../src/features/community/types/community.types';
import { sanitizeInput } from '../../../src/utils/security';
import {
  CommunityDatabaseUnavailableError,
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
} from './communityFirestoreAdapter';
import {
  computeProfileTimelineFingerprint,
  encodeProfileTimelineCursor,
  lookupRawCommunityProfileByUsername,
  validateAndDecodeProfileTimelineCursor,
} from './communityProfileCursorAndUsername';
import { isCommunitySeedRecord } from './communityUnifiedQueries';

export {
  MAX_PROFILE_CURSOR_LENGTH,
  assertCommunityUsernameUnique,
  computeProfileTimelineFingerprint,
  encodeProfileTimelineCursor,
  lookupRawCommunityProfileByUsername,
  normalizeCommunityUsername,
  validateAndDecodeProfileTimelineCursor,
  type ProfileTimelineCursor,
} from './communityProfileCursorAndUsername';

export const DEFAULT_PROFILE_TIMELINE_LIMIT = 20;
export const MAX_PROFILE_TIMELINE_LIMIT = 30;
export const MAX_PROFILE_SOURCE_QUERY_LIMIT = 30;

const VALID_CONTRIBUTION_KINDS = new Set<ProfileContributionKind>([
  'all',
  'discussion',
  'question',
  'correction',
  'research_proposal',
  'comment',
]);

export function isProfileContributionVisible(item: Record<string, unknown>): boolean {
  if (!item || typeof item !== 'object') return false;
  if (item.isDeleted === true) return false;
  if (isCommunitySeedRecord(item as { id?: string; source?: string; isSeed?: boolean })) {
    return false;
  }

  const status = String(item.status || '');
  if (
    status === 'hidden' ||
    status === 'removed' ||
    status === 'locked' ||
    status === 'rejected' ||
    status === 'withdrawn' ||
    status === 'draft' ||
    status === 'pending_review' ||
    status === 'unapproved'
  ) {
    return false;
  }

  const modStatus = String(item.moderationStatus || '');
  if (
    modStatus === 'hidden' ||
    modStatus === 'removed' ||
    modStatus === 'rejected' ||
    modStatus === 'pending' ||
    modStatus === 'unapproved'
  ) {
    return false;
  }

  return true;
}

export function clampProfileTimelineLimit(rawLimit: unknown): number {
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
    return DEFAULT_PROFILE_TIMELINE_LIMIT;
  }
  const n = Number(rawLimit);
  if (!Number.isFinite(n) || n < 1) {
    return DEFAULT_PROFILE_TIMELINE_LIMIT;
  }
  return Math.min(MAX_PROFILE_TIMELINE_LIMIT, Math.floor(n));
}

export function parseProfileContributionKind(rawKind: unknown): ProfileContributionKind {
  if (rawKind === undefined || rawKind === null || rawKind === '') return 'all';
  const k = String(rawKind).trim() as ProfileContributionKind;
  if (!VALID_CONTRIBUTION_KINDS.has(k)) {
    throw new CommunityHttpError(
      400,
      'INVALID_CONTRIBUTION_KIND',
      'نوع مشارکت درخواستی معتبر نیست.',
    );
  }
  return k;
}

function compareContributionItems(a: ProfileContributionItem, b: ProfileContributionItem): number {
  if (a.createdAtIso !== b.createdAtIso) {
    return b.createdAtIso.localeCompare(a.createdAtIso);
  }
  const aSourceRank = a.kind === 'comment' ? 1 : 0;
  const bSourceRank = b.kind === 'comment' ? 1 : 0;
  if (aSourceRank !== bSourceRank) {
    return aSourceRank - bSourceRank;
  }
  return a.id.localeCompare(b.id);
}

function toPostContributionDto(
  doc: Record<string, unknown> & { id: string },
  profileVisibility: 'public' | 'members_only',
): ProfileContributionItem {
  const rawKind = String(doc.recordKind || 'discussion');
  const kind: Exclude<ProfileContributionKind, 'all'> =
    rawKind === 'question' || rawKind === 'correction' || rawKind === 'research_proposal'
      ? rawKind
      : 'discussion';
  const rawBody = String(
    doc.bodyFa ?? doc.evidenceSummaryFa ?? doc.questionFa ?? doc.suggestedValueFa ?? '',
  );
  const itemVisibility: 'public' | 'members_only' =
    doc.visibility === 'members_only' || profileVisibility === 'members_only'
      ? 'members_only'
      : 'public';

  return {
    id: doc.id,
    kind,
    ownerUid: String(doc.ownerUserId || ''),
    titleFa: sanitizeInput(String(doc.titleFa || ''), 140),
    excerptFa: sanitizeInput(rawBody, 180),
    targetPostId: doc.id,
    ...(typeof doc.neighborhoodId === 'number' ? { neighborhoodId: doc.neighborhoodId } : {}),
    ...(typeof doc.neighborhoodNameFa === 'string'
      ? { neighborhoodNameFa: sanitizeInput(doc.neighborhoodNameFa, 50) }
      : {}),
    ...(typeof doc.topicId === 'string' ? { topicId: sanitizeInput(doc.topicId, 50) } : {}),
    helpfulCount: Math.max(0, Number(doc.helpfulCount ?? doc.votesCount ?? 0)),
    replyCount: Math.max(0, Number(doc.replyCount ?? (Array.isArray(doc.answers) ? doc.answers.length : 0))),
    createdAtIso: String(doc.createdAtIso || ''),
    ...(typeof doc.createdAtFa === 'string' ? { createdAtFa: doc.createdAtFa } : {}),
    visibility: itemVisibility,
  };
}

export async function queryProfileContributionsPaginated(
  store: CommunityDatabaseStore,
  rawUsername: string,
  params: {
    limit?: unknown;
    cursor?: string | null;
    kind?: unknown;
    isViewerMember: boolean;
    viewerUid?: string;
  },
): Promise<ProfileContributionPage> {
  const kind = parseProfileContributionKind(params.kind);
  const limit = clampProfileTimelineLimit(params.limit);

  let rawProfile: (CommunityProfile & Record<string, unknown>) | null;
  try {
    rawProfile = await lookupRawCommunityProfileByUsername(store, rawUsername);
  } catch (err) {
    if (err instanceof CommunityHttpError) throw err;
    throw new CommunityHttpError(
      503,
      'PROFILE_TIMELINE_UNAVAILABLE',
      'خطای موقت در دریافت اطلاعات نمایه کاربر.',
    );
  }

  if (!rawProfile) {
    throw new CommunityHttpError(
      404,
      'PROFILE_NOT_PUBLIC_OR_FOUND',
      'پروفایل موردنظر یافت نشد یا عمومی نیست.',
    );
  }

  const isOwner = Boolean(params.viewerUid && params.viewerUid === rawProfile.userId);
  if (rawProfile.visibility === 'private' && !isOwner) {
    throw new CommunityHttpError(
      404,
      'PROFILE_NOT_PUBLIC_OR_FOUND',
      'پروفایل موردنظر یافت نشد یا عمومی نیست.',
    );
  }
  if (rawProfile.visibility === 'members_only' && !params.isViewerMember && !isOwner) {
    throw new CommunityHttpError(
      404,
      'PROFILE_NOT_PUBLIC_OR_FOUND',
      'پروفایل موردنظر یافت نشد یا عمومی نیست.',
    );
  }

  const profileUserId = rawProfile.userId;
  const queryFingerprint = computeProfileTimelineFingerprint(profileUserId, kind);
  const decodedCursor = validateAndDecodeProfileTimelineCursor(params.cursor, {
    profileUserId,
    queryFingerprint,
  });

  const showContributions = Boolean(
    rawProfile.privacy?.showContributions ?? rawProfile.showContributions ?? true,
  );
  if (!showContributions && !isOwner) {
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      limit,
      contributionsVisible: false,
    };
  }

  const profileVisibility: 'public' | 'members_only' =
    rawProfile.visibility === 'members_only' ? 'members_only' : 'public';

  const shouldQueryPosts = kind === 'all' || kind !== 'comment';
  const shouldQueryComments = kind === 'all' || kind === 'comment';
  const targetCount = limit + 1;

  try {
    const postCandidates: ProfileContributionItem[] = [];
    let postsScanCursor = decodedCursor?.postsCursorDocId ?? null;
    let postsExhausted = !shouldQueryPosts;

    while (!postsExhausted && postCandidates.length < targetCount) {
      const postFilters: Array<{ field: string; op: '=='; value: unknown }> = [
        { field: 'ownerUserId', op: '==', value: profileUserId },
      ];
      if (kind !== 'all' && kind !== 'comment') {
        postFilters.push({ field: 'recordKind', op: '==', value: kind });
      }
      const page = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, {
        filters: postFilters,
        orderBy: [
          { field: 'createdAtIso', direction: 'desc' },
          { field: 'id', direction: 'asc' },
        ],
        limit: MAX_PROFILE_SOURCE_QUERY_LIMIT,
        cursorDocId: postsScanCursor,
      });

      for (const doc of page.items) {
        if (!isProfileContributionVisible(doc)) continue;
        if (doc.visibility === 'private' && !isOwner) continue;
        if (doc.visibility === 'members_only' && !params.isViewerMember && !isOwner) continue;
        postCandidates.push(toPostContributionDto(doc, profileVisibility));
        if (postCandidates.length >= targetCount) break;
      }

      if (!page.hasMore || !page.nextCursor) {
        postsExhausted = true;
      } else {
        postsScanCursor = page.nextCursor;
      }
    }

    const commentCandidates: ProfileContributionItem[] = [];
    let commentsScanCursor = decodedCursor?.commentsCursorDocId ?? null;
    let commentsExhausted = !shouldQueryComments;
    const parentPostCache = new Map<string, (Record<string, unknown> & { id: string }) | null>();

    while (!commentsExhausted && commentCandidates.length < targetCount) {
      const page = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.comments, {
        filters: [{ field: 'ownerUserId', op: '==', value: profileUserId }],
        orderBy: [
          { field: 'createdAtIso', direction: 'desc' },
          { field: 'id', direction: 'asc' },
        ],
        limit: MAX_PROFILE_SOURCE_QUERY_LIMIT,
        cursorDocId: commentsScanCursor,
      });

      for (const cmt of page.items) {
        if (!isProfileContributionVisible(cmt)) continue;
        const parentPostId = String(cmt.postId || cmt.questionId || '').trim();
        if (!parentPostId) continue;

        let parentPost = parentPostCache.get(parentPostId);
        if (parentPost === undefined) {
          parentPost = await store.getDoc<Record<string, unknown>>(
            SOCIAL_COLLECTIONS.posts,
            parentPostId,
          );
          parentPostCache.set(parentPostId, parentPost);
        }
        if (!parentPost || !isProfileContributionVisible(parentPost)) continue;
        if (parentPost.visibility === 'private' && !isOwner) continue;
        if (parentPost.visibility === 'members_only' && !params.isViewerMember && !isOwner) {
          continue;
        }

        const itemVisibility: 'public' | 'members_only' =
          parentPost.visibility === 'members_only' || profileVisibility === 'members_only'
            ? 'members_only'
            : 'public';

        commentCandidates.push({
          id: cmt.id,
          kind: 'comment',
          ownerUid: String(cmt.ownerUserId || profileUserId),
          titleFa: sanitizeInput(String(parentPost.titleFa || 'دیدگاه در گفتگو'), 140),
          excerptFa: sanitizeInput(String(cmt.bodyFa || ''), 180),
          targetPostId: parentPost.id,
          ...(typeof parentPost.neighborhoodId === 'number'
            ? { neighborhoodId: parentPost.neighborhoodId }
            : {}),
          ...(typeof parentPost.neighborhoodNameFa === 'string'
            ? { neighborhoodNameFa: sanitizeInput(parentPost.neighborhoodNameFa, 50) }
            : {}),
          ...(typeof parentPost.topicId === 'string'
            ? { topicId: sanitizeInput(parentPost.topicId, 50) }
            : {}),
          helpfulCount: Math.max(
            0,
            Number((cmt.reactionCounts as Record<string, unknown> | undefined)?.helpful ?? 0),
          ),
          createdAtIso: String(cmt.createdAtIso || ''),
          ...(typeof cmt.createdAtFa === 'string' ? { createdAtFa: cmt.createdAtFa } : {}),
          visibility: itemVisibility,
        });

        if (commentCandidates.length >= targetCount) break;
      }

      if (!page.hasMore || !page.nextCursor) {
        commentsExhausted = true;
      } else {
        commentsScanCursor = page.nextCursor;
      }
    }

    const merged = [...postCandidates, ...commentCandidates].sort(compareContributionItems);
    const items = merged.slice(0, limit);
    const hasMore =
      merged.length > limit ||
      (!postsExhausted && shouldQueryPosts) ||
      (!commentsExhausted && shouldQueryComments);

    let nextPostsCursorDocId = decodedCursor?.postsCursorDocId ?? null;
    let nextCommentsCursorDocId = decodedCursor?.commentsCursorDocId ?? null;
    for (const emitted of items) {
      if (emitted.kind === 'comment') {
        nextCommentsCursorDocId = emitted.id;
      } else {
        nextPostsCursorDocId = emitted.id;
      }
    }

    const nextCursor =
      hasMore && items.length > 0
        ? encodeProfileTimelineCursor({
            version: 1,
            profileUserId,
            queryFingerprint,
            postsCursorDocId: nextPostsCursorDocId,
            commentsCursorDocId: nextCommentsCursorDocId,
            issuedAtIso: new Date().toISOString(),
          })
        : null;

    return {
      items,
      nextCursor,
      hasMore: Boolean(nextCursor),
      limit,
      contributionsVisible: true,
    };
  } catch (err) {
    if (err instanceof CommunityHttpError) throw err;
    if (err instanceof CommunityDatabaseUnavailableError) {
      throw new CommunityHttpError(
        503,
        'PROFILE_TIMELINE_UNAVAILABLE',
        'دریافت خط زمانی مشارکت‌ها موقتاً در دسترس نیست.',
      );
    }
    throw new CommunityHttpError(
      503,
      'PROFILE_TIMELINE_UNAVAILABLE',
      'خطا در دریافت مشارکت‌های نمایه کاربر.',
    );
  }
}

