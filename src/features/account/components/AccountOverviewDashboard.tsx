/** @file src/features/account/components/AccountOverviewDashboard.tsx — Cross-Module Personal Dashboard Summary */
import React from 'react';
import { Bell, Bookmark, Briefcase, Calculator, FileCheck, Heart, History, Home } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import type { AccountWorkspaceSnapshot } from '../types/account.types';

export interface AccountOverviewDashboardProps {
  snapshot: AccountWorkspaceSnapshot;
  favoriteHoodsCount: number;
  visitedHomesCount: number;
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onSwitchAccountTab: (tab: 'favorites' | 'saved_searches' | 'saved_views' | 'activity' | 'contributions' | 'notifications' | 'settings') => void;
}

export const AccountOverviewDashboard: React.FC<AccountOverviewDashboardProps> = ({
  snapshot,
  favoriteHoodsCount,
  visitedHomesCount,
  onNavigateView,
  onSwitchAccountTab,
}) => {
  const unreadNotifs = snapshot.notifications.filter((n) => !n.read).length;

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
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-medium">{c.label}</span>
                <Icon className="w-4 h-4 text-[var(--color-brand-600)]" />
              </div>
              <strong className="text-sm font-black text-slate-900 dark:text-white tabular-nums block">
                {c.value}
              </strong>
            </button>
          );
        })}
      </div>

      {/* Dedicated Action Required Queue (distinct from passive timeline, zero promo noise) */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5" data-testid="account-action-required-queue">
        <div className="flex items-center justify-between">
          <strong className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Bookmark className="w-4 h-4 text-amber-600" />
            <span>نیازمند اقدام ({toPersianNum(snapshot.actionRequired.length)})</span>
          </strong>
          <span className="text-[11px] text-slate-500">فقط موارد عملیاتی باز شما</span>
        </div>
        {snapshot.actionRequired.length === 0 ? (
          <p className="text-slate-500 py-1">در حال حاضر موردی منتظر اقدام فوری شما نیست.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {snapshot.actionRequired.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                  item.urgency === 'high'
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                    : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{item.titleFa}</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">{item.subtitleFa}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateView?.(item.targetView, item.targetSubTab)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold shrink-0 cursor-pointer"
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
        <div className="lg:col-span-7 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <strong className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <History className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span>آخرین فعالیت‌های شما در رادار تهران</span>
            </strong>
            <button
              type="button"
              onClick={() => onSwitchAccountTab('activity')}
              className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer"
            >
              مشاهده همه
            </button>
          </div>

          {snapshot.activityTimeline.length === 0 ? (
            <p className="text-slate-500 py-4">هنوز فعالیتی ثبت نشده است. اولین ارزش‌گذاری، ذخیره ملک یا درخواست خدمت خود را شروع کنید.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {snapshot.activityTimeline.slice(0, 5).map((item) => (
                <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{item.titleFa}</div>
                    <div className="text-[10.5px] text-slate-500 truncate">{item.metaFa}</div>
                  </div>
                  {item.targetView && (
                    <button
                      type="button"
                      onClick={() => onNavigateView?.(item.targetView!, item.targetSubTab)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold shrink-0 cursor-pointer"
                    >
                      ادامه
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <strong className="text-sm font-black text-slate-900 dark:text-white block">دسترسی سریع ابزارهای شخصی</strong>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onNavigateView?.('properties')} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:border-emerald-600 border border-transparent text-start font-bold cursor-pointer space-y-1">
              <Home className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span className="block">کشف املاک</span>
            </button>
            <button type="button" onClick={() => onNavigateView?.('tools', 'valuation')} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:border-emerald-600 border border-transparent text-start font-bold cursor-pointer space-y-1">
              <Calculator className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span className="block">ارزش‌گذاری جدید</span>
            </button>
            <button type="button" onClick={() => onNavigateView?.('services')} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:border-emerald-600 border border-transparent text-start font-bold cursor-pointer space-y-1">
              <Briefcase className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span className="block">درخواست خدمت</span>
            </button>
            <button type="button" onClick={() => onNavigateView?.('intelligence', 'reports')} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:border-emerald-600 border border-transparent text-start font-bold cursor-pointer space-y-1">
              <FileCheck className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span className="block">تحلیل بازار</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
