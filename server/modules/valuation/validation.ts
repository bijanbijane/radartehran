import crypto from 'crypto';
import type { ValidationIssue, ValidationResult } from '../core';
import type { PropertyCategory, PropertyValuationInput, RenovationCondition, ValuationTransactionType } from './types';

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

const ALLOWED_CATEGORIES: readonly PropertyCategory[] = ['residential', 'commercial', 'office'];
const ALLOWED_TRANSACTIONS: readonly ValuationTransactionType[] = ['sale', 'rent'];
const ALLOWED_RENOVATIONS: readonly RenovationCondition[] = [
  'luxury_renovated',
  'renovated',
  'standard',
  'needs_renovation',
];

export function computeReproducibleInputHash(input: PropertyValuationInput): string {
  const inputObj = input as unknown as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(inputObj).sort()) {
    sorted[k] = inputObj[k];
  }
  return crypto.createHash('sha256').update(JSON.stringify(sorted), 'utf8').digest('hex');
}

export function validateValuationInput(raw: unknown): ValidationResult<PropertyValuationInput> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Body must be an object.' }] };
  }

  const issues: ValidationIssue[] = [];

  const cityId = typeof raw.cityId === 'string' ? raw.cityId.trim().toLowerCase() : '';
  if (!cityId || !/^[a-z_]{2,32}$/.test(cityId)) {
    issues.push({ field: 'cityId', code: 'REQUIRED_FIELD_MISSING', message: 'Valid cityId is required.' });
  }

  const hoodId = Number(raw.hoodId);
  if (!Number.isInteger(hoodId) || hoodId <= 0 || hoodId > 999) {
    issues.push({ field: 'hoodId', code: 'NUMBER_OUT_OF_RANGE', message: 'hoodId must be an integer 1..999.' });
  }

  const category = (raw.propertyCategory ?? 'residential') as PropertyCategory;
  if (!ALLOWED_CATEGORIES.includes(category)) {
    issues.push({ field: 'propertyCategory', code: 'INVALID_ENUM_VALUE', message: 'propertyCategory must be residential, commercial, or office.' });
  }

  const transactionType = (raw.transactionType ?? 'sale') as ValuationTransactionType;
  if (!ALLOWED_TRANSACTIONS.includes(transactionType)) {
    issues.push({ field: 'transactionType', code: 'INVALID_ENUM_VALUE', message: 'transactionType must be sale or rent.' });
  }

  const sqm = Number(raw.sqm);
  if (!Number.isFinite(sqm) || sqm < 15 || sqm > 2000) {
    issues.push({ field: 'sqm', code: 'NUMBER_OUT_OF_RANGE', message: 'sqm must be between 15 and 2000.' });
  }

  const input: PropertyValuationInput = {
    cityId,
    hoodId,
    propertyCategory: category,
    transactionType,
    sqm,
  };

  if (typeof raw.hoodName === 'string' && raw.hoodName.trim()) {
    input.hoodName = raw.hoodName.trim().slice(0, 100);
  }

  if (raw.buildYear !== undefined) {
    const yr = Number(raw.buildYear);
    if (!Number.isInteger(yr) || yr < 1350 || yr > 1410) {
      issues.push({ field: 'buildYear', code: 'NUMBER_OUT_OF_RANGE', message: 'buildYear must be a Jalali year 1350..1410.' });
    } else {
      input.buildYear = yr;
    }
  }

  if (raw.floor !== undefined) {
    const fl = Number(raw.floor);
    if (!Number.isInteger(fl) || fl < -2 || fl > 50) {
      issues.push({ field: 'floor', code: 'NUMBER_OUT_OF_RANGE', message: 'floor must be between -2 and 50.' });
    } else {
      input.floor = fl;
    }
  }

  if (raw.totalFloors !== undefined) {
    const tf = Number(raw.totalFloors);
    if (!Number.isInteger(tf) || tf < 1 || tf > 60) {
      issues.push({ field: 'totalFloors', code: 'NUMBER_OUT_OF_RANGE', message: 'totalFloors must be between 1 and 60.' });
    } else {
      input.totalFloors = tf;
    }
  }

  if (typeof raw.hasElevator === 'boolean') input.hasElevator = raw.hasElevator;
  if (typeof raw.hasParking === 'boolean') input.hasParking = raw.hasParking;
  if (typeof raw.hasStorage === 'boolean') input.hasStorage = raw.hasStorage;

  if (raw.renovationCondition !== undefined) {
    const reno = String(raw.renovationCondition).trim() as RenovationCondition;
    if (!ALLOWED_RENOVATIONS.includes(reno)) {
      issues.push({ field: 'renovationCondition', code: 'INVALID_ENUM_VALUE', message: 'Invalid renovationCondition.' });
    } else {
      input.renovationCondition = reno;
    }
  }

  if (raw.sellerAskingTotalMillion !== undefined) {
    const ask = Number(raw.sellerAskingTotalMillion);
    if (!Number.isFinite(ask) || ask <= 0) {
      issues.push({ field: 'sellerAskingTotalMillion', code: 'NUMBER_OUT_OF_RANGE', message: 'sellerAskingTotalMillion must be positive.' });
    } else {
      input.sellerAskingTotalMillion = ask;
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, issues: [], value: input };
}
