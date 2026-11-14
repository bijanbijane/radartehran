/** @file src/navigation/navigationArchitecture.test.ts — Fast Node unit tests for RT-UI-NAV-001 & RT-UI-LAYOUT-001 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_ROUTES } from './registry/public.routes';
import { ADMIN_ROUTES, ADMIN_SIDEBAR_SECTIONS } from './registry/admin.routes';
import {
  buildCanonicalPathForDestination,
  resolveRouteFromLocation,
  sanitizePublicNavigationQuery,
} from './url/navigationUrlContract';
import { buildNavigationBreadcrumbs } from './contextual/breadcrumb';
import { DESKTOP_MEGA_MENU_GROUPS } from './primary/megaMenuAndTabsConfig';
import { resolveMapToolVisualState, toggleMapContextPanel } from './map/mapToolRailConfig';
import {
  LAYOUT_CONTRACT_REGISTRY,
  SPACING_SCALE_PX,
  resolveLayoutContractForView,
  resolveViewContainerClass,
} from '../layout-system/contracts/layoutRegistry';

test('NAV-011: Admin routes stay strictly isolated from public registry and Mega Menu', () => {
  assert.equal(PUBLIC_ROUTES.some((r) => r.shell === 'admin' || r.viewId === 'admin'), false);
  assert.equal(ADMIN_ROUTES.every((r) => r.shell === 'admin' && r.requiredPermissions.includes('admin:access')), true);
  assert.equal(ADMIN_SIDEBAR_SECTIONS.length, 6);

  const megaItemIds = DESKTOP_MEGA_MENU_GROUPS.flatMap((g) => g.items.map((i) => i.viewId));
  assert.equal(megaItemIds.includes('admin'), false, 'Admin must never appear in Desktop Mega Menu');
});

test('Public route paths are unique and support URL round-trip resolution + 404 fallback', () => {
  const seenPaths = new Set<string>();
  for (const r of [...PUBLIC_ROUTES, ...ADMIN_ROUTES]) {
    assert.equal(seenPaths.has(r.path), false, `Duplicate route path: ${r.path}`);
    seenPaths.add(r.path);
  }

  assert.deepEqual(resolveRouteFromLocation('/explore/map', ''), {
    viewId: 'map',
    subTab: undefined,
    isUnknownPath: false,
    isLegacyTehranPath: false,
  });
  assert.equal(resolveRouteFromLocation('/areas', '').viewId, 'discover');
  const slugRoute = resolveRouteFromLocation('/areas/saadat-abad', '');
  assert.equal(slugRoute.viewId, 'discover');
  assert.equal(slugRoute.areaSlug, 'saadat-abad');

  assert.deepEqual(resolveRouteFromLocation('/market/prices', ''), {
    viewId: 'intelligence',
    subTab: 'prices',
    isUnknownPath: false,
    isLegacyTehranPath: false,
  });
  assert.deepEqual(resolveRouteFromLocation('/properties/rent', ''), {
    viewId: 'properties',
    subTab: 'rent',
    isUnknownPath: false,
    isLegacyTehranPath: false,
  });
  assert.deepEqual(resolveRouteFromLocation('/tools/valuation', ''), {
    viewId: 'tools',
    subTab: 'valuation',
    isUnknownPath: false,
    isLegacyTehranPath: false,
  });
  assert.equal(resolveRouteFromLocation('/admin/security', '').viewId, 'admin');
  assert.equal(resolveRouteFromLocation('/', '?view=admin').viewId, 'admin');
  assert.equal(resolveRouteFromLocation('/this-route-does-not-exist', '').viewId, 'not_found');
  assert.equal(buildCanonicalPathForDestination('properties', 'rent'), '/properties/rent');
});

test('sanitizePublicNavigationQuery strips sensitive parameters cleanly', () => {
  const dirty = new URLSearchParams('city=tehran&mode=buy&phone=09120000000&token=secret123&email=test@example.com');
  const clean = sanitizePublicNavigationQuery(dirty);
  assert.equal(clean.get('city'), 'tehran');
  assert.equal(clean.get('mode'), 'buy');
  assert.equal(clean.has('phone'), false);
  assert.equal(clean.has('token'), false);
  assert.equal(clean.has('email'), false);
});

test('Breadcrumb engine builds RTL/LTR chains and truncates middle nodes on mobile', () => {
  const desktop = buildNavigationBreadcrumbs({
    viewId: 'intelligence',
    subTab: 'prices',
    locale: 'fa',
    cityName: 'تهران',
    hoodName: 'سعادت‌آباد',
    compactForMobile: false,
  });
  assert.equal(desktop[0].viewId, 'home');
  assert.equal(desktop[desktop.length - 1].isCurrent, true);
  assert.ok(desktop.some((n) => n.id === 'hood-سعادت‌آباد'));

  const mobile = buildNavigationBreadcrumbs({
    viewId: 'intelligence',
    subTab: 'prices',
    locale: 'fa',
    cityName: 'تهران',
    hoodName: 'سعادت‌آباد',
    compactForMobile: true,
  });
  assert.equal(mobile.length, 3);
  assert.equal(mobile[1].ellipsis, true);
});

test('Map Tool Rail keeps layers active when closing panel and toggles cleanly', () => {
  assert.equal(toggleMapContextPanel(null, 'layers'), 'layers');
  assert.equal(toggleMapContextPanel('layers', 'layers'), null);
  assert.equal(toggleMapContextPanel('layers', 'analysis'), 'analysis');

  const closedWithLayer = resolveMapToolVisualState('layers', {
    openPanel: null,
    activeLens: 'bubble',
    showMetroLines: false,
    showTrafficZones: false,
    hasFilterApplied: false,
    isComparing: false,
    hasSavedViews: false,
  });
  assert.equal(closedWithLayer, 'active');
});

test('RT-UI-LAYOUT-001 contracts distinguish page max-widths and spacing tokens', () => {
  assert.equal(SPACING_SCALE_PX.S6, 24);
  assert.equal(resolveLayoutContractForView('home').maxWidthPx, 1320);
  assert.equal(resolveLayoutContractForView('intelligence').maxWidthPx, 1360);
  assert.equal(resolveLayoutContractForView('discover').maxWidthPx, 1280);
  assert.equal(resolveLayoutContractForView('map').maxWidthPx, 'flexible');
  assert.equal(resolveLayoutContractForView('admin').shell, 'admin');
  assert.ok(resolveViewContainerClass('home').includes('1320'));
  assert.ok(LAYOUT_CONTRACT_REGISTRY.length >= 9);
});

