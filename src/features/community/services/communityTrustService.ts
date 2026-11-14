/** @file src/features/community/services/communityTrustService.ts — Stage 25 Trust Axes, Anti-Spam, Multi-Factor Ranking & Corrections Engine */
import { sanitizeInput } from '../../../utils/security';
import {
  COMMUNITY_SEED_CORRECTIONS, COMMUNITY_SEED_DISCUSSIONS, COMMUNITY_SEED_RESEARCH_PROPOSALS,
  readCommunityJson, writeCommunityJson,
} from '../data/communitySeedData';
import type {
  CommunityAbuseReason, CommunityAbuseReport, CommunityDiscussionPost, CommunityProfile, CommunityReplyItem,
  CommunityTrustBadgeProfile, DataCorrectionCategory, DataCorrectionModerationStatus, DataCorrectionProposal,
  DiscussionModerationStatus, ReputationBreakdown, ResearchTopicProposal,
} from '../types/community.types';

const CORRECTIONS_KEY = 'radar_community_data_corrections_v1';
const DISCUSSIONS_KEY = 'radar_community_discussions_v1';
const ABUSE_REPORTS_KEY = 'radar_community_abuse_reports_v1';
const RESEARCH_PROPOSALS_KEY = 'radar_community_research_proposals_v1';
const DRAFT_CORRECTION_KEY = 'radar_community_draft_correction_v1';

export function buildUserTrustProfile(params: {
  userId: string; username?: string; displayNameFa: string; isPhoneVerified: boolean;
  participationScore: number; verifiedCredentialFa?: string | null; reputation?: ReputationBreakdown;
}): CommunityTrustBadgeProfile {
  const safeScore = Math.max(0, Math.round(params.participationScore));
  const tier: CommunityTrustBadgeProfile['participationTierFa'] =
    safeScore >= 50 ? 'مشارکت‌کننده فعال' : safeScore >= 15 ? 'همکار محله' : 'مشارکت‌کننده جدید';
  return {
    userId: params.userId, username: params.username,
    displayNameFa: sanitizeInput(params.displayNameFa, 60) || 'کاربر رادار',
    identityStatus: params.isPhoneVerified ? 'verified_phone' : 'unverified',
    participationScore: safeScore, participationTierFa: tier,
    verifiedCredentialFa: params.verifiedCredentialFa ? sanitizeInput(params.verifiedCredentialFa, 90) : null,
    reputation: params.reputation ?? { data: Math.round(safeScore * 0.6), community: Math.round(safeScore * 0.4), research: 0, sources: 0, professional: 0 },
  };
}

export function sanitizePublicProfile(profile: CommunityProfile, isViewerMember: boolean, isSelf = false): CommunityProfile | null {
  if (profile.visibility === 'private' && !isSelf) return null;
  if (profile.visibility === 'members_only' && !isViewerMember && !isSelf) return null;
  const activeBadges = profile.showBadges ? profile.badges.filter((b) => b.status === 'active') : [];
  return {
    ...profile, badges: activeBadges,
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

export function computeDiscussionMultiFactorRank(post: CommunityDiscussionPost, activeHoodId: number): number {
  const recencyHours = Math.max(1, (Date.now() - Date.parse(post.createdAtIso || new Date().toISOString())) / 3_600_000);
  const recencyBoost = 40 / Math.log2(recencyHours + 2);
  const hoodRelevance = post.neighborhoodId === activeHoodId ? 24 : 0;
  const credentialedReplies = post.replies.filter((r) => Boolean(r.authorProfile.verifiedCredentialFa)).length * 14;
  const substanceBonus = Math.min(20, post.bodyFa.length / 25);
  const reactionSignal = Math.min(18, (post.reactionCounts?.helpful ?? post.helpfulCount) * 0.9);
  const pinBonus = post.pinned ? 15 : 0;
  return Number((recencyBoost + hoodRelevance + credentialedReplies + substanceBonus + reactionSignal + pinBonus).toFixed(2));
}

export function findSimilarQuestionTitles<T extends { id: string; titleFa: string }>(draftTitle: string, existing: readonly T[]): T[] {
  const words = sanitizeInput(draftTitle, 100).split(/\s+/).filter((w) => w.length >= 3);
  if (words.length < 2) return [];
  return existing.filter((q) => words.filter((w) => q.titleFa.includes(w)).length >= 2).slice(0, 3);
}

export function assertCommunityOwner(actorUserId: string, ownerUserId: string, isAdmin = false): { ok: boolean; errorFa?: string } {
  if (isAdmin || (actorUserId && actorUserId === ownerUserId)) return { ok: true };
  return { ok: false, errorFa: 'فقط ثبت‌کننده اصلی یا ناظر مجاز حق تغییر یا حذف این مورد را دارد.' };
}

export function validateCommunityTextSafety(text: string): { ok: boolean; errorFa?: string } {
  const trimmed = text.trim();
  if (trimmed.length < 10) return { ok: false, errorFa: 'متن ارسالی باید حداقل ۱۰ کاراکتر معنادار داشته باشد.' };
  if (/(https?:\/\/|t\.me\/|telegram\.me|wa\.me\/|09\d{9})/i.test(trimmed)) {
    return { ok: false, errorFa: 'درج لینک تبلیغاتی، کانال خارجی یا شماره تماس شخصی در متن عمومی مجاز نیست.' };
  }
  return { ok: true };
}

export function loadDataCorrectionProposals(): DataCorrectionProposal[] {
  return readCommunityJson<DataCorrectionProposal[]>(CORRECTIONS_KEY, COMMUNITY_SEED_CORRECTIONS);
}
export function saveDataCorrectionDraft(draft: Record<string, string | number>): void { writeCommunityJson(DRAFT_CORRECTION_KEY, draft); }
export function loadDataCorrectionDraft(): Record<string, string | number> | null { return readCommunityJson<Record<string, string | number> | null>(DRAFT_CORRECTION_KEY, null); }

export function submitDataCorrectionProposal(params: {
  neighborhoodId: number; neighborhoodNameFa: string; category: DataCorrectionCategory; titleFa: string;
  currentValueFa?: string; evidenceSummaryFa: string; suggestedValueFa: string; observedDateFa?: string; authorProfile: CommunityTrustBadgeProfile;
}): { ok: boolean; items: DataCorrectionProposal[]; errorFa?: string } {
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
  writeCommunityJson(CORRECTIONS_KEY, next); writeCommunityJson(DRAFT_CORRECTION_KEY, null);
  return { ok: true, items: next };
}

export function withdrawDataCorrectionProposal(proposalId: string, actorUserId: string): { ok: boolean; items: DataCorrectionProposal[]; errorFa?: string } {
  const current = loadDataCorrectionProposals();
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
  proposalId: string; status: Extract<DataCorrectionModerationStatus, 'verified' | 'rejected' | 'approved' | 'applied' | 'needs_evidence'>; moderatorNoteFa: string;
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
  const safeBody = sanitizeInput(params.bodyFa, 400);
  const safety = validateCommunityTextSafety(safeBody);
  const posts = loadCommunityPosts();
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
  const next = loadResearchTopicProposals().map((p) => {
    if (p.id !== proposalId) return p;
    const voted = p.voterIds.includes(voterUserId);
    const voterIds = voted ? p.voterIds.filter((id) => id !== voterUserId) : [...p.voterIds, voterUserId];
    return { ...p, voterIds, votesCount: Math.max(0, p.votesCount + (voted ? -1 : 1)) };
  });
  writeCommunityJson(RESEARCH_PROPOSALS_KEY, next);
  return next;
}

export function trackCommunityEvent(eventName: string, metadata?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    const key = 'radar_community_telemetry_v1';
    const existing = readCommunityJson<Array<{ event: string; ts: string; meta?: Record<string, string | number | boolean> }>>(key, []);
    writeCommunityJson(key, [{ event: eventName, ts: new Date().toISOString(), meta: metadata }, ...existing].slice(0, 40));
  } catch { /* ignore */ }
}
