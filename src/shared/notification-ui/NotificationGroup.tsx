/**
 * @file src/shared/notification-ui/NotificationGroup.tsx
 * @description Expandable group card for clustered notifications sharing a groupKey (Stage 9).
 */

import React, { useState } from 'react';
import type { NotificationGroupItem } from '../../platform/notifications';
import { NotificationItem } from './NotificationItem';

export interface NotificationGroupProps {
  group: NotificationGroupItem;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onNavigateAction?: (actionUrl: string, notificationId: string) => void;
}

export const NotificationGroup: React.FC<NotificationGroupProps> = ({
  group,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onDismiss,
  onNavigateAction,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (group.notifications.length === 1) {
    return (
      <NotificationItem
        notification={group.notifications[0]}
        onMarkRead={onMarkRead}
        onMarkUnread={onMarkUnread}
        onArchive={onArchive}
        onDismiss={onDismiss}
        onNavigateAction={onNavigateAction}
      />
    );
  }

  return (
    <div
      dir="rtl"
      data-testid={`notification-group-${group.groupKey}`}
      className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-100">{group.headlineTitleFa}</div>
          <div className="text-xs text-slate-400">
            مجموع: {group.totalCount} اعلان ({group.unreadCount} خوانده‌نشده)
          </div>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
        >
          {expanded ? 'بستن گروه' : 'مشاهده همه موارد گروه'}
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-slate-800 pt-2.5">
          {group.notifications.map((item) => (
            <NotificationItem
              key={item.id}
              notification={item}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              onArchive={onArchive}
              onDismiss={onDismiss}
              onNavigateAction={onNavigateAction}
            />
          ))}
        </div>
      )}
    </div>
  );
};
