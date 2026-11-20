/**
 * @file src/navigation/url/historySingleWriter.ts
 * Single-Writer Browser History Coordinator & Ownership Contract (RT-FE-BUGFIX-008).
 *
 * Enforces strict single-writer ownership per navigation domain so page routes,
 * core query parameters, search workspace queries, and overlay/inspector states
 * never race, double-push, strip hashes, or overwrite URLs during popstate.
 */
import { sanitizeNavigationHash, sanitizePublicNavigationQuery } from './navigationUrlContract';

export type HistoryWriteDomain = 'page_route' | 'core_query' | 'overlay' | 'search_query';
export type HistoryCommitMode = 'push' | 'replace' | 'push_overlay_state' | 'none';

export interface HistoryOwnershipRule {
  readonly domain: HistoryWriteDomain;
  readonly owner: string;
  readonly allowedModes: readonly Exclude<HistoryCommitMode, 'none'>[];
  readonly canMutatePathname: boolean;
  readonly canMutateCoreQuery: boolean;
}

export const HISTORY_OWNERSHIP_MATRIX: Record<HistoryWriteDomain, HistoryOwnershipRule> = {
  page_route: {
    domain: 'page_route',
    owner: 'useAppUrlAndTitleSync',
    allowedModes: ['push', 'replace'],
    canMutatePathname: true,
    canMutateCoreQuery: true,
  },
  core_query: {
    domain: 'core_query',
    owner: 'useAppUrlAndTitleSync',
    allowedModes: ['replace'],
    canMutatePathname: false,
    canMutateCoreQuery: true,
  },
  overlay: {
    domain: 'overlay',
    owner: 'RadarNavigationContext',
    allowedModes: ['replace', 'push_overlay_state'],
    canMutatePathname: false,
    canMutateCoreQuery: false,
  },
  search_query: {
    domain: 'search_query',
    owner: 'GlobalSearchWorkspace',
    allowedModes: ['push', 'replace'],
    canMutatePathname: false,
    canMutateCoreQuery: false,
  },
};

export const CORE_OWNED_QUERY_KEYS = new Set<string>([
  'city',
  'hood',
  'compare',
  'mode',
  'dep',
  'rent',
  'buy',
  'sqm',
  'hub',
  'loan',
  'rahnDeduct',
  'age',
  'view',
  'tab',
]);

export interface LocationLike {
  pathname: string;
  search: string;
  hash?: string;
}

export interface HistoryLike {
  pushState?: (data: any, unused: string, url?: string | URL | null) => void;
  replaceState?: (data: any, unused: string, url?: string | URL | null) => void;
  state?: any;
}

export interface ManagedHistoryCommitInput {
  domain: HistoryWriteDomain;
  mode: HistoryCommitMode;
  targetUrl: string;
  state?: any;
  isPopStateRestore?: boolean;
  historyObj?: HistoryLike | null;
  locationObj?: LocationLike | null;
}

export interface ManagedHistoryCommitResult {
  committed: boolean;
  method: 'pushState' | 'replaceState' | 'none';
  finalUrl: string;
  reason: 'committed' | 'popstate_restore' | 'unchanged' | 'mode_none' | 'unavailable' | 'domain_violation';
}

let activePopStateEpoch = 0;
let isRestoringFromPopState = false;

export function beginPopStateRestoration(): number {
  activePopStateEpoch += 1;
  isRestoringFromPopState = true;
  return activePopStateEpoch;
}

export function endPopStateRestoration(epoch?: number): void {
  if (epoch === undefined || epoch === activePopStateEpoch) {
    isRestoringFromPopState = false;
  }
}

export function isPopStateRestorationActive(): boolean {
  return isRestoringFromPopState;
}

export function resetHistoryCoordinatorForTests(): void {
  activePopStateEpoch = 0;
  isRestoringFromPopState = false;
}

function normalizeSearch(search?: string | null): string {
  if (!search) return '';
  return search.startsWith('?') ? search : `?${search}`;
}

export function readCurrentFullUrl(locationObj?: LocationLike | null): string {
  const loc = locationObj ?? (typeof window !== 'undefined' ? window.location : null);
  if (!loc) return '/';
  const pathname = loc.pathname || '/';
  const search = normalizeSearch(loc.search);
  const hash = loc.hash || '';
  return `${pathname}${search}${hash}`;
}

function splitUrlParts(rawUrl: string): { pathname: string; search: string; hash: string } {
  const hashIdx = rawUrl.indexOf('#');
  const hash = hashIdx >= 0 ? rawUrl.slice(hashIdx) : '';
  const withoutHash = hashIdx >= 0 ? rawUrl.slice(0, hashIdx) : rawUrl;
  const queryIdx = withoutHash.indexOf('?');
  const search = queryIdx >= 0 ? withoutHash.slice(queryIdx) : '';
  const pathname = (queryIdx >= 0 ? withoutHash.slice(0, queryIdx) : withoutHash) || '/';
  return { pathname, search, hash };
}

/**
 * Merges valid non-owned query parameters (and optional hash) from the current
 * location into a newly constructed URL so city/hood updates never wipe unrelated
 * valid parameters such as `sort`, `q`, `filter`, or `inspectorTab`.
 */
export function mergePreservedQueryIntoUrl(
  nextUrl: string,
  currentSearch: string,
  preserveUnrelated: boolean,
  ownedKeys: ReadonlySet<string> = CORE_OWNED_QUERY_KEYS,
): string {
  if (!preserveUnrelated || !currentSearch) return nextUrl;
  const { pathname, search: nextSearch, hash } = splitUrlParts(nextUrl);
  const existingSafe = sanitizePublicNavigationQuery(
    new URLSearchParams(currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch),
  );
  const nextParams = new URLSearchParams(nextSearch.startsWith('?') ? nextSearch.slice(1) : nextSearch);

  let mutated = false;
  existingSafe.forEach((value, key) => {
    if (!ownedKeys.has(key) && !nextParams.has(key)) {
      nextParams.set(key, value);
      mutated = true;
    }
  });

  if (!mutated) return nextUrl;
  const mergedQs = sanitizePublicNavigationQuery(nextParams).toString();
  return `${pathname}${mergedQs ? `?${mergedQs}` : ''}${hash}`;
}

/**
 * Builds an overlay-safe URL that NEVER alters pathname, core query params
 * (`city`, `hood`, `mode`, `compare`, `tab`, etc.), or valid `#hash`.
 */
export function buildOverlayPreservingUrl(
  locationObj: LocationLike,
  activeInspectorTab: string,
): string {
  const pathname = locationObj.pathname || '/';
  const params = sanitizePublicNavigationQuery(
    new URLSearchParams(locationObj.search.startsWith('?') ? locationObj.search.slice(1) : locationObj.search),
  );
  if (activeInspectorTab && activeInspectorTab !== 'OVERVIEW') {
    params.set('inspectorTab', activeInspectorTab);
  } else {
    params.delete('inspectorTab');
  }
  const qs = params.toString();
  const safeHash = sanitizeNavigationHash(locationObj.hash);
  return `${pathname}${qs ? `?${qs}` : ''}${safeHash}`;
}

/**
 * Single choke-point for all browser History API mutations across the app.
 */
export function commitManagedHistoryTransition(
  input: ManagedHistoryCommitInput,
): ManagedHistoryCommitResult {
  const historyObj = input.historyObj !== undefined
    ? input.historyObj
    : (typeof window !== 'undefined' ? window.history : null);
  const locationObj = input.locationObj !== undefined
    ? input.locationObj
    : (typeof window !== 'undefined' ? window.location : null);

  const currentFullUrl = readCurrentFullUrl(locationObj);

  if (input.mode === 'none') {
    return { committed: false, method: 'none', finalUrl: currentFullUrl, reason: 'mode_none' };
  }
  if (input.isPopStateRestore || isRestoringFromPopState) {
    return { committed: false, method: 'none', finalUrl: currentFullUrl, reason: 'popstate_restore' };
  }
  if (!historyObj) {
    return { committed: false, method: 'none', finalUrl: currentFullUrl, reason: 'unavailable' };
  }

  const rule = HISTORY_OWNERSHIP_MATRIX[input.domain];
  if (!rule.allowedModes.includes(input.mode)) {
    return { committed: false, method: 'none', finalUrl: currentFullUrl, reason: 'domain_violation' };
  }

  // Non-route domains must never alter pathname
  if (!rule.canMutatePathname && locationObj) {
    const targetParts = splitUrlParts(input.targetUrl);
    const currentPathname = locationObj.pathname || '/';
    if (targetParts.pathname !== currentPathname) {
      return { committed: false, method: 'none', finalUrl: currentFullUrl, reason: 'domain_violation' };
    }
  }

  const finalUrl = input.targetUrl;
  const allowSameUrlOverlayPush = input.mode === 'push_overlay_state';
  if (!allowSameUrlOverlayPush && finalUrl === currentFullUrl) {
    return { committed: false, method: 'none', finalUrl: currentFullUrl, reason: 'unchanged' };
  }

  try {
    if ((input.mode === 'push' || input.mode === 'push_overlay_state') && typeof historyObj.pushState === 'function') {
      historyObj.pushState(input.state ?? null, '', finalUrl);
      return { committed: true, method: 'pushState', finalUrl, reason: 'committed' };
    }
    if (typeof historyObj.replaceState === 'function') {
      historyObj.replaceState(input.state ?? null, '', finalUrl);
      return { committed: true, method: 'replaceState', finalUrl, reason: 'committed' };
    }
  } catch {
    // Ignore restricted iframe History API SecurityErrors
  }

  return { committed: false, method: 'none', finalUrl: currentFullUrl, reason: 'unavailable' };
}
