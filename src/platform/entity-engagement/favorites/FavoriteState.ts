/**
 * @file src/platform/entity-engagement/favorites/FavoriteState.ts
 * @description Workspace-isolated state store for Favorite entities with optimistic update and rollback snapshots (Stage 8).
 */

import {
  buildEngagementEntityCompositeKey,
  buildEngagementIsolationKey,
} from '../core/EngagementContract';
import type {
  EngagementEntityRef,
  EntityType,
  FavoriteRecord,
  OptimisticMutationStatus,
} from '../core/EngagementTypes';

export interface FavoriteEntityEntry {
  record: FavoriteRecord;
  mutationStatus: OptimisticMutationStatus;
  errorFa?: string;
}

export class FavoriteStateStore {
  private storesByContext = new Map<string, Map<string, FavoriteEntityEntry>>();
  private activeContextKey: string | null = null;

  public setContext(userId: string, workspaceId: string, permissionVersion = 1): string {
    const key = buildEngagementIsolationKey(userId, workspaceId, permissionVersion);
    this.activeContextKey = key;
    if (!this.storesByContext.has(key)) {
      this.storesByContext.set(key, new Map());
    }
    return key;
  }

  private getActiveMap(): Map<string, FavoriteEntityEntry> {
    if (!this.activeContextKey) {
      throw new Error('FAVORITE_STATE_NO_ACTIVE_CONTEXT');
    }
    let map = this.storesByContext.get(this.activeContextKey);
    if (!map) {
      map = new Map();
      this.storesByContext.set(this.activeContextKey, map);
    }
    return map;
  }

  public isFavorited(entityType: EntityType, entityId: string): boolean {
    const map = this.getActiveMap();
    return map.has(buildEngagementEntityCompositeKey(entityType, entityId));
  }

  public getFavoriteEntry(entityType: EntityType, entityId: string): FavoriteEntityEntry | null {
    const map = this.getActiveMap();
    return map.get(buildEngagementEntityCompositeKey(entityType, entityId)) ?? null;
  }

  public listFavorites(filterEntityType?: EntityType): FavoriteRecord[] {
    const map = this.getActiveMap();
    const list = Array.from(map.values()).map((e) => e.record);
    if (filterEntityType) {
      return list.filter((r) => r.entity.entityType === filterEntityType);
    }
    return list;
  }

  public setFavoriteRecord(
    record: FavoriteRecord,
    mutationStatus: OptimisticMutationStatus = 'committed'
  ): void {
    const map = this.getActiveMap();
    const compositeKey = buildEngagementEntityCompositeKey(record.entity.entityType, record.entity.id);
    map.set(compositeKey, { record, mutationStatus });
  }

  public removeFavoriteRecord(entityType: EntityType, entityId: string): FavoriteEntityEntry | null {
    const map = this.getActiveMap();
    const compositeKey = buildEngagementEntityCompositeKey(entityType, entityId);
    const previous = map.get(compositeKey) ?? null;
    map.delete(compositeKey);
    return previous;
  }

  public updateEntityLifecycleStatus(
    entityType: EntityType,
    entityId: string,
    lifecycleStatus: EngagementEntityRef['lifecycleStatus']
  ): void {
    const map = this.getActiveMap();
    const compositeKey = buildEngagementEntityCompositeKey(entityType, entityId);
    const entry = map.get(compositeKey);
    if (entry) {
      entry.record = {
        ...entry.record,
        entity: {
          ...entry.record.entity,
          lifecycleStatus,
        },
      };
      map.set(compositeKey, entry);
    }
  }

  public clearAllForSecurityTransition(): void {
    this.storesByContext.clear();
    this.activeContextKey = null;
  }
}
