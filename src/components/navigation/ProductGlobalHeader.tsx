/** @file src/components/navigation/ProductGlobalHeader.tsx — Uncluttered Global Top Chrome (<= 290 lines) */
/** OP-DEC-001 FX parity: formatMillionTomanAsIntlCurrency (via ExperienceModeToggle / AreaUnitToggle). */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Globe, Map as MapIcon, MapPin, Moon, Search, Sun, User } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { CANONICAL_BRAND_EN, CANONICAL_BRAND_FA } from '../../utils/geo/cityGeospatialResolver';
import { PrimaryViewId } from '../../utils/areaUnit';
import { useRadarLocale } from '../AreaUnitToggle';
import { getProductNavigationItems } from './primaryNavigation';
import { useNavigationVisibilityContext } from '../../navigation/hooks/useNavigationVisibilityContext';
import { DesktopMegaMenu } from './DesktopMegaMenu';
import { useMegaMenuLifecycle } from './useMegaMenuLifecycle';
import { normalizeUnreadNotificationCount } from '../../features/communications/components/HeaderNotificationBell';
import { RadarLink } from '../ui/RadarPrimitives';
import { buildCanonicalPathForDestination } from '../../navigation/url/navigationUrlContract';
import type { ModuleSubTabId } from '../../navigation/registry/route.types';
import type { MegaMenuEntry } from '../../navigation/primary/megaMenuAndTabsConfig';

export interface ProductGlobalHeaderProps {
  primaryView: PrimaryViewId;
  activeSubTab?: ModuleSubTabId;
  onSelectPrimaryView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  activeCity: CityId;
  onSwitchCity: (cityId: CityId) => void;
  onOpenProvincesModal?: () => void;
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
  primaryView, activeSubTab, onSelectPrimaryView, activeCity, onSwitchCity, onOpenProvincesModal, appleTheme,
  onToggleAppleTheme, onOpenSearch, isSearchOpen, onMegaMenuAction, searchQuery, activePlaceLabelFa,
  invalidCityParam, currentUser, unreadNotificationsCount,
}) => {
  const [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const megaMenuPanelId = `desktop-mega-menu-panel-${useId().replace(/:/g, '')}`;
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const cityDropdownRef = useRef<HTMLDivElement | null>(null);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);

  const {
    megaMenuOpen, cancelCloseMega, scheduleCloseMega, openFromHover, toggleFromTriggerClick, closeMegaMenu,
  } = useMegaMenuLifecycle({ activeCity, radarLocale, primaryView });

  useEffect(() => {
    if (!cityMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target as Node)) setCityMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCityMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [cityMenuOpen]);

  const cityCfg = MULTI_CITY_CONFIGS[activeCity] || MULTI_CITY_CONFIGS.tehran;
  const brandLabel = isEn ? CANONICAL_BRAND_EN : CANONICAL_BRAND_FA;
  const activeCityName = invalidCityParam
    ? (isEn ? 'Unsupported City' : 'شهر نامعتبر')
    : (isEn ? (CITIES.find((c) => c.id === activeCity)?.labelEn || 'Tehran') : (activePlaceLabelFa || cityCfg.nameFa || 'تهران'));
  const visibilityCtx = useNavigationVisibilityContext();
  const navigationItems = useMemo(() => getProductNavigationItems(radarLocale, visibilityCtx), [radarLocale, visibilityCtx]);
  const primaryNavItems = (['map', 'discover', 'intelligence', 'properties', 'tools'] as const)
    .map((id) => navigationItems.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const isLegalRoute = activeSubTab === 'legal_privacy' || activeSubTab === 'legal_terms';
  const isMoreActive =
    !isLegalRoute && (primaryView === 'services' || primaryView === 'knowledge' || primaryView === 'contributions');
  const unreadCount = normalizeUnreadNotificationCount(unreadNotificationsCount ?? 0);
  const formattedUnread = unreadCount > 9 ? (isEn ? '9+' : '+۹') : unreadCount.toLocaleString(isEn ? 'en-US' : 'fa-IR');

  return (
    <header
      dir={isEn ? 'ltr' : 'rtl'}
      className="sticky top-0 z-[45] w-full bg-[var(--color-bg-surface)]/95 backdrop-blur-md border-b border-[var(--color-border-subtle)] transition-colors"
    >
      <a
        id="radar-skip-to-main-link"
        href="#radar-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-4 focus:z-50 focus:px-3 focus:py-2 focus:rounded-[8px] focus:bg-[var(--color-brand-600)] focus:text-white focus:font-bold focus:text-xs"
      >
        {isEn ? 'Skip to main content' : 'رفتن به محتوای اصلی'}
      </a>
      <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-4 flex items-center justify-between gap-2 h-[var(--header-height)]">
        <div className="flex items-center gap-2 shrink-0">
          <RadarLink
            href="/"
            data-testid="global-nav-home"
            aria-label={isEn ? `${brandLabel} — Home` : `${brandLabel} — صفحه اصلی`}
            aria-current={primaryView === 'home' ? 'page' : undefined}
            onNavigate={() => { closeMegaMenu(); onSelectPrimaryView('home'); }}
            className="flex items-center gap-2 min-h-[44px] md:min-h-[38px] px-1 group text-start rounded-[8px] cursor-pointer"
          >
            <div className={`w-8 h-8 rounded-[8px] flex items-center justify-center transition shrink-0 ${primaryView === 'home' ? 'bg-[var(--color-brand-600)] text-white' : 'bg-[var(--color-brand-600)]/90 text-white group-hover:bg-[var(--color-brand-700)]'}`}>
              <MapIcon className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
            </div>
            <span data-testid="global-brand-name" aria-hidden="true" className="font-bold text-sm tracking-tight text-[var(--color-text-primary)] whitespace-nowrap">
              {brandLabel}
            </span>
          </RadarLink>

          <div ref={cityDropdownRef} className="relative shrink-0">
            <button
              type="button"
              data-testid="global-city-switcher"
              aria-expanded={cityMenuOpen}
              aria-haspopup="listbox"
              aria-label={isEn ? `Selected city: ${activeCityName}` : `انتخاب شهر (فعال: ${activeCityName})`}
              onClick={() => { closeMegaMenu(); setCityMenuOpen((prev) => !prev); }}
              className="inline-flex items-center gap-1 min-h-[44px] md:min-h-[36px] px-2.5 rounded-[8px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-muted)] hover:border-[var(--color-border-strong)] text-xs font-semibold text-[var(--color-text-primary)] whitespace-nowrap cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-[var(--color-brand-fg)] shrink-0" aria-hidden="true" />
              <span data-testid="global-active-city-label">{activeCityName}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-[var(--color-text-muted)] transition-transform ${cityMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {cityMenuOpen && (
              <div
                role="listbox"
                aria-label={isEn ? 'Choose metropolitan city' : 'انتخاب کلان‌شهر'}
                className="absolute top-full start-0 mt-1.5 w-48 rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-xl p-1.5 z-50"
              >
                {CITIES.map((c) => {
                  const selected = activeCity === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => { setCityMenuOpen(false); onSwitchCity(c.id); }}
                      className={`w-full min-h-[44px] md:min-h-[40px] px-3 py-1.5 rounded-[8px] text-start text-sm font-semibold flex items-center justify-between cursor-pointer transition ${
                        selected
                          ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)]'
                          : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]'
                      }`}
                    >
                      <span>{isEn ? c.labelEn : c.labelFa}</span>
                      {selected && <span className="w-2 h-2 rounded-full bg-[var(--color-brand-600)]" aria-hidden="true" />}
                    </button>
                  );
                })}
                {onOpenProvincesModal && (
                  <button
                    type="button"
                    onClick={() => { setCityMenuOpen(false); onOpenProvincesModal(); }}
                    className="w-full mt-1 pt-1.5 border-t border-[var(--color-border-subtle)] min-h-[40px] px-3 py-1.5 rounded-[8px] text-start text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" aria-hidden="true" />
                    <span>{isEn ? 'All Provinces' : 'سایر استان‌ها'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <nav aria-label={isEn ? 'Primary Navigation' : 'ناوبری اصلی پلتفرم'} className="hidden md:flex flex-1 justify-center items-center gap-0.5 lg:gap-1 min-w-0">
          {primaryNavItems.map((item) => {
            const isActive = primaryView === item.id;
            const Icon = item.Icon;
            return (
              <RadarLink
                key={item.id}
                href={buildCanonicalPathForDestination(item.id)}
                data-testid={`global-nav-${item.id}`}
                aria-current={isActive ? 'page' : undefined}
                onNavigate={() => { closeMegaMenu(); onSelectPrimaryView(item.id); }}
                className={`relative flex items-center gap-1.5 min-h-[38px] px-2 lg:px-3 py-1.5 rounded-[8px] text-sm font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                  isActive
                    ? 'text-[var(--color-brand-fg)] bg-[var(--color-brand-soft)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0 hidden lg:block" aria-hidden="true" />
                <span>{item.label}</span>
              </RadarLink>
            );
          })}
          <button
            ref={moreButtonRef}
            type="button"
            data-testid="global-nav-more"
            aria-haspopup="menu"
            aria-expanded={megaMenuOpen}
            aria-controls={megaMenuPanelId}
            onMouseEnter={openFromHover}
            onMouseLeave={scheduleCloseMega}
            onClick={toggleFromTriggerClick}
            className={`flex items-center gap-1 min-h-[38px] px-2 lg:px-3 py-1.5 rounded-[8px] text-sm font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
              megaMenuOpen || isMoreActive
                ? 'text-[var(--color-brand-fg)] bg-[var(--color-brand-soft)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]'
            }`}
          >
            <span>{isEn ? 'More' : 'بیشتر'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${megaMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </nav>

        <div className="flex items-center gap-1.5 shrink-0 relative">
          {onOpenSearch && (
            <button
              type="button"
              data-global-search-trigger="true"
              aria-expanded={isSearchOpen}
              onClick={onOpenSearch}
              aria-label={isEn ? 'Search platform' : 'جست‌وجوی سراسری'}
              title={isEn ? 'Search (/)' : 'جست‌وجوی سراسری (/)'}
              className="inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] md:min-w-[36px] md:min-h-[36px] px-2 sm:px-2.5 rounded-[8px] text-xs font-semibold text-[var(--color-text-secondary)] bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] transition cursor-pointer whitespace-nowrap"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              {primaryView !== 'map' && (
                <span className="hidden 2xl:inline max-w-[90px] truncate">{searchQuery?.trim() || (isEn ? 'Search...' : 'جست‌وجو...')}</span>
              )}
            </button>
          )}
          <RadarLink
            href="/account"
            data-testid="global-nav-userspace"
            aria-label={
              unreadCount > 0
                ? (isEn ? `Account (${unreadCount} unread alerts)` : `حساب من (${formattedUnread} اعلان خوانده‌نشده)`)
                : (currentUser?.displayName?.split(' ')[0] || (isEn ? 'Account' : 'حساب من'))
            }
            title={currentUser?.displayName?.split(' ')[0] || (isEn ? 'Account' : 'حساب من')}
            aria-current={primaryView === 'userspace' ? 'page' : undefined}
            onNavigate={() => { closeMegaMenu(); onSelectPrimaryView('userspace', 'overview'); }}
            className={`relative inline-flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] md:min-w-[36px] md:min-h-[36px] px-2 sm:px-2.5 rounded-[8px] text-sm font-semibold whitespace-nowrap transition cursor-pointer ${
              primaryView === 'userspace'
                ? 'bg-[var(--color-brand-600)] text-white'
                : 'border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]'
            }`}
          >
            <User className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline max-w-[84px] truncate">{currentUser?.displayName?.split(' ')[0] || (isEn ? 'Account' : 'حساب من')}</span>
            {unreadCount > 0 && (
              <span data-testid="header-notification-badge" className="absolute -top-1 -start-1 sm:static min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-xs font-bold inline-flex items-center justify-center leading-none tabular-nums">
                {formattedUnread}
              </span>
            )}
          </RadarLink>
          <button
            type="button"
            onClick={onToggleAppleTheme}
            aria-label={appleTheme === 'dark' ? (isEn ? 'Light mode' : 'حالت روز') : (isEn ? 'Dark mode' : 'حالت شب')}
            title={appleTheme === 'dark' ? (isEn ? 'Light mode' : 'حالت روز') : (isEn ? 'Dark mode' : 'حالت شب')}
            data-testid="theme-toggle-btn"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] md:min-w-[36px] md:min-h-[36px] rounded-[8px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] transition cursor-pointer"
          >
            {appleTheme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {megaMenuOpen && (
        <div aria-hidden="true" onMouseEnter={cancelCloseMega} onMouseLeave={scheduleCloseMega} className="hidden md:block absolute inset-x-4 max-w-4xl mx-auto bottom-0 z-40 h-[16px]" />
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
