/**
 * @file src/platform/notifications/state/UnreadCounter.ts
 * @description Accurate, workspace-isolated unread notification counter with 99+ badge formatting (Stage 9).
 */

import type { NotificationCategory, NotificationRecord } from '../core/NotificationTypes';

export interface UnreadCountSummary {
  totalUnread: number;
  displayBadgeTextFa: string;
  byCategory: Record<NotificationCategory, number>;
  hasCriticalUnread: boolean;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function toPersianDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] || d);
}

export function computeUnreadCountSummary(
  records: NotificationRecord[],
  activeUserId: string,
  activeWorkspaceId: string
): UnreadCountSummary {
  const byCategory: Record<NotificationCategory, number> = {
    entity_change: 0,
    saved_search: 0,
    collection_activity: 0,
    account_security: 0,
    system_announcement: 0,
  };

  let totalUnread = 0;
  let hasCriticalUnread = false;

  for (const rec of records) {
    if (rec.userId !== activeUserId || rec.workspaceId !== activeWorkspaceId) {
      continue;
    }
    if (rec.status === 'unread') {
      totalUnread += 1;
      byCategory[rec.category] = (byCategory[rec.category] || 0) + 1;
      if (rec.priority === 'critical') {
        hasCriticalUnread = true;
      }
    }
  }

  const displayBadgeTextFa =
    totalUnread <= 0
      ? ''
      : totalUnread > 99
        ? '+۹۹'
        : toPersianDigits(totalUnread);

  return {
    totalUnread,
    displayBadgeTextFa,
    byCategory,
    hasCriticalUnread,
  };
}
