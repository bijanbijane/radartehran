/**
 * RT-FE-NAVIGATION-ARCHITECTURE-014 — Active-state matching from registry metadata.
 */
import type { ModuleSubTabId, RouteDestinationId } from './route.types';
import {
  findUnifiedRouteByPath,
  UNIFIED_NAVIGATION_ROUTES,
  type UnifiedRouteDefinition,
} from './unifiedNavigationRegistry';
import { normalizePathname } from '../url/navigationUrlContract';

export interface NavigationActiveContext {
  pathname: string;
  viewId: RouteDestinationId;
  subTab?: ModuleSubTabId;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isUnifiedRouteActive(route: UnifiedRouteDefinition, ctx: NavigationActiveContext): boolean {
  const norm = normalizePathname(ctx.pathname);
  const pathHit = route.activeMatchPrefixes.some((p) => matchesPrefix(norm, p));
  if (!pathHit) return false;
  if (route.subTab && ctx.subTab && route.subTab !== ctx.subTab) return false;
  if (route.viewId !== ctx.viewId && !pathHit) return false;
  return route.viewId === ctx.viewId || pathHit;
}

export function resolveActiveUnifiedRoute(ctx: NavigationActiveContext): UnifiedRouteDefinition | undefined {
  const norm = normalizePathname(ctx.pathname);
  const direct = findUnifiedRouteByPath(norm);
  if (direct && isUnifiedRouteActive(direct, ctx)) return direct;
  const candidates = [...UNIFIED_NAVIGATION_ROUTES]
    .filter((r) => r.activeMatchPrefixes.some((p) => matchesPrefix(norm, p)))
    .sort((a, b) => b.path.length - a.path.length);
  return candidates.find((r) => isUnifiedRouteActive(r, ctx));
}