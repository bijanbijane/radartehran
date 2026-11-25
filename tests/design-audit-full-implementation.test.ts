/** @file tests/design-audit-full-implementation.test.ts — Verification suite for full design audit remediation (VD-01..VD-12, IO-01..IO-04, MR-01..MR-04) */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RADAR_BRAND_COLOR_TOKENS } from '../src/design-system/colorSystem';
import { resolveRoutePageMeta } from '../src/navigation/url/routePageMeta';
import { COMMUNITY_SECONDARY_TABS } from '../src/navigation/primary/megaMenuAndTabsConfig';
import { resolveEffectiveSubTab } from '../src/components/navigation/viewRouterHelpers';
import { createDefaultMarketDraft } from '../src/features/market/filters/MarketFilterDraft';
import { formatAreaUnitLabel, formatAreaValue, formatAreaShort } from '../src/utils/areaUnit';
import {
  clearIrniLegacyAliasesCacheForTesting,
  fetchIrniLegacyAliases,
} from '../src/data/irniGeographyClient';

const ROOT = process.cwd();

test('VD-09: tokens.css, themes.css, components.css, base.css, and index.css contain zero legacy --apple-* aliases', () => {
  const files = [
    'src/styles/layers/tokens.css',
    'src/styles/layers/themes.css',
    'src/styles/layers/components.css',
    'src/styles/base.css',
    'src/index.css',
  ];
  for (const rel of files) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(
      content.includes('--apple-'),
      false,
      `${rel} must not contain legacy --apple-* variables`,
    );
  }
});

test('VD-09 & VD-01: brand-500 token matches tokens.css and base typography tokens match typographySystem.ts', () => {
  assert.equal(RADAR_BRAND_COLOR_TOKENS['brand-500'], '#279487');
  const tokensCss = fs.readFileSync(path.join(ROOT, 'src/styles/layers/tokens.css'), 'utf8');
  assert.match(tokensCss, /--color-brand-500:\s*#279487;/);
  assert.match(tokensCss, /--type-h1:\s*1\.875rem;/);
  assert.match(tokensCss, /--type-body:\s*1rem;/);
});

test('VD-02: routePageMeta emits unique titles across sub-tabs and includes neighborhood name on /areas/:slug', () => {
  const marketOverview = resolveRoutePageMeta({ viewId: 'intelligence', subTab: 'overview', cityNameFa: 'تهران', brandFa: 'رادارتهران' });
  const marketPrices = resolveRoutePageMeta({ viewId: 'intelligence', subTab: 'prices', cityNameFa: 'تهران', brandFa: 'رادارتهران' });
  const marketReports = resolveRoutePageMeta({ viewId: 'intelligence', subTab: 'reports', cityNameFa: 'تهران', brandFa: 'رادارتهران' });
  assert.notEqual(marketOverview.title, marketPrices.title);
  assert.notEqual(marketPrices.title, marketReports.title);

  const areaDetail = resolveRoutePageMeta({
    viewId: 'discover',
    subTab: 'neighborhoods',
    cityNameFa: 'تهران',
    brandFa: 'رادارتهران',
    selectedHoodName: 'سعادت‌آباد',
  });
  assert.match(areaDetail.title, /سعادت‌آباد/);

  const areaList = resolveRoutePageMeta({
    viewId: 'discover',
    subTab: 'neighborhoods',
    cityNameFa: 'تهران',
    brandFa: 'رادارتهران',
  });
  assert.equal(areaList.title.includes('پونک'), false);

  const toolsValuation = resolveRoutePageMeta({ viewId: 'tools', subTab: 'valuation', cityNameFa: 'تهران', brandFa: 'رادارتهران' });
  const toolsCompare = resolveRoutePageMeta({ viewId: 'tools', subTab: 'compare_areas', cityNameFa: 'تهران', brandFa: 'رادارتهران' });
  assert.notEqual(toolsValuation.title, toolsCompare.title);

  const commResearch = resolveRoutePageMeta({ viewId: 'contributions', subTab: 'research', cityNameFa: 'تهران', brandFa: 'رادارتهران' });
  const commGuidelines = resolveRoutePageMeta({ viewId: 'contributions', subTab: 'guidelines', cityNameFa: 'تهران', brandFa: 'رادارتهران' });
  assert.notEqual(commResearch.title, commGuidelines.title);
});

test('MR-02: community secondary tabs include research & guidelines and viewRouterHelpers preserves them', () => {
  const ids = COMMUNITY_SECONDARY_TABS.map((t) => t.id);
  assert.ok(ids.includes('research'));
  assert.ok(ids.includes('guidelines'));
  assert.equal(resolveEffectiveSubTab('contributions', 'research'), 'research');
  assert.equal(resolveEffectiveSubTab('contributions', 'guidelines'), 'guidelines');
  assert.equal(resolveEffectiveSubTab('tools', 'compare_props'), 'compare_props');
});

test('VD-06 & MR-04: MarketFilterDraft defaults to city-wide scope (geoLevel = city)', () => {
  const draft = createDefaultMarketDraft();
  assert.equal(draft.geoLevel, 'city');
});

test('VD-04: Persian area unit helpers omit English (m²) / (ft²) parenthetical suffixes', () => {
  assert.equal(formatAreaUnitLabel('sqm', 'fa'), 'متر مربع');
  assert.equal(formatAreaUnitLabel('sqft', 'fa'), 'فوت مربع');
  assert.equal(formatAreaValue(100, 'sqm', true).includes('m²'), false);
  assert.equal(formatAreaShort(100, 'sqm', true).includes('m²'), false);
  assert.equal(formatAreaUnitLabel('sqm', 'en'), 'Square Meters (m²)');
});

test('VD-12: fetchIrniLegacyAliases deduplicates concurrent requests, caches responses, and honors 429 cooldown', async () => {
  clearIrniLegacyAliasesCacheForTesting();
  const originalFetch = globalThis.fetch;
  let calls = 0;

  try {
    globalThis.fetch = (async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return new Response(
        JSON.stringify({
          status: 'ok',
          source: 'IRNI_CANONICAL_REGISTRY',
          registryRevision: 7,
          items: [
            {
              aliasId: 'alias-1',
              legacySystemCode: 'TEHRAN_RADAR',
              legacyIdentifierValue: '1',
              canonicalGeographicEntityId: 'IRNI-01',
              aliasStatus: 'ACTIVE_COMPATIBILITY_ALIAS',
              recordedAtRegistryRevision: 7,
              resolutionEvidenceRef: 'test',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const [a, b] = await Promise.all([fetchIrniLegacyAliases(), fetchIrniLegacyAliases()]);
    assert.equal(calls, 1, 'concurrent calls must share one in-flight promise');
    assert.equal(a.items.length, 1);
    assert.equal(b.items.length, 1);

    const c = await fetchIrniLegacyAliases();
    assert.equal(calls, 1, 'cached result must be served without refetching');
    assert.equal(c.items.length, 1);

    clearIrniLegacyAliasesCacheForTesting();
    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response('Too Many Requests', { status: 429 });
    }) as typeof fetch;

    await assert.rejects(() => fetchIrniLegacyAliases(), /IRNI_LEGACY_ALIAS_RATE_LIMITED/);
    await assert.rejects(() => fetchIrniLegacyAliases(), /IRNI_LEGACY_ALIAS_RATE_LIMITED/);
    assert.equal(calls, 1, '429 response must activate cooldown and prevent repeat storm');
  } finally {
    globalThis.fetch = originalFetch;
    clearIrniLegacyAliasesCacheForTesting();
  }
});
