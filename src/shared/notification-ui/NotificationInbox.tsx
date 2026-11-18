/**
 * @file src/shared/notification-ui/NotificationInbox.tsx
 * @description Full Notification Inbox list supporting flat and grouped views, filters, and pagination (Stage 9).
 */

import React from 'react';
import {
  groupNotifications,
  type NotificationInboxFilter,
  type NotificationPaginatedSlice,
} from '../../platform/notifications';
import { NotificationEmptyState } from './NotificationEmptyState';
import { NotificationFilters } from './NotificationFilters';
import { NotificationGroup } from './NotificationGroup';
import { NotificationItem } from './NotificationItem';

export interface NotificationInboxProps {
  slice: NotificationPaginatedSlice;
  filter: NotificationInboxFilter;
  groupedMode?: boolean;
  onChangeFilter: (next: NotificationInboxFilter) => void;
  onChangePage: (page: number) => void;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onMarkAllRead?: () => void;
  onArchive?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onNavigateAction?: (actionUrl: string, notificationId: string) => void;
}

export const NotificationInbox: React.FC<NotificationInboxProps> = ({
  slice,
  filter,
  groupedMode = false,
  onChangeFilter,
  onChangePage,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
  onArchive,
  onDismiss,
  onNavigateAction,
}) => {
  const hasActiveFilters = Boolean(
    (filter.status && filter.status !== 'all') ||
      (filter.category && filter.category !== 'all') ||
      (filter.searchText && filter.searchText.trim().length > 0)
  );

  const groups = groupedMode ? groupNotifications(slice.items) : [];

  return (
    <div dir="rtl" data-testid="notification-inbox" className="space-y-4">
      <NotificationFilters
        filter={filter}
        onChangeFilter={onChangeFilter}
        onMarkAllRead={onMarkAllRead}
      />

      {slice.items.length === 0 ? (
        <NotificationEmptyState
          hasActiveFilters={hasActiveFilters}
          onResetFilters={() => onChangeFilter({ status: 'all', category: 'all', searchText: '' })}
        />
      ) : groupedMode ? (
        <div className="space-y-3">
          {groups.map((grp) => (
            <NotificationGroup
              key={grp.groupKey}
              group={grp}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              onArchive={onArchive}
              onDismiss={onDismiss}
              onNavigateAction={onNavigateAction}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {slice.items.map((item) => (
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

      {slice.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-xs text-slate-300">
          <span>
            صفحه {slice.page} از {slice.totalPages} (مجموع: {slice.totalItems})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!slice.hasPrevPage}
              onClick={() => onChangePage(slice.page - 1)}
              className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 disabled:opacity-40"
            >
              قبلی
            </button>
            <button
              type="button"
              disabled={!slice.hasNextPage}
              onClick={() => onChangePage(slice.page + 1)}
              className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 disabled:opacity-40"
            >
              بعدی
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
