import type { PersistedGeospatialState } from './geospatialRepository';
import type { BoundaryVersionRecord, PolygonGeometry } from './types';
import type { GeospatialRecordCounts } from './geospatialDurableRecovery';
import { validatePolygonGeometry } from './coordinateAndPolygonEngine';
import { classifyPointInRing } from './pointInRing';

const IRAN_LAT = { min: 24, max: 40.5 };
const IRAN_LNG = { min: 44, max: 64 };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function pushValidationError(errors: string[], limit: number, message: string): void {
  if (errors.length < limit) errors.push(message);
}

export function countRecords(state: PersistedGeospatialState): GeospatialRecordCounts {
  const boundaryStore = isPlainRecord(state?.boundaryHistoryByEntity) ? state.boundaryHistoryByEntity : {};
  const poiStore = isPlainRecord(state?.poiStore) ? state.poiStore : {};
  const listingsStore = isPlainRecord(state?.spatialListingsByCity) ? state.spatialListingsByCity : {};
  const overlayStore = isPlainRecord(state?.overlayStore) ? state.overlayStore : {};
  const importBatches = isPlainRecord(state?.importBatches) ? state.importBatches : {};

  let activeBoundaries = 0;
  for (const history of Object.values(boundaryStore)) {
    if (!Array.isArray(history)) continue;
    for (const record of history) {
      if (isPlainRecord(record) && record.status === 'ACTIVE') activeBoundaries += 1;
    }
  }

  let spatialListingCities = 0;
  let spatialListings = 0;
  for (const listings of Object.values(listingsStore)) {
    if (!isPlainRecord(listings)) continue;
    spatialListingCities += 1;
    spatialListings += Object.keys(listings).length;
  }

  return {
    boundaryEntities: Object.keys(boundaryStore).length,
    activeBoundaries,
    poiRecords: Object.keys(poiStore).length,
    spatialListingCities,
    spatialListings,
    overlayLayers: Object.keys(overlayStore).length,
    importBatches: Object.keys(importBatches).length,
  };
}

function isFiniteCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= IRAN_LAT.min && lat <= IRAN_LAT.max
    && lng >= IRAN_LNG.min && lng <= IRAN_LNG.max;
}

function validateBoundary(
  value: unknown,
  entityKey: string,
  errors: string[],
  limit: number,
): value is BoundaryVersionRecord {
  if (!isPlainRecord(value)) {
    pushValidationError(errors, limit, `BOUNDARY_RECORD_NOT_OBJECT:${entityKey}`);
    return false;
  }

  const record = value;
  if (typeof record.id !== 'string' || !record.id.trim()) {
    pushValidationError(errors, limit, `BOUNDARY_MISSING_ID:${entityKey}`);
  }
  if (typeof record.entityId !== 'string' || !record.entityId.trim()) {
    pushValidationError(errors, limit, `BOUNDARY_MISSING_ENTITY_ID:${entityKey}`);
  } else if (record.entityId !== entityKey) {
    pushValidationError(errors, limit, `BOUNDARY_ENTITY_KEY_MISMATCH:${entityKey}:${record.entityId}`);
  }
  if (
    typeof record.version !== 'number'
    || !Number.isSafeInteger(record.version)
    || record.version < 1
  ) {
    pushValidationError(errors, limit, `BOUNDARY_VERSION_INVALID:${String(record.id ?? entityKey)}`);
  }
  if (!['ACTIVE', 'SUPERSEDED', 'PENDING_REVIEW', 'REJECTED'].includes(String(record.status))) {
    pushValidationError(errors, limit, `BOUNDARY_STATUS_INVALID:${String(record.id ?? entityKey)}`);
  }

  const bbox = isPlainRecord(record.boundingBox) ? record.boundingBox : null;
  const minLat = bbox?.minLat;
  const maxLat = bbox?.maxLat;
  const minLng = bbox?.minLng;
  const maxLng = bbox?.maxLng;
  const numbersValid = [minLat, maxLat, minLng, maxLng].every(
    (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
  );
  if (
    !numbersValid
    || !isFiniteCoord(minLat as number, minLng as number)
    || !isFiniteCoord(maxLat as number, maxLng as number)
    || (minLat as number) > (maxLat as number)
    || (minLng as number) > (maxLng as number)
  ) {
    pushValidationError(errors, limit, `BOUNDARY_BBOX_INVALID:${String(record.id ?? entityKey)}`);
  }

  // Snapshot recovery must not trust persisted geometry or a caller-supplied bbox.
  // A stale but plausible bbox can otherwise hide a real polygon from point lookup.
  const geometryReport = validatePolygonGeometry(record.geometry as PolygonGeometry);
  if (!geometryReport.valid || !geometryReport.boundingBox) {
    const issueCodes = geometryReport.issues.map((issue) => issue.code).join(',');
    pushValidationError(
      errors,
      limit,
      `BOUNDARY_GEOMETRY_INVALID:${String(record.id ?? entityKey)}:${issueCodes || 'NO_BOUNDS'}`,
    );
  } else if (numbersValid) {
    const expected = geometryReport.boundingBox;
    const tolerance = 1e-6;
    const matchesGeometry = Math.abs((minLat as number) - expected.minLat) <= tolerance
      && Math.abs((maxLat as number) - expected.maxLat) <= tolerance
      && Math.abs((minLng as number) - expected.minLng) <= tolerance
      && Math.abs((maxLng as number) - expected.maxLng) <= tolerance;
    if (!matchesGeometry) {
      pushValidationError(errors, limit, `BOUNDARY_BBOX_GEOMETRY_MISMATCH:${String(record.id ?? entityKey)}`);
    }
  }

  const simplifiedReport = validatePolygonGeometry(record.simplifiedGeometry as PolygonGeometry);
  if (!simplifiedReport.valid || !simplifiedReport.boundingBox) {
    const issueCodes = simplifiedReport.issues.map((issue) => issue.code).join(',');
    pushValidationError(
      errors,
      limit,
      `BOUNDARY_SIMPLIFIED_GEOMETRY_INVALID:${String(record.id ?? entityKey)}:${issueCodes || 'NO_BOUNDS'}`,
    );
  }
  return true;
}

function validatePoi(value: unknown, poiKey: string, errors: string[], limit: number): void {
  if (!isPlainRecord(value)) {
    pushValidationError(errors, limit, `POI_RECORD_NOT_OBJECT:${poiKey}`);
    return;
  }
  if (typeof value.id !== 'string' || value.id !== poiKey) {
    pushValidationError(errors, limit, `POI_ID_KEY_MISMATCH:${poiKey}`);
  }
  const coordinates = value.coordinates;
  if (
    !isPlainRecord(coordinates)
    || typeof coordinates.lat !== 'number'
    || typeof coordinates.lng !== 'number'
    || !isFiniteCoord(coordinates.lat, coordinates.lng)
  ) {
    pushValidationError(errors, limit, `POI_COORDINATES_INVALID:${String(value.id ?? poiKey)}`);
  }
  if (typeof value.dedupeKey !== 'string' || !value.dedupeKey.trim()) {
    pushValidationError(errors, limit, `POI_MISSING_DEDUPE_KEY:${String(value.id ?? poiKey)}`);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateSpatialListing(value: unknown, cityKey: string, listingKey: string, errors: string[], limit: number): void {
  if (!isPlainRecord(value)) {
    pushValidationError(errors, limit, `SPATIAL_LISTING_NOT_OBJECT:${cityKey}:${listingKey}`);
    return;
  }
  if (!isNonEmptyString(value.id) || value.id !== listingKey) {
    pushValidationError(errors, limit, `SPATIAL_LISTING_ID_KEY_MISMATCH:${cityKey}:${listingKey}`);
  }
  if (!isNonEmptyString(value.cityId) || value.cityId !== cityKey) {
    pushValidationError(errors, limit, `SPATIAL_LISTING_CITY_KEY_MISMATCH:${cityKey}:${listingKey}`);
  }
  const coordinates = value.coordinates;
  if (!isPlainRecord(coordinates) || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number'
    || !isFiniteCoord(coordinates.lat, coordinates.lng)) {
    pushValidationError(errors, limit, `SPATIAL_LISTING_COORDINATES_INVALID:${listingKey}`);
  }
  if (!isNonEmptyString(value.propertyId) || !isNonEmptyString(value.cityId)
    || !Number.isSafeInteger(value.hoodId) || (value.hoodId as number) <= 0
    || typeof value.sqm !== 'number' || !Number.isFinite(value.sqm) || value.sqm <= 0
    || typeof value.priceMillion !== 'number' || !Number.isFinite(value.priceMillion) || value.priceMillion < 0
    || !['PUBLISHED', 'DRAFT', 'ARCHIVED'].includes(String(value.publicationStatus))
    || !['VERIFIED', 'PENDING', 'REJECTED'].includes(String(value.verificationStatus))
    || typeof value.available !== 'boolean') {
    pushValidationError(errors, limit, `SPATIAL_LISTING_FIELDS_INVALID:${listingKey}`);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'exactPrivateAddress') && value.exactPrivateAddress !== undefined
    && typeof value.exactPrivateAddress !== 'string') {
    pushValidationError(errors, limit, `SPATIAL_LISTING_PRIVATE_ADDRESS_INVALID:${listingKey}`);
  }
}

function validateOverlay(value: unknown, key: string, errors: string[], limit: number): void {
  if (!isPlainRecord(value)) {
    pushValidationError(errors, limit, `OVERLAY_RECORD_NOT_OBJECT:${key}`);
    return;
  }
  if (!isNonEmptyString(value.layerId) || value.layerId !== key
    || !isNonEmptyString(value.cityId) || !isNonEmptyString(value.dataSourceReference)
    || !Number.isSafeInteger(value.version) || (value.version as number) < 1
    || !Number.isSafeInteger(value.featuresCount) || (value.featuresCount as number) < 0
    || !isNonEmptyString(value.updatedAtIso)
    || !['NEIGHBORHOOD_BOUNDARIES', 'DISTRICT_BOUNDARIES', 'PUBLISHED_LISTINGS', 'MARKET_PRICE_HEATMAP', 'POINTS_OF_INTEREST', 'TRANSIT_NETWORK', 'INTERNAL_ADMIN_AUDIT_LAYER'].includes(String(value.layerType))
    || !['PUBLIC', 'ADMIN_ONLY'].includes(String(value.visibilityPolicy))
    || !['PUBLIC_READ', 'PRIVILEGED_ADMIN'].includes(String(value.accessPolicy))
    || !Object.prototype.hasOwnProperty.call(value, 'payload')) {
    pushValidationError(errors, limit, `OVERLAY_FIELDS_INVALID:${key}`);
  }
  if (value.visibilityPolicy === 'ADMIN_ONLY' && value.accessPolicy !== 'PRIVILEGED_ADMIN') {
    pushValidationError(errors, limit, `OVERLAY_ADMIN_POLICY_MISMATCH:${key}`);
  }
}

function validateImportBatch(value: unknown, key: string, errors: string[], limit: number): void {
  if (!isPlainRecord(value)) {
    pushValidationError(errors, limit, `IMPORT_BATCH_NOT_OBJECT:${key}`);
    return;
  }
  const counters = ['importedBoundariesCount', 'importedPoisCount', 'duplicateSkippedCount', 'conflictCount'];
  if (!isNonEmptyString(value.batchId) || !isNonEmptyString(value.idempotencyKey) || value.idempotencyKey !== key
    || typeof value.dryRun !== 'boolean'
    || !['PREVIEW_READY', 'COMMITTED', 'PARTIAL_WITH_FAILURES'].includes(String(value.status))
    || counters.some((field) => !Number.isSafeInteger(value[field]) || (value[field] as number) < 0)
    || !Array.isArray(value.failedRecords)
    || !isNonEmptyString(value.sourceProvenance) || !isNonEmptyString(value.processedAtIso)) {
    pushValidationError(errors, limit, `IMPORT_BATCH_FIELDS_INVALID:${key}`);
    return;
  }
  for (let i = 0; i < value.failedRecords.length; i += 1) {
    const failure = value.failedRecords[i];
    if (!isPlainRecord(failure) || !Number.isSafeInteger(failure.index) || (failure.index as number) < 0 || typeof failure.reason !== 'string') {
      pushValidationError(errors, limit, `IMPORT_BATCH_FAILURE_INVALID:${key}:${i}`);
    }
  }
}

export function validatePersistedGeospatialState(
  state: unknown,
  options?: { maxErrors?: number },
): { valid: boolean; errors: string[]; counts: GeospatialRecordCounts } {
  const requestedMaxErrors = options?.maxErrors ?? 12;
  const maxErrors = Number.isSafeInteger(requestedMaxErrors) && requestedMaxErrors > 0
    ? Math.min(requestedMaxErrors, 1000)
    : 12;
  const errors: string[] = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { valid: false, errors: ['GEOSPATIAL_STATE_NOT_OBJECT'], counts: countRecords(defaultEmpty()) };
  }
  const s = state as PersistedGeospatialState;
  for (const required of [
    'boundaryHistoryByEntity',
    'poiStore',
    'poiDedupeIndex',
    'spatialListingsByCity',
    'overlayStore',
    'importBatches',
  ] as const) {
    if (!isPlainRecord(s[required])) {
      errors.push(`GEOSPATIAL_MISSING_FIELD_${required}`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors, counts: countRecords(defaultEmpty()) };
  }
  const seenBoundaryIds = new Set<string>();
  for (const [entityKey, history] of Object.entries(s.boundaryHistoryByEntity)) {
    if (!Array.isArray(history)) {
      pushValidationError(errors, maxErrors, `BOUNDARY_HISTORY_NOT_ARRAY:${entityKey}`);
      continue;
    }

    const seenVersions = new Set<number>();
    let previousVersion = 0;
    let activeCount = 0;
    for (const value of history) {
      const validRecord = validateBoundary(value, entityKey, errors, maxErrors);
      if (!validRecord) continue;
      const record = value;

      if (typeof record.id === 'string' && record.id.trim()) {
        if (seenBoundaryIds.has(record.id)) {
          pushValidationError(errors, maxErrors, `BOUNDARY_ID_DUPLICATE:${record.id}`);
        }
        seenBoundaryIds.add(record.id);
      }
      if (typeof record.version === 'number' && Number.isSafeInteger(record.version) && record.version > 0) {
        if (seenVersions.has(record.version)) {
          pushValidationError(errors, maxErrors, `BOUNDARY_VERSION_DUPLICATE:${entityKey}:${record.version}`);
        }
        if (record.version <= previousVersion) {
          pushValidationError(errors, maxErrors, `BOUNDARY_VERSION_SEQUENCE_INVALID:${entityKey}`);
        }
        seenVersions.add(record.version);
        previousVersion = record.version;
      }
      if (record.status === 'ACTIVE') activeCount += 1;
    }

    if (activeCount > 1) {
      pushValidationError(errors, maxErrors, `BOUNDARY_MULTIPLE_ACTIVE_VERSIONS:${entityKey}`);
    }
  }

  for (const [poiKey, poi] of Object.entries(s.poiStore)) {
    validatePoi(poi, poiKey, errors, maxErrors);
  }

  const validPoiIds = new Set(Object.entries(s.poiStore)
    .filter(([key, value]) => isPlainRecord(value) && value.id === key)
    .map(([key]) => key));
  for (const [dedupeKey, poiId] of Object.entries(s.poiDedupeIndex)) {
    if (!isNonEmptyString(dedupeKey) || !isNonEmptyString(poiId) || !validPoiIds.has(poiId)) {
      pushValidationError(errors, maxErrors, `POI_DEDUPE_INDEX_REFERENCE_INVALID:${dedupeKey}`);
    } else {
      const poi = s.poiStore[poiId];
      if (isPlainRecord(poi) && poi.dedupeKey !== dedupeKey) {
        pushValidationError(errors, maxErrors, `POI_DEDUPE_INDEX_KEY_MISMATCH:${dedupeKey}`);
      }
    }
  }

  for (const [cityKey, cityListings] of Object.entries(s.spatialListingsByCity)) {
    if (!isNonEmptyString(cityKey) || !isPlainRecord(cityListings)) {
      pushValidationError(errors, maxErrors, `SPATIAL_LISTING_CITY_NOT_OBJECT:${cityKey}`);
      continue;
    }
    for (const [listingKey, listing] of Object.entries(cityListings)) {
      validateSpatialListing(listing, cityKey, listingKey, errors, maxErrors);
    }
  }
  for (const [overlayKey, overlay] of Object.entries(s.overlayStore)) {
    validateOverlay(overlay, overlayKey, errors, maxErrors);
  }
  for (const [batchKey, batch] of Object.entries(s.importBatches)) {
    validateImportBatch(batch, batchKey, errors, maxErrors);
  }

  const counts = countRecords(s);
  return { valid: errors.length === 0, errors, counts };
}

