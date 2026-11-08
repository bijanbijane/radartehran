/**
 * Service Providers Validation Engine & Domain Invariants
 * (`server/modules/service-providers/validation.ts`)
 * Exclusive ownership: `server/modules/service-providers/`
 */

import type {
  PricingModel,
  ProviderCategory,
} from './types';

export class ProviderValidationError extends Error {
  public readonly code: string;
  public readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = 'ProviderValidationError';
    this.code = code;
    this.field = field;
  }
}

export function sanitizeText(input: unknown, maxLength = 1000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function validateSafeFirestoreId(id: unknown, fieldName: string): string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(id)) {
    throw new ProviderValidationError('INVALID_IDENTIFIER', `Invalid ${fieldName} identifier.`, fieldName);
  }
  return id;
}

export function validateIsoDateString(isoString: unknown, fieldName: string): string {
  if (typeof isoString !== 'string') {
    throw new ProviderValidationError('INVALID_TIMESTAMP', `${fieldName} must be an ISO date string.`, fieldName);
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    throw new ProviderValidationError('INVALID_TIMESTAMP', `${fieldName} is not a valid date.`, fieldName);
  }
  return date.toISOString();
}

export const ALLOWED_PROVIDER_CATEGORIES: ProviderCategory[] = [
  'real_estate_agent',
  'real_estate_broker',
  'property_consultant',
  'property_valuation_specialist',
  'civil_engineer',
  'structural_engineer',
  'architect',
  'building_inspector',
  'general_contractor',
  'renovation_company',
  'interior_designer',
  'electrician',
  'plumber',
  'property_management_company',
  'cleaning_service',
  'legal_consultant',
];

export function validateProviderCategory(cat: unknown): ProviderCategory {
  if (!ALLOWED_PROVIDER_CATEGORIES.includes(cat as ProviderCategory)) {
    throw new ProviderValidationError('INVALID_PROVIDER_CATEGORY', `Invalid provider category: ${String(cat)}`);
  }
  return cat as ProviderCategory;
}

export const ALLOWED_PRICING_MODELS: PricingModel[] = [
  'fixed_price',
  'hourly',
  'daily',
  'per_square_meter',
  'project_based',
  'negotiable',
  'quote_required',
];

export function validatePricingModel(model: unknown): PricingModel {
  if (!ALLOWED_PRICING_MODELS.includes(model as PricingModel)) {
    throw new ProviderValidationError('INVALID_PRICING_MODEL', `Invalid pricing model: ${String(model)}`);
  }
  return model as PricingModel;
}

export function validateReviewRating(rating: unknown): number {
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ProviderValidationError('INVALID_RATING', 'Review rating must be an integer between 1 and 5.', 'rating');
  }
  return rating;
}

export function assertNoSelfReview(reviewerUserId: string, targetOwnerUserId: string): void {
  if (reviewerUserId === targetOwnerUserId) {
    throw new ProviderValidationError('CANNOT_REVIEW_OWN_PROFILE', 'Service providers and professionals cannot submit reviews on their own profiles.');
  }
}

export function assertNoSelfVerification(reviewerUserId: string, credentialOwnerUserId: string): void {
  if (reviewerUserId === credentialOwnerUserId) {
    throw new ProviderValidationError('CANNOT_VERIFY_OWN_CREDENTIAL', 'Providers cannot verify their own submitted credentials. Verification requires an independent reviewer.');
  }
}
