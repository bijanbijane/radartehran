/** @file src/features/community/services/communityApiClient.ts — Stage 4b Canonical v1 Community API Client (Zero Spoofable Headers, Idempotency-Key & Cursor Pagination) */
import type { User } from 'firebase/auth';
import { COMMUNITY_AUTH_REQUIRED_FA } from './communityTrustService';
import type {
  CommunityAbuseReason,
  CommunityAbuseReport,
  CommunityAnswerItem,
  CommunityDiscussionPost,
  CommunityProfile,
  CommunityQuestionItem,
  CommunityTopicNode,
  DataCorrectionCategory,
  DataCorrectionProposal,
  ModerationActionRecord,
  ModerationAppeal,
  PrivacySettings,
  ProfileContributionItem,
  ProfileContributionKind,
  ProfileContributionPage,
  ReactionCounts,
  ReactionType,
  ResearchTopicProposal,
  SocialContentContext,
  SocialEntityType,
} from '../types/community.types';

export interface CommunityApiCallResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  nextCursor?: string | null;
  hasMore?: boolean;
  errorFa?: string;
}

export function createCommunityIdempotencyKey(prefix = 'comm'): string {
  const rand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`.slice(0, 72);
}

async function buildProtectedHeaders(currentUser: User | null | undefined): Promise<{
  ok: boolean;
  headers: Record<string, string>;
  errorFa?: string;
}> {
  if (!currentUser || !currentUser.uid || typeof currentUser.getIdToken !== 'function') {
    return { ok: false, headers: {}, errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  }
  try {
    const token = await currentUser.getIdToken();
    if (!token) return { ok: false, headers: {}, errorFa: COMMUNITY_AUTH_REQUIRED_FA };
    return { ok: true, headers: { Authorization: `Bearer ${token}` } };
  } catch {
    return { ok: false, headers: {}, errorFa: 'نشست کاربری معتبر نیست؛ لطفاً مجدداً وارد حساب خود شوید.' };
  }
}

export const COMMUNITY_PERMISSION_DENIED_FA =
  'شما مجوز انجام این عملیات یا دسترسی به این بخش را ندارید.';
export const COMMUNITY_NETWORK_ERROR_FA =
  'خطای شبکه در ارتباط با سرور جامعه کاربران؛ اتصال اینترنت خود را بررسی کرده و دوباره تلاش کنید.';

export function mapCommunityErrorFa(status: number, code?: string, serverMsg?: string): string {
  if (status === 401) return COMMUNITY_AUTH_REQUIRED_FA;
  if (status === 403) {
    if (code === 'OWNER_MISMATCH' || code === 'ONLY_ASKER_CAN_SELECT') {
      return 'شما مالک این محتوا نیستید و مجوز ویرایش یا تغییر آن را ندارید.';
    }
    return serverMsg || COMMUNITY_PERMISSION_DENIED_FA;
  }
  if (status === 0) return COMMUNITY_NETWORK_ERROR_FA;
  if (status === 404) return serverMsg || 'رکورد موردنظر در سرور جامعه یافت نشد.';
  if (status === 409) {
    if (code === 'ALREADY_APPLIED') return 'این پیشنهاد قبلاً تأیید یا اعمال شده و امکان انصراف وجود ندارد.';
    if (code === 'DISCUSSION_LOCKED') return 'این گفت‌وگو قفل یا آرشیو شده و امکان ثبت پاسخ جدید وجود ندارد.';
    if (code === 'QUESTION_CLOSED') return 'این پرسش بسته شده و امکان ثبت پاسخ جدید وجود ندارد.';
    if (code === 'SEPARATION_OF_DUTIES_VIOLATION') return 'بررسی‌کننده اعتراض نباید همان ناظر صادرکننده تصمیم اولیه باشد.';
    return serverMsg || 'این عملیات با وضعیت فعلی رکورد در تعارض است.';
  }
  if (status === 422) return serverMsg || 'متن واردشده کوتاه یا حاوی الگوی غیرمجاز (تبلیغات/شماره تماس) است.';
  if (status === 429) return 'تعداد درخواست‌ها بیش از حد مجاز است؛ لطفاً چند لحظه صبر کنید.';
  return serverMsg || 'خطا در ارتباط با سرور جامعه کاربران؛ لطفاً دوباره تلاش کنید.';
}

async function fetchJsonSafe<T>(
  url: string,
  init: RequestInit,
  extract: (body: Record<string, unknown>) => T,
): Promise<CommunityApiCallResult<T>> {
  try {
    const res = await fetch(url, init);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        errorFa: mapCommunityErrorFa(res.status, String(body.code || ''), String(body.messageFa || body.message || '')),
      };
    }
    return {
      ok: true,
      status: res.status,
      data: extract(body),
      nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
      hasMore: Boolean(body.hasMore),
    };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { ok: false, status: 0, errorFa: 'ABORTED' };
    return { ok: false, status: 503, errorFa: COMMUNITY_NETWORK_ERROR_FA };
  }
}

export const getCommunityOverview = (signal?: AbortSignal) =>
  fetchJsonSafe<{
    topics: CommunityTopicNode[];
    featuredDiscussions: CommunityDiscussionPost[];
    recentQuestions: CommunityQuestionItem[];
    pendingCorrectionsCount: number;
  }>('/api/v1/community/overview', { headers: { Accept: 'application/json' }, signal }, (b) => ({
    topics: (b.topics as CommunityTopicNode[]) || [],
    featuredDiscussions: (b.featuredDiscussions as CommunityDiscussionPost[]) || [],
    recentQuestions: (b.recentQuestions as CommunityQuestionItem[]) || [],
    pendingCorrectionsCount: Number(b.pendingCorrectionsCount ?? 0),
  }));

export async function getCommunityTopics(currentUser?: User | null, signal?: AbortSignal) {
  const auth = currentUser ? await buildProtectedHeaders(currentUser) : { ok: false, headers: {} };
  return fetchJsonSafe<Array<CommunityTopicNode & { isFollowedByMe?: boolean }>>(
    '/api/v1/community/topics',
    { headers: { Accept: 'application/json', ...(auth.ok ? auth.headers : {}) }, signal },
    (b) => (Array.isArray(b.topics) ? (b.topics as Array<CommunityTopicNode & { isFollowedByMe?: boolean }>) : []),
  );
}

export function getCommunityDiscussions(params?: {
  neighborhoodId?: number | null;
  topicId?: string;
  entityType?: SocialEntityType;
  entityId?: string;
  sort?: 'rank' | 'recent' | 'helpful';
  includeSeeds?: boolean;
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
}) {
  const qs = new URLSearchParams();
  if (params?.neighborhoodId) qs.set('neighborhoodId', String(params.neighborhoodId));
  if (params?.topicId && params.topicId !== 'all') qs.set('topicId', params.topicId);
  if (params?.entityType) qs.set('entityType', params.entityType);
  if (params?.entityId) qs.set('entityId', params.entityId);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.includeSeeds === false) qs.set('includeSeeds', 'false');
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  return fetchJsonSafe<CommunityDiscussionPost[]>(
    `/api/v1/community/posts?${qs.toString()}`,
    { headers: { Accept: 'application/json' }, signal: params?.signal },
    (b) => (Array.isArray(b.items) ? (b.items as CommunityDiscussionPost[]) : []),
  );
}

export function getCommunityQuestions(params?: {
  neighborhoodId?: number | null;
  topicId?: string;
  entityType?: SocialEntityType;
  entityId?: string;
  status?: string;
  includeSeeds?: boolean;
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
}) {
  const qs = new URLSearchParams();
  if (params?.neighborhoodId) qs.set('neighborhoodId', String(params.neighborhoodId));
  if (params?.topicId && params.topicId !== 'all') qs.set('topicId', params.topicId);
  if (params?.entityType) qs.set('entityType', params.entityType);
  if (params?.entityId) qs.set('entityId', params.entityId);
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  if (params?.includeSeeds === false) qs.set('includeSeeds', 'false');
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  return fetchJsonSafe<CommunityQuestionItem[]>(
    `/api/v1/community/questions?${qs.toString()}`,
    { headers: { Accept: 'application/json' }, signal: params?.signal },
    (b) => (Array.isArray(b.items) ? (b.items as CommunityQuestionItem[]) : []),
  );
}

export function getCommunityCorrections(params?: {
  neighborhoodId?: number | null;
  entityType?: SocialEntityType;
  entityId?: string;
  includeSeeds?: boolean;
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
}) {
  const qs = new URLSearchParams();
  if (params?.neighborhoodId) qs.set('neighborhoodId', String(params.neighborhoodId));
  if (params?.entityType) qs.set('entityType', params.entityType);
  if (params?.entityId) qs.set('entityId', params.entityId);
  if (params?.includeSeeds === false) qs.set('includeSeeds', 'false');
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  return fetchJsonSafe<DataCorrectionProposal[]>(
    `/api/v1/community/contributions?${qs.toString()}`,
    { headers: { Accept: 'application/json' }, signal: params?.signal },
    (b) => (Array.isArray(b.items) ? (b.items as DataCorrectionProposal[]) : []),
  );
}

export function getCommunityResearchProposals(params?: {
  entityType?: SocialEntityType;
  entityId?: string;
  includeSeeds?: boolean;
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
}) {
  const qs = new URLSearchParams();
  if (params?.entityType) qs.set('entityType', params.entityType);
  if (params?.entityId) qs.set('entityId', params.entityId);
  if (params?.includeSeeds === false) qs.set('includeSeeds', 'false');
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  return fetchJsonSafe<ResearchTopicProposal[]>(
    `/api/v1/community/research-proposals?${qs.toString()}`,
    { headers: { Accept: 'application/json' }, signal: params?.signal },
    (b) => (Array.isArray(b.items) ? (b.items as ResearchTopicProposal[]) : []),
  );
}

export async function getCommunityMembers(params?: {
  cursor?: string | null;
  limit?: number;
  q?: string;
  includeSeeds?: boolean;
  currentUser?: User | null;
  signal?: AbortSignal;
}) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.q) qs.set('q', params.q);
  if (params?.includeSeeds === false) qs.set('includeSeeds', 'false');
  const auth = params?.currentUser ? await buildProtectedHeaders(params.currentUser) : { ok: false, headers: {} };
  return fetchJsonSafe<{ items: CommunityProfile[]; total: number; limit: number }>(
    `/api/v1/community/profiles?${qs.toString()}`,
    { headers: { Accept: 'application/json', ...(auth.ok ? auth.headers : {}) }, signal: params?.signal },
    (b) => ({
      items: Array.isArray(b.items) ? (b.items as CommunityProfile[]) : [],
      total: Number(b.total ?? 0),
      limit: Number(b.limit ?? 12),
    }),
  );
}

export async function getCommunityMember(username: string, options?: { currentUser?: User | null; signal?: AbortSignal }) {
  const auth = options?.currentUser ? await buildProtectedHeaders(options.currentUser) : { ok: false, headers: {} };
  return fetchJsonSafe<CommunityProfile>(
    `/api/v1/community/profiles/${encodeURIComponent(username)}`,
    { headers: { Accept: 'application/json', ...(auth.ok ? auth.headers : {}) }, signal: options?.signal },
    (b) => b.profile as CommunityProfile,
  );
}

export async function getMyCommunityActivity(currentUser: User | null | undefined, signal?: AbortSignal) {
  const auth = await buildProtectedHeaders(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa } as CommunityApiCallResult<{
    myProfile: CommunityProfile | null;
    myContributions: DataCorrectionProposal[];
    myReportsCount: number;
    myAppeals: ModerationAppeal[];
  }>;
  return fetchJsonSafe(
    '/api/account/community',
    { headers: { Accept: 'application/json', ...auth.headers }, signal },
    (b) => ({
      myProfile: (b.myProfile as CommunityProfile) || null,
      myContributions: (b.myContributions as DataCorrectionProposal[]) || [],
      myReportsCount: Number(b.myReportsCount ?? 0),
      myAppeals: (b.myAppeals as ModerationAppeal[]) || [],
    }),
  );
}

async function postProtectedJson<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  payload: Record<string, unknown>,
  currentUser: User | null | undefined,
  extract: (body: Record<string, unknown>) => T,
  idempotencyKey?: string,
): Promise<CommunityApiCallResult<T>> {
  const auth = await buildProtectedHeaders(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa };
  return fetchJsonSafe<T>(
    url,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey || createCommunityIdempotencyKey('comm'),
        ...auth.headers,
      },
      body: method === 'DELETE' ? undefined : JSON.stringify(payload),
    },
    extract,
  );
}

export const createCommunityDiscussion = (
  payload: { track: 'social_discussion' | 'expert_qa'; neighborhoodId: number; neighborhoodNameFa: string; topicId: string; titleFa: string; bodyFa: string; socialContext?: SocialContentContext },
  currentUser: User | null | undefined,
  idempotencyKey?: string,
) => postProtectedJson<CommunityDiscussionPost>('/api/v1/community/posts', 'POST', payload, currentUser, (b) => b.item as CommunityDiscussionPost, idempotencyKey);

export const editCommunityDiscussion = (
  postId: string,
  payload: { titleFa: string; bodyFa: string; reasonFa: string },
  currentUser: User | null | undefined,
  idempotencyKey?: string,
) => postProtectedJson<CommunityDiscussionPost>(`/api/v1/community/posts/${encodeURIComponent(postId)}`, 'PATCH', payload, currentUser, (b) => b.item as CommunityDiscussionPost, idempotencyKey);

export const createCommunityReply = (
  postId: string,
  payload: { bodyFa: string; parentReplyId?: string | null },
  currentUser: User | null | undefined,
  idempotencyKey?: string,
) => postProtectedJson<CommunityDiscussionPost>(`/api/v1/community/posts/${encodeURIComponent(postId)}/comments`, 'POST', payload, currentUser, (b) => b.post as CommunityDiscussionPost, idempotencyKey);

export const createCommunityQuestion = (
  payload: { titleFa: string; bodyFa: string; neighborhoodId: number; neighborhoodNameFa: string; topicId: string; socialContext?: SocialContentContext },
  currentUser: User | null | undefined,
  idempotencyKey?: string,
) => postProtectedJson<CommunityQuestionItem>('/api/v1/community/questions', 'POST', payload, currentUser, (b) => b.item as CommunityQuestionItem, idempotencyKey);

export const createCommunityAnswer = (
  questionId: string,
  payload: { bodyFa: string; sourceReferenceFa?: string },
  currentUser: User | null | undefined,
  idempotencyKey?: string,
) => postProtectedJson<{ item: CommunityAnswerItem; question: CommunityQuestionItem }>(
  `/api/v1/community/questions/${encodeURIComponent(questionId)}/answers`,
  'POST',
  payload,
  currentUser,
  (b) => ({ item: b.item as CommunityAnswerItem, question: b.question as CommunityQuestionItem }),
  idempotencyKey,
);

export const selectQuestionAnswer = (
  questionId: string,
  answerId: string,
  currentUser: User | null | undefined,
) => postProtectedJson<CommunityQuestionItem>(`/api/v1/community/questions/${encodeURIComponent(questionId)}/select-answer`, 'POST', { answerId }, currentUser, (b) => b.item as CommunityQuestionItem);

export const createDataCorrection = (
  payload: { neighborhoodId: number; neighborhoodNameFa: string; category: DataCorrectionCategory; titleFa: string; currentValueFa?: string; evidenceSummaryFa: string; suggestedValueFa: string; observedDateFa?: string; socialContext?: SocialContentContext },
  currentUser: User | null | undefined,
  idempotencyKey?: string,
) => postProtectedJson<DataCorrectionProposal>('/api/v1/community/contributions', 'POST', payload, currentUser, (b) => b.item as DataCorrectionProposal, idempotencyKey);

export const withdrawDataCorrection = (proposalId: string, currentUser: User | null | undefined) =>
  postProtectedJson<DataCorrectionProposal>(`/api/v1/community/contributions/${encodeURIComponent(proposalId)}/withdraw`, 'POST', {}, currentUser, (b) => b.item as DataCorrectionProposal);

export const toggleCommunityReaction = (targetId: string, reaction: ReactionType, currentUser: User | null | undefined, idempotencyKey?: string) =>
  postProtectedJson<{ reactionCounts: ReactionCounts; activeReaction: ReactionType | null }>(
    '/api/v1/community/reactions',
    'POST',
    { targetId, reaction },
    currentUser,
    (b) => ({ reactionCounts: b.reactionCounts as ReactionCounts, activeReaction: (b.activeReaction as ReactionType) ?? null }),
    idempotencyKey,
  );

export const submitCommunityAbuseReport = (
  payload: { targetType: CommunityAbuseReport['targetType']; targetId: string; reason: CommunityAbuseReason; detailsFa: string },
  currentUser: User | null | undefined,
  idempotencyKey?: string,
) => postProtectedJson<CommunityAbuseReport>('/api/v1/community/reports', 'POST', payload, currentUser, (b) => b.item as CommunityAbuseReport, idempotencyKey);

export const submitCommunityAppeal = (
  payload: { moderationActionId: string; targetId: string; argumentFa: string },
  currentUser: User | null | undefined,
) => postProtectedJson<ModerationAppeal>('/api/v1/community/appeals', 'POST', payload, currentUser, (b) => b.item as ModerationAppeal);

export const createResearchProposal = (
  payload: { titleFa: string; questionFa: string; neighborhoodNameFa: string; linkedKnowledgeTab: 'reports' | 'methodology'; socialContext?: SocialContentContext },
  currentUser: User | null | undefined,
  idempotencyKey?: string,
) => postProtectedJson<ResearchTopicProposal>('/api/v1/community/research-proposals', 'POST', payload, currentUser, (b) => b.item as ResearchTopicProposal, idempotencyKey);

export const voteResearchProposal = (proposalId: string, currentUser: User | null | undefined) =>
  postProtectedJson<ResearchTopicProposal>(`/api/v1/community/research-proposals/${encodeURIComponent(proposalId)}/vote`, 'POST', {}, currentUser, (b) => b.item as ResearchTopicProposal);

export const toggleTopicFollow = (topicId: string, currentUser: User | null | undefined, idempotencyKey?: string) =>
  postProtectedJson<{ topics: Array<CommunityTopicNode & { isFollowedByMe?: boolean }>; isFollowed: boolean }>(
    '/api/v1/community/follows',
    'POST',
    { scope: 'topic', targetId: topicId },
    currentUser,
    (b) => ({ topics: (b.topics as Array<CommunityTopicNode & { isFollowedByMe?: boolean }>) || [], isFollowed: Boolean(b.isFollowed) }),
    idempotencyKey,
  );

export const toggleCommunityDiscussionFollow = (postId: string, currentUser: User | null | undefined, idempotencyKey?: string) =>
  postProtectedJson<CommunityDiscussionPost>('/api/v1/community/follows', 'POST', { scope: 'post', targetId: postId }, currentUser, (b) => b.item as CommunityDiscussionPost, idempotencyKey);

export const updateCommunityPrivacySettings = (privacy: Partial<PrivacySettings>, currentUser: User | null | undefined) =>
  postProtectedJson<CommunityProfile>('/api/account/community/privacy', 'PATCH', { privacy }, currentUser, (b) => b.profile as CommunityProfile);

export {
  getCommunityProfileContributions,
  followCommunityUser,
  unfollowCommunityUser,
  getCommunityUserFollowStatus,
  getAdminCommunityModerationQueue,
  submitAdminCommunityModerationAction,
  resolveAdminCommunityAppeal,
  type CommunityUserFollowResult,
} from './communityProfileAndFollowClient';
