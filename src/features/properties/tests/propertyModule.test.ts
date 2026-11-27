/** @file src/features/properties/tests/propertyModule.test.ts — Node Unit Tests for Stage 19 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_NEIGHBORHOODS,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  type EvaluatedNeighborhood,
} from '../../../data/neighborhoods';
import {
  buildPropertyListingRecords,
  buildHonestListingHistory,
} from '../services/propertyDataAdapter';
import {
  commitPropertyFilterDraft,
  createDefaultPropertyFilters,
  normalizeFiltersForPropertyType,
  supportsElevatorFilter,
  supportsRoomsFilter,
} from '../filters/PropertyFilterDraft';
import { filterAndSortProperties, getSimilarListings } from '../services/propertySearchService';
import { buildPropertyMapProjection, formatStraightLineDistanceFa } from '../services/propertyMapService';
import {
  createEmptySubmissionDraft,
  evaluatePriceAnomalies,
  optimisticUpdateListing,
  validateSubmissionStep,
} from '../moderation/ListingValidation';
import { assessDuplicateSubmission } from '../moderation/DuplicateDetection';
import { normalizeSubmissionLocationPrecision } from '../services/listingService';

function toEvaluated(): EvaluatedNeighborhood[] {
  return INITIAL_NEIGHBORHOODS.slice(0, 6).map((h) => ({
    ...h,
    baseBuyPerSqm: h.buyPerSqm,
    status: 'green',
    distKm: null,
    diffPercent: 0,
    overallScore: Number(((h.air + h.metro + h.security) / 3).toFixed(1)),
    trafficInfo: getNeighborhoodTrafficInfo(h),
    marketReport: getNeighborhoodMarketReport(h),
  }));
}

test('Listing submission never claims street-level coordinate precision without captured coordinates', () => {
  assert.equal(normalizeSubmissionLocationPrecision('exact'), 'neighborhood');
  assert.equal(normalizeSubmissionLocationPrecision('approximate'), 'neighborhood');
  assert.equal(normalizeSubmissionLocationPrecision('neighborhood'), 'neighborhood');
  assert.equal(normalizeSubmissionLocationPrecision('unavailable'), 'unavailable');
});

test('PropertyFilterDraft normalizes Persian numerals and auto-swaps inverted min/max bounds on commit', () => {
  const d = createDefaultPropertyFilters('sale');
  d.areaMin = '۱۵۰';
  d.areaMax = '۷۰';
  d.priceMinMillion = '40000';
  d.priceMaxMillion = '15000';
  const committed = commitPropertyFilterDraft(d);
  assert.equal(committed.areaMin, '70');
  assert.equal(committed.areaMax, '150');
  assert.equal(committed.priceMinMillion, '15000');
  assert.equal(committed.priceMaxMillion, '40000');

  const landNormalized = normalizeFiltersForPropertyType(d, 'land');
  assert.equal(supportsRoomsFilter('land'), false);
  assert.equal(supportsElevatorFilter('land'), false);
  assert.equal(landNormalized.roomsMin, null);
  assert.equal(landNormalized.elevator, 'any');
});

test('Tri-state amenity filtering strictly preserves unknown vs lacks and keeps undisclosed prices out of numeric sort tops', () => {
  const hoods = toEvaluated();
  const records = buildPropertyListingRecords(hoods);
  assert.ok(records.length >= 6);

  // Inject an undisclosed price record and one with elevator = 'unknown'
  const clonedUndisclosed = {
    ...records[0],
    listing: {
      ...records[0].listing,
      listingId: 'undisclosed-1',
      price: { ...records[0].listing.price, priceType: 'undisclosed' as const, saleTotalMillion: null, pricePerSqmMillion: null },
    },
  };
  const all = [clonedUndisclosed, ...records];

  const sortedAsc = filterAndSortProperties(all, { ...createDefaultPropertyFilters('sale'), sortBy: 'price_asc' });
  assert.notEqual(sortedAsc[0].listing.listingId, 'undisclosed-1');
  assert.equal(sortedAsc[sortedAsc.length - 1].listing.listingId, 'undisclosed-1');

  const lacksParking = filterAndSortProperties(all, { ...createDefaultPropertyFilters('all'), parking: 'lacks' });
  for (const r of lacksParking) assert.equal(r.property.unitFeatures.parking, 'lacks');
});

test('Duplicate detection routes high-similarity submissions to manual review without auto-deletion, and optimistic concurrency blocks stale versions', () => {
  const hoods = toEvaluated();
  const records = buildPropertyListingRecords(hoods);
  const target = records[0];
  const draft = createEmptySubmissionDraft(target.property.hoodId);
  draft.propertyType = target.property.propertyType;
  draft.transactionType = target.listing.transactionType;
  draft.street = target.property.street;
  draft.areaSqm = String(target.property.areaSqm);
  draft.saleTotalBillion = String((target.listing.price.saleTotalMillion || 0) / 1000);

  const dup = assessDuplicateSubmission(draft, records);
  assert.equal(dup.level, 'high');
  assert.equal(dup.actionPolicy, 'queue_manual_review');

  const conflict = optimisticUpdateListing(target.listing, { title: 'ویرایش جدید' }, 999);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.errorCode, 'CONFLICT_STALE_VERSION');
});

test('Validation catches step errors and flags low-price anomalies non-accusatorily; Map projection tracks unavailable points cleanly', () => {
  const hoods = toEvaluated();
  const draft = createEmptySubmissionDraft(hoods[0].id);
  draft.street = 'ا';
  assert.equal(validateSubmissionStep(draft, 2).valid, false);
  draft.areaSqm = '5';
  assert.equal(validateSubmissionStep(draft, 3).valid, false);

  draft.areaSqm = '100';
  draft.saleTotalBillion = '5'; // ~50M/sqm vs >700M/sqm in Zaferanieh
  const anomalies = evaluatePriceAnomalies(draft, hoods[0]);
  assert.ok(anomalies.some((a) => a.code === 'PRICE_UNUSUALLY_LOW'));

  const records = buildPropertyListingRecords(hoods);
  const unmapped = {
    ...records[0],
    property: { ...records[0].property, lat: null, lng: null, locationPrecision: 'unavailable' as const },
  };
  const proj = buildPropertyMapProjection([unmapped, ...records], 12);
  assert.equal(proj.unavailableCount, 1);
  assert.ok(formatStraightLineDistanceFa(0.6).includes('فاصله مستقیم خطی'));
  assert.ok(buildHonestListingHistory(records[0]).every((e) => e.verifiedFact));
  assert.ok(getSimilarListings(records[0], records, 3).every((s) => s.listing.listingId !== records[0].listing.listingId));
});
