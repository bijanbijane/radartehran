/**
 * @file src/platform/notifications/inbox/NotificationPagination.ts
 * @description Offset and cursor pagination for Notification Center Inbox (Stage 9).
 */

import type { NotificationRecord } from '../core/NotificationTypes';

export interface NotificationPaginatedSlice {
  items: NotificationRecord[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextCursor: string | null;
}

export function paginateNotifications(
  items: NotificationRecord[],
  page = 1,
  pageSize = 20
): NotificationPaginatedSlice {
  const safeSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const safePage = Math.max(1, Math.min(totalPages, Math.floor(page)));

  const start = (safePage - 1) * safeSize;
  const slice = items.slice(start, start + safeSize);
  const lastItem = slice[slice.length - 1];

  return {
    items: slice,
    page: safePage,
    pageSize: safeSize,
    totalItems,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
    nextCursor: safePage < totalPages && lastItem ? lastItem.id : null,
  };
}
