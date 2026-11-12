/** @file src/components/RadarBottomNav.tsx — Mobile Navigation Bar (< 120 lines) [RULE-01] */
import React, { useState, useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../utils/areaUnit';
import { getProductNavigationItems, type ProductNavigationItem } from './navigation/primaryNavigation';
import { MOBILE_NAV_ORDER, MapCenterButton, NavTabButton, tabActive, tabIdle } from './navigation/radarBottomNavParts';

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
  const navById = useMemo(() => new Map(navigationItems.map((item) => [item.id, item])), [navigationItems]);
  const navItems = MOBILE_NAV_ORDER.map((id) => navById.get(id)).filter((item): item is ProductNavigationItem => !!item);
  const mapItem = navById.get('map');
  const moreItems = navigationItems.filter((item) => item.group === 'administrative');
  const isMoreView = moreItems.some((item) => item.id === activeView);

  return (
    <>
      <div
        id="radar-mobile-more-menu"
        role="menu"
        aria-label={isEn ? 'More sections' : 'بخش‌های بیشتر'}
        aria-hidden={!moreOpen}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setMoreOpen(false);
        }}
        style={{ bottom: 'calc(4.25rem + var(--safe-bottom))' }}
        className={`fixed inset-x-3 z-[41] grid grid-cols-3 gap-1.5 p-2.5 rounded-xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95 transition-opacity duration-150 ${moreOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        {moreItems.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => handleSelectView(item.id)}
              className={`min-h-12 flex flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold transition cursor-pointer touch-manipulation ${isActive ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'text-slate-600 [@media(hover:hover)]:hover:bg-slate-100 dark:text-slate-300 dark:[@media(hover:hover)]:hover:bg-slate-800'}`}
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
        <div className="grid min-h-[3.75rem] shrink-0 grid-cols-7 items-end">
          {navItems.map((item) => {
            if (item.id === 'map' && mapItem) {
              return <MapCenterButton key="map" item={mapItem} isActive={activeView === 'map'} onSelect={() => handleSelectView('map')} />;
            }
            return (
              <NavTabButton key={item.id} item={item} isActive={activeView === item.id} onSelect={() => handleSelectView(item.id)} testId={`mobile-nav-${item.id}`} />
            );
          })}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="radar-mobile-more-menu"
            aria-pressed={moreOpen || isMoreView}
            aria-label={isEn ? 'More sections' : 'بخش‌های بیشتر'}
            onClick={() => {
              p.setMobileSheetOpen(false);
              p.setMobileFilterOpen(false);
              p.setShowToolsPopover(false);
              setMoreOpen((open) => !open);
            }}
            className={`relative min-h-14 min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-bold transition active:scale-95 cursor-pointer touch-manipulation ${moreOpen || isMoreView ? tabActive : tabIdle}`}
          >
            {(moreOpen || isMoreView) && <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />}
            <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
            <span>{isEn ? 'More' : 'بیشتر'}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
