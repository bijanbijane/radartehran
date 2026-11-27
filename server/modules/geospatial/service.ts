import { CoreApiError } from '../core';
import { defaultGeographyService } from '../geography';
import {
  boundingBoxesOverlap,
  calculateGeodesicDistanceMeters,
  normalizeAndValidateCoordinate,
  validatePolygonGeometry,
} from './coordinateAndPolygonEngine';
import {
  buildValuationLocationFeatureVector,
  computeLocationContextIndicators,
} from './poiAndSpatialSearchEngine';
import type {
  BoundaryVersionRecord,
  GeographicOverlayLayer,
  GeospatialImportBatchResult,
  GeospatialModuleDependencies,
  GeospatialObservabilityMetrics,
  LocationContextIndicators,
  NormalizedCoordinateResult,
  PointOfInterestRecord,
  PointResolutionResult,
  SpatialPublishableListing,
  SpatialSearchQuery,
  SpatialSearchResult,
  ValuationLocationFeatureVector,
  Wgs84Coordinate,
} from './types';
import {
  createGeospatialPersistHook,
  hydrateGeospatialRuntimeFromRepository,
} from './geospatialRuntimePersistence';
import { executePublicSpatialListingSearch } from './geospatialPublicListingSearch';
import {
  detectActiveBoundaryBboxOverlaps,
  pickActiveBoundaryVersion,
  pickLatestBoundaryVersion,
} from './geospatialBoundaryReadModel';
import {
  executeApproveNeighborhoodBoundary,
  executeUpsertNeighborhoodBoundary,
  type ApproveNeighborhoodBoundaryParams,
  type UpsertNeighborhoodBoundaryParams,
} from './geospatialBoundaryMutations';
import { resolvePointInBoundaryStore } from './geospatialPointResolution';
import {
  executeFindNearbyPointsOfInterest,
  executeUpsertPointOfInterest,
  type UpsertPoiParams,
} from './geospatialPoiOperations';
import { executeGetGeographicOverlay, executeUpsertGeographicOverlay } from './geospatialOverlayAccess';
import { executeForwardGeocode, type GeocodeCacheEntry } from './geospatialForwardGeocode';
import { executeImportGeographicDataset, type ImportGeographicDatasetParams } from './geospatialDatasetImport';
import { buildNeighborhoodProfileBoundaryReadModel } from './neighborhoodProfileBoundaryReadModel';

export function createGeospatialService(deps: GeospatialModuleDependencies = {}) {
  const geoService = deps.geographyService ?? defaultGeographyService;
  const nowFn = deps.now ?? (() => new Date());

  const boundaryHistoryByEntity = new Map<string, BoundaryVersionRecord[]>();
  const poiStore = new Map<string, PointOfInterestRecord>();
  const poiDedupeIndex = new Map<string, string>();
  const spatialListingsByCity = new Map<string, Map<string, SpatialPublishableListing>>();
  const overlayStore = new Map<string, GeographicOverlayLayer>();
  const overlayCache = new Map<string, GeographicOverlayLayer>();
  const geocodeCache = new Map<string, GeocodeCacheEntry>();
  const importBatches = new Map<string, GeospatialImportBatchResult>();
  const activeBoundaryLocks = new Set<string>();

  const runtimeMaps = {
    boundaryHistoryByEntity,
    poiStore,
    poiDedupeIndex,
    spatialListingsByCity,
    overlayStore,
    importBatches,
  };
  hydrateGeospatialRuntimeFromRepository(runtimeMaps);
  const persistRuntime = createGeospatialPersistHook(runtimeMaps);

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

  async function upsertNeighborhoodBoundary(params: UpsertNeighborhoodBoundaryParams) {
    return executeUpsertNeighborhoodBoundary({
      input: params,
      boundaryHistoryByEntity,
      activeBoundaryLocks,
      metrics,
      nowIso: nowFn().toISOString(),
      invalidateGeoCaches,
      persistRuntime,
    });
  }

  async function approveNeighborhoodBoundary(params: ApproveNeighborhoodBoundaryParams) {
    return executeApproveNeighborhoodBoundary({
      input: params,
      boundaryHistoryByEntity,
      activeBoundaryLocks,
      nowIso: nowFn().toISOString(),
      invalidateGeoCaches,
      persistRuntime,
    });
  }

  function getActiveBoundary(entityId: string): BoundaryVersionRecord | null {
    return pickActiveBoundaryVersion(boundaryHistoryByEntity.get(entityId) ?? []);
  }

  function getLatestBoundaryVersion(entityId: string): BoundaryVersionRecord | null {
    return pickLatestBoundaryVersion(boundaryHistoryByEntity.get(entityId) ?? []);
  }

  async function getNeighborhoodProfileBoundaryReadModel(params: {
    cityId: string;
    hoodId: number;
  }) {
    const entityId = `hood:${params.cityId}:${params.hoodId}`;
    return buildNeighborhoodProfileBoundaryReadModel({
      boundary: getActiveBoundary(entityId),
      expectedCityId: params.cityId,
      expectedLegacyNeighborhoodId: params.hoodId,
      resolvers: deps.neighborhoodProfileBoundaryResolvers,
    });
  }

  function detectBoundaryOverlaps(cityId: string, level: BoundaryVersionRecord['level'] = 'neighborhood') {
    return detectActiveBoundaryBboxOverlaps(boundaryHistoryByEntity, cityId, level, boundingBoxesOverlap);
  }

  function resolvePointToGeography(rawLat: unknown, rawLng: unknown): PointResolutionResult {
    return resolvePointInBoundaryStore({ boundaryHistoryByEntity, metrics, rawLat, rawLng });
  }

  function upsertPointOfInterest(params: UpsertPoiParams) {
    return executeUpsertPointOfInterest({
      input: params,
      poiStore,
      poiDedupeIndex,
      nowIso: nowFn().toISOString(),
      invalidateGeoCaches,
      persistRuntime,
    });
  }

  function findNearbyPointsOfInterest(
    params: Omit<Parameters<typeof executeFindNearbyPointsOfInterest>[0], 'poiStore'>,
  ): ReturnType<typeof executeFindNearbyPointsOfInterest> {
    return executeFindNearbyPointsOfInterest({ ...params, poiStore });
  }

  function indexListingForSpatialSearch(listing: SpatialPublishableListing): void {
    const coordCheck = normalizeAndValidateCoordinate(listing.coordinates.lat, listing.coordinates.lng);
    if (!coordCheck.valid || !coordCheck.coordinate) {
      throw new CoreApiError('VALIDATION_FAILED', 400, coordCheck.errorMessage ?? 'Invalid listing coordinates.');
    }
    // A listing ID is globally unique in this index. Remove any previous city entry
    // before inserting the latest record so city changes cannot leave stale duplicates.
    for (const [indexedCityId, indexedListings] of spatialListingsByCity.entries()) {
      if (indexedCityId === listing.cityId || !indexedListings.has(listing.id)) continue;
      indexedListings.delete(listing.id);
      if (indexedListings.size === 0) spatialListingsByCity.delete(indexedCityId);
    }
    const cityMap = spatialListingsByCity.get(listing.cityId) ?? new Map<string, SpatialPublishableListing>();
    cityMap.set(listing.id, {
      ...structuredClone(listing),
      coordinates: coordCheck.coordinate,
    });
    spatialListingsByCity.set(listing.cityId, cityMap);
    // Spatial listings are part of the durable geospatial repository; persist each index mutation.
    persistRuntime();
  }

  function removeListingFromSpatialSearch(listingId: string): boolean {
    const normalizedId = listingId.trim();
    if (!normalizedId) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Listing ID is required.');
    }

    let removed = false;
    for (const [cityId, cityMap] of spatialListingsByCity.entries()) {
      if (!cityMap.delete(normalizedId)) continue;
      removed = true;
      if (cityMap.size === 0) spatialListingsByCity.delete(cityId);
    }

    // Avoid unnecessary writes when the listing is already absent.
    if (removed) persistRuntime();
    return removed;
  }

  function searchListingsSpatially(query: SpatialSearchQuery): SpatialSearchResult {
    const startMs = Date.now();
    metrics.spatialQueriesCount += 1;
    try {
      return executePublicSpatialListingSearch(spatialListingsByCity, query);
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
    if (
      !resolved.resolved
      || resolved.status !== 'RESOLVED_INSIDE'
      || !resolved.cityId
      || typeof resolved.hoodId !== 'number'
      || !Number.isSafeInteger(resolved.hoodId)
      || resolved.hoodId <= 0
      || typeof resolved.boundaryVersion !== 'number'
      || !Number.isSafeInteger(resolved.boundaryVersion)
      || resolved.boundaryVersion < 1
      || typeof resolved.boundaryVersionId !== 'string'
      || !resolved.boundaryVersionId.trim()
    ) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        'A unique point strictly inside an active neighborhood boundary is required for valuation features.',
        {
          resolutionStatus: resolved.status,
          candidateBoundaryIds: resolved.candidateBoundaryIds,
        },
      );
    }
    if (resolved.cityId !== params.cityId) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        'Resolved neighborhood city does not match the requested city.',
        { requestedCityId: params.cityId, resolvedCityId: resolved.cityId },
      );
    }
    if (params.hoodId !== undefined && params.hoodId !== resolved.hoodId) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        'Caller-supplied neighborhood ID does not match the spatially resolved neighborhood.',
        { requestedHoodId: params.hoodId, resolvedHoodId: resolved.hoodId },
      );
    }
    const hoodId = resolved.hoodId!;
    const context = getLocationContext({
      coordinates: params.coordinates,
      cityId: resolved.cityId,
      hoodId,
    });
    return buildValuationLocationFeatureVector({
      coordinates: params.coordinates,
      cityId: resolved.cityId ?? params.cityId,
      districtId: resolved.districtId,
      hoodId,
      subNeighborhoodId: resolved.subNeighborhoodId,
      boundaryVersion: resolved.boundaryVersion,
      context,
    });
  }

  function upsertGeographicOverlay(layer: GeographicOverlayLayer): GeographicOverlayLayer {
    return executeUpsertGeographicOverlay(layer, overlayStore, overlayCache, persistRuntime);
  }

  function getGeographicOverlay(params: { layerId: string; isAdminCaller: boolean }): GeographicOverlayLayer {
    return executeGetGeographicOverlay({
      ...params,
      overlayStore,
      overlayCache,
      metrics,
    });
  }

  function getSpatialMarketSummary(params: { cityId: string; hoodId: number }) {
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
      // A market-profile boundaryReference is not a verified active GIS version.
      // Do not synthesize v1 when the boundary registry has no unique ACTIVE record.
      boundaryVersionId: activeBnd?.id ?? null,
      boundaryVersion: activeBnd?.version ?? null,
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

  async function importGeographicDataset(params: ImportGeographicDatasetParams) {
    return executeImportGeographicDataset({
      input: params,
      boundaryHistoryByEntity,
      poiDedupeIndex,
      importBatches,
      metrics,
      nowIso: nowFn().toISOString(),
      upsertNeighborhoodBoundary,
      upsertPointOfInterest,
      persistRuntime,
    });
  }

  async function forwardGeocode(addressText: string) {
    return executeForwardGeocode({
      addressText,
      geocodeCache,
      metrics,
      geographyService: geoService,
    });
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
    approveNeighborhoodBoundary,
    getActiveBoundary,
    getLatestBoundaryVersion,
    getNeighborhoodProfileBoundaryReadModel,
    listBoundaryVersions: (entityId: string) => structuredClone(boundaryHistoryByEntity.get(entityId) ?? []),
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