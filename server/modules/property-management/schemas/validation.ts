import {
  CoreApiError,
  requireSafeFirestoreId,
  sanitizeTextInput,
  type ValidationIssue,
} from '../../core';
import { UNTRUSTED_REQUEST_IDENTITY_FIELDS } from '../../core/authAndAuthz';
import {
  ALL_MANAGEMENT_AUTHORITY_SCOPES,
  type ManagementAuthorityScope,
  type ObligationType,
  type PaymentFrequency,
  type PortfolioType,
  type RentalAgreementType,
} from '../domain/models';
import {
  ALL_MAINTENANCE_ISSUE_CATEGORIES,
  type HandoverType,
  type IncidentSeverity,
  type MaintenanceIssueCategory,
  type MaintenanceUrgency,
  type PropertyIncidentCategory,
  type PropertyInspectionType,
} from '../domain/LifecycleAndReportingTypes';

const ISO_DATE_PREFIX_REGEX = /^\d{4}-\d{2}-\d{2}/;
const FORBIDDEN_CREDENTIAL_PATTERN =
  /\b(password|passcode|pin\s*code|secret\s*code|door\s*code|alarm\s*code|master\s*code|cvv|iban|card\s*number|رمز\s*عبور|رمز\s*درب|کد\s*ورود)\b/i;

export function assertPlainObjectWithNoUntrustedIdentity(
  raw: unknown,
  allowedIdentityFields: readonly string[] = [],
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Request payload must be a JSON object.', [
      { field: '$body', code: 'INVALID_TYPE', message: 'Expected JSON object.' },
    ]);
  }
  const obj = raw as Record<string, unknown>;
  const allowedSet = new Set(allowedIdentityFields);
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(obj)) {
    if (UNTRUSTED_REQUEST_IDENTITY_FIELDS.has(key) && !allowedSet.has(key)) {
      issues.push({
        field: key,
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Client-supplied identity or role field "${key}" is forbidden.`,
      });
    }
  }
  if (issues.length > 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Untrusted identity fields rejected.', issues);
  }
  return obj;
}

export function requireValidId(raw: unknown, fieldName: string): string {
  const res = requireSafeFirestoreId()(raw, fieldName);
  if (!res.ok || !res.value) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid ${fieldName}.`, res.issues);
  }
  return res.value;
}

export function requireOptionalId(raw: unknown, fieldName: string): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return requireValidId(raw, fieldName);
}

export function requireCleanString(
  raw: unknown,
  fieldName: string,
  minLen = 1,
  maxLen = 500,
): string {
  if (typeof raw !== 'string') {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} must be a string.`, [
      { field: fieldName, code: 'INVALID_TYPE', message: `${fieldName} must be a string.` },
    ]);
  }
  const cleaned = sanitizeTextInput(raw);
  if (cleaned.length < minLen) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} is too short.`, [
      { field: fieldName, code: 'STRING_TOO_SHORT', message: `Minimum length is ${minLen}.` },
    ]);
  }
  if (cleaned.length > maxLen) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} is too long.`, [
      { field: fieldName, code: 'STRING_TOO_LONG', message: `Maximum length is ${maxLen}.` },
    ]);
  }
  return cleaned;
}

export function requireIsoDateString(raw: unknown, fieldName: string): string {
  const str = requireCleanString(raw, fieldName, 10, 40);
  const parsed = Date.parse(str);
  if (!ISO_DATE_PREFIX_REGEX.test(str) || !Number.isFinite(parsed)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} must be a valid ISO-8601 date.`, [
      { field: fieldName, code: 'INVALID_FORMAT', message: 'Expected valid ISO-8601 date string.' },
    ]);
  }
  return new Date(parsed).toISOString();
}

export function requireNonNegativeAmount(raw: unknown, fieldName: string, min = 0, max = 1_000_000_000_000): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min || raw > max) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} must be a finite number between ${min} and ${max}.`, [
      { field: fieldName, code: 'NUMBER_OUT_OF_RANGE', message: `Out of bounds (${min}..${max}).` },
    ]);
  }
  return raw;
}

export function requireEnum<T extends string>(
  raw: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof raw !== 'string' || !allowed.includes(raw as T)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid ${fieldName}.`, [
      { field: fieldName, code: 'INVALID_ENUM_VALUE', message: `Allowed: ${allowed.join(', ')}` },
    ]);
  }
  return raw as T;
}

export function requireIdArray(raw: unknown, fieldName: string, maxItems = 25): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} must be an array of at most ${maxItems} IDs.`);
  }
  return Array.from(new Set(raw.map((item, idx) => requireValidId(item, `${fieldName}[${idx}]`))));
}

export function assertNoSecretCredentialsInText(text: string, fieldName: string): void {
  if (FORBIDDEN_CREDENTIAL_PATTERN.test(text)) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Security policy violation: ${fieldName} must not contain passwords, door/alarm access codes, or banking credentials.`,
      [{ field: fieldName, code: 'INVALID_FORMAT', message: 'Contains prohibited access credentials or banking data.' }],
    );
  }
}

export const PORTFOLIO_TYPES: readonly PortfolioType[] = [
  'INDIVIDUAL_LANDLORD',
  'PROPERTY_MANAGEMENT_COMPANY',
  'RESIDENTIAL_PORTFOLIO',
  'COMMERCIAL_PORTFOLIO',
  'MULTI_UNIT_BUILDING',
  'MIXED_USE_PORTFOLIO',
];

export const AGREEMENT_TYPES: readonly RentalAgreementType[] = [
  'RESIDENTIAL_LEASE',
  'COMMERCIAL_LEASE',
  'OFFICE_LEASE',
  'MULTI_UNIT_RESIDENTIAL_LEASE',
];

export const PAYMENT_FREQUENCIES: readonly PaymentFrequency[] = [
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
  'ONE_TIME',
];

export const OBLIGATION_TYPES: readonly ObligationType[] = [
  'MONTHLY_RENT',
  'SECURITY_DEPOSIT',
  'ADDITIONAL_AGREED_CHARGE',
  'REFUND_OBLIGATION',
  'OTHER_DEFINED_OBLIGATION',
];

export const HANDOVER_TYPES: readonly HandoverType[] = [
  'INITIAL_TENANT_MOVE_IN',
  'TENANT_MOVE_OUT',
  'PROPERTY_MANAGER_CHANGE',
  'MANAGER_TO_MANAGER_TRANSFER',
  'OTHER_SUPPORTED_HANDOVER',
];

export const INSPECTION_TYPES: readonly PropertyInspectionType[] = [
  'MOVE_IN_INSPECTION',
  'MOVE_OUT_INSPECTION',
  'PERIODIC_CONDITION_INSPECTION',
  'MAINTENANCE_INSPECTION',
  'DAMAGE_INSPECTION',
  'PRE_MANAGEMENT_INSPECTION',
];

export const MAINTENANCE_URGENCY_VALUES: readonly MaintenanceUrgency[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'EMERGENCY',
];

export const INCIDENT_CATEGORIES: readonly PropertyIncidentCategory[] = [
  'WATER_LEAK',
  'FIRE_OR_SMOKE_DAMAGE',
  'EQUIPMENT_FAILURE',
  'STRUCTURAL_CONCERN',
  'SECURITY_INCIDENT',
  'TENANT_REPORTED_DAMAGE',
  'COMMON_AREA_INCIDENT',
  'OTHER_PROPERTY_INCIDENT',
];

export const INCIDENT_SEVERITIES: readonly IncidentSeverity[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

export function requireAuthorityScopes(raw: unknown, fieldName = 'scopes'): ManagementAuthorityScope[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} must be a non-empty array of authority scopes.`);
  }
  const scopes = raw.map((item, idx) =>
    requireEnum(item, `${fieldName}[${idx}]`, ALL_MANAGEMENT_AUTHORITY_SCOPES),
  );
  return Array.from(new Set(scopes));
}

export function requireMaintenanceCategory(raw: unknown, fieldName = 'issueCategory'): MaintenanceIssueCategory {
  return requireEnum(raw, fieldName, ALL_MAINTENANCE_ISSUE_CATEGORIES);
}
