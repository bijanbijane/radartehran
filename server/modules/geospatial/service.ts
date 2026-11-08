import crypto from 'crypto';
import { CoreApiError } from '../core';
import { defaultGeographyService } from '../geography';
import {
  boundingBoxesOverlap,
  calculateGeodesicDistanceMeters,
  classifyPointInPolygon,
  normalizeAndValidateCoordinate,
  simplifyPolygonGeometry,
  validatePolygonGeometry,
} from './coordinateAndPolygonEngine';
import {
  buildValuationLocationFeatureVector,
  computeLocationContextIndicators,
  computePoiDedupeKey,
  executeBoundedSpatialSearch,
} from './poiAndSpatialSearchEngine';
import type {
  BoundaryVersionRecord,
  GeographicOverlayLayer,
  GeospatialImportBatchResult,
  GeospatialModuleDependencies,
  GeospatialObservabilityMetrics,
  LocationContextIndicators,
  NormalizedCoordinateResult,
  PoiCategory,
  PointOfInterestRecord,
  PointResolutionResult,
  PolygonGeometry,
  SpatialPublishableListing,
  SpatialSearchQuery,
  SpatialSearchResult,
  ValuationLocationFeatureVector,
  Wgs84Coordinate,
} from './types';

export function createGeospatialService(deps: GeospatialModuleDependencies = {}) {
  const geoService = deps.geographyService ?? defaultGeographyService;
  const nowFn = deps.now ?? (() => new Date());

  // Versioned boundaries keyed by entityId -> array of all historical versions (never deleted)
  const boundaryHistoryByEntity = new Map<string, BoundaryVersionRecord[]>();
  const poiStore = new Map<string, PointOfInterestRecord>();
  const poiDedupeIndex = new Map<string, string>();
  const spatialListingsByCity = new Map<string, Map<string, SpatialPublishableListing>>();
  const overlayStore = new Map<string, GeographicOverlayLayer>();
  const overlayCache = new Map<string, GeographicOverlayLayer>();
  const geocodeCache = new Map<string, { formattedAddressFa: string; coordinates: Wgs84Coordinate; provider: string }>();
  const importBatches = new Map<string, GeospatialImportBatchResult>();
  const activeBoundaryLocks = new Set<string>();

  const metrics: GeospatialObservabilityMetrics = {
    spatialQueriesCount: 0,
    totalQueryLatencyMs: 0,
    pointResolutionFailuresCount: 0,
    invalidGeometryEventsCount: 0,
    importFailuresCount: 0,
    cacheHitsCount: 0,
    cacheMissesCount: 0,
    geocodingErrorsCount: 0,
  };

  function invalidateGeoCaches(cityId: string) {
    for (const [k, v] of overlayCache.entries()) {
      if (v.cityId === cityId) overlayCache.delete(k);
    }
  }

  function normalizeCoordinate(
    rawLat: unknown,
    rawLng: unknown,
    options?: { precisionDecimals?: number; sourceProvenance?: string },
  ): NormalizedCoordinateResult {
    return normalizeAndValidateCoordinate(rawLat, rawLng, options);
  }

  function validateHierarchyRelationship(childId: string, parentOrAncestorId: string): boolean {
    const normChild = childId.startsWith('prov:') ? childId.replace(/^prov:/, 'province:') : childId;
    const normParent = parentOrAncestorId.startsWith('prov:')
      ? parentOrAncestorId.replace(/^prov:/, 'province:')
      : parentOrAncestorId;
    return geoService.validateHierarchyRelationship(normChild, normParent);
  }

  async function upsertNeighborhoodBoundary(params: {
    actorUid: string;
    entityId: string;
    cityId: string;
    districtId?: string;
    hoodId?: number;
    subNeighborhoodId?: string;
    level: BoundaryVersionRecord['level'];
    nameFa: string;
    nameEn?: string;
    historicalNames?: string[];
    geometry: PolygonGeometry;
    sourceProvenance: string;
    autoApprove?: boolean;
  }): Promise<BoundaryVersionRecord> {
    if (activeBoundaryLocks.has(params.entityId)) {
      throw new CoreApiError('CONFLICT', 409, `Concurrent boundary update in progress for '${params.entityId}'.`);
    }
    activeBoundaryLocks.add(params.entityId);
    try {
      const validation = validatePolygonGeometry(params.geometry);
      if (!validation.valid || !validation.boundingBox) {
        metrics.invalidGeometryEventsCount += 1;
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid polygon geometry.', {
          issues: validation.issues,
        });
      }

      const history = boundaryHistoryByEntity.get(params.entityId) ?? [];
      const prevActive = history.find((b) => b.status === 'ACTIVE');
      if (prevActive && params.autoApprove !== false) {
        prevActive.status = 'SUPERSEDED';
      }

      const nextVersion = history.length + 1;
      const nowIso = nowFn().toISOString();
      const record: BoundaryVersionRecord = {
        id: `bnd_${params.entityId.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${nextVersion}`,
        entityId: params.entityId,
        cityId: params.cityId,
        districtId: params.districtId,
        hoodId: params.hoodId,
        subNeighborhoodId: params.subNeighborhoodId,
        level: params.level,
        nameFa: params.nameFa,
        nameEn: params.nameEn,
        historicalNames: params.historicalNames,
        version: nextVersion,
        status: params.autoApprove === false ? 'PENDING_REVIEW' : 'ACTIVE',
        geometry: structuredClone(params.geometry),
        simplifiedGeometry: simplifyPolygonGeometry(params.geometry, 2),
        boundingBox: validation.boundingBox,
        sourceProvenance: params.sourceProvenance,
        createdByUid: params.actorUid,
        createdAtIso: nowIso,
        reviewedByUid: params.autoApprove === false ? undefined : params.actorUid,
        reviewedAtIso: params.autoApprove === false ? undefined : nowIso,
        previousVersionId: prevActive?.id,
      };

      history.push(record);
      boundaryHistoryByEntity.set(params.entityId, history);
      invalidateGeoCaches(params.cityId);
      return structuredClone(record);
    } finally {
      activeBoundaryLocks.delete(params.entityId);
    }
  }

  function getActiveBoundary(entityId: string): BoundaryVersionRecord | null {
    const history = boundaryHistoryByEntity.get(entityId) ?? [];
    const active = history.find((b) => b.status === 'ACTIVE') ?? history[history.length - 1];
    return active ? structuredClone(active) : null;
  }

  function listBoundaryVersions(entityId: string): BoundaryVersionRecord[] {
    return structuredClone(boundaryHistoryByEntity.get(entityId) ?? []);
  }

  function detectBoundaryOverlaps(cityId: string, level: BoundaryVersionRecord['level'] = 'neighborhood'): Array<{
    entityA: string;
    entityB: string;
  }> {
    const activeList: BoundaryVersionRecord[] = [];
    for (const history of boundaryHistoryByEntity.values()) {
      const act = history.find((b) => b.status === 'ACTIVE' && b.cityId === cityId && b.level === level);
      if (act) activeList.push(act);
    }
    const overlaps: Array<{ entityA: string; entityB: string }> = [];
    for (let i = 0; i < activeList.length; i++) {
      for (let j = i + 1; j < activeList.length; j++) {
        if (boundingBoxesOverlap(activeList[i].boundingBox, activeList[j].boundingBox)) {
          overlaps.push({ entityA: activeList[i].entityId, entityB: activeList[j].entityId });
        }
      }
    }
    return overlaps;
  }

  function resolvePointToGeography(rawLat: unknown, rawLng: unknown): PointResolutionResult {
    const norm = normalizeAndValidateCoordinate(rawLat, rawLng);
    if (!norm.valid || !norm.coordinate) {
      metrics.pointResolutionFailuresCount += 1;
      throw new CoreApiError('VALIDATION_FAILED', 400, norm.errorMessage ?? 'Invalid coordinates.');
    }
    const pt = norm.coordinate;

    const insideMatches: Array<{ record: BoundaryVersionRecord; classification: 'INSIDE' | 'ON_EDGE' }> = [];

    for (const history of boundaryHistoryByEntity.values()) {
      const active = history.find((b) => b.status === 'ACTIVE');
      if (!active) continue;
      const bb = active.boundingBox;
      if (pt.lat < bb.minLat - 0.001 || pt.lat > bb.maxLat + 0.001 || pt.lng < bb.minLng - 0.001 || pt.lng > bb.maxLng + 0.001) {
        continue;
      }
      const cls = classifyPointInPolygon(pt, active.geometry);
      if (cls === 'INSIDE' || cls === 'ON_EDGE') {
        insideMatches.push({ record: active, classification: cls });
      }
    }

    if (insideMatches.length === 0) {
      metrics.pointResolutionFailuresCount += 1;
      return {
        resolved: false,
        status: 'OUTSIDE_KNOWN_BOUNDARIES',
        confidence: 'none',
        candidateBoundaryIds: [],
      };
    }

    // Separate sub_neighborhood vs neighborhood matches
    const hoodMatches = insideMatches.filter((m) => m.record.level === 'neighborhood');
    const subMatches = insideMatches.filter((m) => m.record.level === 'sub_neighborhood');

    // Deterministic tie-breaking: sort by hoodId / entityId ascending
    hoodMatches.sort((a, b) => (a.record.hoodId ?? 9999) - (b.record.hoodId ?? 9999));
    subMatches.sort((a, b) => a.record.entityId.localeCompare(b.record.entityId));

    const primary = hoodMatches[0] ?? insideMatches[0];
    const sub = subMatches[0]?.record;

    const isEdge = primary.classification === 'ON_EDGE';
    const isAmbiguousOverlap = hoodMatches.filter((m) => m.classification === 'INSIDE').length > 1;

    return {
      resolved: true,
      status: isEdge
        ? 'RESOLVED_ON_EDGE'
        : isAmbiguousOverlap
          ? 'AMBIGUOUS_OVERLAP'
          : 'RESOLVED_INSIDE',
      confidence: isEdge || isAmbiguousOverlap ? 'medium' : 'high',
      cityId: primary.record.cityId,
      districtId: primary.record.districtId,
      hoodId: primary.record.hoodId,
      hoodNameFa: primary.record.nameFa,
      subNeighborhoodId: sub?.subNeighborhoodId ?? primary.record.subNeighborhoodId,
      boundaryVersionId: primary.record.id,
      boundaryVersion: primary.record.version,
      sourceProvenance: primary.record.sourceProvenance,
      candidateBoundaryIds: insideMatches.map((m) => m.record.id),
    };
  }

  function upsertPointOfInterest(params: {
    id?: string;
    nameFa: string;
    nameEn?: string;
    category: PoiCategory;
    coordinates: Wgs84Coordinate;
    cityId: string;
    districtId?: string;
    hoodId?: number;
    sourceProvenance: string;
    verificationStatus?: PointOfInterestRecord['verificationStatus'];
    publicVisible?: boolean;
    attributes?: Record<string, string | number | boolean>;
  }): { record: PointOfInterestRecord; isDuplicate: boolean } {
    const coordCheck = normalizeAndValidateCoordinate(params.coordinates.lat, params.coordinates.lng);
    if (!coordCheck.valid || !coordCheck.coordinate) {
      throw new CoreApiError('VALIDATION_FAILED', 400, coordCheck.errorMessage ?? 'Invalid POI coordinates.');
    }

    const dedupeKey = computePoiDedupeKey({
      cityId: params.cityId,
      category: params.category,
      nameFa: params.nameFa,
      coordinates: coordCheck.coordinate,
    });

    const existingId = poiDedupeIndex.get(dedupeKey);
    if (existingId && poiStore.has(existingId)) {
      return {
        record: structuredClone(poiStore.get(existingId)!),
        isDuplicate: true,
      };
    }

    const record: PointOfInterestRecord = {
      id: params.id ?? `poi_${crypto.randomBytes(6).toString('hex')}`,
      nameFa: params.nameFa.trim(),
      nameEn: params.nameEn?.trim(),
      category: params.category,
      coordinates: coordCheck.coordinate,
      cityId: params.cityId,
      districtId: params.districtId,
      hoodId: params.hoodId,
      sourceProvenance: params.sourceProvenance,
      verificationStatus: params.verificationStatus ?? 'VERIFIED',
      publicVisible: params.publicVisible ?? true,
      attributes: params.attributes ?? {},
      lastValidatedAtIso: nowFn().toISOString(),
      dedupeKey,
    };

    poiStore.set(record.id, record);
    poiDedupeIndex.set(dedupeKey, record.id);
    invalidateGeoCaches(record.cityId);
    return { record: structuredClone(record), isDuplicate: false };
  }

  function findNearbyPointsOfInterest(params: {
    cityId: string;
    center: Wgs84Coordinate;
    radiusMeters: number;
    categories?: PoiCategory[];
    includeUnverifiedOrPrivate?: boolean;
  }): Array<PointOfInterestRecord & { distanceMeters: number; distanceUnit: 'meters' }> {
    if (params.radiusMeters <= 0 || params.radiusMeters > 25_000) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'radiusMeters must be between 1 and 25000.');
    }
    const results: Array<PointOfInterestRecord & { distanceMeters: number; distanceUnit: 'meters' }> = [];
    for (const poi of poiStore.values()) {
      if (poi.cityId !== params.cityId) continue;
      if (!params.includeUnverifiedOrPrivate && (!poi.publicVisible || poi.verificationStatus !== 'VERIFIED')) {
        continue;
      }
      if (params.categories && params.categories.length > 0 && !params.categories.includes(poi.category)) {
        continue;
      }
      const dist = calculateGeodesicDistanceMeters(params.center, poi.coordinates);
      if (dist <= params.radiusMeters) {
        results.push({
          ...structuredClone(poi),
          distanceMeters: dist,
          distanceUnit: 'meters',
        });
      }
    }
    results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return results;
  }

  function indexListingForSpatialSearch(listing: SpatialPublishableListing): void {
    const coordCheck = normalizeAndValidateCoordinate(listing.coordinates.lat, listing.coordinates.lng);
    if (!coordCheck.valid || !coordCheck.coordinate) {
      throw new CoreApiError('VALIDATION_FAILED', 400, coordCheck.errorMessage ?? 'Invalid listing coordinates.');
    }
    const cityMap = spatialListingsByCity.get(listing.cityId) ?? new Map<string, SpatialPublishableListing>();
    cityMap.set(listing.id, {
      ...structuredClone(listing),
      coordinates: coordCheck.coordinate,
    });
    spatialListingsByCity.set(listing.cityId, cityMap);
  }

  function searchListingsSpatially(query: SpatialSearchQuery): SpatialSearchResult {
    const startMs = Date.now();
    metrics.spatialQueriesCount += 1;
    try {
      const cityMap = spatialListingsByCity.get(query.cityId);
      const indexedListings = cityMap ? Array.from(cityMap.values()) : [];
      return executeBoundedSpatialSearch({
        query,
        indexedListingsByCity: indexedListings,
      });
    } finally {
      metrics.totalQueryLatencyMs += Math.max(1, Date.now() - startMs);
    }
  }

  function getLocationContext(params: {
    coordinates: Wgs84Coordinate;
    cityId: string;
    hoodId?: number;
  }): LocationContextIndicators {
    const check = normalizeAndValidateCoordinate(params.coordinates.lat, params.coordinates.lng);
    if (!check.valid || !check.coordinate) {
      throw new CoreApiError('VALIDATION_FAILED', 400, check.errorMessage ?? 'Invalid coordinates.');
    }
    return computeLocationContextIndicators({
      coordinates: check.coordinate,
      cityId: params.cityId,
      hoodId: params.hoodId,
      pois: Array.from(poiStore.values()),
    });
  }

  function getValuationLocationFeatures(params: {
    coordinates: Wgs84Coordinate;
    cityId: string;
    hoodId?: number;
  }): ValuationLocationFeatureVector {
    const resolved = resolvePointToGeography(params.coordinates.lat, params.coordinates.lng);
    const hoodId = resolved.hoodId ?? params.hoodId ?? 1;
    const context = getLocationContext({
      coordinates: params.coordinates,
      cityId: resolved.cityId ?? params.cityId,
      hoodId,
    });
    return buildValuationLocationFeatureVector({
      coordinates: params.coordinates,
      cityId: resolved.cityId ?? params.cityId,
      districtId: resolved.districtId,
      hoodId,
      subNeighborhoodId: resolved.subNeighborhoodId,
      boundaryVersion: resolved.boundaryVersion ?? 1,
      context,
    });
  }

  function upsertGeographicOverlay(layer: GeographicOverlayLayer): GeographicOverlayLayer {
    overlayStore.set(layer.layerId, structuredClone(layer));
    overlayCache.delete(layer.layerId);
    return structuredClone(layer);
  }

  function getGeographicOverlay(params: {
    layerId: string;
    isAdminCaller: boolean;
  }): GeographicOverlayLayer {
    const cached = overlayCache.get(params.layerId);
    if (cached) {
      if (cached.visibilityPolicy === 'ADMIN_ONLY' && !params.isAdminCaller) {
        throw new CoreApiError('FORBIDDEN', 403, 'Access to administrative geographic overlay is restricted.');
      }
      metrics.cacheHitsCount += 1;
      return structuredClone(cached);
    }

    metrics.cacheMissesCount += 1;
    const layer = overlayStore.get(params.layerId);
    if (!layer) {
      throw new CoreApiError('NOT_FOUND', 404, `Geographic overlay '${params.layerId}' not found.`);
    }
    if (layer.visibilityPolicy === 'ADMIN_ONLY' && !params.isAdminCaller) {
      throw new CoreApiError('FORBIDDEN', 403, 'Access to administrative geographic overlay is restricted.');
    }
    overlayCache.set(params.layerId, structuredClone(layer));
    return structuredClone(layer);
  }

  function getSpatialMarketSummary(params: {
    cityId: string;
    hoodId: number;
  }) {
    if (!deps.marketIntelligenceService) {
      throw new CoreApiError('CONFLICT', 409, 'MarketIntelligenceService integration is not configured.');
    }
    const profile = deps.marketIntelligenceService.getNeighborhoodMarketProfile({
      cityId: params.cityId,
      hoodId: params.hoodId,
      isPublicRequest: true,
    });
    const activeBnd = getActiveBoundary(`hood:${params.cityId}:${params.hoodId}`);
    return {
      cityId: params.cityId,
      hoodId: params.hoodId,
      hoodName: profile.hoodName,
      boundaryVersionId: activeBnd?.id ?? profile.boundaryReference,
      boundaryVersion: activeBnd?.version ?? 1,
      simplifiedGeometry: activeBnd?.simplifiedGeometry ?? null,
      medianAskingPsmMillion: profile.saleIndicators.medianAskingPricePerSqmMillion,
      medianVerifiedPsmMillion: profile.saleIndicators.medianVerifiedPricePerSqmMillion,
      rentalPricePerSqmThousandToman: profile.rentalIndicators.rentalPricePerSqmThousandToman,
      activeListingInventory: profile.saleIndicators.activeSaleListingInventory,
      completedTransactionVolume: profile.saleIndicators.completedSaleVolume,
      marketActivityLevel: profile.saleIndicators.marketActivityLevel,
      coverageLevel: profile.coverageLevel,
      freshnessDays: profile.saleIndicators.reliability.freshnessDays,
    };
  }

  async function importGeographicDataset(params: {
    actorUid: string;
    idempotencyKey: string;
    dryRun?: boolean;
    sourceProvenance: string;
    boundaries?: Array<{
      entityId: string;
      cityId: string;
      districtId?: string;
      hoodId?: number;
      level: BoundaryVersionRecord['level'];
      nameFa: string;
      geometry: PolygonGeometry;
    }>;
    pois?: Array<{
      nameFa: string;
      category: PoiCategory;
      coordinates: Wgs84Coordinate;
      cityId: string;
      hoodId?: number;
    }>;
  }): Promise<GeospatialImportBatchResult> {
    if (!params.dryRun && importBatches.has(params.idempotencyKey)) {
      return structuredClone(importBatches.get(params.idempotencyKey)!);
    }

    const failedRecords: Array<{ index: number; reason: string }> = [];
    let importedBoundariesCount = 0;
    let importedPoisCount = 0;
    let duplicateSkippedCount = 0;
    let conflictCount = 0;

    const boundaries = params.boundaries ?? [];
    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i];
      const val = validatePolygonGeometry(b.geometry);
      if (!val.valid) {
        failedRecords.push({ index: i, reason: val.issues.map((x) => x.message).join('; ') });
        metrics.importFailuresCount += 1;
        continue;
      }
      if (boundaryHistoryByEntity.has(b.entityId)) {
        conflictCount += 1;
      }
      if (!params.dryRun) {
        await upsertNeighborhoodBoundary({
          actorUid: params.actorUid,
          entityId: b.entityId,
          cityId: b.cityId,
          districtId: b.districtId,
          hoodId: b.hoodId,
          level: b.level,
          nameFa: b.nameFa,
          geometry: b.geometry,
          sourceProvenance: params.sourceProvenance,
          autoApprove: true,
        });
      }
      importedBoundariesCount += 1;
    }

    const pois = params.pois ?? [];
    for (let i = 0; i < pois.length; i++) {
      const p = pois[i];
      const check = normalizeAndValidateCoordinate(p.coordinates.lat, p.coordinates.lng);
      if (!check.valid || !check.coordinate) {
        failedRecords.push({ index: boundaries.length + i, reason: check.errorMessage ?? 'Invalid POI coordinate' });
        metrics.importFailuresCount += 1;
        continue;
      }
      const dedupeKey = computePoiDedupeKey({
        cityId: p.cityId,
        category: p.category,
        nameFa: p.nameFa,
        coordinates: check.coordinate,
      });
      if (poiDedupeIndex.has(dedupeKey)) {
        duplicateSkippedCount += 1;
        continue;
      }
      if (!params.dryRun) {
        upsertPointOfInterest({
          nameFa: p.nameFa,
          category: p.category,
          coordinates: check.coordinate,
          cityId: p.cityId,
          hoodId: p.hoodId,
          sourceProvenance: params.sourceProvenance,
        });
      }
      importedPoisCount += 1;
    }

    const result: GeospatialImportBatchResult = {
      batchId: `gis_imp_${crypto.randomBytes(6).toString('hex')}`,
      idempotencyKey: params.idempotencyKey,
      dryRun: Boolean(params.dryRun),
      status: params.dryRun
        ? 'PREVIEW_READY'
        : failedRecords.length > 0
          ? 'PARTIAL_WITH_FAILURES'
          : 'COMMITTED',
      importedBoundariesCount,
      importedPoisCount,
      duplicateSkippedCount,
      conflictCount,
      failedRecords,
      sourceProvenance: params.sourceProvenance,
      processedAtIso: nowFn().toISOString(),
    };

    if (!params.dryRun) {
      importBatches.set(params.idempotencyKey, result);
    }
    return structuredClone(result);
  }

  async function forwardGeocode(addressText: string) {
    const key = addressText.trim();
    if (!key) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'addressText is required.');
    }
    const cached = geocodeCache.get(key);
    if (cached) {
      metrics.cacheHitsCount += 1;
      return { status: 'OK' as const, cached: true, ...cached };
    }
    metrics.cacheMissesCount += 1;
    const providerRes = await geoService.forwardGeocode(key);
    if (providerRes.status !== 'SUCCESS' || !providerRes.location) {
      metrics.geocodingErrorsCount += 1;
      const normalizedStatus =
        providerRes.status === 'UNAVAILABLE' ? ('PROVIDER_UNAVAILABLE' as const) : providerRes.status;
      return {
        status: normalizedStatus,
        cached: false,
        errorMessage: providerRes.error ?? 'Geocoding provider unavailable or returned no match.',
      };
    }
    const entry = {
      formattedAddressFa: providerRes.formattedAddressFa ?? key,
      coordinates: providerRes.location,
      provider: 'authorized_geography_provider',
    };
    geocodeCache.set(key, entry);
    return { status: 'OK' as const, cached: false, ...entry };
  }

  return {
    normalizeCoordinate,
    validateHierarchyRelationship,
    validatePolygonGeometry,
    calculateDistanceMeters: (a: Wgs84Coordinate, b: Wgs84Coordinate) => ({
      distanceMeters: calculateGeodesicDistanceMeters(a, b),
      distanceUnit: 'meters' as const,
      method: 'geodesic_straight_line_haversine' as const,
    }),
    upsertNeighborhoodBoundary,
    getActiveBoundary,
    listBoundaryVersions,
    detectBoundaryOverlaps,
    resolvePointToGeography,
    upsertPointOfInterest,
    findNearbyPointsOfInterest,
    indexListingForSpatialSearch,
    searchListingsSpatially,
    getLocationContext,
    getValuationLocationFeatures,
    upsertGeographicOverlay,
    getGeographicOverlay,
    getSpatialMarketSummary,
    importGeographicDataset,
    forwardGeocode,
    getObservabilityMetrics: (): GeospatialObservabilityMetrics => structuredClone(metrics),
  };
}

export type GeospatialService = ReturnType<typeof createGeospatialService>;
