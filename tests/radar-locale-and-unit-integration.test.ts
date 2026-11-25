import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sqmToSqft,
  sqftToSqm,
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaUnitLabel,
  setStoredAreaUnit,
  getStoredAreaUnit,
  toggleStoredAreaUnit,
  setStoredIntlCurrency,
  getStoredIntlCurrency,
  setStoredRadarLocale,
  getStoredRadarLocale,
  getRadarLocaleDirection,
  setRuntimeExchangeRateSnapshot,
  getRuntimeExchangeRateSnapshot,
  formatMillionTomanAsIntlCurrency,
  parseUrlIntlParams,
} from '../src/utils/areaUnit';

test('Stage 44.5: Real sqm <-> sqft conversion and unit price conversion', () => {
  assert.equal(sqmToSqft(60), 645.83);
  assert.equal(sqmToSqft(80), 861.11);
  assert.equal(sqftToSqm(1076.39), 100);
  assert.equal(convertPricePerSqmToUnit(107.64, 'sqm'), 107.6);
  assert.equal(convertPricePerSqmToUnit(107.64, 'sqft'), 10);

  const areaSqft = formatAreaShort(100, 'sqft', false);
  assert.ok(areaSqft.includes('ft²'));
  assert.equal(formatAreaUnitLabel('sqft', 'en'), 'Square Feet (ft²)');
  assert.equal(formatAreaUnitLabel('sqm', 'fa'), 'متر مربع');
});

test('Stage 44.6: Reactive areaUnit, intlCurrency, and locale state transitions', () => {
  setStoredAreaUnit('sqm');
  assert.equal(getStoredAreaUnit(), 'sqm');
  assert.equal(toggleStoredAreaUnit(), 'sqft');
  assert.equal(getStoredAreaUnit(), 'sqft');
  setStoredAreaUnit('sqm');

  setStoredRadarLocale('en');
  assert.equal(getStoredRadarLocale(), 'en');
  assert.equal(getRadarLocaleDirection('en'), 'ltr');

  setStoredRadarLocale('fa');
  assert.equal(getStoredRadarLocale(), 'fa');
  assert.equal(getRadarLocaleDirection('fa'), 'rtl');
});

test('Stage 44.7: International currency formatting uses RuntimeExchangeRateReference and avoids hardcoded rates for EUR/AED', () => {
  setRuntimeExchangeRateSnapshot(null);
  const withoutRate = formatMillionTomanAsIntlCurrency(8500, 'USD', 'fa', null);
  assert.equal(withoutRate, 'نرخ مرجع تبدیل ارز در دسترس نیست');

  setRuntimeExchangeRateSnapshot({
    usdToTomanRate: 85000,
    source: 'نرخ مرجع تست',
    recordedAtIso: '2026-04-20T00:00:00.000Z',
  });
  assert.notEqual(getRuntimeExchangeRateSnapshot(), null);

  const usdFormatted = formatMillionTomanAsIntlCurrency(8500, 'USD', 'fa');
  assert.ok(usdFormatted.includes('$100,000'), `Expected $100,000 in "${usdFormatted}"`);

  const eurFormatted = formatMillionTomanAsIntlCurrency(8500, 'EUR', 'fa');
  assert.equal(eurFormatted, 'نرخ مرجع معتبر برای این ارز ثبت نشده است');

  const aedFormatted = formatMillionTomanAsIntlCurrency(8500, 'AED', 'fa');
  assert.equal(aedFormatted, 'نرخ مرجع معتبر برای این ارز ثبت نشده است');
});

test('Stage 44.8: parseUrlIntlParams returns undefined when URL parameters are absent so stored state is preserved', () => {
  setStoredAreaUnit('sqft');
  setStoredIntlCurrency('USD');
  setStoredRadarLocale('en');

  const emptyParsed = parseUrlIntlParams('');
  assert.equal(emptyParsed.unit, undefined);
  assert.equal(emptyParsed.currency, undefined);
  assert.equal(emptyParsed.lang, undefined);
  assert.equal(getStoredAreaUnit(), 'sqft');
  assert.equal(getStoredIntlCurrency(), 'USD');
  assert.equal(getStoredRadarLocale(), 'en');

  const overridden = parseUrlIntlParams('?unit=sqm&currency=IRT&lang=fa');
  assert.equal(overridden.unit, 'sqm');
  assert.equal(overridden.currency, 'IRT');
  assert.equal(overridden.lang, 'fa');

  // Reset to defaults
  setStoredAreaUnit('sqm');
  setStoredIntlCurrency('IRT');
  setStoredRadarLocale('fa');
});
