/**
 * @file src/shared/notification-ui/NotificationBell.tsx
 * @description Header Notification Bell button with accessible aria-expanded and unread badge (Stage 9).
 */

import React from 'react';
import type { UnreadCountSummary } from '../../platform/notifications';
import { NotificationBadge } from './NotificationBadge';

export interface NotificationBellProps {
  summary: UnreadCountSummary;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  summary,
  isOpen,
  onToggleOpen,
}) => {
  return (
    <button
      type="button"
      dir="rtl"
      aria-expanded={isOpen}
      aria-label={
        summary.totalUnread > 0
          ? `مرکز اعلان‌ها (${summary.totalUnread} اعلان خوانده‌نشده)`
          : 'مرکز اعلان‌ها (بدون اعلان جدید)'
      }
      data-testid="notification-bell-btn"
      onClick={onToggleOpen}
      className="relative inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
    >
      <span>اعلان‌ها</span>
      <NotificationBadge summary={summary} />
    </button>
  );
};
