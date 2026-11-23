/**
 * RT-FE-NAVIGATION-015/016 — Map platform auth grants to navigation registry tokens (presentation only).
 */
import type { AuthLifecycleState } from '../../platform/auth/core/authState';
import {
  GUEST_BASELINE_PERMISSIONS as PLATFORM_GUEST_BASELINE,
  type PermissionKey,
} from '../../platform/auth/authorization/permissionResolver';
import type { AppRole } from '../../platform/auth/authorization/roleResolver';
import type { NavigationVisibilityContext } from './navigationVisibility';

export const GUEST_BASELINE_PERMISSIONS: readonly PermissionKey[] = [...PLATFORM_GUEST_BASELINE];

/**
 * UI registry admin tokens ← platform PermissionKey (least-privilege; roles may still grant admin:access).
 */
const NAV_PERMISSION_SATISFIERS: Readonly<Record<string, readonly PermissionKey[]>> = {
  'admin:access': ['admin:dashboard:view', 'admin:governance'],
  'admin:content': ['admin:moderation:approve'],
  'admin:data': ['admin:governance'],
  'admin:users': ['admin:permissions:manage'],
  'admin:operations': ['admin:governance'],
  'admin:security': ['admin:permissions:manage', 'admin:governance'],
};

const ADMIN_ROLES = new Set<AppRole>(['admin', 'platform_admin']);

const AUTH_READY_STATES = new Set<AuthLifecycleState>(['READY', 'TOKEN_REFRESHING', 'REAUTH_REQUIRED']);

const NAV_PRIVILEGE_RESET_STATES = new Set<AuthLifecycleState>([
  'INITIALIZING',
  'UNAUTHENTICATED',
  'AUTHENTICATED',
  'RESOLVING_ACCESS',
  'SESSION_EXPIRED',
  'ACCESS_DENIED',
]);

export function expandPlatformPermissionsForNavigation(
  platformPermissions: readonly PermissionKey[],
  activeRole: AppRole,
  legacyPermissionAliases: readonly string[] = [],
): string[] {
  const expanded = new Set<string>(platformPermissions);

  for (const alias of legacyPermissionAliases) {
    expanded.add(alias);
    if (alias === 'admin.access') expanded.add('admin:access');
    if (alias === 'admin.access' || alias === 'admin:access') expanded.add('admin.access');
  }

  if (ADMIN_ROLES.has(activeRole)) {
    expanded.add('admin:access');
    expanded.add('admin.access');
    for (const navPerm of Object.keys(NAV_PERMISSION_SATISFIERS)) {
      expanded.add(navPerm);
    }
  }

  for (const [navPerm, satisfiers] of Object.entries(NAV_PERMISSION_SATISFIERS)) {
    if (satisfiers.some((s) => expanded.has(s))) {
      expanded.add(navPerm);
    }
  }

  return [...expanded];
}

export function buildNavigationVisibilityContext(params: {
  readonly state: AuthLifecycleState;
  readonly permissions: readonly PermissionKey[];
  readonly activeRole: AppRole;
  readonly enabledFeatures?: Readonly<Record<string, boolean>>;
}): NavigationVisibilityContext {
  const { state, permissions, activeRole, enabledFeatures = {} } = params;
  const authReady = AUTH_READY_STATES.has(state);
  const isAuthenticated =
    state !== 'UNAUTHENTICATED' && state !== 'INITIALIZING' && state !== 'SESSION_EXPIRED';

  const privilegeReset = NAV_PRIVILEGE_RESET_STATES.has(state) || !authReady;
  const effectivePermissions = privilegeReset ? GUEST_BASELINE_PERMISSIONS : permissions;
  const effectiveRole: AppRole = privilegeReset ? 'guest' : activeRole;

  const userPermissions = expandPlatformPermissionsForNavigation(effectivePermissions, effectiveRole);
  const userRoles =
    AUTH_READY_STATES.has(state) && ADMIN_ROLES.has(activeRole)
      ? [activeRole]
      : effectiveRole === 'guest'
        ? []
        : [effectiveRole];

  return { authReady, isAuthenticated, userPermissions, userRoles, enabledFeatures };
}

/** Deliberate anonymous / pre-auth baseline for static callers and tests. */
export function guestNavigationVisibilityContext(): NavigationVisibilityContext {
  return buildNavigationVisibilityContext({
    state: 'UNAUTHENTICATED',
    permissions: [...GUEST_BASELINE_PERMISSIONS],
    activeRole: 'guest',
  });
}

export function mergeLegacyDiscoveryPermissions(userPermissions: readonly string[]): {
  readonly platformPermissions: PermissionKey[];
  readonly legacyAliases: string[];
  readonly activeRole: AppRole;
} {
  const platformPermissions = userPermissions.filter((p): p is PermissionKey => p.includes(':'));
  const legacyAliases = userPermissions.filter((p) => !p.includes(':'));
  const activeRole: AppRole =
    legacyAliases.includes('admin.access') ||
    platformPermissions.includes('admin:dashboard:view') ||
    platformPermissions.includes('admin:governance') ||
    platformPermissions.includes('admin:permissions:manage')
      ? 'admin'
      : 'guest';
  return { platformPermissions, legacyAliases, activeRole };
}