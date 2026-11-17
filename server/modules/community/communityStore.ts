/** @file server/modules/community/communityStore.ts — Durable Server-Side Community State, Privacy Stripping & Governance Store */
import { sanitizeInput } from '../../../src/utils/security';
import { AtomicJsonRepository } from '../shared/atomicJsonRepository';
import {
  COMMUNITY_MEMBER_PROFILES,
  COMMUNITY_SEED_QUESTIONS,
  COMMUNITY_TOPICS_REGISTRY,
  SEED_MODERATION_ACTIONS,
  SEED_MODERATION_APPEALS,
} from '../../../src/features/community/data/communityTopicsAndSeeds';
import {
  COMMUNITY_SEED_CORRECTIONS,
  COMMUNITY_SEED_DISCUSSIONS,
  COMMUNITY_SEED_RESEARCH_PROPOSALS,
} from '../../../src/features/community/data/communitySeedData';
import type {
  CommunityAbuseReport,
  CommunityDiscussionPost,
  CommunityProfile,
  CommunityQuestionItem,
  CommunityTrustBadgeProfile,
  DataCorrectionProposal,
  ModerationActionRecord,
  ModerationAppeal,
  ResearchTopicProposal,
} from '../../../src/features/community/types/community.types';
import {
  resolveReplyDepth,
  sanitizePublicProfile,
  validateCommunityTextSafety,
} from '../../../src/features/community/services/communityTrustService';

export interface ServerCommunityState {
  discussions: CommunityDiscussionPost[];
  questions: CommunityQuestionItem[];
  corrections: DataCorrectionProposal[];
  researchProposals: ResearchTopicProposal[];
  abuseReports: CommunityAbuseReport[];
  moderationActions: ModerationActionRecord[];
  appeals: ModerationAppeal[];
  profiles: Record<string, CommunityProfile>;
}

const clone = <T>(val: T): T => JSON.parse(JSON.stringify(val));
const communityFileRepo = new AtomicJsonRepository<ServerCommunityState>('community-state.json');

export function createInitialCommunityState(): ServerCommunityState {
  const profiles: Record<string, CommunityProfile> = {};
  for (const p of COMMUNITY_MEMBER_PROFILES) profiles[p.username] = clone(p);
  return {
    discussions: clone(COMMUNITY_SEED_DISCUSSIONS),
    questions: clone(COMMUNITY_SEED_QUESTIONS),
    corrections: clone(COMMUNITY_SEED_CORRECTIONS),
    researchProposals: clone(COMMUNITY_SEED_RESEARCH_PROPOSALS),
    abuseReports: [],
    moderationActions: clone(SEED_MODERATION_ACTIONS),
    appeals: clone(SEED_MODERATION_APPEALS),
    profiles,
  };
}

export const communityServerStore: ServerCommunityState = communityFileRepo.load(createInitialCommunityState);

export function persistCommunityServerStore(immediate = false): void {
  if (immediate) communityFileRepo.writeImmediate(communityServerStore);
  else communityFileRepo.saveDebounced(communityServerStore);
}

export function resetCommunityServerStoreForTests(): void {
  communityFileRepo.resetInMemoryCacheForTests();
  const fresh = createInitialCommunityState();
  communityServerStore.discussions = fresh.discussions;
  communityServerStore.questions = fresh.questions;
  communityServerStore.corrections = fresh.corrections;
  communityServerStore.researchProposals = fresh.researchProposals;
  communityServerStore.abuseReports = fresh.abuseReports;
  communityServerStore.moderationActions = fresh.moderationActions;
  communityServerStore.appeals = fresh.appeals;
  communityServerStore.profiles = fresh.profiles;
}

export function resolveServerAuthorProfile(uid: string, requestedDisplayName?: string): CommunityTrustBadgeProfile {
  const existing = Object.values(communityServerStore.profiles).find((p) => p.userId === uid);
  if (existing) {
    const score = existing.reputation.data + existing.reputation.community;
    return {
      userId: uid,
      username: existing.username,
      displayNameFa: existing.displayNameFa,
      identityStatus: existing.identityStatus,
      participationScore: score,
      participationTierFa: score >= 50 ? 'مشارکت‌کننده فعال' : score >= 15 ? 'همکار محله' : 'مشارکت‌کننده جدید',
      verifiedCredentialFa: existing.verifiedCredentialFa,
      reputation: existing.reputation,
    };
  }
  return {
    userId: uid,
    username: `user_${uid.slice(0, 6)}`,
    displayNameFa: sanitizeInput(requestedDisplayName || 'کاربر احرازشده رادار', 50),
    identityStatus: 'verified_phone',
    participationScore: 0,
    participationTierFa: 'مشارکت‌کننده جدید',
    verifiedCredentialFa: null,
    reputation: { data: 0, community: 0, research: 0, sources: 0, professional: 0 },
  };
}

export function getPublicMemberByUsername(username: string, isViewerMember: boolean, viewerUid?: string): CommunityProfile | null {
  const cleanUser = sanitizeInput(username, 40).toLowerCase();
  const matched = Object.values(communityServerStore.profiles).find((p) => p.username.toLowerCase() === cleanUser);
  if (!matched) return null;
  return sanitizePublicProfile(matched, isViewerMember, viewerUid === matched.userId);
}

export function listAllCommunityTopics() {
  return COMMUNITY_TOPICS_REGISTRY;
}

export function addServerDiscussionReply(postId: string, bodyFa: string, parentReplyId: string | null, uid: string): { ok: boolean; status: number; message: string; post?: CommunityDiscussionPost } {
  const post = communityServerStore.discussions.find((d) => d.id === postId);
  if (!post) return { ok: false, status: 404, message: 'DISCUSSION_NOT_FOUND' };
  if (post.status === 'locked' || post.status === 'archived') {
    return { ok: false, status: 409, message: 'DISCUSSION_LOCKED' };
  }
  const safety = validateCommunityTextSafety(bodyFa);
  if (!safety.ok) return { ok: false, status: 422, message: safety.errorFa || 'INVALID_TEXT' };
  const depth = resolveReplyDepth(post.replies, parentReplyId);
  if (!depth.ok) return { ok: false, status: 422, message: depth.errorFa || 'MAX_REPLY_DEPTH_EXCEEDED' };

  post.replies.push({
    id: `srv-rep-${Date.now()}`,
    parentReplyId,
    depth: depth.depth,
    authorProfile: resolveServerAuthorProfile(uid),
    bodyFa: sanitizeInput(bodyFa, 400),
    createdAtFa: 'امروز',
    reactionCounts: { helpful: 0, agree: 0, needs_source: 0, disagree: 0 },
    reactionsByUser: {},
    status: 'visible',
  });
  persistCommunityServerStore();
  return { ok: true, status: 201, message: 'CREATED', post };
}
