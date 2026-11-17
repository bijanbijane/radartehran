/** @file src/features/community/services/communityEngagementService.ts — Stage 25 & 73–79 Q&A, Reactions, Topics, Profiles & Appeals Engine */
import { sanitizeInput } from '../../../utils/security';
import {
  COMMUNITY_MEMBER_PROFILES, COMMUNITY_SEED_QUESTIONS, COMMUNITY_TOPICS_REGISTRY,
  SEED_MODERATION_ACTIONS, SEED_MODERATION_APPEALS, SEED_REPUTATION_EVENTS,
} from '../data/communityTopicsAndSeeds';
import { readCommunityJson, writeCommunityJson } from '../data/communitySeedData';
import type {
  CommunityDiscussionPost, CommunityProfile, CommunityQuestionItem, CommunityTrustBadgeProfile,
  DiscussionModerationStatus, ModerationActionRecord, ModerationAppeal, ProfileVisibilityLevel,
  ReactionCounts, ReactionType, ReputationAxis, ReputationBreakdown, ReputationEvent, TopicItem,
} from '../types/community.types';
import {
  assertCommunityOwner, COMMUNITY_AUTH_REQUIRED_FA, isRealAuthenticatedUid, loadCommunityAbuseReports,
  loadCommunityPosts, moderateCommunityPost, sanitizePublicProfile, validateCommunityTextSafety,
} from './communityTrustService';

const QUESTIONS_KEY = 'radar_community_questions_v1';
const FOLLOWED_TOPICS_KEY = 'radar_community_followed_topics_v2';
const MY_PROFILE_KEY = 'radar_community_my_profile_v2';
const MOD_ACTIONS_KEY = 'radar_community_mod_actions_v1';
const APPEALS_KEY = 'radar_community_appeals_v1';
const REP_EVENTS_KEY = 'radar_community_rep_events_v1';
const DISCUSSIONS_KEY = 'radar_community_discussions_v1';
const EMPTY_COUNTS: ReactionCounts = { helpful: 0, agree: 0, needs_source: 0, disagree: 0 };

export function applyBoundedReaction(
  countsRaw: ReactionCounts | undefined, byUserRaw: Record<string, ReactionType> | undefined, userId: string, reaction: ReactionType,
): { reactionCounts: ReactionCounts; reactionsByUser: Record<string, ReactionType> } {
  const counts: ReactionCounts = {
    helpful: Math.max(0, countsRaw?.helpful ?? 0),
    agree: Math.max(0, countsRaw?.agree ?? 0),
    needs_source: Math.max(0, countsRaw?.needs_source ?? 0),
    disagree: Math.max(0, countsRaw?.disagree ?? 0),
  };
  const byUser: Record<string, ReactionType> = { ...(byUserRaw ?? {}) };
  if (!isRealAuthenticatedUid(userId)) {
    return { reactionCounts: counts, reactionsByUser: byUser };
  }
  const prev = byUser[userId];
  if (prev === reaction) {
    counts[reaction] = Math.max(0, (counts[reaction] ?? 0) - 1);
    delete byUser[userId];
  } else {
    if (prev) counts[prev] = Math.max(0, (counts[prev] ?? 0) - 1);
    counts[reaction] = (counts[reaction] ?? 0) + 1;
    byUser[userId] = reaction;
  }
  return { reactionCounts: counts, reactionsByUser: byUser };
}

export function loadCommunityQuestions(): CommunityQuestionItem[] {
  return readCommunityJson<CommunityQuestionItem[]>(QUESTIONS_KEY, COMMUNITY_SEED_QUESTIONS);
}

export function submitCommunityQuestion(params: {
  titleFa: string; bodyFa: string; neighborhoodId: number; neighborhoodNameFa: string;
  topicId: string; tags?: string[]; authorProfile: CommunityTrustBadgeProfile;
}): { ok: boolean; items: CommunityQuestionItem[]; errorFa?: string } {
  const current = loadCommunityQuestions();
  if (!isRealAuthenticatedUid(params.authorProfile?.userId)) {
    return { ok: false, items: current, errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  }
  const safeTitle = sanitizeInput(params.titleFa, 140), safeBody = sanitizeInput(params.bodyFa, 500);
  if (safeTitle.length < 8) return { ok: false, items: current, errorFa: 'عنوان پرسش باید حداقل ۸ کاراکتر واضح داشته باشد.' };
  const safety = validateCommunityTextSafety(safeBody);
  if (!safety.ok) return { ok: false, items: current, errorFa: safety.errorFa };
  const nextItem: CommunityQuestionItem = {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, titleFa: safeTitle, bodyFa: safeBody,
    neighborhoodId: params.neighborhoodId, neighborhoodNameFa: sanitizeInput(params.neighborhoodNameFa, 60),
    topicId: params.topicId || 'topic-neighborhoods',
    tags: (params.tags || [params.neighborhoodNameFa]).map((t) => sanitizeInput(t, 28)).filter(Boolean).slice(0, 4),
    ownerUserId: params.authorProfile.userId, authorProfile: params.authorProfile, status: 'open',
    answers: [], followerIds: [params.authorProfile.userId], createdAtIso: new Date().toISOString(), createdAtFa: 'امروز',
  };
  const next = [nextItem, ...current];
  writeCommunityJson(QUESTIONS_KEY, next);
  return { ok: true, items: next };
}

export function submitQuestionAnswer(params: {
  questionId: string; bodyFa: string; sourceReferenceFa?: string; authorProfile: CommunityTrustBadgeProfile;
}): { ok: boolean; items: CommunityQuestionItem[]; errorFa?: string } {
  const current = loadCommunityQuestions();
  if (!isRealAuthenticatedUid(params.authorProfile?.userId)) {
    return { ok: false, items: current, errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  }
  const safeBody = sanitizeInput(params.bodyFa, 600);
  const safety = validateCommunityTextSafety(safeBody);
  if (!safety.ok) return { ok: false, items: current, errorFa: safety.errorFa };
  const q = current.find((item) => item.id === params.questionId);
  if (!q) return { ok: false, items: current, errorFa: 'پرسش یافت نشد.' };
  if (q.status === 'closed' || q.status === 'archived') return { ok: false, items: current, errorFa: 'این پرسش بسته شده و امکان ثبت پاسخ جدید ندارد.' };
  const safeSource = params.sourceReferenceFa ? sanitizeInput(params.sourceReferenceFa, 140) : undefined;
  const answer = {
    id: `ans-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, questionId: q.id,
    authorProfile: params.authorProfile, bodyFa: safeBody, sourceReferenceFa: safeSource,
    markers: {
      isAskerSelected: false, hasCredibleSource: Boolean(safeSource && safeSource.length >= 6),
      isExpertReviewed: Boolean(params.authorProfile.verifiedCredentialFa), isOfficiallyVerified: false,
    },
    reactionCounts: { ...EMPTY_COUNTS }, reactionsByUser: {}, createdAtFa: 'امروز', status: 'visible' as const,
  };
  const next = current.map((item) =>
    item.id === q.id ? { ...item, status: item.status === 'open' ? ('answered' as const) : item.status, answers: [...item.answers, answer] } : item,
  );
  writeCommunityJson(QUESTIONS_KEY, next);
  return { ok: true, items: next };
}

export function toggleAskerSelectedAnswer(questionId: string, answerId: string, actorUserId: string): { ok: boolean; items: CommunityQuestionItem[]; errorFa?: string } {
  const current = loadCommunityQuestions();
  const q = current.find((item) => item.id === questionId);
  if (!q) return { ok: false, items: current, errorFa: 'پرسش یافت نشد.' };
  const ownerGuard = assertCommunityOwner(actorUserId, q.ownerUserId, false);
  if (!ownerGuard.ok) return { ok: false, items: current, errorFa: 'فقط پرسش‌کننده اصلی می‌تواند پاسخ منتخب را تعیین کند.' };
  const next = current.map((item) => {
    if (item.id !== questionId) return item;
    const answers = item.answers.map((a) => ({ ...a, markers: { ...a.markers, isAskerSelected: a.id === answerId ? !a.markers.isAskerSelected : false } }));
    const hasSelected = answers.some((a) => a.markers.isAskerSelected);
    return { ...item, status: hasSelected ? ('resolved' as const) : ('answered' as const), answers };
  });
  writeCommunityJson(QUESTIONS_KEY, next);
  return { ok: true, items: next };
}

export function togglePostReaction(postId: string, userId: string, reaction: ReactionType): CommunityDiscussionPost[] {
  if (!isRealAuthenticatedUid(userId)) return loadCommunityPosts();
  const next = loadCommunityPosts().map((post) => {
    if (post.id !== postId) return post;
    const updated = applyBoundedReaction(post.reactionCounts, post.reactionsByUser, userId, reaction);
    return {
      ...post, reactionCounts: updated.reactionCounts, reactionsByUser: updated.reactionsByUser,
      helpfulCount: updated.reactionCounts.helpful,
      helpfulVoterIds: Object.entries(updated.reactionsByUser).filter(([, r]) => r === 'helpful').map(([id]) => id),
    };
  });
  writeCommunityJson(DISCUSSIONS_KEY, next);
  return next;
}

export function editCommunityPost(params: {
  postId: string; actorUserId: string; titleFa: string; bodyFa: string; reasonFa?: string;
}): { ok: boolean; items: CommunityDiscussionPost[]; errorFa?: string } {
  const posts = loadCommunityPosts();
  if (!isRealAuthenticatedUid(params.actorUserId)) return { ok: false, items: posts, errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  const target = posts.find((p) => p.id === params.postId);
  if (!target) return { ok: false, items: posts, errorFa: 'مطلب یافت نشد.' };
  const ownerCheck = assertCommunityOwner(params.actorUserId, target.ownerUserId, false);
  if (!ownerCheck.ok) return { ok: false, items: posts, errorFa: ownerCheck.errorFa };
  const safety = validateCommunityTextSafety(params.bodyFa);
  if (!safety.ok) return { ok: false, items: posts, errorFa: safety.errorFa };
  const revision = {
    version: (target.revisionHistory?.length ?? 0) + 1, titleFa: target.titleFa, bodyFa: target.bodyFa,
    editedAtFa: 'امروز', reasonFa: sanitizeInput(params.reasonFa || 'ویرایش و تکمیل متن توسط نویسنده', 80),
  };
  const next = posts.map((p) =>
    p.id === params.postId
      ? { ...p, titleFa: sanitizeInput(params.titleFa, 120), bodyFa: sanitizeInput(params.bodyFa, 500), revisionHistory: [revision, ...(p.revisionHistory ?? [])] }
      : p,
  );
  writeCommunityJson(DISCUSSIONS_KEY, next);
  return { ok: true, items: next };
}

export function updatePostGovernanceState(postId: string, patch: { pinned?: boolean; status?: DiscussionModerationStatus; toggleFollowUserId?: string }): CommunityDiscussionPost[] {
  const next = loadCommunityPosts().map((p) => {
    if (p.id !== postId) return p;
    let followerIds = p.followerIds ?? [];
    if (patch.toggleFollowUserId && isRealAuthenticatedUid(patch.toggleFollowUserId)) {
      followerIds = followerIds.includes(patch.toggleFollowUserId) ? followerIds.filter((id) => id !== patch.toggleFollowUserId) : [...followerIds, patch.toggleFollowUserId];
    }
    return { ...p, pinned: patch.pinned ?? p.pinned, status: patch.status ?? p.status, followerIds };
  });
  writeCommunityJson(DISCUSSIONS_KEY, next);
  return next;
}

export function loadCommunityTopics(): TopicItem[] { return COMMUNITY_TOPICS_REGISTRY; }

export function loadFollowedTopicIds(userId?: string | null): string[] {
  if (!isRealAuthenticatedUid(userId)) return [];
  return readCommunityJson<string[]>(`${FOLLOWED_TOPICS_KEY}:${userId.trim()}`, []);
}

export function toggleFollowTopic(topicId: string, userId?: string | null): string[] {
  if (!isRealAuthenticatedUid(userId)) return [];
  const cleanUid = userId.trim();
  const key = `${FOLLOWED_TOPICS_KEY}:${cleanUid}`;
  const current = readCommunityJson<string[]>(key, []);
  const next = current.includes(topicId) ? current.filter((id) => id !== topicId) : [...current, topicId];
  writeCommunityJson(key, next);
  return next;
}

export function loadMyCommunityPrivacyProfile(userId?: string | null, displayNameFa?: string): CommunityProfile | null {
  if (!isRealAuthenticatedUid(userId)) return null;
  const cleanUid = userId.trim();
  return readCommunityJson<CommunityProfile>(`${MY_PROFILE_KEY}:${cleanUid}`, {
    userId: cleanUid, username: `u_${cleanUid.slice(0, 8)}`, displayNameFa: sanitizeInput(displayNameFa || 'کاربر احرازشده رادار', 60),
    bioFa: 'عضو جامعه رادار تهران.', visibility: 'public',
    showBadges: true, showContributions: true, showFollowedTopics: true, identityStatus: 'authenticated',
    reputation: { data: 0, community: 0, research: 0, sources: 0, professional: 0 },
    badges: [],
    followedTopicIds: loadFollowedTopicIds(cleanUid), memberSinceFa: '۱۴۰۵',
    recentPublicSummaryFa: [], verifiedCredentialFa: null,
  });
}

export function updateMyCommunityPrivacyProfile(
  patch: Partial<Pick<CommunityProfile, 'visibility' | 'showBadges' | 'showContributions' | 'showFollowedTopics' | 'bioFa' | 'displayNameFa'>>,
  actorUserId?: string | null,
  targetUserId?: string | null,
): { ok: boolean; profile: CommunityProfile | null; errorFa?: string } {
  if (!isRealAuthenticatedUid(actorUserId)) {
    return { ok: false, profile: null, errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  }
  const cleanActor = actorUserId.trim();
  if (targetUserId && targetUserId.trim() !== cleanActor) {
    return { ok: false, profile: null, errorFa: 'تغییر تنظیمات حریم خصوصی سایر کاربران مجاز نیست.' };
  }
  const current = loadMyCommunityPrivacyProfile(cleanActor)!;
  const updated: CommunityProfile = {
    ...current, ...patch,
    userId: cleanActor,
    bioFa: patch.bioFa !== undefined ? sanitizeInput(patch.bioFa, 220) : current.bioFa,
    displayNameFa: patch.displayNameFa !== undefined ? sanitizeInput(patch.displayNameFa, 60) || current.displayNameFa : current.displayNameFa,
    visibility: (patch.visibility as ProfileVisibilityLevel) || current.visibility,
  };
  writeCommunityJson(`${MY_PROFILE_KEY}:${cleanActor}`, updated);
  return { ok: true, profile: updated };
}

export function loadPublicCommunityMembers(isViewerMember = true, viewerUserId?: string | null): CommunityProfile[] {
  const mine = isRealAuthenticatedUid(viewerUserId) ? loadMyCommunityPrivacyProfile(viewerUserId) : null;
  const list = mine ? [...COMMUNITY_MEMBER_PROFILES, mine] : [...COMMUNITY_MEMBER_PROFILES];
  return list
    .map((profile) => sanitizePublicProfile(profile, isViewerMember, Boolean(viewerUserId && profile.userId === viewerUserId)))
    .filter((p): p is CommunityProfile => p !== null);
}

export function computeAuditedReputationBreakdown(events: readonly ReputationEvent[], userId: string): ReputationBreakdown {
  const seenEventIds = new Set<string>();
  const seenEntityAxis = new Set<string>();
  const totals: ReputationBreakdown = { data: 0, community: 0, research: 0, sources: 0, professional: 0 };
  for (const ev of events) {
    if (ev.userId !== userId || !ev.id || seenEventIds.has(ev.id)) continue;
    const dedupKey = `${ev.axis}:${ev.sourceEntityId}`;
    if (ev.delta > 0 && seenEntityAxis.has(dedupKey)) continue;
    seenEventIds.add(ev.id);
    if (ev.delta > 0) seenEntityAxis.add(dedupKey);
    const axis: ReputationAxis = ev.axis;
    if (axis in totals) {
      totals[axis] = Math.max(0, totals[axis] + Math.round(ev.delta));
    }
  }
  return totals;
}

export function loadReputationEvents(): ReputationEvent[] { return readCommunityJson<ReputationEvent[]>(REP_EVENTS_KEY, SEED_REPUTATION_EVENTS); }
export function loadModerationActions(): ModerationActionRecord[] { return readCommunityJson<ModerationActionRecord[]>(MOD_ACTIONS_KEY, SEED_MODERATION_ACTIONS); }

export function recordModerationAction(input: Omit<ModerationActionRecord, 'id' | 'createdAtIso'>): ModerationActionRecord[] {
  const action: ModerationActionRecord = { ...input, id: `mact-${Date.now()}`, createdAtIso: new Date().toISOString() };
  const next = [action, ...loadModerationActions()];
  writeCommunityJson(MOD_ACTIONS_KEY, next);
  if (input.targetType === 'discussion_post' && (input.actionType === 'hide' || input.actionType === 'lock' || input.actionType === 'restore')) {
    moderateCommunityPost(input.targetId, input.actionType === 'hide' ? 'hidden' : input.actionType === 'lock' ? 'locked' : 'published');
  }
  return next;
}

export function loadModerationAppeals(): ModerationAppeal[] { return readCommunityJson<ModerationAppeal[]>(APPEALS_KEY, SEED_MODERATION_APPEALS); }

export function submitModerationAppeal(params: { moderationActionId: string; targetId: string; appellantUserId: string; argumentFa: string }): { ok: boolean; items: ModerationAppeal[]; errorFa?: string } {
  const current = loadModerationAppeals();
  if (!isRealAuthenticatedUid(params.appellantUserId)) return { ok: false, items: current, errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  const safeArg = sanitizeInput(params.argumentFa, 320);
  if (safeArg.length < 10) return { ok: false, items: current, errorFa: 'متن درخواست بازبینی باید حداقل ۱۰ کاراکتر مستند داشته باشد.' };
  const nextItem: ModerationAppeal = {
    id: `apl-${Date.now()}`, moderationActionId: params.moderationActionId, targetId: params.targetId,
    appellantUserId: params.appellantUserId, argumentFa: safeArg, status: 'submitted', createdAtIso: new Date().toISOString(),
  };
  const next = [nextItem, ...current];
  writeCommunityJson(APPEALS_KEY, next);
  return { ok: true, items: next };
}

export function resolveModerationAppeal(appealId: string, decision: 'upheld' | 'overturned', reviewerNoteFa: string): ModerationAppeal[] {
  const next = loadModerationAppeals().map((a) => (a.id === appealId ? { ...a, status: decision, reviewerNoteFa: sanitizeInput(reviewerNoteFa, 200) } : a));
  writeCommunityJson(APPEALS_KEY, next);
  return next;
}

export function resolveAbuseReportWorkflow(reportId: string, decision: 'decision_made' | 'dismissed', noteFa: string) {
  const next = loadCommunityAbuseReports().map((r) => (r.id === reportId ? { ...r, status: decision, moderatorActionNoteFa: sanitizeInput(noteFa, 180) } : r));
  writeCommunityJson('radar_community_abuse_reports_v1', next);
  return next;
}
