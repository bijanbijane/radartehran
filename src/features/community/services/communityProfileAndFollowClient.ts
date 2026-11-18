/** @file src/features/community/services/communityProfileAndFollowClient.ts — Profile Timeline & User Follow Graph API Client Helpers (RT-SOCIAL-IMPL-008 & RT-SOCIAL-IMPL-009) */
import type { User } from 'firebase/auth';
import { COMMUNITY_AUTH_REQUIRED_FA } from './communityTrustService';
import type {
  CommunityAbuseReport,
  DataCorrectionProposal,
  ModerationActionRecord,
  ModerationAppeal,
  ProfileContributionItem,
  ProfileContributionKind,
  ProfileContributionPage,
} from '../types/community.types';
import {
  createCommunityIdempotencyKey,
  mapCommunityErrorFa,
  COMMUNITY_NETWORK_ERROR_FA,
  type CommunityApiCallResult,
} from './communityApiClient';

async function buildOptionalAuthHeaders(currentUser?: User | null): Promise<{
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

async function fetchHelperJson<T>(
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

export async function getCommunityProfileContributions(
  username: string,
  params?: {
    kind?: 'all' | ProfileContributionKind;
    limit?: number;
    cursor?: string | null;
    currentUser?: User | null;
    signal?: AbortSignal;
  },
): Promise<CommunityApiCallResult<ProfileContributionPage>> {
  const qs = new URLSearchParams();
  if (params?.kind && params.kind !== 'all') qs.set('kind', params.kind);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  const auth = params?.currentUser ? await buildOptionalAuthHeaders(params.currentUser) : { ok: false, headers: {} };
  return fetchHelperJson<ProfileContributionPage>(
    `/api/v1/community/profiles/${encodeURIComponent(username)}/contributions?${qs.toString()}`,
    { headers: { Accept: 'application/json', ...(auth.ok ? auth.headers : {}) }, signal: params?.signal },
    (b) => ({
      items: Array.isArray(b.items) ? (b.items as ProfileContributionItem[]) : [],
      nextCursor: typeof b.nextCursor === 'string' ? b.nextCursor : null,
      hasMore: Boolean(b.hasMore),
      limit: Number(b.limit ?? 12),
      contributionsVisible: b.contributionsVisible !== false,
    }),
  );
}

export interface CommunityUserFollowResult {
  targetUserId: string;
  isFollowing: boolean;
  followersCount: number;
  followingCount: number;
  idempotentReplay: boolean;
}

function extractFollowResult(targetUserId: string, b: Record<string, unknown>): CommunityUserFollowResult {
  const rel = (b.relationship as Record<string, unknown> | undefined) ?? {};
  const counts = (b.counts as Record<string, unknown> | undefined) ?? {};
  return {
    targetUserId: String(b.targetUserId || targetUserId),
    isFollowing: Boolean(rel.isFollowing ?? b.isFollowing ?? b.isFollowed),
    followersCount: Number(counts.followersCount ?? b.followersCount ?? b.followerCount ?? 0),
    followingCount: Number(counts.followingCount ?? b.followingCount ?? 0),
    idempotentReplay: Boolean(b.idempotentReplay),
  };
}

export async function followCommunityUser(
  targetUserId: string,
  currentUser: User | null | undefined,
  idempotencyKey?: string,
): Promise<CommunityApiCallResult<CommunityUserFollowResult>> {
  const auth = await buildOptionalAuthHeaders(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa };
  return fetchHelperJson<CommunityUserFollowResult>(
    `/api/v1/community/users/${encodeURIComponent(targetUserId)}/follow`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey || createCommunityIdempotencyKey('fol'),
        ...auth.headers,
      },
      body: JSON.stringify({}),
    },
    (b) => extractFollowResult(targetUserId, b),
  );
}

export async function unfollowCommunityUser(
  targetUserId: string,
  currentUser: User | null | undefined,
  idempotencyKey?: string,
): Promise<CommunityApiCallResult<CommunityUserFollowResult>> {
  const auth = await buildOptionalAuthHeaders(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa };
  return fetchHelperJson<CommunityUserFollowResult>(
    `/api/v1/community/users/${encodeURIComponent(targetUserId)}/follow`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey || createCommunityIdempotencyKey('unfol'),
        ...auth.headers,
      },
    },
    (b) => extractFollowResult(targetUserId, b),
  );
}

export async function getCommunityUserFollowStatus(
  targetUserId: string,
  currentUser: User | null | undefined,
  signal?: AbortSignal,
): Promise<CommunityApiCallResult<{ targetUserId: string; isFollowing: boolean }>> {
  const auth = await buildOptionalAuthHeaders(currentUser);
  if (!auth.ok) return { ok: false, status: 401, errorFa: auth.errorFa };
  return fetchHelperJson<{ targetUserId: string; isFollowing: boolean }>(
    `/api/v1/community/users/${encodeURIComponent(targetUserId)}/follow-status`,
    { headers: { Accept: 'application/json', ...auth.headers }, signal },
    (b) => {
      const rel = (b.relationship as Record<string, unknown> | undefined) ?? {};
      return {
        targetUserId: String(b.targetUserId || targetUserId),
        isFollowing: Boolean(rel.isFollowing ?? b.isFollowing),
      };
    },
  );
}

export async function getAdminCommunityModerationQueue(signal?: AbortSignal, currentUser?: User | null) {
  const auth = currentUser ? await buildOptionalAuthHeaders(currentUser) : { ok: false, headers: {} };
  return fetchHelperJson<{
    corrections: DataCorrectionProposal[];
    reports: CommunityAbuseReport[];
    actions: ModerationActionRecord[];
    appeals: ModerationAppeal[];
  }>(
    '/api/admin/community/moderation',
    { headers: { Accept: 'application/json', ...(auth.ok ? auth.headers : {}) }, signal },
    (b) => ({
      corrections: (b.corrections as DataCorrectionProposal[]) || [],
      reports: (b.reports as CommunityAbuseReport[]) || [],
      actions: (b.actions as ModerationActionRecord[]) || [],
      appeals: (b.appeals as ModerationAppeal[]) || [],
    }),
  );
}

export async function submitAdminCommunityModerationAction(
  payload: { targetType: CommunityAbuseReport['targetType']; targetId: string; actionType: ModerationActionRecord['actionType']; reasonFa: string; actorRole?: string },
  currentUser?: User | null,
) {
  const auth = currentUser ? await buildOptionalAuthHeaders(currentUser) : { ok: false, headers: {} };
  return fetchHelperJson<ModerationActionRecord>(
    '/api/admin/community/moderation-actions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createCommunityIdempotencyKey('mod'), ...(auth.ok ? auth.headers : {}) },
      body: JSON.stringify({ targetType: payload.targetType, targetId: payload.targetId, actionType: payload.actionType, reasonFa: payload.reasonFa }),
    },
    (b) => b.action as ModerationActionRecord,
  );
}

export async function resolveAdminCommunityAppeal(
  payload: { appealId: string; decision: 'upheld' | 'overturned'; reviewerNoteFa: string },
  currentUser?: User | null,
) {
  const auth = currentUser ? await buildOptionalAuthHeaders(currentUser) : { ok: false, headers: {} };
  return fetchHelperJson<ModerationAppeal>(
    `/api/admin/community/appeals/${encodeURIComponent(payload.appealId)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createCommunityIdempotencyKey('app'), ...(auth.ok ? auth.headers : {}) },
      body: JSON.stringify({ decision: payload.decision, reviewerNoteFa: payload.reviewerNoteFa }),
    },
    (b) => b.appeal as ModerationAppeal,
  );
}
