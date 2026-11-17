import { BoundingBox, LatLngPoint, SpatialPointItem } from '../core/GeoTypes';
import { queryPointsInBounds, queryPointsInPolygon } from './SpatialQuery';

export interface SpatialFilterCriteria {
  bounds?: BoundingBox;
  polygonRing?: readonly LatLngPoint[];
  neighborhoodIds?: readonly number[];
  minPricePerSqm?: number;
  maxPricePerSqm?: number;
  goldPinOnly?: boolean;
}

export function applySpatialFilterPipeline<T>(
  items: readonly SpatialPointItem<T>[],
  criteria: SpatialFilterCriteria
): SpatialPointItem<T>[] {
  let current: SpatialPointItem<T>[] = [...items];

  if (criteria.bounds) {
    current = queryPointsInBounds(current, criteria.bounds);
  }

  if (criteria.polygonRing && criteria.polygonRing.length >= 3) {
    current = queryPointsInPolygon(current, criteria.polygonRing);
  }

  if (criteria.neighborhoodIds && criteria.neighborhoodIds.length > 0) {
    const allowed = new Set(criteria.neighborhoodIds);
    current = current.filter((item) => item.neighborhoodId != null && allowed.has(item.neighborhoodId));
  }

  if (criteria.minPricePerSqm !== undefined) {
    current = current.filter(
      (item) => item.pricePerSqm !== undefined && item.pricePerSqm >= criteria.minPricePerSqm!
    );
  }

  if (criteria.maxPricePerSqm !== undefined) {
    current = current.filter(
      (item) => item.pricePerSqm !== undefined && item.pricePerSqm <= criteria.maxPricePerSqm!
    );
  }

  if (criteria.goldPinOnly) {
    current = current.filter((item) => Boolean(item.isGoldPin));
  }

  return current;
}
