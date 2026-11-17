/** @file src/features/community/services/communityTrustService.ts — Stage 25 & 73–79 Trust Axes, Real Identity, Anti-Spam, Multi-Factor Ranking & Corrections Engine */
import { sanitizeInput } from '../../../utils/security';
import {
  COMMUNITY_SEED_CORRECTIONS, COMMUNITY_SEED_DISCUSSIONS, COMMUNITY_SEED_RESEARCH_PROPOSALS,
  readCommunityJson, writeCommunityJson,
} from '../data/communitySeedData';
import type {
  CommunityAbuseReason, CommunityAbuseReport, CommunityDiscussionPost, CommunityProfile, CommunityReplyItem,
  CommunityTrustBadgeProfile, DataCorrectionCategory, DataCorrectionModerationStatus, DataCorrectionProposal,
  DiscussionModerationStatus, IdentityVerificationStatus, ReputationBreakdown, ResearchTopicProposal,
} from '../types/community.types';

const CORRECTIONS_KEY = 'radar_community_data_corrections_v1';
const DISCUSSIONS_KEY = 'radar_community_discussions_v1';
const ABUSE_REPORTS_KEY = 'radar_community_abuse_reports_v1';
const RESEARCH_PROPOSALS_KEY = 'radar_community_research_proposals_v1';
const DRAFT_CORRECTION_KEY = 'radar_community_draft_correction_v1';
const FORBIDDEN_FAKE_USER_IDS = new Set(['current_local_user', 'local-user', 'anonymous', 'guest']);

export const COMMUNITY_AUTH_REQUIRED_FA = 'برای ثبت فعالیت در جامعه کاربران، ابتدا وارد حساب کاربری خود شوید.';

export function isRealAuthenticatedUid(uid: unknown): uid is string {
  if (typeof uid !== 'string') return false;
  const trimmed = uid.trim();
  return trimmed.length >= 2 && !FORBIDDEN_FAKE_USER_IDS.has(trimmed);
}

export function assertAuthenticatedCommunityWriter(currentUserOrUid: unknown): { ok: boolean; uid: string | null; errorFa?: string } {
  const uid =
    typeof currentUserOrUid === 'string'
      ? currentUserOrUid
      : currentUserOrUid && typeof currentUserOrUid === 'object' && 'uid' in currentUserOrUid
        ? (currentUserOrUid as { uid?: unknown }).uid
        : null;
  if (!isRealAuthenticatedUid(uid)) {
    return { ok: false, uid: null, errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  }
  return { ok: true, uid: uid.trim() };
}

export function buildUserTrustProfile(params: {
  userId: string;
  username?: string;
  displayNameFa: string;
  isAuthenticated?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  participationScore: number;
  verifiedCredentialFa?: string | null;
  fromAuthoritativeServer?: boolean;
  reputation?: ReputationBreakdown;
}): CommunityTrustBadgeProfile {
  const realAuth = params.isAuthenticated ?? isRealAuthenticatedUid(params.userId);
  const safeUid = realAuth ? params.userId.trim() : '';
  const phoneVerified = realAuth && Boolean(params.isPhoneVerified);
  const emailVerified = realAuth && Boolean(params.isEmailVerified);
  const identityStatus: IdentityVerificationStatus = !realAuth
    ? 'unverified'
    : phoneVerified
      ? 'verified_phone'
      : emailVerified
        ? 'verified_email'
        : 'authenticated';
  const safeScore = realAuth ? Math.max(0, Math.round(params.participationScore || 0)) : 0;
  const tier: CommunityTrustBadgeProfile['participationTierFa'] =
    safeScore >= 50 ? 'مشارکت‌کننده فعال' : safeScore >= 15 ? 'همکار محله' : 'مشارکت‌کننده جدید';
  const allowCredential = params.fromAuthoritativeServer !== false;
  return {
    userId: safeUid,
    username: realAuth ? params.username : undefined,
    displayNameFa: realAuth ? (sanitizeInput(params.displayNameFa, 60) || 'کاربر واردشده رادار') : 'کاربر مهمان (واردنشده)',
    isAuthenticated: realAuth,
    isEmailVerified: emailVerified,
    isPhoneVerified: phoneVerified,
    identityStatus,
    participationScore: safeScore,
    participationTierFa: tier,
    verifiedCredentialFa: realAuth && allowCredential && params.verifiedCredentialFa ? sanitizeInput(params.verifiedCredentialFa, 90) : null,
    reputation: params.reputation ?? { data: 0, community: 0, research: 0, sources: 0, professional: 0 },
  };
}

/**
 * Stage 73.1 & 73.2: Resolves current user profile strictly from Firebase Auth + Server profile.
 * Never fabricates 'current_local_user', never treats emailVerified as phoneVerified,
 * never computes participationScore from local corrections, and never accepts client-sent credentials.
 */
export function resolveAuthenticatedCommunityUser(
  currentUser: unknown,
  serverProfile?: Partial<CommunityTrustBadgeProfile> | null,
): CommunityTrustBadgeProfile {
  const userObj = currentUser && typeof currentUser === 'object' ? (currentUser as Record<string, unknown>) : null;
  const rawUid = userObj?.uid;
  if (!isRealAuthenticatedUid(rawUid)) {
    return {
      userId: '',
      username: undefined,
      displayNameFa: 'کاربر مهمان (واردنشده)',
      isAuthenticated: false,
      isEmailVerified: false,
      isPhoneVerified: false,
      identityStatus: 'unverified',
      participationScore: 0,
      participationTierFa: 'مشارکت‌کننده جدید',
      verifiedCredentialFa: null,
      reputation: { data: 0, community: 0, research: 0, sources: 0, professional: 0 },
    };
  }
  const uid = rawUid.trim();
  const isEmailVerified = Boolean(userObj?.emailVerified || serverProfile?.isEmailVerified);
  const hasVerifiedPhone = Boolean(
    (typeof userObj?.phoneNumber === 'string' && userObj.phoneNumber.trim().length >= 8) ||
    serverProfile?.isPhoneVerified === true ||
    serverProfile?.identityStatus === 'verified_phone',
  );
  const rawDisplayName =
    typeof serverProfile?.displayNameFa === 'string' && serverProfile.displayNameFa.trim()
      ? serverProfile.displayNameFa
      : typeof userObj?.displayName === 'string' && userObj.displayName.trim()
        ? userObj.displayName
        : 'کاربر واردشده رادار';

  return buildUserTrustProfile({
    userId: uid,
    username: serverProfile?.username || `u_${uid.slice(0, 8)}`,
    displayNameFa: rawDisplayName,
    isAuthenticated: true,
    isEmailVerified,
    isPhoneVerified: hasVerifiedPhone,
    participationScore: typeof serverProfile?.participationScore === 'number' ? serverProfile.participationScore : 0,
    verifiedCredentialFa: serverProfile?.verifiedCredentialFa ?? null,
    fromAuthoritativeServer: true,
    reputation: serverProfile?.reputation ?? { data: 0, community: 0, research: 0, sources: 0, professional: 0 },
  });
}

export function sanitizePublicProfile(profile: CommunityProfile, isViewerMember: boolean, isSelf = false): CommunityProfile | null {
  if (profile.visibility === 'private' && !isSelf) return null;
  if (profile.visibility === 'members_only' && !isViewerMember && !isSelf) return null;
  const nowMs = Date.now();
  const activeBadges = profile.showBadges
    ? profile.badges.filter((b) => b.status === 'active' && (!b.expiresAtIso || Date.parse(b.expiresAtIso) > nowMs))
    : [];
  const raw = profile as unknown as Record<string, unknown>;
  const stripped: Record<string, unknown> = { ...raw };
  delete stripped.phone;
  delete stripped.phoneNumber;
  delete stripped.email;
  delete stripped.authUid;
  delete stripped.token;
  delete stripped.idToken;
  delete stripped.abuseReportsAgainst;
  delete stripped.rawCredentials;
  return {
    ...(stripped as unknown as CommunityProfile),
    badges: activeBadges,
    recentPublicSummaryFa: profile.showContributions ? profile.recentPublicSummaryFa : [],
    followedTopicIds: profile.showFollowedTopics ? profile.followedTopicIds : [],
  };
}

export function resolveReplyDepth(replies: CommunityReplyItem[], parentReplyId?: string | null): { ok: boolean; depth: 1 | 2; errorFa?: string } {
  if (!parentReplyId) return { ok: true, depth: 1 };
  const parent = replies.find((r) => r.id === parentReplyId);
  if (!parent) return { ok: false, depth: 1, errorFa: 'پاسخ والد یافت نشد.' };
  const parentDepth = parent.depth ?? (parent.parentReplyId ? 2 : 1);
  if (parentDepth >= 2) return { ok: false, depth: 2, errorFa: 'حداکثر ۲ سطح تو در تو برای پاسخ‌ها مجاز است تا خوانایی گفتگو حفظ شود.' };
  return { ok: true, depth: 2 };
}

export const DISCUSSION_RANK_WEIGHTS = {
  recencyBase: 40,
  hoodMatchBoost: 24,
  credentialedReplyWeight: 10,
  maxCredentialBoost: 20,
  maxSubstanceBonus: 18,
  helpfulReactionWeight: 0.9,
  maxReactionBoost: 18,
  pinBoost: 15,
  lowSubstancePenalty: -12,
} as const;

export function computeDiscussionMultiFactorRank(post: CommunityDiscussionPost, activeHoodId: number): number {
  if (post.status === 'hidden' || post.status === 'archived') return -1000;
  const parsedTime = Date.parse(post.createdAtIso || '');
  const safeCreatedMs = Number.isFinite(parsedTime) ? parsedTime : Date.now() - 24 * 3_600_000;
  const recencyHours = Math.max(1, (Date.now() - safeCreatedMs) / 3_600_000);
  const recencyBoost = DISCUSSION_RANK_WEIGHTS.recencyBase / Math.log2(recencyHours + 2);
  const hoodRelevance = post.neighborhoodId === activeHoodId ? DISCUSSION_RANK_WEIGHTS.hoodMatchBoost : 0;
  const safeBody = String(post.bodyFa || '').trim();
  const safeReplies = Array.isArray(post.replies) ? post.replies.filter((r) => r.status !== 'hidden') : [];
  const credCount = safeReplies.filter((r) => Boolean(r.authorProfile?.verifiedCredentialFa)).length;
  const credentialedReplies = safeBody.length < 25 ? 0 : Math.min(DISCUSSION_RANK_WEIGHTS.maxCredentialBoost, credCount * DISCUSSION_RANK_WEIGHTS.credentialedReplyWeight);
  const substanceBonus = safeBody.length < 20 ? DISCUSSION_RANK_WEIGHTS.lowSubstancePenalty : Math.min(DISCUSSION_RANK_WEIGHTS.maxSubstanceBonus, safeBody.length / 25);
  const helpfulCount = Math.max(0, post.reactionCounts?.helpful ?? post.helpfulCount ?? 0);
  const disagreeCount = Math.max(0, post.reactionCounts?.disagree ?? 0);
  const reactionSignal = Math.min(DISCUSSION_RANK_WEIGHTS.maxReactionBoost, Math.max(0, helpfulCount - disagreeCount * 0.5) * DISCUSSION_RANK_WEIGHTS.helpfulReactionWeight);
  const pinBonus = post.pinned ? DISCUSSION_RANK_WEIGHTS.pinBoost : 0;
  return Number((recencyBoost + hoodRelevance + credentialedReplies + substanceBonus + reactionSignal + pinBonus).toFixed(2));
}

export function findSimilarQuestionTitles<T extends { id: string; titleFa: string }>(draftTitle: string, existing: readonly T[]): T[] {
  const words = sanitizeInput(draftTitle, 100).split(/\s+/).filter((w) => w.length >= 3);
  if (words.length < 2) return [];
  return existing.filter((q) => words.filter((w) => q.titleFa.includes(w)).length >= 2).slice(0, 3);
}

export function assertCommunityOwner(actorUserId: string, ownerUserId: string, isAdmin = false): { ok: boolean; errorFa?: string } {
  if (isAdmin || (isRealAuthenticatedUid(actorUserId) && actorUserId === ownerUserId)) return { ok: true };
  return { ok: false, errorFa: 'فقط ثبت‌کننده اصلی یا ناظر مجاز حق تغییر یا حذف این مورد را دارد.' };
}

export function validateCommunityTextSafety(text: string): { ok: boolean; errorFa?: string } {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 10) return { ok: false, errorFa: 'متن ارسالی باید حداقل ۱۰ کاراکتر معنادار داشته باشد.' };
  if (/(https?:\/\/|t\.me\/|telegram\.me|wa\.me\/|09\d{9}|۰۹[۰-۹]{9})/i.test(trimmed)) {
    return { ok: false, errorFa: 'درج لینک تبلیغاتی، کانال خارجی یا شماره تماس شخصی در متن عمومی مجاز نیست.' };
  }
  return { ok: true };
}

export function loadDataCorrectionProposals(): DataCorrectionProposal[] {
  return readCommunityJson<DataCorrectionProposal[]>(CORRECTIONS_KEY, COMMUNITY_SEED_CORRECTIONS);
}
export function saveDataCorrectionDraft(draft: Record<string, string | number> | null, userId?: string | null): void {
  const key = isRealAuthenticatedUid(userId) ? `${DRAFT_CORRECTION_KEY}:${userId}` : DRAFT_CORRECTION_KEY;
  writeCommunityJson(key, draft);
}
export function loadDataCorrectionDraft(userId?: string | null): Record<string, string | number> | null {
  const key = isRealAuthenticatedUid(userId) ? `${DRAFT_CORRECTION_KEY}:${userId}` : DRAFT_CORRECTION_KEY;
  return readCommunityJson<Record<string, string | number> | null>(key, null);
}

export function submitDataCorrectionProposal(params: {
  neighborhoodId: number; neighborhoodNameFa: string; category: DataCorrectionCategory; titleFa: string;
  currentValueFa?: string; evidenceSummaryFa: string; suggestedValueFa: string; observedDateFa?: string; authorProfile: CommunityTrustBadgeProfile;
}): { ok: boolean; items: DataCorrectionProposal[]; errorFa?: string } {
  if (!isRealAuthenticatedUid(params.authorProfile?.userId)) {
    return { ok: false, items: loadDataCorrectionProposals(), errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  }
  const safeTitle = sanitizeInput(params.titleFa, 120), safeEvidence = sanitizeInput(params.evidenceSummaryFa, 420), safeSuggested = sanitizeInput(params.suggestedValueFa, 160);
  const safety = validateCommunityTextSafety(safeEvidence);
  if (safeTitle.length < 5) return { ok: false, items: loadDataCorrectionProposals(), errorFa: 'عنوان گزارش اصلاح داده حداقل ۵ کاراکتر است.' };
  if (!safety.ok) return { ok: false, items: loadDataCorrectionProposals(), errorFa: safety.errorFa };
  const current = loadDataCorrectionProposals();
  if (current.some((x) => x.neighborhoodId === params.neighborhoodId && x.titleFa === safeTitle && x.status !== 'withdrawn')) {
    return { ok: false, items: current, errorFa: 'گزارش مشابهی قبلاً برای این محله ثبت شده است.' };
  }
  const nextItem: DataCorrectionProposal = {
    id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, neighborhoodId: params.neighborhoodId,
    neighborhoodNameFa: sanitizeInput(params.neighborhoodNameFa, 60), category: params.category, titleFa: safeTitle,
    currentValueFa: params.currentValueFa ? sanitizeInput(params.currentValueFa, 140) : undefined, evidenceSummaryFa: safeEvidence,
    suggestedValueFa: safeSuggested || 'نیازمند بررسی تیم داده', observedDateFa: params.observedDateFa ? sanitizeInput(params.observedDateFa, 30) : 'امروز',
    evidenceAttachments: [], ownerUserId: params.authorProfile.userId, authorProfile: params.authorProfile,
    status: 'submitted', appliedDataVersionId: null, createdAtIso: new Date().toISOString(), createdAtFa: 'امروز',
  };
  const next = [nextItem, ...current];
  writeCommunityJson(CORRECTIONS_KEY, next); saveDataCorrectionDraft(null, params.authorProfile.userId);
  return { ok: true, items: next };
}

export function withdrawDataCorrectionProposal(proposalId: string, actorUserId: string): { ok: boolean; items: DataCorrectionProposal[]; errorFa?: string } {
  const current = loadDataCorrectionProposals();
  if (!isRealAuthenticatedUid(actorUserId)) return { ok: false, items: current, errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  const target = current.find((c) => c.id === proposalId);
  if (!target) return { ok: false, items: current, errorFa: 'پیشنهاد یافت نشد.' };
  const guard = assertCommunityOwner(actorUserId, target.ownerUserId, false);
  if (!guard.ok) return { ok: false, items: current, errorFa: guard.errorFa };
  if (target.status === 'applied' || target.status === 'approved' || target.status === 'verified') {
    return { ok: false, items: current, errorFa: 'پیشنهاد تأیید یا اعمال‌شده قابل انصراف نیست.' };
  }
  const next = current.map((c) => (c.id === proposalId ? { ...c, status: 'withdrawn' as const } : c));
  writeCommunityJson(CORRECTIONS_KEY, next);
  return { ok: true, items: next };
}

export function moderateDataCorrectionProposal(params: {
  proposalId: string; status: Extract<DataCorrectionModerationStatus, 'verified' | 'rejected' | 'approved' | 'applied' | 'needs_evidence' | 'initial_validation' | 'under_review'>; moderatorNoteFa: string;
}): DataCorrectionProposal[] {
  const safeNote = sanitizeInput(params.moderatorNoteFa, 200);
  const next = loadDataCorrectionProposals().map((item) => {
    if (item.id !== params.proposalId) return item;
    const nextVersion = params.status === 'applied' ? `canon-ver-${new Date().toISOString().slice(0, 10)}` : item.appliedDataVersionId ?? null;
    return { ...item, status: params.status, moderatorNoteFa: safeNote, appliedDataVersionId: nextVersion };
  });
  writeCommunityJson(CORRECTIONS_KEY, next);
  return next;
}

export function loadCommunityPosts(): CommunityDiscussionPost[] { return readCommunityJson<CommunityDiscussionPost[]>(DISCUSSIONS_KEY, COMMUNITY_SEED_DISCUSSIONS); }

export function submitCommunityPost(params: {
  track: 'social_discussion' | 'expert_qa'; neighborhoodId: number; neighborhoodNameFa: string;
  topicId?: string; titleFa: string; bodyFa: string; authorProfile: CommunityTrustBadgeProfile;
}): { ok: boolean; items: CommunityDiscussionPost[]; errorFa?: string } {
  if (!isRealAuthenticatedUid(params.authorProfile?.userId)) {
    return { ok: false, items: loadCommunityPosts(), errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  }
  const safeTitle = sanitizeInput(params.titleFa, 120), safeBody = sanitizeInput(params.bodyFa, 500);
  const safety = validateCommunityTextSafety(safeBody);
  if (safeTitle.length < 5) return { ok: false, items: loadCommunityPosts(), errorFa: 'عنوان موضوع حداقل ۵ کاراکتر است.' };
  if (!safety.ok) return { ok: false, items: loadCommunityPosts(), errorFa: safety.errorFa };
  const current = loadCommunityPosts();
  if (current.some((p) => p.ownerUserId === params.authorProfile.userId && p.bodyFa === safeBody)) {
    return { ok: false, items: current, errorFa: 'ارسال تکراری متن مشابه مجاز نیست.' };
  }
  const nextPost: CommunityDiscussionPost = {
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, track: params.track,
    neighborhoodId: params.neighborhoodId, neighborhoodNameFa: sanitizeInput(params.neighborhoodNameFa, 60),
    topicId: params.topicId || 'topic-neighborhoods', tags: [sanitizeInput(params.neighborhoodNameFa, 24)],
    entityLink: { type: 'neighborhood', id: String(params.neighborhoodId), labelFa: `محله ${params.neighborhoodNameFa}` },
    revisionHistory: [], followerIds: [params.authorProfile.userId], titleFa: safeTitle, bodyFa: safeBody,
    ownerUserId: params.authorProfile.userId, authorProfile: params.authorProfile,
    helpfulCount: 0, helpfulVoterIds: [], reactionCounts: { helpful: 0, agree: 0, needs_source: 0, disagree: 0 },
    reactionsByUser: {}, replies: [], status: 'published', createdAtIso: new Date().toISOString(), createdAtFa: 'امروز',
  };
  const next = [nextPost, ...current];
  writeCommunityJson(DISCUSSIONS_KEY, next);
  return { ok: true, items: next };
}

export function replyToCommunityPost(params: {
  postId: string; parentReplyId?: string | null; bodyFa: string; authorProfile: CommunityTrustBadgeProfile;
}): { ok: boolean; items: CommunityDiscussionPost[]; errorFa?: string } {
  const posts = loadCommunityPosts();
  if (!isRealAuthenticatedUid(params.authorProfile?.userId)) return { ok: false, items: posts, errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  const safeBody = sanitizeInput(params.bodyFa, 400);
  const safety = validateCommunityTextSafety(safeBody);
  if (!safety.ok) return { ok: false, items: posts, errorFa: safety.errorFa };
  const target = posts.find((p) => p.id === params.postId);
  if (!target) return { ok: false, items: posts, errorFa: 'گفت‌وگو یافت نشد.' };
  if (target.status === 'locked' || target.status === 'archived') return { ok: false, items: posts, errorFa: 'این گفت‌وگو قفل یا آرشیو شده و امکان ثبت پاسخ جدید ندارد.' };
  const depthCheck = resolveReplyDepth(target.replies, params.parentReplyId);
  if (!depthCheck.ok) return { ok: false, items: posts, errorFa: depthCheck.errorFa };
  const next = posts.map((post) =>
    post.id === params.postId
      ? {
          ...post,
          replies: [
            ...post.replies,
            {
              id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`, parentReplyId: params.parentReplyId ?? null,
              depth: depthCheck.depth, authorProfile: params.authorProfile, bodyFa: safeBody, createdAtFa: 'امروز',
              reactionCounts: { helpful: 0, agree: 0, needs_source: 0, disagree: 0 }, reactionsByUser: {}, status: 'visible' as const,
            },
          ],
        }
      : post,
  );
  writeCommunityJson(DISCUSSIONS_KEY, next);
  return { ok: true, items: next };
}

export function togglePostHelpfulVote(postId: string, voterUserId: string): CommunityDiscussionPost[] {
  if (!isRealAuthenticatedUid(voterUserId)) return loadCommunityPosts();
  const next = loadCommunityPosts().map((post) => {
    if (post.id !== postId) return post;
    const voted = post.helpfulVoterIds.includes(voterUserId);
    const voterIds = voted ? post.helpfulVoterIds.filter((id) => id !== voterUserId) : [...post.helpfulVoterIds, voterUserId];
    const counts = post.reactionCounts ?? { helpful: post.helpfulCount, agree: 0, needs_source: 0, disagree: 0 };
    return {
      ...post, helpfulVoterIds: voterIds, helpfulCount: Math.max(0, post.helpfulCount + (voted ? -1 : 1)),
      reactionCounts: { ...counts, helpful: Math.max(0, counts.helpful + (voted ? -1 : 1)) },
    };
  });
  writeCommunityJson(DISCUSSIONS_KEY, next);
  return next;
}

export function loadCommunityAbuseReports(): CommunityAbuseReport[] { return readCommunityJson<CommunityAbuseReport[]>(ABUSE_REPORTS_KEY, []); }

export function submitCommunityAbuseReport(params: {
  targetType: CommunityAbuseReport['targetType']; targetId: string; reason: CommunityAbuseReason; detailsFa: string; reporterUserId: string;
}): CommunityAbuseReport[] {
  if (!isRealAuthenticatedUid(params.reporterUserId)) return loadCommunityAbuseReports();
  const report: CommunityAbuseReport = {
    id: `abr-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`, targetType: params.targetType,
    targetId: sanitizeInput(params.targetId, 60), reason: params.reason,
    detailsFa: sanitizeInput(params.detailsFa, 240) || 'گزارش‌شده توسط کاربر',
    reporterUserId: params.reporterUserId, status: 'submitted', createdAtIso: new Date().toISOString(),
  };
  const next = [report, ...loadCommunityAbuseReports()];
  writeCommunityJson(ABUSE_REPORTS_KEY, next);
  return next;
}

export function moderateCommunityPost(postId: string, status: DiscussionModerationStatus): CommunityDiscussionPost[] {
  const next = loadCommunityPosts().map((p) => (p.id === postId ? { ...p, status } : p));
  writeCommunityJson(DISCUSSIONS_KEY, next);
  return next;
}

export function loadResearchTopicProposals(): ResearchTopicProposal[] { return readCommunityJson<ResearchTopicProposal[]>(RESEARCH_PROPOSALS_KEY, COMMUNITY_SEED_RESEARCH_PROPOSALS); }

export function submitResearchTopicProposal(params: {
  titleFa: string; questionFa: string; neighborhoodNameFa: string; authorProfile: CommunityTrustBadgeProfile;
}): { ok: boolean; items: ResearchTopicProposal[]; errorFa?: string } {
  if (!isRealAuthenticatedUid(params.authorProfile?.userId)) {
    return { ok: false, items: loadResearchTopicProposals(), errorFa: COMMUNITY_AUTH_REQUIRED_FA };
  }
  const safeTitle = sanitizeInput(params.titleFa, 120), safeQuestion = sanitizeInput(params.questionFa, 320);
  const safety = validateCommunityTextSafety(safeQuestion);
  if (safeTitle.length < 5) return { ok: false, items: loadResearchTopicProposals(), errorFa: 'عنوان موضوع پژوهش حداقل ۵ کاراکتر است.' };
  if (!safety.ok) return { ok: false, items: loadResearchTopicProposals(), errorFa: safety.errorFa };
  const nextItem: ResearchTopicProposal = {
    id: `rprop-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`, titleFa: safeTitle, questionFa: safeQuestion,
    neighborhoodNameFa: sanitizeInput(params.neighborhoodNameFa, 60) || 'کل تهران', authorProfile: params.authorProfile,
    votesCount: 1, voterIds: [params.authorProfile.userId], linkedKnowledgeTab: 'reports', status: 'open', createdAtFa: 'امروز',
  };
  const next = [nextItem, ...loadResearchTopicProposals()];
  writeCommunityJson(RESEARCH_PROPOSALS_KEY, next);
  return { ok: true, items: next };
}

export function voteResearchTopicProposal(proposalId: string, voterUserId: string): ResearchTopicProposal[] {
  if (!isRealAuthenticatedUid(voterUserId)) return loadResearchTopicProposals();
  const next = loadResearchTopicProposals().map((p) => {
    if (p.id !== proposalId) return p;
    const voted = p.voterIds.includes(voterUserId);
    const voterIds = voted ? p.voterIds.filter((id) => id !== voterUserId) : [...p.voterIds, voterUserId];
    return { ...p, voterIds, votesCount: Math.max(0, p.votesCount + (voted ? -1 : 1)) };
  });
  writeCommunityJson(RESEARCH_PROPOSALS_KEY, next);
  return next;
}

export type CommunityAnalyticsEventName =
  | 'community_tab_switch'
  | 'community_view_discussion'
  | 'community_create_discussion'
  | 'community_create_question'
  | 'community_create_answer'
  | 'community_follow_topic'
  | 'community_create_correction'
  | 'community_vote_research';

export function trackCommunityEvent(eventName: string, metadata?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    const key = 'radar_community_telemetry_v2';
    const safeMeta: Record<string, string | number | boolean> = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (/body|text|content|phone|mobile|email|token|auth|lat|lng|coord/i.test(k)) continue;
        if (typeof v === 'string') {
          if (/(09\d{9}|۰۹[۰-۹]{9}|@|Bearer\s)/i.test(v)) continue;
          safeMeta[k] = v.slice(0, 48);
        } else if (typeof v === 'number' || typeof v === 'boolean') {
          safeMeta[k] = v;
        }
      }
    }
    const existing = readCommunityJson<Array<{ schemaVersion: number; event: string; ts: string; meta?: Record<string, string | number | boolean> }>>(key, []);
    writeCommunityJson(key, [{ schemaVersion: 2, event: sanitizeInput(eventName, 48), ts: new Date().toISOString(), meta: safeMeta }, ...existing].slice(0, 40));
  } catch { /* ignore */ }
}
