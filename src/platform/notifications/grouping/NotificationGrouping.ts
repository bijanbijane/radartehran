/**
 * @file src/platform/notifications/grouping/NotificationGrouping.ts
 * @description Groups related notifications by groupKey within a configurable time window while preserving individual access (Stage 9).
 */

import type { NotificationCategory, NotificationPriority, NotificationRecord } from '../core/NotificationTypes';
import { PRIORITY_WEIGHTS } from '../core/NotificationRegistry';

export interface NotificationGroupItem {
  groupKey: string;
  category: NotificationCategory;
  highestPriority: NotificationPriority;
  unreadCount: number;
  totalCount: number;
  latestCreatedAt: string;
  headlineTitleFa: string;
  notifications: NotificationRecord[];
}

export function groupNotifications(
  records: NotificationRecord[],
  windowHours = 24
): NotificationGroupItem[] {
  const windowMs = Math.max(1, windowHours) * 60 * 60 * 1000;
  const groups = new Map<string, NotificationRecord[]>();

  for (const rec of records) {
    const baseKey = rec.groupKey || `single:${rec.id}`;
    const existingList = groups.get(baseKey);
    if (!existingList || existingList.length === 0) {
      groups.set(baseKey, [rec]);
    } else {
      const latestInGroup = Date.parse(existingList[0].createdAt) || 0;
      const currentMs = Date.parse(rec.createdAt) || 0;
      if (Math.abs(latestInGroup - currentMs) <= windowMs) {
        existingList.push(rec);
      } else {
        groups.set(`${baseKey}:${rec.id}`, [rec]);
      }
    }
  }

  const output: NotificationGroupItem[] = [];
  for (const [groupKey, list] of groups.entries()) {
    const sorted = [...list].sort(
      (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
    );
    const first = sorted[0];
    let highestPriority: NotificationPriority = first.priority;
    let unreadCount = 0;

    for (const item of sorted) {
      if (item.status === 'unread') unreadCount += 1;
      if (PRIORITY_WEIGHTS[item.priority] > PRIORITY_WEIGHTS[highestPriority]) {
        highestPriority = item.priority;
      }
    }

    const headlineTitleFa =
      sorted.length > 1
        ? `${first.title} و ${sorted.length - 1} اعلان مشابه دیگر`
        : first.title;

    output.push({
      groupKey,
      category: first.category,
      highestPriority,
      unreadCount,
      totalCount: sorted.length,
      latestCreatedAt: first.createdAt,
      headlineTitleFa,
      notifications: sorted,
    });
  }

  return output.sort(
    (a, b) => (Date.parse(b.latestCreatedAt) || 0) - (Date.parse(a.latestCreatedAt) || 0)
  );
}
