/** @file src/platform/localization/index.ts — Platform RTL/Persian Localization & Currency Facade */
import {
  formatAreaShort,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  getStoredAreaUnit,
  getStoredIntlCurrency,
  getStoredRadarLocale,
  type AreaUnit,
  type IntlCurrencyCode,
  type RadarLocale,
} from '../../utils/areaUnit';

export type LocaleCode = 'fa-IR' | 'en-US';
export type Direction = 'rtl' | 'ltr';

export function getDirectionForLocale(locale: LocaleCode): Direction {
  return locale === 'en-US' ? 'ltr' : 'rtl';
}

export {
  formatAreaShort,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  getStoredAreaUnit,
  getStoredIntlCurrency,
  getStoredRadarLocale,
  type AreaUnit,
  type IntlCurrencyCode,
  type RadarLocale,
};
