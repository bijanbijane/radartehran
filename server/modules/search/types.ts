import type {
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../core';

export type SearchCityId = 'tehran' | 'karaj' | 'mashhad' | 'isfahan' | 'shiraz';

export type SearchDealType = 'خرید' | 'اجاره';

export type SearchSortOption =
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'sqm_desc'
  | 'sqm_asc';

export interface DiscoverablePublicListing {
  id: string;
  cityId: SearchCityId;
  hoodId: number;
  hoodName?: string;
  title: string;
  type: SearchDealType;
  sqm: number;
  priceText: string;
  priceNumericMillion?: number;
  rentNumericMillion?: number;
  discountPercent: number;
  buyerProfitText: string;
  street: string;
  imageUrl?: string;
  imageUrls?: string[];
  createdAtIso: string;
  approvedAtIso?: string;
  expiresAtIso?: string;
}

export interface SearchFilterQuery {
  keyword?: string;
  cityId?: SearchCityId;
  hoodIds?: number[];
  type?: SearchDealType;
  minPriceMillion?: number;
  maxPriceMillion?: number;
  minRentMillion?: number;
  maxRentMillion?: number;
  minSqm?: number;
  maxSqm?: number;
  minDiscountPercent?: number;
  sort?: SearchSortOption;
  limit?: number;
  cursor?: string;
}

export interface SearchResultPage {
  items: DiscoverablePublicListing[];
  nextCursor?: string;
  totalEstimatedCount?: number;
  appliedSort: SearchSortOption;
  appliedFilters: Omit<SearchFilterQuery, 'cursor' | 'limit'>;
}

/**
 * Interface for reading canonical listings without coupling to any specific database or RAM store.
 */
export interface ListingReadDataSourceAdapter {
  queryPublicApprovedListings: (params: {
    cityId?: SearchCityId;
    hoodIds?: number[];
    type?: SearchDealType;
    limit: number;
  }) => Promise<DiscoverablePublicListing[]>;
}

export interface StoredSavedSearch {
  id: string;
  ownerUid: string;
  titleFa: string;
  filterQuery: Omit<SearchFilterQuery, 'cursor' | 'limit'>;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export interface SaveSearchConfigInput {
  titleFa: string;
  filterQuery: Omit<SearchFilterQuery, 'cursor' | 'limit'>;
}

export interface SearchModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  txRunner: TransactionRunnerAdapter;
  listingDataSource: ListingReadDataSourceAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  nowFn?: () => number;
}
