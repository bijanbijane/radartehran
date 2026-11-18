/** @file src/features/properties/services/propertySearchService.ts — Pure Discovery Filtering, Sorting & Similar Listings */
import { matchesPersianSearch } from '../../../utils/security';
import {
  parseOptionalNumber,
  type AppliedPropertyFilters,
} from '../filters/PropertyFilterDraft';
import type { AmenityValue } from '../types/property.types';
import type { PropertyListingRecord, TransactionType } from '../types/listing.types';

function matchesTriState(actual: AmenityValue, filter: AmenityValue | 'any'): boolean {
  if (filter === 'any') return true;
  return actual === filter;
}

export function matchesTransactionTypeFilter(
  recordTx: TransactionType,
  filterTx: 'all' | TransactionType,
  monthlyRentMillion?: number | null,
): boolean {
  if (filterTx === 'all') return true;
  if (filterTx === 'rent') {
    return recordTx === 'rent' || recordTx === 'full_deposit';
  }
  if (filterTx === 'full_deposit') {
    if (recordTx === 'full_deposit') return true;
    if (recordTx === 'rent' && (monthlyRentMillion === null || monthlyRentMillion === undefined || monthlyRentMillion === 0)) {
      return true;
    }
    return false;
  }
  return recordTx === filterTx;
}

export function isVerifiedListing(rec: PropertyListingRecord): boolean {
  const v = rec.listing.verification;
  return v.location === 'verified' && v.priceReasonableness === 'verified' && v.freshness === 'verified';
}

export function getEffectiveComparableAmount(rec: PropertyListingRecord): number | null {
  const p = rec.listing.price;
  if (p.priceType === 'undisclosed') return null;
  if (rec.listing.transactionType === 'sale' || rec.listing.transactionType === 'presale') {
    return p.saleTotalMillion;
  }
  return p.depositMillion;
}

export function filterAndSortProperties(
  records: PropertyListingRecord[],
  filters: AppliedPropertyFilters,
  selectedHoodId?: number,
): PropertyListingRecord[] {
  const q = filters.searchQuery.trim();
  const pMin = parseOptionalNumber(filters.priceMinMillion);
  const pMax = parseOptionalNumber(filters.priceMaxMillion);
  const depMax = parseOptionalNumber(filters.depositMaxMillion);
  const rentMax = parseOptionalNumber(filters.rentMaxMillion);
  const aMin = parseOptionalNumber(filters.areaMin);
  const aMax = parseOptionalNumber(filters.areaMax);
  const yearMin = parseOptionalNumber(filters.buildYearMin);

  const filtered = records.filter((rec) => {
    if (rec.listing.status !== 'published') return false;
    if (!matchesTransactionTypeFilter(rec.listing.transactionType, filters.transactionType, rec.listing.price.monthlyRentMillion)) {
      return false;
    }
    if (filters.propertyType !== 'all' && rec.property.propertyType !== filters.propertyType) return false;
    if (filters.onlySelectedHood && selectedHoodId && rec.property.hoodId !== selectedHoodId) return false;
    if (filters.hoodIds.length > 0 && !filters.hoodIds.includes(rec.property.hoodId)) return false;
    if (filters.verifiedOnly && !isVerifiedListing(rec)) return false;

    if (filters.onlyInMapBounds && filters.mapBounds) {
      const { lat, lng, locationPrecision } = rec.property;
      if (locationPrecision === 'unavailable' || lat === null || lng === null) return false;
      const b = filters.mapBounds;
      if (lat > b.north || lat < b.south || lng > b.east || lng < b.west) return false;
    }

    if (q) {
      const hit =
        matchesPersianSearch(rec.listing.title, q) ||
        matchesPersianSearch(rec.property.street, q) ||
        matchesPersianSearch(rec.property.hoodName, q) ||
        matchesPersianSearch(rec.property.zoneName, q);
      if (!hit) return false;
    }

    const area = rec.property.areaSqm;
    if (aMin !== null && (area === null || area < aMin)) return false;
    if (aMax !== null && (area === null || area > aMax)) return false;

    if (filters.roomsMin !== null && (rec.property.roomsCount === null || rec.property.roomsCount < filters.roomsMin)) {
      return false;
    }
    if (yearMin !== null && (rec.property.buildYearJalali === null || rec.property.buildYearJalali < yearMin)) {
      return false;
    }

    if (!matchesTriState(rec.property.unitFeatures.parking, filters.parking)) return false;
    if (!matchesTriState(rec.property.unitFeatures.elevator, filters.elevator)) return false;
    if (!matchesTriState(rec.property.unitFeatures.storage, filters.storage)) return false;

    const totalSale = rec.listing.price.saleTotalMillion;
    if (pMin !== null && (totalSale === null || totalSale < pMin)) return false;
    if (pMax !== null && (totalSale === null || totalSale > pMax)) return false;

    const dep = rec.listing.price.depositMillion;
    if (depMax !== null && (dep === null || dep > depMax)) return false;

    const rent = rec.listing.price.monthlyRentMillion;
    if (rentMax !== null && (rent === null || rent > rentMax)) return false;

    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (filters.sortBy) {
      case 'price_asc': {
        const av = getEffectiveComparableAmount(a);
        const bv = getEffectiveComparableAmount(b);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return av - bv;
      }
      case 'price_desc': {
        const av = getEffectiveComparableAmount(a);
        const bv = getEffectiveComparableAmount(b);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av;
      }
      case 'price_per_sqm_asc': {
        const av = a.listing.price.pricePerSqmMillion;
        const bv = b.listing.price.pricePerSqmMillion;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return av - bv;
      }
      case 'area_desc':
        return (b.property.areaSqm ?? -1) - (a.property.areaSqm ?? -1);
      case 'discount_desc':
        return (a.listing.marketContext.gapPercentFromV64 ?? 999) - (b.listing.marketContext.gapPercentFromV64 ?? 999);
      case 'newest':
        return b.listing.updatedAtIso.localeCompare(a.listing.updatedAtIso);
      case 'relevance':
      default: {
        const score = (r: PropertyListingRecord) =>
          (r.listing.sourceKind === 'user_submitted' ? 30 : r.listing.sourceKind === 'curated_bargain' ? 20 : 0) +
          (isVerifiedListing(r) ? 10 : 0);
        const diff = score(b) - score(a);
        if (diff !== 0) return diff;
        if (selectedHoodId) {
          const aHood = a.property.hoodId === selectedHoodId ? 1 : 0;
          const bHood = b.property.hoodId === selectedHoodId ? 1 : 0;
          if (aHood !== bHood) return bHood - aHood;
        }
        return b.listing.updatedAtIso.localeCompare(a.listing.updatedAtIso);
      }
    }
  });
}

export function getSimilarListings(
  target: PropertyListingRecord,
  allRecords: PropertyListingRecord[],
  limit = 4,
): PropertyListingRecord[] {
  const targetArea = target.property.areaSqm ?? 85;
  return allRecords
    .filter((r) =>
      r.listing.status === 'published' &&
      r.listing.listingId !== target.listing.listingId &&
      r.listing.transactionType === target.listing.transactionType &&
      r.property.propertyType === target.property.propertyType,
    )
    .map((r) => {
      const sameHood = r.property.hoodId === target.property.hoodId ? 40 : 0;
      const area = r.property.areaSqm ?? 85;
      const areaDiff = Math.abs(area - targetArea) / Math.max(1, targetArea);
      const areaScore = Math.max(0, 30 - areaDiff * 60);
      return { r, score: sameHood + areaScore };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
}

export class StaleRequestGuard {
  private seq = 0;
  nextToken(): number {
    this.seq += 1;
    return this.seq;
  }
  isLatest(token: number): boolean {
    return token === this.seq;
  }
}
