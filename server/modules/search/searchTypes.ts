import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../../../src/utils/areaUnit';

export type SearchDealMode = 'buy' | 'rent' | 'all';
export type SearchPropertyType = 'residential' | 'commercial' | 'office' | 'villa' | 'all';
export type SearchSortField = 'relevance' | 'price_asc' | 'price_desc' | 'sqm_asc' | 'sqm_desc' | 'discount_desc' | 'newest';

export interface SearchListingDocument {
  readonly id: string;
  readonly cityId: string;
  readonly hoodId: number;
  readonly hoodName: string;
  readonly title: string;
  readonly street: string;
  readonly sqm: number;
  readonly dealType: 'خرید' | 'اجاره';
  readonly propertyType: SearchPropertyType;
  readonly priceMillions: number;
  readonly priceText: string;
  readonly priceIntlText?: string;
  readonly discountPercent: number;
  readonly buyerProfitText: string;
  readonly hasParking?: boolean;
  readonly hasElevator?: boolean;
  readonly hasStorage?: boolean;
  readonly buildingAgeYears?: number;
  readonly floorNumber?: number;
  readonly totalFloors?: number;
  readonly lifecycleState: 'published' | 'approved';
  readonly contactVisibility: 'publicly_visible' | 'reveal_on_action' | 'authorized_only' | 'not_available';
  readonly contactPhone?: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface SearchQueryParams {
  readonly query?: string;
  readonly cityId?: string;
  readonly hoodId?: number;
  readonly dealMode?: SearchDealMode;
  readonly propertyType?: SearchPropertyType;
  readonly minPriceMillions?: number;
  readonly maxPriceMillions?: number;
  readonly minSqm?: number;
  readonly maxSqm?: number;
  readonly hasParking?: boolean;
  readonly hasElevator?: boolean;
  readonly hasStorage?: boolean;
  readonly maxBuildingAgeYears?: number;
  readonly sortBy?: SearchSortField;
  readonly limit?: number;
  readonly cursor?: string | null;
}

export interface SearchQueryValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly sanitizedParams?: SearchQueryParams;
}

export interface SearchResultSummary {
  readonly totalMatches: number;
  readonly returnedMatches: number;
  readonly minPriceMillions: number | null;
  readonly maxPriceMillions: number | null;
  readonly avgPriceMillions: number | null;
  readonly avgSqm: number | null;
  readonly cityId: string;
  readonly activeDealMode: SearchDealMode;
  readonly benchmarkIntlText: string;
  readonly areaUnitLabel: string;
}

export interface SearchExecutionResponse {
  readonly items: SearchListingDocument[];
  readonly summary: SearchResultSummary;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly executionTimeMs: number;
}

export function formatSearchBenchmarkIntl(
  amountMillionToman: number,
  currency: IntlCurrencyCode = 'USD',
  areaUnit: AreaUnit = 'sqm'
): { currencyText: string; areaUnitLabel: string } {
  return {
    currencyText: formatMillionTomanAsIntlCurrency(amountMillionToman, currency),
    areaUnitLabel: formatAreaUnitLabel(areaUnit),
  };
}
