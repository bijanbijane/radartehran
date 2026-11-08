/**
 * Property Search Ranking and Deterministic Sorting Engine
 * (`server/modules/property-search/rankingAndSorting.ts`)
 * Exclusive ownership: `server/modules/property-search/`
 */

import type {
  PropertySearchQueryFilters,
  SearchPropertyItem,
  SearchSortMode,
} from './types';
import { normalizePersianText } from './validation';

/**
 * Computes Haversine / geodesic distance in meters between two coordinates.
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Resolves a normalized numeric price for sorting purposes:
 * - For sale: askingPriceTotalMillion
 * - For rent: monthlyRentMillion, or fallback depositMillion
 */
export function resolveComparablePrice(item: SearchPropertyItem): number {
  if (item.dealType === 'rent') {
    if (item.monthlyRentMillion !== undefined && item.monthlyRentMillion > 0) {
      return item.monthlyRentMillion;
    }
    if (item.depositMillion !== undefined) {
      return item.depositMillion;
    }
    return 0;
  }
  return item.askingPriceTotalMillion ?? 0;
}

/**
 * RELEVANCE RANKING MODEL SPECIFICATION
 * =====================================
 * Organic relevance score is computed reproducibly (0 to 100 points) using explicit factors:
 *
 * 1. Keyword Text Match (Weight: 35 points):
 *    - Full exact phrase in title: 35 pts
 *    - Full exact phrase in street or description: 25 pts
 *    - Partial word/token matches in title/street: 10 - 20 pts
 *
 * 2. Category & Subtype Specificity (Weight: 20 points):
 *    - Exact requested category & subtype match: 20 pts
 *    - Exact requested category match: 15 pts
 *
 * 3. Geographic Specificity (Weight: 20 points):
 *    - Exact requested neighborhood target match: 20 pts
 *    - City-level match: 10 pts
 *
 * 4. Value Attractiveness Benchmark (Weight: 15 points):
 *    - Verified valuation benchmark indicating bargain (asking price <= 95% of estimate): 15 pts
 *    - Fair market price (asking price between 95% - 105% of estimate): 10 pts
 *    - Unbenchmarked or above estimate: 0 pts
 *
 * 5. Verified Listing Status (Weight: 10 points):
 *    - Listing carries trusted verification signal: 10 pts
 *    - Unverified: 0 pts
 *
 * Paid placement is STRICTLY PROHIBITED from altering this score.
 */
export function calculateOrganicRelevanceScore(
  item: SearchPropertyItem,
  filters: PropertySearchQueryFilters,
): number {
  let score = 0;

  // 1. Keyword Text Match (Max 35)
  if (filters.keyword) {
    const kw = normalizePersianText(filters.keyword);
    const normTitle = normalizePersianText(item.title);
    const normStreet = normalizePersianText(item.street ?? '');
    const normHood = normalizePersianText(item.hoodNameFa ?? '');
    const normDesc = normalizePersianText(item.descriptionSnippetFa ?? '');

    if (normTitle.includes(kw)) {
      score += 35;
    } else if (normStreet.includes(kw) || normHood.includes(kw) || normDesc.includes(kw)) {
      score += 25;
    } else {
      const tokens = kw.split(' ').filter((t) => t.length >= 2);
      let matchCount = 0;
      for (const token of tokens) {
        if (normTitle.includes(token) || normStreet.includes(token) || normHood.includes(token)) matchCount++;
      }
      if (tokens.length > 0) {
        const ratio = matchCount / tokens.length;
        score += Math.round(ratio * 20);
      }
    }
  } else {
    // Default baseline when no specific keyword is provided
    score += 20;
  }

  // 2. Category & Subtype Match (Max 20)
  if (filters.category && item.category === filters.category) {
    if (filters.subtype && item.subtype === filters.subtype) {
      score += 20;
    } else {
      score += 15;
    }
  } else if (!filters.category) {
    score += 10;
  }

  // 3. Geographic Match (Max 20)
  if (filters.neighborhoodIds && filters.neighborhoodIds.length > 0) {
    if (filters.neighborhoodIds.includes(item.hoodId)) {
      score += 20;
    }
  } else if (filters.cityId && item.cityId === filters.cityId) {
    score += 15;
  } else {
    score += 10;
  }

  // 4. Value Attractiveness Benchmark (Max 15)
  if (item.valuationBenchmark) {
    const diff = item.valuationBenchmark.differencePercent;
    if (diff <= -5) {
      // Bargain / Below market estimate
      score += 15;
    } else if (diff <= 5) {
      // Fair market price
      score += 10;
    }
  }

  // 5. Verified Listing Status (Max 10)
  if (item.isVerifiedListing) {
    score += 10;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Sorts search results deterministically according to the requested sort mode.
 * Always employs a secondary and tertiary tie-breaker (publishedAtIso desc, then id)
 * to prevent unstable pagination across query pages.
 */
export function sortSearchResults(
  items: SearchPropertyItem[],
  sortMode: SearchSortMode,
  filters: PropertySearchQueryFilters,
): SearchPropertyItem[] {
  // If relevance sorting, attach computed scores first
  if (sortMode === 'relevance') {
    for (const item of items) {
      item.relevanceScore = calculateOrganicRelevanceScore(item, filters);
    }
  }

  const sorted = [...items];

  sorted.sort((a, b) => {
    switch (sortMode) {
      case 'newest': {
        const timeDiff = b.publishedAtIso.localeCompare(a.publishedAtIso);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      }
      case 'oldest': {
        const timeDiff = a.publishedAtIso.localeCompare(b.publishedAtIso);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      }
      case 'price_asc': {
        const pA = resolveComparablePrice(a);
        const pB = resolveComparablePrice(b);
        if (pA !== pB) return pA - pB;
        const timeDiff = b.publishedAtIso.localeCompare(a.publishedAtIso);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      }
      case 'price_desc': {
        const pA = resolveComparablePrice(a);
        const pB = resolveComparablePrice(b);
        if (pA !== pB) return pB - pA;
        const timeDiff = b.publishedAtIso.localeCompare(a.publishedAtIso);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      }
      case 'area_asc': {
        if (a.areaSqm !== b.areaSqm) return a.areaSqm - b.areaSqm;
        return a.id.localeCompare(b.id);
      }
      case 'area_desc': {
        if (a.areaSqm !== b.areaSqm) return b.areaSqm - a.areaSqm;
        return a.id.localeCompare(b.id);
      }
      case 'geo_proximity': {
        if (filters.nearLocation && a.coordinates && b.coordinates) {
          const distA = calculateDistanceMeters(
            filters.nearLocation.lat,
            filters.nearLocation.lng,
            a.coordinates.lat,
            a.coordinates.lng,
          );
          const distB = calculateDistanceMeters(
            filters.nearLocation.lat,
            filters.nearLocation.lng,
            b.coordinates.lat,
            b.coordinates.lng,
          );
          if (distA !== distB) return distA - distB;
        }
        const timeDiff = b.publishedAtIso.localeCompare(a.publishedAtIso);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      }
      case 'relevance':
      default: {
        const scoreA = a.relevanceScore ?? 0;
        const scoreB = b.relevanceScore ?? 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        const timeDiff = b.publishedAtIso.localeCompare(a.publishedAtIso);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      }
    }
  });

  return sorted;
}
