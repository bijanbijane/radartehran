import crypto from 'node:crypto';
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import { INITIAL_NEIGHBORHOODS } from '../../data/neighborhoods';
import { getCurrentJalaliYear } from '../../data/hedonicPricingEngine';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { normalizeDigitsToAscii, normalizePersianStreetName, resolveOrMergeCanonicalBuilding, resetEntityResolutionStoreForTests } from './entityResolutionEngine';
import type { DealModeCode, ExtractedPropertyFactRecord, PropertyTypeCode, RawPropertySignalInput, StructuralConditionCode } from './aiIngestionTypes';

const extractedFactsById = new Map<string, ExtractedPropertyFactRecord>();
const extractedFactIdBySourceHash = new Map<string, string>();
const ORDINAL_FLOOR_MAP: Record<string, number> = {
  همکف: 0, اول: 1, دوم: 2, سوم: 3, چهارم: 4, پنجم: 5, ششم: 6, هفتم: 7, هشتم: 8, نهم: 9, دهم: 10,
};

export function computeSignalSourceHashSha256(input: RawPropertySignalInput): string {
  const normalizedText = normalizeDigitsToAscii(input.rawTextFa || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(`${input.cityId || 'tehran'}|${input.hoodId || 1}|${normalizedText}`).digest('hex');
}

export function extractFastRegexPropertySpecs(rawTextFa: string, currentJalaliYear = getCurrentJalaliYear()): {
  areaSqm: number | null;
  buildingAgeYears: number | null;
  floorNumber: number | null;
  totalFloors: number | null;
  totalPriceMillionToman: number | null;
  pricePerSqmMillionToman: number | null;
  streetNameNormalized: string;
  structuralCondition: StructuralConditionCode;
  hasElevator: boolean;
  hasParking: boolean;
  hasStorage: boolean;
  dealMode: DealModeCode;
  propertyType: PropertyTypeCode;
  matchedFieldsCount: number;
} {
  const text = normalizeDigitsToAscii(rawTextFa || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c]/g, ' ')
    .replace(/(\d+)[/,](\d+)\s*(میلیارد|میلیون)/g, '$1.$2 $3');
  let matchedFieldsCount = 0;

  const areaMatch = text.match(/(\d{2,4})\s*(?:متر\s*مربع|متری|متر)/);
  const areaSqm = areaMatch ? Number(areaMatch[1]) : null;
  if (areaSqm !== null) matchedFieldsCount += 1;

  let buildingAgeYears: number | null = null;
  if (/نوساز|کلید\s*نخورده/.test(text)) {
    buildingAgeYears = 0;
    matchedFieldsCount += 1;
  } else {
    const ageMatch = text.match(/(\d{1,2})\s*سال\s*ساخت/);
    const yearMatch = text.match(/(?:ساخت|مدل)\s*(13\d{2}|140\d)/);
    if (ageMatch) {
      buildingAgeYears = Number(ageMatch[1]);
      matchedFieldsCount += 1;
    } else if (yearMatch) {
      buildingAgeYears = Math.max(0, currentJalaliYear - Number(yearMatch[1]));
      matchedFieldsCount += 1;
    }
  }

  let floorNumber: number | null = null;
  let totalFloors: number | null = null;
  const floorOfTotalMatch = text.match(/طبقه\s*(\d{1,2})\s*از\s*(\d{1,2})/);
  if (floorOfTotalMatch) {
    floorNumber = Number(floorOfTotalMatch[1]);
    totalFloors = Number(floorOfTotalMatch[2]);
    matchedFieldsCount += 2;
  } else {
    const floorNumMatch = text.match(/طبقه\s*(\d{1,2})/);
    if (floorNumMatch) {
      floorNumber = Number(floorNumMatch[1]);
      matchedFieldsCount += 1;
    } else {
      for (const [word, val] of Object.entries(ORDINAL_FLOOR_MAP)) {
        if (new RegExp(`طبقه\\s*${word}`).test(text)) {
          floorNumber = val;
          matchedFieldsCount += 1;
          break;
        }
      }
    }
    const totalFloorsMatch = text.match(/(\d{1,2})\s*طبقه(?:\s*تک|\s*دو|\s*سه|\s*چهار|\s*واحدی|\s|$)/);
    if (totalFloorsMatch) {
      totalFloors = Number(totalFloorsMatch[1]);
      matchedFieldsCount += 1;
    }
  }

  let totalPriceMillionToman: number | null = null;
  let pricePerSqmMillionToman: number | null = null;
  const perSqmMatch = text.match(/متری\s*(\d+(?:\.\d+)?)\s*(میلیارد|میلیون)/);
  if (perSqmMatch) {
    const val = Number(perSqmMatch[1]);
    pricePerSqmMillionToman = perSqmMatch[2] === 'میلیارد' ? val * 1000 : val;
    matchedFieldsCount += 1;
  }
  const totalBillionMatch = text.match(/(?:قیمت\s*کل|قیمت|مبلغ|رهن\s*کامل|رهن|ودیعه)?\s*(\d+(?:\.\d+)?)\s*میلیارد/);
  const totalMillionMatch = text.match(/(?:قیمت\s*کل|قیمت|رهن\s*کامل|رهن|ودیعه)?\s*(\d{3,6})\s*میلیون/);
  if (totalBillionMatch && (!perSqmMatch || totalBillionMatch.index !== perSqmMatch.index)) {
    totalPriceMillionToman = Math.round(Number(totalBillionMatch[1]) * 1000);
    matchedFieldsCount += 1;
  } else if (totalMillionMatch && (!perSqmMatch || totalMillionMatch.index !== perSqmMatch.index)) {
    totalPriceMillionToman = Math.round(Number(totalMillionMatch[1]));
    matchedFieldsCount += 1;
  }

  const streetMatch = text.match(/(?:خیابان|کوچه|بلوار)\s+([\p{L}\d]+(?:\s+[\p{L}\d]+){0,2})/u);
  const streetNameNormalized = streetMatch
    ? normalizePersianStreetName(streetMatch[1].split(/\s+(?:پلاک|طبقه|متری|متر|ساخت|نوساز|دارای|با|قیمت)/)[0])
    : 'نامشخص';
  if (streetNameNormalized !== 'نامشخص') matchedFieldsCount += 1;

  const hasNegative = (kw: string) => new RegExp(`(?:بدون|ندارد|فاقد)\\s*${kw}|${kw}\\s*ندارد`).test(text);
  const hasElevator = /آسانسور/.test(text) && !hasNegative('آسانسور');
  const hasParking = /پارکینگ/.test(text) && !hasNegative('پارکینگ');
  const hasStorage = /انباری/.test(text) && !hasNegative('انباری');

  let structuralCondition: StructuralConditionCode = 'standard';
  if (buildingAgeYears === 0 || /نوساز|کلید\s*نخورده/.test(text)) structuralCondition = 'brand_new';
  else if (/بازسازی\s*شده|فول\s*بازسازی/.test(text)) structuralCondition = 'renovated';
  else if (/کلنگی|تخریب/.test(text)) structuralCondition = 'old_dilapidated';
  else if (/نیاز\s*به\s*بازسازی/.test(text)) structuralCondition = 'needs_renovation';

  const dealMode: DealModeCode = /رهن|اجاره|ودیعه/.test(text) ? 'rent' : 'buy';
  const propertyType: PropertyTypeCode = /ویلایی|ویلا/.test(text)
    ? 'villa'
    : /پنت\s*هاوس/.test(text)
      ? 'penthouse'
      : /اداری|دفتر\s*کار/.test(text)
        ? 'office'
        : /تجاری|مغازه/.test(text)
          ? 'commercial'
          : 'apartment';

  return {
    areaSqm, buildingAgeYears, floorNumber, totalFloors, totalPriceMillionToman, pricePerSqmMillionToman,
    streetNameNormalized, structuralCondition, hasElevator, hasParking, hasStorage, dealMode, propertyType, matchedFieldsCount,
  };
}

export function extractAndResolvePropertySignal(input: RawPropertySignalInput): {
  fact: ExtractedPropertyFactRecord;
  deduplicatedSourceSignal: boolean;
  matchedExistingBuilding: boolean;
  buildingSimilarityScore: number;
} {
  const sourceHashSha256 = computeSignalSourceHashSha256(input);
  const existingFactId = extractedFactIdBySourceHash.get(sourceHashSha256);
  if (existingFactId && extractedFactsById.has(existingFactId)) {
    return { fact: extractedFactsById.get(existingFactId)!, deduplicatedSourceSignal: true, matchedExistingBuilding: true, buildingSimilarityScore: 1 };
  }

  const fast = extractFastRegexPropertySpecs(input.rawTextFa);
  const areaSqm = Math.max(20, Math.round(input.areaSqmHint ?? fast.areaSqm ?? 90));
  const buildingAgeYears = Math.max(0, Math.round(input.buildingAgeYearsHint ?? fast.buildingAgeYears ?? 4));
  const floorNumber = Math.max(0, Math.round(input.floorNumberHint ?? fast.floorNumber ?? 2));
  const totalFloors = Math.max(floorNumber || 1, Math.round(input.totalFloorsHint ?? fast.totalFloors ?? 5));
  const streetNameNormalized = input.streetNameHint ? normalizePersianStreetName(input.streetNameHint) : fast.streetNameNormalized;
  const resolvedDealMode = input.dealMode ?? fast.dealMode;
  const normalizedCity = String(input.cityId || 'tehran').toLowerCase() as CityId;
  const normalizedHoodId = Math.max(1, Math.round(Number(input.hoodId) || 1));

  let totalPrice = input.totalPriceMillionTomanHint ?? fast.totalPriceMillionToman ?? 0;
  let pricePerSqm = input.pricePerSqmMillionTomanHint ?? fast.pricePerSqmMillionToman ?? 0;
  if (totalPrice > 0 && pricePerSqm <= 0) pricePerSqm = Number((totalPrice / areaSqm).toFixed(2));
  else if (pricePerSqm > 0 && totalPrice <= 0) totalPrice = Math.round(pricePerSqm * areaSqm);
  else if (totalPrice <= 0 && pricePerSqm <= 0) {
    const cityHoods = MULTI_CITY_CONFIGS[normalizedCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
    const matchedHood = cityHoods.find((h) => h.id === normalizedHoodId) ?? INITIAL_NEIGHBORHOODS.find((h) => h.id === normalizedHoodId);
    if (resolvedDealMode === 'rent' && matchedHood?.rahn80m) {
      totalPrice = Math.max(50, Math.round((matchedHood.rahn80m / 80) * areaSqm));
      pricePerSqm = Number((totalPrice / areaSqm).toFixed(2));
    } else {
      pricePerSqm = matchedHood?.buyPerSqm ?? 120;
      totalPrice = Math.round(areaSqm * pricePerSqm);
    }
  }

  const factId = input.signalId || `fact_${sourceHashSha256.slice(0, 14)}`;
  const resolution = resolveOrMergeCanonicalBuilding(
    { cityId: normalizedCity, hoodId: normalizedHoodId, streetNameNormalized, areaSqm, buildingAgeYears, totalFloors, lat: input.lat, lng: input.lng },
    factId,
  );
  const confidenceScore = Number(Math.min(0.99, Math.max(0.55, 0.5 + fast.matchedFieldsCount * 0.08)).toFixed(2));
  const fact: ExtractedPropertyFactRecord = {
    factId,
    cityId: normalizedCity,
    hoodId: normalizedHoodId,
    propertyType: input.propertyType ?? fast.propertyType,
    dealMode: resolvedDealMode,
    areaSqm,
    buildingAgeYears,
    floorNumber,
    totalFloors,
    pricePerSqm,
    totalPrice,
    totalPriceIntlText: formatMillionTomanAsIntlCurrency(totalPrice, 'USD'),
    streetNameNormalized,
    structuralCondition: fast.structuralCondition,
    hasElevator: fast.hasElevator,
    hasParking: fast.hasParking,
    hasStorage: fast.hasStorage,
    ...(typeof input.lat === 'number' && typeof input.lng === 'number' ? { lat: input.lat, lng: input.lng } : {}),
    extractionMethod: fast.matchedFieldsCount >= 3 ? 'regex_fast_pass' : 'hybrid_structured_llm',
    confidenceScore,
    sourceHashSha256,
    canonicalBuildingId: resolution.canonicalBuildingId,
    createdAtIso: input.observedAtIso || new Date().toISOString(),
  };

  if (!extractedFactsById.has(factId) && extractedFactsById.size >= 2000) {
    const oldestFactId = extractedFactsById.keys().next().value;
    if (oldestFactId !== undefined) extractedFactsById.delete(oldestFactId);
  }
  if (!extractedFactIdBySourceHash.has(sourceHashSha256) && extractedFactIdBySourceHash.size >= 2000) {
    const oldestHash = extractedFactIdBySourceHash.keys().next().value;
    if (oldestHash !== undefined) extractedFactIdBySourceHash.delete(oldestHash);
  }
  extractedFactsById.set(factId, fact);
  extractedFactIdBySourceHash.set(sourceHashSha256, factId);
  return { fact, deduplicatedSourceSignal: false, matchedExistingBuilding: resolution.matchedExisting, buildingSimilarityScore: resolution.similarityScore };
}

export function resetAiSeedExtractionForTests(): void {
  extractedFactsById.clear();
  extractedFactIdBySourceHash.clear();
  resetEntityResolutionStoreForTests();
}
