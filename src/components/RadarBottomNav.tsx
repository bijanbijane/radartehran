/** @file src/components/RadarBottomNav.tsx — Strict 5-Item Mobile Navigation Bar (RT-UI-NAV-001 Section 9, < 110 lines) */
import React, { useState, useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../utils/areaUnit';
import { getProductNavigationItems, type ProductNavigationItem } from './navigation/primaryNavigation';
import { MOBILE_NAV_ORDER, MapCenterButton, NavTabButton, tabActive, tabIdle } from './navigation/radarBottomNavParts';
import { MobileMoreSheet } from './navigation/MobileMoreSheet';
import type { CityId } from '../data/multiCityData';

export interface RadarBottomNavProps {
  primaryView?: PrimaryViewId;
  onSelectPrimaryView?: (view: PrimaryViewId) => void;
  activeCity?: CityId;
  onSwitchCity?: (cityId: CityId) => void;
  appleTheme?: 'light' | 'dark';
  onToggleAppleTheme?: () => void;
  mobileSheetOpen: boolean;
  setMobileSheetOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  mobileFilterOpen: boolean;
  setMobileFilterOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  showToolsPopover: boolean;
  setShowToolsPopover: (v: boolean | ((p: boolean) => boolean)) => void;
  onFlyToHood: () => void;
  onOpenOnboarding?: () => void;
  onOpenVisitedLog?: () => void;
  onCloseFloatingPanels?: () => void;
}

export function RadarBottomNav(p: RadarBottomNavProps) {
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const isEn = radarLocale === 'en';
  const currencyBadge = formatMillionTomanAsIntlCurrency(5000, intlCurrency, radarLocale);

  const activeView = p.primaryView || 'map';
  const [moreOpen, setMoreOpen] = useState(false);

  const navigationItems = getProductNavigationItems(radarLocale);
  const navById = useMemo(() => new Map(navigationItems.map((item) => [item.id, item])), [navigationItems]);

  // Never render public mobile nav inside the isolated Admin Shell (NAV-011)
  if (activeView === 'admin') return null;

  const handleSelectView = (view: PrimaryViewId) => {
    setMoreOpen(false);
    p.setMobileSheetOpen(false);
    p.onCloseFloatingPanels?.();
    p.setMobileFilterOpen(false);
    p.setShowToolsPopover(false);
    if (p.onSelectPrimaryView) p.onSelectPrimaryView(view);
    if (view === 'map') p.onFlyToHood();
  };

  const navItems = MOBILE_NAV_ORDER.map((id) => navById.get(id)).filter((item): item is ProductNavigationItem => !!item);
  const mapItem = navById.get('map');
  const isMoreView = ['tools', 'userspace', 'services', 'knowledge', 'contributions', 'home'].includes(activeView);

  return (
    <>
      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        locale={radarLocale}
        activeView={activeView}
        activeCity={p.activeCity || 'tehran'}
        onSwitchCity={(c) => p.onSwitchCity?.(c)}
        appleTheme={p.appleTheme || 'light'}
        onToggleAppleTheme={() => p.onToggleAppleTheme?.()}
        onSelectDestination={handleSelectView}
        onOpenOnboarding={() => p.onOpenOnboarding?.()}
        onOpenVisitedLog={() => p.onOpenVisitedLog?.()}
      />
      <nav
        aria-label={isEn ? 'Mobile Primary Navigation' : 'نوار پیمایش موبایل'}
        data-currency-sample={currencyBadge}
        className="lg:hidden fixed bottom-0 inset-x-0 flex flex-col pb-[var(--safe-bottom)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 z-40 text-[11px] text-slate-600 dark:text-slate-400 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] dark:shadow-[0_-2px_10px_rgba(0,0,0,0.2)]"
      >
        <div className="grid min-h-[64px] shrink-0 grid-cols-5 items-end">
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
            data-testid="mobile-nav-more"
            aria-expanded={moreOpen}
            aria-controls="radar-mobile-more-menu"
            aria-pressed={moreOpen || isMoreView}
            aria-label={isEn ? 'More sections' : 'بخش‌های بیشتر'}
            onClick={() => {
              p.setMobileSheetOpen(false);
              p.onCloseFloatingPanels?.();
              p.setMobileFilterOpen(false);
              p.setShowToolsPopover(false);
              setMoreOpen((open) => !open);
            }}
            className={`relative min-h-14 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 text-[10.5px] font-bold transition active:scale-95 cursor-pointer touch-manipulation ${moreOpen || isMoreView ? tabActive : tabIdle}`}
          >
            {(moreOpen || isMoreView) && <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />}
            <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
            <span>{isEn ? 'More' : 'بیشتر'}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
