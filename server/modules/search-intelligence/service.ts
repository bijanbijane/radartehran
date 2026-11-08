/**
 * Employee 69 — Real Estate Search Intelligence, Discovery & Recommendation Engine Service
 * (`server/modules/search-intelligence/service.ts`)
 *
 * Exclusive ownership: `server/modules/search-intelligence/`
 */

import crypto from 'node:crypto';
import {
  CoreApiError,
  createStructuredAuditEvent,
  runDurableTransaction,
  sanitizeTextInput,
  verifyAdminOrDelegatedPrincipal,
} from '../core';
import type {
  AuthenticatedPrincipal,
  TransactionContextLike,
  TransactionRunnerAdapter,
} from '../core/types';
import { INITIAL_NEIGHBORHOODS } from '../../../src/data/neighborhoods';
import type {
  IndexedPropertyDocument,
  IndexSynchronizationRecord,
  IntelligentPropertyCategory,
  IntelligentSearchQueryFilters,
  IntelligentSortMode,
  IntelligentTransactionType,
  NaturalLanguageQueryInterpretation,
  PropertySimilarityMatch,
  RankedPropertySearchHit,
  RankingPolicyRecord,
  RankingSignalWeights,
  SearchFacetBucketsView,
  SearchIntelligenceDependencies,
  SimilarityRelationshipCategory,
} from './types';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizePersianRealEstateQuery(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let out = raw;
  for (let i = 0; i < 10; i++) {
    out = out.replaceAll(PERSIAN_DIGITS[i], String(i));
    out = out.replaceAll(ARABIC_DIGITS[i], String(i));
  }
  return out
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/إ|أ|آ/g, 'ا')
    .replace(/\u200c+/g, ' ') // Normalize half-spaces to space for uniform matching
    .replace(/[،,؛;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PERSIAN_NUMBER_WORDS: Record<string, number> = {
  یک: 1,
  یه: 1,
  دو: 2,
  سه: 3,
  چهار: 4,
  پنج: 5,
  شش: 6,
};

const REAL_ESTATE_SYNONYMS: Array<{ pattern: RegExp; token: string; canonicalTerm: string }> = [
  { pattern: /(?:^|\s)(?:اپارتمان|واحد مسکونی)(?:\s|$)/, token: 'آپارتمان', canonicalTerm: 'residential:apartment' },
  { pattern: /(?:^|\s)(?:خانه|منزل|مسکونی)(?:\s|$)/, token: 'خانه', canonicalTerm: 'residential' },
  { pattern: /(?:^|\s)(?:دفتر کار|اداری|واحد اداری|مطب)(?:\s|$)/, token: 'دفتر کار', canonicalTerm: 'office' },
  { pattern: /(?:^|\s)(?:مغازه|تجاری|فروشگاه)(?:\s|$)/, token: 'مغازه', canonicalTerm: 'commercial:shop' },
  { pattern: /(?:^|\s)(?:زمین|کلنگی|پلاک ثبتی)(?:\s|$)/, token: 'زمین', canonicalTerm: 'land' },
  { pattern: /(?:^|\s)(?:ویلا|باغ ویلا|ویلایی)(?:\s|$)/, token: 'ویلا', canonicalTerm: 'villa' },
  { pattern: /(?:^|\s)(?:سوله|کارگاه|صنعتی)(?:\s|$)/, token: 'صنعتی', canonicalTerm: 'industrial' },
];

export function interpretNaturalLanguageSearchQuery(
  rawQuery: string,
): NaturalLanguageQueryInterpretation {
  const normalized = normalizePersianRealEstateQuery(rawQuery);
  const tokens = normalized ? normalized.split(' ').filter(Boolean) : [];
  const extractedFilters: IntelligentSearchQueryFilters = {
    rawQueryText: rawQuery,
    normalizedQueryText: normalized,
  };
  const matchedSynonyms: Array<{ token: string; canonicalTerm: string }> = [];
  const ambiguityNotes: string[] = [];

  // 1. Transaction type extraction
  if (/(?:^|\s)(?:اجاره|ودیعه)(?:\s|$)/.test(normalized)) {
    extractedFilters.transactionTypes = ['rent'];
  } else if (/(?:^|\s)رهن کامل(?:\s|$)/.test(normalized)) {
    extractedFilters.transactionTypes = ['full_mortgage'];
  } else if (/(?:^|\s)(?:پیش خرید|پیش فروش)(?:\s|$)/.test(normalized)) {
    extractedFilters.transactionTypes = ['pre_sale'];
  } else if (/(?:^|\s)(?:خرید|فروش)(?:\s|$)/.test(normalized)) {
    extractedFilters.transactionTypes = ['buy'];
  }

  // 2. Property category & subtype synonyms
  for (const syn of REAL_ESTATE_SYNONYMS) {
    if (syn.pattern.test(normalized)) {
      matchedSynonyms.push({ token: syn.token, canonicalTerm: syn.canonicalTerm });
      const [cat, sub] = syn.canonicalTerm.split(':');
      if (!extractedFilters.categories) {
        extractedFilters.categories = [cat as IntelligentPropertyCategory];
      }
      if (sub && !extractedFilters.subtype) {
        extractedFilters.subtype = sub;
      }
    }
  }

  // 3. Room count (e.g., "دو خوابه", "2 خواب", "سه خواب")
  const digitRoomMatch = normalized.match(/(\d+)\s*خواب/);
  if (digitRoomMatch) {
    const rooms = Number(digitRoomMatch[1]);
    extractedFilters.minRooms = rooms;
    extractedFilters.maxRooms = rooms;
  } else {
    for (const [word, num] of Object.entries(PERSIAN_NUMBER_WORDS)) {
      const re = new RegExp(`(?:^|\\s)${word}\\s*خواب`, 'i');
      if (re.test(normalized)) {
        extractedFilters.minRooms = num;
        extractedFilters.maxRooms = num;
        break;
      }
    }
  }

  // 4. City & Neighborhood matching (including half-space variants like "سعادتآباد" / "سعادت اباد")
  if (/(?:^|\s)تهران(?:\s|$)/.test(normalized)) {
    extractedFilters.cityId = 'tehran';
  }
  const compactNormalized = normalized.replace(/\s+/g, '');
  const matchedHoodIds: number[] = [];
  for (const hood of INITIAL_NEIGHBORHOODS) {
    const normHood = normalizePersianRealEstateQuery(hood.name);
    const compactHood = normHood.replace(/\s+/g, '');
    if (normalized.includes(normHood) || compactNormalized.includes(compactHood)) {
      matchedHoodIds.push(hood.id);
    }
  }
  if (matchedHoodIds.length > 0) {
    extractedFilters.neighborhoodIds = matchedHoodIds;
    if (!extractedFilters.cityId) extractedFilters.cityId = 'tehran';
  }

  // 5. District number (e.g. "منطقه 2" or "منطقه مشخص")
  const districtMatch = normalized.match(/منطقه\s*(\d+)/);
  if (districtMatch) {
    extractedFilters.districtNumber = Number(districtMatch[1]);
  } else if (/منطقه\s+مشخص/.test(normalized)) {
    ambiguityNotes.push('عبارت «منطقه مشخص» بدون عدد منطقه ذکر شده است؛ فیلتر منطقه جعل نشد.');
  }

  // 6. Price & Deposit expressions (e.g., "زیر 20 میلیارد", "تا 500 میلیون ودیعه", "ودیعه مشخص")
  const underBillionMatch = normalized.match(/(?:زیر|تا|حداکثر)\s*(\d+(?:\.\d+)?)\s*میلیارد/);
  if (underBillionMatch) {
    const billions = Number(underBillionMatch[1]);
    extractedFilters.maxAskingPriceMillion = Math.round(billions * 1000);
  }
  const depositMillionMatch = normalized.match(/ودیعه\s*(?:زیر|تا|حداکثر)?\s*(\d+)\s*میلیون/);
  if (depositMillionMatch) {
    extractedFilters.maxDepositMillion = Number(depositMillionMatch[1]);
  } else if (/ودیعه\s+مشخص/.test(normalized)) {
    ambiguityNotes.push('عبارت «ودیعه مشخص» بدون مقدار عددی ذکر شده است؛ سقف ودیعه جعل نشد.');
  }

  // 7. Area expressions (e.g., "100 متری", "بالای 120 متر")
  const overAreaMatch = normalized.match(/(?:بالای|حداقل)\s*(\d+)\s*متر/);
  if (overAreaMatch) {
    extractedFilters.minAreaSqm = Number(overAreaMatch[1]);
  } else {
    const exactAreaMatch = normalized.match(/(\d+)\s*متر(?:ی)?/);
    if (exactAreaMatch) {
      const sqm = Number(exactAreaMatch[1]);
      extractedFilters.minAreaSqm = Math.max(10, sqm - 15);
      extractedFilters.maxAreaSqm = sqm + 15;
    }
  }

  // 8. Amenities (metro, parking, elevator)
  if (/نزدیک\s*مترو|دسترسی\s*مترو/.test(normalized)) {
    extractedFilters.nearMetroOnly = true;
  }
  if (/پارکینگ/.test(normalized)) {
    extractedFilters.hasParking = true;
  }
  if (/اسانسور/.test(normalized)) {
    extractedFilters.hasElevator = true;
  }

  const hasStructuredConstraint =
    Boolean(extractedFilters.categories?.length) ||
    Boolean(extractedFilters.transactionTypes?.length) ||
    Boolean(extractedFilters.neighborhoodIds?.length) ||
    extractedFilters.districtNumber !== undefined ||
    extractedFilters.maxAskingPriceMillion !== undefined ||
    extractedFilters.maxDepositMillion !== undefined ||
    extractedFilters.minRooms !== undefined ||
    extractedFilters.nearMetroOnly === true;

  if (!hasStructuredConstraint && tokens.length > 0) {
    ambiguityNotes.push('پرس‌وجو فاقد قیود ساختاریافته صریح است و به صورت جستجوی متنی باز حفظ شد.');
  }

  return {
    originalQuery: rawQuery,
    normalizedQuery: normalized,
    tokens,
    extractedFilters,
    matchedSynonyms,
    unparsedTokens: ambiguityNotes.length > 0 ? ['مشخص'] : [],
    isAmbiguous: ambiguityNotes.length > 0,
    ambiguityNotes,
    confidenceLevel:
      ambiguityNotes.length === 0 && hasStructuredConstraint
        ? 'HIGH'
        : hasStructuredConstraint
          ? 'MEDIUM'
          : 'LOW_AMBIGUOUS',
  };
}

export function calculateGeoDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return Math.round(2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function isPointInsidePolygon(
  point: { lat: number; lng: number },
  vertices: Array<{ lat: number; lng: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].lng;
    const yi = vertices[i].lat;
    const xj = vertices[j].lng;
    const yj = vertices[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const FORBIDDEN_QUERY_INJECTION_KEYS = new Set([
  '$where',
  '$regex',
  '$ne',
  '$gt',
  '$lt',
  'rawSql',
  'rawQuery',
  'filterExpression',
  '__proto__',
  'constructor',
]);

export function validateIntelligentSearchFilters(raw: unknown): IntelligentSearchQueryFilters {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Search filters must be a JSON object.');
  }
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length > 25) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Query complexity limit exceeded: max 25 filter clauses allowed.');
  }
  for (const k of keys) {
    if (FORBIDDEN_QUERY_INJECTION_KEYS.has(k) || k.startsWith('$')) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Forbidden or unsafe query operator rejected: ${k}`);
    }
  }

  const f = structuredClone(obj) as IntelligentSearchQueryFilters;

  if (
    f.minAskingPriceMillion !== undefined &&
    f.maxAskingPriceMillion !== undefined &&
    f.minAskingPriceMillion > f.maxAskingPriceMillion
  ) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'minAskingPriceMillion cannot exceed maxAskingPriceMillion.');
  }
  if (
    f.minAreaSqm !== undefined &&
    f.maxAreaSqm !== undefined &&
    f.minAreaSqm > f.maxAreaSqm
  ) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'minAreaSqm cannot exceed maxAreaSqm.');
  }
  if (f.radiusSearch) {
    if (
      typeof f.radiusSearch.radiusMeters !== 'number' ||
      f.radiusSearch.radiusMeters <= 0 ||
      f.radiusSearch.radiusMeters > 50_000
    ) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'radiusSearch.radiusMeters must be between 1 and 50,000 meters.');
    }
  }
  if (f.polygonVertices) {
    if (!Array.isArray(f.polygonVertices) || f.polygonVertices.length < 3 || f.polygonVertices.length > 64) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'polygonVertices must contain between 3 and 64 vertices.');
    }
  }
  if (f.rawQueryText) {
    f.normalizedQueryText = normalizePersianRealEstateQuery(f.rawQueryText);
  }
  return f;
}

export function createInMemorySearchIntelligenceTxRunner(): TransactionRunnerAdapter & {
  docs: Map<string, Record<string, unknown>>;
} {
  const docs = new Map<string, Record<string, unknown>>();
  return {
    docs,
    async runTransaction<T>(work: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string): Promise<{ exists: boolean; data?: D }> {
          if (staged.has(docPath)) {
            const v = staged.get(docPath);
            return v ? { exists: true, data: structuredClone(v) as D } : { exists: false };
          }
          const ex = docs.get(docPath);
          return ex ? { exists: true, data: structuredClone(ex) as D } : { exists: false };
        },
        set<D = Record<string, unknown>>(docPath: string, data: D): void {
          staged.set(docPath, structuredClone(data) as Record<string, unknown>);
        },
        update(docPath: string, partial: Record<string, unknown>): void {
          const prev = staged.has(docPath) ? staged.get(docPath) : docs.get(docPath);
          staged.set(docPath, { ...(prev ? structuredClone(prev) : {}), ...structuredClone(partial) });
        },
        delete(docPath: string): void {
          staged.set(docPath, null);
        },
      };
      const out = await work(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) docs.delete(k);
        else docs.set(k, v);
      }
      return out;
    },
  };
}

interface BoundedIndexDoc {
  ids: string[];
  updatedAtIso: string;
}

export class SearchIntelligenceService {
  private readonly deps: SearchIntelligenceDependencies;
  private defaultsSeeded = false;
  private totalSearchesExecuted = 0;
  private zeroResultSearchesCount = 0;

  constructor(deps: SearchIntelligenceDependencies) {
    this.deps = deps;
  }

  private async runTx<T>(
    operationName: string,
    work: (tx: TransactionContextLike) => Promise<T>,
  ): Promise<T> {
    return runDurableTransaction(this.deps.txRunner, { operationName }, work);
  }

  private writeDoc(tx: TransactionContextLike, docPath: string, data: unknown): void {
    tx.set(docPath, data as Record<string, unknown>);
  }

  private async appendIndex(tx: TransactionContextLike, indexPath: string, id: string): Promise<void> {
    const snap = await tx.get<BoundedIndexDoc>(indexPath);
    const ids = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
    const nextIds = [id, ...ids.filter((item) => item !== id)].slice(0, 500);
    this.writeDoc(tx, indexPath, { ids: nextIds, updatedAtIso: new Date().toISOString() });
  }

  private async listIndexed<T>(
    tx: TransactionContextLike,
    indexPath: string,
    collectionName: string,
  ): Promise<T[]> {
    const snap = await tx.get<BoundedIndexDoc>(indexPath);
    const ids = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
    const out: T[] = [];
    for (const id of ids) {
      const docSnap = await tx.get<T>(`${collectionName}/${id}`);
      if (docSnap.exists && docSnap.data) out.push(docSnap.data);
    }
    return out;
  }

  public async ensureDefaultIndexSeeded(): Promise<void> {
    if (this.defaultsSeeded) return;
    await this.runTx('si.seedDefaults', async (tx) => {
      const existing = await this.listIndexed<IndexedPropertyDocument>(
        tx,
        'si_indexes/all_properties',
        'si_properties',
      );
      if (existing.length > 0) {
        this.defaultsSeeded = true;
        return;
      }

      const nowIso = new Date().toISOString();
      const defaultPolicy: RankingPolicyRecord = {
        policyId: 'rpol_default',
        version: 1,
        name: 'سیاست رتبه‌بندی استاندارد رادار تهران v1',
        weights: {
          queryRelevance: 25,
          propertyTypeMatch: 15,
          locationMatch: 20,
          priceCompatibility: 15,
          areaCompatibility: 10,
          featureMatch: 5,
          freshness: 3,
          completeness: 3,
          dataQuality: 2,
          verificationBonus: 2,
        },
        active: true,
        updatedByUid: 'system_seed',
        updatedAtIso: nowIso,
      };
      this.writeDoc(tx, 'si_ranking_policies/active', defaultPolicy);

      const sampleDocs: IndexedPropertyDocument[] = [
        {
          propertyId: 'prop_saa_201',
          listingId: 'lst_saa_201',
          canonicalVersion: 1,
          ownerUid: 'seller_1',
          visibility: 'PUBLIC',
          publicationStatus: 'PUBLISHED',
          availabilityStatus: 'AVAILABLE',
          title: 'آپارتمان دو خوابه خوش‌نقشه در سعادت‌آباد',
          description: 'واحد ۱۰۰ متری دو خوابه دارای پارکینگ آسانسور انباری در بالای میدان کاج سعادت‌آباد',
          cityId: 'tehran',
          districtNumber: 2,
          neighborhoodId: 3,
          neighborhoodName: 'سعادت‌آباد',
          category: 'residential',
          subtype: 'apartment',
          transactionType: 'buy',
          askingPriceMillions: 18_500,
          pricePerSqmMillions: 185,
          estimatedValuationMillions: 19_200,
          depositMillions: 0,
          monthlyRentMillions: 0,
          areaSqm: 100,
          landAreaSqm: null,
          rooms: 2,
          floorNumber: 3,
          totalFloors: 5,
          buildingAgeYears: 3,
          hasParking: true,
          hasElevator: true,
          hasStorage: true,
          hasBalcony: true,
          nearMetro: true,
          heatingCoolingSystems: ['chiller', 'package_radiator'],
          buildingCondition: 'new_unoccupied',
          ownershipDeedStatus: 'single_leaf_official',
          coordinates: { lat: 35.782, lng: 51.3755 },
          completenessScore: 95,
          dataQualityScore: 94,
          verifiedListing: true,
          isPaidPromotion: true,
          promotionCampaignId: 'camp_featured_1',
          publishedAtIso: '2026-11-01T10:00:00.000Z',
          updatedAtIso: '2026-11-05T10:00:00.000Z',
          indexedAtIso: nowIso,
        },
        {
          propertyId: 'prop_saa_202',
          listingId: 'lst_saa_202',
          canonicalVersion: 1,
          ownerUid: 'seller_2',
          visibility: 'PUBLIC',
          publicationStatus: 'PUBLISHED',
          availabilityStatus: 'AVAILABLE',
          title: 'آپارتمان ۱۰۵ متری دو خوابه در سعادت‌آباد علامه',
          description: 'آپارتمان مشابه و هم‌رده قیمتی در سعادت‌آباد با سند تک‌برگ',
          cityId: 'tehran',
          districtNumber: 2,
          neighborhoodId: 3,
          neighborhoodName: 'سعادت‌آباد',
          category: 'residential',
          subtype: 'apartment',
          transactionType: 'buy',
          askingPriceMillions: 19_100,
          pricePerSqmMillions: 182,
          estimatedValuationMillions: 19_500,
          depositMillions: 0,
          monthlyRentMillions: 0,
          areaSqm: 105,
          landAreaSqm: null,
          rooms: 2,
          floorNumber: 4,
          totalFloors: 5,
          buildingAgeYears: 4,
          hasParking: true,
          hasElevator: true,
          hasStorage: true,
          hasBalcony: true,
          nearMetro: true,
          heatingCoolingSystems: ['package_radiator'],
          buildingCondition: 'luxury_renovated',
          ownershipDeedStatus: 'single_leaf_official',
          coordinates: { lat: 35.783, lng: 51.3765 },
          completenessScore: 92,
          dataQualityScore: 91,
          verifiedListing: true,
          isPaidPromotion: false,
          promotionCampaignId: null,
          publishedAtIso: '2026-11-02T10:00:00.000Z',
          updatedAtIso: '2026-11-06T10:00:00.000Z',
          indexedAtIso: nowIso,
        },
        {
          propertyId: 'prop_saa_luxury_villa_203',
          listingId: 'lst_saa_203',
          canonicalVersion: 1,
          ownerUid: 'seller_3',
          visibility: 'PUBLIC',
          publicationStatus: 'PUBLISHED',
          availabilityStatus: 'AVAILABLE',
          title: 'پنت‌هاوس و ویلایی ۵۰۰ متری فوق لوکس در سعادت‌آباد',
          description: 'نزدیک از نظر جغرافیایی اما غیرقابل مقایسه از نظر مالی',
          cityId: 'tehran',
          districtNumber: 2,
          neighborhoodId: 3,
          neighborhoodName: 'سعادت‌آباد',
          category: 'villa',
          subtype: 'villa',
          transactionType: 'buy',
          askingPriceMillions: 165_000,
          pricePerSqmMillions: 330,
          estimatedValuationMillions: 160_000,
          depositMillions: 0,
          monthlyRentMillions: 0,
          areaSqm: 500,
          landAreaSqm: 400,
          rooms: 5,
          floorNumber: 1,
          totalFloors: 2,
          buildingAgeYears: 1,
          hasParking: true,
          hasElevator: true,
          hasStorage: true,
          hasBalcony: true,
          nearMetro: true,
          heatingCoolingSystems: ['chiller', 'underfloor_heating'],
          buildingCondition: 'new_unoccupied',
          ownershipDeedStatus: 'single_leaf_official',
          coordinates: { lat: 35.7825, lng: 51.3758 },
          completenessScore: 96,
          dataQualityScore: 95,
          verifiedListing: true,
          isPaidPromotion: false,
          promotionCampaignId: null,
          publishedAtIso: '2026-11-03T10:00:00.000Z',
          updatedAtIso: '2026-11-06T10:00:00.000Z',
          indexedAtIso: nowIso,
        },
        {
          propertyId: 'prop_office_metro_204',
          listingId: 'lst_office_204',
          canonicalVersion: 1,
          ownerUid: 'seller_4',
          visibility: 'PUBLIC',
          publicationStatus: 'PUBLISHED',
          availabilityStatus: 'AVAILABLE',
          title: 'دفتر کار اداری ۹۰ متری نزدیک مترو میدان صنعت',
          description: 'واحد اداری سند اداری چسبیده به ایستگاه مترو در شهرک غرب',
          cityId: 'tehran',
          districtNumber: 2,
          neighborhoodId: 4,
          neighborhoodName: 'شهرک غرب',
          category: 'office',
          subtype: 'administrative_office',
          transactionType: 'buy',
          askingPriceMillions: 17_000,
          pricePerSqmMillions: 188,
          estimatedValuationMillions: 17_500,
          depositMillions: 0,
          monthlyRentMillions: 0,
          areaSqm: 90,
          landAreaSqm: null,
          rooms: 2,
          floorNumber: 2,
          totalFloors: 6,
          buildingAgeYears: 5,
          hasParking: true,
          hasElevator: true,
          hasStorage: false,
          hasBalcony: false,
          nearMetro: true,
          heatingCoolingSystems: ['split_duct'],
          buildingCondition: 'standard_maintained',
          ownershipDeedStatus: 'single_leaf_official',
          coordinates: { lat: 35.7585, lng: 51.369 },
          completenessScore: 90,
          dataQualityScore: 90,
          verifiedListing: true,
          isPaidPromotion: false,
          promotionCampaignId: null,
          publishedAtIso: '2026-11-04T10:00:00.000Z',
          updatedAtIso: '2026-11-06T10:00:00.000Z',
          indexedAtIso: nowIso,
        },
        {
          propertyId: 'prop_private_restricted_999',
          listingId: 'lst_private_999',
          canonicalVersion: 1,
          ownerUid: 'private_owner_99',
          visibility: 'RESTRICTED',
          publicationStatus: 'UNPUBLISHED',
          availabilityStatus: 'OFF_MARKET',
          title: 'ملک محرمانه و منتشر نشده در سعادت‌آباد',
          description: 'نباید در نتایج جستجو یا شمارش فست‌ها دیده شود',
          cityId: 'tehran',
          districtNumber: 2,
          neighborhoodId: 3,
          neighborhoodName: 'سعادت‌آباد',
          category: 'residential',
          subtype: 'apartment',
          transactionType: 'buy',
          askingPriceMillions: 15_000,
          pricePerSqmMillions: 150,
          estimatedValuationMillions: 16_000,
          depositMillions: 0,
          monthlyRentMillions: 0,
          areaSqm: 100,
          landAreaSqm: null,
          rooms: 2,
          floorNumber: 1,
          totalFloors: 4,
          buildingAgeYears: 2,
          hasParking: true,
          hasElevator: true,
          hasStorage: true,
          hasBalcony: true,
          nearMetro: true,
          heatingCoolingSystems: ['package_radiator'],
          buildingCondition: 'new_unoccupied',
          ownershipDeedStatus: 'single_leaf_official',
          coordinates: { lat: 35.782, lng: 51.375 },
          completenessScore: 90,
          dataQualityScore: 90,
          verifiedListing: false,
          isPaidPromotion: false,
          promotionCampaignId: null,
          publishedAtIso: '2026-11-01T10:00:00.000Z',
          updatedAtIso: '2026-11-01T10:00:00.000Z',
          indexedAtIso: nowIso,
        },
      ];

      for (const doc of sampleDocs) {
        this.writeDoc(tx, `si_properties/${doc.propertyId}`, doc);
        await this.appendIndex(tx, 'si_indexes/all_properties', doc.propertyId);
      }

      this.defaultsSeeded = true;
    });
  }

  private matchesFilters(
    item: IndexedPropertyDocument,
    filters: IntelligentSearchQueryFilters,
    requesterUid?: string,
    isAdmin = false,
  ): boolean {
    // Public/private listing isolation: never reveal unpublished or restricted listings to unauthorized users
    const isOwner = Boolean(requesterUid && item.ownerUid === requesterUid);
    if (!isAdmin && !isOwner) {
      if (
        item.visibility !== 'PUBLIC' ||
        item.publicationStatus !== 'PUBLISHED' ||
        item.availabilityStatus === 'OFF_MARKET'
      ) {
        return false;
      }
    }

    if (filters.cityId && item.cityId !== filters.cityId) return false;
    if (filters.districtNumber !== undefined && item.districtNumber !== filters.districtNumber) {
      return false;
    }
    if (
      filters.neighborhoodIds &&
      filters.neighborhoodIds.length > 0 &&
      !filters.neighborhoodIds.includes(item.neighborhoodId)
    ) {
      return false;
    }
    if (
      filters.excludedNeighborhoodIds &&
      filters.excludedNeighborhoodIds.includes(item.neighborhoodId)
    ) {
      return false;
    }
    if (
      filters.categories &&
      filters.categories.length > 0 &&
      !filters.categories.includes(item.category)
    ) {
      return false;
    }
    if (filters.excludedCategories && filters.excludedCategories.includes(item.category)) {
      return false;
    }
    if (filters.subtype && item.subtype !== filters.subtype) return false;
    if (
      filters.transactionTypes &&
      filters.transactionTypes.length > 0 &&
      !filters.transactionTypes.includes(item.transactionType)
    ) {
      return false;
    }
    if (
      filters.minAskingPriceMillion !== undefined &&
      item.askingPriceMillions < filters.minAskingPriceMillion
    ) {
      return false;
    }
    if (
      filters.maxAskingPriceMillion !== undefined &&
      item.askingPriceMillions > filters.maxAskingPriceMillion
    ) {
      return false;
    }
    if (filters.minDepositMillion !== undefined && item.depositMillions < filters.minDepositMillion) {
      return false;
    }
    if (filters.maxDepositMillion !== undefined && item.depositMillions > filters.maxDepositMillion) {
      return false;
    }
    if (filters.minAreaSqm !== undefined && item.areaSqm < filters.minAreaSqm) return false;
    if (filters.maxAreaSqm !== undefined && item.areaSqm > filters.maxAreaSqm) return false;
    if (filters.minRooms !== undefined && item.rooms < filters.minRooms) return false;
    if (filters.maxRooms !== undefined && item.rooms > filters.maxRooms) return false;
    if (
      filters.maxBuildingAgeYears !== undefined &&
      item.buildingAgeYears > filters.maxBuildingAgeYears
    ) {
      return false;
    }
    if (filters.hasParking !== undefined && item.hasParking !== filters.hasParking) return false;
    if (filters.hasElevator !== undefined && item.hasElevator !== filters.hasElevator) return false;
    if (filters.hasStorage !== undefined && item.hasStorage !== filters.hasStorage) return false;
    if (filters.nearMetroOnly && !item.nearMetro) return false;
    if (filters.verifiedOnly && !item.verifiedListing) return false;

    if (filters.boundingBox) {
      const { minLat, maxLat, minLng, maxLng } = filters.boundingBox;
      if (
        item.coordinates.lat < minLat ||
        item.coordinates.lat > maxLat ||
        item.coordinates.lng < minLng ||
        item.coordinates.lng > maxLng
      ) {
        return false;
      }
    }
    if (filters.radiusSearch) {
      const dist = calculateGeoDistanceMeters(item.coordinates, filters.radiusSearch);
      if (dist > filters.radiusSearch.radiusMeters) return false;
    }
    if (filters.polygonVertices && filters.polygonVertices.length >= 3) {
      if (!isPointInsidePolygon(item.coordinates, filters.polygonVertices)) return false;
    }

    return true;
  }

  private computeExplainableHit(
    item: IndexedPropertyDocument,
    filters: IntelligentSearchQueryFilters,
    policy: RankingPolicyRecord,
  ): RankedPropertySearchHit {
    const w = policy.weights;
    const missingDataPenalties: string[] = [];

    let queryRelevance = w.queryRelevance;
    if (filters.normalizedQueryText) {
      const normTitle = normalizePersianRealEstateQuery(
        `${item.title} ${item.description} ${item.neighborhoodName}`,
      );
      const qTokens = filters.normalizedQueryText.split(' ').filter((t) => t.length >= 2);
      const matchedCount = qTokens.filter((t) => normTitle.includes(t)).length;
      queryRelevance =
        qTokens.length > 0 ? Math.round((matchedCount / qTokens.length) * w.queryRelevance) : w.queryRelevance;
    }

    const propertyTypeMatch =
      !filters.categories || filters.categories.includes(item.category) ? w.propertyTypeMatch : 0;
    const locationMatch =
      !filters.neighborhoodIds || filters.neighborhoodIds.includes(item.neighborhoodId)
        ? w.locationMatch
        : Math.round(w.locationMatch * 0.5);

    const priceCompatibility =
      item.askingPriceMillions <= item.estimatedValuationMillions
        ? w.priceCompatibility
        : Math.max(0, Math.round(w.priceCompatibility * 0.6));

    const areaCompatibility = w.areaCompatibility;
    const featureMatch =
      (item.hasParking ? 2 : 0) + (item.hasElevator ? 2 : 0) + (item.nearMetro ? 1 : 0);
    const freshness = w.freshness;
    const completeness = Math.round((item.completenessScore / 100) * w.completeness);
    const dataQuality = Math.round((item.dataQualityScore / 100) * w.dataQuality);
    const verificationBonus = item.verifiedListing ? w.verificationBonus : 0;

    if (!item.description || item.description.length < 10) {
      missingDataPenalties.push('SHORT_DESCRIPTION');
    }

    const factorBreakdown: Record<keyof RankingSignalWeights, number> = {
      queryRelevance,
      propertyTypeMatch,
      locationMatch,
      priceCompatibility,
      areaCompatibility,
      featureMatch: Math.min(w.featureMatch, featureMatch),
      freshness,
      completeness,
      dataQuality,
      verificationBonus,
    };

    // Paid promotion is strictly separated from organicRelevanceScore
    const organicRelevanceScore = Object.values(factorBreakdown).reduce((s, v) => s + v, 0);
    const distanceMeters = filters.radiusSearch
      ? calculateGeoDistanceMeters(item.coordinates, filters.radiusSearch)
      : null;

    return {
      item,
      organicRelevanceScore,
      distanceMeters,
      isPaidPromotionPlacement: item.isPaidPromotion,
      paidPromotionLabel: item.isPaidPromotion ? 'آگهی ویژه (تبلیغاتی)' : null,
      rankingExplanation: {
        policyId: policy.policyId,
        policyVersion: policy.version,
        factorBreakdown,
        missingDataPenalties,
      },
    };
  }

  private buildAuthorizedFacets(items: IndexedPropertyDocument[]): SearchFacetBucketsView {
    const byCategory: Record<string, number> = {};
    const byTransactionType: Record<string, number> = {};
    const byNeighborhoodId: Record<string, { neighborhoodId: number; name: string; count: number }> = {};
    const byRoomCount: Record<string, number> = {};
    const byPriceRangeBucket: Record<string, number> = {
      under_10b: 0,
      between_10b_25b: 0,
      above_25b: 0,
    };
    const byAreaRangeBucket: Record<string, number> = {
      under_80sqm: 0,
      between_80_150sqm: 0,
      above_150sqm: 0,
    };
    const byVerificationStatus = { verified: 0, standard: 0 };
    const byAmenities = { parking: 0, elevator: 0, storage: 0, nearMetro: 0 };

    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
      byTransactionType[item.transactionType] = (byTransactionType[item.transactionType] ?? 0) + 1;
      const nKey = String(item.neighborhoodId);
      if (!byNeighborhoodId[nKey]) {
        byNeighborhoodId[nKey] = {
          neighborhoodId: item.neighborhoodId,
          name: item.neighborhoodName,
          count: 0,
        };
      }
      byNeighborhoodId[nKey].count += 1;

      const rKey = `${item.rooms}_rooms`;
      byRoomCount[rKey] = (byRoomCount[rKey] ?? 0) + 1;

      if (item.askingPriceMillions < 10_000) byPriceRangeBucket.under_10b += 1;
      else if (item.askingPriceMillions <= 25_000) byPriceRangeBucket.between_10b_25b += 1;
      else byPriceRangeBucket.above_25b += 1;

      if (item.areaSqm < 80) byAreaRangeBucket.under_80sqm += 1;
      else if (item.areaSqm <= 150) byAreaRangeBucket.between_80_150sqm += 1;
      else byAreaRangeBucket.above_150sqm += 1;

      if (item.verifiedListing) byVerificationStatus.verified += 1;
      else byVerificationStatus.standard += 1;

      if (item.hasParking) byAmenities.parking += 1;
      if (item.hasElevator) byAmenities.elevator += 1;
      if (item.hasStorage) byAmenities.storage += 1;
      if (item.nearMetro) byAmenities.nearMetro += 1;
    }

    return {
      totalAuthorizedMatches: items.length,
      aggregationStatus: items.length > 0 ? 'OK' : 'ZERO_RESULTS',
      byCategory,
      byTransactionType,
      byNeighborhoodId,
      byRoomCount,
      byPriceRangeBucket,
      byAreaRangeBucket,
      byVerificationStatus,
      byAmenities,
    };
  }

  public async executeIntelligentSearch(params: {
    filters?: unknown;
    naturalLanguageQuery?: string;
    sort?: IntelligentSortMode;
    limit?: number;
    offset?: number;
    requesterUid?: string;
    isAdmin?: boolean;
  }): Promise<{
    hits: RankedPropertySearchHit[];
    paidPromotions: RankedPropertySearchHit[];
    facets: SearchFacetBucketsView;
    interpretation: NaturalLanguageQueryInterpretation | null;
    totalCount: number;
  }> {
    await this.ensureDefaultIndexSeeded();

    let interpretation: NaturalLanguageQueryInterpretation | null = null;
    let effectiveFilters: IntelligentSearchQueryFilters = {};

    if (params.naturalLanguageQuery && params.naturalLanguageQuery.trim()) {
      interpretation = interpretNaturalLanguageSearchQuery(params.naturalLanguageQuery);
      effectiveFilters = { ...interpretation.extractedFilters };
    }
    if (params.filters) {
      const validated = validateIntelligentSearchFilters(params.filters);
      effectiveFilters = { ...effectiveFilters, ...validated };
    }

    const sortMode: IntelligentSortMode = params.sort ?? 'relevance';
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = Math.max(0, params.offset ?? 0);

    return this.runTx('si.executeSearch', async (tx) => {
      const allProps = await this.listIndexed<IndexedPropertyDocument>(
        tx,
        'si_indexes/all_properties',
        'si_properties',
      );
      const policySnap = await tx.get<RankingPolicyRecord>('si_ranking_policies/active');
      const policy = policySnap.data!;

      const matched = allProps.filter((p) =>
        this.matchesFilters(p, effectiveFilters, params.requesterUid, params.isAdmin),
      );

      this.totalSearchesExecuted += 1;
      if (matched.length === 0) {
        this.zeroResultSearchesCount += 1;
      }

      const facets = this.buildAuthorizedFacets(matched);
      const hits = matched.map((item) => this.computeExplainableHit(item, effectiveFilters, policy));

      // Deterministic sorting with stable tie-breaking by propertyId ascending
      hits.sort((a, b) => {
        if (sortMode === 'price_asc') {
          if (a.item.askingPriceMillions !== b.item.askingPriceMillions) {
            return a.item.askingPriceMillions - b.item.askingPriceMillions;
          }
        } else if (sortMode === 'price_desc') {
          if (a.item.askingPriceMillions !== b.item.askingPriceMillions) {
            return b.item.askingPriceMillions - a.item.askingPriceMillions;
          }
        } else if (sortMode === 'area_asc') {
          if (a.item.areaSqm !== b.item.areaSqm) return a.item.areaSqm - b.item.areaSqm;
        } else if (sortMode === 'area_desc') {
          if (a.item.areaSqm !== b.item.areaSqm) return b.item.areaSqm - a.item.areaSqm;
        } else if (sortMode === 'newest') {
          const cmp = b.item.publishedAtIso.localeCompare(a.item.publishedAtIso);
          if (cmp !== 0) return cmp;
        } else if (sortMode === 'distance_asc') {
          const da = a.distanceMeters ?? Number.MAX_SAFE_INTEGER;
          const db = b.distanceMeters ?? Number.MAX_SAFE_INTEGER;
          if (da !== db) return da - db;
        } else {
          // Organic relevance descending
          if (b.organicRelevanceScore !== a.organicRelevanceScore) {
            return b.organicRelevanceScore - a.organicRelevanceScore;
          }
        }
        return a.item.propertyId.localeCompare(b.item.propertyId);
      });

      const paidPromotions = hits.filter((h) => h.isPaidPromotionPlacement);
      return {
        hits: hits.slice(offset, offset + limit),
        paidPromotions,
        facets,
        interpretation,
        totalCount: hits.length,
      };
    });
  }

  // ==========================================================================
  // 6 & 7. SIMILAR PROPERTY MATCHING & RECOMMENDATIONS
  // ==========================================================================

  public async findSimilarAndComparableProperties(
    referencePropertyId: string,
    requesterUid?: string,
  ): Promise<{
    referencePropertyId: string;
    similarProperties: PropertySimilarityMatch[];
    financiallyComparableProperties: PropertySimilarityMatch[];
    nearbyProperties: PropertySimilarityMatch[];
    alternativeListings: PropertySimilarityMatch[];
  }> {
    await this.ensureDefaultIndexSeeded();
    return this.runTx('si.findSimilarAndComparable', async (tx) => {
      const refSnap = await tx.get<IndexedPropertyDocument>(`si_properties/${referencePropertyId}`);
      if (!refSnap.exists || !refSnap.data) {
        throw new CoreApiError('NOT_FOUND', 404, `Property ${referencePropertyId} not found.`);
      }
      const ref = refSnap.data;
      if (ref.visibility !== 'PUBLIC' && ref.ownerUid !== requesterUid) {
        throw new CoreApiError('FORBIDDEN', 403, 'Reference property is not accessible.');
      }

      const allProps = await this.listIndexed<IndexedPropertyDocument>(
        tx,
        'si_indexes/all_properties',
        'si_properties',
      );
      const candidates = allProps.filter(
        (c) =>
          c.propertyId !== ref.propertyId &&
          c.visibility === 'PUBLIC' &&
          c.publicationStatus === 'PUBLISHED' &&
          c.availabilityStatus === 'AVAILABLE',
      );

      const similarProperties: PropertySimilarityMatch[] = [];
      const financiallyComparableProperties: PropertySimilarityMatch[] = [];
      const nearbyProperties: PropertySimilarityMatch[] = [];
      const alternativeListings: PropertySimilarityMatch[] = [];

      for (const cand of candidates) {
        const distanceMeters = calculateGeoDistanceMeters(ref.coordinates, cand.coordinates);
        const priceRatioDiff =
          ref.askingPriceMillions > 0
            ? Math.abs(cand.askingPriceMillions - ref.askingPriceMillions) / ref.askingPriceMillions
            : 1;
        const sqmPriceDiff =
          ref.pricePerSqmMillions > 0
            ? Math.abs(cand.pricePerSqmMillions - ref.pricePerSqmMillions) / ref.pricePerSqmMillions
            : 1;
        const areaDiffRatio =
          ref.areaSqm > 0 ? Math.abs(cand.areaSqm - ref.areaSqm) / ref.areaSqm : 1;

        const sameCategory = cand.category === ref.category;
        const sameTransaction = cand.transactionType === ref.transactionType;

        const financialComparabilityScore = Math.max(
          0,
          Math.round((1 - (priceRatioDiff * 0.6 + sqmPriceDiff * 0.4)) * 100),
        );
        const physicalSimilarityScore = Math.max(
          0,
          Math.round(
            ((sameCategory ? 35 : 0) +
              (sameTransaction ? 20 : 0) +
              Math.max(0, (1 - areaDiffRatio) * 25) +
              (cand.rooms === ref.rooms ? 10 : 0) +
              (Math.abs(cand.buildingAgeYears - ref.buildingAgeYears) <= 3 ? 10 : 0)),
          ),
        );

        const explanationFactors: string[] = [];
        if (sameCategory) explanationFactors.push('هم‌خانواده در کاربری ملک');
        if (distanceMeters <= 1500) explanationFactors.push(`فاصله جغرافیایی نزدیک (${distanceMeters} متر)`);
        if (priceRatioDiff <= 0.15) explanationFactors.push('تناسب مالی و قیمتی نزدیک');

        // Section 7: Never treat geographic proximity alone as proof of financial comparability!
        if (
          sameCategory &&
          sameTransaction &&
          priceRatioDiff <= 0.2 &&
          sqmPriceDiff <= 0.2 &&
          areaDiffRatio <= 0.25
        ) {
          financiallyComparableProperties.push({
            property: cand,
            relationshipCategory: 'FINANCIALLY_COMPARABLE',
            overallSimilarityScore: physicalSimilarityScore,
            financialComparabilityScore,
            distanceMeters,
            explanationFactors,
          });
        }

        if (sameCategory && sameTransaction && physicalSimilarityScore >= 70) {
          similarProperties.push({
            property: cand,
            relationshipCategory: 'SIMILAR_PROPERTIES',
            overallSimilarityScore: physicalSimilarityScore,
            financialComparabilityScore,
            distanceMeters,
            explanationFactors,
          });
        }

        if (distanceMeters <= 2000) {
          nearbyProperties.push({
            property: cand,
            relationshipCategory: 'NEARBY_PROPERTIES',
            overallSimilarityScore: physicalSimilarityScore,
            financialComparabilityScore,
            distanceMeters,
            explanationFactors,
          });
        }

        if (sameTransaction && priceRatioDiff <= 0.25 && cand.neighborhoodId !== ref.neighborhoodId) {
          alternativeListings.push({
            property: cand,
            relationshipCategory: 'ALTERNATIVE_LISTINGS',
            overallSimilarityScore: physicalSimilarityScore,
            financialComparabilityScore,
            distanceMeters,
            explanationFactors,
          });
        }
      }

      return {
        referencePropertyId,
        similarProperties,
        financiallyComparableProperties,
        nearbyProperties,
        alternativeListings,
      };
    });
  }

  public async getPersonalizedRecommendations(
    principal: AuthenticatedPrincipal,
    targetUid: string,
    explicitPreferences: {
      preferredCategories?: IntelligentPropertyCategory[];
      preferredNeighborhoodIds?: number[];
      maxBudgetMillions?: number;
      personalizationConsentGranted: boolean;
    },
  ): Promise<{
    ownerUid: string;
    consentApplied: boolean;
    recommendations: RankedPropertySearchHit[];
  }> {
    if (
      principal.uid !== targetUid &&
      principal.role !== 'primary_admin' &&
      principal.role !== 'delegated_admin'
    ) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Cannot access personalized recommendations or search history of another user.',
      );
    }

    if (!explicitPreferences.personalizationConsentGranted) {
      const generic = await this.executeIntelligentSearch({
        filters: { cityId: 'tehran' },
        sort: 'newest',
        limit: 10,
        requesterUid: targetUid,
      });
      return {
        ownerUid: targetUid,
        consentApplied: false,
        recommendations: generic.hits,
      };
    }

    const personalized = await this.executeIntelligentSearch({
      filters: {
        cityId: 'tehran',
        categories: explicitPreferences.preferredCategories,
        neighborhoodIds: explicitPreferences.preferredNeighborhoodIds,
        maxAskingPriceMillion: explicitPreferences.maxBudgetMillions,
      },
      sort: 'relevance',
      limit: 10,
      requesterUid: targetUid,
    });

    return {
      ownerUid: targetUid,
      consentApplied: true,
      recommendations: personalized.hits,
    };
  }

  // ==========================================================================
  // 10 & 13. INDEX SYNCHRONIZATION & ADMINISTRATIVE RANKING CONTROLS
  // ==========================================================================

  public async synchronizeCanonicalPropertyToIndex(params: {
    eventId: string;
    eventType: IndexSynchronizationRecord['eventType'];
    propertyDocument: IndexedPropertyDocument;
  }): Promise<IndexSynchronizationRecord> {
    await this.ensureDefaultIndexSeeded();
    const nowIso = new Date().toISOString();

    return this.runTx('si.syncPropertyToIndex', async (tx) => {
      const existingSyncSnap = await tx.get<IndexSynchronizationRecord>(
        `si_sync_events/${params.eventId}`,
      );
      if (existingSyncSnap.exists && existingSyncSnap.data) {
        return existingSyncSnap.data;
      }

      const currentSnap = await tx.get<IndexedPropertyDocument>(
        `si_properties/${params.propertyDocument.propertyId}`,
      );

      if (
        currentSnap.exists &&
        currentSnap.data &&
        currentSnap.data.canonicalVersion > params.propertyDocument.canonicalVersion
      ) {
        const staleRecord: IndexSynchronizationRecord = {
          syncId: `sync_${crypto.randomBytes(5).toString('hex')}`,
          propertyId: params.propertyDocument.propertyId,
          eventId: params.eventId,
          eventType: params.eventType,
          canonicalVersion: params.propertyDocument.canonicalVersion,
          status: 'SKIPPED_STALE_VERSION',
          syncedAtIso: nowIso,
        };
        this.writeDoc(tx, `si_sync_events/${params.eventId}`, staleRecord);
        return staleRecord;
      }

      if (params.eventType === 'LISTING_DELETED_OR_RESTRICTED') {
        const updatedDoc: IndexedPropertyDocument = {
          ...params.propertyDocument,
          visibility: 'RESTRICTED',
          publicationStatus: 'UNPUBLISHED',
          availabilityStatus: 'OFF_MARKET',
          indexedAtIso: nowIso,
        };
        this.writeDoc(tx, `si_properties/${updatedDoc.propertyId}`, updatedDoc);
        const removedRec: IndexSynchronizationRecord = {
          syncId: `sync_${crypto.randomBytes(5).toString('hex')}`,
          propertyId: updatedDoc.propertyId,
          eventId: params.eventId,
          eventType: params.eventType,
          canonicalVersion: updatedDoc.canonicalVersion,
          status: 'REMOVED_FROM_INDEX',
          syncedAtIso: nowIso,
        };
        this.writeDoc(tx, `si_sync_events/${params.eventId}`, removedRec);
        return removedRec;
      }

      const syncedDoc: IndexedPropertyDocument = {
        ...params.propertyDocument,
        indexedAtIso: nowIso,
      };
      this.writeDoc(tx, `si_properties/${syncedDoc.propertyId}`, syncedDoc);
      await this.appendIndex(tx, 'si_indexes/all_properties', syncedDoc.propertyId);

      const syncRecord: IndexSynchronizationRecord = {
        syncId: `sync_${crypto.randomBytes(5).toString('hex')}`,
        propertyId: syncedDoc.propertyId,
        eventId: params.eventId,
        eventType: params.eventType,
        canonicalVersion: syncedDoc.canonicalVersion,
        status: 'SYNCHRONIZED',
        syncedAtIso: nowIso,
      };
      this.writeDoc(tx, `si_sync_events/${params.eventId}`, syncRecord);
      return syncRecord;
    });
  }

  public async updateRankingPolicyWeights(
    adminPrincipal: AuthenticatedPrincipal,
    newWeights: Partial<RankingSignalWeights>,
  ): Promise<RankingPolicyRecord> {
    const decision = await verifyAdminOrDelegatedPrincipal(adminPrincipal, this.deps.adminStore, {
      primaryAdminEmails: this.deps.primaryAdminEmails,
    });
    if (!decision.allowed) {
      throw new CoreApiError('FORBIDDEN', 403, 'Administrative search permission required.');
    }

    await this.ensureDefaultIndexSeeded();
    const nowIso = new Date().toISOString();

    const updated = await this.runTx('si.updateRankingPolicy', async (tx) => {
      const current = (await tx.get<RankingPolicyRecord>('si_ranking_policies/active')).data!;
      const mergedWeights: RankingSignalWeights = { ...current.weights };

      for (const [k, v] of Object.entries(newWeights)) {
        if (typeof v !== 'number' || v < 0 || v > 100 || Number.isNaN(v)) {
          throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid ranking weight for ${k}.`);
        }
        (mergedWeights as unknown as Record<string, number>)[k] = v;
      }

      const nextPolicy: RankingPolicyRecord = {
        policyId: current.policyId,
        version: current.version + 1,
        name: current.name,
        weights: mergedWeights,
        active: true,
        updatedByUid: adminPrincipal.uid,
        updatedAtIso: nowIso,
      };
      this.writeDoc(tx, 'si_ranking_policies/active', nextPolicy);
      return nextPolicy;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId: `corr_${crypto.randomBytes(4).toString('hex')}`,
        action: 'search_intelligence.ranking_policy.updated',
        targetCollection: 'si_ranking_policies',
        targetResourceId: `${updated.policyId}_v${updated.version}`,
        outcome: 'SUCCESS',
        metadata: { version: updated.version },
      }),
    );

    return updated;
  }

  public getOperationalSearchMetrics(): {
    totalSearchesExecuted: number;
    zeroResultSearchesCount: number;
  } {
    return {
      totalSearchesExecuted: this.totalSearchesExecuted,
      zeroResultSearchesCount: this.zeroResultSearchesCount,
    };
  }
}
