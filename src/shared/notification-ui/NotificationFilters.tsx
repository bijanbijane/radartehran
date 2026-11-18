/**
 * @file src/shared/notification-ui/NotificationFilters.tsx
 * @description Filter bar for Notification Center Inbox (status, category, priority, search text) (Stage 9).
 */

import React from 'react';
import {
  NOTIFICATION_CATEGORY_REGISTRY,
  type NotificationCategory,
  type NotificationInboxFilter,
  type NotificationStatus,
} from '../../platform/notifications';

export interface NotificationFiltersProps {
  filter: NotificationInboxFilter;
  onChangeFilter: (next: NotificationInboxFilter) => void;
  onMarkAllRead?: () => void;
}

export const NotificationFilters: React.FC<NotificationFiltersProps> = ({
  filter,
  onChangeFilter,
  onMarkAllRead,
}) => {
  const categories = Object.values(NOTIFICATION_CATEGORY_REGISTRY);

  return (
    <div
      dir="rtl"
      data-testid="notification-inbox-filters"
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="فیلتر وضعیت خوانده‌شدن"
          value={filter.status || 'all'}
          onChange={(e) =>
            onChangeFilter({ ...filter, status: e.target.value as NotificationStatus | 'all' })
          }
          className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-slate-200"
        >
          <option value="all">همه وضعیت‌ها</option>
          <option value="unread">فقط خوانده‌نشده</option>
          <option value="read">خوانده‌شده</option>
          <option value="archived">بایگانی‌شده</option>
        </select>

        <select
          aria-label="فیلتر دسته‌بندی اعلان"
          value={filter.category || 'all'}
          onChange={(e) =>
            onChangeFilter({ ...filter, category: e.target.value as NotificationCategory | 'all' })
          }
          className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-slate-200"
        >
          <option value="all">همه دسته‌ها</option>
          {categories.map((c) => (
            <option key={c.category} value={c.category}>
              {c.labelFa}
            </option>
          ))}
        </select>

        <input
          type="search"
          value={filter.searchText || ''}
          onChange={(e) => onChangeFilter({ ...filter, searchText: e.target.value })}
          placeholder="جست‌وجو در عنوان یا متن اعلان..."
          aria-label="جست‌وجو در اعلان‌ها"
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-slate-100"
        />
      </div>

      {onMarkAllRead && (
        <button
          type="button"
          data-testid="notif-mark-all-read-btn"
          onClick={onMarkAllRead}
          className="rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500 cursor-pointer"
        >
          علامت‌گذاری همه به‌عنوان خوانده‌شده
        </button>
      )}
    </div>
  );
};
