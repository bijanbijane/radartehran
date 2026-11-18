/**
 * @file src/platform/notifications/inbox/NotificationQuery.ts
 * @description Filtering and sorting logic for Notification Center Inbox (Stage 9).
 */

import type { EntityType } from '../../entity-engagement';
import { normalizePersianTextForEngagement } from '../../entity-engagement';
import { PRIORITY_WEIGHTS } from '../core/NotificationRegistry';
import type {
  NotificationCategory,
  NotificationPriority,
  NotificationRecord,
  NotificationStatus,
} from '../core/NotificationTypes';

export type NotificationSortMode = 'newest' | 'oldest' | 'priority_desc' | 'unread_first';

export interface NotificationInboxFilter {
  status?: NotificationStatus | 'all';
  category?: NotificationCategory | 'all';
  priority?: NotificationPriority | 'all';
  entityType?: EntityType | 'all';
  searchText?: string;
  fromDateIso?: string;
  toDateIso?: string;
  sortBy?: NotificationSortMode;
}

export function serializeNotificationFilterHash(filter: NotificationInboxFilter = {}): string {
  const s = filter.status || 'all';
  const c = filter.category || 'all';
  const p = filter.priority || 'all';
  const e = filter.entityType || 'all';
  const q = normalizePersianTextForEngagement(filter.searchText || '').toLowerCase();
  const sort = filter.sortBy || 'newest';
  return `${s}|${c}|${p}|${e}|${q}|${sort}`;
}

export function queryAndSortNotifications(
  records: NotificationRecord[],
  filter: NotificationInboxFilter = {}
): NotificationRecord[] {
  const statusFilter = filter.status || 'all';
  const categoryFilter = filter.category || 'all';
  const priorityFilter = filter.priority || 'all';
  const entityTypeFilter = filter.entityType || 'all';
  const normalizedQuery = normalizePersianTextForEngagement(filter.searchText || '').toLowerCase();
  const fromMs = filter.fromDateIso ? Date.parse(filter.fromDateIso) : null;
  const toMs = filter.toDateIso ? Date.parse(filter.toDateIso) : null;

  const filtered = records.filter((rec) => {
    // Dismissed items are excluded unless explicitly requested
    if (statusFilter === 'all' && rec.status === 'dismissed') {
      return false;
    }
    if (statusFilter !== 'all' && rec.status !== statusFilter) {
      return false;
    }
    if (categoryFilter !== 'all' && rec.category !== categoryFilter) {
      return false;
    }
    if (priorityFilter !== 'all' && rec.priority !== priorityFilter) {
      return false;
    }
    if (entityTypeFilter !== 'all' && rec.entity?.entityType !== entityTypeFilter) {
      return false;
    }
    if (fromMs !== null && !Number.isNaN(fromMs)) {
      if (Date.parse(rec.createdAt) < fromMs) return false;
    }
    if (toMs !== null && !Number.isNaN(toMs)) {
      if (Date.parse(rec.createdAt) > toMs) return false;
    }
    if (normalizedQuery) {
      const hay = normalizePersianTextForEngagement(
        `${rec.title} ${rec.body} ${rec.entity?.title || ''}`
      ).toLowerCase();
      if (!hay.includes(normalizedQuery)) return false;
    }
    return true;
  });

  const sortMode = filter.sortBy || 'newest';
  return filtered.sort((a, b) => {
    if (sortMode === 'unread_first') {
      if (a.status === 'unread' && b.status !== 'unread') return -1;
      if (a.status !== 'unread' && b.status === 'unread') return 1;
    }
    if (sortMode === 'priority_desc') {
      const diff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
      if (diff !== 0) return diff;
    }
    const tA = Date.parse(a.createdAt) || 0;
    const tB = Date.parse(b.createdAt) || 0;
    return sortMode === 'oldest' ? tA - tB : tB - tA;
  });
}
