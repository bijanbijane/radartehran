/**
 * @file src/platform/notifications/state/NotificationCache.ts
 * @description Workspace/User/PermissionVersion-isolated cache for Notification Center queries (Stage 9).
 */

import { buildNotificationCacheKey } from '../core/NotificationContract';
import type { NotificationRecord } from '../core/NotificationTypes';

export class NotificationCache {
  private entries = new Map<string, { items: NotificationRecord[]; storedAt: number; ttlMs: number }>();

  public set(
    params: {
      userId: string;
      workspaceId: string;
      permissionVersion: number;
      filterHash?: string;
      page?: number;
    },
    items: NotificationRecord[],
    ttlMs = 30_000
  ): string {
    const key = buildNotificationCacheKey(params);
    this.entries.set(key, { items: [...items], storedAt: Date.now(), ttlMs });
    return key;
  }

  public get(
    params: {
      userId: string;
      workspaceId: string;
      permissionVersion: number;
      filterHash?: string;
      page?: number;
    },
    nowMs = Date.now()
  ): NotificationRecord[] | null {
    const key = buildNotificationCacheKey(params);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (nowMs - entry.storedAt > entry.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return [...entry.items];
  }

  public invalidateUserWorkspace(userId: string, workspaceId: string): void {
    const prefix = `notifications:${userId}:${workspaceId}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  public clearAll(): void {
    this.entries.clear();
  }
}
