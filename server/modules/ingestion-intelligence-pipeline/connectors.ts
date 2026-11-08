/**
 * EMPLOYEE 70 — CONNECTOR ARCHITECTURE, SSRF GUARD, PARSERS & PERSIAN NORMALIZATION
 */

import crypto from 'crypto';
import { CoreApiError } from '../core';
import type {
  ConnectorFormat,
  DataQualityValidationResult,
  DataSourceRegistryRecord,
  EntityResolutionCandidateRecord,
  KnownCanonicalEntityRef,
  NormalizedIngestionRecord,
  QualityIssue,
  RawExternalRecordInput,
} from './types';

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function normalizePersianTextAndDigits(input: unknown): string {
  if (input === null || input === undefined) return '';
  let text = String(input);
  for (let i = 0; i < 10; i++) {
    text = text.replace(new RegExp(PERSIAN_DIGITS[i], 'g'), String(i));
    text = text.replace(new RegExp(ARABIC_DIGITS[i], 'g'), String(i));
  }
  return text
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/\u200c+/g, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function assertSafeExternalUrl(urlString: string, allowedDomains: string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid connector URL format.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      `SSRF_BLOCKED_PROTOCOL: Disallowed URL protocol: ${parsed.protocol}`,
    );
  }

  const host = parsed.hostname.toLowerCase();
  const blockedPatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^0\.0\.0\.0$/,
    /^\[?::1\]?$/,
    /\.internal$/i,
    /\.local$/i,
    /^metadata\.google\.internal$/i,
  ];

  if (blockedPatterns.some((pattern) => pattern.test(host))) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      `SSRF_PRIVATE_NETWORK_BLOCKED: SSRF guard blocked private or internal host: ${host}`,
    );
  }

  const normalizedAllowed = allowedDomains.map((d) => d.toLowerCase().trim()).filter(Boolean);
  if (normalizedAllowed.length === 0 || !normalizedAllowed.includes(host)) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      `SSRF_DOMAIN_NOT_ALLOWLISTED: Host ${host} is not in the data source allowlist.`,
    );
  }

  return parsed;
}

export function assertNoMaliciousPayloadContent(rawText: string, maxBytes: number): void {
  const byteLength = Buffer.byteLength(rawText, 'utf8');
  if (byteLength > maxBytes) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      413,
      `PAYLOAD_TOO_LARGE: Raw ingestion payload (${byteLength} bytes) exceeds source limit (${maxBytes} bytes).`,
    );
  }
  const dangerousPatterns = [
    /<!ENTITY/i,
    /<!DOCTYPE[^>]+SYSTEM/i,
    /<script[\s>]/i,
    /javascript:/i,
    /__proto__/i,
    /constructor\.prototype/i,
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(rawText)) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        422,
        'MALICIOUS_INGESTION_PAYLOAD_REJECTED: Ingestion payload rejected due to prohibited executable/XXE/prototype-pollution signature.',
      );
    }
  }
}

export function parseStructuredFormatRecords(
  format: ConnectorFormat,
  rawPayloadText: string,
  maxBytes: number,
  maxRecords: number,
): RawExternalRecordInput[] {
  assertNoMaliciousPayloadContent(rawPayloadText, maxBytes);
  const trimmed = rawPayloadText.trim();
  if (!trimmed) return [];

  let parsedRecords: RawExternalRecordInput[] = [];

  if (format === 'JSON' || format === 'HTTP_JSON_API' || format === 'PAGINATED_FEED') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        422,
        'MALFORMED_INGESTION_JSON: Failed to parse JSON ingestion payload.',
      );
    }
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).items)
        ? ((parsed as Record<string, unknown>).items as unknown[])
        : null;
    if (!items) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        422,
        'MALFORMED_INGESTION_JSON_SCHEMA: JSON payload must be an array of records or an object with an items array.',
      );
    }
    parsedRecords = items.map((item, idx) => {
      const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return {
        externalRecordId: String(obj.externalRecordId ?? obj.id ?? `row_${idx + 1}`),
        recordDomain: (obj.recordDomain as RawExternalRecordInput['recordDomain']) ?? 'PROPERTY_LISTING',
        title: obj.title !== undefined ? String(obj.title) : undefined,
        address: obj.address !== undefined ? String(obj.address) : undefined,
        city: obj.city !== undefined ? String(obj.city) : undefined,
        district: obj.district as number | string | undefined,
        neighborhood: obj.neighborhood !== undefined ? String(obj.neighborhood) : undefined,
        propertyCategory: obj.propertyCategory !== undefined ? String(obj.propertyCategory) : undefined,
        transactionMode: obj.transactionMode !== undefined ? String(obj.transactionMode) : undefined,
        area: obj.area as number | string | undefined,
        areaUnit: (obj.areaUnit as RawExternalRecordInput['areaUnit']) ?? 'SQM',
        price: obj.price as number | string | undefined,
        currency: (obj.currency as RawExternalRecordInput['currency']) ?? 'TOMAN',
        rentMonthly: obj.rentMonthly as number | string | undefined,
        deposit: obj.deposit as number | string | undefined,
        isVerifiedTransaction: Boolean(obj.isVerifiedTransaction),
        latitude: obj.latitude as number | string | undefined,
        longitude: obj.longitude as number | string | undefined,
        buildingAge: obj.buildingAge as number | string | undefined,
        bedrooms: obj.bedrooms as number | string | undefined,
        floor: obj.floor as number | string | undefined,
        postalCode: obj.postalCode !== undefined ? String(obj.postalCode) : undefined,
        nationalPropertyCode: obj.nationalPropertyCode !== undefined ? String(obj.nationalPropertyCode) : undefined,
        rawAttributes: obj,
      };
    });
  } else if (format === 'CSV' || format === 'TABULAR_UPLOAD') {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        422,
        'MALFORMED_INGESTION_CSV: CSV/tabular payload must contain a header row and at least one data row.',
      );
    }
    const headers = lines[0].split(',').map((h) => h.trim());
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const rowObj: Record<string, string> = {};
      headers.forEach((h, colIdx) => {
        rowObj[h] = cols[colIdx] ?? '';
      });
      parsedRecords.push({
        externalRecordId: rowObj.externalRecordId || rowObj.id || `csv_${i}`,
        title: rowObj.title || undefined,
        address: rowObj.address || undefined,
        city: rowObj.city || undefined,
        district: rowObj.district || undefined,
        neighborhood: rowObj.neighborhood || undefined,
        propertyCategory: rowObj.propertyCategory || undefined,
        transactionMode: rowObj.transactionMode || undefined,
        area: rowObj.area || undefined,
        areaUnit: (rowObj.areaUnit as RawExternalRecordInput['areaUnit']) || 'SQM',
        price: rowObj.price || undefined,
        currency: (rowObj.currency as RawExternalRecordInput['currency']) || 'TOMAN',
        isVerifiedTransaction: rowObj.isVerifiedTransaction === 'true',
        latitude: rowObj.latitude || undefined,
        longitude: rowObj.longitude || undefined,
        buildingAge: rowObj.buildingAge || undefined,
        bedrooms: rowObj.bedrooms || undefined,
        postalCode: rowObj.postalCode || undefined,
        nationalPropertyCode: rowObj.nationalPropertyCode || undefined,
        rawAttributes: rowObj,
      });
    }
  } else if (format === 'XML') {
    const recordMatches = Array.from(trimmed.matchAll(/<record>([\s\S]*?)<\/record>/gi));
    if (recordMatches.length === 0) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        422,
        'MALFORMED_INGESTION_XML: XML payload must contain at least one <record>...</record> element.',
      );
    }
    const extractTag = (block: string, tag: string): string | undefined => {
      const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : undefined;
    };
    parsedRecords = recordMatches.map((match, idx) => {
      const block = match[1];
      return {
        externalRecordId: extractTag(block, 'externalRecordId') || extractTag(block, 'id') || `xml_${idx + 1}`,
        title: extractTag(block, 'title'),
        address: extractTag(block, 'address'),
        city: extractTag(block, 'city'),
        district: extractTag(block, 'district'),
        neighborhood: extractTag(block, 'neighborhood'),
        propertyCategory: extractTag(block, 'propertyCategory'),
        transactionMode: extractTag(block, 'transactionMode'),
        area: extractTag(block, 'area'),
        price: extractTag(block, 'price'),
        currency: (extractTag(block, 'currency') as RawExternalRecordInput['currency']) || 'TOMAN',
        latitude: extractTag(block, 'latitude'),
        longitude: extractTag(block, 'longitude'),
        postalCode: extractTag(block, 'postalCode'),
        nationalPropertyCode: extractTag(block, 'nationalPropertyCode'),
      };
    });
  }

  if (parsedRecords.length > maxRecords) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      413,
      `BATCH_RECORD_LIMIT_EXCEEDED: Batch record count (${parsedRecords.length}) exceeds source maxRecordsPerBatch (${maxRecords}).`,
    );
  }

  return parsedRecords;
}

function parseNumericField(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const cleaned = normalizePersianTextAndDigits(raw).replace(/,/g, '').trim();
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

export function normalizeExternalRecord(
  raw: RawExternalRecordInput,
  stagingId: string,
  batchId: string,
  source: DataSourceRegistryRecord,
  nowIso: string,
): NormalizedIngestionRecord {
  const normalizedTitleFa = raw.title ? normalizePersianTextAndDigits(raw.title) : undefined;
  const normalizedAddressFa = raw.address ? normalizePersianTextAndDigits(raw.address) : undefined;
  const rawCity = normalizePersianTextAndDigits(raw.city || 'تهران');
  const cityMap: Record<string, string> = {
    tehran: 'تهران',
    'تهران': 'تهران',
    karaj: 'کرج',
    'کرج': 'کرج',
    pardis: 'پردیس',
    'پردیس': 'پردیس',
  };
  const cityName = cityMap[rawCity.toLowerCase()] || rawCity;

  const districtCode = parseNumericField(raw.district);
  const neighborhoodName = raw.neighborhood ? normalizePersianTextAndDigits(raw.neighborhood) : undefined;

  const rawArea = parseNumericField(raw.area);
  let areaSqm: number | undefined;
  if (rawArea !== undefined) {
    if (raw.areaUnit === 'HECTARE') areaSqm = rawArea * 10000;
    else if (raw.areaUnit === 'SQFT') areaSqm = Math.round(rawArea * 0.092903 * 100) / 100;
    else areaSqm = rawArea;
  }

  const rawPrice = parseNumericField(raw.price);
  const currency = raw.currency || 'TOMAN';
  let priceRials: number | undefined;
  let priceToman: number | undefined;
  if (rawPrice !== undefined) {
    if (currency === 'RIAL') {
      priceRials = Math.round(rawPrice);
      priceToman = Math.round(rawPrice / 10);
    } else {
      priceToman = Math.round(rawPrice);
      priceRials = Math.round(rawPrice * 10);
    }
  }

  const rawRent = parseNumericField(raw.rentMonthly);
  const rentMonthlyRials =
    rawRent !== undefined ? (currency === 'RIAL' ? Math.round(rawRent) : Math.round(rawRent * 10)) : undefined;
  const rawDeposit = parseNumericField(raw.deposit);
  const depositRials =
    rawDeposit !== undefined
      ? currency === 'RIAL'
        ? Math.round(rawDeposit)
        : Math.round(rawDeposit * 10)
      : undefined;

  const isVerifiedTransactionPrice =
    Boolean(raw.isVerifiedTransaction) &&
    (source.category === 'OFFICIAL_PUBLIC_DATASET' ||
      source.category === 'AUTHORIZED_GOVERNMENT_DATA' ||
      source.reliabilityClassification === 'AUTHORITATIVE_OFFICIAL');
  const isAskingPrice = !isVerifiedTransactionPrice;

  const latitude = parseNumericField(raw.latitude);
  const longitude = parseNumericField(raw.longitude);
  const buildingAgeYears = parseNumericField(raw.buildingAge);
  const bedrooms = parseNumericField(raw.bedrooms);
  const floorNumber = parseNumericField(raw.floor);

  const catRaw = (raw.propertyCategory || 'RESIDENTIAL').toUpperCase();
  const propertyCategory: NormalizedIngestionRecord['propertyCategory'] =
    catRaw === 'COMMERCIAL' || catRaw === 'LAND' || catRaw === 'OFFICE' ? catRaw : 'RESIDENTIAL';

  const modeRaw = (raw.transactionMode || (isVerifiedTransactionPrice ? 'VERIFIED_CLOSED_SALE' : 'SALE')).toUpperCase();
  const transactionMode: NormalizedIngestionRecord['transactionMode'] =
    modeRaw === 'RENT' ? 'RENT' : isVerifiedTransactionPrice ? 'VERIFIED_CLOSED_SALE' : 'SALE';

  const pricePerSqmRials =
    priceRials !== undefined && areaSqm !== undefined && areaSqm > 0
      ? Math.round(priceRials / areaSqm)
      : undefined;

  let estimatedDistrictTier: NormalizedIngestionRecord['enrichedAttributes']['estimatedDistrictTier'];
  if (districtCode !== undefined && Number.isFinite(districtCode)) {
    if ([1, 2, 3].includes(districtCode)) estimatedDistrictTier = 'NORTH';
    else if ([6, 7, 11, 12].includes(districtCode)) estimatedDistrictTier = 'CENTRAL';
    else if ([5, 9, 21, 22].includes(districtCode)) estimatedDistrictTier = 'WEST';
    else if ([4, 8, 13, 14].includes(districtCode)) estimatedDistrictTier = 'EAST';
    else estimatedDistrictTier = 'SOUTH';
  }

  const extractedTags: string[] = [];
  const combinedText = `${normalizedTitleFa || ''} ${normalizedAddressFa || ''}`;
  if (combinedText.includes('پارکینگ')) extractedTags.push('PARKING');
  if (combinedText.includes('آسانسور')) extractedTags.push('ELEVATOR');
  if (combinedText.includes('انباری')) extractedTags.push('STORAGE');
  if (combinedText.includes('نوساز')) extractedTags.push('NEW_BUILD');

  const populatedFields = [
    normalizedTitleFa,
    normalizedAddressFa,
    cityName,
    districtCode,
    neighborhoodName,
    areaSqm,
    priceRials ?? rentMonthlyRials,
    latitude,
    longitude,
    bedrooms,
  ].filter((v) => v !== undefined && !Number.isNaN(v)).length;

  return {
    normalizedRecordId: `norm_${crypto.randomUUID()}`,
    stagingId,
    batchId,
    sourceId: source.sourceId,
    externalRecordId: normalizePersianTextAndDigits(raw.externalRecordId),
    recordDomain: raw.recordDomain || 'PROPERTY_LISTING',
    normalizedTitleFa,
    normalizedAddressFa,
    cityName,
    districtCode,
    neighborhoodName,
    propertyCategory,
    transactionMode,
    areaSqm,
    priceRials,
    priceToman,
    rentMonthlyRials,
    depositRials,
    isAskingPrice,
    isVerifiedTransactionPrice,
    latitude,
    longitude,
    buildingAgeYears,
    bedrooms,
    floorNumber,
    postalCode: raw.postalCode ? normalizePersianTextAndDigits(raw.postalCode) : undefined,
    nationalPropertyCode: raw.nationalPropertyCode
      ? normalizePersianTextAndDigits(raw.nationalPropertyCode)
      : undefined,
    extractedTags,
    enrichedAttributes: {
      pricePerSqmRials,
      estimatedDistrictTier,
      completenessScore: Math.round((populatedFields / 10) * 100),
    },
    normalizedAt: nowIso,
  };
}

export function validateNormalizedRecordQuality(record: NormalizedIngestionRecord): DataQualityValidationResult {
  const issues: QualityIssue[] = [];

  if (!record.externalRecordId) {
    issues.push({
      ruleCode: 'MISSING_EXTERNAL_ID',
      field: 'externalRecordId',
      severity: 'CRITICAL_QUARANTINE',
      message: 'External record ID is required.',
    });
  }

  if (record.areaSqm === undefined || Number.isNaN(record.areaSqm) || record.areaSqm <= 5 || record.areaSqm > 100000) {
    issues.push({
      ruleCode: 'IMPOSSIBLE_AREA_SQM',
      field: 'areaSqm',
      severity: 'CRITICAL_QUARANTINE',
      message: `Area (${record.areaSqm}) is missing, non-numeric, or outside plausible bounds (5..100000 sqm).`,
    });
  }

  if (record.transactionMode !== 'RENT') {
    if (
      record.priceRials === undefined ||
      Number.isNaN(record.priceRials) ||
      record.priceRials <= 1_000_000 ||
      record.priceRials > 50_000_000_000_000
    ) {
      issues.push({
        ruleCode: 'IMPLAUSIBLE_SALE_PRICE',
        field: 'priceRials',
        severity: 'CRITICAL_QUARANTINE',
        message: `Sale price in Rials (${record.priceRials}) is missing or outside plausible bounds.`,
      });
    }
  }

  if (record.latitude !== undefined || record.longitude !== undefined) {
    const lat = record.latitude ?? NaN;
    const lng = record.longitude ?? NaN;
    // Iran bounding box check: lat 24..40, lng 44..64
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < 24 || lat > 40 || lng < 44 || lng > 64) {
      issues.push({
        ruleCode: 'OUT_OF_BOUNDS_COORDINATES',
        field: 'latitude/longitude',
        severity: 'CRITICAL_QUARANTINE',
        message: `Coordinates (${lat}, ${lng}) fall outside valid geographic bounds for Iran.`,
      });
    }
  }

  if (record.districtCode !== undefined && (Number.isNaN(record.districtCode) || record.districtCode < 1 || record.districtCode > 22)) {
    issues.push({
      ruleCode: 'INVALID_DISTRICT_CODE',
      field: 'districtCode',
      severity: 'ERROR',
      message: `District code (${record.districtCode}) is invalid.`,
    });
  }

  const quarantined = issues.some((i) => i.severity === 'CRITICAL_QUARANTINE' || i.severity === 'ERROR');
  const penalty = issues.reduce((acc, i) => {
    if (i.severity === 'CRITICAL_QUARANTINE') return acc + 50;
    if (i.severity === 'ERROR') return acc + 30;
    if (i.severity === 'WARNING') return acc + 10;
    return acc;
  }, 0);

  return {
    validationId: `val_${crypto.randomUUID()}`,
    normalizedRecordId: record.normalizedRecordId,
    batchId: record.batchId,
    sourceId: record.sourceId,
    passed: !quarantined,
    quarantined,
    qualityScore: Math.max(0, 100 - penalty),
    issues,
    validatedAt: new Date().toISOString(),
  };
}

export function resolveEntityAgainstKnownCanonicals(
  record: NormalizedIngestionRecord,
  knownEntities: KnownCanonicalEntityRef[],
  seenExternalKeysInBatch: Set<string>,
  nowIso: string,
): EntityResolutionCandidateRecord {
  const dedupeKey = `${record.sourceId}::${record.externalRecordId}`;
  if (seenExternalKeysInBatch.has(dedupeKey)) {
    return {
      resolutionId: `res_${crypto.randomUUID()}`,
      normalizedRecordId: record.normalizedRecordId,
      batchId: record.batchId,
      sourceId: record.sourceId,
      decision: 'DUPLICATE_SKIPPED',
      candidatePropertyIds: [],
      confidenceScore: 1.0,
      matchReasons: ['EXACT_BATCH_EXTERNAL_ID_DUPLICATE'],
      reviewStatus: 'AUTO_RESOLVED',
      createdAt: nowIso,
    };
  }
  seenExternalKeysInBatch.add(dedupeKey);

  // 1. Exact deterministic match by nationalPropertyCode or postalCode + exact area
  for (const entity of knownEntities) {
    if (
      record.nationalPropertyCode &&
      entity.nationalPropertyCode &&
      record.nationalPropertyCode === entity.nationalPropertyCode
    ) {
      return {
        resolutionId: `res_${crypto.randomUUID()}`,
        normalizedRecordId: record.normalizedRecordId,
        batchId: record.batchId,
        sourceId: record.sourceId,
        decision: 'EXACT_CANONICAL_MATCH',
        matchedCanonicalPropertyId: entity.canonicalPropertyId,
        matchedCanonicalListingId: entity.canonicalListingId,
        candidatePropertyIds: [entity.canonicalPropertyId],
        confidenceScore: 0.99,
        matchReasons: ['EXACT_NATIONAL_PROPERTY_CODE_MATCH'],
        reviewStatus: 'AUTO_RESOLVED',
        createdAt: nowIso,
      };
    }
  }

  // 2. Fuzzy / geo / attribute similarity candidate matching (NEVER auto-merge ambiguous matches!)
  const candidates: { id: string; score: number; reasons: string[] }[] = [];
  for (const entity of knownEntities) {
    if (entity.cityName !== record.cityName) continue;
    let score = 0;
    const reasons: string[] = [];

    if (record.postalCode && entity.postalCode && record.postalCode === entity.postalCode) {
      score += 0.45;
      reasons.push('SAME_POSTAL_CODE');
    }
    if (
      record.neighborhoodName &&
      entity.neighborhoodName &&
      record.neighborhoodName === entity.neighborhoodName
    ) {
      score += 0.2;
      reasons.push('SAME_NEIGHBORHOOD');
    }
    if (record.areaSqm !== undefined && Math.abs(entity.areaSqm - record.areaSqm) <= 3) {
      score += 0.25;
      reasons.push('CLOSE_AREA_SQM');
    }
    if (
      record.normalizedAddressFa &&
      entity.normalizedAddressFa &&
      (record.normalizedAddressFa.includes(entity.normalizedAddressFa) ||
        entity.normalizedAddressFa.includes(record.normalizedAddressFa))
    ) {
      score += 0.25;
      reasons.push('ADDRESS_SUBSTRING_SIMILARITY');
    }
    if (
      record.latitude !== undefined &&
      record.longitude !== undefined &&
      entity.latitude !== undefined &&
      entity.longitude !== undefined
    ) {
      const distLat = Math.abs(record.latitude - entity.latitude);
      const distLng = Math.abs(record.longitude - entity.longitude);
      if (distLat < 0.0005 && distLng < 0.0005) {
        score += 0.3;
        reasons.push('GEO_PROXIMITY_WITHIN_50M');
      }
    }

    if (score >= 0.5) {
      candidates.push({
        id: entity.canonicalPropertyId,
        score: Math.min(0.95, Math.round(score * 100) / 100),
        reasons,
      });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return {
      resolutionId: `res_${crypto.randomUUID()}`,
      normalizedRecordId: record.normalizedRecordId,
      batchId: record.batchId,
      sourceId: record.sourceId,
      decision: 'AMBIGUOUS_CANDIDATE_REQUIRES_REVIEW',
      candidatePropertyIds: candidates.map((c) => c.id),
      confidenceScore: candidates[0].score,
      matchReasons: candidates[0].reasons,
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      createdAt: nowIso,
    };
  }

  return {
    resolutionId: `res_${crypto.randomUUID()}`,
    normalizedRecordId: record.normalizedRecordId,
    batchId: record.batchId,
    sourceId: record.sourceId,
    decision: 'NEW_ENTITY',
    candidatePropertyIds: [],
    confidenceScore: 1.0,
    matchReasons: ['NO_CONFLICTING_CANONICAL_ENTITY'],
    reviewStatus: 'AUTO_RESOLVED',
    createdAt: nowIso,
  };
}
