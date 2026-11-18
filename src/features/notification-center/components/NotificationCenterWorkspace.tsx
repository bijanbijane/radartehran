/**
 * @file src/features/notification-center/components/NotificationCenterWorkspace.tsx
 * @description Unified Notification Center Workspace combining Inbox, Grouping toggle, and Channel/QuietHours Preferences (Stage 9).
 */

import React, { useState } from 'react';
import {
  NOTIFICATION_CATEGORY_REGISTRY,
  type DeliveryChannel,
  type NotificationCategory,
  type NotificationRecord,
} from '../../../platform/notifications';
import {
  NotificationBell,
  NotificationInbox,
} from '../../../shared/notification-ui';
import { useNotificationCenter } from '../hooks/useNotificationCenter';

export interface NotificationCenterWorkspaceProps {
  userId: string;
  workspaceId: string;
  permissionVersion?: number;
  initialNotifications?: Array<Partial<NotificationRecord>>;
  onNavigateAction?: (actionUrl: string, notificationId: string) => void;
}

export const NotificationCenterWorkspace: React.FC<NotificationCenterWorkspaceProps> = ({
  userId,
  workspaceId,
  permissionVersion = 1,
  initialNotifications,
  onNavigateAction,
}) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'preferences'>('inbox');
  const [groupedMode, setGroupedMode] = useState(false);
  const [prefErrorFa, setPrefErrorFa] = useState<string | null>(null);

  const {
    slice,
    unreadSummary,
    preferences,
    filter,
    setFilter,
    setPage,
    updateStatus,
    markAllAsRead,
    services,
  } = useNotificationCenter({
    userId,
    workspaceId,
    permissionVersion,
    initialNotifications,
  });

  const handleToggleChannel = (category: NotificationCategory, channel: DeliveryChannel) => {
    const currentCat = preferences.categories[category];
    const nextChannels = {
      ...currentCat.channels,
      [channel]: !currentCat.channels[channel],
    };
    const res = services.preferencesService.updateCategoryPreference({
      userId,
      workspaceId,
      category,
      channels: nextChannels,
      frequency: currentCat.frequency,
      muted: currentCat.muted,
    });
    setPrefErrorFa(res.ok ? null : res.errorFa || null);
  };

  return (
    <div dir="rtl" data-testid="notification-center-workspace" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="flex items-center gap-3">
          <NotificationBell
            summary={unreadSummary}
            isOpen={activeTab === 'inbox'}
            onToggleOpen={() => setActiveTab('inbox')}
          />
          <div>
            <h2 className="text-base font-bold text-slate-100">مرکز اعلان‌ها و ترجیحات اطلاع‌رسانی</h2>
            <p className="text-xs text-slate-400">
              صندوق ورودی هشدارهای مرحله ۸، مدیریت وضعیت خوانده‌شدن و کانال‌های تحویل
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="notif-tab-inbox"
            onClick={() => setActiveTab('inbox')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              activeTab === 'inbox' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            صندوق اعلان‌ها ({unreadSummary.totalUnread})
          </button>
          <button
            type="button"
            data-testid="notif-tab-preferences"
            onClick={() => setActiveTab('preferences')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              activeTab === 'preferences' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            ترجیحات کانال و ساعات سکوت
          </button>
          {activeTab === 'inbox' && (
            <button
              type="button"
              data-testid="notif-toggle-grouped-btn"
              onClick={() => setGroupedMode((g) => !g)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
            >
              {groupedMode ? 'نمایش خطی' : 'نمایش گروه‌بندی‌شده'}
            </button>
          )}
        </div>
      </div>

      {activeTab === 'inbox' ? (
        <NotificationInbox
          slice={slice}
          filter={filter}
          groupedMode={groupedMode}
          onChangeFilter={setFilter}
          onChangePage={setPage}
          onMarkRead={(id) => updateStatus([id], 'read')}
          onMarkUnread={(id) => updateStatus([id], 'unread')}
          onMarkAllRead={markAllAsRead}
          onArchive={(id) => updateStatus([id], 'archived')}
          onDismiss={(id) => updateStatus([id], 'dismissed')}
          onNavigateAction={(url, id) => {
            void updateStatus([id], 'read');
            onNavigateAction?.(url, id);
          }}
        />
      ) : (
        <div
          data-testid="notification-preferences-panel"
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-4"
        >
          {prefErrorFa && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-2.5 text-xs text-amber-200"
            >
              {prefErrorFa}
            </div>
          )}

          <div className="space-y-2.5">
            {(Object.keys(NOTIFICATION_CATEGORY_REGISTRY) as NotificationCategory[]).map((cat) => {
              const desc = NOTIFICATION_CATEGORY_REGISTRY[cat];
              const pref = preferences.categories[cat];
              return (
                <div
                  key={cat}
                  data-testid={`pref-category-row-${cat}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-100">{desc.labelFa}</div>
                    <div className="text-slate-400">{desc.descriptionFa}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {(['in_app', 'email', 'sms', 'push'] as DeliveryChannel[]).map((ch) => (
                      <label key={ch} className="inline-flex items-center gap-1 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pref.channels[ch]}
                          onChange={() => handleToggleChannel(cat, ch)}
                          data-testid={`pref-toggle-${cat}-${ch}`}
                        />
                        <span>{ch}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
