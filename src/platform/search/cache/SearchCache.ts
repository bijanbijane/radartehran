/**
 * @file src/platform/search/cache/SearchCache.ts
 * @description Workspace-isolated Search Response Cache with <= 150ms hit budget and instant invalidation on logout/permission change.
 */

import type { UnifiedSearchExecutionResponse } from '../core/SearchResult';
import type { SearchRequest } from '../core/SearchTypes';
import { buildSearchCacheKey } from './SearchCacheKey';

export interface SearchCacheEntry {
  key: string;
  userId: string;
  workspaceId: string;
  permissionVersion: number;
  response: UnifiedSearchExecutionResponse;
  storedAtMs: number;
  expiresAtMs: number;
}

export class SearchResponseCache {
  private readonly store = new Map<string, SearchCacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 60_000) {
    this.ttlMs = ttlMs;
  }

  get(request: SearchRequest, nowMs = Date.now()): UnifiedSearchExecutionResponse | null {
    const key = buildSearchCacheKey(request);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs <= nowMs) {
      this.store.delete(key);
      return null;
    }
    return {
      ...entry.response,
      fromCache: true,
    };
  }

  set(request: SearchRequest, response: UnifiedSearchExecutionResponse, nowMs = Date.now()): string {
    const key = buildSearchCacheKey(request);
    this.store.set(key, {
      key,
      userId: (request.userId || 'guest').trim() || 'guest',
      workspaceId: (request.workspaceId || 'personal').trim() || 'personal',
      permissionVersion: request.permissionVersion ?? 1,
      response,
      storedAtMs: nowMs,
      expiresAtMs: nowMs + this.ttlMs,
    });
    return key;
  }

  invalidateUserOrWorkspace(userId?: string | null, workspaceId?: string | null): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      const matchUser = userId ? v.userId === userId : false;
      const matchWs = workspaceId ? v.workspaceId === workspaceId : false;
      if (matchUser || matchWs || (!userId && !workspaceId)) {
        this.store.delete(k);
        removed++;
      }
    }
    return removed;
  }

  clearAll(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export const globalSearchResponseCache = new SearchResponseCache(60_000);
