/**
 * @file server/modules/geography/geographyAddressResolver.ts
 * @description Iranian address normalization and entity resolution without coordinate fabrication.
 */

import { normalizeGeographicNameFa } from './geographyNormalizer';
import type { GeographyCatalog } from './geographyCatalog';
import type {
  AddressResolutionOutcome,
  NormalizedAddress,
} from './geographyTypes';

const ADDRESS_STOP_WORDS = new Set([
  'استان', 'شهرستان', 'شهر', 'کلانشهر', 'بخش', 'دهستان', 'روستا',
  'منطقه', 'ناحیه', 'محله', 'کوی', 'شهرک',
  'بلوار', 'خیابان', 'میدان', 'چهارراه', 'کوچه', 'بن‌بست', 'بن بست',
  'پلاک', 'واحد', 'طبقه', 'شماره', 'ساختمان', 'برج', 'مجتمع',
]);

export class GeographyAddressResolver {
  constructor(private readonly catalog: GeographyCatalog) {}

  /**
   * Normalizes an Iranian address string into clean tokens and detected administrative units.
   */
  public normalizeAddress(rawAddress: string): NormalizedAddress {
    if (!rawAddress || typeof rawAddress !== 'string') {
      return { rawAddress: '', cleanText: '', tokens: [] };
    }

    const cleanText = normalizeGeographicNameFa(rawAddress);
    const rawTokens = cleanText.split(' ').filter((t) => t.length > 0);
    const tokens = rawTokens.filter((t) => !ADDRESS_STOP_WORDS.has(t));

    // Detect province
    const provinces = this.catalog.listProvinces();
    let detectedProvinceFa: string | undefined;
    for (const prov of provinces) {
      const normProv = normalizeGeographicNameFa(prov.nameFa);
      if (cleanText.includes(normProv)) {
        detectedProvinceFa = prov.nameFa;
        break;
      }
    }

    // Detect city
    let detectedCityFa: string | undefined;
    const cities = this.catalog.searchEntities('', { level: 'city', limit: 100 });
    for (const city of cities) {
      const normCity = normalizeGeographicNameFa(city.nameFa);
      if (cleanText.includes(normCity)) {
        detectedCityFa = city.nameFa;
        break;
      }
    }

    // Detect district
    let detectedDistrictFa: string | undefined;
    const districtMatch = cleanText.match(/منطقه\s*(\d+)/);
    if (districtMatch) {
      detectedDistrictFa = `منطقه ${districtMatch[1]}`;
    }

    // Detect neighborhood
    let detectedNeighborhoodFa: string | undefined;
    const hoods = this.catalog.searchEntities('', { level: 'neighborhood', limit: 1000 });
    for (const hood of hoods) {
      const normHood = normalizeGeographicNameFa(hood.nameFa);
      if (normHood.length >= 3 && cleanText.includes(normHood)) {
        detectedNeighborhoodFa = hood.nameFa;
        break;
      }
    }

    return {
      rawAddress: rawAddress.trim(),
      cleanText,
      detectedProvinceFa,
      detectedCityFa,
      detectedDistrictFa,
      detectedNeighborhoodFa,
      tokens,
    };
  }

  /**
   * Resolves a free-text address to the highest confidence geographic entity.
   * STRICT SAFETY RULE: Does NOT fabricate coordinates!
   * Returns isCoordinateVerified: false and verifiedCoordinates: undefined.
   */
  public resolveAddress(rawAddress: string): AddressResolutionOutcome {
    const normalized = this.normalizeAddress(rawAddress);

    if (normalized.cleanText.length === 0) {
      return {
        normalizedAddress: normalized,
        confidence: 0,
        isCoordinateVerified: false,
        resolutionNotesFa: 'آدرس ورودی خالی است.',
      };
    }

    // 1. Try neighborhood match
    if (normalized.detectedNeighborhoodFa) {
      const matches = this.catalog.searchEntities(normalized.detectedNeighborhoodFa, {
        level: 'neighborhood',
        limit: 5,
      });

      if (matches.length > 0) {
        const resolved = matches[0];
        return {
          normalizedAddress: normalized,
          resolvedEntity: resolved,
          confidence: 0.85,
          isCoordinateVerified: false,
          verifiedCoordinates: undefined, // NEVER FABRICATE COORDINATES FROM TEXT
          resolutionNotesFa: `آدرس با موفقیت بر محله «${resolved.nameFa}» تطبیق داده شد (مختصات دقیق پلاک نیازمند ژئوکدینگ رسمی است).`,
        };
      }
    }

    // 2. Try city match
    if (normalized.detectedCityFa) {
      const cityMatches = this.catalog.searchEntities(normalized.detectedCityFa, {
        level: 'city',
        limit: 1,
      });

      if (cityMatches.length > 0) {
        const resolvedCity = cityMatches[0];
        return {
          normalizedAddress: normalized,
          resolvedEntity: resolvedCity,
          confidence: 0.6,
          isCoordinateVerified: false,
          verifiedCoordinates: undefined,
          resolutionNotesFa: `آدرس صرفاً در سطح شهر «${resolvedCity.nameFa}» شناسایی شد.`,
        };
      }
    }

    // 3. Fallback: Search all tokens
    for (const token of normalized.tokens) {
      if (token.length >= 4) {
        const candidate = this.catalog.searchEntities(token, { limit: 1 });
        if (candidate.length > 0) {
          return {
            normalizedAddress: normalized,
            resolvedEntity: candidate[0],
            confidence: 0.4,
            isCoordinateVerified: false,
            verifiedCoordinates: undefined,
            resolutionNotesFa: `تطبیق تقریبی بر اساس واژه «${token}» انجام شد.`,
          };
        }
      }
    }

    return {
      normalizedAddress: normalized,
      confidence: 0,
      isCoordinateVerified: false,
      resolutionNotesFa: 'هیچ واحد جغرافیایی معتبری برای این نشانی شناسایی نشد.',
    };
  }
}
