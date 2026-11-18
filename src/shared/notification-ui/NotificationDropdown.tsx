/**
 * @file src/shared/notification-ui/NotificationDropdown.tsx
 * @description Header quick-preview popover for recent notifications with Escape key dismissal and link to full Inbox (Stage 9).
 */

import React, { useEffect } from 'react';
import type { NotificationRecord, UnreadCountSummary } from '../../platform/notifications';
import { NotificationEmptyState } from './NotificationEmptyState';
import { NotificationItem } from './NotificationItem';

export interface NotificationDropdownProps {
  isOpen: boolean;
  notifications: NotificationRecord[];
  summary: UnreadCountSummary;
  onClose: () => void;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onOpenFullInbox?: () => void;
  onNavigateAction?: (actionUrl: string, notificationId: string) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  isOpen,
  notifications,
  summary,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onOpenFullInbox,
  onNavigateAction,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const recentItems = notifications.slice(0, 5);

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label="پیش‌نمایش اعلان‌های اخیر"
      data-testid="notification-header-dropdown"
      className="w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl space-y-3"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <span className="text-xs font-bold text-slate-100">
          اعلان‌های اخیر ({summary.totalUnread} خوانده‌نشده)
        </span>
        {summary.totalUnread > 0 && onMarkAllRead && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-[11px] font-semibold text-sky-400 hover:underline cursor-pointer"
          >
            خواندن همه
          </button>
        )}
      </div>

      {recentItems.length === 0 ? (
        <NotificationEmptyState hasActiveFilters={false} />
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {recentItems.map((item) => (
            <NotificationItem
              key={item.id}
              notification={item}
              onMarkRead={onMarkRead}
              onNavigateAction={onNavigateAction}
            />
          ))}
        </div>
      )}

      {onOpenFullInbox && (
        <div className="border-t border-slate-800 pt-2 text-center">
          <button
            type="button"
            data-testid="open-full-notification-inbox-btn"
            onClick={onOpenFullInbox}
            className="text-xs font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
          >
            مشاهده کامل صندوق اعلان‌ها و تنظیمات تحویل ←
          </button>
        </div>
      )}
    </div>
  );
};
