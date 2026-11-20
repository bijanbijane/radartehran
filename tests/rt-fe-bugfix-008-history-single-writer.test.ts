/**
 * @file tests/rt-fe-bugfix-008-history-single-writer.test.ts
 * RT-FE-BUGFIX-008-HISTORY-STATE-SINGLE-WRITER
 *
 * Comprehensive regression suite covering all 10 required Navigation & History scenarios,
 * single-writer domain enforcement, popstate restoration invariants, and dual-owner isolation.
 */
import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  HISTORY_OWNERSHIP_MATRIX,
  beginPopStateRestoration,
  buildOverlayPreservingUrl,
  commitManagedHistoryTransition,
  endPopStateRestoration,
  isPopStateRestorationActive,
  mergePreservedQueryIntoUrl,
  resetHistoryCoordinatorForTests,
} from '../src/navigation/url/historySingleWriter';
import {
  buildCanonicalPathForDestination,
  buildSynchronizedNavigationUrl,
  normalizePathname,
  resolveRouteFromLocation,
  sanitizeNavigationHash,
} from '../src/navigation/url/navigationUrlContract';
import {
  applyUrlParamsFromLocation,
  type UseAppUrlAndTitleSyncParams,
} from '../src/components/useAppUrlAndTitleSync';
import { pushMemberProfileUrl } from '../src/features/community/utils/communityHubNavHelpers';
import { syncSearchHistoryUrl } from '../src/features/search/components/GlobalSearchWorkspace';
import type { CityId } from '../src/data/neighborhoods';
import type { ModuleSubTabId } from '../src/navigation/registry/route.types';

interface HistoryEntry {
  url: string;
  state: any;
}

class DeterministicBrowserHarness {
  stack: HistoryEntry[];
  index = 0;
  pushCount = 0;
  replaceCount = 0;
  private popListeners: Array<() => void> = [];

  constructor(initialUrl: string) {
    this.stack = [{ url: initialUrl, state: null }];
  }

  private parseCurrent(): { pathname: string; search: string; hash: string } {
    const raw = this.stack[this.index]?.url || '/';
    const hashIdx = raw.indexOf('#');
    const hash = hashIdx >= 0 ? raw.slice(hashIdx) : '';
    const withoutHash = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
    const queryIdx = withoutHash.indexOf('?');
    const search = queryIdx >= 0 ? withoutHash.slice(queryIdx) : '';
    const pathname = (queryIdx >= 0 ? withoutHash.slice(0, queryIdx) : withoutHash) || '/';
    return { pathname, search, hash };
  }

  get currentUrl(): string {
    return this.stack[this.index].url;
  }

  get location() {
    const self = this;
    return {
      get pathname() { return self.parseCurrent().pathname; },
      get search() { return self.parseCurrent().search; },
      get hash() { return self.parseCurrent().hash; },
      get href() { return `https://radartehran.ir${self.currentUrl}`; },
    };
  }

  get history() {
    const self = this;
    return {
      get length() { return self.stack.length; },
      get state() { return self.stack[self.index]?.state ?? null; },
      pushState(state: any, _unused: string, url?: string | URL | null) {
        const nextUrl = url ? String(url) : self.currentUrl;
        self.stack = self.stack.slice(0, self.index + 1);
        self.stack.push({ url: nextUrl, state: state ?? null });
        self.index = self.stack.length - 1;
        self.pushCount += 1;
      },
      replaceState(state: any, _unused: string, url?: string | URL | null) {
        const nextUrl = url ? String(url) : self.currentUrl;
        self.stack[self.index] = { url: nextUrl, state: state ?? null };
        self.replaceCount += 1;
      },
      back() {
        if (self.index > 0) {
          self.index -= 1;
          self.dispatchPopState();
        }
      },
      forward() {
        if (self.index < self.stack.length - 1) {
          self.index += 1;
          self.dispatchPopState();
        }
      },
    };
  }

  addPopStateListener(fn: () => void) {
    this.popListeners.push(fn);
  }

  dispatchPopState() {
    for (const fn of this.popListeners) fn();
  }
}

interface SimulatedAppState {
  activeCity: CityId;
  selectedHoodId: number;
  showCompareModal: boolean;
  compareId1: number;
  compareId2: number;
  mode: 'rent' | 'buy';
  deposit: number;
  monthlyRent: number;
  buyTotalBudget: number;
  targetSqm: number;
  workHubId: string;
  primaryView: string;
  activeSubTab: ModuleSubTabId | undefined;
  adminSection: string;
  overlayModalId: string | null;
  inspectorTab: string;
}

function createAppState(initial?: Partial<SimulatedAppState>): SimulatedAppState {
  return {
    activeCity: 'tehran',
    selectedHoodId: 5,
    showCompareModal: false,
    compareId1: 5,
    compareId2: 14,
    mode: 'rent',
    deposit: 2800,
    monthlyRent: 45,
    buyTotalBudget: 24500,
    targetSqm: 80,
    workHubId: 'none',
    primaryView: 'map',
    activeSubTab: undefined,
    adminSection: 'overview',
    overlayModalId: null,
    inspectorTab: 'OVERVIEW',
    ...initial,
  };
}

function toUrlSyncParams(state: SimulatedAppState): UseAppUrlAndTitleSyncParams {
  return {
    get activeCity() { return state.activeCity; },
    setActiveCity: (c) => { state.activeCity = c; },
    get selectedHoodId() { return state.selectedHoodId; },
    setSelectedHoodId: (id) => { state.selectedHoodId = id; },
    get showCompareModal() { return state.showCompareModal; },
    setShowCompareModal: (v) => { state.showCompareModal = v; },
    get compareId1() { return state.compareId1; },
    setCompareId1: (id) => { state.compareId1 = id; },
    get compareId2() { return state.compareId2; },
    setCompareId2: (id) => { state.compareId2 = id; },
    get mode() { return state.mode; },
    setMode: (m) => { state.mode = m; },
    get deposit() { return state.deposit; },
    setDeposit: (d) => { state.deposit = d; },
    get monthlyRent() { return state.monthlyRent; },
    setMonthlyRent: (r) => { state.monthlyRent = r; },
    get buyTotalBudget() { return state.buyTotalBudget; },
    setBuyTotalBudget: (b) => { state.buyTotalBudget = b; },
    get targetSqm() { return state.targetSqm; },
    setTargetSqm: (s) => { state.targetSqm = s; },
    get workHubId() { return state.workHubId; },
    setWorkHubId: (id) => { state.workHubId = id; },
    get primaryView() { return state.primaryView; },
    setPrimaryView: (v) => { state.primaryView = v; },
    get activeSubTab() { return state.activeSubTab; },
    setActiveSubTab: (s) => { state.activeSubTab = s; },
    setAdminSection: (s) => { state.adminSection = s; },
    mapInstanceRef: { current: null },
    hasUrlBudgetParams: false,
  };
}

/**
 * Deterministic mirror of useAppUrlAndTitleSync's route & history commit cycle
 * wired to a DeterministicBrowserHarness.
 */
class NavigationRuntimeHarness {
  readonly browser: DeterministicBrowserHarness;
  readonly state: SimulatedAppState;
  private lastRouteKey = '';

  constructor(initialUrl: string) {
    this.browser = new DeterministicBrowserHarness(initialUrl);
    this.state = createAppState();
    // Initial mount hydration (flyMap = false)
    applyUrlParamsFromLocation(this.browser.location.pathname, this.browser.location.search, false, toUrlSyncParams(this.state));
    this.lastRouteKey = this.computeRouteKey();

    // Register popstate handler for BOTH useAppUrlAndTitleSync AND RadarNavigationContext
    this.browser.addPopStateListener(() => {
      const epoch = beginPopStateRestoration();
      try {
        applyUrlParamsFromLocation(this.browser.location.pathname, this.browser.location.search, true, toUrlSyncParams(this.state));
        // Mirror RadarNavigationContext popstate restoration
        const rawTab = new URLSearchParams(this.browser.location.search).get('inspectorTab')?.toUpperCase();
        this.state.inspectorTab = rawTab === 'HEDONIC' || rawTab === 'TRENDS' || rawTab === 'REVIEWS' ? rawTab : 'OVERVIEW';
        if (this.state.overlayModalId !== null) {
          this.state.overlayModalId = null;
        }
        // Mirror sync effect running during popstate restoration
        this.syncRouteToHistory(true);
        // Mirror RadarNavigationContext effect attempting to run during same popstate flush
        this.syncInspectorTabOverlay(true);
      } finally {
        endPopStateRestoration(epoch);
      }
    });
  }

  private computeRouteKey(): string {
    const base = `${this.state.primaryView || 'map'}:${this.state.activeSubTab || ''}`;
    return `${base}${this.state.showCompareModal ? ':compare' : ''}`;
  }

  syncRouteToHistory(fromPopState = false): void {
    const baseRouteKey = `${this.state.primaryView || 'map'}:${this.state.activeSubTab || ''}`;
    const routeKey = `${baseRouteKey}${this.state.showCompareModal ? ':compare' : ''}`;
    const prevRouteKey = this.lastRouteKey;
    const prevWasCompare = prevRouteKey.endsWith(':compare');
    const prevBaseRouteKey = prevWasCompare ? prevRouteKey.slice(0, -':compare'.length) : prevRouteKey;
    const leavingCompareSameRoute = prevWasCompare && !this.state.showCompareModal && prevBaseRouteKey === baseRouteKey;
    const isRouteChange = !fromPopState && prevRouteKey !== '' && prevRouteKey !== routeKey && !leavingCompareSameRoute;
    this.lastRouteKey = routeKey;

    if (fromPopState || isPopStateRestorationActive()) return;
    if (this.state.primaryView === 'not_found') return;

    const currentPath = normalizePathname(this.browser.location.pathname);
    const currentSearch = this.browser.location.search;
    const currentHash = sanitizeNavigationHash(this.browser.location.hash);

    if (this.state.showCompareModal) {
      const cityPrefix = this.state.activeCity !== 'tehran' ? `city=${this.state.activeCity}&` : '';
      const baseUrl = `/?${cityPrefix}compare=${this.state.compareId1}-${this.state.compareId2}`;
      const merged = mergePreservedQueryIntoUrl(baseUrl, currentSearch, !isRouteChange);
      const finalUrl = !isRouteChange && currentHash ? `${merged}${currentHash}` : merged;
      commitManagedHistoryTransition({
        domain: isRouteChange ? 'page_route' : 'core_query',
        mode: isRouteChange ? 'push' : 'replace',
        targetUrl: finalUrl,
        historyObj: this.browser.history,
        locationObj: this.browser.location,
      });
      return;
    }

    if (this.state.primaryView !== 'map' && this.state.primaryView !== 'home') {
      const preserveMember =
        this.state.primaryView === 'contributions' &&
        this.state.activeSubTab === 'members' &&
        currentPath.startsWith('/community/members/') &&
        currentPath.length > '/community/members/'.length;
      const canonicalPath = preserveMember
        ? currentPath
        : buildCanonicalPathForDestination(this.state.primaryView as any, this.state.activeSubTab);
      const nextUrl = buildSynchronizedNavigationUrl({
        canonicalPath,
        currentSearch,
        currentHash,
        isRouteChange: isRouteChange && !preserveMember,
        activeCity: this.state.activeCity,
        selectedHoodId: this.state.selectedHoodId,
      });
      const shouldPush = isRouteChange && !preserveMember;
      commitManagedHistoryTransition({
        domain: shouldPush || normalizePathname(nextUrl) !== currentPath ? 'page_route' : 'core_query',
        mode: shouldPush ? 'push' : 'replace',
        targetUrl: nextUrl,
        historyObj: this.browser.history,
        locationObj: this.browser.location,
      });
      return;
    }

    const cityPrefix = this.state.activeCity !== 'tehran' ? `city=${this.state.activeCity}&` : '';
    const baseMapUrl = `/?${cityPrefix}hood=${this.state.selectedHoodId}`;
    const merged = mergePreservedQueryIntoUrl(baseMapUrl, currentSearch, !isRouteChange);
    const finalUrl = !isRouteChange && currentHash ? `${merged}${currentHash}` : merged;
    commitManagedHistoryTransition({
      domain: isRouteChange || normalizePathname(finalUrl) !== currentPath ? 'page_route' : 'core_query',
      mode: isRouteChange ? 'push' : 'replace',
      targetUrl: finalUrl,
      historyObj: this.browser.history,
      locationObj: this.browser.location,
    });
  }

  navigateView(view: string, subTab?: ModuleSubTabId): void {
    this.state.primaryView = view;
    this.state.activeSubTab = subTab;
    this.state.showCompareModal = false;
    this.syncRouteToHistory(false);
  }

  switchCity(city: CityId, firstHoodId: number): void {
    this.state.activeCity = city;
    this.state.selectedHoodId = firstHoodId;
    this.syncRouteToHistory(false);
  }

  openCompare(id1: number, id2: number): void {
    this.state.compareId1 = id1;
    this.state.compareId2 = id2;
    this.state.showCompareModal = true;
    this.syncRouteToHistory(false);
  }

  closeCompare(): void {
    this.state.showCompareModal = false;
    this.syncRouteToHistory(false);
  }

  syncInspectorTabOverlay(fromPopState = false): void {
    const nextUrl = buildOverlayPreservingUrl(this.browser.location, this.state.inspectorTab);
    commitManagedHistoryTransition({
      domain: 'overlay',
      mode: 'replace',
      targetUrl: nextUrl,
      isPopStateRestore: fromPopState,
      historyObj: this.browser.history,
      locationObj: this.browser.location,
    });
  }

  openOverlayModal(modalId: string): void {
    const alreadyOpen = this.state.overlayModalId === modalId;
    this.state.overlayModalId = modalId;
    if (!alreadyOpen) {
      commitManagedHistoryTransition({
        domain: 'overlay',
        mode: 'push_overlay_state',
        targetUrl: this.browser.currentUrl,
        state: { __radarOverlay: true, modalId },
        historyObj: this.browser.history,
        locationObj: this.browser.location,
      });
    }
  }
}

afterEach(() => {
  resetHistoryCoordinatorForTests();
});

describe('RT-FE-BUGFIX-008: Browser History Single-Writer & Navigation State Consistency (10 Scenarios)', () => {
  test('Scenario 1: Direct deep link restores exact View, Subtab, City, and Hood without extra history pushes', () => {
    const rt = new NavigationRuntimeHarness('/community/discussions?city=karaj&hood=101');
    assert.equal(rt.state.primaryView, 'contributions');
    assert.equal(rt.state.activeSubTab, 'discussions');
    assert.equal(rt.state.activeCity, 'karaj');
    assert.equal(rt.state.selectedHoodId, 101);
    assert.equal(rt.browser.pushCount, 0);
    assert.equal(rt.browser.stack.length, 1);

    const memberRt = new NavigationRuntimeHarness('/community/members/sara?city=shiraz');
    assert.equal(memberRt.state.primaryView, 'contributions');
    assert.equal(memberRt.state.activeSubTab, 'members');
    assert.equal(memberRt.state.activeCity, 'shiraz');
  });

  test('Scenario 2: View change executes exactly 1 valid History Transition (no duplicate pushState)', () => {
    const rt = new NavigationRuntimeHarness('/?hood=5');
    rt.navigateView('discover');

    assert.equal(rt.browser.pushCount, 1);
    assert.equal(rt.browser.stack.length, 2);
    assert.equal(rt.browser.location.pathname, '/areas');
    assert.equal(rt.state.primaryView, 'discover');

    // Member profile transition from /community/discussions -> /community/members/ali must also be 1 push (not 2)
    const commRt = new NavigationRuntimeHarness('/community/discussions?city=karaj&hood=101');
    const prevWin = (globalThis as any).window;
    (globalThis as any).window = { history: commRt.browser.history, location: commRt.browser.location };
    try {
      pushMemberProfileUrl('ali');
      commRt.state.primaryView = 'contributions';
      commRt.state.activeSubTab = 'members';
      commRt.syncRouteToHistory(false);
    } finally {
      (globalThis as any).window = prevWin;
    }
    assert.equal(commRt.browser.pushCount, 1, 'openMemberProfile must NOT double-push history entries');
    assert.equal(commRt.browser.location.pathname, '/community/members/ali');
    assert.ok(commRt.browser.location.search.includes('city=karaj'));
  });

  test('Scenario 3: Browser Back returns to previous View with 0 pushState and 0 replaceState overwrite', () => {
    const rt = new NavigationRuntimeHarness('/explore/map?hood=5');
    assert.equal(rt.state.primaryView, 'map');
    rt.navigateView('discover');
    rt.switchCity('karaj', 101);
    const pushesBeforeBack = rt.browser.pushCount;
    const replacesBeforeBack = rt.browser.replaceCount;

    rt.browser.history.back();

    assert.equal(rt.state.primaryView, 'map');
    assert.equal(rt.state.activeCity, 'tehran', 'Back from Karaj route to Tehran map must restore Tehran');
    assert.equal(rt.state.selectedHoodId, 5);
    assert.equal(rt.browser.currentUrl, '/explore/map?hood=5');
    assert.equal(rt.browser.pushCount, pushesBeforeBack, 'popstate must never call pushState');
    assert.equal(rt.browser.replaceCount, replacesBeforeBack, 'popstate must never overwrite URL via replaceState');
  });

  test('Scenario 4: Browser Forward restores next View cleanly with 0 history mutations', () => {
    const rt = new NavigationRuntimeHarness('/explore/map?hood=5');
    rt.navigateView('intelligence', 'prices');
    rt.browser.history.back();
    assert.equal(rt.state.primaryView, 'map');

    const pushesBeforeForward = rt.browser.pushCount;
    const replacesBeforeForward = rt.browser.replaceCount;

    rt.browser.history.forward();

    assert.equal(rt.state.primaryView, 'intelligence');
    assert.equal(rt.state.activeSubTab, 'prices');
    assert.equal(rt.browser.location.pathname, '/market/prices');
    assert.equal(rt.browser.pushCount, pushesBeforeForward);
    assert.equal(rt.browser.replaceCount, replacesBeforeForward);
  });

  test('Scenario 5: Inspector State change never destroys Page Route, core query params, or hash', () => {
    const rt = new NavigationRuntimeHarness('/areas?city=karaj&hood=101&sort=price#section-score');
    rt.state.inspectorTab = 'TRENDS';
    rt.syncInspectorTabOverlay(false);

    assert.equal(rt.browser.pushCount, 0, 'Inspector tab change must use replaceState, never pushState');
    assert.equal(rt.browser.location.pathname, '/areas', 'Page route pathname must remain intact');
    assert.equal(rt.browser.location.hash, '#section-score', 'Hash must not be stripped');
    const sp = new URLSearchParams(rt.browser.location.search);
    assert.equal(sp.get('city'), 'karaj');
    assert.equal(sp.get('hood'), '101');
    assert.equal(sp.get('sort'), 'price');
    assert.equal(sp.get('inspectorTab'), 'TRENDS');

    // Domain guard: overlay domain attempting to mutate pathname must be rejected
    const violation = commitManagedHistoryTransition({
      domain: 'overlay',
      mode: 'replace',
      targetUrl: '/hijacked-route?city=karaj',
      historyObj: rt.browser.history,
      locationObj: rt.browser.location,
    });
    assert.equal(violation.committed, false);
    assert.equal(violation.reason, 'domain_violation');
    assert.equal(rt.browser.location.pathname, '/areas');
  });

  test('Scenario 6: City change preserves other valid query params and strips sensitive params', () => {
    const rt = new NavigationRuntimeHarness('/?hood=5&sort=price&q=metro&inspectorTab=HEDONIC&token=secret123#map-view');
    rt.switchCity('karaj', 101);

    assert.equal(rt.browser.pushCount, 0, 'Same-view city switch must replaceState rather than spam history');
    const sp = new URLSearchParams(rt.browser.location.search);
    assert.equal(sp.get('city'), 'karaj');
    assert.equal(sp.get('hood'), '101');
    assert.equal(sp.get('sort'), 'price', 'Valid sort param must be preserved on city change');
    assert.equal(sp.get('q'), 'metro', 'Valid q param must be preserved on city change');
    assert.equal(sp.get('inspectorTab'), 'HEDONIC', 'Valid inspectorTab must be preserved on city change');
    assert.equal(sp.get('token'), null, 'Sensitive token param must be stripped');
    assert.equal(rt.browser.location.hash, '#map-view', 'Valid hash must be preserved on city change');
  });

  test('Scenario 7: Rapid multi-view changes produce exact non-duplicate History Entries', () => {
    const rt = new NavigationRuntimeHarness('/?hood=5');
    rt.navigateView('discover');
    rt.navigateView('discover'); // redundant click on same view
    rt.navigateView('intelligence');
    rt.navigateView('tools');
    rt.navigateView('tools'); // redundant click on same view

    assert.equal(rt.browser.pushCount, 3, 'Only 3 unique view changes should push history entries');
    assert.deepEqual(
      rt.browser.stack.map((e) => normalizePathname(e.url)),
      ['/', '/areas', '/market', '/tools'],
    );
  });

  test('Scenario 8: Refresh restores exact same Navigation State from URL', () => {
    const rt = new NavigationRuntimeHarness('/?hood=5');
    rt.navigateView('contributions', 'questions');
    rt.switchCity('mashhad', 201);
    const savedUrl = rt.browser.currentUrl;

    // Simulate full browser reload at savedUrl
    const refreshed = new NavigationRuntimeHarness(savedUrl);
    assert.equal(refreshed.state.primaryView, 'contributions');
    assert.equal(refreshed.state.activeSubTab, 'questions');
    assert.equal(refreshed.state.activeCity, 'mashhad');
    assert.equal(refreshed.state.selectedHoodId, 201);
    assert.equal(refreshed.browser.pushCount, 0);
  });

  test('Scenario 9: Overlay change then Back closes overlay cleanly without clobbering Page Route', () => {
    // 9A: RadarNavigationContext modal overlay + Back
    const rt = new NavigationRuntimeHarness('/discover?city=karaj&hood=101#details');
    rt.openOverlayModal('filters-modal');
    rt.openOverlayModal('filters-modal'); // duplicate open must not push twice
    assert.equal(rt.browser.pushCount, 1);
    assert.equal(rt.state.overlayModalId, 'filters-modal');

    const replacesBeforeBack = rt.browser.replaceCount;
    rt.browser.history.back();
    assert.equal(rt.state.overlayModalId, null, 'Back must close overlay modal');
    assert.equal(rt.browser.currentUrl, '/discover?city=karaj&hood=101#details', 'Back from overlay must preserve route, query, and hash');
    assert.equal(rt.browser.replaceCount, replacesBeforeBack, 'Back from overlay must not trigger replaceState writeback');

    // 9B: Compare modal overlay + Back (previously stuck open and re-wrote compare URL!)
    const cmpRt = new NavigationRuntimeHarness('/?hood=5');
    cmpRt.openCompare(5, 14);
    assert.equal(cmpRt.state.showCompareModal, true);
    assert.equal(cmpRt.browser.pushCount, 1);
    assert.ok(cmpRt.browser.location.search.includes('compare=5-14'));

    const cmpReplacesBeforeBack = cmpRt.browser.replaceCount;
    cmpRt.browser.history.back();
    assert.equal(cmpRt.state.showCompareModal, false, 'Back from compare URL must close showCompareModal');
    assert.equal(cmpRt.browser.currentUrl, '/?hood=5');
    assert.equal(cmpRt.browser.replaceCount, cmpReplacesBeforeBack);
  });

  test('Scenario 10: Invalid URL transitions deterministically to not_found without rewriting URL', () => {
    const rt = new NavigationRuntimeHarness('/unknown-nonexistent-path-404');
    assert.equal(rt.state.primaryView, 'not_found');
    assert.equal(rt.browser.location.pathname, '/unknown-nonexistent-path-404');

    rt.syncRouteToHistory(false);
    assert.equal(rt.browser.pushCount, 0);
    assert.equal(rt.browser.replaceCount, 0);
    assert.equal(rt.browser.location.pathname, '/unknown-nonexistent-path-404');
    assert.equal(resolveRouteFromLocation('/unknown-nonexistent-path-404', '').isUnknownPath, true);
  });

  test('GlobalSearchWorkspace syncSearchHistoryUrl preserves hash and honors global popstate restoration epoch', () => {
    const browser = new DeterministicBrowserHarness('/search?q=old#results');
    const epoch = beginPopStateRestoration();
    const blocked = syncSearchHistoryUrl(
      browser.history,
      browser.location.pathname,
      browser.location.search,
      { q: 'پونک', scope: 'ALL', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
      'push',
      false,
      browser.location.hash,
    );
    assert.equal(blocked.methodCalled, 'none');
    assert.equal(browser.pushCount, 0);
    endPopStateRestoration(epoch);

    const committed = syncSearchHistoryUrl(
      browser.history,
      browser.location.pathname,
      browser.location.search,
      { q: 'پونک', scope: 'ALL', sort: 'RELEVANCE', viewMode: 'LIST', filters: { cityId: 'tehran' } },
      'push',
      false,
      browser.location.hash,
    );
    assert.equal(committed.methodCalled, 'pushState');
    assert.ok(committed.committedUrl.endsWith('#results'), 'Search history sync must preserve hash');
  });

  test('Static Single-Writer Ownership Contract: zero raw history.pushState/replaceState bypasses in consumer modules', () => {
    assert.equal(HISTORY_OWNERSHIP_MATRIX.page_route.owner, 'useAppUrlAndTitleSync');
    assert.equal(HISTORY_OWNERSHIP_MATRIX.overlay.canMutatePathname, false);
    assert.equal(HISTORY_OWNERSHIP_MATRIX.overlay.canMutateCoreQuery, false);

    const governedFiles = [
      'src/components/useAppUrlAndTitleSync.ts',
      'src/context/RadarNavigationContext.tsx',
      'src/features/community/utils/communityHubNavHelpers.ts',
      'src/features/search/components/GlobalSearchWorkspace.tsx',
    ];
    for (const rel of governedFiles) {
      const content = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
      assert.equal(
        /\bwindow\.history\.(pushState|replaceState)\b/.test(content),
        false,
        `${rel} must route history writes through historySingleWriter.ts instead of calling window.history directly`,
      );
      assert.ok(
        content.includes('commitManagedHistoryTransition'),
        `${rel} must import and use commitManagedHistoryTransition`,
      );
    }
  });
});
