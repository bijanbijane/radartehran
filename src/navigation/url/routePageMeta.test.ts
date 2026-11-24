import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoutePageMeta } from './routePageMeta';
import type { RouteDestinationId } from '../registry/route.types';

const ALL_DESTINATIONS: RouteDestinationId[] = [
  'home',
  'map',
  'discover',
  'intelligence',
  'properties',
  'tools',
  'services',
  'knowledge',
  'contributions',
  'userspace',
  'admin',
  'not_found',
];

test('resolveRoutePageMeta produces unique Persian titles and non-empty descriptions for every route', () => {
  const titles = new Set<string>();
  for (const viewId of ALL_DESTINATIONS) {
    const meta = resolveRoutePageMeta({
      viewId,
      cityNameFa: 'تهران',
      brandFa: 'رادارتهران',
      selectedHoodName: 'پونک',
    });
    assert.ok(meta.title.includes('رادارتهران'), `title for ${viewId} must include brand`);
    assert.ok(meta.description.length >= 25, `description for ${viewId} must be informative`);
    assert.equal(titles.has(meta.title), false, `duplicate title found for ${viewId}: ${meta.title}`);
    titles.add(meta.title);
  }
});

test('resolveRoutePageMeta differentiates /areas from /areas/registry', () => {
  const areasMeta = resolveRoutePageMeta({
    viewId: 'discover',
    subTab: 'results',
    cityNameFa: 'تهران',
    brandFa: 'رادارتهران',
  });
  const registryMeta = resolveRoutePageMeta({
    viewId: 'discover',
    subTab: 'registry',
    cityNameFa: 'تهران',
    brandFa: 'رادارتهران',
  });
  assert.notEqual(areasMeta.title, registryMeta.title);
  assert.ok(registryMeta.title.includes('مرجع جغرافیایی'));
});

test('resolveRoutePageMeta embeds selected neighborhood on /map route only', () => {
  const mapWithHood = resolveRoutePageMeta({
    viewId: 'map',
    cityNameFa: 'تهران',
    brandFa: 'رادارتهران',
    selectedHoodName: 'سعادت‌آباد',
  });
  assert.ok(mapWithHood.title.includes('سعادت‌آباد'));

  const marketWithHood = resolveRoutePageMeta({
    viewId: 'intelligence',
    cityNameFa: 'تهران',
    brandFa: 'رادارتهران',
    selectedHoodName: 'سعادت‌آباد',
  });
  assert.equal(marketWithHood.title.includes('سعادت‌آباد'), false);
});
