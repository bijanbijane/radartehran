/**
 * @file src/platform/search/history/SavedSearchAdapter.ts
 * @description Workspace-isolated Saved Search store completely decoupled from RecentSearch deletion.
 */

import type { SearchRequest } from '../core/SearchTypes';

export interface SavedSearchEntity {
  id: string;
  userId: string;
  workspaceId: string;
  titleFa: string;
  request: SearchRequest;
  alertsEnabled: boolean;
  createdAtIso: string;
}

export class SavedSearchManager {
  private readonly store = new Map<string, SavedSearchEntity[]>();

  private getBucketKey(userId: string, workspaceId: string): string {
    return `saved_searches:${userId}:${workspaceId}`;
  }

  saveSearch(params: {
    userId: string;
    workspaceId: string;
    titleFa: string;
    request: SearchRequest;
    alertsEnabled?: boolean;
  }): SavedSearchEntity {
    const key = this.getBucketKey(params.userId, params.workspaceId);
    const list = this.store.get(key) ?? [];
    const entity: SavedSearchEntity = {
      id: `svd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: params.userId,
      workspaceId: params.workspaceId,
      titleFa: params.titleFa.trim() || params.request.rawQuery || 'جست‌وجوی ذخیره‌شده',
      request: { ...params.request },
      alertsEnabled: Boolean(params.alertsEnabled),
      createdAtIso: new Date().toISOString(),
    };
    this.store.set(key, [entity, ...list]);
    return entity;
  }

  listSaved(userId: string, workspaceId: string): SavedSearchEntity[] {
    const key = this.getBucketKey(userId, workspaceId);
    return [...(this.store.get(key) ?? [])];
  }

  removeSaved(userId: string, workspaceId: string, savedId: string): SavedSearchEntity[] {
    const key = this.getBucketKey(userId, workspaceId);
    const next = (this.store.get(key) ?? []).filter((s) => s.id !== savedId);
    this.store.set(key, next);
    return next;
  }
}

export const globalSavedSearchManager = new SavedSearchManager();
