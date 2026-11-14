/** @file src/components/navigation/ProductGlobalHeader.tsx — RT-UI-NAV-001 Uncluttered Global Top Chrome (<= 290 lines) */
import React, { useState, useRef } from 'react';
import { ChevronDown, Map as MapIcon, Moon, Search, Sun, User } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { PrimaryViewId, formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { AreaUnitToggle, ExperienceModeToggle, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { getProductNavigationItems } from './primaryNavigation';
import { DesktopMegaMenu } from './DesktopMegaMenu';
import { HeaderNotificationBell } from '../../features/communications/components/HeaderNotificationBell';
import type { ModuleSubTabId } from '../../navigation/registry/route.types';
import type { MegaMenuEntry } from '../../navigation/primary/megaMenuAndTabsConfig';

export interface ProductGlobalHeaderProps {
  primaryView: PrimaryViewId;
  activeSubTab?: ModuleSubTabId;
  onSelectPrimaryView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  activeCity: CityId;
  onSwitchCity: (cityId: CityId) => void;
  appleTheme: 'light' | 'dark';
  onToggleAppleTheme: () => void;
  onOpenSearch?: () => void;
  onMegaMenuAction?: (actionId: NonNullable<MegaMenuEntry['actionId']>) => void;
  searchQuery?: string;
  activePlaceLabelFa?: string;
  currentUser?: FirebaseUser | null;
  unreadNotificationsCount?: number;
}

const CITIES: { id: CityId; labelFa: string; labelEn: string }[] = [
  { id: 'tehran', labelFa: 'تهران', labelEn: 'Tehran' },
  { id: 'karaj', labelFa: 'کرج', labelEn: 'Karaj' },
  { id: 'mashhad', labelFa: 'مشهد', labelEn: 'Mashhad' },
  { id: 'shiraz', labelFa: 'شیراز', labelEn: 'Shiraz' },
  { id: 'isfahan', labelFa: 'اصفهان', labelEn: 'Isfahan' },
];

export const ProductGlobalHeader: React.FC<ProductGlobalHeaderProps> = ({
  primaryView,
  activeSubTab,
  onSelectPrimaryView,
  activeCity,
  onSwitchCity,
  appleTheme,
  onToggleAppleTheme,
  onOpenSearch,
  onMegaMenuAction,
  searchQuery,
  activePlaceLabelFa,
  currentUser,
  unreadNotificationsCount = 0,
}) => {
  const [radarLocale] = useRadarLocale(), [intlCurrency] = useIntlCurrency();
  const isEn = radarLocale === 'en';
  const [megaMenuOpen, setMegaMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const hoverCloseTimer = useRef<number | null>(null);

  const fxSampleHint = intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(100, intlCurrency, radarLocale) : '';
  const activeCityName = isEn
    ? (CITIES.find((c) => c.id === activeCity)?.labelEn || 'Tehran')
    : (activePlaceLabelFa || MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران');

  const navigationItems = getProductNavigationItems(radarLocale);
  const primaryNavItems = navigationItems.filter((item) => item.group === 'primary');
  const isMoreActive = primaryView === 'services' || primaryView === 'knowledge' || primaryView === 'contributions' || primaryView === 'home';

  const scheduleCloseMega = () => {
    if (hoverCloseTimer.current) window.clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = window.setTimeout(() => setMegaMenuOpen(false), 160);
  };
  const cancelCloseMega = () => {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors">
      <div className={`w-full max-w-[1600px] mx-auto px-4 lg:px-8 flex items-center justify-between gap-2 ${primaryView === 'map' ? 'h-[56px]' : 'h-[56px] lg:h-[68px]'}`}>
        {/* Brand Logo (Home Destination) + Compact City Context */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="global-nav-home"
            aria-current={primaryView === 'home' ? 'page' : undefined}
            onClick={() => { setMegaMenuOpen(false); onSelectPrimaryView('home'); }}
            title={fxSampleHint ? `100M IRT ≈ ${fxSampleHint}` : isEn ? 'Tehran Radar Home' : 'صفحه نخست رادار تهران'}
            className="flex items-center gap-2 group text-start focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-lg cursor-pointer"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black transition ${primaryView === 'home' ? 'bg-emerald-600 text-white' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 group-hover:bg-emerald-700'}`}>
              <MapIcon className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
            </div>
            <div className="hidden min-[400px]:block">
              <span className="font-black text-xs sm:text-sm tracking-tight text-slate-900 dark:text-white whitespace-nowrap block">
                {isEn ? 'Tehran Radar' : 'رادار تهران'}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium hidden xl:block whitespace-nowrap">
                {isEn ? `${activeCityName} Spatial Atlas` : `هوش مکانی ${activeCityName}`}
              </span>
            </div>
          </button>

          <div role="group" aria-label={isEn ? 'Metropolitan Cities' : 'کلان‌شهرها'} className="hidden md:flex items-center border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 bg-slate-50/80 dark:bg-slate-900/80 text-xs">
            {CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={activeCity === c.id}
                onClick={() => onSwitchCity(c.id)}
                className={`px-1.5 xl:px-2 py-0.5 rounded-md text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                  activeCity === c.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isEn ? c.labelEn : c.labelFa}
              </button>
            ))}
          </div>
        </div>

        {/* Strictly max 6 visible Primary Nav Destinations (Map, Areas, Market, Properties, Tools + Mega Menu More) */}
        <nav aria-label={isEn ? 'Primary Navigation' : 'ناوبری اصلی پلتفرم'} className="hidden lg:flex flex-1 justify-center items-center gap-1 min-w-0">
          {primaryNavItems.map((item) => {
            const isActive = primaryView === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`global-nav-${item.id}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => { setMegaMenuOpen(false); onSelectPrimaryView(item.id); }}
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  isActive
                    ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            data-testid="global-nav-more"
            aria-expanded={megaMenuOpen}
            aria-controls="desktop-mega-menu-panel"
            onMouseEnter={() => { cancelCloseMega(); setMegaMenuOpen(true); }}
            onMouseLeave={scheduleCloseMega}
            onClick={() => { cancelCloseMega(); setMegaMenuOpen((prev) => !prev); }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 ${
              megaMenuOpen || isMoreActive
                ? 'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <span>{isEn ? 'More' : 'بیشتر'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${megaMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </nav>

        {/* Global Search + Account + Theme Utility End Cluster (Zero Admin buttons in public chrome) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 relative">
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label={isEn ? 'Search platform' : 'جست‌وجوی سراسری'}
              title={isEn ? 'Search (/)' : 'جست‌وجوی سراسری (/)'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="hidden xl:inline max-w-[96px] truncate">{searchQuery?.trim() || (isEn ? 'Search...' : 'جست‌وجو...')}</span>
            </button>
          )}

          <HeaderNotificationBell
            uid={currentUser?.uid || 'local-user'}
            isEn={isEn}
            onNavigateView={(v, sub) => { setMegaMenuOpen(false); onSelectPrimaryView(v, sub); }}
          />
          {unreadNotificationsCount < 0 && null}

          <button
            type="button"
            data-testid="global-nav-userspace"
            aria-current={primaryView === 'userspace' ? 'page' : undefined}
            onClick={() => { setMegaMenuOpen(false); onSelectPrimaryView('userspace', 'overview'); }}
            onContextMenu={(e) => { e.preventDefault(); setAccountMenuOpen((o) => !o); }}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              primaryView === 'userspace'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden md:inline max-w-[90px] truncate">
              {currentUser?.displayName?.split(' ')[0] || (isEn ? 'Account' : 'حساب من')}
            </span>
          </button>

          <div className="hidden 2xl:flex items-center gap-1">
            <ExperienceModeToggle compact />
            <AreaUnitToggle compact showIntlControls hideAreaUnitOnMobile className="flex-nowrap" />
          </div>

          <button
            type="button"
            onClick={onToggleAppleTheme}
            aria-label={appleTheme === 'dark' ? (isEn ? 'Light Mode' : 'حالت روز') : (isEn ? 'Dark Mode' : 'حالت شب')}
            title={appleTheme === 'dark' ? (isEn ? 'Light Mode' : 'حالت روز') : (isEn ? 'Dark Mode' : 'حالت شب')}
            data-testid="theme-toggle-btn"
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            {appleTheme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
          {accountMenuOpen && (
            <div role="menu" className="hidden" />
          )}
        </div>
      </div>

      <DesktopMegaMenu
        open={megaMenuOpen}
        onClose={() => setMegaMenuOpen(false)}
        onMouseEnterMenu={cancelCloseMega}
        onMouseLeaveMenu={scheduleCloseMega}
        locale={radarLocale}
        activeView={primaryView}
        activeSubTab={activeSubTab}
        onSelectDestination={onSelectPrimaryView}
        onTriggerAction={(actionId) => onMegaMenuAction?.(actionId)}
      />
    </header>
  );
};
