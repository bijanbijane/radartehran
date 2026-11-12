import assert from 'node:assert/strict';
import { getProductNavigationItems } from '../src/components/navigation/primaryNavigation';

const locales = ['fa', 'en', 'ar', 'tr'] as const;
const expectedPrimaryIds = ['home', 'discover', 'map', 'intelligence', 'tools', 'userspace'];

for (const locale of locales) {
  const items = getProductNavigationItems(locale);
  const primaryItems = items.filter((item) => item.group === 'primary');
  const administrativeItems = items.filter((item) => item.group === 'administrative');

  assert.deepEqual(primaryItems.map((item) => item.id), expectedPrimaryIds);
  assert.equal(administrativeItems.length, 1);
  assert.equal(administrativeItems[0].id, 'admin');
  assert.equal(administrativeItems[0].protected, true);
  assert.ok(items.every((item) => item.label.trim().length > 0));
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
}

console.log('Navigation configuration passes all locale, priority and admin-separation checks.');