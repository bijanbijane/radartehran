import crypto from 'crypto';
import type { ValidationIssue, ValidationResult } from '../core';
import type {
  CurrencyUnit,
  EvidenceReviewDecisionInput,
  MarketEvidenceSourceType,
  PropertyCategory,
  PropertyValuationInput,
  RenovationCondition,
  ValuationPurpose,
  ValuationTransactionType,
} from './types';

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export const ALLOWED_CATEGORIES: readonly PropertyCategory[] = [
  'residential',
  'detached_house',
  'villa_garden',
  'commercial',
  'office',
  'industrial',
  'land_development',
  'agricultural',
  'mixed_use',
  'entire_building',
];

export const ALLOWED_TRANSACTIONS: readonly ValuationTransactionType[] = ['sale', 'rent'];

export const ALLOWED_PURPOSES: readonly ValuationPurpose[] = [
  'estimated_market_value',
  'asking_price_range',
  'estimated_rental_value',
  'price_per_sqm',
  'comparable_market_estimate',
  'historical_valuation',
  'scenario_valuation',
  'professional_appraisal_reference',
];

export const ALLOWED_RENOVATIONS: readonly RenovationCondition[] = [
  'luxury_renovated',
  'renovated',
  'standard',
  'needs_renovation',
];

export const ALLOWED_EVIDENCE_SOURCES: readonly MarketEvidenceSourceType[] = [
  'VERIFIED_COMPLETED_TRANSACTION',
  'VERIFIED_RENTAL_CONTRACT',
  'ACTIVE_PUBLISHED_LISTING',
  'HISTORICAL_LISTING',
  'VERIFIED_PROFESSIONAL_SUBMISSION',
  'APPROVED_MANUAL_OBSERVATION',
];

const PROHIBITED_PERSONAL_ATTRIBUTES = [
  'ownerEthnicity',
  'religion',
  'politicalAffiliation',
  'nationalId',
  'creditScore',
  'maritalStatus',
  'gender',
] as const;

export function normalizeCurrencyToMillionToman(amount: number, unit: CurrencyUnit = 'IRT_MILLION'): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (unit === 'IRT_MILLION') return Number(amount.toFixed(4));
  if (unit === 'IRT') return Number((amount / 1_000_000).toFixed(4));
  if (unit === 'IRR') return Number((amount / 10_000_000).toFixed(4));
  return Number(amount.toFixed(4));
}

export function computeReproducibleInputHash(input: PropertyValuationInput): string {
  const inputObj = input as unknown as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(inputObj).sort()) {
    if (inputObj[k] !== undefined) {
      sorted[k] = inputObj[k];
    }
  }
  return crypto.createHash('sha256').update(JSON.stringify(sorted), 'utf8').digest('hex');
}

export function computeMissingImportantInputs(input: PropertyValuationInput): string[] {
  const missing: string[] = [];
  const isLandOrAgri = input.propertyCategory === 'land_development' || input.propertyCategory === 'agricultural';
  if (!isLandOrAgri) {
    if (input.buildYear === undefined) missing.push('buildYear');
    if (input.renovationCondition === undefined) missing.push('renovationCondition');
    if (input.propertyCategory === 'residential' || input.propertyCategory === 'office') {
      if (input.floor === undefined) missing.push('floor');
      if (input.hasElevator === undefined) missing.push('hasElevator');
      if (input.hasParking === undefined) missing.push('hasParking');
    }
  } else {
    if (input.landAreaSqm === undefined && input.sqm === undefined) missing.push('landAreaSqm');
    if (input.propertyCategory === 'land_development' && input.floorAreaRatio === undefined) {
      missing.push('floorAreaRatio');
    }
  }
  if (input.propertyCategory === 'commercial' && input.commercialFrontageMeters === undefined) {
    missing.push('commercialFrontageMeters');
  }
  return missing;
}

export function validateValuationInput(raw: unknown): ValidationResult<PropertyValuationInput> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Body must be an object.' }] };
  }

  const issues: ValidationIssue[] = [];

  for (const prohibited of PROHIBITED_PERSONAL_ATTRIBUTES) {
    if (raw[prohibited] !== undefined) {
      issues.push({
        field: prohibited,
        code: 'PROHIBITED_PERSONAL_ATTRIBUTE',
        message: `Personal or demographic attribute '${prohibited}' is strictly prohibited in property valuation.`,
      });
    }
  }

  const cityId = typeof raw.cityId === 'string' ? raw.cityId.trim().toLowerCase() : '';
  if (!cityId || !/^[a-z0-9_-]{2,32}$/.test(cityId)) {
    issues.push({ field: 'cityId', code: 'REQUIRED_FIELD_MISSING', message: 'Valid cityId is required.' });
  }

  const hoodId = Number(raw.hoodId);
  if (!Number.isInteger(hoodId) || hoodId <= 0 || hoodId > 9999) {
    issues.push({ field: 'hoodId', code: 'NUMBER_OUT_OF_RANGE', message: 'hoodId must be an integer 1..9999.' });
  }

  const category = (raw.propertyCategory ?? 'residential') as PropertyCategory;
  if (!ALLOWED_CATEGORIES.includes(category)) {
    issues.push({
      field: 'propertyCategory',
      code: 'INVALID_ENUM_VALUE',
      message: `propertyCategory must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`,
    });
  }

  const transactionType = (raw.transactionType ?? 'sale') as ValuationTransactionType;
  if (!ALLOWED_TRANSACTIONS.includes(transactionType)) {
    issues.push({ field: 'transactionType', code: 'INVALID_ENUM_VALUE', message: 'transactionType must be sale or rent.' });
  }

  const purpose = (raw.purpose ?? (transactionType === 'rent' ? 'estimated_rental_value' : 'estimated_market_value')) as ValuationPurpose;
  if (!ALLOWED_PURPOSES.includes(purpose)) {
    issues.push({ field: 'purpose', code: 'INVALID_ENUM_VALUE', message: 'Invalid valuation purpose.' });
  }

  const maxSqm = category === 'agricultural' || category === 'land_development' || category === 'industrial' || category === 'entire_building' ? 100_000 : 5000;
  const sqm = Number(raw.sqm ?? raw.landAreaSqm);
  if (!Number.isFinite(sqm) || sqm < 10 || sqm > maxSqm) {
    issues.push({ field: 'sqm', code: 'NUMBER_OUT_OF_RANGE', message: `sqm must be between 10 and ${maxSqm}.` });
  }

  const input: PropertyValuationInput = {
    cityId,
    hoodId,
    propertyCategory: category,
    transactionType,
    purpose,
    sqm,
  };

  if (typeof raw.hoodName === 'string' && raw.hoodName.trim()) input.hoodName = raw.hoodName.trim().slice(0, 100);
  if (typeof raw.districtId === 'string' && raw.districtId.trim()) input.districtId = raw.districtId.trim().slice(0, 64);
  if (typeof raw.subNeighborhoodId === 'string' && raw.subNeighborhoodId.trim()) input.subNeighborhoodId = raw.subNeighborhoodId.trim().slice(0, 64);
  if (typeof raw.streetName === 'string' && raw.streetName.trim()) input.streetName = raw.streetName.trim().slice(0, 120);
  if (typeof raw.propertyId === 'string' && raw.propertyId.trim()) input.propertyId = raw.propertyId.trim();
  if (typeof raw.listingId === 'string' && raw.listingId.trim()) input.listingId = raw.listingId.trim();
  if (typeof raw.buildingId === 'string' && raw.buildingId.trim()) input.buildingId = raw.buildingId.trim();

  if (raw.usableAreaSqm !== undefined) {
    const u = Number(raw.usableAreaSqm);
    if (!Number.isFinite(u) || u <= 0 || u > sqm * 1.5) {
      issues.push({ field: 'usableAreaSqm', code: 'NUMBER_OUT_OF_RANGE', message: 'usableAreaSqm is out of range.' });
    } else {
      input.usableAreaSqm = u;
    }
  }

  if (raw.landAreaSqm !== undefined) {
    const l = Number(raw.landAreaSqm);
    if (!Number.isFinite(l) || l < 10 || l > 500_000) {
      issues.push({ field: 'landAreaSqm', code: 'NUMBER_OUT_OF_RANGE', message: 'landAreaSqm must be between 10 and 500000.' });
    } else {
      input.landAreaSqm = l;
    }
  }

  if (raw.buildYear !== undefined) {
    const yr = Number(raw.buildYear);
    if (!Number.isInteger(yr) || yr < 1330 || yr > 1410) {
      issues.push({ field: 'buildYear', code: 'NUMBER_OUT_OF_RANGE', message: 'buildYear must be a Jalali year 1330..1410.' });
    } else {
      input.buildYear = yr;
    }
  }

  if (raw.floor !== undefined) {
    const fl = Number(raw.floor);
    if (!Number.isInteger(fl) || fl < -3 || fl > 80) {
      issues.push({ field: 'floor', code: 'NUMBER_OUT_OF_RANGE', message: 'floor must be between -3 and 80.' });
    } else {
      input.floor = fl;
    }
  }

  if (raw.totalFloors !== undefined) {
    const tf = Number(raw.totalFloors);
    if (!Number.isInteger(tf) || tf < 1 || tf > 100) {
      issues.push({ field: 'totalFloors', code: 'NUMBER_OUT_OF_RANGE', message: 'totalFloors must be between 1 and 100.' });
    } else if (input.floor !== undefined && input.floor > tf) {
      issues.push({ field: 'floor', code: ' CONTRADICTORY_INPUT', message: 'floor cannot exceed totalFloors.' });
    } else {
      input.totalFloors = tf;
    }
  }

  if (raw.bedrooms !== undefined) {
    const br = Number(raw.bedrooms);
    if (!Number.isInteger(br) || br < 0 || br > 20) {
      issues.push({ field: 'bedrooms', code: 'NUMBER_OUT_OF_RANGE', message: 'bedrooms must be 0..20.' });
    } else {
      input.bedrooms = br;
    }
  }

  if (raw.bathrooms !== undefined) {
    const ba = Number(raw.bathrooms);
    if (!Number.isInteger(ba) || ba < 0 || ba > 20) {
      issues.push({ field: 'bathrooms', code: 'NUMBER_OUT_OF_RANGE', message: 'bathrooms must be 0..20.' });
    } else {
      input.bathrooms = ba;
    }
  }

  if (typeof raw.hasElevator === 'boolean') input.hasElevator = raw.hasElevator;
  if (typeof raw.hasParking === 'boolean') input.hasParking = raw.hasParking;
  if (typeof raw.hasStorage === 'boolean') input.hasStorage = raw.hasStorage;

  if (raw.parkingSpaces !== undefined) {
    const ps = Number(raw.parkingSpaces);
    if (!Number.isInteger(ps) || ps < 0 || ps > 50) {
      issues.push({ field: 'parkingSpaces', code: 'NUMBER_OUT_OF_RANGE', message: 'parkingSpaces must be 0..50.' });
    } else {
      input.parkingSpaces = ps;
      if (ps > 0 && input.hasParking === undefined) input.hasParking = true;
    }
  }

  if (raw.renovationCondition !== undefined) {
    const reno = String(raw.renovationCondition).trim() as RenovationCondition;
    if (!ALLOWED_RENOVATIONS.includes(reno)) {
      issues.push({ field: 'renovationCondition', code: 'INVALID_ENUM_VALUE', message: 'Invalid renovationCondition.' });
    } else {
      input.renovationCondition = reno;
    }
  }

  if (raw.constructionQuality !== undefined) {
    const cq = String(raw.constructionQuality).trim();
    if (!['luxury', 'grade_a', 'standard', 'economy'].includes(cq)) {
      issues.push({ field: 'constructionQuality', code: 'INVALID_ENUM_VALUE', message: 'Invalid constructionQuality.' });
    } else {
      input.constructionQuality = cq as PropertyValuationInput['constructionQuality'];
    }
  }

  if (raw.unitOrientation !== undefined) {
    const uo = String(raw.unitOrientation).trim();
    if (!['north', 'south', 'east', 'west', 'two_sided'].includes(uo)) {
      issues.push({ field: 'unitOrientation', code: 'INVALID_ENUM_VALUE', message: 'Invalid unitOrientation.' });
    } else {
      input.unitOrientation = uo as PropertyValuationInput['unitOrientation'];
    }
  }

  if (raw.viewQuality !== undefined) {
    const vq = String(raw.viewQuality).trim();
    if (!['panoramic', 'open', 'courtyard', 'obstructed'].includes(vq)) {
      issues.push({ field: 'viewQuality', code: 'INVALID_ENUM_VALUE', message: 'Invalid viewQuality.' });
    } else {
      input.viewQuality = vq as PropertyValuationInput['viewQuality'];
    }
  }

  if (raw.deedType !== undefined) {
    const dt = String(raw.deedType).trim();
    if (!['single_page', 'old_deed', 'endowment', 'promissory', 'unknown'].includes(dt)) {
      issues.push({ field: 'deedType', code: 'INVALID_ENUM_VALUE', message: 'Invalid deedType.' });
    } else {
      input.deedType = dt as PropertyValuationInput['deedType'];
    }
  }

  if (raw.commercialFrontageMeters !== undefined) {
    const cf = Number(raw.commercialFrontageMeters);
    if (!Number.isFinite(cf) || cf < 0 || cf > 500) {
      issues.push({ field: 'commercialFrontageMeters', code: 'NUMBER_OUT_OF_RANGE', message: 'commercialFrontageMeters must be 0..500.' });
    } else {
      input.commercialFrontageMeters = cf;
    }
  }

  if (raw.ceilingHeightMeters !== undefined) {
    const ch = Number(raw.ceilingHeightMeters);
    if (!Number.isFinite(ch) || ch < 1.8 || ch > 25) {
      issues.push({ field: 'ceilingHeightMeters', code: 'NUMBER_OUT_OF_RANGE', message: 'ceilingHeightMeters must be 1.8..25.' });
    } else {
      input.ceilingHeightMeters = ch;
    }
  }

  if (raw.floorAreaRatio !== undefined) {
    const far = Number(raw.floorAreaRatio);
    if (!Number.isFinite(far) || far <= 0 || far > 20) {
      issues.push({ field: 'floorAreaRatio', code: 'NUMBER_OUT_OF_RANGE', message: 'floorAreaRatio must be 0..20.' });
    } else {
      input.floorAreaRatio = far;
    }
  }

  if (raw.distanceToMetroMeters !== undefined) {
    const dm = Number(raw.distanceToMetroMeters);
    if (!Number.isFinite(dm) || dm < 0 || dm > 50_000) {
      issues.push({ field: 'distanceToMetroMeters', code: 'NUMBER_OUT_OF_RANGE', message: 'distanceToMetroMeters must be 0..50000.' });
    } else {
      input.distanceToMetroMeters = dm;
    }
  }

  if (raw.furnishedStatus !== undefined) {
    const fs = String(raw.furnishedStatus).trim();
    if (!['furnished', 'semi_furnished', 'unfurnished'].includes(fs)) {
      issues.push({ field: 'furnishedStatus', code: 'INVALID_ENUM_VALUE', message: 'Invalid furnishedStatus.' });
    } else {
      input.furnishedStatus = fs as PropertyValuationInput['furnishedStatus'];
    }
  }

  if (raw.leaseDurationMonths !== undefined) {
    const lm = Number(raw.leaseDurationMonths);
    if (!Number.isInteger(lm) || lm < 1 || lm > 120) {
      issues.push({ field: 'leaseDurationMonths', code: 'NUMBER_OUT_OF_RANGE', message: 'leaseDurationMonths must be 1..120.' });
    } else {
      input.leaseDurationMonths = lm;
    }
  }

  if (raw.requestedDepositMillion !== undefined) {
    const rd = Number(raw.requestedDepositMillion);
    if (!Number.isFinite(rd) || rd < 0) {
      issues.push({ field: 'requestedDepositMillion', code: 'NUMBER_OUT_OF_RANGE', message: 'requestedDepositMillion must be >= 0.' });
    } else {
      input.requestedDepositMillion = rd;
    }
  }

  const currencyUnit = (raw.currencyUnit ?? 'IRT_MILLION') as CurrencyUnit;
  if (!['IRT_MILLION', 'IRT', 'IRR'].includes(currencyUnit)) {
    issues.push({ field: 'currencyUnit', code: 'INVALID_ENUM_VALUE', message: 'currencyUnit must be IRT_MILLION, IRT, or IRR.' });
  } else {
    input.currencyUnit = currencyUnit;
  }

  if (raw.sellerAskingTotalMillion !== undefined) {
    const askRaw = Number(raw.sellerAskingTotalMillion);
    if (!Number.isFinite(askRaw) || askRaw <= 0) {
      issues.push({ field: 'sellerAskingTotalMillion', code: 'NUMBER_OUT_OF_RANGE', message: 'sellerAskingTotalMillion must be positive.' });
    } else {
      input.sellerAskingTotalMillion = normalizeCurrencyToMillionToman(askRaw, currencyUnit);
    }
  }

  if (isPlainObject(raw.coordinates)) {
    const lat = Number(raw.coordinates.lat);
    const lng = Number(raw.coordinates.lng);
    if (!Number.isFinite(lat) || lat < 24 || lat > 40 || !Number.isFinite(lng) || lng < 44 || lng > 64) {
      issues.push({ field: 'coordinates', code: 'INVALID_COORDINATES', message: 'Coordinates must be valid within Iran geographic bounds.' });
    } else {
      input.coordinates = { lat, lng };
    }
  }

  if (Array.isArray(raw.buildingAmenities)) {
    input.buildingAmenities = raw.buildingAmenities.filter((a): a is string => typeof a === 'string').slice(0, 25);
  }
  if (typeof raw.valuationDateIso === 'string' && raw.valuationDateIso.trim()) {
    input.valuationDateIso = raw.valuationDateIso.trim();
  }
  if (typeof raw.asOfHistoricalDateIso === 'string' && raw.asOfHistoricalDateIso.trim()) {
    input.asOfHistoricalDateIso = raw.asOfHistoricalDateIso.trim();
  }
  if (typeof raw.modelVersionOverride === 'string' && raw.modelVersionOverride.trim()) {
    input.modelVersionOverride = raw.modelVersionOverride.trim();
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, issues: [], value: input };
}

export function validateEvidenceReviewInput(raw: unknown): ValidationResult<EvidenceReviewDecisionInput> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Body must be an object.' }] };
  }
  const issues: ValidationIssue[] = [];
  const evidenceId = typeof raw.evidenceId === 'string' ? raw.evidenceId.trim() : '';
  if (!evidenceId) issues.push({ field: 'evidenceId', code: 'REQUIRED_FIELD_MISSING', message: 'evidenceId is required.' });

  const action = String(raw.action ?? '').trim() as EvidenceReviewDecisionInput['action'];
  if (!['APPROVE', 'REJECT', 'RESTORE', 'CORRECT'].includes(action)) {
    issues.push({ field: 'action', code: 'INVALID_ENUM_VALUE', message: 'action must be APPROVE, REJECT, RESTORE, or CORRECT.' });
  }

  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (reason.length < 3) {
    issues.push({ field: 'reason', code: 'REQUIRED_FIELD_MISSING', message: 'reason is required (min 3 chars).' });
  }

  let correctedTotalMillion: number | undefined;
  if (action === 'CORRECT') {
    const c = Number(raw.correctedTotalMillion);
    if (!Number.isFinite(c) || c <= 0) {
      issues.push({ field: 'correctedTotalMillion', code: 'NUMBER_OUT_OF_RANGE', message: 'correctedTotalMillion is required for CORRECT action.' });
    } else {
      correctedTotalMillion = c;
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    issues: [],
    value: {
      evidenceId,
      action,
      reason,
      correctedTotalMillion,
      correctedSqm: raw.correctedSqm !== undefined ? Number(raw.correctedSqm) : undefined,
    },
  };
}
