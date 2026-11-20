/** @file src/components/navigation/ProductGlobalHeader.tsx — RT-UI-NAV-001 Uncluttered Global Top Chrome (<= 290 lines) */
import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, HelpCircle, Map as MapIcon, Moon, Search, SlidersHorizontal, Sun, User } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { CANONICAL_BRAND_EN, CANONICAL_BRAND_FA } from '../../utils/geo/cityGeospatialResolver';
import { PrimaryViewId, formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { AreaUnitToggle, ExperienceModeToggle, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useExchangeRateSnapshot } from '../../features/commerce/services/exchangeRateClient';
import { getProductNavigationItems } from './primaryNavigation';
import { DesktopMegaMenu } from './DesktopMegaMenu';
import { useMegaMenuLifecycle } from './useMegaMenuLifecycle';
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
  isSearchOpen?: boolean;
  onMegaMenuAction?: (actionId: NonNullable<MegaMenuEntry['actionId']>) => void;
  searchQuery?: string;
  activePlaceLabelFa?: string;
  invalidCityParam?: string | null;
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
  primaryView, activeSubTab, onSelectPrimaryView, activeCity, onSwitchCity, appleTheme,
  onToggleAppleTheme, onOpenSearch, isSearchOpen, onMegaMenuAction, searchQuery, activePlaceLabelFa,
  invalidCityParam, currentUser, unreadNotificationsCount,
}) => {
  const [radarLocale] = useRadarLocale(), [intlCurrency] = useIntlCurrency();
  const rateState = useExchangeRateSnapshot();
  const isEn = radarLocale === 'en';
  const megaMenuPanelId = `desktop-mega-menu-panel-${useId().replace(/:/g, '')}`;
  const [mobileDisplayOpen, setMobileDisplayOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileDisplayRef = useRef<HTMLDivElement | null>(null);

  const {
    megaMenuOpen,
    cancelCloseMega,
    scheduleCloseMega,
    openFromHover,
    toggleFromTriggerClick,
    closeMegaMenu,
  } = useMegaMenuLifecycle({ activeCity, radarLocale, primaryView });

  const fxSampleHint = intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(100, intlCurrency, radarLocale, rateState.snapshot) : '';
  const cityCfg = MULTI_CITY_CONFIGS[activeCity] || MULTI_CITY_CONFIGS.tehran;
  const brandLabel = isEn ? CANONICAL_BRAND_EN : CANONICAL_BRAND_FA;
  const activeCityName = invalidCityParam
    ? (isEn ? 'Unsupported City' : 'شهر پشتیبانی‌نشده')
    : (isEn ? (CITIES.find((c) => c.id === activeCity)?.labelEn || 'Tehran') : (activePlaceLabelFa || cityCfg.nameFa || 'تهران'));
  const navigationItems = getProductNavigationItems(radarLocale);
  const primaryNavItems = (['map', 'discover', 'intelligence', 'properties', 'tools'] as const)
    .map((id) => navigationItems.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const isMoreActive = primaryView === 'services' || primaryView === 'knowledge' || primaryView === 'contributions' || primaryView === 'home';

  useEffect(() => {
    if (!mobileDisplayOpen || typeof window === 'undefined') return undefined;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileDisplayOpen(false); };
    const onMouseDown = (e: MouseEvent) => {
      if (mobileDisplayRef.current && !mobileDisplayRef.current.contains(e.target as Node)) setMobileDisplayOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => { window.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onMouseDown); };
  }, [mobileDisplayOpen]);

  return (
    <header className="sticky top-0 z-[45] w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors">
      <a
        id="radar-skip-to-main-link"
        href="#radar-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-4 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-lg focus:bg-[#176B63] focus:text-white focus:font-bold focus:text-xs"
      >
        {isEn ? 'Skip to main content' : 'رفتن به محتوای اصلی'}
      </a>
      <div className={`w-full max-w-[1600px] mx-auto px-3 sm:px-4 flex items-center justify-between gap-2 ${primaryView === 'map' ? 'h-[56px]' : 'h-[56px] lg:h-[68px]'}`}>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="global-nav-home"
            aria-current={primaryView === 'home' ? 'page' : undefined}
            onClick={() => { closeMegaMenu(); onSelectPrimaryView('home'); }}
            title={fxSampleHint ? `۱۰۰ میلیون تومان ≈ ${fxSampleHint}` : isEn ? `${brandLabel} | ${activeCityName} Home` : `صفحه نخست ${brandLabel} | ${activeCityName}`}
            className="flex items-center gap-2 group text-start focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-lg cursor-pointer"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black transition ${primaryView === 'home' ? 'bg-emerald-600 text-white' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 group-hover:bg-emerald-700'}`}>
              <MapIcon className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
            </div>
            <div className="block">
              <span data-testid="global-brand-name" className="font-black text-[11px] sm:text-sm tracking-tight text-slate-900 dark:text-white whitespace-nowrap flex items-center gap-1">
                <span>{brandLabel}</span>
                <span className="text-slate-300 dark:text-slate-600 font-normal" aria-hidden="true">|</span>
                <span data-testid="global-active-city-label" className={`font-extrabold text-[10.5px] sm:text-xs ${invalidCityParam ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{activeCityName}</span>
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium hidden 2xl:block whitespace-nowrap">
                {isEn ? `${activeCityName} Spatial Atlas` : `هوش مکانی ${activeCityName}`}
              </span>
            </div>
          </button>

          <div role="group" aria-label={isEn ? 'Metropolitan Cities' : 'کلان‌شهرها'} className="hidden xl:flex items-center shrink-0 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 bg-slate-50/80 dark:bg-slate-900/80 text-xs">
            {CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={activeCity === c.id}
                onClick={() => onSwitchCity(c.id)}
                className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
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

        <nav aria-label={isEn ? 'Primary Navigation' : 'ناوبری اصلی پلتفرم'} className="hidden lg:flex flex-1 justify-center items-center gap-0.5 min-w-0">
          {primaryNavItems.map((item) => {
            const isActive = primaryView === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`global-nav-${item.id}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => { closeMegaMenu(); onSelectPrimaryView(item.id); }}
                className={`relative flex items-center gap-1.5 px-1.5 xl:px-2 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 ${
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
            ref={moreButtonRef}
            type="button"
            data-testid="global-nav-more"
            aria-expanded={megaMenuOpen}
            aria-controls={megaMenuPanelId}
            onMouseEnter={openFromHover}
            onMouseLeave={scheduleCloseMega}
            onClick={toggleFromTriggerClick}
            className={`flex items-center gap-1 px-1.5 xl:px-2 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 ${
              megaMenuOpen || isMoreActive
                ? 'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <span>{isEn ? 'More' : 'بیشتر'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${megaMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </nav>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 relative">
          {onOpenSearch && (
            <button
              type="button"
              data-global-search-trigger="true"
              aria-expanded={isSearchOpen}
              onClick={onOpenSearch}
              aria-label={isEn ? 'Search platform' : 'جست‌وجوی سراسری'}
              title={isEn ? 'Search (/)' : 'جست‌وجوی سراسری (/)'}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              {primaryView !== 'map' && (
                <span className="hidden 2xl:inline max-w-[90px] truncate">{searchQuery?.trim() || (isEn ? 'Search...' : 'جست‌وجو...')}</span>
              )}
            </button>
          )}
          <button
            type="button"
            data-testid="global-nav-help-center"
            aria-label={isEn ? 'Help & Onboarding Center' : 'مرکز راهنما و آموزش استفاده'}
            title={isEn ? 'Help & Onboarding (/help)' : 'مرکز راهنما و آموزش استفاده (/help)'}
            onClick={() => { closeMegaMenu(); onSelectPrimaryView('knowledge', 'guide'); }}
            className="hidden sm:inline-flex p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
          </button>
          <HeaderNotificationBell
            uid={currentUser?.uid || 'local-user'}
            isEn={isEn}
            unreadNotificationsCount={unreadNotificationsCount}
            onNavigateView={(v, sub) => { closeMegaMenu(); onSelectPrimaryView(v, sub); }}
          />
          <button
            type="button"
            data-testid="global-nav-userspace"
            aria-label={currentUser?.displayName?.split(' ')[0] || (isEn ? 'Account' : 'حساب من')}
            title={currentUser?.displayName?.split(' ')[0] || (isEn ? 'Account' : 'حساب من')}
            aria-current={primaryView === 'userspace' ? 'page' : undefined}
            onClick={() => { closeMegaMenu(); onSelectPrimaryView('userspace', 'overview'); }}
            className={`hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              primaryView === 'userspace'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden 2xl:inline max-w-[84px] truncate">{currentUser?.displayName?.split(' ')[0] || (isEn ? 'Account' : 'حساب من')}</span>
          </button>

          <div className="hidden 2xl:flex items-center gap-1">
            <div className="hidden 2xl:inline-flex"><ExperienceModeToggle compact /></div>
            <AreaUnitToggle compact showIntlControls className="flex-nowrap" />
          </div>

          <div ref={mobileDisplayRef} className="relative 2xl:hidden">
            <button
              type="button"
              data-testid="mobile-unit-currency-btn"
              aria-expanded={mobileDisplayOpen}
              aria-label={isEn ? 'Area unit and currency settings' : 'تنظیم واحد مساحت و ارز'}
              onClick={() => setMobileDisplayOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[10.5px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{isEn ? 'Unit/FX' : 'واحد/ارز'}</span>
            </button>
            {mobileDisplayOpen && (
              <div role="dialog" aria-label={isEn ? 'Unit, currency & mode settings' : 'تنظیمات واحد، ارز و حالت تجربه'} className="absolute end-0 top-10 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3 space-y-2.5 z-50 text-xs">
                <div className="font-black text-slate-800 dark:text-white">{isEn ? 'Display Unit & Currency' : 'تنظیم واحد نمایش و ارز'}</div>
                <AreaUnitToggle compact showIntlControls />
                <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{isEn ? 'View Mode:' : 'حالت نمایش:'}</span>
                  <ExperienceModeToggle compact />
                </div>
              </div>
            )}
          </div>

          <button type="button" onClick={onToggleAppleTheme} aria-label={appleTheme === 'dark' ? (isEn ? 'Light mode' : 'حالت روز') : (isEn ? 'Dark mode' : 'حالت شب')} title={appleTheme === 'dark' ? (isEn ? 'Light mode' : 'حالت روز') : (isEn ? 'Dark mode' : 'حالت شب')} data-testid="theme-toggle-btn" className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
            {appleTheme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>

      {megaMenuOpen && (
        <div aria-hidden="true" onMouseEnter={cancelCloseMega} onMouseLeave={scheduleCloseMega} className={`hidden lg:block absolute inset-x-4 max-w-5xl mx-auto bottom-0 z-40 ${primaryView === 'map' ? 'h-[15px]' : 'h-[15px] lg:h-[21px]'}`} />
      )}

      <DesktopMegaMenu
        open={megaMenuOpen} onClose={closeMegaMenu} onMouseEnterMenu={cancelCloseMega} onMouseLeaveMenu={scheduleCloseMega}
        triggerRef={moreButtonRef} panelId={megaMenuPanelId}
        locale={radarLocale} activeView={primaryView} activeSubTab={activeSubTab}
        onSelectDestination={onSelectPrimaryView} onTriggerAction={(actionId) => onMegaMenuAction?.(actionId)}
      />
    </header>
  );
};
