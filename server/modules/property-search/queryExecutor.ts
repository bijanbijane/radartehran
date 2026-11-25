/**
 * Property Search Query Execution Pipeline
 * (`server/modules/property-search/queryExecutor.ts`)
 * Exclusive ownership: `server/modules/property-search/`
 */

import type {
  GeographySearchAdapter,
  ListingDataSourceAdapter,
  SponsorsSearchAdapter,
  ValuationSearchAdapter,
} from './contracts';
import { calculateDistanceMeters, sortSearchResults } from './rankingAndSorting';
import type {
  PropertySearchQueryFilters,
  PropertySearchRequest,
  PropertySearchResponse,
  SearchResultAggregations,
  SearchResultFacetBucket,
  SearchPropertyItem,
  SponsoredSearchPlacement,
} from './types';
import { normalizePersianText } from './validation';
import {
  CURSOR_VERSION,
  buildQueryFingerprint,
  decodeStableSearchCursor,
  encodeStableSearchCursor,
  sortTupleForItem,
  InvalidSearchCursorError,
  StaleSearchCursorError,
} from './propertySearchStableCursor';

/** @deprecated Offset cursors removed — use stable signed cursors */
export function encodeCursor(_offset: number): string {
  throw new InvalidSearchCursorError('Offset cursors are no longer supported');
}

/** @deprecated */
export function decodeCursor(_cursorStr?: string): { offset: number } {
  throw new InvalidSearchCursorError('Offset cursors are no longer supported');
}

/**
 * Evaluates whether an individual listing satisfies all active query filters.
 * Missing fields on the listing are treated as unspecified and rejected if the filter is mandatory.
 */
export function matchesSearchFilters(
  item: SearchPropertyItem,
  filters: PropertySearchQueryFilters,
): boolean {
  // 1. Category & Subtype
  if (filters.category && item.category !== filters.category) return false;
  if (filters.subtype && item.subtype !== filters.subtype) return false;

  // 2. Deal Type
  if (filters.dealType && item.dealType !== filters.dealType) return false;

  // 3. City & Neighborhood
  if (filters.cityId && item.cityId.toLowerCase() !== filters.cityId.toLowerCase()) return false;
  if (filters.neighborhoodIds && filters.neighborhoodIds.length > 0) {
    if (!filters.neighborhoodIds.includes(item.hoodId)) return false;
  }

  // 4. Keyword text search
  if (filters.keyword) {
    const kw = normalizePersianText(filters.keyword);
    const inTitle = normalizePersianText(item.title).includes(kw);
    const inStreet = normalizePersianText(item.street ?? '').includes(kw);
    const inHood = normalizePersianText(item.hoodNameFa ?? '').includes(kw);
    const inDesc = normalizePersianText(item.descriptionSnippetFa ?? '').includes(kw);
    if (!inTitle && !inStreet && !inHood && !inDesc) return false;
  }

  // 5. Geographic Bounding Box
  if (filters.boundingBox) {
    if (!item.coordinates) return false;
    const { minLat, maxLat, minLng, maxLng } = filters.boundingBox;
    if (
      item.coordinates.lat < minLat ||
      item.coordinates.lat > maxLat ||
      item.coordinates.lng < minLng ||
      item.coordinates.lng > maxLng
    ) {
      return false;
    }
  }

  // 6. Proximity / Nearby filter
  if (filters.nearLocation) {
    if (!item.coordinates) return false;
    const dist = calculateDistanceMeters(
      filters.nearLocation.lat,
      filters.nearLocation.lng,
      item.coordinates.lat,
      item.coordinates.lng,
    );
    if (dist > filters.nearLocation.radiusMeters) return false;
  }

  // 7. Asking Price Filters (Sale)
  if (filters.minAskingPriceMillion !== undefined) {
    if (item.askingPriceTotalMillion === undefined || item.askingPriceTotalMillion < filters.minAskingPriceMillion) return false;
  }
  if (filters.maxAskingPriceMillion !== undefined) {
    if (item.askingPriceTotalMillion === undefined || item.askingPriceTotalMillion > filters.maxAskingPriceMillion) return false;
  }

  // 8. Monthly Rent Filters (Rent)
  if (filters.minMonthlyRentMillion !== undefined) {
    if (item.monthlyRentMillion === undefined || item.monthlyRentMillion < filters.minMonthlyRentMillion) return false;
  }
  if (filters.maxMonthlyRentMillion !== undefined) {
    if (item.monthlyRentMillion === undefined || item.monthlyRentMillion > filters.maxMonthlyRentMillion) return false;
  }

  // 9. Deposit / Rahn Filters (Rent)
  if (filters.minDepositMillion !== undefined) {
    if (item.depositMillion === undefined || item.depositMillion < filters.minDepositMillion) return false;
  }
  if (filters.maxDepositMillion !== undefined) {
    if (item.depositMillion === undefined || item.depositMillion > filters.maxDepositMillion) return false;
  }

  // 10. Price per Sqm
  if (filters.minPricePerSqmMillion !== undefined) {
    if (item.askingPricePerSqmMillion === undefined || item.askingPricePerSqmMillion < filters.minPricePerSqmMillion) return false;
  }
  if (filters.maxPricePerSqmMillion !== undefined) {
    if (item.askingPricePerSqmMillion === undefined || item.askingPricePerSqmMillion > filters.maxPricePerSqmMillion) return false;
  }

  // 11. Area (Sqm)
  if (filters.minAreaSqm !== undefined && item.areaSqm < filters.minAreaSqm) return false;
  if (filters.maxAreaSqm !== undefined && item.areaSqm > filters.maxAreaSqm) return false;

  // 12. Rooms
  if (filters.minRooms !== undefined) {
    if (item.rooms === undefined || item.rooms < filters.minRooms) return false;
  }
  if (filters.maxRooms !== undefined) {
    if (item.rooms === undefined || item.rooms > filters.maxRooms) return false;
  }

  // 13. Building Age
  if (filters.minBuildingAgeYears !== undefined) {
    if (item.buildingAgeYears === undefined || item.buildingAgeYears < filters.minBuildingAgeYears) return false;
  }
  if (filters.maxBuildingAgeYears !== undefined) {
    if (item.buildingAgeYears === undefined || item.buildingAgeYears > filters.maxBuildingAgeYears) return false;
  }

  // 14. Floor
  if (filters.minFloor !== undefined) {
    if (item.floor === undefined || item.floor < filters.minFloor) return false;
  }
  if (filters.maxFloor !== undefined) {
    if (item.floor === undefined || item.floor > filters.maxFloor) return false;
  }

  // 15. Features
  if (filters.hasParking === true && !item.hasParking) return false;
  if (filters.hasElevator === true && !item.hasElevator) return false;
  if (filters.hasStorage === true && !item.hasStorage) return false;
  if (filters.hasBalcony === true && !item.hasBalcony) return false;

  // 16. Condition and Construction
  if (filters.renovationCondition && item.renovationCondition !== filters.renovationCondition) return false;
  if (filters.constructionStatus && item.constructionStatus !== filters.constructionStatus) return false;

  // 17. Commercial / Office Characteristics
  if (filters.minShopFrontageMeters !== undefined) {
    if (item.shopFrontageMeters === undefined || item.shopFrontageMeters < filters.minShopFrontageMeters) return false;
  }
  if (filters.hasCommercialLicense === true && !item.hasCommercialLicense) return false;
  if (filters.suitableForMedical === true && !item.suitableForMedical) return false;

  // 18. Verification Status
  if (filters.onlyVerified === true && !item.isVerifiedListing) return false;

  // 19. Valuation Comparison Ratio
  if (filters.maxPriceToValuationRatio !== undefined) {
    if (!item.valuationBenchmark || item.askingPriceTotalMillion === undefined) return false;
    const ratio = item.askingPriceTotalMillion / item.valuationBenchmark.estimatedMarketValueMillion;
    if (ratio > filters.maxPriceToValuationRatio) return false;
  }

  // 20. Publication Timestamps
  if (filters.publishedAfterIso && item.publishedAtIso < filters.publishedAfterIso) return false;
  if (filters.publishedBeforeIso && item.publishedAtIso > filters.publishedBeforeIso) return false;

  return true;
}

/**
 * Computes search facets / aggregations over filtered matches.
 */
export function buildSearchResultAggregations(items: readonly SearchPropertyItem[]): SearchResultAggregations {
  const catCounts = new Map<string, number>();
  const dealCounts = new Map<string, number>();
  const hoodCounts = new Map<number, { nameFa: string; count: number }>();
  let under5B = 0;
  let between5And10B = 0;
  let between10And20B = 0;
  let over20B = 0;
  let under60m = 0;
  let between60And90m = 0;
  let between90And120m = 0;
  let over120m = 0;

  for (const item of items) {
    catCounts.set(item.category, (catCounts.get(item.category) ?? 0) + 1);
    dealCounts.set(item.dealType, (dealCounts.get(item.dealType) ?? 0) + 1);

    const hoodKey = item.hoodId;
    const curHood = hoodCounts.get(hoodKey) ?? { nameFa: item.hoodNameFa ?? `محله ${item.hoodId}`, count: 0 };
    curHood.count++;
    hoodCounts.set(hoodKey, curHood);

    // Price brackets (sale total or rent rahn)
    const price = item.askingPriceTotalMillion ?? item.depositMillion ?? 0;
    if (price > 0) {
      if (price < 5000) under5B++;
      else if (price < 10000) between5And10B++;
      else if (price < 20000) between10And20B++;
      else over20B++;
    }

    // Area brackets
    if (item.areaSqm < 60) under60m++;
    else if (item.areaSqm < 90) between60And90m++;
    else if (item.areaSqm < 120) between90And120m++;
    else over120m++;
  }

  const categoryBuckets: SearchResultFacetBucket[] = [
    { key: 'residential', labelFa: 'مسکونی', count: catCounts.get('residential') ?? 0 },
    { key: 'commercial', labelFa: 'تجاری', count: catCounts.get('commercial') ?? 0 },
    { key: 'office', labelFa: 'اداری', count: catCounts.get('office') ?? 0 },
    { key: 'land', labelFa: 'زمین و کلنگی', count: catCounts.get('land') ?? 0 },
  ].filter((b) => b.count > 0);

  const dealTypeBuckets: SearchResultFacetBucket[] = [
    { key: 'sale', labelFa: 'خرید و فروش', count: dealCounts.get('sale') ?? 0 },
    { key: 'rent', labelFa: 'رهن و اجاره', count: dealCounts.get('rent') ?? 0 },
  ].filter((b) => b.count > 0);

  const priceRangeBuckets: SearchResultFacetBucket[] = [
    { key: 'under_5b', labelFa: 'کمتر از ۵ میلیارد تومان', count: under5B },
    { key: '5b_10b', labelFa: '۵ تا ۱۰ میلیارد تومان', count: between5And10B },
    { key: '10b_20b', labelFa: '۱۰ تا ۲۰ میلیارد تومان', count: between10And20B },
    { key: 'over_20b', labelFa: 'بیش از ۲۰ میلیارد تومان', count: over20B },
  ];

  const areaRangeBuckets: SearchResultFacetBucket[] = [
    { key: 'under_60', labelFa: 'زیر ۶۰ متر', count: under60m },
    { key: '60_90', labelFa: '۶۰ تا ۹۰ متر', count: between60And90m },
    { key: '90_120', labelFa: '۹۰ تا ۱۲۰ متر', count: between90And120m },
    { key: 'over_120', labelFa: 'بالای ۱۲۰ متر', count: over120m },
  ];

  const topNeighborhoodBuckets: SearchResultFacetBucket[] = [...hoodCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([hoodId, data]) => ({ key: String(hoodId), labelFa: data.nameFa, count: data.count }));

  return {
    totalMatches: items.length,
    categoryBuckets,
    dealTypeBuckets,
    priceRangeBuckets,
    areaRangeBuckets,
    topNeighborhoodBuckets,
  };
}

/**
 * Orchestrates search execution pipeline:
 * 1. Resolves geographic hierarchy via Geography adapter.
 * 2. Fetches listings from ListingDataSourceAdapter.
 * 3. Enriches with Valuation comparison benchmarks where applicable.
 * 4. Applies in-memory filters and deterministic sorting.
 * 5. Applies stable pagination via decoded cursors.
 * 6. Retrieves distinct sponsored placements via Sponsors adapter.
 */
export async function executePropertySearchPipeline(
  request: PropertySearchRequest,
  deps: {
    listingDataSource: ListingDataSourceAdapter;
    geographyAdapter: GeographySearchAdapter;
    valuationAdapter?: ValuationSearchAdapter;
    sponsorsAdapter?: SponsorsSearchAdapter;
    nowFn?: () => number;
  },
): Promise<PropertySearchResponse> {
  const startTime = deps.nowFn ? deps.nowFn() : Date.now();
  const filters: PropertySearchQueryFilters = { ...request.filters };

  // 1. Resolve district or proximity into neighborhood IDs if needed
  if (filters.cityId && filters.districtId && (!filters.neighborhoodIds || filters.neighborhoodIds.length === 0)) {
    const districtHoods = await deps.geographyAdapter.getNeighborhoodsInDistrict(filters.cityId, filters.districtId);
    if (districtHoods.length > 0) {
      filters.neighborhoodIds = districtHoods;
    }
  }

  if (filters.nearLocation && (!filters.neighborhoodIds || filters.neighborhoodIds.length === 0)) {
    const nearbyHoods = await deps.geographyAdapter.getNearbyNeighborhoods(
      filters.nearLocation.lat,
      filters.nearLocation.lng,
      filters.nearLocation.radiusMeters,
    );
    if (nearbyHoods.length > 0) {
      filters.neighborhoodIds = nearbyHoods;
    }
  }

  // 2. Query listings from data source with a bounded limit
  const fetchLimit = Math.min(Math.max(request.limit ?? 20, 100), 500);
  const { listings, totalEstimated, sourceExhausted: adapterExhausted } = await deps.listingDataSource.queryApprovedListings({
    category: filters.category,
    dealType: filters.dealType,
    cityId: filters.cityId,
    neighborhoodIds: filters.neighborhoodIds,
    limit: fetchLimit,
    minAskingPriceMillion: filters.minAskingPriceMillion,
    maxAskingPriceMillion: filters.maxAskingPriceMillion,
    minAreaSqm: filters.minAreaSqm,
    maxAreaSqm: filters.maxAreaSqm,
    bedroomsMin: filters.minRooms,
    constructionStatus: filters.constructionStatus,
    verifiedOnly: filters.onlyVerified,
    boundingBox: filters.boundingBox,
  });

  // 3. Optional valuation enrichment for comparative analytical ranking
  if (deps.valuationAdapter && listings.length > 0) {
    await Promise.all(
      listings.slice(0, 50).map(async (item) => {
        if (!item.valuationBenchmark && item.askingPriceTotalMillion && item.areaSqm > 0) {
          try {
            const bench = await deps.valuationAdapter!.getValuationBenchmark({
              cityId: item.cityId,
              hoodId: item.hoodId,
              category: item.category,
              dealType: item.dealType,
              sqm: item.areaSqm,
            });
            if (bench) {
              const diffPercent = Math.round(
                ((item.askingPriceTotalMillion - bench.estimatedMarketValueMillion) /
                  bench.estimatedMarketValueMillion) *
                  100,
              );
              item.valuationBenchmark = {
                estimatedMarketValueMillion: bench.estimatedMarketValueMillion,
                valuationConfidence: bench.confidence,
                differencePercent: diffPercent,
              };
            }
          } catch {
            // Failure to fetch valuation benchmark never aborts organic search
          }
        }
      }),
    );
  }

  // 4. Filter matches
  const matched = listings.filter((item) => matchesSearchFilters(item, filters));

  // 5. Deterministic sorting
  const sortMode = request.sort ?? 'newest';
  const sorted = sortSearchResults(matched, sortMode, filters);

  // 6. Stable cursor pagination
  const limit = Math.min(request.limit ?? 20, 100);
  const queryFingerprint = buildQueryFingerprint(filters, sortMode);
  let startIdx = 0;
  if (request.cursor) {
    const decoded = decodeStableSearchCursor(request.cursor, queryFingerprint);
    const anchorIdx = sorted.findIndex((item) => item.id === decoded.stableRecordId);
    if (anchorIdx < 0) throw new StaleSearchCursorError('Cursor position not found in current result set');
    startIdx = anchorIdx + 1;
  }
  const pagedItems = sorted.slice(startIdx, startIdx + limit);
  const hasMore = startIdx + limit < sorted.length;
  const last = pagedItems[pagedItems.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeStableSearchCursor({
          ...sortTupleForItem(last, sortMode),
          queryFingerprint,
          sortMode,
          sourceWatermark: String(totalEstimated ?? sorted.length),
          cursorVersion: CURSOR_VERSION,
        })
      : undefined;
  const sourceExhausted = Boolean(adapterExhausted) || listings.length >= fetchLimit;
  const countAccuracy = sourceExhausted ? 'BOUNDED_PARTIAL_TOTAL' : 'EXACT_TOTAL';
  const totalEstimatedCount = sourceExhausted ? sorted.length : Math.max(sorted.length, totalEstimated ?? sorted.length);

  // 7. Aggregations over all matched results
  const aggregations = buildSearchResultAggregations(sorted);

  // 8. Sponsor placements (strictly partitioned from organic results)
  let sponsoredPlacements: SponsoredSearchPlacement[] | undefined;
  if (deps.sponsorsAdapter && filters.cityId && filters.neighborhoodIds && filters.neighborhoodIds.length === 1) {
    try {
      sponsoredPlacements = await deps.sponsorsAdapter.getActivePlacementsForSlot(
        filters.cityId,
        filters.neighborhoodIds[0],
      );
    } catch {
      // Sponsor service failure never breaks core search
    }
  }

  const durationMs = (deps.nowFn ? deps.nowFn() : Date.now()) - startTime;

  return {
    items: pagedItems,
    sponsoredPlacements: sponsoredPlacements && sponsoredPlacements.length > 0 ? sponsoredPlacements : undefined,
    totalEstimatedCount,
    countAccuracy,
    sourceExhausted,
    nextCursor,
    hasMore,
    appliedSort: sortMode,
    appliedFilters: filters,
    aggregations,
    executionMetrics: {
      durationMs,
      cacheHit: false,
    },
  };
}
