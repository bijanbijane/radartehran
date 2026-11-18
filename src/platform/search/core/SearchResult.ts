/**
 * @file src/platform/search/core/SearchResult.ts
 * @description Canonical SearchResultItem, grouped discovery responses, and metadata contracts.
 */

import type { AreaValue, MoneyValue, RecognizedSearchEntity, SearchGeoBounds, SearchScope, SearchUiDisplayState } from './SearchTypes';

export type SearchHitDomainType =
  | 'property'
  | 'listing'
  | 'building'
  | 'neighborhood'
  | 'service'
  | 'market-analytics';

export interface SearchHitPricing {
  transactionMode: 'buy' | 'rent' | 'rahn_full';
  totalBuyPrice?: MoneyValue | null;
  pricePerSqm?: MoneyValue | null;
  estimatedDealPricePerSqm?: MoneyValue | null;
  rahnDeposit?: MoneyValue | null;
  monthlyRent?: MoneyValue | null;
  confidence: 'verified' | 'estimated' | 'unknown';
}

export interface SearchResultHit {
  id: string;
  domainType: SearchHitDomainType;
  titleFa: string;
  subtitleFa?: string;
  cityId: string;
  cityNameFa: string;
  neighborhoodId?: string;
  neighborhoodNameFa?: string;
  canonicalUrl: string;
  coordinates?: {
    latitude: number;
    longitude: number;
    precision: 'exact' | 'building' | 'street' | 'neighborhood' | 'approximate';
  };
  area?: AreaValue | null;
  pricing?: SearchHitPricing | null;
  sampleCount?: number | null;
  updatedAtIso?: string | null;
  status?: 'active' | 'expired' | 'verified' | 'draft';
  thumbnailUrl?: string | null;
  highlights?: string[];
  score: number;
}

export interface SearchResultDomainGroup {
  domainType: SearchHitDomainType;
  titleFa: string;
  items: SearchResultHit[];
  totalAvailable: number | null;
  status: 'ok' | 'partial' | 'failed';
  errorMessageFa?: string;
}

export interface UnifiedSearchExecutionResponse {
  requestId: string;
  rawQuery: string;
  normalizedQuery: string;
  scope: SearchScope;
  displayState: SearchUiDisplayState;
  recognizedEntities: RecognizedSearchEntity[];
  items: SearchResultHit[];
  groups: SearchResultDomainGroup[];
  totalReceivedCount: number;
  totalServerCount: number | null;
  page: number;
  pageSize: number;
  nextCursor?: string | null;
  appliedFilterCount: number;
  activeBounds?: SearchGeoBounds;
  fromCache: boolean;
  latencyMs: number;
  failedDomains: SearchHitDomainType[];
  warningsFa: string[];
}
