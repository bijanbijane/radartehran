/** @file src/features/properties/services/listingService.ts — UID-Scoped Saved Properties, Drafts, User Listings & Reports Store */
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../../data/realMarketPriceAggregator';
import {
  readScopedStorageJson,
  removeScopedStorageKey,
  resolveEffectiveUid,
  writeScopedStorageJson,
} from '../../account/services/accountStorageScope';
import { normalizeDigitsToAscii } from '../filters/PropertyFilterDraft';
import { sanitizeListingText } from '../moderation/ListingValidation';
import type { PropertyListingRecord, ListingStatus } from '../types/listing.types';
import type {
  DuplicateMatchAssessment,
  ListingHistoryEvent,
  ListingReportRecord,
  ListingSubmissionDraft,
} from '../types/listing-history.types';

const SAVED_PROPERTIES_KEY = 'radar_saved_properties_v1';
const MY_LISTINGS_KEY = 'radar_my_listings_v1';
const SUBMISSION_DRAFT_KEY = 'radar_listing_submission_draft_v1';
const LISTING_HISTORY_KEY = 'radar_listing_history_v1';
const LISTING_REPORTS_KEY = 'radar_listing_reports_v1';

export interface SavedPropertySnapshot {
  listingId: string;
  titleSnapshot: string;
  hoodNameSnapshot: string;
  priceLabelSnapshot: string;
  savedAtIso: string;
  lastKnownStatus: ListingStatus;
  ownerUserId?: string;
}

export function loadSavedProperties(uid?: string | null): SavedPropertySnapshot[] {
  return readScopedStorageJson<SavedPropertySnapshot[]>(
    SAVED_PROPERTIES_KEY,
    [],
    uid,
    (legacyParsed, scopeUid) =>
      Array.isArray(legacyParsed)
        ? (legacyParsed.filter((x) => x && (x as SavedPropertySnapshot).ownerUserId === scopeUid) as SavedPropertySnapshot[])
        : null,
  );
}

export function saveSavedProperties(items: SavedPropertySnapshot[], uid?: string | null): void {
  writeScopedStorageJson(SAVED_PROPERTIES_KEY, items, uid);
}

export function toggleSavedProperty(rec: PropertyListingRecord, uid?: string | null): SavedPropertySnapshot[] {
  const scopeUid = resolveEffectiveUid(uid);
  const existing = loadSavedProperties(scopeUid);
  const exists = existing.some((x) => x.listingId === rec.listing.listingId);
  const next = exists
    ? existing.filter((x) => x.listingId !== rec.listing.listingId)
    : [
        {
          listingId: rec.listing.listingId,
          titleSnapshot: rec.listing.title,
          hoodNameSnapshot: rec.property.hoodName,
          priceLabelSnapshot:
            rec.listing.price.priceType === 'undisclosed'
              ? 'توافقی / نامشخص'
              : rec.listing.price.saleTotalMillion
              ? `${Math.round(rec.listing.price.saleTotalMillion).toLocaleString()} م`
              : `${Math.round(rec.listing.price.depositMillion || 0).toLocaleString()} م رهن`,
          savedAtIso: new Date().toISOString(),
          lastKnownStatus: rec.listing.status,
          ownerUserId: scopeUid,
        },
        ...existing,
      ].slice(0, 40);
  writeScopedStorageJson(SAVED_PROPERTIES_KEY, next, scopeUid);
  return next;
}

export function loadSubmissionDraft(uid?: string | null): ListingSubmissionDraft | null {
  return readScopedStorageJson<ListingSubmissionDraft | null>(SUBMISSION_DRAFT_KEY, null, uid);
}

export function saveSubmissionDraft(draft: ListingSubmissionDraft, uid?: string | null): ListingSubmissionDraft {
  const stamped = { ...draft, lastSavedAtIso: new Date().toISOString() };
  writeScopedStorageJson(SUBMISSION_DRAFT_KEY, stamped, uid);
  return stamped;
}

export function clearSubmissionDraft(uid?: string | null): void {
  removeScopedStorageKey(SUBMISSION_DRAFT_KEY, uid);
}

export function loadMyListings(uid?: string | null): PropertyListingRecord[] {
  return readScopedStorageJson<PropertyListingRecord[]>(
    MY_LISTINGS_KEY,
    [],
    uid,
    (legacyParsed, scopeUid) =>
      Array.isArray(legacyParsed)
        ? (legacyParsed.filter(
            (r) => r && (r as PropertyListingRecord).listing?.publisher?.id === scopeUid,
          ) as PropertyListingRecord[])
        : null,
  );
}

export function saveMyListings(items: PropertyListingRecord[], uid?: string | null): void {
  writeScopedStorageJson(MY_LISTINGS_KEY, items, uid);
}

export function loadUserListingHistory(uid?: string | null): ListingHistoryEvent[] {
  return readScopedStorageJson<ListingHistoryEvent[]>(LISTING_HISTORY_KEY, [], uid);
}

export function appendUserListingHistory(event: ListingHistoryEvent, uid?: string | null): void {
  const scopeUid = resolveEffectiveUid(uid);
  const all = [event, ...loadUserListingHistory(scopeUid)].slice(0, 100);
  writeScopedStorageJson(LISTING_HISTORY_KEY, all, scopeUid);
}

export function loadListingReports(uid?: string | null): ListingReportRecord[] {
  return readScopedStorageJson<ListingReportRecord[]>(LISTING_REPORTS_KEY, [], uid);
}

export function submitListingReport(record: ListingReportRecord, uid?: string | null): ListingReportRecord[] {
  const scopeUid = resolveEffectiveUid(uid);
  const next = [record, ...loadListingReports(scopeUid)].slice(0, 50);
  writeScopedStorageJson(LISTING_REPORTS_KEY, next, scopeUid);
  return next;
}

function parseAsciiNum(raw: string): number | null {
  const n = Number(normalizeDigitsToAscii(raw || '').replace(/[,٬\s]/g, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function submitDraftAsPropertyListing(
  draft: ListingSubmissionDraft,
  hood: EvaluatedNeighborhood,
  dupAssessment: DuplicateMatchAssessment,
  uid?: string | null,
): PropertyListingRecord {
  const scopeUid = resolveEffectiveUid(uid);
  const nowIso = new Date().toISOString();
  const area = parseAsciiNum(draft.areaSqm);
  const isSale = draft.transactionType === 'sale' || draft.transactionType === 'presale';
  const saleTotalM =
    draft.priceType !== 'undisclosed' && isSale && parseAsciiNum(draft.saleTotalBillion)
      ? Math.round((parseAsciiNum(draft.saleTotalBillion) as number) * 1000)
      : null;
  const pricePerSqm = saleTotalM && area ? Math.round((saleTotalM / area) * 10) / 10 : null;
  const depositM = draft.priceType !== 'undisclosed' && !isSale ? parseAsciiNum(draft.depositMillion) : null;
  const rentM =
    draft.priceType !== 'undisclosed' && draft.transactionType === 'rent'
      ? Number(normalizeDigitsToAscii(draft.monthlyRentMillion || '0')) || 0
      : null;

  const agg = aggregateNeighborhoodMarketMetrics(
    hood.id,
    hood.name,
    hood.buyPerSqm,
    buildNeighborhoodListingSamples(hood),
  );
  const status: ListingStatus = dupAssessment.actionPolicy === 'queue_manual_review' ? 'pending_review' : 'published';
  const listingId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const propertyId = `prop-${listingId}`;

  const record: PropertyListingRecord = {
    property: {
      propertyId,
      propertyType: draft.propertyType,
      cityId: draft.cityId,
      hoodId: hood.id,
      hoodName: hood.name,
      zoneName: hood.zone,
      street: sanitizeListingText(draft.street, 80),
      lat: draft.locationPrecision === 'unavailable' ? null : hood.lat,
      lng: draft.locationPrecision === 'unavailable' ? null : hood.lng,
      locationPrecision: draft.locationPrecision,
      privacyRadiusMeters: draft.locationPrecision === 'exact' ? 30 : draft.locationPrecision === 'approximate' ? 250 : 600,
      areaSqm: area,
      buildYearJalali: parseAsciiNum(draft.buildYearJalali),
      roomsCount: parseAsciiNum(draft.roomsCount),
      floorNumber: parseAsciiNum(draft.floorNumber),
      totalFloors: parseAsciiNum(draft.totalFloors),
      orientation: 'unknown',
      documentType: draft.documentType,
      unitFeatures: {
        parking: draft.parking,
        elevator: draft.elevator,
        storage: draft.storage,
        balcony: draft.balcony,
      },
      buildingFeatures: {
        unitsPerFloor: null,
        totalUnits: null,
        hasLobby: 'unknown',
        renovationStatus: 'unknown',
      },
      media: [],
    },
    listing: {
      listingId,
      propertyId,
      version: 1,
      title: sanitizeListingText(draft.title, 120),
      description: sanitizeListingText(draft.description, 600),
      transactionType: draft.transactionType,
      status,
      price: {
        priceType: draft.priceType,
        saleTotalMillion: saleTotalM,
        pricePerSqmMillion: pricePerSqm,
        depositMillion: depositM,
        monthlyRentMillion: rentM,
        convertibleRent: draft.convertibleRent,
      },
      publisher: {
        id: scopeUid,
        displayName: sanitizeListingText(draft.publisherName, 60),
        role: draft.publisherRole,
        contactAuthorized: true,
        maskedPhone: sanitizeListingText(draft.publisherPhone, 15),
      },
      verification: {
        identity: 'partial',
        location: draft.locationPrecision === 'unavailable' ? 'unverified' : 'partial',
        priceReasonableness: dupAssessment.level === 'high' ? 'partial' : 'verified',
        freshness: 'verified',
      },
      sourceKind: 'user_submitted',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      marketContext: {
        hoodBaseBuyPerSqm: hood.buyPerSqm,
        hoodRahn80mMillion: hood.rahn80m,
        estimatedDealV64PerSqm: agg.estimatedDealPricePerSqm,
        gapPercentFromV64:
          pricePerSqm && agg.estimatedDealPricePerSqm > 0
            ? Math.round(((pricePerSqm - agg.estimatedDealPricePerSqm) / agg.estimatedDealPricePerSqm) * 1000) / 10
            : null,
        neighborhoodOverallScore: hood.overallScore,
        metroScore: hood.metro,
        airScore: hood.air,
      },
    },
  };

  saveMyListings([record, ...loadMyListings(scopeUid)], scopeUid);
  appendUserListingHistory(
    {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      listingId,
      kind: 'created',
      atIso: nowIso,
      summaryFa: status === 'pending_review' ? 'ثبت و ارسال به صف بازبینی (تشابه احتمالی)' : 'ثبت و انتشار در فهرست املاک',
      verifiedFact: true,
    },
    scopeUid,
  );
  clearSubmissionDraft(scopeUid);
  return record;
}
