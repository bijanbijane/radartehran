/**
 * @file server/modules/geography/geographyService.ts
 * @description Primary service facade for Geography & Location Intelligence across the platform.
 */

import { GeographyAddressResolver } from './geographyAddressResolver';
import { GeographyCatalog } from './geographyCatalog';
import { GeographyImportPipeline, type ImportCandidateRecord } from './geographyImportPipeline';
import { UnavailableGeocodingProvider, UnconfiguredH3Provider } from './geographyProviders';
import { GeographySpatialEngine, calculateGeodesicDistanceMeters, isPointInsideGeometry } from './geographySpatialEngine';
import type {
  AddressResolutionOutcome,
  DatasetChangeSummary,
  GeoPoint,
  GeoPolygonGeometry,
  GeocodingProvider,
  GeocodingProviderResult,
  GeographicEntity,
  H3SpatialIndexingProvider,
  H3SpatialIndexingResult,
  NormalizedAddress,
  SpatialLookupResult,
} from './geographyTypes';

export class GeographyService {
  private readonly catalog: GeographyCatalog;
  private readonly spatialEngine: GeographySpatialEngine;
  private readonly addressResolver: GeographyAddressResolver;
  private readonly importPipeline: GeographyImportPipeline;
  private geocodingProvider: GeocodingProvider;
  private h3Provider: H3SpatialIndexingProvider;

  constructor(options?: {
    catalog?: GeographyCatalog;
    geocodingProvider?: GeocodingProvider;
    h3Provider?: H3SpatialIndexingProvider;
  }) {
    this.catalog = options?.catalog || new GeographyCatalog();
    this.spatialEngine = new GeographySpatialEngine(this.catalog);
    this.addressResolver = new GeographyAddressResolver(this.catalog);
    this.importPipeline = new GeographyImportPipeline(this.catalog);
    this.geocodingProvider = options?.geocodingProvider || new UnavailableGeocodingProvider();
    this.h3Provider = options?.h3Provider || new UnconfiguredH3Provider();
  }

  // --- 1. Hierarchy and Catalog Navigation ---

  public getCity(cityId: string): GeographicEntity | null {
    const id = cityId.startsWith('city:') ? cityId : `city:${cityId}`;
    return this.catalog.getEntityById(id);
  }

  public listProvinces(): GeographicEntity[] {
    return this.catalog.listProvinces();
  }

  public listCitiesByProvince(provinceId: string): GeographicEntity[] {
    return this.catalog.listCitiesByProvince(provinceId);
  }

  public listDistrictsByCity(cityId: string): GeographicEntity[] {
    return this.catalog.listDistrictsByCity(cityId);
  }

  public listNeighborhoods(cityId: string): GeographicEntity[] {
    return this.catalog.listNeighborhoodsByCity(cityId);
  }

  public resolveGeographicIdentifier(id: string): GeographicEntity | null {
    return this.catalog.getEntityById(id);
  }

  public validateHierarchyRelationship(childId: string, parentOrAncestorId: string): boolean {
    return this.catalog.validateParentChildRelationship(childId, parentOrAncestorId);
  }

  public searchEntities(query: string, options?: { level?: GeographicEntity['level']; parentEntityId?: string; limit?: number }): GeographicEntity[] {
    return this.catalog.searchEntities(query, options);
  }

  // --- 2. Spatial Calculations & Geometry ---

  public calculateDistanceMeters(p1: GeoPoint, p2: GeoPoint): number {
    return calculateGeodesicDistanceMeters(p1, p2);
  }

  public resolveCoordinates(point: GeoPoint): SpatialLookupResult | null {
    return this.spatialEngine.resolveCoordinatesToEntity(point);
  }

  public findNearbyEntities(point: GeoPoint, radiusMeters: number, options?: { level?: GeographicEntity['level']; limit?: number }): SpatialLookupResult[] {
    return this.spatialEngine.findNearbyEntities(point, radiusMeters, options);
  }

  public checkPointInPolygon(point: GeoPoint, geometry?: GeoPolygonGeometry): boolean {
    return isPointInsideGeometry(point, geometry);
  }

  // --- 3. Address Resolution ---

  public normalizeAddress(rawAddress: string): NormalizedAddress {
    return this.addressResolver.normalizeAddress(rawAddress);
  }

  public resolveAddress(rawAddress: string): AddressResolutionOutcome {
    return this.addressResolver.resolveAddress(rawAddress);
  }

  // --- 4. Geocoding Provider Access ---

  public setGeocodingProvider(provider: GeocodingProvider): void {
    this.geocodingProvider = provider;
  }

  public async forwardGeocode(addressText: string): Promise<GeocodingProviderResult> {
    return this.geocodingProvider.forwardGeocode(addressText);
  }

  public async reverseGeocode(point: GeoPoint): Promise<GeocodingProviderResult> {
    return this.geocodingProvider.reverseGeocode(point);
  }

  // --- 5. H3 Spatial Indexing Access ---

  public setH3Provider(provider: H3SpatialIndexingProvider): void {
    this.h3Provider = provider;
  }

  public getH3CellForPoint(point: GeoPoint, level: GeographicEntity['level'] = 'neighborhood'): H3SpatialIndexingResult {
    const res = this.h3Provider.getResolutionForLevel(level);
    return this.h3Provider.pointToCell(point, res);
  }

  // --- 6. Dataset Import Pipeline ---

  public importDataset(candidates: ImportCandidateRecord[], options?: { dryRun?: boolean }): DatasetChangeSummary {
    return this.importPipeline.executeImport(candidates, options);
  }

  public getCatalogSummary(): { totalEntities: number; activeProvinces: number; supportedCities: number } {
    return {
      totalEntities: this.catalog.getTotalEntityCount(),
      activeProvinces: this.catalog.listProvinces().length,
      supportedCities: this.catalog.searchEntities('', { level: 'city', limit: 100 }).length,
    };
  }
}

export const defaultGeographyService = new GeographyService();
