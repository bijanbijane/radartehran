import type { Express } from 'express';
import { InMemorySearchCacheAdapter, PropertySearchService } from './service';
import { registerPropertySearchRoutes } from './propertySearchRoutes';
import { createBargainListingDataSource } from './productionBargainListingDataSource';
import { createProductionGeographySearchAdapter } from './productionGeographySearchAdapter';

let productionService: PropertySearchService | null = null;

export function getProductionPropertySearchService(): PropertySearchService {
  if (!productionService) {
    productionService = new PropertySearchService({
      listingDataSource: createBargainListingDataSource(),
      geographyAdapter: createProductionGeographySearchAdapter(),
      cacheAdapter: new InMemorySearchCacheAdapter(),
    });
  }
  return productionService;
}

export function registerProductionPropertySearchRoutes(app: Express): void {
  registerPropertySearchRoutes(app, getProductionPropertySearchService());
}

export function resetProductionPropertySearchForTests(): void {
  productionService = null;
}