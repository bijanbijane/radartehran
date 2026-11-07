/**
 * @file server/modules/property-services/propertyServicesValidator.ts
 * @description Input validation, booking state-machine transitions, and XSS/PII sanitization for Property Services.
 */

import { escapeHtmlAttr, isValidIranMobilePhone } from '../../../src/utils/security';
import type {
  BookingLifecycleState,
  CredentialType,
  PricingModel,
  ProviderType,
} from './propertyServicesTypes';

const VALID_PROVIDER_TYPES = new Set<ProviderType>([
  'individual_professional',
  'small_business',
  'registered_company',
  'supplier_distributor',
  'contractor_team',
]);

const VALID_PRICING_MODELS = new Set<PricingModel>([
  'FIXED_PRICE',
  'STARTING_PRICE',
  'HOURLY_RATE',
  'PER_SQM',
  'PROJECT_BASED_QUOTATION',
  'CONSULTATION_FEE',
  'UPON_INSPECTION',
  'NO_PUBLIC_PRICE',
]);

const VALID_CREDENTIAL_TYPES = new Set<CredentialType>([
  'ENGINEERING_ORGANIZATION_LICENSE',
  'MUNICIPAL_CONTRACTOR_CERTIFICATE',
  'TRADE_UNION_BUSINESS_LICENSE',
  'OFFICIAL_COMPANY_REGISTRATION',
  'TECHNICAL_VOCATIONAL_CERTIFICATE',
  'SPECIALIZED_SAFETY_CERTIFICATE',
]);

const ALLOWED_BOOKING_TRANSITIONS: Readonly<Record<BookingLifecycleState, readonly BookingLifecycleState[]>> = {
  REQUESTED: ['QUOTED', 'CANCELLED'],
  QUOTED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'DISPUTED'],
  DISPUTED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Validates provider profile creation payload.
 */
export function validateProviderProfileInput(input: unknown): {
  valid: boolean;
  errors: string[];
  sanitized?: {
    publicDisplayName: string;
    businessName?: string;
    providerType: ProviderType;
    primaryCategoryIds: string[];
    descriptionFa: string;
    contactPhone: string;
    contactEmail?: string;
  };
} {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['Profile payload must be a non-null object'] };
  }

  const p = input as Record<string, unknown>;

  const publicDisplayName = escapeHtmlAttr(String(p.publicDisplayName || '').trim().slice(0, 100));
  if (publicDisplayName.length < 3) {
    errors.push('publicDisplayName must be at least 3 characters');
  }

  const providerType = p.providerType as ProviderType;
  if (!VALID_PROVIDER_TYPES.has(providerType)) {
    errors.push(`Invalid providerType: ${String(providerType)}`);
  }

  const categoryIds = Array.isArray(p.primaryCategoryIds)
    ? p.primaryCategoryIds.map((c) => String(c).trim()).filter((c) => c.length > 0)
    : [];
  if (categoryIds.length === 0) {
    errors.push('At least one primary category is required');
  }

  const descriptionFa = escapeHtmlAttr(String(p.descriptionFa || '').trim().slice(0, 2000));
  if (descriptionFa.length < 10) {
    errors.push('descriptionFa must be at least 10 characters');
  }

  const contactPhone = String(p.contactPhone || '').trim();
  if (!isValidIranMobilePhone(contactPhone)) {
    errors.push('Invalid contactPhone: must be a valid Iranian mobile number');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: {
      publicDisplayName,
      businessName: p.businessName ? escapeHtmlAttr(String(p.businessName).trim().slice(0, 120)) : undefined,
      providerType,
      primaryCategoryIds: categoryIds,
      descriptionFa,
      contactPhone,
      contactEmail: typeof p.contactEmail === 'string' && p.contactEmail.includes('@') ? p.contactEmail.trim().toLowerCase().slice(0, 100) : undefined,
    },
  };
}

/**
 * Validates credential submission payload.
 */
export function validateCredentialSubmission(input: unknown): {
  valid: boolean;
  errors: string[];
  sanitized?: {
    credentialType: CredentialType;
    issuingAuthorityFa: string;
    licenseNumber: string;
    documentMediaId: string;
  };
} {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Credential payload must be an object'] };
  }

  const c = input as Record<string, unknown>;
  const credentialType = c.credentialType as CredentialType;
  if (!VALID_CREDENTIAL_TYPES.has(credentialType)) {
    errors.push(`Invalid credentialType: ${String(credentialType)}`);
  }

  const issuingAuthorityFa = escapeHtmlAttr(String(c.issuingAuthorityFa || '').trim().slice(0, 120));
  if (issuingAuthorityFa.length < 3) {
    errors.push('issuingAuthorityFa is required');
  }

  const licenseNumber = String(c.licenseNumber || '').trim().slice(0, 50);
  if (licenseNumber.length < 3) {
    errors.push('licenseNumber is required');
  }

  const documentMediaId = String(c.documentMediaId || '').trim();
  if (documentMediaId.length < 5) {
    errors.push('documentMediaId referencing an uploaded private document is required');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: {
      credentialType,
      issuingAuthorityFa,
      licenseNumber,
      documentMediaId,
    },
  };
}

/**
 * Validates a quotation submission from a provider.
 */
export function validateQuotationSubmission(input: unknown): {
  valid: boolean;
  errors: string[];
  sanitized?: {
    priceToman: number;
    scopeOfWorkFa: string;
    exclusionsFa?: string;
    estimatedDurationDays: number;
    validityPeriodDays: number;
    termsFa?: string;
  };
} {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Quotation payload must be an object'] };
  }

  const q = input as Record<string, unknown>;
  const priceToman = Number(q.priceToman);
  if (!Number.isFinite(priceToman) || priceToman <= 0) {
    errors.push('priceToman must be a positive number');
  }

  const scopeOfWorkFa = escapeHtmlAttr(String(q.scopeOfWorkFa || '').trim().slice(0, 3000));
  if (scopeOfWorkFa.length < 10) {
    errors.push('scopeOfWorkFa must be at least 10 characters');
  }

  const estimatedDurationDays = Math.max(1, Math.min(365, parseInt(String(q.estimatedDurationDays || 1), 10)));
  const validityPeriodDays = Math.max(1, Math.min(90, parseInt(String(q.validityPeriodDays || 7), 10)));

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: {
      priceToman,
      scopeOfWorkFa,
      exclusionsFa: q.exclusionsFa ? escapeHtmlAttr(String(q.exclusionsFa).trim().slice(0, 1000)) : undefined,
      estimatedDurationDays,
      validityPeriodDays,
      termsFa: q.termsFa ? escapeHtmlAttr(String(q.termsFa).trim().slice(0, 2000)) : undefined,
    },
  };
}

/**
 * Validates booking state-machine transitions and actor permissions.
 */
export function validateBookingStateTransition(
  currentState: BookingLifecycleState,
  targetState: BookingLifecycleState,
  actor: { uid: string; isClient: boolean; isProvider: boolean; isAdmin: boolean },
): { allowed: boolean; reasonFa?: string } {
  const allowedNext = ALLOWED_BOOKING_TRANSITIONS[currentState];
  if (!allowedNext || !allowedNext.includes(targetState)) {
    return {
      allowed: false,
      reasonFa: `تغییر وضعیت از «${currentState}» به «${targetState}» مجاز نمی‌باشد.`,
    };
  }

  // Authorization checks
  if (targetState === 'CANCELLED') {
    // Both client, provider, and admin can cancel prior to completion
    return { allowed: true };
  }

  if (targetState === 'ACCEPTED' && !actor.isClient && !actor.isAdmin) {
    return { allowed: false, reasonFa: 'تنها کارفرما (مشتری) مجاز به پذیرش پیش‌فاکتور است.' };
  }

  if (targetState === 'IN_PROGRESS' && !actor.isProvider && !actor.isAdmin) {
    return { allowed: false, reasonFa: 'تنها متخصص/پیمانکار مجاز به شروع کار است.' };
  }

  if (targetState === 'COMPLETED' && !actor.isProvider && !actor.isAdmin) {
    return { allowed: false, reasonFa: 'تنها مجری خدمت یا مدیر مجاز به ثبت اتمام کار است.' };
  }

  return { allowed: true };
}
