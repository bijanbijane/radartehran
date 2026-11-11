/** @file src/components/navigation/ProductGlobalHeader.tsx — Radical Redesign Global Navigation (< 220 lines) [RULE-01] */
import React, { useState } from 'react';
import {
  ChevronDown, Map as MapIcon, MoreHorizontal, Search, Moon, Sun,
  SlidersHorizontal, Calculator, Shield, ShieldAlert,
} from 'lucide-react';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { PrimaryViewId, formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { AreaUnitToggle, ExperienceModeToggle, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { getProductNavigationItems } from './primaryNavigation';

export interface ProductGlobalHeaderProps {
  primaryView: PrimaryViewId;
  onSelectPrimaryView: (view: PrimaryViewId) => void;
  activeCity: CityId;
  onSwitchCity: (cityId: CityId) => void;
  appleTheme: 'light' | 'dark';
  onToggleAppleTheme: () => void;
  onOpenBudgetFilter?: () => void;
  onOpenReverseBudget?: () => void;
  onOpenListingVerifier?: () => void;
  onOpenSearch?: () => void;
  onOpenSecurityAdmin?: () => void;
  searchQuery?: string;
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
  onSelectPrimaryView,
  activeCity,
  onSwitchCity,
  appleTheme,
  onToggleAppleTheme,
  onOpenBudgetFilter,
  onOpenReverseBudget,
  onOpenListingVerifier,
  onOpenSearch,
  onOpenSecurityAdmin,
  searchQuery,
}) => {
  const [radarLocale] = useRadarLocale(), [intlCurrency] = useIntlCurrency();
  const isEn = radarLocale === 'en';
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const fxSampleHint = intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(100, intlCurrency, radarLocale) : '';
  const activeCityName = isEn
    ? (CITIES.find((c) => c.id === activeCity)?.labelEn || 'Tehran')
    : (MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران');

  const navigationItems = getProductNavigationItems(radarLocale);
  const navItems = navigationItems.filter((item) => item.group === 'primary');
  const adminItem = navigationItems.find((item) => item.group === 'administrative');
  const activeSection = navItems.find((item) => item.id === primaryView);

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors overflow-x-clip">
      <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-3 lg:px-4 h-16 flex items-center justify-between gap-1.5">
        {/* Brand & City Picker */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSelectPrimaryView('map')}
            title={fxSampleHint ? `100M IRT ≈ ${fxSampleHint}` : isEn ? 'Return to interactive map' : 'بازگشت به نقشه اصلی'}
            className="flex items-center gap-1.5 sm:gap-2 group text-start focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-lg cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-black transition group-hover:bg-emerald-700 dark:group-hover:bg-emerald-400">
              <MapIcon className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div className="hidden min-[420px]:block">
              <span className="font-black text-xs sm:text-sm tracking-tight text-slate-900 dark:text-white whitespace-nowrap block">
                {isEn ? 'Tehran Radar' : 'رادار املاک'}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium hidden 2xl:block whitespace-nowrap">
                {isEn ? `${activeCityName} Spatial Atlas` : `اطلس مکانی ${activeCityName}`}
              </span>
            </div>
          </button>

          {/* Mobile City Selector (< md) */}
          <select
            aria-label={isEn ? 'Select City' : 'انتخاب کلان‌شهر'}
            value={activeCity}
            onChange={(e) => onSwitchCity(e.target.value as CityId)}
            className="md:hidden px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
          >
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>{isEn ? c.labelEn : c.labelFa}</option>
            ))}
          </select>

          {/* City select segmented (Desktop/Tablet) */}
          <div role="group" aria-label={isEn ? 'Metropolitan Cities' : 'کلان‌شهرها'} className="hidden md:flex items-center border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 bg-slate-50/80 dark:bg-slate-900/80 text-xs">
            {CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={activeCity === c.id}
                onClick={() => onSwitchCity(c.id)}
                className={`px-1.5 xl:px-2 py-0.5 rounded-md text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                  activeCity === c.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isEn ? c.labelEn : c.labelFa}
              </button>
            ))}
          </div>
        </div>

        {/* Primary View Tabs (Desktop / Tablet) */}
        <nav aria-label={isEn ? 'Primary Navigation' : 'بخش‌های اصلی پلتفرم'} className="hidden lg:flex flex-1 justify-center items-center gap-0.5 min-w-0">
          {navItems.map((item) => {
            const isActive = primaryView === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`global-nav-${item.id}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectPrimaryView(item.id)}
                className={`relative flex items-center gap-1 px-1.5 xl:px-2 py-1.5 rounded-lg text-[11px] xl:text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  isActive
                    ? 'text-slate-900 dark:text-white bg-slate-100/90 dark:bg-slate-800 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="hidden md:block lg:hidden relative shrink-0">
          <button
            type="button"
            aria-expanded={sectionsOpen}
            aria-controls="desktop-primary-navigation-menu"
            onClick={() => setSectionsOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            <span>{activeSection?.label || (isEn ? 'Sections' : 'بخش‌ها')}</span>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <div
            id="desktop-primary-navigation-menu"
            role="group"
            aria-label={isEn ? 'Primary sections' : 'بخش‌های اصلی'}
            hidden={!sectionsOpen}
            className="absolute left-1/2 top-full z-50 mt-2 grid w-64 -translate-x-1/2 grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            {navItems.map((item) => {
              const isActive = primaryView === item.id;
              const Icon = item.Icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setSectionsOpen(false);
                    onSelectPrimaryView(item.id);
                  }}
                  className={`flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-start text-xs font-semibold transition ${isActive ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label={isEn ? 'Search neighborhood' : 'جستجوی محله'}
              title={isEn ? 'Search neighborhood (/)' : 'جستجوی محله (/)'}
              className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden 2xl:inline max-w-[90px] truncate">{searchQuery?.trim() || (isEn ? 'Search...' : 'جستجو...')}</span>
            </button>
          )}

          {onOpenReverseBudget && (
            <button
              type="button"
              onClick={onOpenReverseBudget}
              aria-label={isEn ? 'Reverse Budget Finder' : 'محاسبه با بودجه معکوس'}
              title={isEn ? 'Where can I buy with my budget?' : 'محاسبه با بودجه معکوس'}
              className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800 hover:bg-emerald-100/70 transition cursor-pointer whitespace-nowrap"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">{isEn ? 'Reverse Budget' : 'بودجه معکوس'}</span>
            </button>
          )}

          {onOpenListingVerifier && (
            <button
              type="button"
              data-testid="header-open-listing-verifier-btn"
              onClick={onOpenListingVerifier}
              aria-label={isEn ? 'Scan Listing & Red Flags' : 'کارشناسی آگهی و کشف تله‌ها'}
              title={isEn ? 'Scan real-estate listing for traps' : 'کارشناسی آگهی و حباب‌سنج مسکن'}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-800 hover:bg-rose-100/70 transition cursor-pointer whitespace-nowrap shadow-2xs"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span className="hidden sm:inline">{isEn ? 'Verify Ad' : 'کارشناسی آگهی'}</span>
            </button>
          )}

          {onOpenBudgetFilter && (
            <button
              type="button"
              onClick={onOpenBudgetFilter}
              aria-label={isEn ? 'Budget & Filters' : 'تنظیمات بودجه و فیلترها'}
              title={isEn ? 'Budget & Filters' : 'تنظیمات بودجه و فیلترها'}
              className="flex items-center gap-1 p-1.5 sm:px-2 sm:py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden 2xl:inline">{isEn ? 'Budget' : 'بودجه'}</span>
            </button>
          )}

          {onOpenSecurityAdmin && (
            <button
              type="button"
              onClick={onOpenSecurityAdmin}
              aria-label={adminItem?.label || (isEn ? 'Admin monitoring' : 'مدیریت و پایش')}
              title={adminItem?.label || (isEn ? 'Admin monitoring' : 'مدیریت و پایش')}
              data-testid="global-header-security-btn"
              className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800 hover:bg-indigo-100/80 transition cursor-pointer whitespace-nowrap"
            >
              <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="hidden 2xl:inline">{adminItem?.label || (isEn ? 'Admin' : 'مدیریت')}</span>
            </button>
          )}

          {/* Experience Mode (Simple / Pro) + Area Unit (m²/ft²), Language & Currency */}
          <div className="flex items-center gap-1">
            <ExperienceModeToggle compact className="hidden sm:inline-flex" />
            <AreaUnitToggle compact showIntlControls className="flex-nowrap" />
          </div>

          {/* Theme Switcher */}
          <button
            type="button"
            onClick={onToggleAppleTheme}
            aria-label={appleTheme === 'dark' ? (isEn ? 'Light Mode' : 'حالت روز') : (isEn ? 'Dark Mode' : 'حالت شب')}
            title={appleTheme === 'dark' ? (isEn ? 'Light Mode' : 'حالت روز') : (isEn ? 'Dark Mode' : 'حالت شب')}
            data-testid="theme-toggle-btn"
            className="p-1.5 sm:p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            {appleTheme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
