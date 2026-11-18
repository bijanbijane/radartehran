/**
 * @file src/platform/entity-engagement/index.ts
 * @description Public barrel export for Stage 8 Entity Engagement Platform (RT-FE-REBUILD-ENTITY-ENGAGEMENT-008).
 */

export * from './core/EngagementTypes';
export * from './core/EngagementContract';
export * from './core/EngagementRegistry';
export * from './core/EngagementNormalizer';

export * from './favorites/FavoriteState';
export * from './favorites/FavoriteService';

export * from './following/FollowState';
export * from './following/FollowService';

export * from './collections/CollectionPolicy';
export * from './collections/CollectionState';
export * from './collections/CollectionService';

export * from './monitoring/WatchRuleService';
export * from './monitoring/ChangeEventAdapter';
export * from './monitoring/DuplicateSuppression';
export * from './monitoring/AlertEligibility';

export * from './sync/ConflictResolver';
export * from './sync/EngagementSync';
