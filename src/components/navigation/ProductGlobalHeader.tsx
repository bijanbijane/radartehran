/** @file src/components/navigation/ProductGlobalHeader.tsx — Radical Redesign Global Navigation (< 220 lines) [RULE-01] */
import React from 'react';
import {
  Compass, Home, TrendingUp, Wrench, User, Map as MapIcon,
  Search, Moon, Sun, SlidersHorizontal, Calculator, Shield,
} from 'lucide-react';
import { CityId, MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { PrimaryViewId, formatMillionTomanAsIntlCurrency, getRadarGlobalNavCopy } from '../../utils/areaUnit';
import { AreaUnitToggle, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';

export interface ProductGlobalHeaderProps {
  primaryView: PrimaryViewId;
  onSelectPrimaryView: (view: PrimaryViewId) => void;
  activeCity: CityId;
  onSwitchCity: (cityId: CityId) => void;
  appleTheme: 'light' | 'dark';
  onToggleAppleTheme: () => void;
  onOpenBudgetFilter?: () => void;
  onOpenReverseBudget?: () => void;
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
  onOpenSearch,
  onOpenSecurityAdmin,
  searchQuery,
}) => {
  const [radarLocale] = useRadarLocale(), [intlCurrency] = useIntlCurrency();
  const isEn = radarLocale === 'en';
  const navCopy = getRadarGlobalNavCopy(radarLocale);
  const fxSampleHint = intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(100, intlCurrency, radarLocale) : '';
  const activeCityName = isEn
    ? (CITIES.find((c) => c.id === activeCity)?.labelEn || 'Tehran')
    : (MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران');

  const navItems: { id: PrimaryViewId; label: string; icon: React.ReactNode }[] = [
    { id: 'map', label: navCopy.map, icon: <MapIcon className="w-4 h-4" /> },
    { id: 'discover', label: navCopy.discover, icon: <Compass className="w-4 h-4" /> },
    { id: 'intelligence', label: navCopy.intelligence, icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'tools', label: navCopy.tools, icon: <Wrench className="w-4 h-4" /> },
    { id: 'home', label: navCopy.home, icon: <Home className="w-4 h-4" /> },
    { id: 'userspace', label: navCopy.userspace, icon: <User className="w-4 h-4" /> },
    { id: 'admin', label: isEn ? 'Admin' : 'مدیریت و مانیتورینگ', icon: <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> },
  ];

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors overflow-x-clip">
      <div className="w-full max-w-[1600px] mx-auto px-3 lg:px-4 h-16 flex items-center justify-between gap-2">
        {/* Brand & City Picker */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSelectPrimaryView('map')}
            title={fxSampleHint ? `100M IRT ≈ ${fxSampleHint}` : isEn ? 'Return to interactive map' : 'بازگشت به نقشه اصلی'}
            className="flex items-center gap-2 group text-start focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-lg cursor-pointer"
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
            className="md:hidden px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
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
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
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
        <nav aria-label={isEn ? 'Primary Navigation' : 'بخش‌های اصلی پلتفرم'} className="hidden lg:flex items-center gap-0.5 xl:gap-1 min-w-0 overflow-x-auto no-scrollbar shrink">
          {navItems.map((item) => {
            const isActive = primaryView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`global-nav-${item.id}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectPrimaryView(item.id)}
                className={`relative flex items-center gap-1.5 px-2 xl:px-3 py-1.5 rounded-lg text-[11px] xl:text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  isActive
                    ? 'text-slate-900 dark:text-white bg-slate-100/90 dark:bg-slate-800 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label={isEn ? 'Search neighborhood' : 'جستجوی محله'}
              title={isEn ? 'Search neighborhood (/)' : 'جستجوی محله (/)'}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap"
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

          {onOpenBudgetFilter && (
            <button
              type="button"
              onClick={onOpenBudgetFilter}
              aria-label={isEn ? 'Budget & Filters' : 'تنظیمات بودجه و فیلترها'}
              title={isEn ? 'Budget & Filters' : 'تنظیمات بودجه و فیلترها'}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden xl:inline">{isEn ? 'Budget' : 'بودجه'}</span>
            </button>
          )}

          {onOpenSecurityAdmin && (
            <button
              type="button"
              onClick={onOpenSecurityAdmin}
              aria-label={isEn ? 'Security & Diagnostics' : 'دیباگ و امنیت سیستم'}
              title={isEn ? 'Security & Server Diagnostics' : 'بخش امنیت و دیباگ سلامت سرور'}
              data-testid="global-header-security-btn"
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800 hover:bg-indigo-100/80 transition cursor-pointer whitespace-nowrap"
            >
              <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="hidden xl:inline">{isEn ? 'Security' : 'امنیت'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onSelectPrimaryView('admin')}
            aria-label={isEn ? 'Admin & Monitoring Panel' : 'پنل مدیریت و مانیتورینگ'}
            title={isEn ? 'Admin & System Monitoring' : 'ورود مستقیم به صفحه کامل مدیریت و مانیتورینگ (بررسی بدون رمز)'}
            data-testid="global-header-admin-btn"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              primaryView === 'admin'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-extrabold">{isEn ? 'Admin' : 'مدیریت و مانیتورینگ'}</span>
          </button>

          {/* Area Unit (m²/ft²), Language (FA/EN/AR/TR) & International Currency (IRT/USD/EUR/AED) */}
          <div className="flex items-center">
            <AreaUnitToggle compact showIntlControls className="flex-nowrap" />
          </div>

          {/* Theme Switcher */}
          <button
            type="button"
            onClick={onToggleAppleTheme}
            aria-label={appleTheme === 'dark' ? (isEn ? 'Light Mode' : 'حالت روز') : (isEn ? 'Dark Mode' : 'حالت شب')}
            title={appleTheme === 'dark' ? (isEn ? 'Light Mode' : 'حالت روز') : (isEn ? 'Dark Mode' : 'حالت شب')}
            data-testid="theme-toggle-btn"
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
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
