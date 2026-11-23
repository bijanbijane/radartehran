/**
 * RT-FE-NAVIGATION-015 — Primary shell views derived from UNIFIED_NAVIGATION_ROUTES.
 */
import type { RouteDestinationId } from './route.types';
import { UNIFIED_NAVIGATION_ROUTES, type UnifiedRouteDefinition } from './unifiedNavigationRegistry';

/** Preserves RT-UI-NAV-001 primary chrome ordering (bottom bar + header). */
export const PRIMARY_SHELL_VIEW_ORDER: readonly RouteDestinationId[] = [
  'home',
  'discover',
  'map',
  'intelligence',
  'tools',
  'userspace',
  'properties',
  'admin',
];

export function getCanonicalRouteForPrimaryView(viewId: RouteDestinationId): UnifiedRouteDefinition | undefined {
  const rootCandidates = UNIFIED_NAVIGATION_ROUTES.filter(
    (r) => r.viewId === viewId && !r.subTab && r.status !== 'disabled',
  );
  if (rootCandidates.length > 0) {
    return [...rootCandidates].sort((a, b) => a.navPriority - b.navPriority)[0];
  }
  return UNIFIED_NAVIGATION_ROUTES.find((r) => r.viewId === viewId && r.status !== 'disabled');
}