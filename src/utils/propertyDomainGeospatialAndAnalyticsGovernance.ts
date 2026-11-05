import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; import { normalizePersianSearchText } from './persianSearchAndPersonalWorkspace'; export interface PhysicalPropertyEntity { propertyId: string; cityId: CityId; hoodId: number; normalizedStreet: string; sqm: number; approxLat?: number; approxLng?: number; addressConfidence: 'exact_parcel' | 'street_approximate'; }
export interface PublishedListingOfferRecord { listingId: string; propertyId: string; publisherId: string; transactionType: 'buy' | 'rent'; title: string; priceMillion: number; sqm: number; street: string; status: 'draft' | 'published' | 'expired' | 'withdrawn' | 'rejected'; revisionNumber: number; updatedAtIso: string; }
export function resolvePhysicalPropertyAndListingIdentity(input: { existingListingId?: string; cityId: CityId; hoodId: number; street: string; sqm: number; unitNumber?: string; postalCode?: string; publisherId: string; transactionType: 'buy' | 'rent'; }): { propertyId: string; listingId: string; isExactPropertyIdentity: boolean } { const normStreet = normalizePersianSearchText(input.street || '').replace(/\s+/g, '-').slice(0, 40) || 'unknown'; const hasExactUnit = Boolean(input.postalCode && /^\d{10}$/.test(input.postalCode.trim())); const propertySuffix = hasExactUnit
    ? `pc-${input.postalCode!.trim()}`
    : `approx-${normStreet}-${Math.round(input.sqm)}-${input.unitNumber ? normalizePersianSearchText(input.unitNumber) : 'u0'}`; const propertyId = `prop:${input.cityId}:${input.hoodId}:${propertySuffix}`;
  const listingId = input.existingListingId?.trim() || `lst:${input.cityId}:${input.hoodId}:${input.publisherId}:${input.transactionType}:${Date.now()}`; return { propertyId, listingId, isExactPropertyIdentity: hasExactUnit }; }
export interface ListingFieldDiffItem { field: string; previousValue: unknown; newValue: unknown; changeCategory: 'price' | 'area' | 'address' | 'characteristic' | 'description' | 'publication_state'; } export interface ListingRevisionRecord { revisionId: string; listingId: string; revisionNumber: number; actorId: string; createdAtIso: string; mutationSource: 'publisher_edit' | 'admin_moderation' | 'revision_restore' | 'ownership_transfer'; operationId: string; changes: ListingFieldDiffItem[]; }
const TRACKED_BUSINESS_FIELDS: Record<string, ListingFieldDiffItem['changeCategory']> = { priceMillion: 'price', sqm: 'area', street: 'address', title: 'description', transactionType: 'characteristic', status: 'publication_state', }; export function computeListingFieldDiffs( before: Partial<PublishedListingOfferRecord>, after: Partial<PublishedListingOfferRecord>
): ListingFieldDiffItem[] { const diffs: ListingFieldDiffItem[] = []; for (const [field, category] of Object.entries(TRACKED_BUSINESS_FIELDS)) { const prevVal = (before as Record<string, unknown>)[field] ?? null; const nextVal = (after as Record<string, unknown>)[field] ?? null; if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) { diffs.push({ field, previousValue: prevVal, newValue: nextVal, changeCategory: category }); }
  } return diffs; } export function applyOptimisticListingUpdate( current: PublishedListingOfferRecord, expectedRevisionNumber: number, patch: Partial<Pick<PublishedListingOfferRecord, 'title' | 'priceMillion' | 'sqm' | 'street' | 'status'>>, actorId: string, operationId: string, nowIso = new Date().toISOString(), areaUnit: AreaUnit = getStoredAreaUnit(), intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()
): { ok: boolean; conflict?: { currentRevision: number; expectedRevision: number; conflictingFields: string[] }; updated?: PublishedListingOfferRecord; revision?: ListingRevisionRecord; displayAreaUnitLabel?: string; updatedPriceIntlText?: string; } { if (current.revisionNumber !== expectedRevisionNumber) { const conflictingFields = Object.keys(patch).filter(
      (k) => JSON.stringify((current as unknown as Record<string, unknown>)[k]) !== JSON.stringify((patch as unknown as Record<string, unknown>)[k]) ); return { ok: false, conflict: { currentRevision: current.revisionNumber, expectedRevision: expectedRevisionNumber, conflictingFields }, }; }
  const nextRecord: PublishedListingOfferRecord = { ...current, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.priceMillion !== undefined ? { priceMillion: patch.priceMillion } : {}),
    ...(patch.sqm !== undefined ? { sqm: patch.sqm } : {}), ...(patch.street !== undefined ? { street: patch.street } : {}), ...(patch.status !== undefined ? { status: patch.status } : {}), revisionNumber: current.revisionNumber + 1,
    updatedAtIso: nowIso, }; const changes = computeListingFieldDiffs(current, nextRecord); const revision: ListingRevisionRecord = {
    revisionId: `rev:${current.listingId}:v${nextRecord.revisionNumber}`, listingId: current.listingId, revisionNumber: nextRecord.revisionNumber,
    actorId, createdAtIso: nowIso, mutationSource: 'publisher_edit', operationId, changes,
  };
  return { ok: true, updated: nextRecord, revision, displayAreaUnitLabel: formatAreaUnitLabel(areaUnit), updatedPriceIntlText: formatMillionTomanAsIntlCurrency(nextRecord.priceMillion, intlCurrency) };
}
const RESTORABLE_LISTING_FIELDS = new Set(['title', 'priceMillion', 'sqm', 'street']);
export function restoreListingFromHistoricalRevision(
  current: PublishedListingOfferRecord,
  expectedCurrentRevision: number,
  targetRevision: ListingRevisionRecord,
  actorId: string,
  nowIso = new Date().toISOString()
): { ok: boolean; reason?: string; updated?: PublishedListingOfferRecord; newRevision?: ListingRevisionRecord } {
  if (current.revisionNumber !== expectedCurrentRevision) return { ok: false, reason: 'STALE_CURRENT_REVISION' };
  const restoredPatch: Record<string, unknown> = {};
  for (const ch of targetRevision.changes) {
    if (RESTORABLE_LISTING_FIELDS.has(ch.field) && ch.newValue !== null && ch.newValue !== undefined) {
      restoredPatch[ch.field] = ch.newValue;
    }
  }
  if (typeof restoredPatch.priceMillion === 'number' && restoredPatch.priceMillion <= 0) return { ok: false, reason: 'INVALID_HISTORICAL_PRICE' };
  if (typeof restoredPatch.sqm === 'number' && (restoredPatch.sqm < 20 || restoredPatch.sqm > 2000)) return { ok: false, reason: 'INVALID_HISTORICAL_AREA' };
  const res = applyOptimisticListingUpdate(
    current, expectedCurrentRevision,
    { ...(restoredPatch as Partial<PublishedListingOfferRecord>), status: current.status },
    actorId, `restore-from-${targetRevision.revisionId}`, nowIso
  );
  if (!res.ok || !res.updated || !res.revision) return { ok: false, reason: 'RESTORE_CONFLICT' };
  return { ok: true, updated: res.updated, newRevision: { ...res.revision, mutationSource: 'revision_restore' } };
}
export type OwnershipTransferStatus = 'requested' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled' | 'completed';
export interface ListingOwnershipTransferRecord {
  transferId: string;
  listingId: string;
  previousOwnerId: string;
  newOwnerId: string;
  initiatedById: string;
  initiatedByRole: 'publisher' | 'admin';
  status: OwnershipTransferStatus;
  preservePreviousOwnerPrivateInquiries: boolean;
  createdAtIso: string;
  completedAtIso?: string;
}
export function executeAuthorizedOwnershipTransfer(
  listing: PublishedListingOfferRecord,
  expectedRevisionNumber: number,
  actorId: string,
  actorRole: 'publisher' | 'admin',
  destinationOwnerId: string,
  destinationEligible: boolean,
  nowIso = new Date().toISOString()
): { ok: boolean; reason?: string; updatedListing?: PublishedListingOfferRecord; transferRecord?: ListingOwnershipTransferRecord } {
  if (actorRole !== 'admin' && listing.publisherId !== actorId) return { ok: false, reason: 'UNAUTHORIZED_TRANSFER_INITIATOR' };
  if (!destinationOwnerId || !destinationEligible || destinationOwnerId === listing.publisherId) return { ok: false, reason: 'INVALID_DESTINATION_OWNER' };
  if (listing.revisionNumber !== expectedRevisionNumber) return { ok: false, reason: 'CONCURRENT_MODIFICATION_CONFLICT' };
  const updatedListing: PublishedListingOfferRecord = {
    ...listing, publisherId: destinationOwnerId, revisionNumber: listing.revisionNumber + 1, updatedAtIso: nowIso,
  };
  const transferRecord: ListingOwnershipTransferRecord = {
    transferId: `trf:${listing.listingId}:v${updatedListing.revisionNumber}`,
    listingId: listing.listingId, previousOwnerId: listing.publisherId, newOwnerId: destinationOwnerId,
    initiatedById: actorId, initiatedByRole: actorRole, status: 'completed',
    preservePreviousOwnerPrivateInquiries: true, createdAtIso: nowIso, completedAtIso: nowIso,
  };
  return { ok: true, updatedListing, transferRecord };
}
export interface CanonicalPropertyTaxonomyEntry {
  categoryId: 'residential_apartment' | 'residential_villa' | 'commercial_office' | 'commercial_retail' | 'land_plot';
  purpose: 'residential' | 'commercial' | 'land';
  physicalType: 'apartment' | 'villa' | 'office' | 'shop' | 'plot';
  parentCategoryId: string | null;
  labelFa: string;
  labelEn: string;
  supportedAmenities: string[];
}
export const CANONICAL_PROPERTY_TAXONOMY_REGISTRY: Record<CanonicalPropertyTaxonomyEntry['categoryId'], CanonicalPropertyTaxonomyEntry> = {
  residential_apartment: { categoryId: 'residential_apartment', purpose: 'residential', physicalType: 'apartment', parentCategoryId: null, labelFa: 'آپارتمان مسکونی', labelEn: 'Residential Apartment', supportedAmenities: ['elevator', 'parking', 'storage', 'balcony', 'lobby'] },
  residential_villa: { categoryId: 'residential_villa', purpose: 'residential', physicalType: 'villa', parentCategoryId: null, labelFa: 'ویلایی و خانه حیاط‌دار', labelEn: 'Residential Villa', supportedAmenities: ['parking', 'storage', 'balcony', 'yard'] },
  commercial_office: { categoryId: 'commercial_office', purpose: 'commercial', physicalType: 'office', parentCategoryId: null, labelFa: 'دفتر کار و واحد اداری', labelEn: 'Commercial Office', supportedAmenities: ['elevator', 'parking', 'lobby'] },
  commercial_retail: { categoryId: 'commercial_retail', purpose: 'commercial', physicalType: 'shop', parentCategoryId: null, labelFa: 'مغازه و واحد تجاری', labelEn: 'Commercial Retail', supportedAmenities: ['parking', 'storage'] },
  land_plot: { categoryId: 'land_plot', purpose: 'land', physicalType: 'plot', parentCategoryId: null, labelFa: 'زمین و ملک کلنگی', labelEn: 'Land Plot', supportedAmenities: [] },
};
export type AmenityValueState = 'present' | 'absent' | 'unknown' | 'not_applicable';
export interface CanonicalAmenityDefinition {
  amenityId: string;
  dimension: 'physical_amenity' | 'building_facility' | 'unit_characteristic' | 'utility_service' | 'nearby_service';
  labelFa: string;
  labelEn: string;
}
export const CANONICAL_AMENITY_REGISTRY: Record<string, CanonicalAmenityDefinition> = {
  elevator: { amenityId: 'elevator', dimension: 'building_facility', labelFa: 'آسانسور', labelEn: 'Elevator' },
  parking: { amenityId: 'parking', dimension: 'physical_amenity', labelFa: 'پارکینگ اختصاصی', labelEn: 'Dedicated Parking' },
  storage: { amenityId: 'storage', dimension: 'physical_amenity', labelFa: 'انباری', labelEn: 'Storage Room' },
  balcony: { amenityId: 'balcony', dimension: 'unit_characteristic', labelFa: 'بالکن / تراس', labelEn: 'Balcony' },
  lobby: { amenityId: 'lobby', dimension: 'building_facility', labelFa: 'لابی و نگهبانی', labelEn: 'Lobby & Concierge' },
  yard: { amenityId: 'yard', dimension: 'physical_amenity', labelFa: 'حیاط اختصاصی', labelEn: 'Private Yard' },
  metro_proximity: { amenityId: 'metro_proximity', dimension: 'nearby_service', labelFa: 'دسترسی مترو (خارج از ملک)', labelEn: 'Nearby Metro Access' },
};
export function resolveAmenityStateForCategory(
  categoryId: CanonicalPropertyTaxonomyEntry['categoryId'],
  amenityId: string,
  rawValue: boolean | null | undefined
): AmenityValueState {
  const taxonomy = CANONICAL_PROPERTY_TAXONOMY_REGISTRY[categoryId];
  if (!taxonomy || !taxonomy.supportedAmenities.includes(amenityId)) return 'not_applicable';
  if (rawValue === true) return 'present';
  if (rawValue === false) return 'absent';
  return 'unknown';
}
export type ClaimProvenanceSource = 'publisher_provided' | 'user_corrected' | 'external_import' | 'system_derived' | 'independently_verified' | 'unknown';
export interface PropertyAttributeClaim<T> {
  field: string; value: T; source: ClaimProvenanceSource;
  verificationState: 'unverified' | 'verified' | 'expired' | 'disputed';
  verifiedAtIso?: string; expiresAtIso?: string; badgeLabelFa: string;
}
export function buildPropertyAttributeClaim<T>(
  field: string, value: T, source: ClaimProvenanceSource,
  actorRole: 'publisher' | 'admin' | 'system', verifiedAtIso?: string,
  ttlDays = 90, nowMs = Date.now()
): PropertyAttributeClaim<T> {
  const effectiveSource: ClaimProvenanceSource = actorRole === 'publisher' && source === 'independently_verified' ? 'publisher_provided' : source;
  let verificationState: PropertyAttributeClaim<T>['verificationState'] = 'unverified';
  let expiresAtIso: string | undefined;
  if (effectiveSource === 'independently_verified' && verifiedAtIso && actorRole !== 'publisher') {
    const expMs = Date.parse(verifiedAtIso) + ttlDays * 86_400_000;
    expiresAtIso = new Date(expMs).toISOString();
    verificationState = nowMs <= expMs ? 'verified' : 'expired';
  }
  const badgeLabelFa =
    verificationState === 'verified' ? 'تأییدشده توسط کارشناس رادار'
    : verificationState === 'expired' ? 'تأییدیه منقضی‌شده (نیازمند بررسی مجدد)'
    : effectiveSource === 'system_derived' ? 'محاسبه‌شده توسط سامانه'
    : 'اظهارشده توسط ثبت‌کننده آگهی';
  return { field, value, source: effectiveSource, verificationState, verifiedAtIso, expiresAtIso, badgeLabelFa };
}
export type GeocodingFailureReason = 'no_match' | 'ambiguous_match' | 'invalid_request' | 'quota_exceeded' | 'timeout' | 'provider_outage' | 'malformed_response';
export interface CanonicalGeocodingResult {
  ok: boolean; providerId: 'nominatim_osm' | 'internal_gazetteer';
  placeId?: string; displayAddress?: string; cityId?: CityId; neighborhoodName?: string;
  lat?: number; lng?: number;
  confidenceLevel: 'exact_provider' | 'approximate_hood' | 'ambiguous' | 'unresolved';
  failureReason?: GeocodingFailureReason;
}
export function evaluateAddressCoordinateConsistency(input: {
  cityId: CityId; declaredHoodId: number; declaredStreet: string; lat: number; lng: number;
}) {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) {
    return { validCoordinates: false, matchesCityBounds: false, matchesDeclaredNeighborhood: false, distanceFromHoodCenterKm: Infinity, trustStatus: 'invalid_coordinates' as const };
  }
  const cityCfg = MULTI_CITY_CONFIGS[input.cityId];
  const cityDistKm = Math.hypot((input.lat - cityCfg.center[0]) * 111, (input.lng - cityCfg.center[1]) * 90);
  if (cityDistKm > 55) {
    return { validCoordinates: true, matchesCityBounds: false, matchesDeclaredNeighborhood: false, distanceFromHoodCenterKm: cityDistKm, trustStatus: 'out_of_city_bounds' as const };
  }
  const hood = cityCfg.neighborhoods.find((n) => n.id === input.declaredHoodId);
  if (!hood) {
    return { validCoordinates: true, matchesCityBounds: true, matchesDeclaredNeighborhood: false, distanceFromHoodCenterKm: cityDistKm, trustStatus: 'hood_mismatch_warning' as const };
  }
  const hoodDistKm = Number(Math.hypot((input.lat - hood.lat) * 111, (input.lng - hood.lng) * 90).toFixed(2));
  const matchesHood = hoodDistKm <= Math.max(2.5, ((hood.radius || 1200) / 1000) * 2.2);
  return {
    validCoordinates: true, matchesCityBounds: true, matchesDeclaredNeighborhood: matchesHood,
    distanceFromHoodCenterKm: hoodDistKm,
    trustStatus: matchesHood ? ('consistent_approximate' as const) : ('hood_mismatch_warning' as const),
  };
}
export function resolveCityScopedGazetteerQuery(queryText: string, cityId?: CityId) {
  const norm = normalizePersianSearchText(queryText);
  if (!norm) return { resolutionStatus: 'unresolved' as const, candidates: [] };
  const targetCities: CityId[] = cityId ? [cityId] : (Object.keys(MULTI_CITY_CONFIGS) as CityId[]);
  const exactMatches: Array<{ cityId: CityId; hoodId: number; canonicalName: string }> = [];
  for (const cId of targetCities) {
    for (const h of MULTI_CITY_CONFIGS[cId].neighborhoods) {
      if (normalizePersianSearchText(h.name) === norm) {
        exactMatches.push({ cityId: cId, hoodId: h.id, canonicalName: h.name });
      }
    }
  }
  if (exactMatches.length === 1) return { resolutionStatus: 'exact_canonical' as const, candidates: exactMatches };
  if (exactMatches.length > 1) return { resolutionStatus: 'multiple_candidates' as const, candidates: exactMatches };
  return { resolutionStatus: 'unresolved' as const, candidates: [] };
}
export type BrowserGeolocationPermissionState = 'not_requested' | 'granted' | 'denied' | 'restricted' | 'unsupported' | 'timeout' | 'unavailable';
export function resolveGeolocationFallbackState(permissionState: BrowserGeolocationPermissionState, accuracyMeters?: number) {
  if (permissionState !== 'granted') {
    return {
      canUseDeviceLocation: false, accuracyTier: 'manual_only' as const, manualSelectionRequired: true,
      messageFa: 'موقعیت مکانی دستگاه فعال نیست؛ می‌توانید شهر و محله را به‌صورت دستی روی نقشه انتخاب کنید.',
    };
  }
  const isHighAccuracy = typeof accuracyMeters === 'number' && accuracyMeters > 0 && accuracyMeters <= 150;
  return {
    canUseDeviceLocation: true, accuracyTier: isHighAccuracy ? ('high' as const) : ('approximate' as const),
    manualSelectionRequired: false,
    messageFa: isHighAccuracy ? 'موقعیت مکانی شما با دقت مناسب مشخص شد.' : 'موقعیت مکانی تقریبی است؛ در صورت نیاز محله را دستی تنظیم کنید.',
  };
}
export interface ProgressiveOnboardingState {
  onboardingVersion: string; userSegment: 'visitor' | 'authenticated_user' | 'publisher';
  completedSteps: string[]; dismissed: boolean; updatedAtIso: string;
}
export function mergeOnboardingStateAcrossAuth(
  guestState: ProgressiveOnboardingState | null,
  cloudState: ProgressiveOnboardingState | null,
  nextSegment: ProgressiveOnboardingState['userSegment'],
  currentVersion = '2026.10'
): ProgressiveOnboardingState {
  const steps = Array.from(new Set([...(guestState?.completedSteps ?? []), ...(cloudState?.completedSteps ?? [])]));
  return {
    onboardingVersion: currentVersion, userSegment: nextSegment, completedSteps: steps,
    dismissed: Boolean(guestState?.dismissed || cloudState?.dismissed), updatedAtIso: new Date().toISOString(),
  };
}
export interface SupportCaseRecord {
  caseId: string; requesterUid: string;
  category: 'account_issue' | 'listing_moderation_appeal' | 'technical_bug' | 'billing_sponsor';
  subject: string;
  status: 'open' | 'assigned' | 'waiting_for_requester' | 'waiting_for_support' | 'resolved' | 'closed';
  messages: Array<{ messageId: string; authorUid: string; authorRole: 'user' | 'support_staff'; body: string; createdAtIso: string }>;
  createdAtIso: string;
}
export function canAccessOrReplySupportCase(supportCase: SupportCaseRecord, actorUid: string, actorRole: 'user' | 'support_staff') {
  if (actorRole === 'support_staff') return { canRead: true, canReply: supportCase.status !== 'closed' };
  const isOwner = Boolean(actorUid && supportCase.requesterUid === actorUid);
  return { canRead: isOwner, canReply: isOwner && supportCase.status !== 'closed' };
}
export interface ProductFeedbackSubmission {
  feedbackId: string; category: 'ux_improvement' | 'feature_request' | 'market_data_quality' | 'general_satisfaction';
  message: string; routeContext?: string; rating1to5?: number; isAnonymous: boolean; createdAtIso: string;
}
export function validateProductFeedbackSubmission(input: { category?: string; message?: string; rating1to5?: number }) {
  const cleanMsg = (input.message || '').replace(/<[^>]*>/g, '').trim();
  if (cleanMsg.length < 10 || cleanMsg.length > 1000) {
    return { valid: false, sanitizedMessage: cleanMsg, errorFa: 'متن بازخورد محصول باید بین ۱۰ تا ۱۰۰۰ کاراکتر باشد.' };
  }
  return { valid: true, sanitizedMessage: cleanMsg };
}
export type CanonicalAnalyticsEventName =
  | 'search_executed' | 'neighborhood_inspected' | 'property_comparison_opened'
  | 'calculator_completed' | 'listing_draft_saved' | 'listing_published_confirmed'
  | 'buyer_inquiry_submitted_confirmed' | 'onboarding_completed';
export interface ValidatedAnalyticsEvent {
  eventName: CanonicalAnalyticsEventName; sessionId: string; dedupeKey: string;
  properties: Record<string, string | number | boolean>; timestampIso: string;
}
const SENSITIVE_PROP_KEYS = /(password|token|secret|phone|mobile|email|lat|lng|contract|national)/i;
export function buildPrivacySafeAnalyticsEvent(
  eventName: CanonicalAnalyticsEventName, sessionId: string, rawProps: Record<string, unknown>,
  analyticsConsentGranted: boolean, isProductionEnv = true
): ValidatedAnalyticsEvent | null {
  if (!analyticsConsentGranted || !isProductionEnv) return null;
  const safeProps: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (SENSITIVE_PROP_KEYS.test(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      safeProps[k] = typeof v === 'string' ? v.slice(0, 80) : v;
    }
  }
  return {
    eventName, sessionId, dedupeKey: `${sessionId}:${eventName}:${JSON.stringify(safeProps)}`,
    properties: safeProps, timestampIso: new Date().toISOString(),
  };
}
export interface StandardizedOperationalKpiSnapshot {
  calculatedAtIso: string; totalListingRecords: number; activePublishedListings: number;
  expiredListings: number; uniquePhysicalProperties: number; uniquePublishers: number;
  verifiedBuyerInquiries: number | null;
} export function computeStandardizedOperationalKpis(
  listings: PublishedListingOfferRecord[], inquiriesCount: number | null, nowIso = new Date().toISOString()
): StandardizedOperationalKpiSnapshot { return { calculatedAtIso: nowIso, totalListingRecords: listings.length, activePublishedListings: listings.filter((l) => l.status === 'published').length, expiredListings: listings.filter((l) => l.status === 'expired').length, uniquePhysicalProperties: new Set(listings.map((l) => l.propertyId)).size, uniquePublishers: new Set(listings.map((l) => l.publisherId)).size, verifiedBuyerInquiries: typeof inquiriesCount === 'number' && Number.isFinite(inquiriesCount) ? inquiriesCount : null, }; }