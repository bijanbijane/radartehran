/**
 * Employee 64 — Customer Experience Input Validation & Schema Guards
 * (`server/modules/customer-experience/validation.ts`)
 *
 * Exclusive ownership: `server/modules/customer-experience/`
 */

import crypto from 'node:crypto';
import {
  CoreApiError,
  sanitizeTextInput,
  UNTRUSTED_REQUEST_IDENTITY_FIELDS,
} from '../core';
import {
  PropertySearchValidationError,
  validateAndNormalizeSearchFilters,
} from '../property-search';
import type { PropertySearchQueryFilters } from '../property-search/types';
import type {
  ConsentPurpose,
  DataRightsRequestType,
  NotificationChannel,
  PreferredPropertyCategory,
  PreferredTransactionType,
  ProfileVisibilitySettings,
  SearchAlertFrequency,
  SupportedAreaUnit,
  SupportedCityId,
  SupportedCurrency,
  SupportedLocale,
  UgcTargetType,
  UserActivityActionType,
  UserPersonalizationPreferences,
} from './types';

export const ALLOWED_CITIES: readonly SupportedCityId[] = [
  'tehran',
  'karaj',
  'mashhad',
  'isfahan',
  'shiraz',
];
export const ALLOWED_LOCALES: readonly SupportedLocale[] = ['fa', 'en', 'ar', 'tr'];
export const ALLOWED_CURRENCIES: readonly SupportedCurrency[] = ['IRT', 'IRR', 'USD', 'EUR', 'AED'];
export const ALLOWED_AREA_UNITS: readonly SupportedAreaUnit[] = ['sqm', 'sqft'];
export const ALLOWED_PROPERTY_CATEGORIES: readonly PreferredPropertyCategory[] = [
  'residential',
  'commercial',
  'office',
  'land',
  'industrial',
  'villa',
];
export const ALLOWED_TRANSACTION_TYPES: readonly PreferredTransactionType[] = [
  'buy',
  'rent',
  'full_mortgage',
  'pre_sale',
  'participatory',
];
export const ALLOWED_ALERT_FREQUENCIES: readonly SearchAlertFrequency[] = [
  'INSTANT',
  'HOURLY',
  'DAILY',
  'WEEKLY',
];
export const ALLOWED_NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  'IN_APP',
  'EMAIL',
  'SMS',
  'PUSH',
];
export const ALLOWED_CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  'ESSENTIAL_ACCOUNT_SERVICE',
  'PROPERTY_SEARCH_ALERTS',
  'PERSONALIZED_RECOMMENDATIONS',
  'ACTIVITY_HISTORY_STORAGE',
  'MARKETING_COMMUNICATIONS',
  'PUBLIC_DIRECTORY_LISTING',
];
export const ALLOWED_DATA_RIGHTS_TYPES: readonly DataRightsRequestType[] = [
  'DATA_ACCESS',
  'DATA_EXPORT',
  'DATA_CORRECTION',
  'ACCOUNT_CLOSURE_AND_DELETION',
];

const SAFE_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;
const IRAN_MOBILE_REGEX = /^09\d{9}$/;
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const FORBIDDEN_MASS_ASSIGNMENT_KEYS: ReadonlySet<string> = new Set([
  ...UNTRUSTED_REQUEST_IDENTITY_FIELDS,
  'lifecycleStatus',
  'restrictionReason',
  'restrictedByAdminUid',
  'restrictedAtIso',
  'verification',
  'emailVerified',
  'phoneVerified',
  'revision',
  'revisionHistory',
  'createdAtIso',
  'updatedAtIso',
  'moderationStatus',
  'moderatedByUid',
  'moderatedAtIso',
  'legalHoldActive',
  'domainConfirmations',
]);

export function assertPlainObject(
  raw: unknown,
  contextName = 'Request payload',
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${contextName} must be a JSON object.`);
  }
  return raw as Record<string, unknown>;
}

export function rejectMassAssignmentAndUnknownKeys(
  obj: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): void {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_MASS_ASSIGNMENT_KEYS.has(key) && !allowedKeys.has(key)) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Protected or identity field "${key}" cannot be modified by client.`,
      );
    }
    if (!allowedKeys.has(key)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Unknown field "${key}" is not allowed.`);
    }
  }
}

export function validateSafeResourceId(rawId: unknown, fieldName = 'id'): string {
  if (typeof rawId !== 'string') {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} must be a string.`);
  }
  const trimmed = rawId.trim();
  if (!SAFE_ID_REGEX.test(trimmed) || trimmed === '.' || trimmed === '..' || trimmed.startsWith('__')) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} has an invalid identifier format.`);
  }
  return trimmed;
}

export interface ValidatedProfileUpdateInput {
  displayName?: string;
  avatarObjectId?: string | null;
  avatarUrl?: string | null;
  bio?: string;
  contactPhone?: string | null;
  secondaryEmail?: string | null;
  preferredContactMethod?: 'IN_APP' | 'PHONE' | 'EMAIL' | 'SMS';
  primaryCityId?: SupportedCityId;
  visibility?: Partial<ProfileVisibilitySettings>;
}

const PROFILE_UPDATE_ALLOWED_KEYS = new Set([
  'displayName',
  'avatarObjectId',
  'avatarUrl',
  'bio',
  'contactPhone',
  'secondaryEmail',
  'preferredContactMethod',
  'primaryCityId',
  'visibility',
]);

const VISIBILITY_ALLOWED_KEYS = new Set([
  'showPublicProfile',
  'showAvatarPublicly',
  'showBioPublicly',
  'showVerifiedBadgesPublicly',
  'showCityPublicly',
  'contactDisclosureMode',
]);

export function validateProfileUpdateInput(raw: unknown): ValidatedProfileUpdateInput {
  const obj = assertPlainObject(raw, 'Profile update');
  rejectMassAssignmentAndUnknownKeys(obj, PROFILE_UPDATE_ALLOWED_KEYS);

  const out: ValidatedProfileUpdateInput = {};

  if (obj.displayName !== undefined) {
    if (typeof obj.displayName !== 'string') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'displayName must be a string.');
    }
    const cleaned = sanitizeTextInput(obj.displayName);
    if (cleaned.length < 2 || cleaned.length > 80) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'displayName must be between 2 and 80 characters.');
    }
    out.displayName = cleaned;
  }

  if (obj.avatarObjectId !== undefined) {
    if (obj.avatarObjectId === null || obj.avatarObjectId === '') {
      out.avatarObjectId = null;
    } else {
      out.avatarObjectId = validateSafeResourceId(obj.avatarObjectId, 'avatarObjectId');
    }
  }

  if (obj.avatarUrl !== undefined) {
    if (obj.avatarUrl === null || obj.avatarUrl === '') {
      out.avatarUrl = null;
    } else if (typeof obj.avatarUrl === 'string') {
      const trimmed = obj.avatarUrl.trim();
      if (trimmed.length > 500 || (!trimmed.startsWith('https://') && !trimmed.startsWith('/api/object-storage/'))) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'avatarUrl must be a valid https or internal object-storage URL.');
      }
      out.avatarUrl = trimmed;
    } else {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'avatarUrl must be a string or null.');
    }
  }

  if (obj.bio !== undefined) {
    if (typeof obj.bio !== 'string') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'bio must be a string.');
    }
    const cleaned = sanitizeTextInput(obj.bio);
    if (cleaned.length > 500) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'bio must not exceed 500 characters.');
    }
    out.bio = cleaned;
  }

  if (obj.contactPhone !== undefined) {
    if (obj.contactPhone === null || obj.contactPhone === '') {
      out.contactPhone = null;
    } else if (typeof obj.contactPhone === 'string') {
      const normalizedPhone = obj.contactPhone.trim().replace(/\s+/g, '');
      if (!IRAN_MOBILE_REGEX.test(normalizedPhone)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'contactPhone must be a valid 11-digit Iranian mobile number (09xxxxxxxxx).');
      }
      out.contactPhone = normalizedPhone;
    } else {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'contactPhone must be a string or null.');
    }
  }

  if (obj.secondaryEmail !== undefined) {
    if (obj.secondaryEmail === null || obj.secondaryEmail === '') {
      out.secondaryEmail = null;
    } else if (typeof obj.secondaryEmail === 'string') {
      const email = obj.secondaryEmail.trim().toLowerCase();
      if (email.length > 160 || !SIMPLE_EMAIL_REGEX.test(email)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'secondaryEmail is not a valid email address.');
      }
      out.secondaryEmail = email;
    } else {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'secondaryEmail must be a string or null.');
    }
  }

  if (obj.preferredContactMethod !== undefined) {
    const allowedMethods = ['IN_APP', 'PHONE', 'EMAIL', 'SMS'] as const;
    if (typeof obj.preferredContactMethod !== 'string' || !allowedMethods.includes(obj.preferredContactMethod as any)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'preferredContactMethod is invalid.');
    }
    out.preferredContactMethod = obj.preferredContactMethod as ValidatedProfileUpdateInput['preferredContactMethod'];
  }

  if (obj.primaryCityId !== undefined) {
    if (typeof obj.primaryCityId !== 'string' || !ALLOWED_CITIES.includes(obj.primaryCityId as SupportedCityId)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'primaryCityId must be a supported city.');
    }
    out.primaryCityId = obj.primaryCityId as SupportedCityId;
  }

  if (obj.visibility !== undefined) {
    const visObj = assertPlainObject(obj.visibility, 'visibility');
    rejectMassAssignmentAndUnknownKeys(visObj, VISIBILITY_ALLOWED_KEYS);
    const visOut: Partial<ProfileVisibilitySettings> = {};
    for (const boolKey of [
      'showPublicProfile',
      'showAvatarPublicly',
      'showBioPublicly',
      'showVerifiedBadgesPublicly',
      'showCityPublicly',
    ] as const) {
      if (visObj[boolKey] !== undefined) {
        if (typeof visObj[boolKey] !== 'boolean') {
          throw new CoreApiError('VALIDATION_FAILED', 400, `visibility.${boolKey} must be a boolean.`);
        }
        visOut[boolKey] = visObj[boolKey] as boolean;
      }
    }
    if (visObj.contactDisclosureMode !== undefined) {
      const modes = ['PRIVATE', 'INQUIRY_AUTHORIZED_ONLY', 'PUBLIC_FOR_PROFESSIONALS'] as const;
      if (typeof visObj.contactDisclosureMode !== 'string' || !modes.includes(visObj.contactDisclosureMode as any)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'visibility.contactDisclosureMode is invalid.');
      }
      visOut.contactDisclosureMode = visObj.contactDisclosureMode as ProfileVisibilitySettings['contactDisclosureMode'];
    }
    out.visibility = visOut;
  }

  return out;
}

function validateNumericRange(
  rawRange: unknown,
  fieldName: string,
  bounds: { minAllowed: number; maxAllowed: number },
): { min: number; max: number } {
  const obj = assertPlainObject(rawRange, fieldName);
  const min = Number(obj.min);
  const max = Number(obj.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName}.min and ${fieldName}.max must be finite numbers.`);
  }
  if (min < bounds.minAllowed || max > bounds.maxAllowed || min > max) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `${fieldName} range [${min}, ${max}] is invalid or contradictory (min must be <= max within [${bounds.minAllowed}, ${bounds.maxAllowed}]).`,
    );
  }
  return { min, max };
}

const PREFERENCES_TOP_LEVEL_KEYS = new Set([
  'localization',
  'geographic',
  'propertyInterests',
  'interfaceAndAccessibility',
  'notifications',
  'personalization',
]);

export function applyAndValidatePartialPreferencesUpdate(
  existing: UserPersonalizationPreferences,
  rawPatch: unknown,
  nowIso = new Date().toISOString(),
): UserPersonalizationPreferences {
  const patch = assertPlainObject(rawPatch, 'Preferences update');
  rejectMassAssignmentAndUnknownKeys(patch, PREFERENCES_TOP_LEVEL_KEYS);

  const next: UserPersonalizationPreferences = structuredClone(existing);

  if (patch.localization !== undefined) {
    const loc = assertPlainObject(patch.localization, 'localization');
    rejectMassAssignmentAndUnknownKeys(loc, new Set(['locale', 'currency', 'areaUnit', 'calendarSystem']));
    if (loc.locale !== undefined) {
      if (typeof loc.locale !== 'string' || !ALLOWED_LOCALES.includes(loc.locale as SupportedLocale)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'localization.locale is invalid.');
      }
      next.localization.locale = loc.locale as SupportedLocale;
    }
    if (loc.currency !== undefined) {
      if (typeof loc.currency !== 'string' || !ALLOWED_CURRENCIES.includes(loc.currency as SupportedCurrency)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'localization.currency is invalid.');
      }
      next.localization.currency = loc.currency as SupportedCurrency;
    }
    if (loc.areaUnit !== undefined) {
      if (typeof loc.areaUnit !== 'string' || !ALLOWED_AREA_UNITS.includes(loc.areaUnit as SupportedAreaUnit)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'localization.areaUnit is invalid.');
      }
      next.localization.areaUnit = loc.areaUnit as SupportedAreaUnit;
    }
    if (loc.calendarSystem !== undefined) {
      if (loc.calendarSystem !== 'jalali' && loc.calendarSystem !== 'gregorian') {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'localization.calendarSystem must be jalali or gregorian.');
      }
      next.localization.calendarSystem = loc.calendarSystem;
    }
  }

  if (patch.geographic !== undefined) {
    const geo = assertPlainObject(patch.geographic, 'geographic');
    rejectMassAssignmentAndUnknownKeys(
      geo,
      new Set([
        'activeCityId',
        'preferredCityIds',
        'preferredNeighborhoodIds',
        'preferredDistrictNumbers',
        'commuteWorkHubId',
        'maxCommuteMinutes',
        'preferOutsideTrafficZone',
        'preferNearMetro',
      ]),
    );
    if (geo.activeCityId !== undefined) {
      if (typeof geo.activeCityId !== 'string' || !ALLOWED_CITIES.includes(geo.activeCityId as SupportedCityId)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'geographic.activeCityId is invalid.');
      }
      next.geographic.activeCityId = geo.activeCityId as SupportedCityId;
    }
    if (geo.preferredCityIds !== undefined) {
      if (!Array.isArray(geo.preferredCityIds) || geo.preferredCityIds.length > 5) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'geographic.preferredCityIds must be an array of up to 5 cities.');
      }
      const deduped: SupportedCityId[] = [];
      for (const c of geo.preferredCityIds) {
        if (typeof c !== 'string' || !ALLOWED_CITIES.includes(c as SupportedCityId)) {
          throw new CoreApiError('VALIDATION_FAILED', 400, `Unsupported city "${String(c)}" in preferredCityIds.`);
        }
        if (!deduped.includes(c as SupportedCityId)) deduped.push(c as SupportedCityId);
      }
      next.geographic.preferredCityIds = deduped;
    }
    if (geo.preferredNeighborhoodIds !== undefined) {
      if (!Array.isArray(geo.preferredNeighborhoodIds) || geo.preferredNeighborhoodIds.length > 50) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'geographic.preferredNeighborhoodIds must be an array of at most 50 IDs.');
      }
      const deduped: number[] = [];
      for (const id of geo.preferredNeighborhoodIds) {
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 999) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'Each preferredNeighborhoodId must be an integer between 1 and 999.');
        }
        if (!deduped.includes(id)) deduped.push(id);
      }
      next.geographic.preferredNeighborhoodIds = deduped;
    }
    if (geo.preferredDistrictNumbers !== undefined) {
      if (!Array.isArray(geo.preferredDistrictNumbers) || geo.preferredDistrictNumbers.length > 22) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'geographic.preferredDistrictNumbers must be an array of at most 22 districts.');
      }
      const deduped: number[] = [];
      for (const d of geo.preferredDistrictNumbers) {
        if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 22) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'District number must be between 1 and 22.');
        }
        if (!deduped.includes(d)) deduped.push(d);
      }
      next.geographic.preferredDistrictNumbers = deduped;
    }
    if (geo.commuteWorkHubId !== undefined) {
      if (geo.commuteWorkHubId === null || geo.commuteWorkHubId === '') {
        next.geographic.commuteWorkHubId = null;
      } else {
        next.geographic.commuteWorkHubId = validateSafeResourceId(geo.commuteWorkHubId, 'commuteWorkHubId');
      }
    }
    if (geo.maxCommuteMinutes !== undefined) {
      if (geo.maxCommuteMinutes === null) {
        next.geographic.maxCommuteMinutes = null;
      } else if (
        typeof geo.maxCommuteMinutes !== 'number' ||
        !Number.isInteger(geo.maxCommuteMinutes) ||
        geo.maxCommuteMinutes < 5 ||
        geo.maxCommuteMinutes > 180
      ) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'maxCommuteMinutes must be an integer between 5 and 180 or null.');
      } else {
        next.geographic.maxCommuteMinutes = geo.maxCommuteMinutes;
      }
    }
    if (geo.preferOutsideTrafficZone !== undefined) {
      if (typeof geo.preferOutsideTrafficZone !== 'boolean') {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'preferOutsideTrafficZone must be a boolean.');
      }
      next.geographic.preferOutsideTrafficZone = geo.preferOutsideTrafficZone;
    }
    if (geo.preferNearMetro !== undefined) {
      if (typeof geo.preferNearMetro !== 'boolean') {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'preferNearMetro must be a boolean.');
      }
      next.geographic.preferNearMetro = geo.preferNearMetro;
    }
  }

  if (patch.propertyInterests !== undefined) {
    const prop = assertPlainObject(patch.propertyInterests, 'propertyInterests');
    rejectMassAssignmentAndUnknownKeys(
      prop,
      new Set([
        'categories',
        'transactionTypes',
        'buyBudgetRangeMillions',
        'depositRangeMillions',
        'monthlyRentRangeMillions',
        'sizeSqmRange',
        'bedroomsRange',
        'maxBuildingAgeYears',
        'requiredAmenities',
      ]),
    );
    if (prop.categories !== undefined) {
      if (!Array.isArray(prop.categories) || prop.categories.length === 0 || prop.categories.length > 6) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'propertyInterests.categories must be a non-empty array of valid categories.');
      }
      const deduped: PreferredPropertyCategory[] = [];
      for (const c of prop.categories) {
        if (typeof c !== 'string' || !ALLOWED_PROPERTY_CATEGORIES.includes(c as PreferredPropertyCategory)) {
          throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid property category "${String(c)}".`);
        }
        if (!deduped.includes(c as PreferredPropertyCategory)) deduped.push(c as PreferredPropertyCategory);
      }
      next.propertyInterests.categories = deduped;
    }
    if (prop.transactionTypes !== undefined) {
      if (!Array.isArray(prop.transactionTypes) || prop.transactionTypes.length === 0 || prop.transactionTypes.length > 5) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'propertyInterests.transactionTypes must be a non-empty array.');
      }
      const deduped: PreferredTransactionType[] = [];
      for (const t of prop.transactionTypes) {
        if (typeof t !== 'string' || !ALLOWED_TRANSACTION_TYPES.includes(t as PreferredTransactionType)) {
          throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid transaction type "${String(t)}".`);
        }
        if (!deduped.includes(t as PreferredTransactionType)) deduped.push(t as PreferredTransactionType);
      }
      next.propertyInterests.transactionTypes = deduped;
    }
    if (prop.buyBudgetRangeMillions !== undefined) {
      next.propertyInterests.buyBudgetRangeMillions = validateNumericRange(
        prop.buyBudgetRangeMillions,
        'buyBudgetRangeMillions',
        { minAllowed: 100, maxAllowed: 5_000_000 },
      );
    }
    if (prop.depositRangeMillions !== undefined) {
      next.propertyInterests.depositRangeMillions = validateNumericRange(
        prop.depositRangeMillions,
        'depositRangeMillions',
        { minAllowed: 0, maxAllowed: 1_000_000 },
      );
    }
    if (prop.monthlyRentRangeMillions !== undefined) {
      next.propertyInterests.monthlyRentRangeMillions = validateNumericRange(
        prop.monthlyRentRangeMillions,
        'monthlyRentRangeMillions',
        { minAllowed: 0, maxAllowed: 50_000 },
      );
    }
    if (prop.sizeSqmRange !== undefined) {
      next.propertyInterests.sizeSqmRange = validateNumericRange(prop.sizeSqmRange, 'sizeSqmRange', {
        minAllowed: 15,
        maxAllowed: 20_000,
      });
    }
    if (prop.bedroomsRange !== undefined) {
      next.propertyInterests.bedroomsRange = validateNumericRange(prop.bedroomsRange, 'bedroomsRange', {
        minAllowed: 0,
        maxAllowed: 20,
      });
    }
    if (prop.maxBuildingAgeYears !== undefined) {
      if (prop.maxBuildingAgeYears === null) {
        next.propertyInterests.maxBuildingAgeYears = null;
      } else if (
        typeof prop.maxBuildingAgeYears !== 'number' ||
        !Number.isInteger(prop.maxBuildingAgeYears) ||
        prop.maxBuildingAgeYears < 0 ||
        prop.maxBuildingAgeYears > 80
      ) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'maxBuildingAgeYears must be an integer between 0 and 80 or null.');
      } else {
        next.propertyInterests.maxBuildingAgeYears = prop.maxBuildingAgeYears;
      }
    }
    if (prop.requiredAmenities !== undefined) {
      const allowedAmenities = ['parking', 'elevator', 'storage', 'balcony', 'lobby', 'security_guard'] as const;
      if (!Array.isArray(prop.requiredAmenities) || prop.requiredAmenities.length > 6) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'requiredAmenities must be an array of valid amenities.');
      }
      const deduped: typeof next.propertyInterests.requiredAmenities = [];
      for (const a of prop.requiredAmenities) {
        if (typeof a !== 'string' || !allowedAmenities.includes(a as any)) {
          throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid amenity "${String(a)}".`);
        }
        if (!deduped.includes(a as any)) deduped.push(a as any);
      }
      next.propertyInterests.requiredAmenities = deduped;
    }
  }

  if (patch.interfaceAndAccessibility !== undefined) {
    const ui = assertPlainObject(patch.interfaceAndAccessibility, 'interfaceAndAccessibility');
    rejectMassAssignmentAndUnknownKeys(
      ui,
      new Set(['theme', 'reducedMotion', 'highContrast', 'fontScale', 'defaultPrimaryView', 'defaultMapLens']),
    );
    if (ui.theme !== undefined) {
      if (ui.theme !== 'light' && ui.theme !== 'dark' && ui.theme !== 'system') {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'interfaceAndAccessibility.theme is invalid.');
      }
      next.interfaceAndAccessibility.theme = ui.theme;
    }
    if (ui.reducedMotion !== undefined) {
      if (typeof ui.reducedMotion !== 'boolean') throw new CoreApiError('VALIDATION_FAILED', 400, 'reducedMotion must be boolean.');
      next.interfaceAndAccessibility.reducedMotion = ui.reducedMotion;
    }
    if (ui.highContrast !== undefined) {
      if (typeof ui.highContrast !== 'boolean') throw new CoreApiError('VALIDATION_FAILED', 400, 'highContrast must be boolean.');
      next.interfaceAndAccessibility.highContrast = ui.highContrast;
    }
    if (ui.fontScale !== undefined) {
      if (ui.fontScale !== 'normal' && ui.fontScale !== 'large' && ui.fontScale !== 'x_large') {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'fontScale is invalid.');
      }
      next.interfaceAndAccessibility.fontScale = ui.fontScale;
    }
    if (ui.defaultPrimaryView !== undefined) {
      const views = ['map', 'discover', 'intelligence', 'tools', 'home', 'userspace'] as const;
      if (typeof ui.defaultPrimaryView !== 'string' || !views.includes(ui.defaultPrimaryView as any)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'defaultPrimaryView is invalid.');
      }
      next.interfaceAndAccessibility.defaultPrimaryView = ui.defaultPrimaryView as any;
    }
    if (ui.defaultMapLens !== undefined) {
      const lenses = ['budget', 'heatmap', 'bubble', 'air'] as const;
      if (typeof ui.defaultMapLens !== 'string' || !lenses.includes(ui.defaultMapLens as any)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'defaultMapLens is invalid.');
      }
      next.interfaceAndAccessibility.defaultMapLens = ui.defaultMapLens as any;
    }
  }

  if (patch.notifications !== undefined) {
    const notif = assertPlainObject(patch.notifications, 'notifications');
    rejectMassAssignmentAndUnknownKeys(
      notif,
      new Set([
        'channels',
        'priceDropAlertsEnabled',
        'savedSearchAlertsEnabled',
        'marketPulseDigestEnabled',
        'inquiryRepliesEnabled',
        'quietHoursUtc',
      ]),
    );
    if (notif.channels !== undefined) {
      const chObj = assertPlainObject(notif.channels, 'notifications.channels');
      rejectMassAssignmentAndUnknownKeys(chObj, new Set(ALLOWED_NOTIFICATION_CHANNELS));
      for (const ch of ALLOWED_NOTIFICATION_CHANNELS) {
        if (chObj[ch] !== undefined) {
          if (typeof chObj[ch] !== 'boolean') {
            throw new CoreApiError('VALIDATION_FAILED', 400, `notifications.channels.${ch} must be boolean.`);
          }
          next.notifications.channels[ch] = chObj[ch] as boolean;
        }
      }
    }
    for (const flagKey of [
      'priceDropAlertsEnabled',
      'savedSearchAlertsEnabled',
      'marketPulseDigestEnabled',
      'inquiryRepliesEnabled',
    ] as const) {
      if (notif[flagKey] !== undefined) {
        if (typeof notif[flagKey] !== 'boolean') {
          throw new CoreApiError('VALIDATION_FAILED', 400, `notifications.${flagKey} must be boolean.`);
        }
        next.notifications[flagKey] = notif[flagKey] as boolean;
      }
    }
    if (notif.quietHoursUtc !== undefined) {
      const qh = assertPlainObject(notif.quietHoursUtc, 'quietHoursUtc');
      rejectMassAssignmentAndUnknownKeys(qh, new Set(['enabled', 'startHour', 'endHour']));
      if (qh.enabled !== undefined) {
        if (typeof qh.enabled !== 'boolean') throw new CoreApiError('VALIDATION_FAILED', 400, 'quietHoursUtc.enabled must be boolean.');
        next.notifications.quietHoursUtc.enabled = qh.enabled;
      }
      if (qh.startHour !== undefined) {
        if (typeof qh.startHour !== 'number' || !Number.isInteger(qh.startHour) || qh.startHour < 0 || qh.startHour > 23) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'quietHoursUtc.startHour must be 0..23.');
        }
        next.notifications.quietHoursUtc.startHour = qh.startHour;
      }
      if (qh.endHour !== undefined) {
        if (typeof qh.endHour !== 'number' || !Number.isInteger(qh.endHour) || qh.endHour < 0 || qh.endHour > 23) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'quietHoursUtc.endHour must be 0..23.');
        }
        next.notifications.quietHoursUtc.endHour = qh.endHour;
      }
    }
  }

  if (patch.personalization !== undefined) {
    const pers = assertPlainObject(patch.personalization, 'personalization');
    rejectMassAssignmentAndUnknownKeys(
      pers,
      new Set([
        'personalizedRecommendationsEnabled',
        'saveRecentViewHistory',
        'saveSearchHistory',
        'recentHistoryRetentionDays',
      ]),
    );
    for (const k of ['personalizedRecommendationsEnabled', 'saveRecentViewHistory', 'saveSearchHistory'] as const) {
      if (pers[k] !== undefined) {
        if (typeof pers[k] !== 'boolean') throw new CoreApiError('VALIDATION_FAILED', 400, `personalization.${k} must be boolean.`);
        next.personalization[k] = pers[k] as boolean;
      }
    }
    if (pers.recentHistoryRetentionDays !== undefined) {
      if (![7, 30, 90, 180].includes(Number(pers.recentHistoryRetentionDays))) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'recentHistoryRetentionDays must be 7, 30, 90, or 180.');
      }
      next.personalization.recentHistoryRetentionDays = Number(pers.recentHistoryRetentionDays) as 7 | 30 | 90 | 180;
    }
  }

  next.revision = existing.revision + 1;
  next.updatedAtIso = nowIso;
  return next;
}

export function validateAndUpgradeSavedSearchFilters(rawFilters: unknown): {
  filters: PropertySearchQueryFilters;
  compatibilityNotes: string[];
} {
  const obj = assertPlainObject(rawFilters, 'Search filters');
  if ('rawQuery' in obj || 'sql' in obj || 'whereClause' in obj || '$where' in obj) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'Executable query strings or raw query clauses are forbidden in saved searches.',
    );
  }

  const compatibilityNotes: string[] = [];
  const cloned: Record<string, unknown> = { ...obj };

  // Controlled compatibility logic for legacy/outdated filter keys
  if ('hoodId' in cloned && cloned.neighborhoodIds === undefined) {
    const legacyHoodId = Number(cloned.hoodId);
    if (Number.isInteger(legacyHoodId) && legacyHoodId >= 1 && legacyHoodId <= 999) {
      cloned.neighborhoodIds = [legacyHoodId];
      compatibilityNotes.push('Upgraded legacy hoodId filter to neighborhoodIds array.');
    }
    delete cloned.hoodId;
  }
  if ('city' in cloned && cloned.cityId === undefined) {
    cloned.cityId = cloned.city;
    delete cloned.city;
    compatibilityNotes.push('Upgraded legacy city filter to cityId.');
  }
  if ('deprecatedFilterV0' in cloned) {
    delete cloned.deprecatedFilterV0;
    compatibilityNotes.push('Stripped unsupported legacy filter deprecatedFilterV0.');
  }

  if ('minTotalPriceMillions' in cloned && cloned.minAskingPriceMillion === undefined) {
    cloned.minAskingPriceMillion = cloned.minTotalPriceMillions;
    delete cloned.minTotalPriceMillions;
  }
  if ('maxTotalPriceMillions' in cloned && cloned.maxAskingPriceMillion === undefined) {
    cloned.maxAskingPriceMillion = cloned.maxTotalPriceMillions;
    delete cloned.maxTotalPriceMillions;
  }

  try {
    const validated = validateAndNormalizeSearchFilters(cloned);
    const hasConstraint = Object.keys(validated).some((k) => {
      const val = (validated as Record<string, unknown>)[k];
      return val !== undefined && (!Array.isArray(val) || val.length > 0);
    });
    if (!hasConstraint) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Saved search must specify at least one valid search filter.');
    }
    return { filters: validated, compatibilityNotes };
  } catch (err) {
    if (err instanceof CoreApiError) throw err;
    if (err instanceof PropertySearchValidationError) {
      throw new CoreApiError('VALIDATION_FAILED', 400, err.message);
    }
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid saved search filter combination.');
  }
}

export function computeSearchCriteriaFingerprint(
  ownerUid: string,
  filters: PropertySearchQueryFilters,
): string {
  const canonical = JSON.stringify({
    ownerUid,
    filters: Object.keys(filters)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const val = (filters as Record<string, unknown>)[key];
        acc[key] = Array.isArray(val) ? [...val].sort() : val;
        return acc;
      }, {}),
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32);
}

const FORBIDDEN_TELEMETRY_PII_KEYS = new Set([
  'mouseMovements',
  'keystrokes',
  'password',
  'cardNumber',
  'iban',
  'cvv',
  'preciseGpsLat',
  'preciseGpsLng',
  'permanentLocationHistory',
  'rawIpAddress',
]);

export function validateUserActivityInput(raw: unknown): {
  actionType: UserActivityActionType;
  targetId: string;
  targetType: 'PROPERTY' | 'NEIGHBORHOOD' | 'SAVED_SEARCH';
  cityId: SupportedCityId;
  hoodId: number | null;
  summaryTitle: string;
  priceMillionsSnapshot: number | null;
  sqmSnapshot: number | null;
} {
  const obj = assertPlainObject(raw, 'User activity');
  for (const forbidden of FORBIDDEN_TELEMETRY_PII_KEYS) {
    if (forbidden in obj) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Privacy violation: field "${forbidden}" is strictly prohibited in user activity history.`,
      );
    }
  }
  rejectMassAssignmentAndUnknownKeys(
    obj,
    new Set([
      'actionType',
      'targetId',
      'targetType',
      'cityId',
      'hoodId',
      'summaryTitle',
      'priceMillionsSnapshot',
      'sqmSnapshot',
    ]),
  );

  const allowedActions: readonly UserActivityActionType[] = [
    'VIEWED_PROPERTY',
    'VIEWED_NEIGHBORHOOD',
    'EXECUTED_SAVED_SEARCH',
    'CALCULATED_HEDONIC_VALUATION',
    'COMPARED_NEIGHBORHOODS',
  ];
  if (typeof obj.actionType !== 'string' || !allowedActions.includes(obj.actionType as UserActivityActionType)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid activity actionType.');
  }

  const targetId = validateSafeResourceId(obj.targetId, 'targetId');
  const allowedTargets = ['PROPERTY', 'NEIGHBORHOOD', 'SAVED_SEARCH'] as const;
  if (typeof obj.targetType !== 'string' || !allowedTargets.includes(obj.targetType as any)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid activity targetType.');
  }

  const cityId: SupportedCityId =
    typeof obj.cityId === 'string' && ALLOWED_CITIES.includes(obj.cityId as SupportedCityId)
      ? (obj.cityId as SupportedCityId)
      : 'tehran';

  let hoodId: number | null = null;
  if (obj.hoodId !== undefined && obj.hoodId !== null) {
    const n = Number(obj.hoodId);
    if (!Number.isInteger(n) || n < 1 || n > 999) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'hoodId must be 1..999.');
    }
    hoodId = n;
  }

  const summaryTitle =
    typeof obj.summaryTitle === 'string' ? sanitizeTextInput(obj.summaryTitle).slice(0, 160) : targetId;
  if (!summaryTitle) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'summaryTitle is required.');
  }

  const priceMillionsSnapshot =
    typeof obj.priceMillionsSnapshot === 'number' && Number.isFinite(obj.priceMillionsSnapshot) && obj.priceMillionsSnapshot >= 0
      ? obj.priceMillionsSnapshot
      : null;

  const sqmSnapshot =
    typeof obj.sqmSnapshot === 'number' && Number.isFinite(obj.sqmSnapshot) && obj.sqmSnapshot > 0
      ? obj.sqmSnapshot
      : null;

  return {
    actionType: obj.actionType as UserActivityActionType,
    targetId,
    targetType: obj.targetType as 'PROPERTY' | 'NEIGHBORHOOD' | 'SAVED_SEARCH',
    cityId,
    hoodId,
    summaryTitle,
    priceMillionsSnapshot,
    sqmSnapshot,
  };
}

export function validateUgcCreateOrUpdateInput(raw: unknown): {
  targetType: UgcTargetType;
  targetId: string;
  cityId: SupportedCityId;
  hoodId: number;
  overallRating: number;
  structuredRatings: {
    valueForMoney: number;
    buildingAndLocationQuality: number;
    accuracyOfListing: number;
  };
  comment: string;
  prosTags: string[];
  consTags: string[];
} {
  const obj = assertPlainObject(raw, 'User-generated content');
  rejectMassAssignmentAndUnknownKeys(
    obj,
    new Set([
      'targetType',
      'targetId',
      'cityId',
      'hoodId',
      'overallRating',
      'structuredRatings',
      'comment',
      'prosTags',
      'consTags',
    ]),
  );

  if (obj.targetType !== 'PROPERTY_LISTING' && obj.targetType !== 'NEIGHBORHOOD') {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'targetType must be PROPERTY_LISTING or NEIGHBORHOOD.');
  }
  const targetId = validateSafeResourceId(obj.targetId, 'targetId');
  const cityId: SupportedCityId =
    typeof obj.cityId === 'string' && ALLOWED_CITIES.includes(obj.cityId as SupportedCityId)
      ? (obj.cityId as SupportedCityId)
      : 'tehran';
  const hoodId = Number(obj.hoodId ?? 1);
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'hoodId must be 1..999.');
  }

  const checkScore = (val: unknown, name: string): number => {
    const num = Number(val);
    if (!Number.isFinite(num) || num < 1 || num > 5) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `${name} must be a rating between 1 and 5.`);
    }
    return Math.round(num * 10) / 10;
  };

  const overallRating = checkScore(obj.overallRating, 'overallRating');
  const srObj = obj.structuredRatings ? assertPlainObject(obj.structuredRatings, 'structuredRatings') : {};
  const structuredRatings = {
    valueForMoney: checkScore(srObj.valueForMoney ?? overallRating, 'structuredRatings.valueForMoney'),
    buildingAndLocationQuality: checkScore(
      srObj.buildingAndLocationQuality ?? overallRating,
      'structuredRatings.buildingAndLocationQuality',
    ),
    accuracyOfListing: checkScore(srObj.accuracyOfListing ?? overallRating, 'structuredRatings.accuracyOfListing'),
  };

  if (typeof obj.comment !== 'string') {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'comment must be a string.');
  }
  const comment = sanitizeTextInput(obj.comment);
  if (comment.length < 5 || comment.length > 1000) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'comment must be between 5 and 1000 characters.');
  }

  const parseTags = (rawTags: unknown, field: string): string[] => {
    if (rawTags === undefined) return [];
    if (!Array.isArray(rawTags) || rawTags.length > 8) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `${field} must be an array of at most 8 tags.`);
    }
    return rawTags.map((t) => {
      if (typeof t !== 'string') throw new CoreApiError('VALIDATION_FAILED', 400, `${field} items must be strings.`);
      const clean = sanitizeTextInput(t);
      if (!clean || clean.length > 40) {
        throw new CoreApiError('VALIDATION_FAILED', 400, `${field} tag length must be 1..40.`);
      }
      return clean;
    });
  };

  return {
    targetType: obj.targetType,
    targetId,
    cityId,
    hoodId,
    overallRating,
    structuredRatings,
    comment,
    prosTags: parseTags(obj.prosTags, 'prosTags'),
    consTags: parseTags(obj.consTags, 'consTags'),
  };
}
