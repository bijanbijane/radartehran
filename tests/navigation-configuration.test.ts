import assert from 'node:assert/strict';
import { getProductNavigationItems } from '../src/components/navigation/primaryNavigation';
import {
  buildNavigationVisibilityContext,
  guestNavigationVisibilityContext,
} from '../src/navigation/registry/navigationPermissionBridge';

const locales = ['fa', 'en', 'ar', 'tr'] as const;
const expectedPrimaryIds = ['home', 'discover', 'map', 'intelligence', 'tools', 'properties'];

for (const locale of locales) {
  const guestItems = getProductNavigationItems(locale, guestNavigationVisibilityContext());
  const primaryItems = guestItems.filter((item) => item.group === 'primary');
  const accountItems = guestItems.filter((item) => item.group === 'account');
  const administrativeItems = guestItems.filter((item) => item.group === 'administrative');

  assert.deepEqual(primaryItems.map((item) => item.id), expectedPrimaryIds);
  assert.deepEqual(accountItems.map((item) => item.id), ['userspace']);
  assert.equal(administrativeItems.length, 0, 'Guest context must not surface admin primary nav');
  assert.ok(guestItems.every((item) => item.label.trim().length > 0));
  assert.equal(new Set(guestItems.map((item) => item.id)).size, guestItems.length);

  const adminCtx = buildNavigationVisibilityContext({
    state: 'READY',
    permissions: [
      'admin:dashboard:view',
      'admin:governance',
      'admin:moderation:approve',
      'admin:permissions:manage',
    ],
    activeRole: 'admin',
  });
  const adminItems = getProductNavigationItems(locale, adminCtx);
  const adminNav = adminItems.filter((item) => item.group === 'administrative');
  assert.equal(adminNav.length, 1);
  assert.equal(adminNav[0].id, 'admin');
  assert.equal(adminNav[0].protected, true);
}

console.log('Navigation configuration passes locale, guest/admin visibility, and admin-separation checks.');