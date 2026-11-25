/** @file src/features/account/components/AccountSidebarNav.tsx — Consolidated 5-Section Semantic Sidebar & Deduplicated Mobile Nav (F-07, F-12) */
import React from 'react';
import { Activity, Bell, Bookmark, LayoutDashboard, Settings } from 'lucide-react';
import type { AccountSubTabId } from '../../../navigation/registry/route.types';
import { RadarLink } from '../../../components/ui/RadarPrimitives';
import { useRadarLocale } from '../../../components/AreaUnitToggle';

export interface AccountSidebarNavProps {
  currentTab: AccountSubTabId;
  onSelectTab: (tab: AccountSubTabId) => void;
}

interface AccountNavGroup {
  id: string;
  labelFa: string;
  labelEn: string;
  primaryTab: AccountSubTabId;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: Array<{ id: AccountSubTabId; labelFa: string; labelEn: string; href: string }>;
}

const ACCOUNT_NAV_GROUPS: AccountNavGroup[] = [
  {
    id: 'overview',
    labelFa: 'نمای کلی',
    labelEn: 'Overview',
    primaryTab: 'overview',
    href: '/account',
    icon: LayoutDashboard,
  },
  {
    id: 'saved',
    labelFa: 'ذخیره‌های من',
    labelEn: 'Saved Items',
    primaryTab: 'favorites',
    href: '/account/favorites',
    icon: Bookmark,
    children: [
      { id: 'favorites', labelFa: 'محله‌ها و ملک‌های منتخب', labelEn: 'Favorites', href: '/account/favorites' },
      { id: 'saved_searches', labelFa: 'جست‌وجوهای ذخیره‌شده', labelEn: 'Saved Searches', href: '/account/saved-searches' },
      { id: 'saved_views', labelFa: 'نماهای نقشه و گزارش‌ها', labelEn: 'Saved Views', href: '/account/saved-views' },
    ],
  },
  {
    id: 'activity',
    labelFa: 'فعالیت و درخواست‌ها',
    labelEn: 'Activity & Requests',
    primaryTab: 'activity',
    href: '/account/activity',
    icon: Activity,
    children: [
      { id: 'activity', labelFa: 'بازدیدها و تاریخچه فعالیت', labelEn: 'Visits & Timeline', href: '/account/activity' },
      { id: 'contributions', labelFa: 'آگهی‌ها و درخواست‌های خدمت', labelEn: 'Listings & Services', href: '/account/contributions' },
      { id: 'community', labelFa: 'فعالیت در جامعه کاربران', labelEn: 'Community Activity', href: '/account/community' },
    ],
  },
  {
    id: 'notifications',
    labelFa: 'اعلان‌ها',
    labelEn: 'Notifications',
    primaryTab: 'notifications',
    href: '/account/notifications',
    icon: Bell,
  },
  {
    id: 'settings',
    labelFa: 'تنظیمات و حریم خصوصی',
    labelEn: 'Settings & Privacy',
    primaryTab: 'settings',
    href: '/account/settings',
    icon: Settings,
    children: [
      { id: 'settings', labelFa: 'تنظیمات و حریم خصوصی', labelEn: 'Settings & Privacy', href: '/account/settings' },
      { id: 'profile', labelFa: 'مشخصات پروفایل', labelEn: 'Profile', href: '/account/profile' },
    ],
  },
];

export const AccountSidebarNav: React.FC<AccountSidebarNavProps> = ({ currentTab, onSelectTab }) => {
  const [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const activeGroup = ACCOUNT_NAV_GROUPS.find(
    (g) => currentTab === g.primaryTab || Boolean(g.children?.some((c) => c.id === currentTab)),
  );

  return (
    <aside
      aria-label={isEn ? 'Account sections' : 'بخش‌های حساب کاربری'}
      data-testid="account-sidebar-nav"
      className="w-full lg:w-[256px] shrink-0"
    >
      <nav
        aria-label={isEn ? 'Account menu' : 'منوی حساب کاربری'}
        className="p-3 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-2.5"
      >
        <div className="px-2.5 py-1 text-sm font-bold text-[var(--color-text-secondary)] flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
          <span>{isEn ? 'Radar Account' : 'فضای کاربری رادار'}</span>
        </div>

        {/* Unified responsive 5-group nav (zero duplicated DOM links) */}
        <div
          data-testid="account-mobile-nav"
          className="flex lg:flex-col items-center lg:items-stretch gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 no-scrollbar"
        >
          {ACCOUNT_NAV_GROUPS.map((group) => {
            const Icon = group.icon;
            const isGroupActive =
              currentTab === group.primaryTab || Boolean(group.children?.some((c) => c.id === currentTab));
            return (
              <RadarLink
                key={group.id}
                href={group.href}
                aria-current={currentTab === group.primaryTab && !group.children ? 'page' : undefined}
                onNavigate={() => onSelectTab(group.primaryTab)}
                className={`min-h-[44px] lg:w-full px-3.5 py-2 rounded-xl text-sm font-bold whitespace-nowrap shrink-0 inline-flex items-center justify-start gap-2 transition text-start ${
                  isGroupActive
                    ? 'bg-[var(--color-brand-600)] text-white'
                    : 'bg-[var(--color-bg-muted)] lg:bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{isEn ? group.labelEn : group.labelFa}</span>
              </RadarLink>
            );
          })}
        </div>

        {/* Contextual sub-links rendered ONLY for the active group (keeps sidebar concise: max 5-8 total links) */}
        {activeGroup?.children && activeGroup.children.length > 1 && (
          <div
            data-testid="account-active-subnav"
            className="flex flex-wrap lg:flex-col gap-1 pt-2 border-t border-[var(--color-border-subtle)] lg:ps-3"
          >
            {activeGroup.children.map((child) => (
              <RadarLink
                key={child.id}
                href={child.href}
                aria-current={currentTab === child.id ? 'page' : undefined}
                onNavigate={() => onSelectTab(child.id)}
                className={`min-h-[44px] lg:min-h-[38px] lg:w-full px-3 py-1.5 rounded-lg text-sm inline-flex items-center justify-start text-start transition whitespace-nowrap ${
                  currentTab === child.id
                    ? 'font-bold text-[var(--color-brand-fg)] bg-[var(--color-brand-soft)] border border-[var(--color-brand-600)]/40'
                    : 'font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]'
                }`}
              >
                {isEn ? child.labelEn : child.labelFa}
              </RadarLink>
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
};
