/**
 * Property Search Request Validation and Query Normalization Engine
 * (`server/modules/property-search/validation.ts`)
 * Exclusive ownership: `server/modules/property-search/`
 */

import {
  PropertySearchValidationError,
  SearchQueryValidator,
} from './domain/SearchQueryValidator';
import type {
  PropertySearchQueryFilters,
  PropertySearchRequest,
  SaveSearchInput,
  SearchSuggestionsRequest,
  UpdateSavedSearchInput,
} from './types';

export {
  PropertySearchValidationError,
  SearchQueryValidator,
};

const defaultValidator = new SearchQueryValidator();

export const normalizePersianText = SearchQueryValidator.normalizePersianText;

export function validateAndNormalizeSearchFilters(raw: Record<string, unknown>): PropertySearchQueryFilters {
  return defaultValidator.validateFilters(raw);
}

export function validatePropertySearchRequest(rawBody: unknown): PropertySearchRequest {
  return defaultValidator.validateSearchRequest(rawBody);
}

export function validateSaveSearchInput(rawBody: unknown): SaveSearchInput {
  return defaultValidator.validateSaveSearch(rawBody);
}

export function validateUpdateSavedSearchInput(rawBody: unknown): UpdateSavedSearchInput {
  return defaultValidator.validateUpdateSavedSearch(rawBody);
}

export function validateSearchSuggestionsRequest(rawParams: Record<string, unknown>): SearchSuggestionsRequest {
  return defaultValidator.validateSuggestionsRequest(rawParams);
}
