/**
 * @file tests/rt-fe-bugfix-001-community-routing.test.ts
 * @description Independent regression tests for RT-FE-BUGFIX-001 (BUG-002):
 * Unified canonical route contract, round-trip generation & resolution, Refresh, Back/Forward,
 * trailing slash, percent-encoding, query+hash preservation, invalid-route 404, and UI tab sync
 * across all 11 Community («انجمن») subsections.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_ROUTES } from '../src/navigation/registry/public.routes';
import {
  buildCanonicalPathForDestination,
  buildSynchronizedNavigationUrl,
  resolveRouteFromLocation,
} from '../src/navigation/url/navigationUrlContract';
import type { ContributionsSubTabId } from '../src/navigation/registry/route.types';
import {
  mapHubTabToSubTab,
  mapSubTabToHubTab,
} from '../src/features/community/utils/communityHubNavHelpers';
import { applyUrlParamsFromLocation } from '../src/components/useAppUrlAndTitleSync';

const ALL_11_COMMUNITY_SUBSECTIONS: readonly ContributionsSubTabId[] = [
  'discussions',
  'questions',
  'topics',
  'neighborhoods',
  'market',
  'contributions',
  'reports',
  'research',
  'members',
  'guidelines',
  'help',
];

const EXTRA_CONTRIBUTION_SUBTABS: readonly ContributionsSubTabId[] = [
  'overview',
  'submit',
  'points',
  'verify',
];

test('BUG-002: All 11 Community subsections have unique canonical paths and round-trip cleanly without 404', () => {
  const generatedPaths = new Set<string>();

  for (const subTab of ALL_11_COMMUNITY_SUBSECTIONS) {
    const url = buildCanonicalPathForDestination('contributions', subTab);
    assert.equal(url, `/community/${subTab}`, `Expected canonical path /community/${subTab}, got ${url}`);
    assert.equal(generatedPaths.has(url), false, `Duplicate generated URL detected: ${url}`);
    generatedPaths.add(url);

    // Direct resolution must succeed independently of any prior React state
    const resolved = resolveRouteFromLocation(url, '');
    assert.equal(resolved.viewId, 'contributions', `Direct route ${url} must resolve to contributions`);
    assert.equal(resolved.subTab, subTab, `Direct route ${url} must resolve to subTab=${subTab}`);
    assert.equal(resolved.isUnknownPath, false, `Direct route ${url} must NOT return not_found`);

    // UI tab mapping: every canonical subsection maps to a non-overview UI tab whose reverse mapping is also a valid canonical subsection
    const uiTab = mapSubTabToHubTab(subTab);
    assert.notEqual(uiTab, 'overview', `Subsection ${subTab} must map to a dedicated UI tab, not overview`);
    const canonicalFromUiTab = mapHubTabToSubTab(uiTab);
    const uiTabUrl = buildCanonicalPathForDestination('contributions', canonicalFromUiTab);
    assert.equal(resolveRouteFromLocation(uiTabUrl, '').isUnknownPath, false, `UI tab ${uiTab} URL ${uiTabUrl} must resolve cleanly`);
  }

  for (const extra of EXTRA_CONTRIBUTION_SUBTABS) {
    const url = buildCanonicalPathForDestination('contributions', extra);
    const resolved = resolveRouteFromLocation(url, '');
    assert.equal(resolved.viewId, 'contributions');
    assert.equal(resolved.subTab, extra);
    assert.equal(resolved.isUnknownPath, false);
  }

  // Ensure registry has no duplicate paths across PUBLIC_ROUTES
  const pathSet = new Set<string>();
  for (const route of PUBLIC_ROUTES) {
    assert.equal(pathSet.has(route.path), false, `Duplicate path in PUBLIC_ROUTES: ${route.path}`);
    pathSet.add(route.path);
  }
});

test('BUG-002: Trailing slashes, duplicate slashes, percent-encoded static segments, /community aliases, and /community/members/:username resolve accurately', () => {
  for (const subTab of ALL_11_COMMUNITY_SUBSECTIONS) {
    // Trailing slash
    const trailing = resolveRouteFromLocation(`/community/${subTab}/`, '');
    assert.equal(trailing.viewId, 'contributions');
    assert.equal(trailing.subTab, subTab);
    assert.equal(trailing.isUnknownPath, false);

    // Duplicate slashes
    const dupSlash = resolveRouteFromLocation(`//community///${subTab}/`, '');
    assert.equal(dupSlash.viewId, 'contributions');
    assert.equal(dupSlash.subTab, subTab);
    assert.equal(dupSlash.isUnknownPath, false);
  }

  // Valid percent-encoded static segment
  const encoded = resolveRouteFromLocation('/community/%64iscussions', '');
  assert.equal(encoded.viewId, 'contributions');
  assert.equal(encoded.subTab, 'discussions');
  assert.equal(encoded.isUnknownPath, false);

  // /community & /community/search aliases
  const rootAlias = resolveRouteFromLocation('/community', '');
  assert.equal(rootAlias.viewId, 'contributions');
  assert.equal(rootAlias.subTab, 'overview');

  const searchAlias = resolveRouteFromLocation('/community/search', '?q=سعادت');
  assert.equal(searchAlias.viewId, 'contributions');
  assert.equal(searchAlias.subTab, 'overview');

  // Dynamic member profile
  const memberRoute = resolveRouteFromLocation('/community/members/sara-tehran', '');
  assert.equal(memberRoute.viewId, 'contributions');
  assert.equal(memberRoute.subTab, 'members');
  assert.equal(memberRoute.memberUsername, 'sara-tehran');
  assert.equal(memberRoute.isUnknownPath, false);
});

test('BUG-002: Invalid community routes, fabricated /contributions/<subTab> paths, multi-segment member paths, and malformed encoding MUST return not_found', () => {
  const invalidPaths = [
    '/community/nonexistent-section',
    '/community/discussions/extra-segment',
    '/contributions/discussions',
    '/contributions/questions',
    '/contributions/help',
    '/community/members/a/b',
    '/community/%E0%A4%A',
    '/community/discussions%2Fextra',
  ];

  for (const badPath of invalidPaths) {
    const resolved = resolveRouteFromLocation(badPath, '');
    assert.equal(resolved.viewId, 'not_found', `Invalid path ${badPath} must resolve to not_found`);
    assert.equal(resolved.isUnknownPath, true, `Invalid path ${badPath} must set isUnknownPath=true`);
  }
});

test('BUG-002: Direct entry, Refresh, Back/Forward history sequence, and valid query + hash preservation work consistently across subsections', () => {
  const historyStack = [
    '/community/discussions?city=karaj&sort=top#thread-42',
    '/community/questions?city=karaj#q-10',
    '/community/research?city=mashhad&topic=metro#proposal-3',
    '/community/members/sara-tehran',
    '/community/help#faq-2',
  ];

  const hydrate = (fullUrl: string) => {
    const u = new URL(fullUrl, 'https://radartehran.ir');
    let view = 'map';
    let subTab: string | undefined;
    let city = 'tehran';

    applyUrlParamsFromLocation(u.pathname, u.search, false, {
      activeCity: 'tehran',
      setActiveCity: (c) => { city = c; },
      selectedHoodId: 5,
      setSelectedHoodId: () => {},
      showCompareModal: false,
      setShowCompareModal: () => {},
      compareId1: 5,
      setCompareId1: () => {},
      compareId2: 1,
      setCompareId2: () => {},
      mode: 'rent',
      setMode: () => {},
      deposit: 500,
      setDeposit: () => {},
      monthlyRent: 20,
      setMonthlyRent: () => {},
      buyTotalBudget: 8000,
      setBuyTotalBudget: () => {},
      targetSqm: 80,
      setTargetSqm: () => {},
      primaryView: view,
      setPrimaryView: (v) => { view = v; },
      activeSubTab: subTab as never,
      setActiveSubTab: (s) => { subTab = s; },
      mapInstanceRef: { current: null },
      hasUrlBudgetParams: false,
    });

    const canonicalPath =
      u.pathname.startsWith('/community/members/') && u.pathname.length > '/community/members/'.length
        ? u.pathname
        : buildCanonicalPathForDestination(view as never, subTab as never);

    const synced = buildSynchronizedNavigationUrl({
      canonicalPath,
      currentSearch: u.search,
      currentHash: u.hash,
      isRouteChange: false,
      activeCity: city,
    });

    return { view, subTab, city, synced };
  };

  // Forward navigation + Refresh check
  const expectedSubTabs = ['discussions', 'questions', 'research', 'members', 'help'];
  for (let i = 0; i < historyStack.length; i += 1) {
    const h = hydrate(historyStack[i]);
    assert.equal(h.view, 'contributions');
    assert.equal(h.subTab, expectedSubTabs[i]);
    // Refresh preservation of valid query & hash
    if (historyStack[i].includes('sort=top')) assert.ok(h.synced.includes('sort=top'));
    if (historyStack[i].includes('#thread-42')) assert.ok(h.synced.endsWith('#thread-42'));
    if (historyStack[i].includes('topic=metro')) assert.ok(h.synced.includes('topic=metro'));
    if (historyStack[i].includes('#proposal-3')) assert.ok(h.synced.endsWith('#proposal-3'));
    if (historyStack[i].includes('#faq-2')) assert.ok(h.synced.endsWith('#faq-2'));
  }

  // Back navigation sequence (popstate simulation)
  for (let i = historyStack.length - 1; i >= 0; i -= 1) {
    const h = hydrate(historyStack[i]);
    assert.equal(h.view, 'contributions');
    assert.equal(h.subTab, expectedSubTabs[i]);
  }
});

test('BUG-002: CommunityHubPage wires UI subsection clicks to onNavigateView for full URL synchronization', () => {
  const hubSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/community/pages/CommunityHubPage.tsx'),
    'utf8'
  );
  assert.ok(hubSrc.includes('mapHubTabToSubTab'), 'CommunityHubPage must map UI tabs back to canonical ContributionsSubTabId');
  assert.ok(
    hubSrc.includes("onNavigateView('contributions'"),
    'CommunityHubPage must synchronize URL via onNavigateView when switching community subsections'
  );
});
