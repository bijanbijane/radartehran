/** @file src/features/discovery/tests/discoverPricingAndFiltering.test.ts — Stage 192 Discover Pricing & Filtering Unit Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDiscoverDepositForTargetArea,
  calculateDiscoverPurchaseTotal,
  classifyDiscoverPriceBracket,
  compareDiscoverNeighborhoods,
  computeDiscoverNeighborhoodResult,
  matchesDiscoverPriceBracket,
  resolveDiscoverFreshness,
} from '../services/discoverPricingEngine';
import { formatMillionTomanAsIntlCurrency } from '../../../utils/areaUnit';

test('Stage 192: scaled deposit and purchase total scale dynamically across 50, 80, 100, and 150 sqm and reject invalid areas', () => {
  assert.equal(calculateDiscoverDepositForTargetArea(1600, 50), 1000);
  assert.equal(calculateDiscoverDepositForTargetArea(1600, 80), 1600);
  assert.equal(calculateDiscoverDepositForTargetArea(1600, 100), 2000);
  assert.equal(calculateDiscoverDepositForTargetArea(1600, 150), 3000);

  assert.equal(calculateDiscoverPurchaseTotal(150, 50), 7500);
  assert.equal(calculateDiscoverPurchaseTotal(150, 80), 12000);
  assert.equal(calculateDiscoverPurchaseTotal(150, 100), 15000);
  assert.equal(calculateDiscoverPurchaseTotal(150, 150), 22500);

  for (const invalidSqm of [0, -25, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(calculateDiscoverDepositForTargetArea(1600, invalidSqm), null);
    assert.equal(calculateDiscoverPurchaseTotal(150, invalidSqm), null);
  }
});

test('Stage 192: price brackets classify buy and rent boundaries accurately', () => {
  assert.equal(classifyDiscoverPriceBracket(4999, 'buy'), 'under5b');
  assert.equal(classifyDiscoverPriceBracket(5000, 'buy'), '5to10b');
  assert.equal(classifyDiscoverPriceBracket(10000, 'buy'), '5to10b');
  assert.equal(classifyDiscoverPriceBracket(10001, 'buy'), '10to20b');
  assert.equal(classifyDiscoverPriceBracket(20000, 'buy'), '10to20b');
  assert.equal(classifyDiscoverPriceBracket(20001, 'buy'), 'luxury');

  assert.equal(classifyDiscoverPriceBracket(999, 'rent'), 'under5b');
  assert.equal(classifyDiscoverPriceBracket(1000, 'rent'), '5to10b');
  assert.equal(classifyDiscoverPriceBracket(2000, 'rent'), '5to10b');
  assert.equal(classifyDiscoverPriceBracket(2001, 'rent'), '10to20b');
  assert.equal(classifyDiscoverPriceBracket(4000, 'rent'), '10to20b');
  assert.equal(classifyDiscoverPriceBracket(4001, 'rent'), 'luxury');

  const hood = { rahn80m: 1600, buyPerSqm: 120 };
  assert.equal(matchesDiscoverPriceBracket(hood, 'rent', 50, 110, '5to10b'), true);
  assert.equal(matchesDiscoverPriceBracket(hood, 'rent', 150, 110, '10to20b'), true);
  assert.equal(matchesDiscoverPriceBracket(hood, 'buy', 100, 95, '5to10b'), true);
});

test('Stage 192: sorting comparator handles score, price_asc, price_desc, rahn_asc, and air', () => {
  const a = { id: 1, overallScore: 8.2, air: 6.5, buyPerSqm: 180, rahn80m: 2000 };
  const b = { id: 2, overallScore: 9.1, air: 8.9, buyPerSqm: 120, rahn80m: 1200 };
  const dealMap = new Map<number, number>([[1, 165], [2, 110]]);

  assert.ok(compareDiscoverNeighborhoods(a, b, 'score', 100, dealMap) > 0);
  assert.ok(compareDiscoverNeighborhoods(a, b, 'air', 100, dealMap) > 0);
  assert.ok(compareDiscoverNeighborhoods(a, b, 'price_asc', 100, dealMap) > 0);
  assert.ok(compareDiscoverNeighborhoods(a, b, 'price_desc', 100, dealMap) < 0);
  assert.ok(compareDiscoverNeighborhoods(a, b, 'rahn_asc', 100, dealMap) > 0);
});

test('Stage 192: freshness metadata never invents fixed fake date labels and core numbers stay FX-invariant', () => {
  const hoodNoBargains = { id: 99999, name: 'محله آزمایشی', buyPerSqm: 100, rahn80m: 1400, bargains: [] };
  const undated = resolveDiscoverFreshness(hoodNoBargains, 'karaj', null);
  assert.equal(undated.kind, 'internal_reference_undated');
  assert.equal(undated.isReferenceDateEstimated, false);
  assert.equal(undated.sourceUpdatedLabelFa?.includes('آبان ۱۴۰۵'), false);

  const liveHood = {
    id: 5,
    name: 'پونک',
    buyPerSqm: 140,
    rahn80m: 1800,
    bargains: [{
      id: 'live-divar-b1',
      type: 'خرید' as const,
      title: 'واحد ۸۵ متری',
      street: 'اشرفی',
      sqm: 85,
      price: 11000,
      priceText: '۱۱ میلیارد تومان',
      discountPercent: 0,
      buyerProfitText: '',
      date: 'امروز',
      createdAtIso: '2026-11-15T12:00:00.000Z',
    }],
  };
  const live = resolveDiscoverFreshness(liveHood, 'tehran', null);
  assert.equal(live.kind, 'live_observed');
  assert.equal(live.acquisitionTimestampIso, '2026-11-15T12:00:00.000Z');

  const computed = computeDiscoverNeighborhoodResult({
    hood: liveHood,
    cityId: 'tehran',
    mode: 'buy',
    targetSqm: 100,
    scenarioDealPerSqm: 126,
  });
  assert.equal(computed.askingTotalMillion, 14000);
  assert.equal(computed.scenarioTotalMillion, 12600);
  assert.ok(formatMillionTomanAsIntlCurrency(computed.scenarioTotalMillion!, 'USD', 'en').length > 0);
});
