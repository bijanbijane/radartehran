/**
 * @file src/platform/entity-engagement/following/FollowService.ts
 * @description Service for Following, Pausing, Resuming, and Unfollowing entities completely independent of FavoriteService (Stage 8).
 */

import {
  buildEngagementEntityCompositeKey,
  ensureValidEngagementEntityRef,
} from '../core/EngagementContract';
import type {
  EngagementEntityRef,
  EntityType,
  FollowRecord,
  FollowStatus,
} from '../core/EngagementTypes';
import { FollowStateStore } from './FollowState';

export interface FollowMutationResult {
  ok: boolean;
  record: FollowRecord | null;
  rolledBack: boolean;
  errorFa?: string;
}

export type FollowRemoteExecutor = (params: {
  status: FollowStatus;
  userId: string;
  workspaceId: string;
  entity: EngagementEntityRef;
}) => Promise<FollowRecord>;

export class FollowService {
  private inFlightKeys = new Set<string>();

  constructor(
    private readonly stateStore: FollowStateStore = new FollowStateStore(),
    private remoteExecutor?: FollowRemoteExecutor
  ) {}

  public getStateStore(): FollowStateStore {
    return this.stateStore;
  }

  public setRemoteExecutor(executor: FollowRemoteExecutor): void {
    this.remoteExecutor = executor;
  }

  public async setFollowStatus(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    entity: Partial<EngagementEntityRef>;
    status: FollowStatus;
  }): Promise<FollowMutationResult> {
    this.stateStore.setContext(params.userId, params.workspaceId, params.permissionVersion ?? 1);
    const validEntity = ensureValidEngagementEntityRef(params.entity);
    const compositeKey = buildEngagementEntityCompositeKey(validEntity.entityType, validEntity.id);

    if (this.inFlightKeys.has(compositeKey)) {
      return {
        ok: false,
        record: this.stateStore.getFollowRecord(validEntity.entityType, validEntity.id),
        rolledBack: false,
        errorFa: 'درخواست قبلی دنبال‌کردن این موجودیت هنوز در حال پردازش است.',
      };
    }

    this.inFlightKeys.add(compositeKey);
    const previousRecord = this.stateStore.getFollowRecord(validEntity.entityType, validEntity.id);
    const now = new Date().toISOString();

    const optimisticRecord: FollowRecord = {
      id: previousRecord?.id || `fol:${params.userId}:${params.workspaceId}:${validEntity.entityType}:${validEntity.id}`,
      userId: params.userId,
      workspaceId: params.workspaceId,
      entity: validEntity,
      status: params.status,
      createdAt: previousRecord?.createdAt || now,
      updatedAt: now,
    };

    try {
      this.stateStore.setFollowRecord(optimisticRecord, 'pending');
      if (this.remoteExecutor) {
        const remote = await this.remoteExecutor({
          status: params.status,
          userId: params.userId,
          workspaceId: params.workspaceId,
          entity: validEntity,
        });
        this.stateStore.setFollowRecord(remote, 'committed');
        return { ok: true, record: remote, rolledBack: false };
      }
      this.stateStore.setFollowRecord(optimisticRecord, 'committed');
      return { ok: true, record: optimisticRecord, rolledBack: false };
    } catch (err: unknown) {
      if (previousRecord) {
        this.stateStore.setFollowRecord(previousRecord, 'rolled_back');
      } else {
        this.stateStore.removeFollowRecord(validEntity.entityType, validEntity.id);
      }
      return {
        ok: false,
        record: previousRecord,
        rolledBack: true,
        errorFa: err instanceof Error ? err.message : 'خطا در تغییر وضعیت دنبال‌کردن؛ وضعیت قبلی بازیابی شد.',
      };
    } finally {
      this.inFlightKeys.delete(compositeKey);
    }
  }

  public getStatus(
    userId: string,
    workspaceId: string,
    entityType: EntityType,
    entityId: string,
    permissionVersion = 1
  ): FollowStatus {
    this.stateStore.setContext(userId, workspaceId, permissionVersion);
    return this.stateStore.getFollowRecord(entityType, entityId)?.status ?? 'stopped';
  }
}
