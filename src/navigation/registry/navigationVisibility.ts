/**
 * RT-FE-NAVIGATION-ARCHITECTURE-014 — UI visibility hints (backend remains authoritative).
 */
import type { UnifiedRouteDefinition } from './unifiedNavigationRegistry';

export interface NavigationVisibilityContext {
  authReady: boolean;
  isAuthenticated: boolean;
  userPermissions: readonly string[];
  userRoles: readonly string[];
  enabledFeatures: Readonly<Record<string, boolean>>;
}

export function canViewNavigationEntry(route: UnifiedRouteDefinition, ctx: NavigationVisibilityContext): boolean {
  if (!ctx.authReady) return route.requiredPermissions.length === 0;
  if (route.status === 'disabled') return false;
  if (route.featureFlag && ctx.enabledFeatures[route.featureFlag] === false) return false;
  for (const perm of route.requiredPermissions) {
    if (!ctx.userPermissions.includes(perm)) return false;
  }
  if (route.requiredRoles.length > 0) {
    const roleOk = route.requiredRoles.some((role) => ctx.userRoles.includes(role));
    if (!roleOk) return false;
  }
  return true;
}

export function filterVisibleNavigationRoutes(
  routes: readonly UnifiedRouteDefinition[],
  ctx: NavigationVisibilityContext,
): UnifiedRouteDefinition[] {
  return routes.filter((r) => canViewNavigationEntry(r, ctx));
}