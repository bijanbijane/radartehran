/** @file server/modules/search/socialFeedProjection.ts — RT-SOCIAL-IMPL-007 Derived Feed & Search Projection Builder */
import {
  SOCIAL_COLLECTIONS,
  type CommunityTransaction,
} from '../community/communityFirestoreAdapter';

export const FEED_SCORE_FORMULA_VERSION = 'social-feed-score-v1.0.0';
export const PROJECTION_SCHEMA_VERSION = 1;
export const MAX_INDEX_SEARCH_TOKENS = 40;
export const MAX_QUERY_SEARCH_TOKENS = 10;
export const MAX_SEARCH_QUERY_LENGTH = 120;

export interface SocialFeedIndexDocument extends Record<string, unknown> {
  id: string;
  sourcePostId: string;
  recordKind: 'discussion' | 'question' | 'correction' | 'research_proposal';
  authorUid: string;
  neighborhoodId: number;
  topicId: string;
  titleFa: string;
  normalizedTitleFa: string;
  normalizedSearchTokens: string[];
  excerptFa: string;
  createdAtIso: string;
  updatedAtIso: string;
  helpfulCount: number;
  replyCount: number;
  visibility: 'discoverable' | 'restricted' | 'hidden';
  moderationStatus: 'active' | 'pending' | 'hidden' | 'removed';
  feedScore: number;
  formulaVersion: string;
  projectionVersion: 1;
  indexedAtIso: string;
}

export interface SocialFeedIndexJob extends Record<string, unknown> {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedByUid: string;
  startedAtIso: string;
  updatedAtIso: string;
  completedAtIso?: string;
  batchSize: number;
  scannedCount: number;
  indexedCount: number;
  skippedCount: number;
  deletedOrHiddenCount: number;
  lastCursorDocId: string | null;
  formulaVersion: string;
  projectionVersion: 1;
  errorCode?: string;
}

export function normalizePersianSearchText(input: string): string {
  return String(input || '')
    .replace(/\u200c/g, ' ')
    .replace(/[يی]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/[أإآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function extractNormalizedSearchTokens(
  input: string,
  maxTokens = MAX_INDEX_SEARCH_TOKENS,
): string[] {
  const normalized = normalizePersianSearchText(input);
  if (!normalized) return [];
  const rawParts = normalized.split(' ');
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const part of rawParts) {
    const trimmed = part.trim();
    if (trimmed.length < 2) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    tokens.push(trimmed);
    if (tokens.length >= maxTokens) break;
  }
  return tokens;
}

export function computeSocialFeedScore(params: {
  helpfulCount: number;
  replyCount: number;
  ageHours: number;
  isFollowedMatch?: boolean;
  sameAuthorConsecutiveRank?: number;
}): { score: number; formulaVersion: string } {
  const engagement = Math.min(200, params.helpfulCount * 2.5 + params.replyCount * 1.8);
  const freshness = 100 / (1 + Math.max(0, params.ageHours) / 18);
  const followBoost = params.isFollowedMatch ? 25 : 0;
  const diversityPenalty = Math.max(0, (params.sameAuthorConsecutiveRank ?? 0) * 18);
  const score = Number(Math.max(0, engagement + freshness + followBoost - diversityPenalty).toFixed(3));
  return { score, formulaVersion: FEED_SCORE_FORMULA_VERSION };
}

export function resolveSocialModerationStatus(
  post: Record<string, unknown>,
): 'active' | 'pending' | 'hidden' | 'removed' {
  if (post.isDeleted === true || post.status === 'removed' || post.moderationStatus === 'removed') {
    return 'removed';
  }
  if (post.status === 'hidden' || post.moderationStatus === 'hidden') {
    return 'hidden';
  }
  if (
    post.status === 'pending' ||
    post.status === 'pending_review' ||
    post.moderationStatus === 'pending'
  ) {
    return 'pending';
  }
  return 'active';
}

export function resolveSocialItemVisibility(
  post: Record<string, unknown>,
): 'discoverable' | 'restricted' | 'hidden' {
  if (post.isDeleted === true) return 'hidden';
  if (post.status === 'hidden' || post.status === 'removed') return 'hidden';
  if (post.moderationStatus === 'hidden' || post.moderationStatus === 'removed') return 'hidden';
  const recordKind = String(post.recordKind || 'discussion');
  if (
    recordKind === 'correction' &&
    (post.status === 'pending_review' || post.status === 'pending' || post.status === 'submitted')
  ) {
    return 'restricted';
  }
  if (post.visibility === 'restricted') return 'restricted';
  if (post.visibility === 'hidden') return 'hidden';
  return 'discoverable';
}

export function isSocialItemDiscoverable(post: Record<string, unknown>): boolean {
  return resolveSocialItemVisibility(post) === 'discoverable';
}

export function buildSocialFeedIndexDocument(
  post: Record<string, unknown>,
  nowIso = new Date().toISOString(),
  referenceNowMs = Date.now(),
): SocialFeedIndexDocument {
  const sourcePostId = String(post.id || post.sourcePostId || '').trim();
  const rawKind = String(post.recordKind || 'discussion');
  const recordKind: SocialFeedIndexDocument['recordKind'] =
    rawKind === 'question' || rawKind === 'correction' || rawKind === 'research_proposal'
      ? rawKind
      : 'discussion';
  const authorUid = String(post.ownerUserId || post.authorUserId || post.authorUid || 'anon');
  const neighborhoodId = Number(post.neighborhoodId ?? 0);
  const topicId = String(post.topicId || 'general');
  const rawTitle = String(post.titleFa || post.normalizedTitleFa || '').slice(0, 140);
  const normalizedTitleFa = normalizePersianSearchText(rawTitle).slice(0, 140);
  const rawExcerptSource = String(post.bodyFa ?? post.excerptFa ?? '');
  const excerptFa = rawExcerptSource.slice(0, 180);
  const neighborhoodNameFa = String(post.neighborhoodNameFa || '');

  const combinedTextForTokens = `${rawTitle} ${excerptFa} ${neighborhoodNameFa}`;
  const normalizedSearchTokens = extractNormalizedSearchTokens(
    combinedTextForTokens,
    MAX_INDEX_SEARCH_TOKENS,
  );

  const createdAtIso = String(post.createdAtIso || nowIso);
  const updatedAtIso = String(post.updatedAtIso || createdAtIso);
  const helpfulCount = Math.max(0, Number(post.helpfulCount ?? 0));
  const replyCount = Math.max(0, Number(post.replyCount ?? post.answersCount ?? 0));
  const ageHours = Math.max(0, (referenceNowMs - Date.parse(createdAtIso)) / 3_600_000);
  const { score, formulaVersion } = computeSocialFeedScore({
    helpfulCount,
    replyCount,
    ageHours: Number.isFinite(ageHours) ? ageHours : 24,
  });

  return {
    id: sourcePostId,
    sourcePostId,
    recordKind,
    authorUid,
    neighborhoodId,
    topicId,
    titleFa: rawTitle,
    normalizedTitleFa,
    normalizedSearchTokens,
    excerptFa,
    createdAtIso,
    updatedAtIso,
    helpfulCount,
    replyCount,
    visibility: resolveSocialItemVisibility(post),
    moderationStatus: resolveSocialModerationStatus(post),
    feedScore: score,
    formulaVersion,
    projectionVersion: PROJECTION_SCHEMA_VERSION,
    indexedAtIso: nowIso,
  };
}

export function upsertSocialFeedProjectionInTx(
  tx: CommunityTransaction,
  post: Record<string, unknown>,
  nowIso = new Date().toISOString(),
): SocialFeedIndexDocument {
  const doc = buildSocialFeedIndexDocument(post, nowIso);
  tx.set(SOCIAL_COLLECTIONS.feedIndex, doc.id, doc);
  return doc;
}

export function markSocialFeedProjectionHiddenInTx(
  tx: CommunityTransaction,
  postId: string,
  existingPost?: Record<string, unknown> | null,
  nowIso = new Date().toISOString(),
): void {
  if (existingPost) {
    const doc = buildSocialFeedIndexDocument(
      {
        ...existingPost,
        id: postId,
        isDeleted: true,
        status: 'hidden',
        moderationStatus: 'hidden',
        updatedAtIso: nowIso,
      },
      nowIso,
    );
    tx.set(SOCIAL_COLLECTIONS.feedIndex, postId, doc);
    return;
  }
  tx.update(SOCIAL_COLLECTIONS.feedIndex, postId, {
    visibility: 'hidden',
    moderationStatus: 'hidden',
    updatedAtIso: nowIso,
    indexedAtIso: nowIso,
  });
}
