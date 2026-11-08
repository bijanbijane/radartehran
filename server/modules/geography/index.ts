/**
 * @file server/modules/geography/index.ts
 * @description Canonical Entry Point and Barrel Exports for the Radartehran Geographic Reference-Data Module.
 * Provides stable reference data, validation, hierarchy traversal, and lookup services for downstream modules.
 */

// Core Types
export type {
  AdministrativeHierarchy,
  BoundaryMetadata,
  CanonicalCity,
  CanonicalNeighborhood,
  CanonicalProvince,
  CityNeighborhoodValidationResult,
  DatasetInventoryReport,
  DatasetProvenance,
  GeoBoundingBox,
  GeoLookupQuery,
  GeometryType,
  GeoPoint,
  NameResolutionResult,
  NeighborhoodAlias,
  ProvinceId,
  RecordStatus,
  SupportedCityId,
  VerificationStatus,
} from './types';

// Provinces Registry
export {
  CANONICAL_PROVINCES,
  CITY_PROVINCE_MAP,
  getProvinceById,
  getProvinceForCity,
  listCanonicalProvinces,
  PROVINCES_DATASET_VERSION,
} from './provinces';

// Cities Registry
export {
  CANONICAL_CITIES,
  CITIES_DATASET_VERSION,
  getCitiesByProvinceId,
  getCityByIdOrName,
  isSupportedCityId,
  listCanonicalCities,
  SUPPORTED_CITY_IDS,
} from './cities';

// Neighborhoods Registry
export {
  computeBoundingBox,
  getNeighborhoodByCityAndId,
  getNeighborhoodByCompositeId,
  getNeighborhoodsByNumericId,
  listAllCanonicalNeighborhoods,
  listNeighborhoodsByCity,
  NEIGHBORHOODS_DATASET_VERSION,
  parseDistrictNumber,
} from './neighborhoods';

// Aliases & Normalization
export {
  CANONICAL_ALIASES,
  extractRootGeographicName,
  findMatchingAliases,
  getAliasesForNeighborhood,
  normalizePersianText,
} from './aliases';

// Inventory & 59-Neighborhood Reconciliation
export {
  auditGeographicDataIntegrity,
  generateReconciliationInventoryReport,
  HISTORICAL_59_RECONCILIATION_ANALYSIS,
} from './inventory';

// Service & Spatial Operations
export {
  calculateHaversineDistanceKm,
  defaultGeographicService,
  GeographicReferenceService,
} from './service';

// Employee 11 — Extended Geography & Location Intelligence Exports
export {
  defaultGeographyService,
  GeographyService,
} from './geographyService';
export { GeographyCatalog } from './geographyCatalog';
export {
  normalizeGeographicNameFa,
  validateCoordinates,
  computeLevenshteinDistance,
} from './geographyNormalizer';
export {
  GeographySpatialEngine,
  calculateGeodesicDistanceMeters,
  isPointInsideGeoJsonPolygonRing,
  isPointInsideGeometry,
} from './geographySpatialEngine';
export {
  UnavailableGeocodingProvider,
  MockGeocodingProvider,
  UnconfiguredH3Provider,
} from './geographyProviders';
export { GeographyAddressResolver } from './geographyAddressResolver';
export {
  GeographyImportPipeline,
  type ImportCandidateRecord,
} from './geographyImportPipeline';
export type {
  GeographicLevel,
  BoundaryProvenance,
  CoordinateSystem,
  GeoPolygonGeometry,
  GeographicBoundary,
  GeographicEntity,
  NormalizedAddress,
  AddressResolutionOutcome,
  SpatialLookupResult,
  GeocodingProviderResult,
  GeocodingProvider,
  H3SpatialIndexingResult,
  H3SpatialIndexingProvider,
  DatasetChangeSummary,
} from './geographyTypes';

// Employee 18 — Geography & Spatial Intelligence Backend Exports
export { Employee18GeographyEngine } from './qualityIntelligenceAndCrossModuleService';
export {
  MAX_BULK_SPATIAL_QUERY_LIMIT,
  doesPolygonContainPolygon,
  transformCoordinatesToWgs84,
  doGeoJsonPolygonsIntersect,
  isPointWithinGeoJsonGeometry,
  validateGeoJsonGeometry,
} from './geometryCrsAndSpatialEngine';
export { extractAllDistrictNumbersFromZone } from './hierarchyVersioningAndGraphEngine';
export type {
  GeoJsonGeometry,
  GeographyAdminActor,
  GeographyDomainEvent,
  StructuredAddressReference,
} from './employee18Contracts';

