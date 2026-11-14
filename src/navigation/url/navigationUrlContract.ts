/** @file src/navigation/url/navigationUrlContract.ts — Path + Query URL & History Contract (RT-UI-NAV-001 Section 12) */
import { PUBLIC_ROUTES } from '../registry/public.routes';
import { ADMIN_ROUTES } from '../registry/admin.routes';
import type { ModuleSubTabId, RouteDestinationId, RouteDefinition } from '../registry/route.types';

const REGISTRY: readonly RouteDefinition[] = [...PUBLIC_ROUTES, ...ADMIN_ROUTES];

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
  admin: 'admin',
  not_found: 'not_found',
};

export interface ParsedNavigationLocation {
  viewId: RouteDestinationId;
  subTab?: ModuleSubTabId;
  areaSlug?: string;
  isUnknownPath: boolean;
  isLegacyTehranPath: boolean;
}

export function normalizePathname(pathname: string): string {
  const cleaned = String(pathname || '/').split('?')[0].split('#')[0].replace(/\/+$/, '');
  return cleaned === '' ? '/' : cleaned;
}

export function resolveRouteFromLocation(pathname: string, search: string): ParsedNavigationLocation {
  const normPath = normalizePathname(pathname);
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  // Legacy SEO Tehran routes (/tehran/{slug} & /tehran/compare/...) are handled by parseTehranPublicPath
  if (normPath.startsWith('/tehran/')) {
    return { viewId: 'home', isUnknownPath: false, isLegacyTehranPath: true };
  }

  // Dynamic /areas/:slug neighborhood scorecard route
  if (normPath.startsWith('/areas/')) {
    const slug = decodeURIComponent(normPath.slice('/areas/'.length)).trim();
    if (slug) {
      return { viewId: 'discover', areaSlug: slug, isUnknownPath: false, isLegacyTehranPath: false };
    }
  }

  // Exact registry path or alias match
  const matched = REGISTRY.find((r) => r.path === normPath || (r.aliases && r.aliases.includes(normPath)));
  if (matched) {
    // Allow explicit sub-path tab resolution on /services/*, /knowledge/*, /contributions/*
    const segments = normPath.split('/').filter(Boolean);
    let resolvedSub = matched.subTab;
    if (segments.length >= 2 && (matched.viewId === 'services' || matched.viewId === 'knowledge' || matched.viewId === 'contributions')) {
      resolvedSub = segments[1].replace(/-/g, '_') as ModuleSubTabId;
    }
    const queryView = params.get('view')?.trim().toLowerCase();
    if (normPath === '/' && queryView && VIEW_ALIASES[queryView]) {
      const subParam = params.get('tab')?.trim() as ModuleSubTabId | undefined;
      return { viewId: VIEW_ALIASES[queryView], subTab: subParam, isUnknownPath: false, isLegacyTehranPath: false };
    }
    return { viewId: matched.viewId, subTab: resolvedSub, isUnknownPath: false, isLegacyTehranPath: false };
  }

  // Legacy ?view= query support on root path
  const qView = params.get('view')?.trim().toLowerCase();
  if (normPath === '/' && qView && VIEW_ALIASES[qView]) {
    const subParam = params.get('tab')?.trim() as ModuleSubTabId | undefined;
    return { viewId: VIEW_ALIASES[qView], subTab: subParam, isUnknownPath: false, isLegacyTehranPath: false };
  }

  // Fallback check: non-root unrecognized path -> 404 not_found route
  if (normPath !== '/') {
    return { viewId: 'not_found', isUnknownPath: true, isLegacyTehranPath: false };
  }

  return { viewId: 'map', isUnknownPath: false, isLegacyTehranPath: false };
}

export function buildCanonicalPathForDestination(viewId: RouteDestinationId, subTab?: ModuleSubTabId): string {
  if (subTab) {
    const exact = REGISTRY.find((r) => r.viewId === viewId && r.subTab === subTab);
    if (exact) return exact.path;
    if (viewId === 'services' || viewId === 'knowledge' || viewId === 'contributions') {
      return `/${viewId}/${String(subTab).replace(/_/g, '-')}`;
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
