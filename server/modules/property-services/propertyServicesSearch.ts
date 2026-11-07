/**
 * @file server/modules/property-services/propertyServicesSearch.ts
 * @description Public discovery and search engine for service providers and catalog offerings.
 */

import type { PropertyServicesStore } from './propertyServicesStore';
import type {
  PricingModel,
  ProviderPublicProfile,
  ProviderType,
  ServiceOfferingDocument,
  VerificationState,
} from './propertyServicesTypes';

export interface ProviderSearchFilters {
  readonly query?: string;
  readonly categoryId?: string;
  readonly cityId?: string;
  readonly providerType?: ProviderType;
  readonly verificationState?: VerificationState;
  readonly minRating?: number;
  readonly limit?: number;
  readonly cursor?: string | null;
}

export interface ProviderSearchResult {
  readonly items: readonly ProviderPublicProfile[];
  readonly nextCursor: string | null;
  readonly totalMatches: number;
}

export class PropertyServicesSearch {
  constructor(private readonly store: PropertyServicesStore) {}

  public async searchProviders(filters: ProviderSearchFilters = {}): Promise<ProviderSearchResult> {
    const limit = Math.max(1, Math.min(50, filters.limit || 20));
    const allProviders = await this.store.listPublicProviders({
      categoryId: filters.categoryId,
      cityId: filters.cityId,
      verificationState: filters.verificationState,
      limit: 1000,
    });

    let filtered = allProviders;

    if (filters.providerType) {
      filtered = filtered.filter((p) => p.providerType === filters.providerType);
    }

    if (filters.minRating) {
      filtered = filtered.filter((p) => (p.averageRating || 0) >= filters.minRating!);
    }

    if (filters.query) {
      const q = filters.query.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.publicDisplayName.toLowerCase().includes(q) ||
          p.businessName?.toLowerCase().includes(q) ||
          p.descriptionFa.toLowerCase().includes(q),
      );
    }

    const totalMatches = filtered.length;
    let startIndex = 0;

    if (filters.cursor) {
      const idx = filtered.findIndex((p) => p.id === filters.cursor);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const items = filtered.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < filtered.length ? items[items.length - 1].id : null;

    return {
      items,
      nextCursor,
      totalMatches,
    };
  }

  public async searchOfferings(filters: {
    categoryId?: string;
    pricingModel?: PricingModel;
    maxPriceToman?: number;
  }): Promise<ServiceOfferingDocument[]> {
    // Collect offerings across providers
    const providers = await this.store.listPublicProviders({ limit: 500 });
    const results: ServiceOfferingDocument[] = [];

    for (const p of providers) {
      const offerings = await this.store.listOfferingsByProvider(p.id);
      for (const off of offerings) {
        if (filters.categoryId && off.categoryId !== filters.categoryId) continue;
        if (filters.pricingModel && off.pricingModel !== filters.pricingModel) continue;
        if (filters.maxPriceToman && (off.basePriceToman || 0) > filters.maxPriceToman) continue;
        results.push(off);
      }
    }

    return results;
  }
}
