import assert from 'node:assert/strict';
import {
  getRecentSearches,
  recordRecentSearch,
  removeRecentSearch,
  clearAllRecentSearches,
  useSearchHistory,
  SearchHistory,
  RECENT_SEARCHES_STORAGE_KEY,
  MAX_RECENT_SEARCHES,
} from '../src/components/SearchHistory';

console.log('--- Running SearchHistory Component & State Contract Tests ---');

// Mock localStorage if in Node environment
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
  (globalThis as any).window = {
    localStorage: mockStorage,
    dispatchEvent: (_event: any) => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

// 1. Initial Empty State
clearAllRecentSearches();
assert.deepEqual(getRecentSearches(), []);

// 2. Add items and verify order (LIFO)
recordRecentSearch('اقدسیه');
recordRecentSearch('فرمانیه');
recordRecentSearch('کامرانیه');
assert.deepEqual(getRecentSearches(), ['کامرانیه', 'فرمانیه', 'اقدسیه']);

// 3. Deduplication and bump to head
recordRecentSearch('اقدسیه');
assert.deepEqual(getRecentSearches(), ['اقدسیه', 'کامرانیه', 'فرمانیه']);

// 4. Individual Removal
const removed = removeRecentSearch('کامرانیه');
assert.deepEqual(removed, ['اقدسیه', 'فرمانیه']);
assert.deepEqual(getRecentSearches(), ['اقدسیه', 'فرمانیه']);

// 5. Case-insensitivity and trim
recordRecentSearch('  اقدسیه  ');
assert.deepEqual(getRecentSearches(), ['اقدسیه', 'فرمانیه']);

// 6. Max items cap
clearAllRecentSearches();
for (let i = 1; i <= 8; i++) {
  recordRecentSearch(`محله-${i}`);
}
const capped = getRecentSearches();
assert.equal(capped.length, MAX_RECENT_SEARCHES);
assert.equal(capped[0], 'محله-8');

// 7. Verify exports exist and are valid functions/components
assert.equal(typeof SearchHistory, 'function', 'SearchHistory must be a React functional component');
assert.equal(typeof useSearchHistory, 'function', 'useSearchHistory must be a React hook');
assert.equal(typeof RECENT_SEARCHES_STORAGE_KEY, 'string');

console.log('[PASS] SearchHistory Component & State Contract tests passed successfully.');
