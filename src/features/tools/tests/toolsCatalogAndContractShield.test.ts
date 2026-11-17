/** @file src/features/tools/tests/toolsCatalogAndContractShield.test.ts — Stages 193–200 Unit & SSR Behavioral Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_FEATURE_FLAGS, INITIAL_NEIGHBORHOODS, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import {
  buildToolCategoriesForHood,
  calculateContractInitialTotalMillion,
  computeToolCategoryCounts,
  CONTRACT_SHIELD_MAX_MILLION,
  CONTRACT_SHIELD_MIN_MILLION,
  DEFAULT_CONTRACT_FALLBACK_MILLION,
  isRadarUiLabAvailable,
  sanitizeContractTargetSqm,
  STATIC_TOOL_CATEGORIES,
  validateContractTotalMillion,
} from '../services/toolsCatalogEngine';
import { ProductToolsView } from '../../../components/views/ProductToolsView';
import { ContractRoomShieldModal } from '../../../components/modals/ContractRoomShieldModal';
import { getStoredExperienceMode, setStoredExperienceMode } from '../../../utils/areaUnit';

function setupMemoryWindow() {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    dispatchEvent: () => true,
  };
  return { store };
}

function makeHood(overrides: Partial<EvaluatedNeighborhood> = {}): EvaluatedNeighborhood {
  const base = INITIAL_NEIGHBORHOODS[0];
  return {
    ...base,
    baseBuyPerSqm: base.buyPerSqm,
    overallScore: 8.5,
    status: 'green',
    diffPercent: 0,
    distKm: 2,
    trafficInfo: { inZone: false, label: 'آزاد' },
    marketReport: { supplyCount: 12, demandLevel: 'بالا', avgDaysToSell: 30, liquidityScore: 80, priceTrend3m: '+۱٪' },
    ...overrides,
  } as unknown as EvaluatedNeighborhood;
}

test('Stage 194 & 196: catalog categories build dynamically, compute accurate counts, and reflect hood changes cleanly', () => {
  const catsA = buildToolCategoriesForHood({ isEn: false, hoodName: 'پونک' });
  const countsA = computeToolCategoryCounts(catsA);
  assert.equal(countsA.total, 24);
  assert.deepEqual(countsA.byCategory, { decision: 9, financial: 6, legal: 5, urban: 4 });

  const catsB = buildToolCategoriesForHood({ isEn: false, hoodName: 'سعادت‌آباد' });
  const hedonicA = catsA.find((c) => c.id === 'financial')?.items.find((i) => i.id === 'hedonic');
  const hedonicB = catsB.find((c) => c.id === 'financial')?.items.find((i) => i.id === 'hedonic');
  assert.ok(hedonicA?.desc.includes('پونک'));
  assert.ok(hedonicB?.desc.includes('سعادت‌آباد'));

  const modifiedCats = STATIC_TOOL_CATEGORIES.map((c) =>
    c.id === 'legal' ? { ...c, items: c.items.map((it, idx) => (idx === 0 ? { ...it, hidden: true } : it)) } : c,
  );
  const filteredBuilt = buildToolCategoriesForHood({ isEn: true, hoodName: 'Vanak', categories: modifiedCats });
  const filteredCounts = computeToolCategoryCounts(filteredBuilt);
  assert.equal(filteredCounts.total, 23);
  assert.equal(filteredCounts.byCategory.legal, 4);
});

test('Stage 195: isRadarUiLabAvailable enables UI Lab strictly in dev environments', () => {
  assert.equal(isRadarUiLabAvailable(true), true);
  assert.equal(isRadarUiLabAvailable(false), false);
});

test('Stage 197 & 198: contract shield initial calculation respects real targetSqm and validation prevents out-of-range/empty coercion', () => {
  assert.equal(sanitizeContractTargetSqm(120), 120);
  assert.equal(sanitizeContractTargetSqm(Number.NaN), 80);
  assert.equal(sanitizeContractTargetSqm(-10), 80);
  assert.equal(sanitizeContractTargetSqm(12000), 1000);

  assert.equal(calculateContractInitialTotalMillion(150, 50), 7500);
  assert.equal(calculateContractInitialTotalMillion(150, 100), 15000);
  assert.equal(calculateContractInitialTotalMillion(150, 120), 18000);
  assert.equal(calculateContractInitialTotalMillion(150, -5), 12000);
  assert.equal(calculateContractInitialTotalMillion(0, 100), DEFAULT_CONTRACT_FALLBACK_MILLION);
  assert.equal(calculateContractInitialTotalMillion(5000, 1000), CONTRACT_SHIELD_MAX_MILLION);
  assert.equal(calculateContractInitialTotalMillion(2, 30), CONTRACT_SHIELD_MIN_MILLION);

  assert.equal(validateContractTotalMillion('').valid, false);
  assert.equal(validateContractTotalMillion('   ').valid, false);
  assert.equal(validateContractTotalMillion('abc').valid, false);
  assert.equal(validateContractTotalMillion('1250.5').valid, false);
  assert.equal(validateContractTotalMillion('499').valid, false);
  assert.equal(validateContractTotalMillion('2000001').valid, false);
  assert.deepEqual(validateContractTotalMillion('500'), { valid: true, value: 500, errorFa: null });
  assert.deepEqual(validateContractTotalMillion('15000'), { valid: true, value: 15000, errorFa: null });
});

test('Stages 193, 195, 196 & 200: ProductToolsView and ContractRoomShieldModal render expected UI Lab gating, invariance, and ARIA tabs', () => {
  setupMemoryWindow();
  setStoredExperienceMode('simple');
  const hood = makeHood({ id: 5, name: 'پونک', buyPerSqm: 150 });

  const prodHtml = renderToStaticMarkup(
    React.createElement(ProductToolsView, {
      evaluatedNeighborhoods: [hood],
      selectedHood: hood,
      onOpenHedonic: () => {},
      onOpenSuperModule: () => {},
      onOpenExpansionModal: () => {},
      onOpenReverseBudget: () => {},
      onOpenCompare: () => {},
      featureFlags: DEFAULT_FEATURE_FLAGS,
      targetSqm: 120,
      isDevEnvironment: false,
    }),
  );
  assert.equal(prodHtml.includes('toggle-radar-ui-lab-btn'), false, 'Production must hide Radar UI Lab button');
  assert.match(prodHtml, /۲۴/);
  assert.equal(getStoredExperienceMode(), 'simple', 'Rendering ProductToolsView must not mutate experienceMode');

  const devHtml = renderToStaticMarkup(
    React.createElement(ProductToolsView, {
      evaluatedNeighborhoods: [hood],
      selectedHood: hood,
      onOpenHedonic: () => {},
      onOpenSuperModule: () => {},
      onOpenExpansionModal: () => {},
      onOpenReverseBudget: () => {},
      onOpenCompare: () => {},
      featureFlags: DEFAULT_FEATURE_FLAGS,
      targetSqm: 120,
      isDevEnvironment: true,
    }),
  );
  assert.equal(devHtml.includes('toggle-radar-ui-lab-btn'), true, 'Dev env exposes Radar UI Lab button');

  const modalHtml = renderToStaticMarkup(
    React.createElement(ContractRoomShieldModal, {
      isOpen: true,
      onClose: () => {},
      initialTotalMillion: 18000,
      contextKey: '5-120',
    }),
  );
  assert.match(modalHtml, /role="dialog"/);
  assert.match(modalHtml, /aria-modal="true"/);
  assert.match(modalHtml, /role="tablist"/);
  assert.match(modalHtml, /role="tab"/);
  assert.match(modalHtml, /role="tabpanel"/);
  assert.match(modalHtml, /value="18000"/);
});
