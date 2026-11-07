/**
 * @file server/modules/geography/geographyNormalizer.ts
 * @description Persian/Arabic linguistic harmonization, coordinate validation, and CRS sanity checks.
 */

import type { GeoPoint } from './geographyTypes';

/**
 * Normalizes Persian and Arabic geographic text:
 * - Unifies Yeh/Kaf variants (ي, ى -> ی / ك -> ک)
 * - Harmonizes Alef variants ([آأإ] -> ا)
 * - Normalizes Heh/Teh Marbuta (ة -> ه)
 * - Removes diacritics (Aerab), Tatweel (ـ), and ZWNJ (\u200c)
 * - Converts Persian and Arabic-Indic numerals to standard ASCII digits
 * - Strips leading/trailing punctuation and compresses whitespace
 */
export function normalizeGeographicNameFa(input: string): string {
  if (!input || typeof input !== 'string') return '';

  let text = input.trim();

  // Convert digits
  text = text
    .replace(/[۰٠]/g, '0')
    .replace(/[۱١]/g, '1')
    .replace(/[۲٢]/g, '2')
    .replace(/[۳٣]/g, '3')
    .replace(/[۴٤]/g, '4')
    .replace(/[۵٥]/g, '5')
    .replace(/[۶٦]/g, '6')
    .replace(/[۷٧]/g, '7')
    .replace(/[۸٨]/g, '8')
    .replace(/[۹٩]/g, '9');

  // Letter harmonization
  text = text
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی');

  // Replace ZWNJ and word joiners with space
  text = text.replace(/[\u200C\u200D]/g, ' ');

  // Remove diacritics and formatting controls
  text = text.replace(/[\u064B-\u065F\u0670\u0640\u200E\u200F\uFEFF]/g, '');

  // Replace punctuation and symbols with space
  text = text.replace(/[-_.,،؛:!؟?()\[\]{}"'\\\/]/g, ' ');

  // Collapse multiple whitespaces
  text = text.replace(/\s+/g, ' ').trim().toLowerCase();

  return text;
}

/**
 * Comprehensive WGS-84 coordinate validation with Iran national bounding box and swap detection.
 */
export function validateCoordinates(lat: number, lng: number): {
  valid: boolean;
  isInIranBounds: boolean;
  isPotentiallySwapped: boolean;
  sanitizedPoint?: GeoPoint;
  error?: string;
} {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { valid: false, isInIranBounds: false, isPotentiallySwapped: false, error: 'NON_NUMERIC_COORDINATE' };
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, isInIranBounds: false, isPotentiallySwapped: false, error: 'NON_FINITE_COORDINATE' };
  }

  // WGS-84 valid ranges
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, isInIranBounds: false, isPotentiallySwapped: false, error: 'OUT_OF_WGS84_RANGE' };
  }

  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) {
    return { valid: false, isInIranBounds: false, isPotentiallySwapped: false, error: 'NULL_ISLAND_COORDINATE' };
  }

  // Swap detection: Iran latitude is ~24..40, longitude is ~44..64.
  // If lat is in 44..64 and lng is in 24..40, coordinates are inverted (lat/lng swapped)!
  const isPotentiallySwapped = lat >= 44.0 && lat <= 64.0 && lng >= 24.0 && lng <= 40.5;

  const isInIranBounds = lat >= 24.0 && lat <= 40.5 && lng >= 44.0 && lng <= 64.0;

  return {
    valid: true,
    isInIranBounds,
    isPotentiallySwapped,
    sanitizedPoint: {
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
    },
  };
}

/**
 * Computes Levenshtein distance for fuzzy name matching.
 */
export function computeLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1,     // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
