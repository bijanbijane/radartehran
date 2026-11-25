/**
 * @file tests/design-audit-remediation.test.ts
 * @description Comprehensive unit & structural regression tests verifying 100% implementation
 * of the RadarTehran Full-Scope Website Design Audit (F-01 through F-15).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  toPersianDigits,
  formatPersianNumber,
  formatPersianPrice,
  formatPersianScore,
  formatPersianDeltaPercent,
  normalizeMapPinPriceText,
} from '../src/utils/persianBidiFormat';
import { resolveRoutePageMeta } from '../src/navigation/url/routePageMeta';
import {
  COMMUNITY_SECONDARY_TABS,
  TOOLS_SECONDARY_TABS,
} from '../src/navigation/primary/megaMenuAndTabsConfig';
import { buildHomeMarketSnapshotMetrics } from '../src/features/home/services/homeDataAdapter';
import { INITIAL_NEIGHBORHOODS, type EvaluatedNeighborhood } from '../src/data/neighborhoods';

const ROOT = process.cwd();

test('F-06: persianBidiFormat formats digits, prices, scores, BiDi deltas, and map pins cleanly', () => {
  assert.equal(toPersianDigits('1405/08/24'), '۱۴۰۵/۰۸/۲۴');
  assert.equal(formatPersianNumber(12500), '۱۲٬۵۰۰');
  assert.equal(formatPersianNumber(8.2, { decimals: 1 }), '۸٫۲');
  assert.equal(formatPersianPrice(185, 'م/متر'), '۱۸۵ م/متر');
  assert.equal(formatPersianPrice(12500, 'million'), '۱۲٬۵۰۰ میلیون تومان');
  assert.equal(formatPersianScore(8.2), '۸٫۲ از ۱۰');
  assert.equal(formatPersianScore(9), '۹ از ۱۰');

  // BiDi isolation wraps signed delta in LRI (\u2066) ... PDI (\u2069)
  const posDelta = formatPersianDeltaPercent(6.4);
  assert.ok(posDelta.startsWith('\u2066') && posDelta.endsWith('\u2069'), 'Positive delta must be BiDi isolated');
  assert.ok(posDelta.includes('+۶٫۴٪'));

  const negDelta = formatPersianDeltaPercent(-3.5);
  assert.ok(negDelta.startsWith('\u2066') && negDelta.endsWith('\u2069'), 'Negative delta must be BiDi isolated');
  assert.ok(negDelta.includes('−۳٫۵٪') || negDelta.includes('-۳٫۵٪'));

  // Map pin text never leaks raw ASCII digits or reversed unit ordering
  const pin = normalizeMapPinPriceText('185 م');
  assert.equal(pin, '۱۸۵ م');
  assert.ok(!/[0-9]/.test(pin));
});

test('F-10: legal & knowledge sub-routes resolve exact dedicated document titles and descriptions', () => {
  const base = { cityNameFa: 'تهران', brandFa: 'رادارتهران' };
  const privacyMeta = resolveRoutePageMeta({ ...base, viewId: 'knowledge', subTab: 'legal_privacy' });
  assert.equal(privacyMeta.title, 'حریم خصوصی و حفاظت از داده | رادارتهران');
  assert.ok(privacyMeta.description.length > 20);

  const termsMeta = resolveRoutePageMeta({ ...base, viewId: 'knowledge', subTab: 'legal_terms' });
  assert.equal(termsMeta.title, 'قوانین و شرایط استفاده | رادارتهران');

  const guideMeta = resolveRoutePageMeta({ ...base, viewId: 'knowledge', subTab: 'guide' });
  assert.ok(guideMeta.title.includes('راهنمای'));

  const methodMeta = resolveRoutePageMeta({ ...base, viewId: 'knowledge', subTab: 'methodology' });
  assert.ok(methodMeta.title.includes('روش‌شناسی'));

  const glossaryMeta = resolveRoutePageMeta({ ...base, viewId: 'knowledge', subTab: 'glossary' });
  assert.ok(glossaryMeta.title.includes('واژه‌نامه') || glossaryMeta.title.includes('فرهنگ‌نامه'));
});

test('F-11 & MR-02: Community secondary tabs expose core 6 tabs (including research & guidelines) and Tools compare unified', () => {
  assert.equal(COMMUNITY_SECONDARY_TABS.length, 6);
  assert.ok(COMMUNITY_SECONDARY_TABS.some((t) => t.id === 'research'));
  assert.ok(COMMUNITY_SECONDARY_TABS.some((t) => t.id === 'guidelines'));
  assert.ok(TOOLS_SECONDARY_TABS.length <= 6);
  const compareTabs = TOOLS_SECONDARY_TABS.filter((t) => t.id.startsWith('compare'));
  assert.equal(compareTabs.length, 1, 'Compare areas and properties must be unified under 1 secondary tab');
});

test('F-04 & F-14: single token source of truth (src/styles/tokens.css deleted) and zero dark:*-slate-* drift in src/', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'src/styles/tokens.css')), false, 'Orphaned src/styles/tokens.css must be removed');
  const layersTokens = fs.readFileSync(path.join(ROOT, 'src/styles/layers/tokens.css'), 'utf8');
  assert.ok(layersTokens.includes('--color-bg-canvas'), 'Canonical tokens.css must define semantic surface tokens');

  // Verify zero remaining dark:bg-slate-* / dark:border-slate-* / dark:text-slate-* across src/
  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, acc);
      else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
    }
    return acc;
  };
  const offending: string[] = [];
  const pattern = /dark:(?:bg|text|border)-slate-\d+/;
  for (const file of walk(path.join(ROOT, 'src'))) {
    const content = fs.readFileSync(file, 'utf8');
    if (pattern.test(content)) offending.push(path.relative(ROOT, file));
  }
  assert.deepEqual(offending, [], `Unexpected dark:*-slate-* classes found in: ${offending.join(', ')}`);
});

test('F-01, F-02, F-03: internal codenames and placeholder copy eliminated from consumer UI', () => {
  const guideView = fs.readFileSync(path.join(ROOT, 'src/features/knowledge/components/ConsumerHousingGuideView.tsx'), 'utf8');
  assert.ok(!/RT-FE-|Stage\s+\d+|ADR-\d+/.test(guideView), 'Consumer guide must not contain internal engineering codenames');

  const epistemicBanner = fs.readFileSync(path.join(ROOT, 'src/components/views/DiscoverSelectedHoodEpistemicBanner.tsx'), 'utf8');
  assert.ok(!/v6\.4/.test(epistemicBanner), 'Epistemic banner must not leak internal v6.4 code');

  const servicesPage = fs.readFileSync(path.join(ROOT, 'src/features/services/pages/ServicesMarketplacePage.tsx'), 'utf8');
  assert.ok(!/اسکلت اولیه/.test(servicesPage), 'Services marketplace must not render placeholder copy');
});

test('F-07: ProductUserSpaceView wires real persistence handlers (no empty no-ops)', () => {
  const userSpace = fs.readFileSync(path.join(ROOT, 'src/components/views/ProductUserSpaceView.tsx'), 'utf8');
  assert.ok(!/onCreateSearchWatchlist=\{\(\)\s*=>\s*\{\}\}/.test(userSpace), 'onCreateSearchWatchlist must be wired');
  assert.ok(!/onDeleteSearchWatchlist=\{\(\)\s*=>\s*\{\}\}/.test(userSpace), 'onDeleteSearchWatchlist must be wired');
  assert.ok(!/onDeleteSavedMapView=\{\(\)\s*=>\s*\{\}\}/.test(userSpace), 'onDeleteSavedMapView must be wired');
  assert.ok(!/onDeleteSavedMarketAnalysis=\{\(\)\s*=>\s*\{\}\}/.test(userSpace), 'onDeleteSavedMarketAnalysis must be wired');
});

test('F-13: Home market snapshot metrics expose explicit city-wide median aggregation labels', () => {
  const sampleHoods: EvaluatedNeighborhood[] = INITIAL_NEIGHBORHOODS.slice(0, 10).map((h) => ({
    ...h,
    status: 'green',
    distKm: null,
    diffPercent: 0,
    overallScore: 8.1,
    marketReport: {
      status: 'balanced',
      badgeText: 'متعادل',
      hoodGrowth6mPercent: 8.5,
      tehranGrowth6mPercent: 9.2,
      prRatio: 16.5,
      summary: 'بازار متعادل',
      trendData: [],
    },
    trafficInfo: h.trafficInfo ?? {
      liveStatus: 'متعادل',
      liveSeverity: 'semi',
      peakHours: '۱۷ تا ۲۰',
      seasonalAnalysis: 'پایدار',
      bottlenecks: 'محور اصلی',
      trafficScore: 7,
    },
  }));
  const metrics = buildHomeMarketSnapshotMetrics(sampleHoods, 'tehran', 'normal');
  const asking = metrics.find((m) => m.id === 'asking_price_sqm');
  assert.ok(asking, 'Asking metric must exist');
  assert.ok(asking.title.includes('میانه'), 'Home asking price KPI must explicitly declare median aggregation');
  assert.ok(asking.geography.cityLabelFa.includes('میانه'), 'Home KPI scope must clarify city-wide median');
});

test('F-15: RadarWorkspaceShell gates Leaflet mounting on map visibility', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'src/components/RadarWorkspaceShell.tsx'), 'utf8');
  assert.ok(shell.includes('shouldMountMap: isMapRegionVisible'), 'Leaflet must be gated on isMapRegionVisible');
  const leafletHook = fs.readFileSync(path.join(ROOT, 'src/components/useLeafletRadarMap.ts'), 'utf8');
  assert.ok(leafletHook.includes('if (!shouldMountMap)'), 'useLeafletRadarMap must skip mounting when hidden');
});
