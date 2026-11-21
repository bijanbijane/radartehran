/** @file src/navigation/url/navigationUrlContract.ts — Path + Query URL & History Contract (RT-UI-NAV-001 Section 12) */
import { UNIFIED_NAVIGATION_ROUTES } from '../registry/unifiedNavigationRegistry';
import type { ModuleSubTabId, RouteDestinationId, RouteDefinition } from '../registry/route.types';

const REGISTRY: readonly RouteDefinition[] = UNIFIED_NAVIGATION_ROUTES;

const VIEW_ALIASES: Record<string, RouteDestinationId> = {
  home: 'home',
  map: 'map',
  discover: 'discover',
  intelligence: 'intelligence',
  properties: 'properties',
  tools: 'tools',
  userspace: 'userspace',
  account: 'userspace',
  services: 'services',
  knowledge: 'knowledge',
  contributions: 'contributions',
  community: 'contributions',
  admin: 'admin',
  not_found: 'not_found',
};

export interface ParsedNavigationLocation {
  viewId: RouteDestinationId;
  subTab?: ModuleSubTabId;
  areaSlug?: string;
  memberUsername?: string;
  isUnknownPath: boolean;
  isLegacyTehranPath: boolean;
}

function safeDecodeSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
}

export function normalizePathname(pathname: string): string {
  const cleaned = String(pathname || '/')
    .split('?')[0]
    .split('#')[0]
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '');
  return cleaned === '' ? '/' : cleaned;
}

function decodeStaticPathnameSegments(normPath: string): string | null {
  if (!normPath.includes('%')) return normPath;
  const rawSegments = normPath.split('/').filter(Boolean);
  const decodedSegments: string[] = [];
  for (const seg of rawSegments) {
    const decoded = safeDecodeSegment(seg);
    if (!decoded || decoded.includes('/')) return null;
    decodedSegments.push(decoded);
  }
  return decodedSegments.length === 0 ? '/' : `/${decodedSegments.join('/')}`;
}

export function resolveRouteFromLocation(pathname: string, search: string): ParsedNavigationLocation {
  const normPath = normalizePathname(pathname);
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  // Legacy SEO Tehran routes (/tehran/{slug} & /tehran/compare/...) are handled by parseTehranPublicPath
  if (normPath.startsWith('/tehran/')) {
    const queryView = params.get('view')?.trim().toLowerCase();
    if (queryView && VIEW_ALIASES[queryView]) {
      const subParam = params.get('tab')?.trim() as ModuleSubTabId | undefined;
      return { viewId: VIEW_ALIASES[queryView], subTab: subParam, isUnknownPath: false, isLegacyTehranPath: true };
    }
    return { viewId: 'home', isUnknownPath: false, isLegacyTehranPath: true };
  }

  // Legacy /neighborhoods/:slug (IA-002) → discover scorecard slug
  if (normPath.startsWith('/neighborhoods/')) {
    const slug = safeDecodeSegment(normPath.slice('/neighborhoods/'.length));
    if (slug && !slug.includes('/')) {
      return { viewId: 'discover', areaSlug: slug, isUnknownPath: false, isLegacyTehranPath: false };
    }
    return { viewId: 'not_found', isUnknownPath: true, isLegacyTehranPath: false };
  }

  // Dynamic /areas/:slug neighborhood scorecard route
  if (normPath.startsWith('/areas/')) {
    const slug = safeDecodeSegment(normPath.slice('/areas/'.length));
    if (slug) {
      return { viewId: 'discover', areaSlug: slug, isUnknownPath: false, isLegacyTehranPath: false };
    }
    return { viewId: 'not_found', isUnknownPath: true, isLegacyTehranPath: false };
  }

  // Dynamic /community/members/:username member profile route (§25.2)
  if (normPath.startsWith('/community/members/')) {
    const rawRest = normPath.slice('/community/members/'.length);
    if (rawRest.includes('/')) {
      return { viewId: 'not_found', isUnknownPath: true, isLegacyTehranPath: false };
    }
    const username = safeDecodeSegment(rawRest);
    if (!username || username.includes('/')) {
      return { viewId: 'not_found', isUnknownPath: true, isLegacyTehranPath: false };
    }
    return { viewId: 'contributions', subTab: 'members', memberUsername: username, isUnknownPath: false, isLegacyTehranPath: false };
  }

  // Exact registry path or alias match (supports valid percent-encoded static segments safely)
  const candidatePath = decodeStaticPathnameSegments(normPath);
  if (candidatePath === null) {
    return { viewId: 'not_found', isUnknownPath: true, isLegacyTehranPath: false };
  }

  const matched = REGISTRY.find(
    (r) => r.path === candidatePath || (r.aliases && r.aliases.includes(candidatePath)),
  );
  if (matched) {
    const segments = candidatePath.split('/').filter(Boolean);
    let resolvedSub = matched.subTab;
    // Only derive alias sub-tab from path segment for grouped services/knowledge routes (contributions has explicit RouteDefinitions)
    if (segments.length >= 2 && (matched.viewId === 'services' || matched.viewId === 'knowledge')) {
      resolvedSub = segments[1].replace(/-/g, '_') as ModuleSubTabId;
    }
    const queryView = params.get('view')?.trim().toLowerCase();
    if (candidatePath === '/' && queryView && VIEW_ALIASES[queryView]) {
      const subParam = params.get('tab')?.trim() as ModuleSubTabId | undefined;
      return { viewId: VIEW_ALIASES[queryView], subTab: subParam, isUnknownPath: false, isLegacyTehranPath: false };
    }
    return { viewId: matched.viewId, subTab: resolvedSub, isUnknownPath: false, isLegacyTehranPath: false };
  }

  // Legacy ?view= query support on root path
  const qView = params.get('view')?.trim().toLowerCase();
  if (candidatePath === '/' && qView && VIEW_ALIASES[qView]) {
    const subParam = params.get('tab')?.trim() as ModuleSubTabId | undefined;
    return { viewId: VIEW_ALIASES[qView], subTab: subParam, isUnknownPath: false, isLegacyTehranPath: false };
  }

  // Fallback check: non-root unrecognized path -> 404 not_found route
  if (candidatePath !== '/') {
    return { viewId: 'not_found', isUnknownPath: true, isLegacyTehranPath: false };
  }

  return { viewId: 'map', isUnknownPath: false, isLegacyTehranPath: false };
}

export function buildCanonicalPathForDestination(viewId: RouteDestinationId, subTab?: ModuleSubTabId): string {
  if (subTab) {
    const exact = REGISTRY.find((r) => r.viewId === viewId && r.subTab === subTab);
    if (exact) return exact.path;
    if (viewId === 'services' || viewId === 'knowledge') {
      const candidateAlias = `/${viewId}/${String(subTab).replace(/_/g, '-')}`;
      const matchedAlias = REGISTRY.find((r) => r.viewId === viewId && r.aliases?.includes(candidateAlias));
      if (matchedAlias) return candidateAlias;
    }
  }
  const primary = REGISTRY.find((r) => r.viewId === viewId);
  return primary?.path || '/';
}

const SENSITIVE_QUERY_KEYS = ['phone', 'email', 'token', 'password', 'secret', 'adminPass'];

export function sanitizePublicNavigationQuery(params: URLSearchParams): URLSearchParams {
  const safe = new URLSearchParams();
  params.forEach((value, key) => {
    if (!SENSITIVE_QUERY_KEYS.some((bad) => key.toLowerCase().includes(bad.toLowerCase()))) {
      safe.set(key, value);
    }
  });
  return safe;
}

export function sanitizeNavigationHash(rawHash?: string | null): string {
  if (!rawHash || typeof rawHash !== 'string') return '';
  const trimmed = rawHash.trim();
  if (!trimmed.startsWith('#') || trimmed.length <= 1 || trimmed.length > 160) return '';
  if (/[\s<>"'`\\]/.test(trimmed)) return '';
  return trimmed;
}

export interface BuildSynchronizedNavigationUrlInput {
  canonicalPath: string;
  currentSearch?: string;
  currentHash?: string;
  isRouteChange: boolean;
  activeCity: string;
  selectedHoodId?: number;
  keepBudget?: boolean;
  budget?: {
    mode: string;
    deposit: number;
    monthlyRent: number;
    buyTotalBudget: number;
    targetSqm: number;
  };
}

export function buildSynchronizedNavigationUrl(input: BuildSynchronizedNavigationUrlInput): string {
  const sp = input.isRouteChange
    ? new URLSearchParams()
    : sanitizePublicNavigationQuery(
        new URLSearchParams(
          input.currentSearch?.startsWith('?') ? input.currentSearch.slice(1) : (input.currentSearch || ''),
        ),
      );
  // Strip legacy root view/tab query params once canonical path represents the route
  sp.delete('view');
  sp.delete('tab');

  if (input.activeCity !== 'tehran') {
    sp.set('city', input.activeCity);
  } else {
    sp.delete('city');
  }
  if (typeof input.selectedHoodId === 'number' && Number.isFinite(input.selectedHoodId)) {
    sp.set('hood', String(input.selectedHoodId));
  }
  if (input.keepBudget && input.budget) {
    sp.set('mode', input.budget.mode);
    sp.set('dep', String(input.budget.deposit));
    sp.set('rent', String(input.budget.monthlyRent));
    sp.set('buy', String(input.budget.buyTotalBudget));
    sp.set('sqm', String(input.budget.targetSqm));
  }
  const safeQuery = sanitizePublicNavigationQuery(sp).toString();
  const safeHash = input.isRouteChange ? '' : sanitizeNavigationHash(input.currentHash);
  return `${input.canonicalPath}${safeQuery ? `?${safeQuery}` : ''}${safeHash}`;
}
