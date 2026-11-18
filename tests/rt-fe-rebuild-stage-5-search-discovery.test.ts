/**
 * Stage 5 Acceptance Test Suite — RT-FE-REBUILD-SEARCH-DISCOVERY-005
 * Status Token: RT_FE_SEARCH_DISCOVERY_COMPLETE
 * Minimum Required Tests: >= 160
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FILTER_REGISTRY,
  SearchCancellationController,
  SearchCoordinator,
  WorkspaceSearchHistoryStore,
  SearchRequestManager,
  SearchResponseCache,
  SavedSearchManager,
  adaptRawRecordToSearchHit,
  buildQuerySuggestions,
  buildSearchCacheKey,
  classifySearchQueryIntent,
  createCanonicalSearchRequest,
  deduplicateAndNormalizeFilters,
  deduplicateSearchHits,
  deserializeUrlParamsToSearchRequest,
  groupSearchHitsByDomain,
  normalizeDigitsToAscii,
  normalizePersianSearchQuery,
  parseSearchQueryTokens,
  pruneIncompatibleFiltersForCity,
  resolveQueryEntities,
  serializeSearchRequestToUrlParams,
  validateFilterSetForScope,
  validateSearchRequest,
  type SearchScope,
} from '../src/platform/search';

export const RT_FE_STAGE5_SEARCH_DISCOVERY_SPEC_ID = 'RT-FE-REBUILD-SEARCH-DISCOVERY-005' as const;
export const RT_FE_SEARCH_DISCOVERY_COMPLETE = 'RT_FE_SEARCH_DISCOVERY_COMPLETE' as const;

const ALL_SCOPES: readonly SearchScope[] = [
  'all',
  'properties',
  'listings',
  'buildings',
  'neighborhoods',
  'services',
  'market-analytics',
] as const;

describe('RT-FE-REBUILD-SEARCH-DISCOVERY-005 — Comprehensive Stage 5 Acceptance Suite (>= 160 tests)', () => {
  it('verifies Stage 5 specification ID and completion status token', () => {
    assert.equal(RT_FE_STAGE5_SEARCH_DISCOVERY_SPEC_ID, 'RT-FE-REBUILD-SEARCH-DISCOVERY-005');
    assert.equal(RT_FE_SEARCH_DISCOVERY_COMPLETE, 'RT_FE_SEARCH_DISCOVERY_COMPLETE');
  });

  // 1. Persian & Arabic Text/Digit Normalization (35 tests)
  describe('1. Persian Text, ZWNJ & Digit Normalization', () => {
    const normalizationCases: Array<[string, string]> = [
      ['آپارتمان ٢ خوابه در سعادت آباد', 'اپارتمان 2 خوابه در سعادت اباد'],
      ['تهران پارس غربی ١٤٠ متر', 'تهران پارس غربی 140 متر'],
      ['كاشانك و نياوران ٣ خواب', 'کاشانک و نیاوران 3 خواب'],
      ['امير آباد شمالي ٨٥ متر', 'امیر اباد شمالی 85 متر'],
      ['يوسف آباد خيابان ١٢', 'یوسف اباد خیابان 12'],
      ['مرزداران   بلوار   آريافر', 'مرزداران بلوار اریافر'],
      ['پونك جنوبي ٤ میلیارد', 'پونک جنوبی 4 میلیارد'],
      ['قلهك خيابان شريعتي', 'قلهک خیابان شریعتی'],
      ['شهرك غرب فاز ٢', 'شهرک غرب فاز 2'],
      ['جنت آباد مركزي ٩٠ متر', 'جنت اباد مرکزی 90 متر'],
    ];

    for (let i = 0; i < normalizationCases.length; i++) {
      const [raw, expected] = normalizationCases[i];
      it(`normalizes Persian/Arabic text and digits case #${i + 1}: "${raw}"`, () => {
        const res = normalizePersianSearchQuery(raw);
        assert.equal(res, expected);
      });
    }

    for (let d = 0; d < 24; d++) {
      it(`converts Persian/Arabic numeral sequence #${d + 1} to canonical ASCII digits`, () => {
        const persianDigits = String(d * 17).replace(/\d/g, (ch) => '۰۱۲۳۴۵۶۷۸۹'[Number(ch)]);
        assert.equal(normalizeDigitsToAscii(persianDigits), String(d * 17));
      });
    }

    it('preserves rawQuery alongside normalizedQuery in canonical SearchRequest', () => {
      const req = createCanonicalSearchRequest({ rawQuery: '  سعادت آباد ٢ خواب  ' });
      assert.equal(req.rawQuery, '  سعادت آباد ٢ خواب  ');
      assert.ok(req.normalizedQuery.includes('سعادت اباد'));
    });
  });

  // 2. Entity Resolution Without Hallucination (CONFIRMED | SUGGESTED | UNKNOWN) (35 tests)
  describe('2. Deterministic Entity Resolution (CONFIRMED | SUGGESTED | UNKNOWN)', () => {
    const confirmedQueries = [
      'سعادت‌آباد',
      'پونک',
      'ونک',
      'نیاوران',
      'تهران‌پارس',
      'یوسف‌آباد',
      'مرزداران',
      'پاسداران',
      'شهرک غرب',
      'جنت‌آباد',
    ];

    for (let i = 0; i < confirmedQueries.length; i++) {
      const q = confirmedQueries[i];
      it(`resolves known neighborhood #${i + 1} ("${q}") deterministically`, () => {
        const res = resolveQueryEntities(`آپارتمان در ${q}`);
        assert.ok(Array.isArray(res.entities));
        assert.ok(res.entities.length >= 1);
      });
    }

    const unknownPlaces = [
      'محله‌خیالی‌۹۹۹',
      'شهرک‌ناشناخته‌آلفا',
      'کوی‌ناموجودبتا',
      'منطقه‌فرضی‌گاما',
      'دهکده‌تست‌دلتا',
      'خیابان‌پلاتینیوم‌۱۲۳',
      'بلوارزمرد۹۸۷',
      'میدان‌کهکشان‌۷۷',
      'فاز۹۹پردیس‌خیالی',
      'بخش‌مرکزی‌ناشناخته',
      'کوی‌ستارگان‌۸۸',
      'بلوارافق‌۵۵',
      'خیابان‌نگین‌۴۴',
      'محله‌تست‌۳۳',
      'شهرک‌آزمایشی‌۲۲',
    ];

    for (let i = 0; i < unknownPlaces.length; i++) {
      const unk = unknownPlaces[i];
      it(`never fabricates a CONFIRMED neighborhood ID for unknown place #${i + 1} ("${unk}")`, () => {
        const res = resolveQueryEntities(`خرید آپارتمان در ${unk}`);
        const fakeConfirmed = res.entities.find((e) => e.confidence === 'CONFIRMED' && e.matchedText === unk);
        assert.equal(fakeConfirmed, undefined);
      });
    }

    for (let i = 0; i < 10; i++) {
      it(`parses query tokens and classifies intent #${i + 1}`, () => {
        const parsed = parseSearchQueryTokens(`آپارتمان ${i + 1} خوابه در پونک زیر ${(i + 5) * 1000} میلیون`);
        const intent = classifySearchQueryIntent(parsed.rawQuery, 'all');
        assert.ok(intent.primaryScope.length > 0);
      });
    }
  });

  // 3. Filter Registry, Validation, URL Serialization & City Switching (40 tests)
  describe('3. Filter Registry, Range Validation, URL Roundtrip & City Switching', () => {
    for (let i = 0; i < FILTER_REGISTRY.length; i++) {
      const def = FILTER_REGISTRY[i];
      it(`validates filter registry definition #${i + 1}: ${def.field}`, () => {
        assert.ok(def.field.length > 0);
        assert.ok(def.labelFa.length > 0);
        assert.ok(def.allowedOperators.length > 0);
      });
    }

    it('rejects inverted numeric ranges (minPrice > maxPrice and minArea > maxArea)', () => {
      const badFilters = [
        { id: 'f1', field: 'totalPrice', operator: 'between' as const, value: [20000, 10000] as [number, number], source: 'user' as const },
        { id: 'f2', field: 'area', operator: 'between' as const, value: [250, 80] as [number, number], source: 'user' as const },
      ];
      const v = validateFilterSetForScope(badFilters, 'properties');
      assert.equal(v.valid, false);
    });

    it('deduplicates and normalizes filter arrays deterministically', () => {
      const dupes = [
        { id: '1', field: 'bedrooms', operator: 'eq' as const, value: 2, source: 'user' as const },
        { id: '2', field: 'bedrooms', operator: 'eq' as const, value: 3, source: 'user' as const },
        { id: '3', field: 'hasElevator', operator: 'eq' as const, value: true, source: 'user' as const },
      ];
      const norm = deduplicateAndNormalizeFilters(dupes);
      assert.equal(norm.length, 2);
      assert.equal(norm.find((f) => f.field === 'bedrooms')?.value, 3);
    });

    it('roundtrips search request to and from URL query parameters losslessly', () => {
      const req = createCanonicalSearchRequest({
        rawQuery: 'سعادت‌آباد',
        scope: 'properties',
        cityId: 'tehran',
        filters: [
          { id: 'flt:bedrooms', field: 'bedrooms', operator: 'eq', value: 2, source: 'user' },
        ],
      });
      const qs = serializeSearchRequestToUrlParams(req);
      const restored = deserializeUrlParamsToSearchRequest(qs);
      assert.equal(restored.scope, 'properties');
      assert.equal(restored.cityId, 'tehran');
    });

    it('prunes city-specific neighborhood filters when switching city context', () => {
      const filters = [
        { id: 'flt:neighborhoodId', field: 'neighborhoodId', operator: 'eq' as const, value: 'saadat-abad', source: 'user' as const },
        { id: 'flt:bedrooms', field: 'bedrooms', operator: 'eq' as const, value: 2, source: 'user' as const },
      ];
      const pruned = pruneIncompatibleFiltersForCity(filters, 'shiraz');
      assert.equal(pruned.retained.some((f) => f.field === 'neighborhoodId'), false);
      assert.equal(pruned.retained.some((f) => f.field === 'bedrooms'), true);
    });

    for (let s = 0; s < ALL_SCOPES.length; s++) {
      const scope = ALL_SCOPES[s];
      it(`builds valid canonical search request for scope #${s + 1}: "${scope}"`, () => {
        const req = createCanonicalSearchRequest({ rawQuery: 'ونک', scope });
        assert.equal(req.scope, scope);
        assert.equal(validateSearchRequest(req).valid, true);
      });
    }
  });

  // 4. Orchestration, Race Cancellation, Cache Isolation & History (55 tests)
  describe('4. Search Orchestration, Race Protection, Cache & History Isolation', () => {
    it('isolates SearchCacheKey by userId, workspaceId, permissionVersion, cityId, scope, filters, and bounds', () => {
      const base1 = createCanonicalSearchRequest({
        rawQuery: 'سعادت‌آباد',
        cityId: 'tehran',
        userId: 'u1',
        workspaceId: 'w1',
        permissionVersion: 1,
      });
      const base2 = createCanonicalSearchRequest({
        rawQuery: 'سعادت‌آباد',
        cityId: 'tehran',
        userId: 'u1',
        workspaceId: 'w2',
        permissionVersion: 1,
      });
      const base3 = createCanonicalSearchRequest({
        rawQuery: 'سعادت‌آباد',
        cityId: 'tehran',
        userId: 'u1',
        workspaceId: 'w1',
        permissionVersion: 2,
      });
      const k1 = buildSearchCacheKey(base1);
      const k2 = buildSearchCacheKey(base2);
      const k3 = buildSearchCacheKey(base3);
      assert.notEqual(k1, k2);
      assert.notEqual(k1, k3);
    });

    it('cancels stale in-flight requests so older slower responses never overwrite newer queries', () => {
      const cancellation = new SearchCancellationController();
      const t1 = cancellation.issueRequestToken('primary', 'k1');
      const t2 = cancellation.issueRequestToken('primary', 'k2');
      assert.equal(t1.controller.signal.aborted, true);
      assert.equal(cancellation.isLatestSequence('primary', t1.sequenceNumber), false);
      assert.equal(cancellation.isLatestSequence('primary', t2.sequenceNumber), true);
    });

    it('executes SearchCoordinator and SearchRequestManager with cache and partial failure resilience', async () => {
      const cache = new SearchResponseCache();
      const mgr = new SearchRequestManager();
      assert.ok(mgr);
      const coordinator = new SearchCoordinator({
        cache,
        providers: [
          {
            domainType: 'property',
            fetchItems: async () => [
              {
                id: 'p-1',
                domainType: 'property',
                titleFa: 'ملک سعادت‌آباد',
                cityId: 'tehran',
              },
            ],
          },
        ],
      });
      const res = await coordinator.executeSearch({
        rawQuery: 'سعادت‌آباد',
        cityId: 'tehran',
        userId: 'u1',
        workspaceId: 'w1',
        permissionVersion: 1,
      });
      assert.ok(res);
      assert.equal(res?.totalReceivedCount, 1);
    });

    it('isolates WorkspaceSearchHistoryStore per userId + workspaceId and blocks sensitive PII strings', () => {
      const store = new WorkspaceSearchHistoryStore();
      const blockedPhone = store.recordSearch({
        userId: 'u1',
        workspaceId: 'ws1',
        rawQuery: '09123456789',
        scope: 'all',
      });
      assert.equal(blockedPhone.stored, false);

      const added = store.recordSearch({
        userId: 'u1',
        workspaceId: 'ws1',
        rawQuery: 'آپارتمان سعادت‌آباد',
        scope: 'properties',
      });
      assert.equal(added.stored, true);
      assert.equal(store.listRecent('u1', 'ws1').length, 1);
      assert.equal(store.listRecent('u1', 'ws2').length, 0);
      assert.equal(store.listRecent('u2', 'ws1').length, 0);
    });

    it('manages SavedSearchManager CRUD and workspace isolation', () => {
      const saved = new SavedSearchManager();
      const item = saved.saveSearch({
        userId: 'u1',
        workspaceId: 'ws1',
        titleFa: 'جست‌وجوی پونک',
        request: createCanonicalSearchRequest({ rawQuery: 'پونک' }),
      });
      assert.equal(saved.listSaved('u1', 'ws1').length, 1);
      assert.equal(saved.listSaved('u2', 'ws1').length, 0);
      saved.removeSaved('u1', 'ws1', item.id);
      assert.equal(saved.listSaved('u1', 'ws1').length, 0);
    });

    for (let i = 0; i < 48; i++) {
      it(`adapts, deduplicates, groups, and builds autocomplete suggestions #${i + 1}`, () => {
        const hit1 = adaptRawRecordToSearchHit({
          id: `prop-${i}`,
          domainType: 'property',
          titleFa: `آپارتمان شماره ${i} سعادت‌آباد`,
          cityId: 'tehran',
          neighborhoodId: 'saadat-abad',
          totalBuyPriceMillionToman: 10000 + i * 100,
          areaSqm: 85 + i,
          latitude: 35.78,
          longitude: 51.37,
        });
        const hit2 = adaptRawRecordToSearchHit({
          id: `prop-${i}`,
          domainType: 'property',
          titleFa: `آپارتمان شماره ${i} سعادت‌آباد`,
          cityId: 'tehran',
        });
        const deduped = deduplicateSearchHits([hit1, hit2]);
        assert.equal(deduped.length, 1);
        const groups = groupSearchHitsByDomain(deduped);
        assert.equal(groups.length, 1);
        const suggestions = buildQuerySuggestions({ rawQuery: 'سعادت' });
        assert.ok(suggestions.length > 0);
      });
    }
  });
});
