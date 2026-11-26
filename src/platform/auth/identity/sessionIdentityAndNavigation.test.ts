import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIdentity } from './identityResolver';
import { resolveProfile } from './profileResolver';
import { resolveRoleAndPermissions } from '../authorization/permissionResolver';
import { buildNavigationVisibilityContext, expandPlatformPermissionsForNavigation } from '../../../navigation/registry/navigationPermissionBridge';
import { canViewNavigationEntry, filterVisibleNavigationRoutes } from '../../../navigation/registry/navigationVisibility';
import {
  buildNavigationDiscoveryCatalog,
  searchNavigationDiscovery,
} from '../../../navigation/discovery/navigationDiscoveryCatalog';
import { UNIFIED_NAVIGATION_ROUTES } from '../../../navigation/registry/unifiedNavigationRegistry';

test('RT-FE-NAV-017: profile display fields never grant admin navigation permissions', () => {
  const identity = resolveIdentity({
    uid: 'u-regular',
    email: 'user@example.com',
    phoneNumber: null,
    displayName: 'ادمین جعلی',
    emailVerified: true,
    customClaims: {},
  });
  const access = resolveRoleAndPermissions(identity, resolveProfile(identity));
  assert.equal(access.activeRole, 'buyer');
  assert.equal(access.permissions.includes('admin:governance'), false);

  const navCtx = buildNavigationVisibilityContext({
    state: 'READY',
    permissions: access.permissions,
    activeRole: access.activeRole,
  });
  const adminOverview = UNIFIED_NAVIGATION_ROUTES.find((r) => r.id === 'admin.overview');
  assert.ok(adminOverview);
  assert.equal(canViewNavigationEntry(adminOverview!, navCtx), false);
});

test('RT-FE-NAV-017: administrator claims map to privileged navigation only when READY', () => {
  const identity = resolveIdentity({
    uid: 'u-admin',
    email: 'ops@tehranradar.ir',
    phoneNumber: null,
    displayName: 'Ops',
    emailVerified: true,
    customClaims: { role: 'admin', roles: ['admin'], permissionVersion: 2 },
  });
  const access = resolveRoleAndPermissions(identity, resolveProfile(identity));
  assert.equal(access.activeRole, 'admin');
  const readyNav = buildNavigationVisibilityContext({
    state: 'READY',
    permissions: access.permissions,
    activeRole: access.activeRole,
  });
  assert.ok(expandPlatformPermissionsForNavigation(access.permissions, 'admin').includes('admin:access'));

  const resolvingNav = buildNavigationVisibilityContext({
    state: 'RESOLVING_ACCESS',
    permissions: access.permissions,
    activeRole: access.activeRole,
  });
  assert.equal(resolvingNav.userPermissions.includes('admin:access'), false);

  const refreshNav = buildNavigationVisibilityContext({
    state: 'TOKEN_REFRESHING',
    permissions: access.permissions,
    activeRole: access.activeRole,
  });
  assert.ok(refreshNav.userPermissions.includes('admin:access'));
});

test('RT-FE-NAV-017: missing claims default to regular buyer without privileged navigation', () => {
  const identity = resolveIdentity({
    uid: 'u-no-claims',
    email: 'buyer@example.com',
    phoneNumber: null,
    displayName: null,
    emailVerified: true,
    customClaims: {},
  });
  const access = resolveRoleAndPermissions(identity, resolveProfile(identity));
  assert.equal(access.activeRole, 'buyer');
  const ctx = buildNavigationVisibilityContext({
    state: 'READY',
    permissions: access.permissions,
    activeRole: access.activeRole,
  });
  assert.equal(ctx.userPermissions.includes('admin:access'), false);
  const adminRoutes = UNIFIED_NAVIGATION_ROUTES.filter((r) => r.shell === 'admin');
  assert.equal(adminRoutes.some((r) => canViewNavigationEntry(r, ctx)), false);
});

test('RT-FE-NAV-017: global search discovery respects token-derived navigation context', () => {
  const buyerIdentity = resolveIdentity({
    uid: 'u-buyer',
    email: 'b@example.com',
    phoneNumber: null,
    displayName: null,
    emailVerified: true,
    customClaims: { role: 'buyer' },
  });
  const buyerAccess = resolveRoleAndPermissions(buyerIdentity, resolveProfile(buyerIdentity));
  const buyerCtx = buildNavigationVisibilityContext({
    state: 'READY',
    permissions: buyerAccess.permissions,
    activeRole: buyerAccess.activeRole,
  });
  const buyerSearch = searchNavigationDiscovery('admin', buyerCtx);
  assert.equal(buyerSearch.pages.some((p) => p.href.startsWith('/admin')), false);

  const adminIdentity = resolveIdentity({
    uid: 'u-admin-2',
    email: 'admin@example.com',
    phoneNumber: null,
    displayName: null,
    emailVerified: true,
    customClaims: { role: 'admin', roles: ['admin'] },
  });
  const adminAccess = resolveRoleAndPermissions(adminIdentity, resolveProfile(adminIdentity));
  const adminCtx = buildNavigationVisibilityContext({
    state: 'READY',
    permissions: adminAccess.permissions,
    activeRole: adminAccess.activeRole,
  });
  const adminShellRoutes = UNIFIED_NAVIGATION_ROUTES.filter((r) => r.shell === 'admin');
  assert.ok(filterVisibleNavigationRoutes(adminShellRoutes, adminCtx).some((r) => r.path === '/admin'));
  assert.equal(filterVisibleNavigationRoutes(adminShellRoutes, buyerCtx).length, 0);
  const buyerDiscovery = buildNavigationDiscoveryCatalog(buyerCtx);
  assert.equal(buyerDiscovery.commands.some((c) => c.requiredPermissions?.includes('admin:access')), false);
});

test('RT-FE-NAV-017: account role switch uses distinct claim sets (no cross-user privilege bleed)', () => {
  const userA = ({ role: 'admin', roles: ['admin'] });
  const userB = ({ role: 'buyer', roles: ['buyer'] });
  const accessA = resolveRoleAndPermissions(
    resolveIdentity({ uid: 'a', email: 'a@x.com', phoneNumber: null, displayName: null, emailVerified: true, customClaims: userA }),
    resolveProfile(null),
  );
  const accessB = resolveRoleAndPermissions(
    resolveIdentity({ uid: 'b', email: 'b@x.com', phoneNumber: null, displayName: null, emailVerified: true, customClaims: userB }),
    resolveProfile(null),
  );
  assert.equal(accessA.activeRole, 'admin');
  assert.equal(accessB.activeRole, 'buyer');
  assert.equal(accessA.permissions.includes('admin:governance'), true);
  assert.equal(accessB.permissions.includes('admin:governance'), false);
});

test('RT-FE-NAV-017: expired session and logout-equivalent states clear privileged grants', () => {
  const adminPerms = resolveRoleAndPermissions(
    resolveIdentity({
      uid: 'u-admin',
      email: null,
      phoneNumber: null,
      displayName: null,
      emailVerified: true,
      customClaims: { role: 'admin' },
    }),
    resolveProfile(null),
  ).permissions;

  const expired = buildNavigationVisibilityContext({
    state: 'SESSION_EXPIRED',
    permissions: adminPerms,
    activeRole: 'admin',
  });
  assert.equal(expired.userPermissions.includes('admin:access'), false);
  assert.equal(expired.isAuthenticated, false);
});