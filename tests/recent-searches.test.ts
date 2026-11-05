import assert from 'node:assert/strict';
import {
  getRecentSearches,
  recordRecentSearch,
  clearAllRecentSearches,
  MAX_RECENT_SEARCHES,
} from '../src/components/SearchDropdownMenu';

console.log('--- Running Recent Searches Unit Tests ---');

// Mock localStorage in Node environment if needed
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: 0,
  };
  globalThis.localStorage = mockStorage as any;
  (globalThis as any).window = { localStorage: mockStorage };
} else if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = { localStorage: globalThis.localStorage };
}

// 1. Initial state should be empty
clearAllRecentSearches();
assert.deepEqual(getRecentSearches(), [], 'Initial recent searches must be empty');

// 2. Recording searches
recordRecentSearch('سعادت‌آباد');
assert.deepEqual(getRecentSearches(), ['سعادت‌آباد']);

recordRecentSearch('پونک');
recordRecentSearch('نیاوران');
assert.deepEqual(getRecentSearches(), ['نیاوران', 'پونک', 'سعادت‌آباد']);

// 3. Deduplication and bump to top
recordRecentSearch('سعادت‌آباد');
assert.deepEqual(getRecentSearches(), ['سعادت‌آباد', 'نیاوران', 'پونک']);

// 4. Max 5 limit enforcement
recordRecentSearch('تجریش');
recordRecentSearch('زعفرانیه');
recordRecentSearch('شهرک غرب');
const top5 = getRecentSearches();
assert.equal(top5.length, MAX_RECENT_SEARCHES, 'Must cap at maximum 5 items');
assert.deepEqual(top5, ['شهرک غرب', 'زعفرانیه', 'تجریش', 'سعادت‌آباد', 'نیاوران']);

// 5. Empty or whitespace searches ignored
recordRecentSearch('   ');
assert.equal(getRecentSearches().length, MAX_RECENT_SEARCHES);

// 6. Clear history
clearAllRecentSearches();
assert.deepEqual(getRecentSearches(), [], 'History must be cleared after clearAllRecentSearches');

// 7. Trending & Popular Neighborhoods
import { getTrendingNeighborhoods } from '../src/components/SearchDropdownMenu';
import type { EvaluatedNeighborhood } from '../src/data/neighborhoods';

const mockHoods = [
  { id: 1, name: 'سعادت‌آباد', overallScore: 9.2, buyPerSqm: 180, zone: 'شمال غرب' },
  { id: 2, name: 'شهرک غرب', overallScore: 9.1, buyPerSqm: 210, zone: 'شمال غرب' },
  { id: 3, name: 'پونک', overallScore: 8.5, buyPerSqm: 125, zone: 'غرب' },
  { id: 4, name: 'یافت‌آباد', overallScore: 6.5, buyPerSqm: 50, zone: 'جنوب' },
] as unknown as EvaluatedNeighborhood[];

const trending = getTrendingNeighborhoods(mockHoods, [mockHoods[0]]);
assert.equal(trending.length, 3, 'Must return trending excluding current matches');
assert.ok(!trending.some((t) => t.id === 1), 'Excluded match must not appear in trending');
assert.equal(trending[0].name, 'شهرک غرب');

console.log('[PASS] All Recent Searches & Trending unit tests passed.');
