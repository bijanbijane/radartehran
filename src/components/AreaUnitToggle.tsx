import React, { useSyncExternalStore } from 'react';
import {
  AreaUnit,
  IntlCurrencyCode,
  RadarExperienceMode,
  RadarLocale,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  getStoredAreaUnit,
  getStoredExperienceMode,
  getStoredIntlCurrency,
  getStoredRadarLocale,
  setStoredAreaUnit,
  setStoredExperienceMode,
  setStoredIntlCurrency,
  setStoredRadarLocale,
  subscribeAreaUnit,
  toggleStoredAreaUnit,
  toggleStoredExperienceMode,
} from '../utils/areaUnit';

export function useAreaUnit(): [AreaUnit, (next: AreaUnit) => void, () => AreaUnit] {
  const unit = useSyncExternalStore(subscribeAreaUnit, getStoredAreaUnit, () => 'sqm' as AreaUnit);
  return [unit, setStoredAreaUnit, toggleStoredAreaUnit];
}

export function useRadarLocale(): [RadarLocale, (next: RadarLocale) => void] {
  const locale = useSyncExternalStore(subscribeAreaUnit, getStoredRadarLocale, () => 'fa' as RadarLocale);
  return [locale, setStoredRadarLocale];
}

export function useIntlCurrency(): [IntlCurrencyCode, (next: IntlCurrencyCode) => void] {
  const currency = useSyncExternalStore(subscribeAreaUnit, getStoredIntlCurrency, () => 'IRT' as IntlCurrencyCode);
  return [currency, setStoredIntlCurrency];
}

export function useExperienceMode(): [RadarExperienceMode, (next: RadarExperienceMode) => void, () => RadarExperienceMode] {
  const mode = useSyncExternalStore(subscribeAreaUnit, getStoredExperienceMode, () => 'simple' as RadarExperienceMode);
  return [mode, setStoredExperienceMode, toggleStoredExperienceMode];
}

interface AreaUnitToggleProps {
  compact?: boolean;
  showIntlControls?: boolean;
  hideAreaUnitOnMobile?: boolean;
  className?: string;
}

export const AreaUnitToggle: React.FC<AreaUnitToggleProps> = () => {
  void formatAreaUnitLabel('sqm');
  void formatMillionTomanAsIntlCurrency(0, 'IRT', 'fa');
  return null;
};

interface ExperienceModeToggleProps {
  compact?: boolean;
  className?: string;
}

export const ExperienceModeToggle: React.FC<ExperienceModeToggleProps> = ({ compact = false, className = '' }) => {
  const [mode, setMode] = useExperienceMode();
  const displayClass = className.includes('hidden') ? '' : 'inline-flex';
  return (
    <div
      role="group"
      aria-label="حالت تجربه کاربری ساده یا تخصصی"
      className={`${displayClass} items-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 p-0.5 border border-slate-200/80 dark:border-slate-700/80 select-none ${className}`}
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => setMode('simple')}
        aria-pressed={mode === 'simple'}
        className={`font-bold transition-all rounded-lg ${compact ? 'px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-[11px]' : 'px-2.5 py-1 text-xs'} ${
          mode === 'simple'
            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        ساده
      </button>
      <button
        type="button"
        onClick={() => setMode('pro')}
        aria-pressed={mode === 'pro'}
        className={`font-bold transition-all rounded-lg ${compact ? 'px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-[11px]' : 'px-2.5 py-1 text-xs'} ${
          mode === 'pro'
            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        تخصصی
      </button>
    </div>
  );
};
