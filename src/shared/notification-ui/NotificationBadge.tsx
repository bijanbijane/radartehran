/**
 * @file src/shared/notification-ui/NotificationBadge.tsx
 * @description Renders unread notification badge (+99 support) and hides when unread count is 0 (Stage 9).
 */

import React from 'react';
import type { UnreadCountSummary } from '../../platform/notifications';

export interface NotificationBadgeProps {
  summary: UnreadCountSummary;
}

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({ summary }) => {
  if (summary.totalUnread <= 0) {
    return null;
  }

  return (
    <span
      dir="rtl"
      data-testid="notification-unread-badge"
      className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${
        summary.hasCriticalUnread ? 'bg-rose-600' : 'bg-sky-600'
      }`}
    >
      {summary.displayBadgeTextFa}
    </span>
  );
};
