/**
 * @file src/platform/entity-engagement/following/FollowState.ts
 * @description Workspace-isolated state store for Followed entities with active, paused, and stopped lifecycle states (Stage 8).
 */

import {
  buildEngagementEntityCompositeKey,
  buildEngagementIsolationKey,
} from '../core/EngagementContract';
import type {
  EntityType,
  FollowRecord,
  FollowStatus,
  OptimisticMutationStatus,
} from '../core/EngagementTypes';

export interface FollowEntityEntry {
  record: FollowRecord;
  mutationStatus: OptimisticMutationStatus;
}

export class FollowStateStore {
  private storesByContext = new Map<string, Map<string, FollowEntityEntry>>();
  private activeContextKey: string | null = null;

  public setContext(userId: string, workspaceId: string, permissionVersion = 1): string {
    const key = buildEngagementIsolationKey(userId, workspaceId, permissionVersion);
    this.activeContextKey = key;
    if (!this.storesByContext.has(key)) {
      this.storesByContext.set(key, new Map());
    }
    return key;
  }

  private getActiveMap(): Map<string, FollowEntityEntry> {
    if (!this.activeContextKey) {
      throw new Error('FOLLOW_STATE_NO_ACTIVE_CONTEXT');
    }
    let map = this.storesByContext.get(this.activeContextKey);
    if (!map) {
      map = new Map();
      this.storesByContext.set(this.activeContextKey, map);
    }
    return map;
  }

  public getFollowRecord(entityType: EntityType, entityId: string): FollowRecord | null {
    const entry = this.getActiveMap().get(buildEngagementEntityCompositeKey(entityType, entityId));
    return entry?.record ?? null;
  }

  public isActivelyFollowed(entityType: EntityType, entityId: string): boolean {
    const rec = this.getFollowRecord(entityType, entityId);
    return Boolean(rec && rec.status === 'active');
  }

  public listFollows(statusFilter?: FollowStatus): FollowRecord[] {
    const all = Array.from(this.getActiveMap().values()).map((e) => e.record);
    if (statusFilter) {
      return all.filter((r) => r.status === statusFilter);
    }
    return all;
  }

  public setFollowRecord(
    record: FollowRecord,
    mutationStatus: OptimisticMutationStatus = 'committed'
  ): void {
    const compositeKey = buildEngagementEntityCompositeKey(record.entity.entityType, record.entity.id);
    this.getActiveMap().set(compositeKey, { record, mutationStatus });
  }

  public removeFollowRecord(entityType: EntityType, entityId: string): FollowRecord | null {
    const compositeKey = buildEngagementEntityCompositeKey(entityType, entityId);
    const prev = this.getActiveMap().get(compositeKey);
    this.getActiveMap().delete(compositeKey);
    return prev?.record ?? null;
  }

  public clearAllForSecurityTransition(): void {
    this.storesByContext.clear();
    this.activeContextKey = null;
  }
}
