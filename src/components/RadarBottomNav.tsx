/** @file src/components/RadarBottomNav.tsx — Mobile Navigation Bar (< 120 lines) [RULE-01] */
import React, { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../utils/areaUnit';
import { getProductNavigationItems } from './navigation/primaryNavigation';

export interface RadarBottomNavProps {
  primaryView?: PrimaryViewId;
  onSelectPrimaryView?: (view: PrimaryViewId) => void;
  mobileSheetOpen: boolean;
  setMobileSheetOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  mobileFilterOpen: boolean;
  setMobileFilterOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  showToolsPopover: boolean;
  setShowToolsPopover: (v: boolean | ((p: boolean) => boolean)) => void;
  isVerifiedAdmin: boolean;
  onOpenAdminModal: () => void;
  onFlyToHood: () => void;
  onOpenSmartSuggest: () => void;
  onOpenCompare: () => void;
  onOpenSubmitProperty: () => void;
}

export function RadarBottomNav(p: RadarBottomNavProps) {
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const isEn = radarLocale === 'en';
  const currencyBadge = formatMillionTomanAsIntlCurrency(5000, intlCurrency, radarLocale);

  const activeView = p.primaryView || 'map';
  const [moreOpen, setMoreOpen] = useState(false);

  const handleSelectView = (view: PrimaryViewId) => {
    setMoreOpen(false);
    if (view === 'admin' && !p.isVerifiedAdmin) {
      p.onOpenAdminModal();
      return;
    }
    p.setMobileSheetOpen(false);
    p.setMobileFilterOpen(false);
    p.setShowToolsPopover(false);
    if (p.onSelectPrimaryView) p.onSelectPrimaryView(view);
    if (view === 'map') p.onFlyToHood();
  };

  const navigationItems = getProductNavigationItems(radarLocale);
  const navItems = navigationItems.filter((item) => item.group === 'primary');
  const moreItems = navigationItems.filter((item) => item.group === 'administrative');
  const isMoreView = moreItems.some((item) => item.id === activeView);

  return (
    <>
      <div
          id="radar-mobile-more-menu"
          role="region"
          aria-label={isEn ? 'More sections' : 'بخش‌های بیشتر'}
          hidden={!moreOpen}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setMoreOpen(false);
          }}
          style={{ bottom: 'calc(3.5rem + var(--safe-bottom))' }}
          className="fixed inset-x-3 z-[41] grid grid-cols-3 gap-1.5 p-2.5 rounded-xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95"
        >
          {moreItems.map((item) => {
            const isActive = activeView === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleSelectView(item.id)}
                className={`min-h-12 flex flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold transition cursor-pointer ${isActive ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="max-w-[72px] truncate">{item.label}</span>
              </button>
            );
          })}
      </div>
      <nav
        aria-label={isEn ? 'Mobile Primary Navigation' : 'نوار پیمایش موبایل'}
        data-currency-sample={currencyBadge}
        className="lg:hidden fixed bottom-0 inset-x-0 flex flex-col pb-[var(--safe-bottom)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 z-40 text-[11px] text-slate-600 dark:text-slate-400 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] dark:shadow-[0_-2px_10px_rgba(0,0,0,0.2)]"
      >
        <div className="grid min-h-14 shrink-0 grid-cols-7">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`mobile-nav-${item.id}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleSelectView(item.id)}
                className={`relative min-w-0 flex flex-col items-center justify-center gap-1 px-1 font-bold transition active:scale-95 cursor-pointer ${isActive ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
              >
                {isActive && <span className="absolute top-0 inset-x-2 h-0.5 rounded-b-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />}
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="line-clamp-2 whitespace-normal text-center leading-3">{item.label}</span>
              </button>
            );
          })}
          <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="radar-mobile-more-menu"
          aria-label={isEn ? 'More sections' : 'بخش‌های بیشتر'}
          onClick={() => {
            p.setMobileSheetOpen(false);
            p.setMobileFilterOpen(false);
            p.setShowToolsPopover(false);
            setMoreOpen((open) => !open);
          }}
          className={`relative min-w-0 flex flex-col items-center justify-center gap-1 px-1 font-bold transition active:scale-95 cursor-pointer ${moreOpen || isMoreView ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
        >
          {(moreOpen || isMoreView) && <span className="absolute top-0 inset-x-2 h-0.5 rounded-b-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />}
          <MoreHorizontal className="w-4 h-4" />
          <span>{isEn ? 'More' : 'بیشتر'}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
