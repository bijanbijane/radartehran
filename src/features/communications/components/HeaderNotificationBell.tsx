/** @file src/features/communications/components/HeaderNotificationBell.tsx — Global Header Bell & Compact Preview Panel */
import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, ShieldAlert, Settings } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import { COMMS_CATEGORY_META } from '../registries/eventPolicyAndTemplateRegistry';
import {
  loadCommsWorkspaceState,
  markAllCommsNotificationsRead,
  markCommsNotificationStatus,
} from '../services/commsClientService';

export interface HeaderNotificationBellProps {
  uid?: string;
  isEn?: boolean;
  unreadNotificationsCount?: number;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
}

export function normalizeUnreadNotificationCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export const HeaderNotificationBell: React.FC<HeaderNotificationBellProps> = ({
  uid = 'local-user',
  isEn = false,
  unreadNotificationsCount,
  onNavigateView,
}) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread' | 'important'>('all');
  const [tick, setTick] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  void tick;

  useEffect(() => {
    const sync = () => setTick((t) => t + 1);
    window.addEventListener('radar:comms-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('radar:comms-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const state = loadCommsWorkspaceState(uid);
  const activeNotifs = state.notifications.filter((n) => n.status !== 'DISMISSED' && n.status !== 'ARCHIVED');
  const rawUnread = unreadNotificationsCount !== undefined
    ? unreadNotificationsCount
    : activeNotifs.filter((n) => n.status === 'UNREAD').length;
  const unreadCount = normalizeUnreadNotificationCount(rawUnread);

  const filtered = activeNotifs
    .filter((n) => {
      if (tab === 'unread') return n.status === 'UNREAD';
      if (tab === 'important') return n.severity === 'CRITICAL' || n.severity === 'WARNING' || n.requiresUserAction;
      return true;
    })
    .slice(0, 6);

  const catLabel = (code: string) => COMMS_CATEGORY_META.find((c) => c.code === code)?.labelFa || code;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid="header-notification-bell"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={isEn ? 'Notifications' : `اعلان‌ها (${toPersianNum(unreadCount)} خوانده‌نشده)`}
        title={isEn ? 'Notifications' : 'اعلان‌ها و پیام‌های مرتبط'}
        onClick={() => setOpen((o) => !o)}
        className="flex relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            data-testid="header-notification-badge"
            className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-600 text-white ring-2 ring-white dark:ring-slate-900 text-[9.5px] font-black flex items-center justify-center tabular-nums"
          >
            {toPersianNum(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="پیش‌نمایش اعلان‌ها"
          data-testid="header-notification-popover"
          className="fixed sm:absolute top-[60px] sm:top-10 inset-x-2 sm:inset-x-auto sm:end-0 w-auto sm:w-[360px] max-w-[calc(100vw-16px)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-50 overflow-hidden text-xs"
        >
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
              <span>اعلان‌های اخیر ({toPersianNum(unreadCount)} جدید)</span>
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => { markAllCommsNotificationsRead(uid); setTick((t) => t + 1); }}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-[10.5px] flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>خواندن همه</span>
                </button>
              )}
              <button
                type="button"
                aria-label="تنظیمات اعلان‌ها"
                onClick={() => {
                  setOpen(false);
                  onNavigateView('userspace', 'notifications');
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="px-3 pt-2 pb-1.5 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800">
            {[
              { id: 'all' as const, label: 'همه' },
              { id: 'unread' as const, label: 'خوانده‌نشده' },
              { id: 'important' as const, label: 'مهم و امنیتی' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  tab === t.id
                    ? 'bg-[var(--color-brand-600)] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-slate-500">اعلانی در این تب وجود ندارد.</div>
            ) : (
              filtered.map((n) => {
                const isCritical = n.severity === 'CRITICAL';
                return (
                  <div
                    key={n.id}
                    className={`p-3 transition ${
                      n.status === 'UNREAD'
                        ? isCritical
                          ? 'bg-rose-50/60 dark:bg-rose-950/20'
                          : 'bg-emerald-50/40 dark:bg-emerald-950/15'
                        : 'opacity-80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10.5px] font-bold text-slate-500 flex items-center gap-1">
                          {isCritical && <ShieldAlert className="w-3 h-3 text-rose-600 shrink-0" />}
                          <span>{catLabel(n.category)}</span>
                          <span>·</span>
                          <span>{n.status === 'UNREAD' ? 'خوانده‌نشده' : 'خوانده‌شده'}</span>
                        </div>
                        <div className="font-black text-slate-900 dark:text-white mt-0.5 leading-snug">{n.titleFa}</div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">{n.shortPreviewFa}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (n.status === 'UNREAD') markCommsNotificationStatus(n.id, 'READ', uid);
                          setOpen(false);
                          onNavigateView(n.targetView, n.targetSubTab);
                        }}
                        className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 cursor-pointer"
                      >
                        <span>{n.ctaLabelFa}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      {n.status === 'UNREAD' && (
                        <button
                          type="button"
                          onClick={() => { markCommsNotificationStatus(n.id, 'READ', uid); setTick((x) => x + 1); }}
                          className="text-[10.5px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                        >
                          علامت خوانده‌شده
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-2.5 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <button
              type="button"
              data-testid="popover-open-all-notifications"
              onClick={() => {
                setOpen(false);
                onNavigateView('userspace', 'notifications');
              }}
              className="w-full py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-center cursor-pointer"
            >
              مشاهده همه اعلان‌ها و پیام‌ها
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
