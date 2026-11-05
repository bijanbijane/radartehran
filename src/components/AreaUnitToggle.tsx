import React, { useSyncExternalStore } from 'react';
import {
  AreaUnit,
  IntlCurrencyCode,
  RadarLocale,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  getStoredAreaUnit,
  getStoredIntlCurrency,
  getStoredRadarLocale,
  setStoredAreaUnit,
  setStoredIntlCurrency,
  setStoredRadarLocale,
  subscribeAreaUnit,
  toggleStoredAreaUnit,
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

interface AreaUnitToggleProps {
  compact?: boolean;
  showIntlControls?: boolean;
  className?: string;
}

const LOCALE_OPTIONS: Array<{ id: RadarLocale; label: string; title: string }> = [
  { id: 'fa', label: 'فا', title: 'فارسی (Persian)' },
  { id: 'en', label: 'EN', title: 'English' },
  { id: 'ar', label: 'ع', title: 'العربية (Arabic)' },
  { id: 'tr', label: 'TR', title: 'Türkçe (Turkish)' },
];

export const AreaUnitToggle: React.FC<AreaUnitToggleProps> = ({
  compact = false,
  showIntlControls = false,
  className = '',
}) => {
  const [unit, setUnit] = useAreaUnit();
  const [locale, setLocale] = useRadarLocale();
  const [currency, setCurrency] = useIntlCurrency();
  const referenceSampleText = formatMillionTomanAsIntlCurrency(6500, currency, locale);

  return (
    <div className={`inline-flex flex-wrap items-center gap-1 select-none ${className}`} dir="ltr">
      <div
        role="group"
        aria-label="تغییر واحد مساحت بین متر مربع و فوت مربع (Switch Area Unit m² / ft²)"
        className="inline-flex items-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 p-0.5 border border-slate-200/80 dark:border-slate-700/80"
      >
        <button
          type="button"
          onClick={() => setUnit('sqm')}
          aria-pressed={unit === 'sqm'}
          title={`Square Meters (${formatAreaUnitLabel('sqm')} - m²)`}
          className={`font-bold transition-all rounded-lg ${compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'} ${
            unit === 'sqm'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          m²
        </button>
        <button
          type="button"
          onClick={() => setUnit('sqft')}
          aria-pressed={unit === 'sqft'}
          title={`Square Feet (${formatAreaUnitLabel('sqft')} - ft²)`}
          className={`font-bold transition-all rounded-lg ${compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'} ${
            unit === 'sqft'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          ft²
        </button>
      </div>
      {showIntlControls && (
        <>
          <div
            role="group"
            aria-label="انتخاب زبان رابط کاربری (Select Language FA / EN / AR / TR)"
            className="inline-flex items-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 p-0.5 border border-slate-200/80 dark:border-slate-700/80"
          >
            {LOCALE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLocale(opt.id)}
                aria-pressed={locale === opt.id}
                title={opt.title}
                className={`px-1.5 py-1 text-[10.5px] font-bold transition-all rounded-lg cursor-pointer ${
                  locale === opt.id
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            aria-label="واحد ارز مرجع بین‌المللی (International Reference Currency)"
            title={`واحد ارز مرجع بین‌المللی (IRT / USD / EUR / AED) — ${referenceSampleText}`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as IntlCurrencyCode)}
            className="inline-block rounded-xl bg-slate-100/90 dark:bg-slate-800/90 px-1.5 py-1 text-[10.5px] font-bold text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer focus:outline-none"
          >
            <option value="IRT">IRT (تومان)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="AED">AED (درهم)</option>
          </select>
        </>
      )}
    </div>
  );
};
