/** @file src/features/account/components/AccountSidebarNav.tsx — Semantic RadarLink 5-Section Desktop Sidebar & Single Mobile Nav for Account (AUD-002, AUD-006, AUD-012, AUD-015) */
import React from 'react';
import { Activity, Bell, Bookmark, LayoutDashboard, MessageSquare, Settings } from 'lucide-react';
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
  { id: 'overview', labelFa: 'نمای کلی حساب', labelEn: 'Overview', primaryTab: 'overview', href: '/account', icon: LayoutDashboard },
  {
    id: 'saved',
    labelFa: 'ذخیره‌شده‌ها و دیده‌بان',
    labelEn: 'Saved & Watchlist',
    primaryTab: 'favorites',
    href: '/account/favorites',
    icon: Bookmark,
    children: [
      { id: 'favorites', labelFa: 'محله‌ها و ملک‌های منتخب', labelEn: 'Favorites', href: '/account/favorites' },
      { id: 'saved_searches', labelFa: 'جست‌وجوها و دیده‌بان‌ها', labelEn: 'Saved Searches', href: '/account/saved-searches' },
      { id: 'saved_views', labelFa: 'نماهای ذخیره نقشه', labelEn: 'Saved Map Views', href: '/account/saved-views' },
    ],
  },
  { id: 'activity', labelFa: 'بازدیدها و تاریخچه فعالیت', labelEn: 'Activity & Visits', primaryTab: 'activity', href: '/account/activity', icon: Activity },
  {
    id: 'community',
    labelFa: 'مشارکت‌ها و جامعه من',
    labelEn: 'Contributions',
    primaryTab: 'contributions',
    href: '/account/contributions',
    icon: MessageSquare,
    children: [
      { id: 'contributions', labelFa: 'آگهی‌ها و درخواست‌های من', labelEn: 'My Listings & Requests', href: '/account/contributions' },
      { id: 'community', labelFa: 'تنظیمات و فعالیت جامعه', labelEn: 'Community Activity', href: '/account/community' },
    ],
  },
  {
    id: 'preferences',
    labelFa: 'پروفایل، اعلان‌ها و تنظیمات',
    labelEn: 'Profile & Settings',
    primaryTab: 'notifications',
    href: '/account/notifications',
    icon: Settings,
    children: [
      { id: 'notifications', labelFa: 'صندوق اعلان‌ها', labelEn: 'Notifications', href: '/account/notifications' },
      { id: 'profile', labelFa: 'مشخصات پروفایل', labelEn: 'Profile', href: '/account/profile' },
      { id: 'settings', labelFa: 'تنظیمات و حریم خصوصی', labelEn: 'Settings & Privacy', href: '/account/settings' },
    ],
  },
];

const FLAT_MOBILE_ACCOUNT_TABS: Array<{ id: AccountSubTabId; labelFa: string; labelEn: string; href: string }> = [
  { id: 'overview', labelFa: 'نمای کلی', labelEn: 'Overview', href: '/account' },
  { id: 'favorites', labelFa: 'منتخب‌ها', labelEn: 'Favorites', href: '/account/favorites' },
  { id: 'saved_searches', labelFa: 'جست‌وجوهای ذخیره', labelEn: 'Saved Searches', href: '/account/saved-searches' },
  { id: 'saved_views', labelFa: 'نماهای نقشه', labelEn: 'Saved Views', href: '/account/saved-views' },
  { id: 'activity', labelFa: 'بازدیدها و فعالیت', labelEn: 'Activity', href: '/account/activity' },
  { id: 'contributions', labelFa: 'آگهی‌ها و درخواست‌ها', labelEn: 'Contributions', href: '/account/contributions' },
  { id: 'community', labelFa: 'فعالیت جامعه', labelEn: 'Community', href: '/account/community' },
  { id: 'notifications', labelFa: 'اعلان‌ها', labelEn: 'Notifications', href: '/account/notifications' },
  { id: 'profile', labelFa: 'پروفایل', labelEn: 'Profile', href: '/account/profile' },
  { id: 'settings', labelFa: 'تنظیمات', labelEn: 'Settings', href: '/account/settings' },
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
      className="w-full lg:w-[252px] shrink-0"
    >
      <div className="p-3 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-2">
        <div className="px-2.5 py-1 text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" aria-hidden="true" />
          <span>{isEn ? 'Radar Account' : 'فضای کاربری رادار'}</span>
        </div>

        {/* Mobile & Tablet: all 10 account destinations directly reachable with >=44px touch targets */}
        <nav
          aria-label={isEn ? 'Mobile account navigation' : 'منوی حساب کاربری موبایل'}
          data-testid="account-mobile-nav"
          className="flex lg:hidden flex-col gap-2"
        >
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {FLAT_MOBILE_ACCOUNT_TABS.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <RadarLink
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  onNavigate={() => onSelectTab(item.id)}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition ${
                    isActive
                      ? 'bg-[var(--color-brand-600)] text-white'
                      : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {isEn ? item.labelEn : item.labelFa}
                </RadarLink>
              );
            })}
          </div>
          {activeGroup?.children && activeGroup.children.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--color-border-subtle)]">
              {activeGroup.children.map((child) => (
                <RadarLink
                  key={child.id}
                  href={child.href}
                  aria-current={currentTab === child.id ? 'page' : undefined}
                  onNavigate={() => onSelectTab(child.id)}
                  className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs transition whitespace-nowrap ${
                    currentTab === child.id
                      ? 'font-bold text-[var(--color-brand-fg)] bg-[var(--color-brand-soft)]'
                      : 'font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
                  }`}
                >
                  {isEn ? child.labelEn : child.labelFa}
                </RadarLink>
              ))}
            </div>
          )}
        </nav>

        {/* Desktop: 5-group hierarchical sidebar */}
        <nav
          aria-label={isEn ? 'Account menu' : 'منوی حساب کاربری'}
          className="hidden lg:flex flex-col gap-1.5"
        >
          {ACCOUNT_NAV_GROUPS.map((group) => {
            const Icon = group.icon;
            const isGroupActive =
              currentTab === group.primaryTab || Boolean(group.children?.some((c) => c.id === currentTab));
            return (
              <div key={group.id} className="w-full space-y-1">
                <RadarLink
                  href={group.href}
                  aria-current={currentTab === group.primaryTab ? 'page' : undefined}
                  onNavigate={() => onSelectTab(group.primaryTab)}
                  className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold justify-start gap-2 transition whitespace-nowrap text-start ${
                    isGroupActive
                      ? 'bg-[var(--color-brand-600)] text-white'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{isEn ? group.labelEn : group.labelFa}</span>
                </RadarLink>
                {group.children && (
                  <div className="flex flex-col gap-0.5 ps-4 border-s-2 border-[var(--color-border-subtle)] ms-3">
                    {group.children.map((child) => (
                      <RadarLink
                        key={child.id}
                        href={child.href}
                        aria-current={currentTab === child.id ? 'page' : undefined}
                        onNavigate={() => onSelectTab(child.id)}
                        className={`w-full min-h-[36px] justify-start text-start px-2.5 py-1.5 rounded-lg text-xs transition ${
                          currentTab === child.id
                            ? 'font-bold text-[var(--color-brand-fg)] bg-[var(--color-brand-soft)]'
                            : 'font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]'
                        }`}
                      >
                        {isEn ? child.labelEn : child.labelFa}
                      </RadarLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};
