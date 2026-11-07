/**
 * @file server/modules/geography/geographyProviders.ts
 * @description Geocoding provider abstraction and H3 spatial indexing interfaces.
 */

import type {
  GeoPoint,
  GeocodingProvider,
  GeocodingProviderResult,
  GeographicLevel,
  H3SpatialIndexingProvider,
  H3SpatialIndexingResult,
} from './geographyTypes';

/**
 * Default geocoding provider when no external API (e.g. Neshan, Cedar, Google, OSM) is configured.
 * Strictly avoids returning fake success or fabricated coordinates.
 */
export class UnavailableGeocodingProvider implements GeocodingProvider {
  public readonly name = 'none';
  public readonly isConfigured = false;

  public async forwardGeocode(addressText: string): Promise<GeocodingProviderResult> {
    return {
      status: 'UNAVAILABLE',
      query: addressText,
      providerName: this.name,
      executionTimeMs: 0,
      error: 'GEOCODING_PROVIDER_NOT_CONFIGURED: ارائه‌دهنده ژئوکدینگ خارجی فعال نشده است.',
    };
  }

  public async reverseGeocode(point: GeoPoint): Promise<GeocodingProviderResult> {
    return {
      status: 'UNAVAILABLE',
      query: `${point.lat},${point.lng}`,
      providerName: this.name,
      executionTimeMs: 0,
      error: 'REVERSE_GEOCODING_PROVIDER_NOT_CONFIGURED: ارائه‌دهنده ژئوکدینگ معکوس فعال نشده است.',
    };
  }
}

/**
 * Mock provider for testing resilience against timeouts, rate limits, and network errors.
 */
export class MockGeocodingProvider implements GeocodingProvider {
  constructor(
    public readonly name: string = 'mock_provider',
    private readonly simulatedOutcome: 'SUCCESS' | 'RATE_LIMITED' | 'TIMEOUT' = 'SUCCESS',
  ) {}

  public readonly isConfigured = true;

  public async forwardGeocode(addressText: string): Promise<GeocodingProviderResult> {
    if (this.simulatedOutcome === 'RATE_LIMITED') {
      return {
        status: 'RATE_LIMITED',
        query: addressText,
        providerName: this.name,
        executionTimeMs: 15,
        error: 'RATE_LIMIT_EXCEEDED_429',
      };
    }

    if (this.simulatedOutcome === 'TIMEOUT') {
      return {
        status: 'ERROR',
        query: addressText,
        providerName: this.name,
        executionTimeMs: 5000,
        error: 'GATEWAY_TIMEOUT_504',
      };
    }

    return {
      status: 'SUCCESS',
      query: addressText,
      location: { lat: 35.75, lng: 51.4 },
      formattedAddressFa: 'تهران، میدان ونک',
      providerName: this.name,
      executionTimeMs: 45,
    };
  }

  public async reverseGeocode(point: GeoPoint): Promise<GeocodingProviderResult> {
    return {
      status: 'SUCCESS',
      query: `${point.lat},${point.lng}`,
      formattedAddressFa: 'تهران، پونک',
      providerName: this.name,
      executionTimeMs: 25,
    };
  }
}

/**
 * H3 provider implementation when h3-js is not installed in package.json.
 * Follows strict compliance: does NOT pretend that H3 spatial indexing is active.
 */
export class UnconfiguredH3Provider implements H3SpatialIndexingProvider {
  public readonly isAvailable = false;

  public getResolutionForLevel(level: GeographicLevel): number {
    switch (level) {
      case 'country': return 2;
      case 'province': return 4;
      case 'city': return 6;
      case 'urban_district': return 7;
      case 'neighborhood': return 8;
      case 'sub_neighborhood': return 9;
      default: return 8;
    }
  }

  public pointToCell(_point: GeoPoint, resolution: number): H3SpatialIndexingResult {
    return {
      status: 'UNAVAILABLE',
      h3Resolution: resolution,
      reason: 'H3_DEPENDENCY_MISSING: پکیج h3-js در package.json نصب نشده است. نیازمند تایید راهبر یکپارچه‌سازی.',
    };
  }

  public cellToPoint(_cellIndex: string): GeoPoint | null {
    return null;
  }
}
