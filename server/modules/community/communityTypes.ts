/** @file server/modules/community/communityTypes.ts — Durable Repository Contracts & Schema Envelope (RT-FE-COMMUNITY-PERSISTENCE-076) */
import type {
  CommunityAbuseReport,
  CommunityDiscussionPost,
  CommunityGovernanceRole,
  CommunityProfile,
  CommunityQuestionItem,
  CommunityTopicNode,
  DataCorrectionProposal,
  ModerationActionRecord,
  ModerationAppeal,
  PrivacySettings,
  ReactionType,
  ReputationEventRecord,
  ResearchTopicProposal,
} from '../../../src/features/community/types/community.types';

export const COMMUNITY_STORE_SCHEMA_VERSION = 2;
export const COMMUNITY_SEED_VERSION = '2026.04.v2';

export interface CommunityPersistedSnapshot {
  schemaVersion: number;
  seedVersion: string;
  updatedAtIso: string;
  discussions: CommunityDiscussionPost[];
  questions: CommunityQuestionItem[];
  corrections: DataCorrectionProposal[];
  researchProposals: ResearchTopicProposal[];
  abuseReports: CommunityAbuseReport[];
  moderationActions: ModerationActionRecord[];
  appeals: ModerationAppeal[];
  profiles: Record<string, CommunityProfile>;
  topicFollowersByTopicId: Record<string, string[]>;
  reputationEvents: ReputationEventRecord[];
}

export interface CommunityStorageAdapter {
  readSnapshot(): CommunityPersistedSnapshot | null;
  writeSnapshot(snapshot: CommunityPersistedSnapshot): void;
  clearSnapshot(): void;
}

export interface CommunityActorContext {
  uid: string;
  displayName?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  role: CommunityGovernanceRole;
}

export interface CommunityDiscussionQuery {
  neighborhoodId?: number | null;
  topicId?: string;
  sort?: 'rank' | 'recent' | 'helpful';
  includeSeeds?: boolean;
}

export interface CommunityQuestionQuery {
  neighborhoodId?: number | null;
  topicId?: string;
  status?: string;
  includeSeeds?: boolean;
}

export interface CommunityMemberListQuery {
  page?: number;
  limit?: number;
  q?: string;
  isViewerMember: boolean;
  viewerUid?: string;
  includeSeeds?: boolean;
}

export interface CommunityMemberListResult {
  items: CommunityProfile[];
  total: number;
  page: number;
  limit: number;
}

export interface CommunityReactionMutationInput {
  targetType?: 'discussion' | 'reply' | 'answer';
  targetId: string;
  reaction: ReactionType;
  uid: string;
}

export interface CommunityPrivacyMutationInput {
  uid: string;
  privacy: Partial<PrivacySettings>;
}

export interface CommunityOverviewSummary {
  topics: CommunityTopicNode[];
  featuredDiscussions: CommunityDiscussionPost[];
  recentQuestions: CommunityQuestionItem[];
  pendingCorrectionsCount: number;
  schemaVersion: number;
  seedVersion: string;
}
