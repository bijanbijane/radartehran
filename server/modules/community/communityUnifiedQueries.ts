/** @file server/modules/community/communityUnifiedQueries.ts — Bounded Firestore Queries, Cursor Pagination & Legacy DTO Compatibility (Stage 3) */
import { COMMUNITY_TOPICS_REGISTRY } from '../../../src/features/community/data/communityTopicsAndSeeds';
import { computeDiscussionMultiFactorRank } from '../../../src/features/community/services/communityTrustService';
import type {
  CommunityAbuseReport,
  CommunityDiscussionPost,
  CommunityProfile,
  CommunityQuestionItem,
  CommunityTopicNode,
  DataCorrectionProposal,
  ModerationActionRecord,
  ModerationAppeal,
  ResearchTopicProposal,
} from '../../../src/features/community/types/community.types';
import { sanitizeInput } from '../../../src/utils/security';
import {
  SOCIAL_COLLECTIONS,
  clampCommunityLimit,
  type CommunityDatabaseStore,
} from './communityFirestoreAdapter';
import { stripSensitiveMemberProfileServerSide } from './communityValidation';

export type SocialPostRecordKind = 'discussion' | 'question' | 'correction' | 'research_proposal';

export interface UnifiedSocialPostDoc extends Record<string, unknown> {
  id: string;
  recordKind: SocialPostRecordKind;
  ownerUserId: string;
  neighborhoodId?: number;
  topicId?: string;
  status: string;
  moderationStatus?: string;
  isDeleted?: boolean;
  deletedAtIso?: string | null;
  source?: 'seed' | 'user';
  isSeed?: boolean;
  createdAtIso: string;
  updatedAtIso?: string;
  replyCount?: number;
  followerCount?: number;
  helpfulCount?: number;
  version?: number;
}

export interface UnifiedPaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  backendKind: 'firestore' | 'mock_firestore';
}

export function isCommunitySeedRecord(item: { id?: string; source?: string; isSeed?: boolean }): boolean {
  if (item.source === 'user' || item.isSeed === false) return false;
  if (item.source === 'seed' || item.isSeed === true) return true;
  return Boolean(item.id && (item.id.includes('-seed-') || item.id.startsWith('seed-') || item.id.startsWith('user_resident_') || item.id.startsWith('user_expert_')));
}

export async function queryCommunityPostsPaginated<T extends UnifiedSocialPostDoc>(
  store: CommunityDatabaseStore,
  params: {
    recordKind: SocialPostRecordKind;
    neighborhoodId?: number | null;
    topicId?: string;
    statusFilter?: string;
    includeSeeds?: boolean;
    sort?: 'rank' | 'recent' | 'helpful';
    limit?: unknown;
    cursor?: string | null;
    excludeHidden?: boolean;
  },
): Promise<UnifiedPaginatedResult<T>> {
  const limit = clampCommunityLimit(params.limit);
  const filters: Array<{ field: string; op: '==' | '!='; value: unknown }> = [
    { field: 'recordKind', op: '==', value: params.recordKind },
  ];
  if (params.neighborhoodId && Number.isFinite(params.neighborhoodId)) {
    filters.push({ field: 'neighborhoodId', op: '==', value: params.neighborhoodId });
  }
  if (params.topicId && params.topicId !== 'all') {
    filters.push({ field: 'topicId', op: '==', value: params.topicId });
  }

  // Fetch bounded batch (max 50) from Firestore, apply visibility & optional seed filter cleanly
  const page = await store.queryDocs<T>(SOCIAL_COLLECTIONS.posts, {
    filters,
    orderByField: 'createdAtIso',
    orderDirection: 'desc',
    limit,
    cursorDocId: params.cursor ?? null,
  });

  let filtered = page.items.filter((doc) => {
    if (doc.isDeleted === true || doc.moderationStatus === 'removed') return false;
    if (params.excludeHidden !== false && doc.status === 'hidden') return false;
    if (params.includeSeeds === false && isCommunitySeedRecord(doc)) return false;
    if (params.statusFilter && params.statusFilter !== 'all' && doc.status !== params.statusFilter) return false;
    return true;
  });

  if (params.recordKind === 'discussion') {
    if (params.sort === 'helpful') {
      filtered = [...filtered].sort((a, b) => Number(b.helpfulCount ?? 0) - Number(a.helpfulCount ?? 0));
    } else if (params.sort !== 'recent' && params.neighborhoodId) {
      filtered = [...filtered].sort((a, b) =>
        computeDiscussionMultiFactorRank(b as unknown as CommunityDiscussionPost, params.neighborhoodId!) -
        computeDiscussionMultiFactorRank(a as unknown as CommunityDiscussionPost, params.neighborhoodId!),
      );
    }
  }

  return {
    items: filtered,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    limit,
    backendKind: store.backendKind,
  };
}

export async function listCommunityTopicsFromStore(
  store: CommunityDatabaseStore,
  viewerUid?: string,
): Promise<Array<CommunityTopicNode & { isFollowedByMe?: boolean }>> {
  const followsPage = await store.queryDocs<{ scope?: string; targetId?: string; followerUid?: string }>(
    SOCIAL_COLLECTIONS.follows,
    {
      filters: [{ field: 'scope', op: '==', value: 'topic' }],
      limit: 50,
    },
  );
  const followersByTopic = new Map<string, Set<string>>();
  for (const f of followsPage.items) {
    if (!f.targetId || !f.followerUid) continue;
    let set = followersByTopic.get(f.targetId);
    if (!set) {
      set = new Set();
      followersByTopic.set(f.targetId, set);
    }
    set.add(f.followerUid);
  }

  return COMMUNITY_TOPICS_REGISTRY.map((topic) => {
    const followers = followersByTopic.get(topic.id);
    const dynamicCount = followers?.size ?? 0;
    const baseCount = topic.followerCount ?? topic.followersCount;
    return {
      ...topic,
      followersCount: baseCount + dynamicCount,
      followerCount: baseCount + dynamicCount,
      isFollowedByMe: Boolean(viewerUid && followers?.has(viewerUid)),
    };
  });
}

export async function queryCommunityOverview(
  store: CommunityDatabaseStore,
  viewerUid?: string,
) {
  const [topics, discPage, qPage, corrPage] = await Promise.all([
    listCommunityTopicsFromStore(store, viewerUid),
    queryCommunityPostsPaginated<CommunityDiscussionPost & UnifiedSocialPostDoc>(store, {
      recordKind: 'discussion',
      limit: 6,
      excludeHidden: true,
    }),
    queryCommunityPostsPaginated<CommunityQuestionItem & UnifiedSocialPostDoc>(store, {
      recordKind: 'question',
      limit: 6,
      excludeHidden: true,
    }),
    queryCommunityPostsPaginated<DataCorrectionProposal & UnifiedSocialPostDoc>(store, {
      recordKind: 'correction',
      limit: 20,
      excludeHidden: false,
    }),
  ]);

  return {
    topics,
    featuredDiscussions: discPage.items,
    recentQuestions: qPage.items,
    pendingCorrectionsCount: corrPage.items.filter((c) => !['applied', 'rejected', 'withdrawn'].includes(c.status)).length,
    backendKind: store.backendKind,
  };
}

export async function queryCommunityMembersPaginated(
  store: CommunityDatabaseStore,
  params: { q?: string; includeSeeds?: boolean; limit?: unknown; cursor?: string | null; isViewerMember: boolean; viewerUid?: string },
): Promise<UnifiedPaginatedResult<CommunityProfile> & { total: number }> {
  const limit = clampCommunityLimit(params.limit ?? 12);
  const qLower = typeof params.q === 'string' ? sanitizeInput(params.q, 50).toLowerCase() : '';
  const page = await store.queryDocs<CommunityProfile & Record<string, unknown>>(SOCIAL_COLLECTIONS.profiles, {
    limit: 50,
    orderByField: 'userId',
    orderDirection: 'asc',
    cursorDocId: params.cursor ?? null,
  });

  const filtered = page.items
    .filter((p) => (params.includeSeeds !== false || !isCommunitySeedRecord(p))
      && (!qLower || String(p.displayNameFa || '').toLowerCase().includes(qLower)
        || String(p.username || '').toLowerCase().includes(qLower)
        || String(p.bioFa || '').toLowerCase().includes(qLower)))
    .map((p) => stripSensitiveMemberProfileServerSide(p, params.isViewerMember, params.viewerUid === p.userId))
    .filter((p): p is CommunityProfile => p !== null);

  return {
    items: filtered.slice(0, limit),
    total: filtered.length,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    limit,
    backendKind: store.backendKind,
  };
}

export async function queryModerationQueueFromStore(store: CommunityDatabaseStore) {
  const [corrPage, reportsPage] = await Promise.all([
    queryCommunityPostsPaginated<DataCorrectionProposal & UnifiedSocialPostDoc>(store, {
      recordKind: 'correction',
      limit: 50,
      excludeHidden: false,
    }),
    store.queryDocs<Record<string, unknown>>(SOCIAL_COLLECTIONS.reports, {
      orderByField: 'createdAtIso',
      orderDirection: 'desc',
      limit: 50,
    }),
  ]);

  const reports: CommunityAbuseReport[] = [];
  const actions: ModerationActionRecord[] = [];
  const appeals: ModerationAppeal[] = [];

  for (const row of reportsPage.items) {
    const kind = row.recordKind;
    if (kind === 'moderation_action') actions.push(row as unknown as ModerationActionRecord);
    else if (kind === 'appeal') appeals.push(row as unknown as ModerationAppeal);
    else reports.push(row as unknown as CommunityAbuseReport);
  }

  return {
    corrections: corrPage.items,
    reports,
    actions,
    appeals,
    backendKind: store.backendKind,
  };
}

export type ResearchProposalDoc = ResearchTopicProposal & UnifiedSocialPostDoc;
