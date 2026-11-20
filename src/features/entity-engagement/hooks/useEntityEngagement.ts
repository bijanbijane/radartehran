/**
 * @file src/features/entity-engagement/hooks/useEntityEngagement.ts
 * @description React hook uniting Favorites, Follows, Collections, Tags, Notes, and WatchRules with workspace isolation (Stage 8).
 */

import { useCallback, useRef, useState } from 'react';
import {
  CollectionService,
  EngagementSyncCoordinator,
  FavoriteService,
  FollowService,
  WatchRuleService,
  type EngagementEntityRef,
  type EngagementVisibilityScope,
  type EntityType,
  type FollowStatus,
  type WatchConditionType,
} from '../../../platform/entity-engagement';

export interface UseEntityEngagementOptions {
  userId: string;
  workspaceId: string;
  permissionVersion?: number;
}

export function useEntityEngagement(options: UseEntityEngagementOptions) {
  const { userId, workspaceId, permissionVersion = 1 } = options;

  const favoriteServiceRef = useRef<FavoriteService | null>(null);
  if (!favoriteServiceRef.current) favoriteServiceRef.current = new FavoriteService();
  const followServiceRef = useRef<FollowService | null>(null);
  if (!followServiceRef.current) followServiceRef.current = new FollowService();
  const collectionServiceRef = useRef<CollectionService | null>(null);
  if (!collectionServiceRef.current) collectionServiceRef.current = new CollectionService();
  const watchRuleServiceRef = useRef<WatchRuleService | null>(null);
  if (!watchRuleServiceRef.current) watchRuleServiceRef.current = new WatchRuleService();
  const syncRef = useRef<EngagementSyncCoordinator | null>(null);
  if (!syncRef.current) syncRef.current = new EngagementSyncCoordinator();

  const [, setVersionTick] = useState(0);
  const bump = useCallback(() => setVersionTick((v) => v + 1), []);

  // Ensure active contexts are initialized
  favoriteServiceRef.current.getStateStore().setContext(userId, workspaceId, permissionVersion);
  followServiceRef.current.getStateStore().setContext(userId, workspaceId, permissionVersion);
  collectionServiceRef.current.getStateStore().setContext(userId, workspaceId, permissionVersion);
  watchRuleServiceRef.current.setContext(userId, workspaceId, permissionVersion);

  const toggleFavorite = useCallback(
    async (entity: EngagementEntityRef) => {
      const res = await favoriteServiceRef.current!.toggleFavorite({
        userId,
        workspaceId,
        permissionVersion,
        entity,
      });
      syncRef.current!.broadcast({
        eventType: 'FAVORITE_CHANGED',
        userId,
        workspaceId,
        permissionVersion,
        entityType: entity.entityType,
        entityId: entity.id,
      });
      bump();
      return res;
    },
    [userId, workspaceId, permissionVersion, bump]
  );

  const setFollowStatus = useCallback(
    async (entity: EngagementEntityRef, status: FollowStatus) => {
      const res = await followServiceRef.current!.setFollowStatus({
        userId,
        workspaceId,
        permissionVersion,
        entity,
        status,
      });
      syncRef.current!.broadcast({
        eventType: 'FOLLOW_CHANGED',
        userId,
        workspaceId,
        permissionVersion,
        entityType: entity.entityType,
        entityId: entity.id,
      });
      bump();
      return res;
    },
    [userId, workspaceId, permissionVersion, bump]
  );

  const createCollection = useCallback(
    (name: string, description?: string, visibility: EngagementVisibilityScope = 'private') => {
      const res = collectionServiceRef.current!.createCollection({
        userId,
        workspaceId,
        permissionVersion,
        name,
        description,
        visibility,
      });
      bump();
      return res;
    },
    [userId, workspaceId, permissionVersion, bump]
  );

  const upsertNote = useCallback(
    (
      entityType: EntityType,
      entityId: string,
      rawContent: string,
      visibility: EngagementVisibilityScope = 'private'
    ) => {
      const res = collectionServiceRef.current!.upsertPersonalNote({
        userId,
        workspaceId,
        permissionVersion,
        entityType,
        entityId,
        rawContent,
        visibility,
      });
      bump();
      return res;
    },
    [userId, workspaceId, permissionVersion, bump]
  );

  const upsertWatchRule = useCallback(
    (
      entity: EngagementEntityRef,
      conditionType: WatchConditionType,
      thresholdPercent?: number,
      cooldownMinutes = 60
    ) => {
      const res = watchRuleServiceRef.current!.upsertWatchRule({
        userId,
        workspaceId,
        permissionVersion,
        entity,
        conditionType,
        thresholdPercent,
        cooldownMinutes,
      });
      bump();
      return res;
    },
    [userId, workspaceId, permissionVersion, bump]
  );

  const clearForSecurityTransition = useCallback(() => {
    favoriteServiceRef.current!.getStateStore().clearAllForSecurityTransition();
    followServiceRef.current!.getStateStore().clearAllForSecurityTransition();
    collectionServiceRef.current!.getStateStore().clearAllForSecurityTransition();
    watchRuleServiceRef.current!.clearAllForSecurityTransition();
    bump();
  }, [bump]);

  return {
    favorites: favoriteServiceRef.current.getStateStore().listFavorites(),
    follows: followServiceRef.current.getStateStore().listFollows(),
    collections: collectionServiceRef.current.getStateStore().listCollections(),
    watchRules: watchRuleServiceRef.current.listAllRules(userId, workspaceId, permissionVersion),
    toggleFavorite,
    setFollowStatus,
    createCollection,
    upsertNote,
    upsertWatchRule,
    clearForSecurityTransition,
    services: {
      favoriteService: favoriteServiceRef.current,
      followService: followServiceRef.current,
      collectionService: collectionServiceRef.current,
      watchRuleService: watchRuleServiceRef.current,
      syncCoordinator: syncRef.current,
    },
  };
}
