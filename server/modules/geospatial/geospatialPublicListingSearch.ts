import { executeBoundedSpatialSearch } from './poiAndSpatialSearchEngine';
import { isListingEligibleForPublicSpatialSearch, toPublicSpatialListing } from './publicSpatialProjection';
import type { SpatialPublishableListing, SpatialSearchQuery, SpatialSearchResult } from './types';

export function executePublicSpatialListingSearch(
  spatialListingsByCity: Map<string, Map<string, SpatialPublishableListing>>,
  query: SpatialSearchQuery,
): SpatialSearchResult {
  const cityMap = spatialListingsByCity.get(query.cityId);
  const indexedListings = cityMap
    ? Array.from(cityMap.values())
        .filter((listing) => isListingEligibleForPublicSpatialSearch(listing))
        .map((listing) => toPublicSpatialListing(listing))
    : [];
  return executeBoundedSpatialSearch({
    query,
    indexedListingsByCity: indexedListings,
  });
}