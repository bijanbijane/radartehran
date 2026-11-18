/**
 * @file src/platform/notifications/inbox/NotificationInboxService.ts
 * @description Service managing Notification Inbox operations (read, unread, markAllRead, archive, dismiss) with optimistic UI and snapshot rollback (Stage 9).
 */

import { normalizeNotificationRecord } from '../core/NotificationNormalizer';
import { canUserAccessNotification } from '../core/NotificationPolicy';
import type {
  NotificationRecord,
  NotificationStatus,
} from '../core/NotificationTypes';
import { NotificationDeduplicator } from '../grouping/NotificationDeduplication';
import { NotificationCache } from '../state/NotificationCache';
import { NotificationStateStore } from '../state/NotificationState';
import { paginateNotifications, type NotificationPaginatedSlice } from './NotificationPagination';
import {
  queryAndSortNotifications,
  serializeNotificationFilterHash,
  type NotificationInboxFilter,
} from './NotificationQuery';

export type NotificationRemoteMutationExecutor = (params: {
  action: 'mark_read' | 'mark_unread' | 'mark_all_read' | 'archive' | 'dismiss';
  userId: string;
  workspaceId: string;
  notificationIds: string[];
}) => Promise<void>;

export class NotificationInboxService {
  private readonly deduplicator = new NotificationDeduplicator();
  private readonly cache = new NotificationCache();

  constructor(
    private readonly stateStore: NotificationStateStore = new NotificationStateStore(),
    private remoteExecutor?: NotificationRemoteMutationExecutor
  ) {}

  public getStateStore(): NotificationStateStore {
    return this.stateStore;
  }

  public getCache(): NotificationCache {
    return this.cache;
  }

  public setRemoteExecutor(executor: NotificationRemoteMutationExecutor): void {
    this.remoteExecutor = executor;
  }

  public ingestNotifications(
    userId: string,
    workspaceId: string,
    incomingRaw: Array<Partial<NotificationRecord>>,
    permissionVersion = 1
  ): NotificationRecord[] {
    this.stateStore.setContext(userId, workspaceId, permissionVersion);
    const normalized = incomingRaw
      .map(normalizeNotificationRecord)
      .filter((r) => canUserAccessNotification(r, userId, workspaceId));

    const existing = this.stateStore.listRecords();
    const merged = this.deduplicator.deduplicateRecords([...existing, ...normalized]);

    for (const rec of merged) {
      this.stateStore.upsertRecord(rec);
    }

    this.cache.invalidateUserWorkspace(userId, workspaceId);
    return this.stateStore.listRecords();
  }

  public queryInbox(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    filter?: NotificationInboxFilter;
    page?: number;
    pageSize?: number;
  }): NotificationPaginatedSlice {
    const permissionVersion = params.permissionVersion ?? 1;
    this.stateStore.setContext(params.userId, params.workspaceId, permissionVersion);
    const filterHash = serializeNotificationFilterHash(params.filter);

    const allRecords = this.stateStore.listRecords();
    const filteredSorted = queryAndSortNotifications(allRecords, params.filter);
    this.cache.set(
      {
        userId: params.userId,
        workspaceId: params.workspaceId,
        permissionVersion,
        filterHash,
        page: params.page ?? 1,
      },
      filteredSorted
    );

    return paginateNotifications(filteredSorted, params.page ?? 1, params.pageSize ?? 20);
  }

  public async updateStatus(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
    notificationIds: string[];
    nextStatus: NotificationStatus;
  }): Promise<{ ok: boolean; rolledBack: boolean; errorFa?: string }> {
    const permissionVersion = params.permissionVersion ?? 1;
    this.stateStore.setContext(params.userId, params.workspaceId, permissionVersion);
    const snapshot = this.stateStore.captureSnapshot();
    const now = new Date().toISOString();

    for (const id of params.notificationIds) {
      const rec = this.stateStore.getRecord(id);
      if (!rec) continue;
      const updated: NotificationRecord = {
        ...rec,
        status: params.nextStatus,
        readAt: params.nextStatus === 'read' ? rec.readAt || now : params.nextStatus === 'unread' ? undefined : rec.readAt,
        archivedAt: params.nextStatus === 'archived' ? now : rec.archivedAt,
      };
      this.stateStore.upsertRecord(updated);
    }

    this.cache.invalidateUserWorkspace(params.userId, params.workspaceId);

    try {
      if (this.remoteExecutor) {
        const action =
          params.nextStatus === 'read'
            ? 'mark_read'
            : params.nextStatus === 'unread'
              ? 'mark_unread'
              : params.nextStatus === 'archived'
                ? 'archive'
                : 'dismiss';
        await this.remoteExecutor({
          action,
          userId: params.userId,
          workspaceId: params.workspaceId,
          notificationIds: params.notificationIds,
        });
      }
      return { ok: true, rolledBack: false };
    } catch (err: unknown) {
      this.stateStore.restoreSnapshot(snapshot);
      this.cache.invalidateUserWorkspace(params.userId, params.workspaceId);
      return {
        ok: false,
        rolledBack: true,
        errorFa: err instanceof Error ? err.message : 'خطا در بروزرسانی وضعیت اعلان؛ وضعیت قبلی بازیابی شد.',
      };
    }
  }

  public async markAllAsRead(params: {
    userId: string;
    workspaceId: string;
    permissionVersion?: number;
  }): Promise<{ ok: boolean; rolledBack: boolean; updatedCount: number; errorFa?: string }> {
    const permissionVersion = params.permissionVersion ?? 1;
    this.stateStore.setContext(params.userId, params.workspaceId, permissionVersion);
    const unreadIds = this.stateStore
      .listRecords()
      .filter((r) => r.status === 'unread')
      .map((r) => r.id);

    if (unreadIds.length === 0) {
      return { ok: true, rolledBack: false, updatedCount: 0 };
    }

    const res = await this.updateStatus({
      userId: params.userId,
      workspaceId: params.workspaceId,
      permissionVersion,
      notificationIds: unreadIds,
      nextStatus: 'read',
    });

    return {
      ...res,
      updatedCount: res.ok ? unreadIds.length : 0,
    };
  }
}
