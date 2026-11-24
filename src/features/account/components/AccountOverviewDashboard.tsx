/** @file src/features/account/components/AccountOverviewDashboard.tsx — Cross-Module Personal Dashboard Summary */
import React from 'react';
import { Bell, Bookmark, Briefcase, Calculator, FileCheck, Heart, History, Home } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import type { AccountWorkspaceSnapshot } from '../types/account.types';

export interface AccountOverviewDashboardProps {
  snapshot: AccountWorkspaceSnapshot;
  isAuthenticated?: boolean;
  favoriteHoodsCount: number;
  visitedHomesCount: number;
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onSwitchAccountTab: (tab: 'favorites' | 'saved_searches' | 'saved_views' | 'activity' | 'contributions' | 'notifications' | 'settings') => void;
}

export const AccountOverviewDashboard: React.FC<AccountOverviewDashboardProps> = ({
  snapshot,
  isAuthenticated = false,
  favoriteHoodsCount,
  visitedHomesCount,
  onNavigateView,
  onSwitchAccountTab,
}) => {
  const unreadNotifs = isAuthenticated ? snapshot.notifications.filter((n) => !n.read).length : 0;

  const summaryCards = [
    {
      label: 'ملک‌ها و محله‌های ذخیره‌شده',
      value: `${toPersianNum(snapshot.savedProperties.length)} ملک · ${toPersianNum(favoriteHoodsCount)} محله`,
      icon: Heart,
      onClick: () => onSwitchAccountTab('favorites'),
    },
    {
      label: 'گزارش‌های ارزش‌گذاری و تحلیل',
      value: `${toPersianNum(snapshot.savedValuations.length)} ارزش‌گذاری · ${toPersianNum(snapshot.savedMarketAnalyses.length + snapshot.savedMapViews.length)} تحلیل/نما`,
      icon: Calculator,
      onClick: () => onSwitchAccountTab('activity'),
    },
    {
      label: 'فایل‌ها و درخواست‌های خدمات',
      value: `${toPersianNum(snapshot.myListings.length)} آگهی · ${toPersianNum(snapshot.serviceRequests.length)} درخواست خدمت`,
      icon: Briefcase,
      onClick: () => onSwitchAccountTab('contributions'),
    },
    {
      label: 'اعلان‌ها و پیام‌های خوانده‌نشده',
      value: `${toPersianNum(unreadNotifs)} اعلان جدید · ${toPersianNum(visitedHomesCount)} بازدید`,
      icon: Bell,
      onClick: () => onSwitchAccountTab('notifications'),
    },
  ];

  return (
    <div className="space-y-4 text-xs" data-testid="account-overview-dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.label}
              type="button"
              onClick={c.onClick}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-start transition cursor-pointer space-y-1.5"
            >
              <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                <span className="text-xs font-medium">{c.label}</span>
                <Icon className="w-4 h-4 text-[var(--color-brand-600)]" />
              </div>
              <strong className="text-sm font-bold text-[var(--color-text-primary)] tabular-nums block">
                {c.value}
              </strong>
            </button>
          );
        })}
      </div>

      {/* Dedicated Action Required Queue (distinct from passive timeline, zero promo noise) */}
      <div className="p-4 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-2.5" data-testid="account-action-required-queue">
        <div className="flex items-center justify-between">
          <strong className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Bookmark className="w-4 h-4 text-amber-600" />
            <span>نیازمند اقدام ({toPersianNum(snapshot.actionRequired.length)})</span>
          </strong>
          <span className="text-xs text-[var(--color-text-muted)]">فقط موارد عملیاتی باز شما</span>
        </div>
        {snapshot.actionRequired.length === 0 ? (
          <p className="text-[var(--color-text-muted)] py-1">در حال حاضر موردی منتظر اقدام فوری شما نیست.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {snapshot.actionRequired.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                  item.urgency === 'high'
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                    : 'bg-[var(--color-bg-muted)] border-[var(--color-border-subtle)]'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold text-[var(--color-text-primary)] truncate">{item.titleFa}</div>
                  <div className="text-xs text-[var(--color-text-secondary)] truncate">{item.subtitleFa}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateView?.(item.targetView, item.targetSubTab)}
                  className="min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold shrink-0 cursor-pointer"
                >
                  بررسی
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Resume + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 p-4 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-2.5">
          <div className="flex items-center justify-between">
            <strong className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <History className="w-4 h-4 text-[var(--color-brand-fg)]" />
              <span>آخرین فعالیت‌های شما در رادار تهران</span>
            </strong>
            <button
              type="button"
              onClick={() => onSwitchAccountTab('activity')}
              className="min-h-[44px] md:min-h-[32px] inline-flex items-center px-1 text-xs font-bold text-[var(--color-brand-fg)] hover:underline cursor-pointer"
            >
              مشاهده همه
            </button>
          </div>

          {snapshot.activityTimeline.length === 0 ? (
            <p className="text-[var(--color-text-muted)] py-4">هنوز فعالیتی ثبت نشده است. اولین ارزش‌گذاری، ذخیره ملک یا درخواست خدمت خود را شروع کنید.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {snapshot.activityTimeline.slice(0, 5).map((item) => (
                <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--color-text-primary)] truncate">{item.titleFa}</div>
                    <div className="text-xs text-[var(--color-text-muted)] truncate">{item.metaFa}</div>
                  </div>
                  {item.targetView && (
                    <button
                      type="button"
                      onClick={() => onNavigateView?.(item.targetView!, item.targetSubTab)}
                      className="min-h-[44px] md:min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] font-bold shrink-0 cursor-pointer"
                    >
                      ادامه
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 p-4 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-2.5">
          <strong className="text-sm font-bold text-[var(--color-text-primary)] block">دسترسی سریع ابزارهای شخصی</strong>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onNavigateView?.('properties')} className="min-h-[56px] p-3 rounded-xl bg-[var(--color-bg-subtle)] hover:border-[var(--color-brand-600)] border border-transparent text-start font-bold cursor-pointer space-y-1">
              <Home className="w-4 h-4 text-[var(--color-brand-fg)]" />
              <span className="block text-[var(--color-text-primary)]">کشف املاک</span>
            </button>
            <button type="button" onClick={() => onNavigateView?.('tools', 'valuation')} className="min-h-[56px] p-3 rounded-xl bg-[var(--color-bg-subtle)] hover:border-[var(--color-brand-600)] border border-transparent text-start font-bold cursor-pointer space-y-1">
              <Calculator className="w-4 h-4 text-[var(--color-brand-fg)]" />
              <span className="block text-[var(--color-text-primary)]">ارزش‌گذاری جدید</span>
            </button>
            <button type="button" onClick={() => onNavigateView?.('services')} className="min-h-[56px] p-3 rounded-xl bg-[var(--color-bg-subtle)] hover:border-[var(--color-brand-600)] border border-transparent text-start font-bold cursor-pointer space-y-1">
              <Briefcase className="w-4 h-4 text-[var(--color-brand-fg)]" />
              <span className="block text-[var(--color-text-primary)]">درخواست خدمت</span>
            </button>
            <button type="button" onClick={() => onNavigateView?.('intelligence', 'reports')} className="min-h-[56px] p-3 rounded-xl bg-[var(--color-bg-subtle)] hover:border-[var(--color-brand-600)] border border-transparent text-start font-bold cursor-pointer space-y-1">
              <FileCheck className="w-4 h-4 text-[var(--color-brand-fg)]" />
              <span className="block text-[var(--color-text-primary)]">تحلیل بازار</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
