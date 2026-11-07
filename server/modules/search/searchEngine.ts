import { serverPublishedBargains, type ServerPublishedBargainRecord } from '../../../src/utils/serverPublisherBargains';
import { getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../../../src/data/multiCityData';
import { computeBoundedLevenshteinDistance } from '../../../src/utils/searchEngineeringEngine';
import { formatSearchBenchmarkIntl, type SearchExecutionResponse, type SearchListingDocument, type SearchQueryParams, type SearchResultSummary } from './searchTypes';
import { normalizePersianSearchQuery } from './searchValidator';

export class PropertySearchEngine {
  private readonly queryCostBudgetMax = 500;

  /**
   * Fetches approved and active public listings from canonical storage and static datasets.
   * STRICT ACCESS CONTROL: Completely excludes 'pending', 'rejected', or 'archived' listings.
   */
  public getEligiblePublicListings(cityFilter?: string): SearchListingDocument[] {
    const documents: SearchListingDocument[] = [];
    const seenIds = new Set<string>();

    // 1. From canonical ServerPublishedBargains
    for (const record of serverPublishedBargains.values()) {
      if (record.lifecycleState !== 'published') {
        continue;
      }
      if (cityFilter && record.cityId !== cityFilter) {
        continue;
      }

      documents.push({
        id: record.id,
        cityId: record.cityId,
        hoodId: record.hoodId,
        hoodName: record.hoodName,
        title: record.title,
        street: record.street,
        sqm: record.sqm,
        dealType: record.dealType,
        propertyType: 'residential',
        priceMillions: record.priceMillions,
        priceText: record.priceText,
        priceIntlText: record.priceIntlText,
        discountPercent: record.discountPercent,
        buyerProfitText: record.buyerProfitText,
        lifecycleState: 'published',
        contactVisibility: record.contactVisibility || 'not_available',
        contactPhone: record.contactVisibility === 'publicly_visible' ? record.contactPhone : undefined,
        createdAtIso: record.createdAtIso,
        updatedAtIso: record.updatedAtIso,
      });
      seenIds.add(record.id);
    }

    // 2. From official MultiCity dataset bargains
    const allHoods = getAllMultiCityNeighborhoods();
    for (const hood of allHoods) {
      const cityId = (hood as { cityId?: string }).cityId || resolveCityIdForNeighborhood(hood.id);
      if (cityFilter && cityId !== cityFilter) continue;

      for (const b of (hood.bargains || [])) {
        if (seenIds.has(b.id)) continue;
        seenIds.add(b.id);

        const dealType = b.type === 'اجاره' ? 'اجاره' : 'خرید';
        const pricePerSqm = hood.buyPerSqm || 100;
        const priceMillions = Math.round(pricePerSqm * (1 - (b.discountPercent || 15) / 100) * b.sqm);

        documents.push({
          id: b.id,
          cityId,
          hoodId: hood.id,
          hoodName: hood.name,
          title: b.title,
          street: b.street || hood.name,
          sqm: b.sqm,
          dealType,
          propertyType: 'residential',
          priceMillions,
          priceText: b.priceText,
          discountPercent: b.discountPercent,
          buyerProfitText: b.buyerProfitText,
          lifecycleState: 'published',
          contactVisibility: 'reveal_on_action',
          createdAtIso: '2026-01-01T00:00:00.000Z',
          updatedAtIso: '2026-01-01T00:00:00.000Z',
        });
      }
    }

    return documents;
  }

  /**
   * Executes multi-dimensional filtering, Persian text scoring, sorting, and cursor pagination.
   */
  public executeSearch(params: SearchQueryParams): SearchExecutionResponse {
    const startTime = Date.now();
    let candidates = this.getEligiblePublicListings(params.cityId);

    // Apply strict filters
    if (params.hoodId !== undefined) {
      candidates = candidates.filter((c) => c.hoodId === params.hoodId);
    }

    if (params.dealMode && params.dealMode !== 'all') {
      const targetType = params.dealMode === 'buy' ? 'خرید' : 'اجاره';
      candidates = candidates.filter((c) => c.dealType === targetType);
    }

    if (params.propertyType && params.propertyType !== 'all') {
      candidates = candidates.filter((c) => c.propertyType === params.propertyType);
    }

    if (params.minPriceMillions !== undefined) {
      candidates = candidates.filter((c) => c.priceMillions >= params.minPriceMillions!);
    }

    if (params.maxPriceMillions !== undefined) {
      candidates = candidates.filter((c) => c.priceMillions <= params.maxPriceMillions!);
    }

    if (params.minSqm !== undefined) {
      candidates = candidates.filter((c) => c.sqm >= params.minSqm!);
    }

    if (params.maxSqm !== undefined) {
      candidates = candidates.filter((c) => c.sqm <= params.maxSqm!);
    }

    // Persian text relevance scoring
    const query = params.query ? normalizePersianSearchQuery(params.query) : '';
    let scoredListings: Array<{ item: SearchListingDocument; relevanceScore: number }> = [];

    if (query) {
      for (const item of candidates) {
        const normTitle = normalizePersianSearchQuery(item.title);
        const normStreet = normalizePersianSearchQuery(item.street);
        const normHood = normalizePersianSearchQuery(item.hoodName);

        let relevance = 0;
        if (normHood === query || normTitle.includes(query)) {
          relevance = 100;
        } else if (normStreet.includes(query)) {
          relevance = 80;
        } else if (normHood.includes(query)) {
          relevance = 70;
        } else {
          // Bounded fuzzy match for minor Persian typos
          const dist = computeBoundedLevenshteinDistance(normHood, query, 1);
          if (dist <= 1) {
            relevance = 50;
          }
        }

        if (relevance > 0) {
          scoredListings.push({ item, relevanceScore: relevance });
        }
      }
    } else {
      scoredListings = candidates.map((item) => ({ item, relevanceScore: 100 }));
    }

    // Stable Sorting
    const sort = params.sortBy || 'relevance';
    scoredListings.sort((a, b) => {
      if (sort === 'relevance') {
        return b.relevanceScore - a.relevanceScore || b.item.discountPercent - a.item.discountPercent || a.item.id.localeCompare(b.item.id);
      }
      if (sort === 'price_asc') {
        return a.item.priceMillions - b.item.priceMillions || a.item.id.localeCompare(b.item.id);
      }
      if (sort === 'price_desc') {
        return b.item.priceMillions - a.item.priceMillions || a.item.id.localeCompare(b.item.id);
      }
      if (sort === 'sqm_asc') {
        return a.item.sqm - b.item.sqm || a.item.id.localeCompare(b.item.id);
      }
      if (sort === 'sqm_desc') {
        return b.item.sqm - a.item.sqm || a.item.id.localeCompare(b.item.id);
      }
      if (sort === 'discount_desc') {
        return b.item.discountPercent - a.item.discountPercent || a.item.id.localeCompare(b.item.id);
      }
      if (sort === 'newest') {
        return b.item.createdAtIso.localeCompare(a.item.createdAtIso) || a.item.id.localeCompare(b.item.id);
      }
      return a.item.id.localeCompare(b.item.id);
    });

    const totalMatches = scoredListings.length;

    // Build summary
    let minPrice: number | null = null;
    let maxPrice: number | null = null;
    let sumPrice = 0;
    let sumSqm = 0;

    for (const { item } of scoredListings) {
      if (minPrice === null || item.priceMillions < minPrice) minPrice = item.priceMillions;
      if (maxPrice === null || item.priceMillions > maxPrice) maxPrice = item.priceMillions;
      sumPrice += item.priceMillions;
      sumSqm += item.sqm;
    }

    const avgPriceMillions = totalMatches > 0 ? Math.round(sumPrice / totalMatches) : null;
    const avgSqm = totalMatches > 0 ? Math.round(sumSqm / totalMatches) : null;
    const benchmark = formatSearchBenchmarkIntl(avgPriceMillions ?? 8500, 'USD', 'sqm');

    const summary: SearchResultSummary = {
      totalMatches,
      returnedMatches: 0,
      minPriceMillions: minPrice,
      maxPriceMillions: maxPrice,
      avgPriceMillions,
      avgSqm,
      cityId: params.cityId || 'all',
      activeDealMode: params.dealMode || 'all',
      benchmarkIntlText: benchmark.currencyText,
      areaUnitLabel: benchmark.areaUnitLabel,
    };

    // Cursor Pagination
    let startIndex = 0;
    if (params.cursor) {
      const idx = scoredListings.findIndex((entry) => entry.item.id === params.cursor);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const paginatedEntries = scoredListings.slice(startIndex, startIndex + limit);
    const paginatedItems = paginatedEntries.map((e) => e.item);
    const hasMore = startIndex + limit < totalMatches;
    const lastItem = paginatedItems[paginatedItems.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.id : null;

    const finalSummary: SearchResultSummary = {
      ...summary,
      returnedMatches: paginatedItems.length,
    };

    const executionTimeMs = Date.now() - startTime;
    return {
      items: paginatedItems,
      summary: finalSummary,
      nextCursor,
      hasMore,
      executionTimeMs,
    };
  }
}
