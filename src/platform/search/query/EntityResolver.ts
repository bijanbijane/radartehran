/**
 * @file src/platform/search/query/EntityResolver.ts
 * @description 3-Tier Entity Recognition (CONFIRMED, SUGGESTED, UNKNOWN) for Stage 5 search queries.
 */

import { normalizePersianSearchQuery } from '../core/SearchNormalizer';
import type { EntityRecognitionConfidence, RecognizedSearchEntity } from '../core/SearchTypes';
import { parseSearchQueryTokens } from './QueryParser';

export interface KnownPlaceDirectoryEntry {
  id: string;
  nameFa: string;
  aliasesFa?: string[];
  cityId: string;
  type: 'city' | 'district' | 'neighborhood';
}

const DEFAULT_KNOWN_PLACES: readonly KnownPlaceDirectoryEntry[] = [
  { id: 'tehran', nameFa: 'تهران', cityId: 'tehran', type: 'city' },
  { id: 'karaj', nameFa: 'کرج', cityId: 'karaj', type: 'city' },
  { id: 'mashhad', nameFa: 'مشهد', cityId: 'mashhad', type: 'city' },
  { id: 'isfahan', nameFa: 'اصفهان', cityId: 'isfahan', type: 'city' },
  { id: 'shiraz', nameFa: 'شیراز', cityId: 'shiraz', type: 'city' },
  { id: 'vanak', nameFa: 'ونک', aliasesFa: ['میدان ونک'], cityId: 'tehran', type: 'neighborhood' },
  { id: 'saadat-abad', nameFa: 'سعادت‌آباد', aliasesFa: ['سعادت اباد'], cityId: 'tehran', type: 'neighborhood' },
  { id: 'punak', nameFa: 'پونک', cityId: 'tehran', type: 'neighborhood' },
  { id: 'jannat-abad', nameFa: 'جنت‌آباد', aliasesFa: ['جنت اباد'], cityId: 'tehran', type: 'neighborhood' },
  { id: 'pasdaran', nameFa: 'پاسداران', cityId: 'tehran', type: 'neighborhood' },
  { id: 'niavaran', nameFa: 'نیاوران', cityId: 'tehran', type: 'neighborhood' },
  { id: 'shahrak-gharb', nameFa: 'شهرک غرب', cityId: 'tehran', type: 'neighborhood' },
  { id: 'narmak', nameFa: 'نارمک', cityId: 'tehran', type: 'neighborhood' },
  { id: 'tehranpars', nameFa: 'تهرانپارس', cityId: 'tehran', type: 'neighborhood' },
  { id: 'ekbatan', nameFa: 'اکباتان', aliasesFa: ['شهرک اکباتان'], cityId: 'tehran', type: 'neighborhood' },
  { id: 'gohardasht', nameFa: 'گهردشت', aliasesFa: ['رجایی شهر'], cityId: 'karaj', type: 'neighborhood' },
  { id: 'vakilabad', nameFa: 'وکیل‌آباد', aliasesFa: ['وکیل اباد'], cityId: 'mashhad', type: 'neighborhood' },
  { id: 'jolfa', nameFa: 'جلفا', cityId: 'isfahan', type: 'neighborhood' },
  { id: 'afif-abad', nameFa: 'عفیف‌آباد', aliasesFa: ['عفیف اباد'], cityId: 'shiraz', type: 'neighborhood' },
];

export interface EntityResolutionOutcome {
  overallConfidence: EntityRecognitionConfidence;
  entities: RecognizedSearchEntity[];
  requiresUserDisambiguation: boolean;
}

export function resolveQueryEntities(
  rawQuery: string,
  customDirectory: readonly KnownPlaceDirectoryEntry[] = DEFAULT_KNOWN_PLACES
): EntityResolutionOutcome {
  const parsed = parseSearchQueryTokens(rawQuery);
  const q = parsed.normalizedQuery;
  if (!q) {
    return {
      overallConfidence: 'UNKNOWN',
      entities: [],
      requiresUserDisambiguation: false,
    };
  }

  const entities: RecognizedSearchEntity[] = [];

  for (const place of customDirectory) {
    const normName = normalizePersianSearchQuery(place.nameFa);
    const aliases = (place.aliasesFa || []).map((a) => normalizePersianSearchQuery(a));
    if (q === normName || aliases.includes(q) || q.includes(normName)) {
      const exactMatch = q === normName || aliases.includes(q) || q.split(' ').includes(normName);
      entities.push({
        id: place.id,
        type: place.type,
        matchedText: place.nameFa,
        canonicalNameFa: place.nameFa,
        cityId: place.cityId,
        confidence: exactMatch ? 'CONFIRMED' : 'SUGGESTED',
        score: exactMatch ? 0.96 : 0.75,
      });
    } else if (normName.startsWith(q) && q.length >= 2) {
      entities.push({
        id: place.id,
        type: place.type,
        matchedText: rawQuery.trim(),
        canonicalNameFa: place.nameFa,
        cityId: place.cityId,
        confidence: 'SUGGESTED',
        score: 0.65,
      });
    }
  }

  if (parsed.extractedDistrictNumber) {
    const dNum = parsed.extractedDistrictNumber;
    // «قیمت منطقه ۵» is SUGGESTED because the user might want district analytics OR neighborhoods in district 5
    const isAmbiguousPriceQuery = parsed.isAnalyticalQuestion;
    entities.push({
      id: `district-${dNum}`,
      type: 'district',
      matchedText: `منطقه ${dNum}`,
      canonicalNameFa: `منطقه ${dNum}`,
      cityId: 'tehran',
      confidence: isAmbiguousPriceQuery ? 'SUGGESTED' : 'CONFIRMED',
      score: isAmbiguousPriceQuery ? 0.78 : 0.92,
    });
  }

  if (parsed.isAnalyticalQuestion) {
    entities.push({
      id: 'metric:market_price',
      type: 'analytic_metric',
      matchedText: 'قیمت و شاخص بازار',
      canonicalNameFa: 'شاخص قیمت و روند بازار',
      confidence: 'SUGGESTED',
      score: 0.8,
    });
  }

  if (entities.length === 0) {
    return {
      overallConfidence: 'UNKNOWN',
      entities: [
        {
          id: `unknown:${q}`,
          type: 'neighborhood',
          matchedText: rawQuery.trim(),
          canonicalNameFa: rawQuery.trim(),
          confidence: 'UNKNOWN',
          score: 0.2,
        },
      ],
      requiresUserDisambiguation: false,
    };
  }

  const hasConfirmed = entities.some((e) => e.confidence === 'CONFIRMED');
  const requiresUserDisambiguation =
    parsed.isAnalyticalQuestion || entities.filter((e) => e.confidence === 'SUGGESTED').length > 1;

  return {
    overallConfidence: hasConfirmed && !requiresUserDisambiguation ? 'CONFIRMED' : 'SUGGESTED',
    entities: entities.sort((a, b) => b.score - a.score),
    requiresUserDisambiguation,
  };
}
