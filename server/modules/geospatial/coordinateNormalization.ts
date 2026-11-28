import type { NormalizedCoordinateResult } from './types';

export function normalizeAndValidateCoordinate(
  rawLat: unknown,
  rawLng: unknown,
  options?: { precisionDecimals?: number; sourceProvenance?: string },
): NormalizedCoordinateResult {
  const sourceProvenance = options?.sourceProvenance ?? 'user_or_api_input';
  const precision = Math.max(4, Math.min(8, options?.precisionDecimals ?? 6));

  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'NON_FINITE',
      errorMessage: 'Latitude and longitude must be finite numbers.',
    };
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    // Check if lat falls in Iran longitude range (44..64) and lng falls in Iran latitude range (24..40)
    if (lat >= 44 && lat <= 64 && lng >= 24 && lng <= 40) {
      return {
        valid: false,
        sourceProvenance,
        transformationMethod: 'REJECTED',
        errorCode: 'LAT_LNG_REVERSED',
        errorMessage: 'Latitude and longitude appear to be reversed (lat in 44..64, lng in 24..40).',
      };
    }
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'IMPOSSIBLE_COORDINATE',
      errorMessage: 'Coordinates exceed global WGS84 bounds (|lat|<=90, |lng|<=180).',
    };
  }

  // Also check reversed inside valid global bounds when lat is 44..64 and lng is 24..40
  if (lat >= 44 && lat <= 64 && lng >= 24 && lng <= 40) {
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'LAT_LNG_REVERSED',
      errorMessage: 'Latitude and longitude appear to be reversed for Iran geography.',
    };
  }

  if (lat < 24.0 || lat > 40.5 || lng < 44.0 || lng > 63.8) {
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'OUT_OF_IRAN_BOUNDS',
      errorMessage: 'Coordinate is outside supported Iran geographic boundaries.',
    };
  }

  const roundedLat = Number(lat.toFixed(precision));
  const roundedLng = Number(lng.toFixed(precision));
  const wasRounded = roundedLat !== lat || roundedLng !== lng;

  return {
    valid: true,
    coordinate: { lat: roundedLat, lng: roundedLng },
    precisionDecimals: precision,
    sourceProvenance,
    transformationMethod: wasRounded ? 'PRECISION_ROUNDED' : 'NONE_WGS84',
  };
}
