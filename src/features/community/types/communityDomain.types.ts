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

export type IdentityVerificationStatus = 'verified_phone' | 'verified_email' | 'authenticated' | 'unverified';

export type CommunityGovernanceRole =
  | 'guest'
  | 'member'
  | 'verified_contributor'
  | 'content_owner'
  | 'content_moderator'
  | 'data_steward'
  | 'super_admin';

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

export interface ProfessionalCredentialRecord {
  id: string;
  titleFa: string;
  issuerFa?: string;
  status: 'active' | 'expired' | 'revoked';
  expiresAtIso: string;
}

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
  privacy?: Partial<Pick<CommunityProfile, 'visibility' | 'showBadges' | 'showContributions' | 'showFollowedTopics' | 'bioFa' | 'displayNameFa'>>;
  identityStatus: IdentityVerificationStatus;
  isAuthenticated?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  reputation: ReputationBreakdown;
  badges: TrustBadge[];
  credentials?: ProfessionalCredentialRecord[];
  followedTopicIds: string[];
  memberSinceFa: string;
  recentPublicSummaryFa: string[];
  /** Audited credential label ONLY from admin specialist review; never derived from participation */
  verifiedCredentialFa: string | null;
  isSeed?: boolean;
}

/**
 * Stage 73.3: Independent trust and verification dimensions:
 * 1. isAuthenticated (ورود به حساب)
 * 2. isEmailVerified (تأیید ایمیل)
 * 3. isPhoneVerified (تأیید شماره تلفن)
 * 4. participationScore / participationTierFa (اعتبار مشارکت)
 * 5. verifiedCredentialFa (اعتبار حرفه‌ای تأییدشده)
 */
export interface CommunityTrustBadgeProfile {
  userId: string;
  username?: string;
  displayNameFa: string;
  isAuthenticated?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
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
  followerCount?: number;
  isFollowedByMe?: boolean;
  activeThreadsCount: number;
}

export type CommunityTopicNode = TopicItem;

export type PrivacySettings = Pick<
  CommunityProfile,
  'visibility' | 'showBadges' | 'showContributions' | 'showFollowedTopics' | 'bioFa' | 'displayNameFa'
>;

export type ReputationEventRecord = ReputationEvent;

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

