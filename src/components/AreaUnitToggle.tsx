import React, { useSyncExternalStore } from 'react';
import {
  AreaUnit,
  IntlCurrencyCode,
  LocaleResolutionResult,
  RadarExperienceMode,
  RadarLocale,
  SupportedRadarLocale,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  getLastLocaleResolutionState,
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
import {
  formatExchangeRateRecordedDateFa,
  useExchangeRateSnapshot,
} from '../features/commerce/services/exchangeRateClient';

export { useExchangeRateSnapshot };

export function useAreaUnit(): [AreaUnit, (next: AreaUnit) => void, () => AreaUnit] {
  const unit = useSyncExternalStore(subscribeAreaUnit, getStoredAreaUnit, () => 'sqm' as AreaUnit);
  return [unit, setStoredAreaUnit, toggleStoredAreaUnit];
}

export function useRadarLocale(): [SupportedRadarLocale, (next: RadarLocale) => void] {
  const locale = useSyncExternalStore(subscribeAreaUnit, getStoredRadarLocale, () => 'fa' as const);
  return [locale, setStoredRadarLocale];
}

export function useLocaleResolutionState(): LocaleResolutionResult {
  return useSyncExternalStore(subscribeAreaUnit, getLastLocaleResolutionState, getLastLocaleResolutionState);
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

const UNSUPPORTED_CURRENCY_TOOLTIP = 'نرخ مرجع معتبر برای این ارز ثبت نشده است';

export const AreaUnitToggle: React.FC<AreaUnitToggleProps> = ({
  compact = false,
  showIntlControls = false,
  hideAreaUnitOnMobile = false,
  className = '',
}) => {
  const [areaUnit, setAreaUnit] = useAreaUnit();
  const [intlCurrency, setIntlCurrency] = useIntlCurrency();
  const [radarLocale, setRadarLocale] = useRadarLocale();
  const rateState = useExchangeRateSnapshot();
  const isEn = radarLocale === 'en';
  void formatAreaUnitLabel(areaUnit, radarLocale);

  const btnPad = compact ? 'px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-[11px]' : 'px-2.5 py-1 text-xs';
  const activeCls = 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm';
  const idleCls = 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200';
  const usdTitle = rateState.snapshot
    ? isEn
      ? `Server FX rate: 1 USD = ${rateState.snapshot.usdToTomanRate.toLocaleString('en-US')} Toman`
      : `نرخ مرجع سرور: ۱ دلار = ${rateState.snapshot.usdToTomanRate.toLocaleString('fa-IR')} تومان (ثبت ${formatExchangeRateRecordedDateFa(rateState.snapshot.recordedAtIso)}) — ${rateState.snapshot.isStaleWarningFa}`
    : (rateState.errorFa || (isEn ? 'Fetching FX rate...' : 'در حال دریافت نرخ مرجع تبدیل ارز از سرور...'));
  const sampleUsdText = intlCurrency === 'USD' ? formatMillionTomanAsIntlCurrency(100, 'USD', radarLocale, rateState.snapshot) : '';

  return (
    <div className={`inline-flex flex-wrap items-center gap-1 select-none ${className}`} dir={isEn ? 'ltr' : 'rtl'}>
      <div
        role="group"
        aria-label={isEn ? 'Interface Language' : 'زبان رابط کاربری'}
        className="inline-flex items-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 p-0.5 border border-slate-200/80 dark:border-slate-700/80"
      >
        <button
          type="button"
          data-testid="locale-fa"
          onClick={() => setRadarLocale('fa')}
          aria-pressed={!isEn}
          title="فارسی (RTL)"
          className={`font-bold transition-all rounded-lg cursor-pointer ${btnPad} ${!isEn ? activeCls : idleCls}`}
        >
          فا
        </button>
        <button
          type="button"
          data-testid="locale-en"
          onClick={() => setRadarLocale('en')}
          aria-pressed={isEn}
          title="English (LTR)"
          className={`font-bold transition-all rounded-lg cursor-pointer ${btnPad} ${isEn ? activeCls : idleCls}`}
        >
          EN
        </button>
      </div>

      <div
        role="group"
        aria-label={isEn ? 'Area Unit' : 'واحد مساحت'}
        className={`${hideAreaUnitOnMobile ? 'hidden sm:inline-flex' : 'inline-flex'} items-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 p-0.5 border border-slate-200/80 dark:border-slate-700/80`}
      >
        <button
          type="button"
          data-testid="area-unit-sqm"
          onClick={() => setAreaUnit('sqm')}
          aria-pressed={areaUnit === 'sqm'}
          title={isEn ? 'Square Meters (m²)' : 'نمایش بر حسب متر مربع (m²)'}
          className={`font-bold transition-all rounded-lg cursor-pointer ${btnPad} ${areaUnit === 'sqm' ? activeCls : idleCls}`}
        >
          {isEn ? 'm²' : 'متر (m²)'}
        </button>
        <button
          type="button"
          data-testid="area-unit-sqft"
          onClick={() => setAreaUnit('sqft')}
          aria-pressed={areaUnit === 'sqft'}
          title={isEn ? 'Square Feet (ft²)' : 'تبدیل به فوت مربع (ft²)'}
          className={`font-bold transition-all rounded-lg cursor-pointer ${btnPad} ${areaUnit === 'sqft' ? activeCls : idleCls}`}
        >
          {isEn ? 'ft²' : 'فوت (ft²)'}
        </button>
      </div>

      {showIntlControls && (
        <div
          role="group"
          aria-label={isEn ? 'Display Currency' : 'واحد پول نمایش قیمت'}
          className="inline-flex items-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 p-0.5 border border-slate-200/80 dark:border-slate-700/80"
        >
          <button
            type="button"
            data-testid="currency-irt"
            onClick={() => setIntlCurrency('IRT')}
            aria-pressed={intlCurrency === 'IRT'}
            className={`font-bold transition-all rounded-lg cursor-pointer ${btnPad} ${intlCurrency === 'IRT' ? activeCls : idleCls}`}
          >
            {isEn ? 'Toman' : 'تومان'}
          </button>
          <button
            type="button"
            data-testid="currency-usd"
            onClick={() => setIntlCurrency('USD')}
            aria-pressed={intlCurrency === 'USD'}
            title={usdTitle}
            className={`font-bold transition-all rounded-lg cursor-pointer ${btnPad} ${intlCurrency === 'USD' ? activeCls : idleCls}`}
          >
            USD
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={isEn ? 'No valid reference rate recorded' : UNSUPPORTED_CURRENCY_TOOLTIP}
            className={`font-bold rounded-lg opacity-45 cursor-not-allowed text-slate-400 dark:text-slate-500 ${btnPad}`}
          >
            EUR
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={isEn ? 'No valid reference rate recorded' : UNSUPPORTED_CURRENCY_TOOLTIP}
            className={`font-bold rounded-lg opacity-45 cursor-not-allowed text-slate-400 dark:text-slate-500 ${btnPad}`}
          >
            AED
          </button>
        </div>
      )}

      {showIntlControls && intlCurrency === 'USD' && sampleUsdText && (
        <span
          dir="ltr"
          title={usdTitle}
          className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800 tabular-nums"
        >
          {rateState.snapshot
            ? `1$= ${rateState.snapshot.usdToTomanRate.toLocaleString(isEn ? 'en-US' : 'fa-IR')} T`
            : (isEn ? 'USD N/A' : 'نرخ دلار ناموجود')}
        </span>
      )}
    </div>
  );
};

interface ExperienceModeToggleProps {
  compact?: boolean;
  className?: string;
}

export const ExperienceModeToggle: React.FC<ExperienceModeToggleProps> = ({ compact = false, className = '' }) => {
  const [mode, setMode] = useExperienceMode();
  const [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const displayClass = className.includes('hidden') ? '' : 'inline-flex';
  return (
    <div
      role="group"
      aria-label={isEn ? 'Simple or Pro Experience Mode' : 'حالت تجربه کاربری ساده یا تخصصی'}
      className={`${displayClass} items-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 p-0.5 border border-slate-200/80 dark:border-slate-700/80 select-none ${className}`}
      dir={isEn ? 'ltr' : 'rtl'}
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
        {isEn ? 'Simple' : 'ساده'}
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
        {isEn ? 'Pro' : 'تخصصی'}
      </button>
    </div>
  );
};

