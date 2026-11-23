import { CoreApiError } from '../core';
import type { GeographyService } from '../geography/geographyService';
import type { GeospatialObservabilityMetrics, Wgs84Coordinate } from './types';

export type GeocodeCacheEntry = {
  formattedAddressFa: string;
  coordinates: Wgs84Coordinate;
  provider: string;
};

export async function executeForwardGeocode(params: {
  addressText: string;
  geocodeCache: Map<string, GeocodeCacheEntry>;
  metrics: GeospatialObservabilityMetrics;
  geographyService: Pick<GeographyService, 'forwardGeocode'>;
}) {
  const key = params.addressText.trim();
  if (!key) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'addressText is required.');
  }
  const cached = params.geocodeCache.get(key);
  if (cached) {
    params.metrics.cacheHitsCount += 1;
    return { status: 'OK' as const, cached: true, ...cached };
  }
  params.metrics.cacheMissesCount += 1;
  const providerRes = await params.geographyService.forwardGeocode(key);
  if (providerRes.status !== 'SUCCESS' || !providerRes.location) {
    params.metrics.geocodingErrorsCount += 1;
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
  params.geocodeCache.set(key, entry);
  return { status: 'OK' as const, cached: false, ...entry };
}