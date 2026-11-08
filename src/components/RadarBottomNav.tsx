/** @file src/components/RadarBottomNav.tsx — Mobile Navigation Bar (< 120 lines) [RULE-01] */
import React from 'react';
import {
  Compass, Home, TrendingUp, Wrench, User, Map as MapIcon, Shield,
} from 'lucide-react';
import { useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { PrimaryViewId, getRadarGlobalNavCopy, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface RadarBottomNavProps {
  primaryView?: PrimaryViewId;
  onSelectPrimaryView?: (view: PrimaryViewId) => void;
  mobileSheetOpen: boolean;
  setMobileSheetOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  mobileFilterOpen: boolean;
  setMobileFilterOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  showToolsPopover: boolean;
  setShowToolsPopover: (v: boolean | ((p: boolean) => boolean)) => void;
  onFlyToHood: () => void;
  onOpenSmartSuggest: () => void;
  onOpenCompare: () => void;
  onOpenSubmitProperty: () => void;
}

export function RadarBottomNav(p: RadarBottomNavProps) {
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const isEn = radarLocale === 'en';
  const navCopy = getRadarGlobalNavCopy(radarLocale);
  const currencyBadge = formatMillionTomanAsIntlCurrency(5000, intlCurrency, radarLocale);

  const activeView = p.primaryView || 'map';

  const handleSelectView = (view: PrimaryViewId) => {
    p.setMobileSheetOpen(false);
    p.setMobileFilterOpen(false);
    p.setShowToolsPopover(false);
    if (p.onSelectPrimaryView) p.onSelectPrimaryView(view);
    if (view === 'map') p.onFlyToHood();
  };

  const navItems: { id: PrimaryViewId; label: string; icon: React.ReactNode }[] = [
    { id: 'map', label: navCopy.map, icon: <MapIcon className="w-4 h-4 stroke-[1.9]" /> },
    { id: 'discover', label: navCopy.discover, icon: <Compass className="w-4 h-4 stroke-[1.9]" /> },
    { id: 'intelligence', label: navCopy.intelligence, icon: <TrendingUp className="w-4 h-4 stroke-[1.9]" /> },
    { id: 'tools', label: navCopy.tools, icon: <Wrench className="w-4 h-4 stroke-[1.9]" /> },
    { id: 'home', label: navCopy.home, icon: <Home className="w-4 h-4 stroke-[1.9]" /> },
    { id: 'userspace', label: navCopy.userspace, icon: <User className="w-4 h-4 stroke-[1.9]" /> },
    { id: 'admin', label: isEn ? 'Admin' : 'مدیریت', icon: <Shield className="w-4 h-4 stroke-[1.9]" /> },
  ];

  return (
    <nav
      aria-label={isEn ? 'Mobile Primary Navigation' : 'نوار پیمایش موبایل'}
      data-currency-sample={currencyBadge}
      className="lg:hidden fixed bottom-0 inset-x-0 h-14 pb-[env(safe-area-inset-bottom,0px)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-7 z-40 text-[10px] text-slate-600 dark:text-slate-400 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] dark:shadow-[0_-2px_10px_rgba(0,0,0,0.2)]"
    >
      {navItems.map((item) => {
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => handleSelectView(item.id)}
            className={`relative flex flex-col items-center justify-center gap-1 font-bold transition active:scale-95 cursor-pointer ${
              isActive
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isActive && (
              <span className="absolute top-0 inset-x-2 h-0.5 rounded-b-full bg-emerald-600 dark:bg-emerald-400 shadow-[0_1px_4px_rgba(16,185,129,0.4)]" aria-hidden="true" />
            )}
            {item.icon}
            <span className="truncate max-w-[52px]">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
