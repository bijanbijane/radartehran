/**
 * @file src/platform/entity-engagement/core/EngagementTypes.ts
 * @description Canonical data contracts for Stage 8 Entity Engagement (Favorites, Follows, Personal Collections, Tags, Notes, Watch Rules, Change Events, and Alert Eligibility).
 */

export type EntityType =
  | 'property'
  | 'listing'
  | 'building'
  | 'neighborhood';

export interface EngagementEntityRef {
  id: string;
  entityType: EntityType;
  title: string;
  canonicalPath: string;
  cityId?: string;
  neighborhoodId?: string;
  lifecycleStatus?: 'active' | 'expired' | 'removed' | 'archived' | 'deleted' | 'restricted';
}

export interface FavoriteRecord {
  id: string;
  userId: string;
  workspaceId: string;
  entity: EngagementEntityRef;
  createdAt: string;
}

export type FollowStatus = 'active' | 'paused' | 'stopped';

export interface FollowRecord {
  id: string;
  userId: string;
  workspaceId: string;
  entity: EngagementEntityRef;
  status: FollowStatus;
  createdAt: string;
  updatedAt: string;
}

export type EngagementVisibilityScope = 'private' | 'workspace';

export interface PersonalCollection {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  description?: string;
  visibility: EngagementVisibilityScope;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionMembership {
  id: string;
  collectionId: string;
  entity: EngagementEntityRef;
  addedByUserId: string;
  addedAt: string;
  sortOrder?: number;
}

export interface EntityTag {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  colorToken?: string;
}

export interface EntityTagAssignment {
  id: string;
  tagId: string;
  userId: string;
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  assignedAt: string;
}

export interface EntityPersonalNote {
  id: string;
  userId: string;
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  content: string;
  visibility: EngagementVisibilityScope;
  createdAt: string;
  updatedAt: string;
}

export type WatchConditionType =
  | 'price_drop'
  | 'price_change'
  | 'status_change'
  | 'new_listing_in_building'
  | 'new_listing_in_neighborhood'
  | 'neighborhood_index_change';

export interface WatchRule {
  id: string;
  userId: string;
  workspaceId: string;
  entity: EngagementEntityRef;

  conditionType: WatchConditionType;

  thresholdPercent?: number;
  thresholdAbsolute?: number;

  cooldownMinutes: number;
  enabled: boolean;

  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string;
}

export type ChangeEventConfidence =
  | 'verified'
  | 'estimated'
  | 'unverified'
  | 'conflicting'
  | 'unknown';

export interface EntityChangeEvent {
  id: string;
  entity: EngagementEntityRef;
  changeType: WatchConditionType;
  previousValue?: unknown;
  currentValue?: unknown;
  deltaPercent?: number | null;
  deltaAbsolute?: number | null;
  confidence: ChangeEventConfidence;
  sourceId: string;
  observedAt: string;
}

export interface AlertEligibilityDecision {
  eligible: boolean;
  reasonCode:
    | 'ELIGIBLE_FOR_STAGE9'
    | 'RULE_DISABLED'
    | 'FOLLOW_PAUSED_OR_STOPPED'
    | 'ENTITY_MISMATCH'
    | 'CONDITION_MISMATCH'
    | 'LOW_DATA_CONFIDENCE'
    | 'BELOW_PERCENT_THRESHOLD'
    | 'BELOW_ABSOLUTE_THRESHOLD'
    | 'NOT_A_PRICE_DROP'
    | 'COOLDOWN_ACTIVE'
    | 'DUPLICATE_SUPPRESSED'
    | 'ACCESS_DENIED';
  reasonFa: string;
  dedupeKey?: string;
  matchedRuleId?: string;
  evaluatedAt: string;
}

export type OptimisticMutationStatus = 'idle' | 'pending' | 'committed' | 'rolled_back';
