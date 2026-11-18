/**
 * @file src/shared/notification-ui/NotificationItem.tsx
 * @description Renders a single NotificationRecord with read/unread toggle, archive, dismiss, and safe action navigation (Stage 9).
 */

import React from 'react';
import {
  NOTIFICATION_CATEGORY_REGISTRY,
  type NotificationRecord,
} from '../../platform/notifications';
import { NotificationDeliveryStatus } from './NotificationDeliveryStatus';

export interface NotificationItemProps {
  notification: NotificationRecord;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onNavigateAction?: (actionUrl: string, notificationId: string) => void;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onDismiss,
  onNavigateAction,
}) => {
  const isUnread = notification.status === 'unread';
  const catLabel = NOTIFICATION_CATEGORY_REGISTRY[notification.category]?.labelFa || notification.category;

  return (
    <article
      dir="rtl"
      data-testid={`notification-item-${notification.id}`}
      className={`rounded-xl border p-3.5 transition ${
        isUnread
          ? 'border-sky-500/40 bg-slate-900/95'
          : 'border-slate-800 bg-slate-950/60 opacity-85'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="font-semibold text-sky-400">{catLabel}</span>
            <span>•</span>
            <span>{notification.createdAt}</span>
            {isUnread && (
              <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                جدید
              </span>
            )}
          </div>
          <h4 className="text-sm font-bold text-slate-100">{notification.title}</h4>
          <p className="text-xs text-slate-300">{notification.body}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {isUnread ? (
            <button
              type="button"
              data-testid={`notif-mark-read-${notification.id}`}
              onClick={() => onMarkRead?.(notification.id)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              خوانده شد
            </button>
          ) : (
            <button
              type="button"
              data-testid={`notif-mark-unread-${notification.id}`}
              onClick={() => onMarkUnread?.(notification.id)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700 cursor-pointer"
            >
              علامت خوانده‌نشده
            </button>
          )}
          {onArchive && notification.status !== 'archived' && (
            <button
              type="button"
              data-testid={`notif-archive-${notification.id}`}
              onClick={() => onArchive(notification.id)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700 cursor-pointer"
            >
              بایگانی
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              data-testid={`notif-dismiss-${notification.id}`}
              onClick={() => onDismiss(notification.id)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-slate-400 hover:text-rose-300 cursor-pointer"
            >
              رد کردن
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
        <NotificationDeliveryStatus deliveries={notification.deliveries} />
        {notification.actionUrl && (
          <button
            type="button"
            data-testid={`notif-action-link-${notification.id}`}
            onClick={() => onNavigateAction?.(notification.actionUrl!, notification.id)}
            className="text-xs font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
          >
            {notification.actionLabel || 'مشاهده جزئیات ←'}
          </button>
        )}
      </div>
    </article>
  );
};
