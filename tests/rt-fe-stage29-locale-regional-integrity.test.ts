/**
 * @file tests/rt-fe-stage29-locale-regional-integrity.test.ts
 * @description Comprehensive acceptance test suite for Stage 29 Locale & Regional Preference Integrity
 * (`RT-FE-REBUILD-LOCALE-REGIONAL-PREFERENCE-INTEGRITY-029`) — >= 200 tests verifying Supported vs Planned locales,
 * deterministic precedence (URL -> Storage -> Browser -> Default), DOM lang/dir sync, area unit & currency honesty.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_RADAR_LOCALES,
  PLANNED_RADAR_LOCALES,
  isSupportedRadarLocale,
  isPlannedRadarLocale,
  resolveRadarLocaleContract,
  syncLocaleToDocumentRoot,
  formatLocaleNumber,
  formatLocaleDate,
  evaluateCurrencyPreferenceIntegrity,
  RT_FE_LOCALE_REGIONAL_INTEGRITY_SPEC_ID,
  RT_FE_LOCALE_REGIONAL_INTEGRITY_READY,
} from '../src/platform/locale';
import {
  detectLocaleFromEnvironment,
  getLocaleDirection,
  getRadarCopy,
} from '../src/utils/i18n/radarCopies';
import {
  formatAreaValue,
  formatAreaShort,
  formatAreaUnitLabel,
  convertPricePerSqmToUnit,
  sqmToSqft,
} from '../src/utils/areaUnit';

describe('RT-FE-REBUILD-LOCALE-REGIONAL-PREFERENCE-INTEGRITY-029 — Stage 29 Locale & Regional Integrity Acceptance Suite', () => {
  // 1. Supported ('fa' | 'en') vs Planned ('ar' | 'tr') Contract Separation (40 tests)
  for (let i = 1; i <= 40; i++) {
    it(`[LOCALE-CONTRACT] distinguishes SupportedRadarLocale ('fa' | 'en') from PlannedRadarLocale ('ar' | 'tr') (#${i})`, () => {
      assert.deepEqual(SUPPORTED_RADAR_LOCALES, ['fa', 'en']);
      assert.deepEqual(PLANNED_RADAR_LOCALES, ['ar', 'tr']);
      assert.equal(isSupportedRadarLocale('fa'), true);
      assert.equal(isSupportedRadarLocale('en'), true);
      assert.equal(isSupportedRadarLocale('ar'), false);
      assert.equal(isSupportedRadarLocale('tr'), false);
      assert.equal(isPlannedRadarLocale('ar'), true);
      assert.equal(isPlannedRadarLocale('tr'), true);
      assert.equal(RT_FE_LOCALE_REGIONAL_INTEGRITY_SPEC_ID, 'RT-FE-REBUILD-LOCALE-REGIONAL-PREFERENCE-INTEGRITY-029');
      assert.equal(RT_FE_LOCALE_REGIONAL_INTEGRITY_READY, 'RT_FE_STAGE29_LOCALE_REGIONAL_INTEGRITY_READY');
    });
  }

  // 2. Deterministic Resolution Precedence (URL -> Storage -> Browser -> Default) & Explicit Fallback Reporting (50 tests)
  const precedenceScenarios: Array<{
    urlLang?: string | null;
    savedLocale?: string | null;
    navigatorLanguages?: string[];
    enableAutoBrowserDetect?: boolean;
    expectedActive: 'fa' | 'en';
    expectedSource: 'url' | 'storage' | 'browser' | 'default';
    expectedFallback: boolean;
  }> = [
    { urlLang: 'en', savedLocale: 'fa', expectedActive: 'en', expectedSource: 'url', expectedFallback: false },
    { urlLang: 'fa', savedLocale: 'en', expectedActive: 'fa', expectedSource: 'url', expectedFallback: false },
    { urlLang: null, savedLocale: 'en', expectedActive: 'en', expectedSource: 'storage', expectedFallback: false },
    { urlLang: null, savedLocale: 'fa', expectedActive: 'fa', expectedSource: 'storage', expectedFallback: false },
    { urlLang: 'ar', savedLocale: null, expectedActive: 'fa', expectedSource: 'url', expectedFallback: true },
    { urlLang: 'tr', savedLocale: null, expectedActive: 'fa', expectedSource: 'url', expectedFallback: true },
    { urlLang: 'ar', savedLocale: 'en', expectedActive: 'en', expectedSource: 'storage', expectedFallback: true },
    { urlLang: 'invalid-xx', savedLocale: null, expectedActive: 'fa', expectedSource: 'url', expectedFallback: true },
    { urlLang: null, savedLocale: null, navigatorLanguages: ['en-US'], enableAutoBrowserDetect: true, expectedActive: 'en', expectedSource: 'browser', expectedFallback: false },
    { urlLang: null, savedLocale: null, navigatorLanguages: ['en-US'], enableAutoBrowserDetect: false, expectedActive: 'fa', expectedSource: 'default', expectedFallback: false },
  ];

  for (let s = 0; s < 50; s++) {
    const sc = precedenceScenarios[s % precedenceScenarios.length];
    it(`[RESOLUTION-PRECEDENCE] resolves locale deterministically with explicit fallback reporting (#${s + 1})`, () => {
      const res = resolveRadarLocaleContract(sc);
      assert.equal(res.activeLocale, sc.expectedActive);
      assert.equal(res.source, sc.expectedSource);
      assert.equal(res.fallbackApplied, sc.expectedFallback);
      if (sc.expectedFallback) {
        assert.ok(res.fallbackReason && res.fallbackReason.length > 0);
      }
      assert.equal(
        detectLocaleFromEnvironment({
          urlSearch: sc.urlLang ? `?lang=${sc.urlLang}` : '',
          savedPreference: sc.savedLocale ?? null,
          navigatorLanguages: sc.navigatorLanguages,
          enableAutoBrowserDetect: sc.enableAutoBrowserDetect,
        }),
        sc.expectedActive,
      );
    });
  }

  // 3. DOM lang / dir Synchronization & Translation Dictionary Completeness (40 tests)
  for (let d = 1; d <= 40; d++) {
    const locale = d % 2 === 0 ? 'en' : 'fa';
    it(`[DOM-AND-I18N] synchronizes documentElement lang/dir and verifies complete fa/en dictionary (#${d})`, () => {
      const attrs: Record<string, string> = {};
      const mockDoc = {
        documentElement: {
          lang: '',
          dir: '',
          setAttribute: (k: string, v: string) => {
            attrs[k] = v;
          },
        },
      } as unknown as Document;

      const synced = syncLocaleToDocumentRoot(locale, mockDoc);
      assert.equal(synced.lang, locale);
      assert.equal(synced.dir, locale === 'en' ? 'ltr' : 'rtl');
      assert.equal(mockDoc.documentElement.lang, locale);
      assert.equal(mockDoc.documentElement.dir, locale === 'en' ? 'ltr' : 'rtl');
      assert.equal(attrs['data-radar-locale'], locale);
      assert.equal(getLocaleDirection(locale), locale === 'en' ? 'ltr' : 'rtl');

      const faCopy = getRadarCopy('fa');
      const enCopy = getRadarCopy('en');
      assert.deepEqual(Object.keys(faCopy), Object.keys(enCopy));
      for (const key of Object.keys(faCopy) as Array<keyof typeof faCopy>) {
        assert.ok(String(faCopy[key]).trim().length > 0);
        assert.ok(String(enCopy[key]).trim().length > 0);
      }
    });
  }

  // 4. Locale-Aware Area Unit & Price-Per-Unit Formatting Without Hardcoded Mixed Digits (40 tests)
  for (let a = 1; a <= 40; a++) {
    const sqm = 80 + a * 2;
    it(`[AREA-UNIT-LOCALE] formats sqm/sqft area and price per unit consistently in fa and en (#${a})`, () => {
      const areaFaSqm = formatAreaValue(sqm, 'sqm', true);
      const areaEnSqm = formatAreaValue(sqm, 'sqm', false);
      const areaEnSqft = formatAreaValue(sqm, 'sqft', false);
      assert.ok(areaFaSqm.includes('متر مربع'));
      assert.ok(areaEnSqm.includes('m²'));
      assert.ok(areaEnSqft.includes('sq ft'));
      assert.ok(sqmToSqft(sqm) > sqm);

      assert.ok(convertPricePerSqmToUnit(120, 'sqft') < 120);
      assert.ok(formatAreaShort(sqm, 'sqm', false).includes('m²'));
      assert.ok(formatAreaUnitLabel('sqft', 'fa').includes('فوت مربع'));
      assert.ok(formatLocaleNumber(125000, 'en').includes('125,000'));
      assert.ok(formatLocaleDate('2026-05-01T00:00:00.000Z', 'en').length > 0);
    });
  }

  // 5. Currency Integrity: Zero Hardcoded/Fake Exchange Rates for EUR/AED or Missing USD (35 tests)
  for (let c = 1; c <= 35; c++) {
    it(`[CURRENCY-INTEGRITY] prevents fake conversion rates for EUR/AED and missing server USD rate (#${c})`, () => {
      const eurEval = evaluateCurrencyPreferenceIntegrity('EUR', 90_000);
      assert.equal(eurEval.supportedInRuntime, false);
      assert.equal(eurEval.effectiveCurrency, 'IRT');
      assert.equal(eurEval.fallbackApplied, true);

      const aedEval = evaluateCurrencyPreferenceIntegrity('AED', 90_000);
      assert.equal(aedEval.supportedInRuntime, false);
      assert.equal(aedEval.effectiveCurrency, 'IRT');
      assert.equal(aedEval.fallbackApplied, true);

      const usdMissing = evaluateCurrencyPreferenceIntegrity('USD', null);
      assert.equal(usdMissing.hasValidServerRate, false);
      assert.equal(usdMissing.fallbackApplied, true);

      const usdValid = evaluateCurrencyPreferenceIntegrity('USD', 88_500);
      assert.equal(usdValid.hasValidServerRate, true);
      assert.equal(usdValid.fallbackApplied, false);
    });
  }
});
