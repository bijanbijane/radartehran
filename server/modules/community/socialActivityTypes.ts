/**
 * @file server/modules/community/socialActivityTypes.ts
 * @description RT-SOCIAL-IMPL-004 & RT-SOCIAL-IMPL-005 — Canonical Social Activity Ledger Contracts.
 */
import type {
  ReactionType,
  SocialContentContext,
} from '../../../src/features/community/types/communityDomain.types';

export type SocialContentActivityEventType =
  | 'content.created'
  | 'comment.created'
  | 'question.answered';

export type SocialRelationshipActivityEventType =
  | 'social.follow.created.v1'
  | 'social.follow.removed.v1'
  | 'social.reaction.created.v1'
  | 'social.reaction.removed.v1';

export type SocialActivityEventType =
  | SocialContentActivityEventType
  | SocialRelationshipActivityEventType;

export type SocialActivityObjectType =
  | 'discussion'
  | 'question'
  | 'correction'
  | 'research_proposal'
  | 'comment'
  | 'answer'
  | 'user'
  | 'topic'
  | 'post'
  | 'follow'
  | 'reaction';

export type SocialActivityVisibility = 'public' | 'restricted';

export interface SocialActivityContextSnapshot {
  primary: {
    entityType: string;
    entityId: string;
  } | null;
  related: Array<{
    entityType: string;
    entityId: string;
  }>;
  schemaVersion: 1;
}

export interface SocialActivityRecord extends Record<string, unknown> {
  id: string;
  eventType: SocialActivityEventType;
  actorUid: string;
  objectType: SocialActivityObjectType;
  objectId: string;
  parentObjectId?: string;
  reactionType?: ReactionType;
  followScope?: 'topic' | 'post' | 'user';
  followTargetId?: string;
  operationId?: string;
  metadata?: Record<string, unknown>;
  socialContext?: SocialActivityContextSnapshot;
  visibility: SocialActivityVisibility;
  createdAtIso: string;
  schemaVersion: 1;
}

export interface AppendSocialActivityInput {
  eventType: SocialActivityEventType;
  actorUid: string;
  verifiedActorUid?: string;
  objectType: SocialActivityObjectType;
  objectId: string;
  parentObjectId?: string;
  reactionType?: ReactionType;
  followScope?: 'topic' | 'post' | 'user';
  followTargetId?: string;
  operationId?: string;
  metadata?: Record<string, unknown>;
  socialContext?: SocialContentContext;
  visibility?: SocialActivityVisibility;
  createdAtIso?: string;
}
