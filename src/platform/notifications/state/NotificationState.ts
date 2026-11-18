/**
 * @file src/platform/notifications/state/NotificationState.ts
 * @description Workspace-isolated state store for NotificationRecord items with snapshot rollback support (Stage 9).
 */

import { buildNotificationCacheKey } from '../core/NotificationContract';
import type { NotificationRecord } from '../core/NotificationTypes';
import { computeUnreadCountSummary, type UnreadCountSummary } from './UnreadCounter';

export class NotificationStateStore {
  private bucketsByContext = new Map<string, Map<string, NotificationRecord>>();
  private activeUserId = '';
  private activeWorkspaceId = '';
  private activePermissionVersion = 1;

  public setContext(userId: string, workspaceId: string, permissionVersion = 1): string {
    const key = buildNotificationCacheKey({
      userId,
      workspaceId,
      permissionVersion,
      filterHash: 'store',
      page: 1,
    });
    this.activeUserId = userId;
    this.activeWorkspaceId = workspaceId;
    this.activePermissionVersion = permissionVersion;
    if (!this.bucketsByContext.has(key)) {
      this.bucketsByContext.set(key, new Map());
    }
    return key;
  }

  private getActiveMap(): Map<string, NotificationRecord> {
    const key = buildNotificationCacheKey({
      userId: this.activeUserId,
      workspaceId: this.activeWorkspaceId,
      permissionVersion: this.activePermissionVersion,
      filterHash: 'store',
      page: 1,
    });
    let m = this.bucketsByContext.get(key);
    if (!m) {
      m = new Map();
      this.bucketsByContext.set(key, m);
    }
    return m;
  }

  public listRecords(): NotificationRecord[] {
    return Array.from(this.getActiveMap().values());
  }

  public getRecord(id: string): NotificationRecord | null {
    return this.getActiveMap().get(id) ?? null;
  }

  public upsertRecord(record: NotificationRecord): void {
    if (record.userId !== this.activeUserId || record.workspaceId !== this.activeWorkspaceId) {
      throw new Error('NOTIFICATION_CROSS_TENANT_WRITE_REJECTED');
    }
    this.getActiveMap().set(record.id, record);
  }

  public captureSnapshot(): NotificationRecord[] {
    return this.listRecords().map((r) => ({ ...r, deliveries: [...r.deliveries] }));
  }

  public restoreSnapshot(snapshot: NotificationRecord[]): void {
    const map = this.getActiveMap();
    map.clear();
    for (const r of snapshot) {
      map.set(r.id, r);
    }
  }

  public getUnreadSummary(): UnreadCountSummary {
    return computeUnreadCountSummary(
      this.listRecords(),
      this.activeUserId,
      this.activeWorkspaceId
    );
  }

  public clearAllForSecurityTransition(): void {
    this.bucketsByContext.clear();
    this.activeUserId = '';
    this.activeWorkspaceId = '';
  }
}
