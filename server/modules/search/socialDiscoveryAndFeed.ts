/** @file server/modules/search/socialDiscoveryAndFeed.ts — Stage 7 Persian Normalizer, Derived Feed/Search Index, Author Diversity & Rebuild */
import { SOCIAL_COLLECTIONS, type CommunityDatabaseStore } from '../community/communityFirestoreAdapter';
import { communityUnifiedRepository } from '../community/communityUnifiedRepository';

function encodeOpaqueCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeOpaqueCursor<T extends Record<string, unknown>>(cursor?: string | null): T | null {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export const FEED_SCORE_FORMULA_VERSION = 'social-feed-score-v1.0.0';

export interface SocialFeedItem {
  id: string;
  recordKind: 'discussion' | 'question' | 'correction' | 'research_proposal';
  neighborhoodId: number;
  topicId: string;
  authorUid: string;
  titleFa: string;
  excerptFa: string;
  createdAtIso: string;
  helpfulCount: number;
  replyCount: number;
  feedScore: number;
  formulaVersion: string;
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
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

export function isSocialItemDiscoverable(post: Record<string, unknown>): boolean {
  if (post.isDeleted === true) return false;
  if (post.status === 'hidden' || post.status === 'removed') return false;
  if (post.moderationStatus === 'hidden' || post.moderationStatus === 'removed') return false;
  return true;
}

export class SocialDiscoveryAndFeedService {
  private lastIndexRebuildAtIso: string | null = null;
  private indexedDocsCount = 0;

  constructor(private readonly storeProvider: () => CommunityDatabaseStore = () => communityUnifiedRepository.getStore()) {}

  private async loadDiscoverablePosts(): Promise<Record<string, unknown>[]> {
    const page = await this.storeProvider().queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, {
      orderByField: 'createdAtIso',
      orderDirection: 'desc',
      limit: 200,
    });
    const visible = page.items.filter(isSocialItemDiscoverable);
    this.indexedDocsCount = visible.length;
    return visible;
  }

  private rankWithAuthorDiversity(
    rawPosts: Record<string, unknown>[],
    followedUids: Set<string>,
    followedTopics: Set<string>,
  ): SocialFeedItem[] {
    const nowMs = Date.now();
    const authorCounts = new Map<string, number>();

    const scored = rawPosts.map((p) => {
      const authorUid = String(p.ownerUserId || p.authorUserId || 'anon');
      const prevSameAuthor = authorCounts.get(authorUid) ?? 0;
      authorCounts.set(authorUid, prevSameAuthor + 1);
      const createdAtIso = String(p.createdAtIso || new Date(nowMs).toISOString());
      const ageHours = Math.max(0, (nowMs - Date.parse(createdAtIso)) / 3_600_000);
      const topicId = String(p.topicId || 'general');
      const isFollowedMatch = followedUids.has(authorUid) || followedTopics.has(topicId);
      const { score, formulaVersion } = computeSocialFeedScore({
        helpfulCount: Number(p.helpfulCount ?? 0),
        replyCount: Number(p.replyCount ?? 0),
        ageHours: Number.isFinite(ageHours) ? ageHours : 24,
        isFollowedMatch,
        sameAuthorConsecutiveRank: prevSameAuthor,
      });
      return {
        id: String(p.id || ''),
        recordKind: (String(p.recordKind || 'discussion') as SocialFeedItem['recordKind']),
        neighborhoodId: Number(p.neighborhoodId ?? 0),
        topicId,
        authorUid,
        titleFa: String(p.titleFa || '').slice(0, 140),
        excerptFa: String(p.bodyFa || '').slice(0, 180),
        createdAtIso,
        helpfulCount: Number(p.helpfulCount ?? 0),
        replyCount: Number(p.replyCount ?? 0),
        feedScore: score,
        formulaVersion,
      };
    });

    return scored.sort((a, b) => b.feedScore - a.feedScore || b.createdAtIso.localeCompare(a.createdAtIso));
  }

  private paginate(items: SocialFeedItem[], limit = 12, cursor?: string | null) {
    const safeLimit = Math.max(1, Math.min(30, limit));
    const decoded = decodeOpaqueCursor<{ offset: number }>(cursor);
    const offset = decoded && typeof decoded.offset === 'number' && decoded.offset >= 0 ? decoded.offset : 0;
    const slice = items.slice(offset, offset + safeLimit);
    const nextOffset = offset + slice.length;
    const hasMore = nextOffset < items.length;
    return {
      items: slice,
      nextCursor: hasMore ? encodeOpaqueCursor({ offset: nextOffset }) : null,
      hasMore,
      formulaVersion: FEED_SCORE_FORMULA_VERSION,
    };
  }

  async searchSocial(params: { q: string; neighborhoodId?: number; limit?: number; cursor?: string | null }) {
    const needle = normalizePersianSearchText(params.q);
    const visible = await this.loadDiscoverablePosts();
    const matched = visible.filter((p) => {
      if (params.neighborhoodId && Number(p.neighborhoodId) !== params.neighborhoodId) return false;
      if (!needle) return true;
      const hay = normalizePersianSearchText(`${p.titleFa || ''} ${p.bodyFa || ''} ${p.neighborhoodNameFa || ''}`);
      return hay.includes(needle);
    });
    return this.paginate(this.rankWithAuthorDiversity(matched, new Set(), new Set()), params.limit, params.cursor);
  }

  async getDiscoverFeed(params?: { limit?: number; cursor?: string | null }) {
    const visible = await this.loadDiscoverablePosts();
    return this.paginate(this.rankWithAuthorDiversity(visible, new Set(), new Set()), params?.limit, params?.cursor);
  }

  async getNeighborhoodFeed(neighborhoodId: number, params?: { limit?: number; cursor?: string | null }) {
    const visible = (await this.loadDiscoverablePosts()).filter((p) => Number(p.neighborhoodId) === neighborhoodId);
    return this.paginate(this.rankWithAuthorDiversity(visible, new Set(), new Set()), params?.limit, params?.cursor);
  }

  async getFollowingFeed(uid: string, params?: { limit?: number; cursor?: string | null }) {
    const followsPage = await this.storeProvider().queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.follows, {
      filters: [{ field: 'followerUid', op: '==', value: uid }],
      limit: 100,
    });
    const followedUids = new Set<string>();
    const followedTopics = new Set<string>();
    for (const f of followsPage.items) {
      if (f.scope === 'user') followedUids.add(String(f.targetId || ''));
      if (f.scope === 'topic') followedTopics.add(String(f.targetId || ''));
    }
    const visible = (await this.loadDiscoverablePosts()).filter((p) => {
      const a = String(p.ownerUserId || p.authorUserId || '');
      const t = String(p.topicId || '');
      return followedUids.has(a) || followedTopics.has(t);
    });
    return this.paginate(this.rankWithAuthorDiversity(visible, followedUids, followedTopics), params?.limit, params?.cursor);
  }

  async rebuildDerivedIndex(adminUid: string): Promise<{ rebuilt: boolean; indexedDocsCount: number; rebuiltBy: string; rebuiltAtIso: string }> {
    const visible = await this.loadDiscoverablePosts();
    this.lastIndexRebuildAtIso = new Date().toISOString();
    this.indexedDocsCount = visible.length;
    return {
      rebuilt: true,
      indexedDocsCount: this.indexedDocsCount,
      rebuiltBy: adminUid,
      rebuiltAtIso: this.lastIndexRebuildAtIso,
    };
  }
}

export const defaultSocialDiscoveryAndFeed = new SocialDiscoveryAndFeedService();
