/**
 * RT-FE-NAVIGATION-ARCHITECTURE-014 — Canonical unified navigation registry (single owner).
 */
import { ADMIN_ROUTES } from './admin.routes';
import { PUBLIC_ROUTES } from './public.routes';
import type { ModuleSubTabId, RouteDefinition, RouteDestinationId } from './route.types';

export type UnifiedRouteDefinition = RouteDefinition & {
  iconId?: string;
  navPriority: number;
  searchKeywordsFa: readonly string[];
  searchKeywordsEn: readonly string[];
  requiredRoles: readonly string[];
  featureFlag?: string;
  activeMatchPrefixes: readonly string[];
};

const VIEW_ICON: Record<RouteDestinationId, string> = {
  home: 'home',
  map: 'map',
  discover: 'compass',
  intelligence: 'trending-up',
  properties: 'building-2',
  tools: 'sliders-horizontal',
  userspace: 'user',
  services: 'briefcase',
  knowledge: 'book-open',
  contributions: 'users',
  admin: 'shield-alert',
  not_found: 'circle-off',
};

const VIEW_PRIORITY: Partial<Record<RouteDestinationId, number>> = {
  map: 10,
  discover: 20,
  intelligence: 30,
  properties: 40,
  tools: 50,
  services: 60,
  knowledge: 70,
  contributions: 80,
  userspace: 90,
  admin: 100,
  home: 5,
  not_found: 999,
};

function enrichRoute(route: RouteDefinition): UnifiedRouteDefinition {
  const baseKeywordsFa = [route.titleFa, route.breadcrumbFa].filter(Boolean);
  const baseKeywordsEn = [route.titleEn, route.breadcrumbEn].filter(Boolean);
  return {
    ...route,
    iconId: VIEW_ICON[route.viewId],
    navPriority: VIEW_PRIORITY[route.viewId] ?? 200,
    searchKeywordsFa: baseKeywordsFa,
    searchKeywordsEn: baseKeywordsEn,
    requiredRoles: [],
    activeMatchPrefixes: [route.path, ...(route.aliases ?? [])],
  };
}

export const UNIFIED_NAVIGATION_ROUTES: readonly UnifiedRouteDefinition[] = [
  ...PUBLIC_ROUTES.map(enrichRoute),
  ...ADMIN_ROUTES.map(enrichRoute),
] as const;

export const UNIFIED_NAVIGATION_ROUTE_COUNT = UNIFIED_NAVIGATION_ROUTES.length;

export interface NavigationRegistryAuditIssue {
  code: 'DUPLICATE_PATH' | 'DUPLICATE_ID' | 'ALIAS_COLLISION' | 'ORPHAN_PARENT' | 'DISABLED_CANONICAL';
  routeId: string;
  detail: string;
}

export function auditNavigationRegistryIntegrity(): NavigationRegistryAuditIssue[] {
  const issues: NavigationRegistryAuditIssue[] = [];
  const pathOwners = new Map<string, string>();
  const ids = new Set<string>();
  const byId = new Map(UNIFIED_NAVIGATION_ROUTES.map((r) => [r.id, r]));

  for (const route of UNIFIED_NAVIGATION_ROUTES) {
    if (ids.has(route.id)) {
      issues.push({ code: 'DUPLICATE_ID', routeId: route.id, detail: `Duplicate route id ${route.id}` });
    }
    ids.add(route.id);

    const paths = [route.path, ...(route.aliases ?? [])];
    for (const p of paths) {
      const prev = pathOwners.get(p);
      if (prev && prev !== route.id) {
        issues.push({
          code: 'ALIAS_COLLISION',
          routeId: route.id,
          detail: `Path or alias ${p} owned by both ${prev} and ${route.id}`,
        });
      } else {
        pathOwners.set(p, route.id);
      }
    }

    if (route.parentId && !byId.has(route.parentId)) {
      issues.push({
        code: 'ORPHAN_PARENT',
        routeId: route.id,
        detail: `parentId ${route.parentId} is missing`,
      });
    }

    if (route.status === 'disabled' && route.mobileVisibility === 'bottom_bar') {
      issues.push({
        code: 'DISABLED_CANONICAL',
        routeId: route.id,
        detail: 'Disabled route exposed on bottom bar',
      });
    }
  }

  for (const route of UNIFIED_NAVIGATION_ROUTES) {
    if (pathOwners.get(route.path) !== route.id) {
      issues.push({
        code: 'DUPLICATE_PATH',
        routeId: route.id,
        detail: `Canonical path ${route.path} has conflicting owner`,
      });
    }
  }

  return issues;
}

export function findUnifiedRouteById(id: string): UnifiedRouteDefinition | undefined {
  return UNIFIED_NAVIGATION_ROUTES.find((r) => r.id === id);
}

export function findUnifiedRouteByPath(pathname: string): UnifiedRouteDefinition | undefined {
  return UNIFIED_NAVIGATION_ROUTES.find(
    (r) => r.path === pathname || (r.aliases?.includes(pathname) ?? false),
  );
}

export function listUnifiedRoutesByView(viewId: RouteDestinationId): UnifiedRouteDefinition[] {
  return UNIFIED_NAVIGATION_ROUTES.filter((r) => r.viewId === viewId && r.status !== 'disabled');
}

export function resolveNavigationOwnership(pathname: string): {
  owner: 'unified_navigation' | 'dynamic';
  route?: UnifiedRouteDefinition;
} {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const unified = findUnifiedRouteByPath(normalized);
  if (unified) return { owner: 'unified_navigation', route: unified };
  if (
    normalized.startsWith('/areas/') ||
    normalized.startsWith('/neighborhoods/') ||
    normalized.startsWith('/community/members/') ||
    normalized.startsWith('/properties/') ||
    normalized.startsWith('/knowledge/articles/') ||
    normalized.startsWith('/services/providers/')
  ) {
    return { owner: 'dynamic' };
  }
  return { owner: 'unified_navigation' };
}

export function buildCanonicalPathForView(viewId: RouteDestinationId, subTab?: ModuleSubTabId): string {
  if (subTab) {
    const exact = UNIFIED_NAVIGATION_ROUTES.find((r) => r.viewId === viewId && r.subTab === subTab && r.status !== 'disabled');
    if (exact) return exact.path;
  }
  const primary = UNIFIED_NAVIGATION_ROUTES.find((r) => r.viewId === viewId && !r.subTab && r.status !== 'disabled');
  return primary?.path ?? '/';
}