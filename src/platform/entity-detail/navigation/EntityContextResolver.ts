/**
 * @file src/platform/entity-detail/navigation/EntityContextResolver.ts
 * @description Preserves and restores user Search, Filter, Sort, Pagination, Scroll, and Map Viewport context when navigating between Results (Stage 5/6) and Entity Detail (Stage 7).
 */

import type { EntityType } from '../core/EntityDetailTypes';

export interface EntityReturnContextSnapshot {
  sourceSurface: 'search-results' | 'map-discovery' | 'comparison-workspace' | 'collection' | 'direct-link';
  returnPath: string;
  queryText?: string;
  serializedFilters?: string;
  sortKey?: string;
  page?: number;
  scrollOffsetY?: number;
  mapViewport?: {
    centerLat: number;
    centerLng: number;
    zoom: number;
  };
  selectedEntityIds?: string[];
  comparisonEntityIds?: string[];
  capturedAt: string;
}

export interface BreadcrumbTrailItem {
  id: string;
  labelFa: string;
  path: string;
  entityType?: EntityType;
}

export class EntityContextResolver {
  private lastSnapshot: EntityReturnContextSnapshot | null = null;

  public saveReturnContext(snapshot: Omit<EntityReturnContextSnapshot, 'capturedAt'>): EntityReturnContextSnapshot {
    const safePath =
      snapshot.returnPath && snapshot.returnPath.startsWith('/') && !snapshot.returnPath.startsWith('//')
        ? snapshot.returnPath
        : '/search';

    const stored: EntityReturnContextSnapshot = {
      ...snapshot,
      returnPath: safePath,
      capturedAt: new Date().toISOString(),
    };
    this.lastSnapshot = stored;
    return stored;
  }

  public getReturnContext(): EntityReturnContextSnapshot {
    if (this.lastSnapshot) {
      return this.lastSnapshot;
    }
    return {
      sourceSurface: 'direct-link',
      returnPath: '/search',
      capturedAt: new Date().toISOString(),
    };
  }

  public clearReturnContext(): void {
    this.lastSnapshot = null;
  }

  public buildBreadcrumbTrail(params: {
    cityId?: string;
    cityNameFa?: string;
    neighborhoodId?: string;
    neighborhoodNameFa?: string;
    buildingId?: string;
    buildingTitleFa?: string;
    entityType: EntityType;
    entityId: string;
    entityTitleFa: string;
  }): BreadcrumbTrailItem[] {
    const trail: BreadcrumbTrailItem[] = [
      {
        id: 'root-radar',
        labelFa: 'رادار تهران',
        path: '/',
      },
    ];

    if (params.cityNameFa) {
      trail.push({
        id: `city-${params.cityId || 'tehran'}`,
        labelFa: params.cityNameFa,
        path: `/search?city=${encodeURIComponent(params.cityId || 'tehran')}`,
      });
    }

    if (params.neighborhoodId && params.neighborhoodNameFa && params.entityType !== 'neighborhood') {
      trail.push({
        id: `hood-${params.neighborhoodId}`,
        labelFa: params.neighborhoodNameFa,
        path: `/neighborhoods/${encodeURIComponent(params.neighborhoodId)}`,
        entityType: 'neighborhood',
      });
    }

    if (params.buildingId && params.buildingTitleFa && params.entityType !== 'building' && params.entityType !== 'neighborhood') {
      trail.push({
        id: `bldg-${params.buildingId}`,
        labelFa: params.buildingTitleFa,
        path: `/buildings/${encodeURIComponent(params.buildingId)}`,
        entityType: 'building',
      });
    }

    const prefixMap: Record<EntityType, string> = {
      property: 'properties',
      listing: 'listings',
      building: 'buildings',
      neighborhood: 'neighborhoods',
    };

    trail.push({
      id: `current-${params.entityType}-${params.entityId}`,
      labelFa: params.entityTitleFa,
      path: `/${prefixMap[params.entityType]}/${encodeURIComponent(params.entityId)}`,
      entityType: params.entityType,
    });

    return trail;
  }
}
