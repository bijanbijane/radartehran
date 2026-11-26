/**
 * Compatibility projection for legacy AppShell RouteDefinitions.
 * Canonical route metadata lives in PUBLIC_ROUTES and ADMIN_ROUTES; this file
 * derives the old registration shape so existing error-boundary consumers
 * do not maintain a competing route table.
 */
import type { AppShellLayoutKind } from '../application-shell';
import type { AppRole, PermissionKey } from '../../platform/auth';
import { ADMIN_ROUTES } from '../../navigation/registry/admin.routes';
import { PUBLIC_ROUTES } from '../../navigation/registry/public.routes';
import type { RouteDefinition } from '../../navigation/registry/route.types';

export interface RouteRegistration {
  id: string;
  path: string;
  canonicalRedirectPath?: string;
  titleFa: string;
  layout: AppShellLayoutKind;
  requiresAuth: boolean;
  guestOnly?: boolean;
  allowedRoles?: AppRole[];
  requiredPermissions?: PermissionKey[];
  lazyBoundary: boolean;
}

const CANONICAL_ROUTES: readonly RouteDefinition[] = [...PUBLIC_ROUTES, ...ADMIN_ROUTES];

function toRegistration(route: RouteDefinition, path: string, aliasIndex: number): RouteRegistration {
  const isAlias = aliasIndex > 0;
  const layout: AppShellLayoutKind = route.path === '/' ? 'main' : route.shell === 'admin' ? 'admin' : 'public';
  return {
    id: isAlias ? `${route.id}:alias:${aliasIndex}` : route.id,
    path,
    canonicalRedirectPath: isAlias ? route.path : undefined,
    titleFa: route.titleFa,
    layout,
    requiresAuth: route.shell === 'admin' || route.requiredPermissions.length > 0,
    requiredPermissions: [...route.requiredPermissions] as PermissionKey[],
    lazyBoundary: route.path !== '/',
  };
}

export const CENTRAL_ROUTE_REGISTRY: readonly RouteRegistration[] = CANONICAL_ROUTES.flatMap((route) => {
  const paths = [route.path, ...(route.aliases ?? [])];
  return paths.map((path, index) => toRegistration(route, path, index));
});

export function findRegisteredRoute(path: string): RouteRegistration | undefined {
  const normalized = path.replace(/\/+$/, '') || '/';
  const exact = CENTRAL_ROUTE_REGISTRY.find((route) => route.path === normalized);
  if (exact) return exact;
  return CENTRAL_ROUTE_REGISTRY
    .filter((route) => route.path !== '/' && normalized.startsWith(`${route.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
    ?? CENTRAL_ROUTE_REGISTRY.find((route) => route.path === '/');
}
