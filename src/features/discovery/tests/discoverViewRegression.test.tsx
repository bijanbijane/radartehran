/** @file src/features/discovery/tests/discoverViewRegression.test.tsx — Stage 192 Discover UI Rendering & Accessibility Regression Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscoverNeighborhoodResults } from '../../../components/discover/DiscoverNeighborhoodResults';
import { getDiscoverLocaleCopy } from '../i18n/discoverLocaleCopy';
import { NeighborhoodIntelligenceProfilePanel } from '../../neighborhoods/components/NeighborhoodIntelligenceProfilePanel';
import { buildNeighborhoodIntelligenceProfile } from '../../neighborhoods/services/neighborhoodProfileEngine';
import { INITIAL_NEIGHBORHOODS, type EvaluatedNeighborhood } from '../../../data/neighborhoods';

function buildEvalHood(overrides: Partial<EvaluatedNeighborhood> = {}): EvaluatedNeighborhood {
  const base = INITIAL_NEIGHBORHOODS[0];
  return {
    ...base,
    baseBuyPerSqm: base.buyPerSqm,
    overallScore: 8.6,
    status: 'green',
    diffPercent: -4,
    distKm: 3.4,
    trafficInfo: { inZone: false, label: 'خارج از طرح' },
    marketReport: {
      supplyCount: 18,
      demandLevel: 'بالا',
      avgDaysToSell: 32,
      liquidityScore: 84,
      priceTrend3m: '+۲.۱٪',
    },
    ...overrides,
  } as unknown as EvaluatedNeighborhood;
}

test('Stage 192: DiscoverNeighborhoodResults renders semantic aria-pressed buttons, dynamic sqm deposits, and list layout in FA & EN', () => {
  const hood = buildEvalHood({ id: 5, name: 'پونک', rahn80m: 1600, buyPerSqm: 140 });
  const faCopy = getDiscoverLocaleCopy('fa');
  const enCopy = getDiscoverLocaleCopy('en');

  const faHtml = renderToStaticMarkup(
    React.createElement(DiscoverNeighborhoodResults, {
      items: [hood],
      layoutMode: 'grid',
      selectedHood: hood,
      activeCity: 'tehran',
      favoriteHoodIds: [5],
      dealPriceByHoodId: new Map([[5, 125]]),
      topFilteredScore: 8.6,
      tiedTopCount: 1,
      comparisonArcActive: false,
      comparisonArcHoodAId: null,
      comparisonArcActiveHoodBId: null,
      targetSqm: 50,
      mode: 'rent',
      areaUnit: 'sqm',
      intlCurrency: 'USD',
      radarLocale: 'fa',
      exchangeRateRef: null,
      copy: faCopy,
      onSelectNeighborhood: () => {},
      onToggleFavorite: () => {},
      onToggleComparisonArc: () => {},
      onOpenInspector: () => {},
      onOpenCompare: () => {},
    }),
  );

  assert.match(faHtml, /aria-pressed="true"/);
  assert.match(faHtml, /۵۰ متر/);
  assert.equal(/رهن ۸۰ متر/.test(faHtml), false, 'Must not hardcode 80m deposit when targetSqm is 50');

  const enListHtml = renderToStaticMarkup(
    React.createElement(DiscoverNeighborhoodResults, {
      items: [hood],
      layoutMode: 'list',
      selectedHood: hood,
      activeCity: 'tehran',
      favoriteHoodIds: [],
      dealPriceByHoodId: new Map([[5, 125]]),
      topFilteredScore: 8.6,
      tiedTopCount: 1,
      comparisonArcActive: false,
      comparisonArcHoodAId: null,
      comparisonArcActiveHoodBId: null,
      targetSqm: 150,
      mode: 'buy',
      areaUnit: 'sqft',
      intlCurrency: 'EUR',
      radarLocale: 'en',
      exchangeRateRef: null,
      copy: enCopy,
      onSelectNeighborhood: () => {},
      onToggleFavorite: () => {},
      onToggleComparisonArc: () => {},
      onOpenInspector: () => {},
      onOpenCompare: () => {},
    }),
  );

  assert.match(enListHtml, /Active on Map/);
  assert.match(enListHtml, /Inspect dossier for پونک/);
  assert.match(enListHtml, />Dossier</);
});

test('Stage 192: buildNeighborhoodIntelligenceProfile & NeighborhoodIntelligenceProfilePanel show missing active-supply dash cleanly and keep neighbors city-coherent', () => {
  const karajA = buildEvalHood({ id: 101, name: 'گوهردشت', zone: 'منطقه ۱ کرج', bargains: [], lat: 35.84, lng: 50.97 });
  const karajB = buildEvalHood({ id: 102, name: 'عظیمیه', zone: 'منطقه ۱ کرج', bargains: [], lat: 35.83, lng: 51.01 });
  const tehranA = buildEvalHood({ id: 5, name: 'پونک', zone: 'منطقه ۵', bargains: [], lat: 35.76, lng: 51.33 });

  const profile = buildNeighborhoodIntelligenceProfile(karajA, [karajA, karajB, tehranA], 'karaj', 100);
  assert.equal(profile.identity.name, 'گوهردشت');
  const supplyMetric = profile.quickMetrics.find((m) => m.id === 'active-supply');
  assert.equal(supplyMetric?.formattedValue, '—');
  assert.equal(profile.cityMismatchWarningFa, null);
  assert.equal(profile.adjacentNeighborhoods.some((n) => n.id === 5), false, 'Tehran hood must not leak into Karaj neighbors');

  const html = renderToStaticMarkup(
    React.createElement(NeighborhoodIntelligenceProfilePanel, {
      hood: karajA,
      cityId: 'karaj',
      allNeighborhoods: [karajA, karajB, tehranA],
      dealPricePerSqm: 100,
    }),
  );

  assert.match(html, /شناسنامه جامع محله/);
  assert.match(html, /باز کردن پرونده ۱۱ بخشی محله/);
});
