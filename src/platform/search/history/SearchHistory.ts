/**
 * @file src/platform/search/history/SearchHistory.ts
 * @description Workspace-isolated Recent Search store (max 30 items per userId+workspaceId, PII rejection, independent from SavedSearch).
 */

import { normalizePersianSearchQuery } from '../core/SearchNormalizer';
import type { SearchScope } from '../core/SearchTypes';

export const MAX_RECENT_SEARCHES_PER_WORKSPACE = 30;

export interface RecentSearchRecord {
  id: string;
  userId: string;
  workspaceId: string;
  rawQuery: string;
  normalizedQuery: string;
  scope: SearchScope;
  cityId?: string;
  timestampMs: number;
}

const SENSITIVE_PATTERN_REGEX =
  /(\b\d{10}\b|\b09\d{9}\b|\b۰۹[۰-۹]{9}\b|\b\d{16}\b|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|password|رمز\s*عبور|کد\s*ملی|شماره\s*کارت)/i;

export function containsSensitivePersonalPattern(text: string): boolean {
  if (!text) return false;
  return SENSITIVE_PATTERN_REGEX.test(text);
}

export class WorkspaceSearchHistoryStore {
  private readonly byBucket = new Map<string, RecentSearchRecord[]>();

  private getBucketKey(userId?: string | null, workspaceId?: string | null): string {
    const u = (userId || 'guest').trim() || 'guest';
    const w = (workspaceId || 'personal').trim() || 'personal';
    return `recent_searches:${u}:${w}`;
  }

  recordSearch(params: {
    userId?: string | null;
    workspaceId?: string | null;
    rawQuery: string;
    scope?: SearchScope;
    cityId?: string;
    nowMs?: number;
  }): { stored: boolean; reason?: 'EMPTY' | 'SENSITIVE_PATTERN_REJECTED'; items: RecentSearchRecord[] } {
    const trimmed = (params.rawQuery || '').trim();
    const bucketKey = this.getBucketKey(params.userId, params.workspaceId);
    const current = this.byBucket.get(bucketKey) ?? [];

    if (!trimmed) {
      return { stored: false, reason: 'EMPTY', items: current };
    }

    if (containsSensitivePersonalPattern(trimmed)) {
      return { stored: false, reason: 'SENSITIVE_PATTERN_REJECTED', items: current };
    }

    const normalizedQuery = normalizePersianSearchQuery(trimmed);
    const scope = params.scope ?? 'all';
    const nowMs = params.nowMs ?? Date.now();

    const deduplicated = current.filter(
      (item) => !(item.normalizedQuery === normalizedQuery && item.scope === scope)
    );

    const entry: RecentSearchRecord = {
      id: `rec-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
      userId: (params.userId || 'guest').trim() || 'guest',
      workspaceId: (params.workspaceId || 'personal').trim() || 'personal',
      rawQuery: trimmed,
      normalizedQuery,
      scope,
      cityId: params.cityId,
      timestampMs: nowMs,
    };

    const next = [entry, ...deduplicated].slice(0, MAX_RECENT_SEARCHES_PER_WORKSPACE);
    this.byBucket.set(bucketKey, next);
    return { stored: true, items: next };
  }

  listRecent(userId?: string | null, workspaceId?: string | null): RecentSearchRecord[] {
    const bucketKey = this.getBucketKey(userId, workspaceId);
    return [...(this.byBucket.get(bucketKey) ?? [])];
  }

  removeRecentById(userId: string | null | undefined, workspaceId: string | null | undefined, id: string): RecentSearchRecord[] {
    const bucketKey = this.getBucketKey(userId, workspaceId);
    const next = (this.byBucket.get(bucketKey) ?? []).filter((r) => r.id !== id);
    this.byBucket.set(bucketKey, next);
    return next;
  }

  clearWorkspaceHistory(userId?: string | null, workspaceId?: string | null): void {
    const bucketKey = this.getBucketKey(userId, workspaceId);
    this.byBucket.delete(bucketKey);
  }

  clearAllOnLogout(userId?: string | null): void {
    if (!userId) {
      this.byBucket.clear();
      return;
    }
    for (const key of this.byBucket.keys()) {
      if (key.startsWith(`recent_searches:${userId}:`)) {
        this.byBucket.delete(key);
      }
    }
  }
}

export const globalWorkspaceSearchHistory = new WorkspaceSearchHistoryStore();
