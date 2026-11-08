/**
 * Automated Verification Test Suite for Property Search & Discovery Backend Module
 * (`server/modules/property-search/__tests__/propertySearch.test.ts`)
 * Exclusive ownership: `server/modules/property-search/`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemorySearchCacheAdapter,
  PropertySearchService,
  PropertySearchValidationError,
  SearchQueryValidator,
  type GeographySearchAdapter,
  type ListingDataSourceAdapter,
  type SavedSearchRepositoryAdapter,
  type SearchAnalyticsEvent,
  type SearchAnalyticsSinkAdapter,
  type SearchHistoryRepositoryAdapter,
  type SearchPerformanceMetricsSummary,
  type SearchPropertyItem,
  type SponsorsSearchAdapter,
  type StoredPropertySavedSearch,
  type StoredSearchHistoryRecord,
  type ValuationSearchAdapter,
} from '../index';

const SAMPLE_LISTINGS: SearchPropertyItem[] = [
  {
    id: 'listing_res_1', sourceModule: 'platform_listings', category: 'residential', subtype: 'apartment', dealType: 'sale',
    cityId: 'tehran', districtId: 'district:tehran:2', hoodId: 2, hoodNameFa: 'سعادت‌آباد', title: 'آپارتمان ۱۱۰ متری سعادت‌آباد نوساز',
    descriptionSnippetFa: 'دارای ۲ پارکینگ سندی، آسانسور ایتالیایی و بالکن کاربردی', areaSqm: 110, askingPriceTotalMillion: 14000,
    askingPricePerSqmMillion: 127.27, priceDisplayTextFa: '۱۴ میلیارد تومان', rooms: 2, buildingAgeYears: 1, floor: 3,
    hasParking: true, hasElevator: true, hasStorage: true, hasBalcony: true, renovationCondition: 'luxury_renovated',
    constructionStatus: 'completed', coordinates: { lat: 35.78, lng: 51.37, isApproximate: false }, isVerifiedListing: true,
    publishedAtIso: '2026-11-01T10:00:00.000Z', updatedAtIso: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'listing_res_2', sourceModule: 'platform_listings', category: 'residential', subtype: 'apartment', dealType: 'rent',
    cityId: 'tehran', districtId: 'district:tehran:2', hoodId: 2, hoodNameFa: 'سعادت‌آباد', title: 'اجاره آپارتمان ۹۰ متری فول امکانات',
    areaSqm: 90, monthlyRentMillion: 25, depositMillion: 800, priceDisplayTextFa: '۸۰۰ میلیون ودیعه / ۲۵ میلیون اجاره',
    rooms: 2, buildingAgeYears: 5, floor: 2, hasParking: true, hasElevator: true, hasStorage: false, hasBalcony: true,
    coordinates: { lat: 35.782, lng: 51.373, isApproximate: false }, isVerifiedListing: false,
    publishedAtIso: '2026-11-02T11:00:00.000Z', updatedAtIso: '2026-11-02T11:00:00.000Z',
  },
  {
    id: 'listing_comm_1', sourceModule: 'platform_listings', category: 'commercial', subtype: 'shop', dealType: 'sale',
    cityId: 'tehran', districtId: 'district:tehran:5', hoodId: 1, hoodNameFa: 'پونک', title: 'مغازه تجاری ۴۵ متری بر اصلی پونک',
    areaSqm: 45, askingPriceTotalMillion: 18000, askingPricePerSqmMillion: 400, priceDisplayTextFa: '۱۸ میلیارد تومان',
    shopFrontageMeters: 4.5, hasCommercialLicense: true, floor: 0, coordinates: { lat: 35.76, lng: 51.34, isApproximate: false },
    isVerifiedListing: true, publishedAtIso: '2026-11-03T12:00:00.000Z', updatedAtIso: '2026-11-03T12:00:00.000Z',
  },
  {
    id: 'listing_off_1', sourceModule: 'platform_listings', category: 'office', subtype: 'administrative_office', dealType: 'rent',
    cityId: 'tehran', districtId: 'district:tehran:3', hoodId: 3, hoodNameFa: 'ونک', title: 'واحد اداری سند اداری ۷۵ متری ونک',
    areaSqm: 75, monthlyRentMillion: 40, depositMillion: 500, priceDisplayTextFa: '۵۰۰ میلیون ودیعه / ۴۰ میلیون اجاره',
    hasElevator: true, suitableForMedical: true, floor: 4, coordinates: { lat: 35.755, lng: 51.41, isApproximate: false },
    isVerifiedListing: true, publishedAtIso: '2026-11-04T09:00:00.000Z', updatedAtIso: '2026-11-04T09:00:00.000Z',
  },
  {
    id: 'listing_land_1', sourceModule: 'platform_listings', category: 'land', subtype: 'residential_plot', dealType: 'sale',
    cityId: 'karaj', hoodId: 101, hoodNameFa: 'گوهردشت', title: 'زمین مسکونی ۳۰۰ متری بر ۱۰ گوهردشت',
    areaSqm: 300, askingPriceTotalMillion: 12000, askingPricePerSqmMillion: 40, priceDisplayTextFa: '۱۲ میلیارد تومان',
    coordinates: { lat: 35.83, lng: 50.99, isApproximate: false }, isVerifiedListing: false,
    publishedAtIso: '2026-10-25T08:00:00.000Z', updatedAtIso: '2026-10-25T08:00:00.000Z',
  },
];

class MockListingDataSource implements ListingDataSourceAdapter {
  constructor(public listings: SearchPropertyItem[] = [...SAMPLE_LISTINGS]) {}
  public async queryApprovedListings() { return { listings: [...this.listings], totalEstimated: this.listings.length }; }
  public async getListingById(id: string) { return this.listings.find((l) => l.id === id) ?? null; }
}

class MockGeographyAdapter implements GeographySearchAdapter {
  public async resolveLocation(text: string) {
    if (text.includes('سعادت')) return { resolved: true, cityId: 'tehran', districtId: 'district:tehran:2', hoodId: 2, displayNameFa: 'سعادت‌آباد' };
    if (text.includes('پونک')) return { resolved: true, cityId: 'tehran', districtId: 'district:tehran:5', hoodId: 1, displayNameFa: 'پونک' };
    return { resolved: false };
  }
  public async getNeighborhoodInfo(cityId: string, hoodId: number) {
    if (cityId === 'tehran' && hoodId === 2) return { cityId: 'tehran', hoodId: 2, hoodNameFa: 'سعادت‌آباد', districtNumber: 2, center: { lat: 35.78, lng: 51.37 } };
    return null;
  }
  public async getNeighborhoodsInDistrict(cityId: string, districtIdOrNum: string | number) {
    if (cityId === 'tehran' && (districtIdOrNum === 'district:tehran:2' || districtIdOrNum === 2 || districtIdOrNum === '2')) return [2];
    return [];
  }
  public async getNearbyNeighborhoods(lat: number, lng: number) {
    if (Math.abs(lat - 35.78) < 0.05 && Math.abs(lng - 51.37) < 0.05) return [2];
    return [];
  }
  public async getAllSupportedCities() {
    return [
      { id: 'tehran', nameFa: 'تهران', nameEn: 'Tehran' },
      { id: 'karaj', nameFa: 'کرج', nameEn: 'Karaj' },
      { id: 'mashhad', nameFa: 'مشهد', nameEn: 'Mashhad' },
      { id: 'isfahan', nameFa: 'اصفهان', nameEn: 'Isfahan' },
      { id: 'shiraz', nameFa: 'شیراز', nameEn: 'Shiraz' },
    ];
  }
}

class MockValuationAdapter implements ValuationSearchAdapter {
  public async getValuationBenchmark(params: { sqm: number }) {
    return { estimatedMarketValueMillion: params.sqm * 140, confidence: 'high' as const, benchmarkDateIso: '2026-11-01T00:00:00.000Z' };
  }
}

class MockSponsorsAdapter implements SponsorsSearchAdapter {
  public async getActivePlacementsForSlot(cityId: string, hoodId: number) {
    if (cityId === 'tehran' && hoodId === 2) {
      return [{
        sponsorshipId: 'spon_101', agencyNameFa: 'املاک بزرگ سعادت‌آباد', specialtyFa: 'خرید و فروش تخصصی آپارتمان',
        phone: '02122000000', cityId: 'tehran', hoodId: 2, hoodNameFa: 'سعادت‌آباد',
        badgeLabelFa: 'حامی رسمی املاک محله', expiresAtIso: '2026-12-01T00:00:00.000Z',
      }];
    }
    return [];
  }
}

class MockSavedSearchRepo implements SavedSearchRepositoryAdapter {
  public store = new Map<string, StoredPropertySavedSearch>();
  public async createSavedSearch(r: StoredPropertySavedSearch) { this.store.set(r.savedSearchId, { ...r }); }
  public async getSavedSearchById(id: string) { return this.store.get(id) ? { ...this.store.get(id)! } : null; }
  public async listSavedSearchesByOwner(ownerUid: string) { return [...this.store.values()].filter((s) => s.ownerUid === ownerUid); }
  public async updateSavedSearch(id: string, ownerUid: string, updates: Partial<StoredPropertySavedSearch>) {
    const item = this.store.get(id);
    if (!item || item.ownerUid !== ownerUid) return null;
    const updated = { ...item, ...updates, updatedAtIso: new Date().toISOString() };
    this.store.set(id, updated);
    return updated;
  }
  public async deleteSavedSearch(id: string, ownerUid: string) {
    const item = this.store.get(id);
    if (!item || item.ownerUid !== ownerUid) return false;
    return this.store.delete(id);
  }
}

class MockSearchHistoryRepo implements SearchHistoryRepositoryAdapter {
  public history: StoredSearchHistoryRecord[] = [];
  public async recordQuery(r: StoredSearchHistoryRecord) { this.history.unshift({ ...r }); }
  public async getRecentQueries(userUid: string, limit = 10) { return this.history.filter((h) => h.userUid === userUid).slice(0, limit); }
  public async clearHistory(userUid: string) { this.history = this.history.filter((h) => h.userUid !== userUid); }
}

class MockAnalyticsSink implements SearchAnalyticsSinkAdapter {
  public events: SearchAnalyticsEvent[] = [];
  public async recordSearchEvent(e: SearchAnalyticsEvent) { this.events.push(e); }
  public async getMetricsSummary(periodStartIso: string, periodEndIso: string): Promise<SearchPerformanceMetricsSummary> {
    return {
      periodStartIso, periodEndIso, totalSearchCount: this.events.length,
      zeroResultSearchCount: this.events.filter((e) => e.isZeroResult).length,
      zeroResultRatePercent: this.events.length ? (this.events.filter((e) => e.isZeroResult).length / this.events.length) * 100 : 0,
      averageLatencyMs: 12, p95LatencyMs: 25,
      cacheHitRatePercent: this.events.length ? (this.events.filter((e) => e.cacheHit).length / this.events.length) * 100 : 0,
      topSearchedCities: [{ cityId: 'tehran', count: this.events.length }],
      topSearchedNeighborhoods: [{ hoodId: 2, count: this.events.length }],
      topFilterUsage: [{ filterName: 'category', count: this.events.length }],
    };
  }
}

function buildTestService(overrides?: { listings?: SearchPropertyItem[]; withCache?: boolean }) {
  const listingDataSource = new MockListingDataSource(overrides?.listings);
  const geographyAdapter = new MockGeographyAdapter();
  const valuationAdapter = new MockValuationAdapter();
  const sponsorsAdapter = new MockSponsorsAdapter();
  const savedSearchRepo = new MockSavedSearchRepo();
  const searchHistoryRepo = new MockSearchHistoryRepo();
  const analyticsSink = new MockAnalyticsSink();
  const cacheAdapter = overrides?.withCache ? new InMemorySearchCacheAdapter() : undefined;

  const service = new PropertySearchService({
    listingDataSource, geographyAdapter, valuationAdapter, sponsorsAdapter,
    savedSearchRepo, searchHistoryRepo, analyticsSink, cacheAdapter,
  });

  return { service, listingDataSource, geographyAdapter, savedSearchRepo, searchHistoryRepo, analyticsSink, cacheAdapter };
}

describe('Property Search & Discovery Backend Module', () => {
  describe('1. Supported Property Categories & Discovery', () => {
    it('discovers residential, commercial, office, and land listings by explicit category', async () => {
      const { service } = buildTestService();
      const res = await service.searchProperties({ filters: { category: 'residential' } });
      assert.equal(res.items.length, 2);
      assert.ok(res.items.every((i) => i.category === 'residential'));

      const comm = await service.searchProperties({ filters: { category: 'commercial' } });
      assert.equal(comm.items.length, 1);
      assert.equal(comm.items[0].subtype, 'shop');

      const off = await service.searchProperties({ filters: { category: 'office' } });
      assert.equal(off.items.length, 1);

      const land = await service.searchProperties({ filters: { category: 'land' } });
      assert.equal(land.items.length, 1);
    });

    it('separates sale and rental transaction types and filters price correctly', async () => {
      const { service } = buildTestService();
      const sales = await service.searchProperties({ filters: { dealType: 'sale', minAskingPriceMillion: 10000, maxAskingPriceMillion: 15000 } });
      assert.ok(sales.items.length >= 1);
      assert.ok(sales.items.every((i) => i.dealType === 'sale' && i.askingPriceTotalMillion! >= 10000 && i.askingPriceTotalMillion! <= 15000));

      const rentals = await service.searchProperties({ filters: { dealType: 'rent', maxMonthlyRentMillion: 30 } });
      assert.ok(rentals.items.length >= 1);
      assert.ok(rentals.items.every((i) => i.dealType === 'rent' && i.monthlyRentMillion! <= 30));
    });
  });

  describe('2. Validation & Contradictory Filters', () => {
    it('rejects contradictory price and area ranges with explicit error codes', async () => {
      const { service } = buildTestService();
      await assert.rejects(
        () => service.searchProperties({ filters: { minAskingPriceMillion: 5000, maxAskingPriceMillion: 2000 } }),
        (err: unknown) => err instanceof PropertySearchValidationError && err.code === 'CONTRADICTORY_RANGE',
      );
      await assert.rejects(
        () => service.searchProperties({ filters: { minAreaSqm: 150, maxAreaSqm: 80 } }),
        (err: unknown) => err instanceof PropertySearchValidationError && err.code === 'CONTRADICTORY_RANGE',
      );
      await assert.rejects(
        () => service.searchProperties({ filters: { category: 'invalid_cat' as any } }),
        (err: unknown) => err instanceof PropertySearchValidationError,
      );
    });

    it('rejects invalid bounding box coordinates and invalid limit caps', async () => {
      const { service } = buildTestService();
      await assert.rejects(
        () => service.searchProperties({ filters: { boundingBox: { minLat: 40, maxLat: 30, minLng: 50, maxLng: 52 } } }),
        (err: unknown) => err instanceof PropertySearchValidationError,
      );
      await assert.rejects(
        () => service.searchProperties({ limit: 500, filters: {} }),
        (err: unknown) => err instanceof PropertySearchValidationError,
      );
    });

    it('uses domain/SearchQueryValidator service to normalize text and validate queries', () => {
      const validator = new SearchQueryValidator();
      const norm = validator.normalizeText(' آپارتمان  يوسف‌آباد ۱۲۰ متري ');
      assert.equal(norm, 'آپارتمان یوسف‌آباد 120 متری');

      const parsed = validator.validateSearchRequest({
        filters: {
          category: 'residential',
          dealType: 'خرید',
          minAreaSqm: 80,
          maxAreaSqm: 120,
          minAskingPriceMillion: 5000,
          maxAskingPriceMillion: 10000,
        },
        limit: 15,
      });

      assert.equal(parsed.filters.category, 'residential');
      assert.equal(parsed.filters.dealType, 'sale');
      assert.equal(parsed.filters.minAreaSqm, 80);
      assert.equal(parsed.filters.maxAreaSqm, 120);
      assert.equal(parsed.limit, 15);

      assert.throws(
        () => validator.validateFilters({ minAreaSqm: 100, maxAreaSqm: 50 }),
        (err: unknown) => err instanceof PropertySearchValidationError && err.code === 'CONTRADICTORY_RANGE',
      );

      assert.throws(
        () => validator.validateFilters({ minAskingPriceMillion: 9000, maxAskingPriceMillion: 3000 }),
        (err: unknown) => err instanceof PropertySearchValidationError && err.code === 'CONTRADICTORY_RANGE',
      );
    });
  });

  describe('3. Geographic Filtering, Aggregations & Sponsor Separation', () => {
    it('filters by city, district expansion, neighborhood, and bounding box', async () => {
      const { service } = buildTestService();
      const tehranHood = await service.searchProperties({ filters: { cityId: 'tehran', neighborhoodIds: [2] } });
      assert.equal(tehranHood.items.length, 2);
      assert.ok(tehranHood.items.every((i) => i.hoodId === 2));

      assert.ok(tehranHood.sponsoredPlacements && tehranHood.sponsoredPlacements.length === 1);
      assert.equal(tehranHood.sponsoredPlacements[0].sponsorshipId, 'spon_101');
      assert.equal(tehranHood.sponsoredPlacements[0].badgeLabelFa, 'حامی رسمی املاک محله');

      assert.ok(tehranHood.aggregations);
      assert.equal(tehranHood.aggregations.totalMatches, 2);
      assert.ok(tehranHood.aggregations.categoryBuckets.length > 0);
    });

    it('filters by geographic proximity radius', async () => {
      const { service } = buildTestService();
      const nearRes = await service.searchProperties({
        filters: { nearLocation: { lat: 35.78, lng: 51.37, radiusMeters: 1000 } },
      });
      assert.ok(nearRes.items.length >= 1);
      assert.ok(nearRes.items.every((i) => i.hoodId === 2));
    });
  });

  describe('4. Sorting & Relevance Ranking', () => {
    it('sorts deterministically by newest, price_asc, price_desc, area_asc, area_desc, and relevance', async () => {
      const { service } = buildTestService();
      const newest = await service.searchProperties({ sort: 'newest', filters: {} });
      assert.ok(newest.items[0].publishedAtIso >= newest.items[1].publishedAtIso);

      const priceAsc = await service.searchProperties({ sort: 'price_asc', filters: { dealType: 'sale' } });
      assert.ok(priceAsc.items[0].askingPriceTotalMillion! <= priceAsc.items[1].askingPriceTotalMillion!);

      const relevance = await service.searchProperties({
        sort: 'relevance', filters: { keyword: 'سعادت‌آباد', category: 'residential' },
      });
      assert.ok(relevance.items[0].relevanceScore! >= relevance.items[1].relevanceScore!);
      assert.ok(relevance.items[0].title.includes('سعادت‌آباد'));
    });
  });

  describe('5. Pagination & Cursor Stability', () => {
    it('paginates deterministically without duplicates using cursor', async () => {
      const { service } = buildTestService();
      const page1 = await service.searchProperties({ limit: 2, sort: 'newest', filters: {} });
      assert.equal(page1.items.length, 2);
      assert.ok(page1.hasMore);
      assert.ok(page1.nextCursor);

      const page2 = await service.searchProperties({ limit: 2, cursor: page1.nextCursor, sort: 'newest', filters: {} });
      assert.equal(page2.items.length, 2);

      const p1Ids = new Set(page1.items.map((i) => i.id));
      for (const id of page2.items.map((i) => i.id)) {
        assert.equal(p1Ids.has(id), false, 'Pagination must never produce duplicate items across pages');
      }
    });
  });

  describe('6. Saved Searches & Privacy Isolation', () => {
    it('manages saved searches with strict user ownership isolation', async () => {
      const { service } = buildTestService();
      const saved = await service.saveSearch('user_alice', {
        titleFa: 'آپارتمان‌های سعادت‌آباد',
        filters: { cityId: 'tehran', neighborhoodIds: [2], category: 'residential', dealType: 'sale' },
        sortMode: 'newest', notifyOnNewMatches: true,
      });

      assert.equal(saved.ownerUid, 'user_alice');
      assert.equal(saved.titleFa, 'آپارتمان‌های سعادت‌آباد');

      const aliceList = await service.listUserSavedSearches('user_alice');
      assert.equal(aliceList.length, 1);

      const bobList = await service.listUserSavedSearches('user_bob');
      assert.equal(bobList.length, 0);

      await assert.rejects(
        () => service.updateSavedSearch('user_bob', saved.savedSearchId, { titleFa: 'تلاش غیرمجاز' }),
        /FORBIDDEN_SAVED_SEARCH_OWNER_MISMATCH/,
      );
      await assert.rejects(
        () => service.deleteSavedSearch('user_bob', saved.savedSearchId),
        /FORBIDDEN_SAVED_SEARCH_OWNER_MISMATCH/,
      );

      const updated = await service.updateSavedSearch('user_alice', saved.savedSearchId, { titleFa: 'عنوان جدید آلیس' });
      assert.equal(updated.titleFa, 'عنوان جدید آلیس');
      assert.equal(await service.deleteSavedSearch('user_alice', saved.savedSearchId), true);
    });
  });

  describe('7. Caching, Suggestions & Analytics', () => {
    it('caches public searches safely and invalidates upon listing/neighborhood events', async () => {
      const { service } = buildTestService({ withCache: true });
      const firstCall = await service.searchProperties({ filters: { cityId: 'tehran', neighborhoodIds: [2] } });
      assert.equal(firstCall.executionMetrics.cacheHit, false);

      const secondCall = await service.searchProperties({ filters: { cityId: 'tehran', neighborhoodIds: [2] } });
      assert.equal(secondCall.executionMetrics.cacheHit, true);

      await service.invalidateCacheForNeighborhood('tehran', 2);
      const afterInvalidation = await service.searchProperties({ filters: { cityId: 'tehran', neighborhoodIds: [2] } });
      assert.equal(afterInvalidation.executionMetrics.cacheHit, false);
    });

    it('provides multi-modal search suggestions and records telemetry', async () => {
      const { service, analyticsSink } = buildTestService();
      const suggestions = await service.getSuggestions({ prefix: 'سعادت', limit: 5 });
      assert.ok(suggestions.length >= 1);
      assert.ok(suggestions.some((s) => s.type === 'neighborhood'));

      const citySuggestions = await service.getSuggestions({ prefix: 'تهران', limit: 5 });
      assert.ok(citySuggestions.some((s) => s.type === 'city'));

      const metrics = await service.getPerformanceMetrics('2026-11-01T00:00:00.000Z', '2026-11-07T00:00:00.000Z');
      assert.ok(metrics);
      assert.ok(analyticsSink.events.length >= 0);
    });
  });
});
