/**
 * @file src/platform/entity-engagement/favorites/FavoriteService.ts
 * @description Service for Favoriting/Unfavoriting entities with in-flight deduplication, optimistic UI, and rollback on failure (Stage 8).
 */

import {
  buildEngagementEntityCompositeKey,
  ensureValidEngagementEntityRef,
} from '../core/EngagementContract';
import type {
  EngagementEntityRef,
  EntityType,
  FavoriteRecord,
} from '../core/EngagementTypes';
import { FavoriteStateStore } from './FavoriteState';

export interface FavoriteMutationResult {
  ok: boolean;
  favorited: boolean;
  record: FavoriteRecord | null;
  rolledBack: boolean;
  errorFa?: string;
}

export type FavoriteRemoteExecutor = (params: {
  action: 'add' | 'remove';
  userId: string;
  workspaceId: string;
  entity: EngagementEntityRef;
}) => Promise<FavoriteRecord | null>;

export class FavoriteService {
  private inFlightKeys = new Set<string>();

  constructor(
    private readonly stateStore: FavoriteStateStore = new FavoriteStateStore(),
    private remoteExecutor?: FavoriteRemoteExecutor
  ) {}

  public getStateStore(): FavoriteStateStore {
    return this.stateStore;
  }

  public setRemoteExecutor(executor: FavoriteRemoteExecutor): void {
    this.remoteExecutor = executor;
  }

  public isInFlight(entityType: EntityType, entityId: string): boolean {
    return this.inFlightKeys.has(buildEngagementEntityCompositeKey(entityType, entityId));
  }

  public async toggleFavorite(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    entity: Partial<EngagementEntityRef>;
  }): Promise<FavoriteMutationResult> {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const validEntity = ensureValidEngagementEntityRef(params.entity);
    const compositeKey = buildEngagementEntityCompositeKey(validEntity.entityType, validEntity.id);

    if (this.inFlightKeys.has(compositeKey)) {
      const current = this.stateStore.getFavoriteEntry(validEntity.entityType, validEntity.id);
      return {
        ok: false,
        favorited: Boolean(current),
        record: current?.record ?? null,
        rolledBack: false,
        errorFa: 'عملیات قبلی روی این موجودیت هنوز در حال انجام است.',
      };
    }

    this.inFlightKeys.add(compositeKey);
    const previousEntry = this.stateStore.getFavoriteEntry(validEntity.entityType, validEntity.id);
    const currentlyFavorited = Boolean(previousEntry);

    try {
      if (!currentlyFavorited) {
        const optimisticRecord: FavoriteRecord = {
          id: `fav:${params.userId}:${params.workspaceId}:${validEntity.entityType}:${validEntity.id}`,
          userId: params.userId,
          workspaceId: params.workspaceId,
          entity: validEntity,
          createdAt: new Date().toISOString(),
        };
        this.stateStore.setFavoriteRecord(optimisticRecord, 'pending');

        if (this.remoteExecutor) {
          const remoteRecord = await this.remoteExecutor({
            action: 'add',
            userId: params.userId,
            workspaceId: params.workspaceId,
            entity: validEntity,
          });
          const finalRecord = remoteRecord ?? optimisticRecord;
          this.stateStore.setFavoriteRecord(finalRecord, 'committed');
          return {
            ok: true,
            favorited: true,
            record: finalRecord,
            rolledBack: false,
          };
        }

        this.stateStore.setFavoriteRecord(optimisticRecord, 'committed');
        return {
          ok: true,
          favorited: true,
          record: optimisticRecord,
          rolledBack: false,
        };
      } else {
        this.stateStore.removeFavoriteRecord(validEntity.entityType, validEntity.id);

        if (this.remoteExecutor) {
          await this.remoteExecutor({
            action: 'remove',
            userId: params.userId,
            workspaceId: params.workspaceId,
            entity: validEntity,
          });
        }

        return {
          ok: true,
          favorited: false,
          record: null,
          rolledBack: false,
        };
      }
    } catch (err: unknown) {
      // Rollback to exact previous state on server failure
      if (currentlyFavorited && previousEntry) {
        this.stateStore.setFavoriteRecord(previousEntry.record, 'rolled_back');
      } else {
        this.stateStore.removeFavoriteRecord(validEntity.entityType, validEntity.id);
      }

      return {
        ok: false,
        favorited: currentlyFavorited,
        record: previousEntry?.record ?? null,
        rolledBack: true,
        errorFa: err instanceof Error ? err.message : 'خطا در ثبت علاقه‌مندی؛ وضعیت قبلی بازیابی شد.',
      };
    } finally {
      this.inFlightKeys.delete(compositeKey);
    }
  }
}
