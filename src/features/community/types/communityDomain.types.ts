/** @file src/features/community/types/communityDomain.types.ts — RT-UI-COMMUNITY-001 Identity, Topics, Reputation, Badges & Reactions */

export type CommunityActivityTrack = 'data_contribution' | 'social_discussion' | 'expert_qa';

export type CommunityHubTabId =
  | 'overview'
  | 'discussions'
  | 'questions'
  | 'data_contribution'
  | 'topics'
  | 'neighborhoods'
  | 'members'
  | 'guidelines'
  | 'social_discussion'
  | 'expert_qa'
  | 'research_proposals';

export type IdentityVerificationStatus = 'verified_phone' | 'unverified';

/** 5 Independent Reputation Axes (§25.11) — Never merged into a single misleading score */
export type ReputationAxis = 'data' | 'community' | 'research' | 'sources' | 'professional';

export interface ReputationBreakdown {
  data: number;
  community: number;
  research: number;
  sources: number;
  professional: number;
}

export interface ReputationEvent {
  id: string;
  userId: string;
  axis: ReputationAxis;
  delta: number;
  reasonFa: string;
  sourceEntityId: string;
  createdAtIso: string;
  createdAtFa: string;
}

/** Time-bounded, auditable trust badge (§25.12) */
export interface TrustBadge {
  id: string;
  code: 'verified_identity' | 'data_reviewer' | 'local_steward' | 'domain_specialist' | 'research_contributor';
  titleFa: string;
  scopeFa: string;
  authorityFa: string;
  criteriaFa: string;
  reviewedAtFa: string;
  expiresAtIso: string;
  status: 'active' | 'expired' | 'suspended';
}

export type ProfileVisibilityLevel = 'public' | 'members_only' | 'private';

/** Strictly zero-PII public community profile (§25.10) */
export interface CommunityProfile {
  userId: string;
  username: string;
  displayNameFa: string;
  bioFa: string;
  visibility: ProfileVisibilityLevel;
  showBadges: boolean;
  showContributions: boolean;
  showFollowedTopics: boolean;
  identityStatus: IdentityVerificationStatus;
  reputation: ReputationBreakdown;
  badges: TrustBadge[];
  followedTopicIds: string[];
  memberSinceFa: string;
  recentPublicSummaryFa: string[];
  /** Audited credential label ONLY from admin specialist review; never derived from participation */
  verifiedCredentialFa: string | null;
}

export interface CommunityTrustBadgeProfile {
  userId: string;
  username?: string;
  displayNameFa: string;
  identityStatus: IdentityVerificationStatus;
  participationScore: number;
  participationTierFa: 'مشارکت‌کننده جدید' | 'همکار محله' | 'مشارکت‌کننده فعال';
  verifiedCredentialFa: string | null;
  reputation?: ReputationBreakdown;
}

export interface TopicItem {
  id: string;
  slug: string;
  titleFa: string;
  categoryFa: string;
  descriptionFa: string;
  followersCount: number;
  activeThreadsCount: number;
}

export interface EntityLink {
  type: 'neighborhood' | 'market' | 'property' | 'research';
  id: string;
  labelFa: string;
}

/** 4 Bounded Reactions (§25.13) — Never acts as truth certification */
export type ReactionType = 'helpful' | 'agree' | 'needs_source' | 'disagree';

export type ReactionCounts = Record<ReactionType, number>;

export const REACTION_LABELS_FA: Record<ReactionType, string> = {
  helpful: 'مفید',
  agree: 'موافقم',
  needs_source: 'نیازمند منبع',
  disagree: 'مخالفم',
};

export const REPUTATION_AXIS_LABELS_FA: Record<ReputationAxis, string> = {
  data: 'مشارکت داده‌ای',
  community: 'تعامل و پاسخ‌گویی',
  research: 'پیشنهاد پژوهش',
  sources: 'ارجاع به منبع معتبر',
  professional: 'صلاحیت تخصصی ممیزی‌شده',
};
