/** @file server/modules/search/socialDiscoveryAndFeed.ts — RT-SOCIAL-IMPL-007 Scalable Social Discovery, Derived Feed Index & Paged Rebuild */
import crypto from 'node:crypto';
import {
  CommunityHttpError,
  MAX_COMMUNITY_QUERY_LIMIT,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
  type CommunityQueryFilter,
} from '../community/communityFirestoreAdapter';
import { communityUnifiedRepository } from '../community/communityUnifiedRepository';
import {
  FEED_INDEX_ORDER_BY,
  clampFeedLimit,
  compareFeedIndexOrder,
  computeQueryFingerprint,
  encodeSocialFeedCursor,
  isStrictlyAfterCursor,
  toSocialFeedItem,
  validateAndDecodeSocialFeedCursor,
  type SocialFeedCursor,
  type SocialFeedItem,
} from './socialFeedCursor';
import {
  rebuildSocialFeedIndexOp,
  type RebuildDerivedIndexResult,
} from './socialFeedIndexRebuilder';
import {
  FEED_SCORE_FORMULA_VERSION,
  MAX_QUERY_SEARCH_TOKENS,
  MAX_SEARCH_QUERY_LENGTH,
  buildSocialFeedIndexDocument,
  computeSocialFeedScore,
  extractNormalizedSearchTokens,
  isSocialItemDiscoverable,
  normalizePersianSearchText,
  type SocialFeedIndexDocument,
} from './socialFeedProjection';

export {
  DEFAULT_FEED_PAGE_LIMIT,
  MAX_CURSOR_LENGTH,
  MAX_FEED_PAGE_LIMIT,
  clampFeedLimit,
  computeQueryFingerprint,
  encodeSocialFeedCursor,
  validateAndDecodeSocialFeedCursor,
  type SocialFeedCursor,
  type SocialFeedItem,
} from './socialFeedCursor';
export type { RebuildDerivedIndexResult } from './socialFeedIndexRebuilder';
export {
  FEED_SCORE_FORMULA_VERSION,
  computeSocialFeedScore,
  extractNormalizedSearchTokens,
  isSocialItemDiscoverable,
  normalizePersianSearchText,
};

export class SocialDiscoveryAndFeedService {
  constructor(
    private readonly storeProvider: () => CommunityDatabaseStore = () =>
      communityUnifiedRepository.getStore(),
  ) {}

  private async ensureIndexBootstrappedIfEmpty(): Promise<void> {
    const store = this.storeProvider();
    const indexProbe = await store.queryDocs<SocialFeedIndexDocument>(SOCIAL_COLLECTIONS.feedIndex, {
      limit: 1,
    });
    if (indexProbe.items.length > 0) return;

    const postsProbe = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, {
      limit: 1,
    });
    if (postsProbe.items.length === 0) return;

    let cursorDocId: string | null = null;
    const nowIso = new Date().toISOString();
    do {
      const page = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, {
        orderBy: [{ field: 'createdAtIso', direction: 'desc' }, { field: 'id', direction: 'asc' }],
        limit: MAX_COMMUNITY_QUERY_LIMIT,
        cursorDocId,
      });
      for (const post of page.items) {
        const proj = buildSocialFeedIndexDocument(post, nowIso);
        await store.setDoc(SOCIAL_COLLECTIONS.feedIndex, proj.id, proj);
      }
      cursorDocId = page.nextCursor;
    } while (cursorDocId);
  }

  private async scanIndexWithFilters(params: {
    filters: CommunityQueryFilter[];
    cursor: SocialFeedCursor | null;
    limit: number;
    postFilter?: (doc: SocialFeedIndexDocument) => boolean;
  }): Promise<{ matched: SocialFeedIndexDocument[]; hasMore: boolean }> {
    const store = this.storeProvider();
    const targetCount = params.limit + 1;
    const collected: SocialFeedIndexDocument[] = [];
    let storeCursorDocId: string | null = null;

    if (params.cursor) {
      const anchorDoc = await store.getDoc<SocialFeedIndexDocument>(
        SOCIAL_COLLECTIONS.feedIndex,
        params.cursor.lastDocumentId,
      );
      if (
        anchorDoc &&
        anchorDoc.visibility === 'discoverable' &&
        anchorDoc.feedScore === params.cursor.lastFeedScore &&
        anchorDoc.createdAtIso === params.cursor.lastCreatedAtIso
      ) {
        storeCursorDocId = anchorDoc.id;
      }
    }

    do {
      const page = await store.queryDocs<SocialFeedIndexDocument>(SOCIAL_COLLECTIONS.feedIndex, {
        filters: params.filters,
        orderBy: FEED_INDEX_ORDER_BY,
        limit: MAX_COMMUNITY_QUERY_LIMIT,
        cursorDocId: storeCursorDocId,
      });

      for (const doc of page.items) {
        if (!isStrictlyAfterCursor(doc, params.cursor)) continue;
        if (params.postFilter && !params.postFilter(doc)) continue;
        collected.push(doc);
        if (collected.length >= targetCount) {
          return {
            matched: collected.slice(0, params.limit),
            hasMore: true,
          };
        }
      }
      storeCursorDocId = page.nextCursor;
    } while (storeCursorDocId);

    return {
      matched: collected.slice(0, params.limit),
      hasMore: collected.length > params.limit,
    };
  }

  private formatFeedResponse(params: {
    docs: SocialFeedIndexDocument[];
    hasMore: boolean;
    queryFingerprint: string;
    followSetVersion?: string;
  }) {
    const lastDoc = params.docs.length > 0 ? params.docs[params.docs.length - 1] : null;
    const nextCursor =
      params.hasMore && lastDoc
        ? encodeSocialFeedCursor({
            version: 1,
            lastDocumentId: lastDoc.id,
            lastCreatedAtIso: lastDoc.createdAtIso,
            lastFeedScore: lastDoc.feedScore,
            queryFingerprint: params.queryFingerprint,
            formulaVersion: FEED_SCORE_FORMULA_VERSION,
            ...(params.followSetVersion !== undefined
              ? { followSetVersion: params.followSetVersion }
              : {}),
            issuedAtIso: new Date().toISOString(),
          })
        : null;

    return {
      items: params.docs.map(toSocialFeedItem),
      nextCursor,
      hasMore: params.hasMore,
      formulaVersion: FEED_SCORE_FORMULA_VERSION,
    };
  }

  async searchSocial(params: {
    q: string;
    neighborhoodId?: number;
    limit?: number;
    cursor?: string | null;
  }) {
    const rawQ = String(params.q ?? '').trim();
    if (rawQ.length > MAX_SEARCH_QUERY_LENGTH) {
      throw new CommunityHttpError(
        400,
        'SEARCH_QUERY_TOO_LONG',
        `عبارت جست‌وجو نباید بیش از ${MAX_SEARCH_QUERY_LENGTH} کاراکتر باشد.`,
      );
    }
    const queryTokens = extractNormalizedSearchTokens(rawQ, MAX_QUERY_SEARCH_TOKENS + 5);
    if (queryTokens.length > MAX_QUERY_SEARCH_TOKENS) {
      throw new CommunityHttpError(
        400,
        'SEARCH_QUERY_TOO_LONG',
        `تعداد واژه‌های جست‌وجو نباید بیش از ${MAX_QUERY_SEARCH_TOKENS} واژه باشد.`,
      );
    }
    if (
      params.neighborhoodId !== undefined &&
      (!Number.isInteger(params.neighborhoodId) || params.neighborhoodId < 1)
    ) {
      throw new CommunityHttpError(400, 'INVALID_NEIGHBORHOOD_ID', 'شناسه محله نامعتبر است.');
    }

    const safeLimit = clampFeedLimit(params.limit);
    const needle = normalizePersianSearchText(rawQ);
    const queryFingerprint = computeQueryFingerprint(
      `search:q=${needle}:hood=${params.neighborhoodId ?? 'all'}`,
    );
    const decodedCursor = validateAndDecodeSocialFeedCursor(params.cursor, { queryFingerprint });

    await this.ensureIndexBootstrappedIfEmpty();

    const filters: CommunityQueryFilter[] = [
      { field: 'visibility', op: '==', value: 'discoverable' },
    ];
    if (params.neighborhoodId !== undefined) {
      filters.push({ field: 'neighborhoodId', op: '==', value: params.neighborhoodId });
    }
    if (queryTokens.length > 0) {
      const primaryToken = [...queryTokens].sort((a, b) => b.length - a.length)[0];
      filters.push({
        field: 'normalizedSearchTokens',
        op: 'array-contains',
        value: primaryToken,
      });
    }

    const { matched, hasMore } = await this.scanIndexWithFilters({
      filters,
      cursor: decodedCursor,
      limit: safeLimit,
      postFilter: (doc) => {
        if (!needle) return true;
        const docTokens = Array.isArray(doc.normalizedSearchTokens)
          ? doc.normalizedSearchTokens
          : [];
        const hay = `${doc.normalizedTitleFa || ''} ${normalizePersianSearchText(doc.excerptFa || '')} ${docTokens.join(' ')}`.trim();
        if (hay.includes(needle)) return true;
        return queryTokens.length > 0 && queryTokens.every((t) => docTokens.includes(t) || hay.includes(t));
      },
    });

    return this.formatFeedResponse({
      docs: matched,
      hasMore,
      queryFingerprint,
    });
  }

  async getDiscoverFeed(params?: { limit?: number; cursor?: string | null }) {
    const safeLimit = clampFeedLimit(params?.limit);
    const queryFingerprint = computeQueryFingerprint('feed:discover');
    const decodedCursor = validateAndDecodeSocialFeedCursor(params?.cursor, { queryFingerprint });

    await this.ensureIndexBootstrappedIfEmpty();

    const { matched, hasMore } = await this.scanIndexWithFilters({
      filters: [{ field: 'visibility', op: '==', value: 'discoverable' }],
      cursor: decodedCursor,
      limit: safeLimit,
    });

    return this.formatFeedResponse({
      docs: matched,
      hasMore,
      queryFingerprint,
    });
  }

  async getNeighborhoodFeed(
    neighborhoodId: number,
    params?: { limit?: number; cursor?: string | null },
  ) {
    if (!Number.isInteger(neighborhoodId) || neighborhoodId < 1) {
      throw new CommunityHttpError(400, 'INVALID_NEIGHBORHOOD_ID', 'شناسه محله نامعتبر است.');
    }
    const safeLimit = clampFeedLimit(params?.limit);
    const queryFingerprint = computeQueryFingerprint(`feed:neighborhood:${neighborhoodId}`);
    const decodedCursor = validateAndDecodeSocialFeedCursor(params?.cursor, { queryFingerprint });

    await this.ensureIndexBootstrappedIfEmpty();

    const { matched, hasMore } = await this.scanIndexWithFilters({
      filters: [
        { field: 'visibility', op: '==', value: 'discoverable' },
        { field: 'neighborhoodId', op: '==', value: neighborhoodId },
      ],
      cursor: decodedCursor,
      limit: safeLimit,
    });

    return this.formatFeedResponse({
      docs: matched,
      hasMore,
      queryFingerprint,
    });
  }

  private async loadAllUserFollows(uid: string): Promise<{
    followedUids: string[];
    followedTopics: string[];
    followedPosts: string[];
    followSetVersion: string;
  }> {
    const store = this.storeProvider();
    const userSet = new Set<string>();
    const topicSet = new Set<string>();
    const postSet = new Set<string>();
    let cursorDocId: string | null = null;

    do {
      const page = await store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.follows, {
        filters: [{ field: 'followerUid', op: '==', value: uid }],
        orderBy: [{ field: 'id', direction: 'asc' }],
        limit: MAX_COMMUNITY_QUERY_LIMIT,
        cursorDocId,
      });
      for (const f of page.items) {
        const targetId = String(f.targetId || '').trim();
        if (!targetId) continue;
        if (f.scope === 'user') userSet.add(targetId);
        else if (f.scope === 'topic') topicSet.add(targetId);
        else if (f.scope === 'post') postSet.add(targetId);
      }
      cursorDocId = page.nextCursor;
    } while (cursorDocId);

    const followedUids = Array.from(userSet).sort();
    const followedTopics = Array.from(topicSet).sort();
    const followedPosts = Array.from(postSet).sort();
    const canonicalFollowDigest = [
      ...followedUids.map((id) => `u:${id}`),
      ...followedTopics.map((id) => `t:${id}`),
      ...followedPosts.map((id) => `p:${id}`),
    ].join('|');
    const followSetVersion = crypto
      .createHash('sha256')
      .update(canonicalFollowDigest, 'utf8')
      .digest('hex')
      .slice(0, 16);

    return { followedUids, followedTopics, followedPosts, followSetVersion };
  }

  private async queryIndexChunksByInField(
    field: 'authorUid' | 'topicId' | 'sourcePostId',
    values: string[],
  ): Promise<SocialFeedIndexDocument[]> {
    if (values.length === 0) return [];
    const store = this.storeProvider();
    const chunkSize = 30;
    const results: SocialFeedIndexDocument[] = [];

    for (let i = 0; i < values.length; i += chunkSize) {
      const chunk = values.slice(i, i + chunkSize);
      let cursorDocId: string | null = null;
      do {
        const page = await store.queryDocs<SocialFeedIndexDocument>(SOCIAL_COLLECTIONS.feedIndex, {
          filters: [
            { field: 'visibility', op: '==', value: 'discoverable' },
            { field, op: 'in', value: chunk },
          ],
          orderBy: FEED_INDEX_ORDER_BY,
          limit: MAX_COMMUNITY_QUERY_LIMIT,
          cursorDocId,
        });
        results.push(...page.items);
        cursorDocId = page.nextCursor;
      } while (cursorDocId);
    }
    return results;
  }

  async getFollowingFeed(uid: string, params?: { limit?: number; cursor?: string | null }) {
    if (!uid || !uid.trim()) {
      throw new CommunityHttpError(401, 'UNAUTHORIZED', 'احراز هویت برای مشاهده فید دنبال‌شونده‌ها الزامی است.');
    }
    const safeLimit = clampFeedLimit(params?.limit);
    const { followedUids, followedTopics, followedPosts, followSetVersion } =
      await this.loadAllUserFollows(uid);
    const queryFingerprint = computeQueryFingerprint(`feed:following:uid=${uid}`);
    const decodedCursor = validateAndDecodeSocialFeedCursor(params?.cursor, {
      queryFingerprint,
      followSetVersion,
    });

    if (
      followedUids.length === 0 &&
      followedTopics.length === 0 &&
      followedPosts.length === 0
    ) {
      return {
        items: [] as SocialFeedItem[],
        nextCursor: null,
        hasMore: false,
        formulaVersion: FEED_SCORE_FORMULA_VERSION,
      };
    }

    await this.ensureIndexBootstrappedIfEmpty();

    const [byAuthor, byTopic, byPost] = await Promise.all([
      this.queryIndexChunksByInField('authorUid', followedUids),
      this.queryIndexChunksByInField('topicId', followedTopics),
      this.queryIndexChunksByInField('sourcePostId', followedPosts),
    ]);

    const dedupedMap = new Map<string, SocialFeedIndexDocument>();
    for (const doc of [...byAuthor, ...byTopic, ...byPost]) {
      if (doc.visibility !== 'discoverable') continue;
      if (!dedupedMap.has(doc.id)) {
        dedupedMap.set(doc.id, doc);
      }
    }

    const sorted = Array.from(dedupedMap.values())
      .sort(compareFeedIndexOrder)
      .filter((doc) => isStrictlyAfterCursor(doc, decodedCursor));

    const slice = sorted.slice(0, safeLimit);
    const hasMore = sorted.length > safeLimit;

    return this.formatFeedResponse({
      docs: slice,
      hasMore,
      queryFingerprint,
      followSetVersion,
    });
  }

  async rebuildDerivedIndex(
    adminUid: string,
    options?: {
      batchSize?: number;
      resumeJobId?: string;
      maxPages?: number;
    },
  ): Promise<RebuildDerivedIndexResult> {
    return rebuildSocialFeedIndexOp(this.storeProvider(), adminUid, options);
  }
}

export const defaultSocialDiscoveryAndFeed = new SocialDiscoveryAndFeedService();
