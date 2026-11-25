/** @file src/features/account/components/AccountNotificationsPanel.tsx — Full Notification Center, Inbox & Preferences Hub */
import React, { useEffect, useState } from 'react';
import { Archive, Bell, CheckCheck, EyeOff, Inbox, Settings, ShieldAlert } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import type { AccountNotificationItem, NotificationChannelPreferences } from '../types/account.types';
import { COMMS_CATEGORY_META } from '../../communications/registries/eventPolicyAndTemplateRegistry';
import { classifyNotificationDateBucketFa } from '../../communications/services/commsEngine';
import {
  loadCommsWorkspaceState,
  markAllCommsNotificationsRead,
  markCommsNotificationStatus,
} from '../../communications/services/commsClientService';
import { AccountInboxPanel } from '../../communications/components/AccountInboxPanel';
import { AccountCommsPreferencesPanel } from '../../communications/components/AccountCommsPreferencesPanel';
import type { CommsCategoryCode } from '../../communications/types/comms.types';

export interface AccountNotificationsPanelProps {
  uid?: string;
  notifications: AccountNotificationItem[];
  channels: NotificationChannelPreferences;
  onUpdateChannels: (patch: Partial<Omit<NotificationChannelPreferences, 'securityAlertsMandatory' | 'updatedAtIso'>>) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenBuyerAlertModal: () => void;
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

type HubViewTab = 'feed' | 'inbox' | 'preferences';

function resolveInitialHubTab(): HubViewTab {
  if (typeof window === 'undefined') return 'feed';
  const path = window.location.pathname;
  if (path.includes('/account/settings/notifications')) return 'preferences';
  if (path.includes('/account/inbox')) return 'inbox';
  return 'feed';
}

export const AccountNotificationsPanel: React.FC<AccountNotificationsPanelProps> = ({
  uid = 'local-user',
  notifications: legacyNotifications,
  onMarkRead,
  onMarkAllRead,
  onOpenBuyerAlertModal,
  onNavigateView,
}) => {
  const [hubTab, setHubTab] = useState<HubViewTab>(() => resolveInitialHubTab());
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'important' | 'archived'>('all');
  const [categoryFilter, setCategoryFilter] = useState<CommsCategoryCode | 'ALL'>('ALL');
  const [tick, setTick] = useState(0);
  void tick;

  useEffect(() => {
    const sync = () => setTick((t) => t + 1);
    window.addEventListener('radar:comms-updated', sync);
    return () => window.removeEventListener('radar:comms-updated', sync);
  }, []);

  const commsState = loadCommsWorkspaceState(uid);
  const unreadTotal = commsState.notifications.filter((n) => n.status === 'UNREAD').length;

  const filteredNotifs = commsState.notifications.filter((n) => {
    if (n.status === 'DISMISSED') return false;
    if (statusFilter === 'unread' && n.status !== 'UNREAD') return false;
    if (statusFilter === 'archived' && n.status !== 'ARCHIVED') return false;
    if (statusFilter !== 'archived' && n.status === 'ARCHIVED') return false;
    if (statusFilter === 'important' && n.severity !== 'CRITICAL' && n.severity !== 'WARNING' && !n.requiresUserAction) {
      return false;
    }
    if (categoryFilter !== 'ALL' && n.category !== categoryFilter) return false;
    return true;
  });

  const dateGroups = (['امروز', 'دیروز', 'هفته جاری', 'قدیمی‌تر'] as const)
    .map((bucket) => ({
      bucket,
      items: filteredNotifs.filter((n) => classifyNotificationDateBucketFa(n.createdAtIso) === bucket),
    }))
    .filter((g) => g.items.length > 0);

  const handleBulkReadAll = () => {
    markAllCommsNotificationsRead(uid);
    onMarkAllRead();
    setTick((t) => t + 1);
  };

  const catLabel = (code: CommsCategoryCode) => COMMS_CATEGORY_META.find((c) => c.code === code)?.labelFa || code;

  return (
    <div className="space-y-4 text-xs" data-testid="account-notifications-panel">
      {/* Unified Header */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>مرکز اعلان‌ها و پیام‌های مرتبط ({toPersianNum(unreadTotal)} خوانده‌نشده)</span>
          </h2>
          <p className="text-slate-500 mt-1">
            جداسازی اعلان‌های سامانه، هشدارهای امنیتی اجباری، صندوق گفت‌وگوی پرونده‌ها و تنظیم ساعات سکوت.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onOpenBuyerAlertModal} className="px-3.5 py-2 rounded-xl bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
            مدیریت هشدارهای شکار ملک
          </button>
          {unreadTotal > 0 && (
            <button type="button" onClick={handleBulkReadAll} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[var(--color-border-strong)] font-bold flex items-center gap-1 cursor-pointer">
              <CheckCheck className="w-3.5 h-3.5" />
              <span>خواندن همه</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Sub-Tabs: Feed | Scoped Inbox | Preferences & Quiet Hours */}
      <div role="tablist" aria-label="بخش‌های ارتباطات کاربر" className="flex flex-wrap items-center gap-2">
        {[
          { id: 'feed' as const, label: `اعلان‌های من (${toPersianNum(commsState.notifications.filter((n) => n.status !== 'DISMISSED').length)})`, Icon: Bell },
          { id: 'inbox' as const, label: `صندوق گفت‌وگوهای مرتبط (${toPersianNum(commsState.conversations.length)})`, Icon: Inbox },
          { id: 'preferences' as const, label: 'تنظیمات کانال‌ها و ساعات سکوت', Icon: Settings },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={hubTab === id}
            data-testid={`comms-hub-tab-${id}`}
            onClick={() => setHubTab(id)}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer ${
              hubTab === id
                ? 'bg-[var(--color-brand-600)] text-white'
                : 'bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-subtle)] text-slate-700 dark:text-[var(--color-text-primary)]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {hubTab === 'feed' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-subtle)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all' as const, label: 'همه' },
                { id: 'unread' as const, label: 'خوانده‌نشده' },
                { id: 'important' as const, label: 'مهم و امنیتی' },
                { id: 'archived' as const, label: 'آرشیوشده' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStatusFilter(t.id)}
                  className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                    statusFilter === t.id ? 'bg-[var(--color-brand-600)] text-white' : 'bg-slate-100 dark:bg-[var(--color-bg-muted)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <select
              aria-label="فیلتر دسته اعلان"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CommsCategoryCode | 'ALL')}
              className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] font-bold"
            >
              <option value="ALL">همه دسته‌ها ({toPersianNum(COMMS_CATEGORY_META.length)})</option>
              {COMMS_CATEGORY_META.map((c) => (
                <option key={c.code} value={c.code}>{c.labelFa}</option>
              ))}
            </select>
          </div>

          {dateGroups.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-slate-500">اعلانی مطابق این فیلتر یافت نشد.</p>
              <button type="button" onClick={onOpenBuyerAlertModal} className="px-3.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer">
                ثبت هشدار قیمت محله
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {dateGroups.map((group) => (
                <div key={group.bucket} className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 px-1">{group.bucket}</div>
                  <div className="divide-y divide-slate-100 dark:divide-[var(--color-border-subtle)] border border-slate-100 dark:border-[var(--color-border-subtle)] rounded-xl overflow-hidden">
                    {group.items.map((n) => {
                      const isCritical = n.severity === 'CRITICAL';
                      return (
                        <div
                          key={n.id}
                          className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            n.status === 'UNREAD'
                              ? isCritical
                                ? 'bg-rose-50/50 dark:bg-rose-950/20'
                                : 'bg-emerald-50/30 dark:bg-emerald-950/15'
                              : 'bg-white dark:bg-[var(--color-bg-surface)] opacity-85'
                          }`}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="text-[10.5px] font-bold text-slate-500 flex flex-wrap items-center gap-1.5">
                              {isCritical && <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                              <span>{catLabel(n.category)}</span>
                              <span>·</span>
                              <span className="tabular-nums">{n.status === 'UNREAD' ? 'خوانده‌نشده' : n.status === 'ARCHIVED' ? 'آرشیو' : 'خوانده‌شده'}</span>
                              {n.requiresUserAction && (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-700 dark:text-amber-300">نیازمند بررسی</span>
                                </>
                              )}
                            </div>
                            <div className="font-bold text-slate-900 dark:text-white">{n.titleFa}</div>
                            <p className="text-[11.5px] text-slate-600 dark:text-[var(--color-text-secondary)] leading-relaxed">{n.bodyFa}</p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {n.status === 'UNREAD' && (
                              <button
                                type="button"
                                onClick={() => {
                                  markCommsNotificationStatus(n.id, 'READ', uid);
                                  onMarkRead(n.id);
                                  setTick((t) => t + 1);
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[var(--color-border-strong)] font-bold cursor-pointer"
                              >
                                خواندم
                              </button>
                            )}
                            {n.status !== 'ARCHIVED' && (
                              <button
                                type="button"
                                aria-label="آرشیو اعلان"
                                onClick={() => { markCommsNotificationStatus(n.id, 'ARCHIVED', uid); setTick((t) => t + 1); }}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-[var(--color-border-strong)] text-slate-500 cursor-pointer"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label="حذف از دید"
                              onClick={() => { markCommsNotificationStatus(n.id, 'DISMISSED', uid); setTick((t) => t + 1); }}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-[var(--color-border-strong)] text-slate-500 cursor-pointer"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (n.status === 'UNREAD') markCommsNotificationStatus(n.id, 'READ', uid);
                                onNavigateView?.(n.targetView, n.targetSubTab);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer"
                            >
                              {n.ctaLabelFa}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {legacyNotifications.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-[var(--color-border-subtle)] text-[11px] text-slate-400">
              اعلان‌های همگام‌شده workspace: {toPersianNum(legacyNotifications.length)} مورد فعال.
            </div>
          )}
        </div>
      )}

      {hubTab === 'inbox' && (
        <AccountInboxPanel
          uid={uid}
          conversations={commsState.conversations}
          onChanged={() => setTick((t) => t + 1)}
        />
      )}

      {hubTab === 'preferences' && (
        <AccountCommsPreferencesPanel
          uid={uid}
          preferences={commsState.preferences}
          devices={commsState.devices}
          onChanged={() => setTick((t) => t + 1)}
        />
      )}
    </div>
  );
};
